#' Schema identifier written into every `ard.json`
#' @noRd
ard_schema <- function() "opencsr/ard/v1"

#' Build the provenance envelope for an ARD
#'
#' Contract §5. `{cards}` has no lossless serialiser, so open.csr owns the
#' format; the envelope is what makes every number auditable (design decision
#' D5): the spec that asked for it, the data it came from, the software that
#' computed it and the commit it is reproducible from.
#'
#' @param analysis_path Path to `analysis.yaml`.
#' @param display_path Path to `display.yaml`.
#' @param manifest Data manifest from [data_manifest()].
#' @param datasets Names of the datasets the display used.
#' @param root Repository root (for the git commit).
#' @return A list ready for JSON serialisation.
#' @noRd
ard_provenance <- function(analysis_path, display_path, manifest, datasets, root = csr_root()) {
  used <- manifest[manifest$dataset %in% datasets, , drop = FALSE]
  data_block <- lapply(seq_len(nrow(used)), function(i) {
    list(
      dataset = used$dataset[i],
      hash = used$hash[i],
      n_row = used$n_row[i],
      n_col = used$n_col[i],
      source_pkg = used$source_pkg[i],
      source_version = used$source_version[i]
    )
  })
  list(
    spec_hash = hash_file(analysis_path),
    display_hash = hash_file(display_path),
    data = data_block,
    environment = environment_block(),
    git_commit = git_commit(root)
  )
}

#' Serialise an ARD to the owned JSON schema
#'
#' @param rows ARD rows from [build_ard()].
#' @param path Destination `ard.json` path.
#' @param display Display slug.
#' @param provenance Provenance envelope.
#' @param created ISO-8601 UTC timestamp.
#'
#' @return `path`, invisibly.
#' @export
write_ard <- function(rows, path, display, provenance = list(), created = iso_now()) {
  stopifnot(is.data.frame(rows))
  missing <- setdiff(ard_row_cols(), names(rows))
  if (length(missing)) {
    stop("ARD rows are missing column(s): ", paste(missing, collapse = ", "), call. = FALSE)
  }
  row_list <- lapply(seq_len(nrow(rows)), function(i) {
    stat <- rows$stat[[i]]
    if (is.null(stat) || (length(stat) == 1 && is.na(stat[[1]]))) stat <- NA
    list(
      analysis = rows$analysis[i],
      group1 = rows$group1[i],
      group1_level = rows$group1_level[i],
      group2 = rows$group2[i],
      group2_level = rows$group2_level[i],
      variable = rows$variable[i],
      variable_level = rows$variable_level[i],
      context = rows$context[i],
      stat_name = rows$stat_name[i],
      stat_label = rows$stat_label[i],
      stat = unlist(stat, use.names = FALSE),
      warning = rows$warning[i],
      error = rows$error[i]
    )
  })
  doc <- list(
    schema = ard_schema(),
    display = display,
    created = created,
    provenance = provenance,
    rows = row_list
  )
  json <- jsonlite::toJSON(
    doc,
    auto_unbox = TRUE, null = "null", na = "null",
    digits = NA, pretty = 2
  )
  dir.create(dirname(path), recursive = TRUE, showWarnings = FALSE)
  writeLines(json, path)
  invisible(path)
}

#' Read an `ard.json`
#'
#' @param path Path to an `ard.json`.
#' @return A list with `schema`, `display`, `created`, `provenance` and `rows`
#'   (a tibble in the ARD row schema).
#' @export
read_ard <- function(path) {
  doc <- jsonlite::fromJSON(path, simplifyVector = FALSE)
  if (!identical(doc$schema, ard_schema())) {
    stop("Unexpected ARD schema '", doc$schema %||% "<none>", "'; expected ", ard_schema(), ".", call. = FALSE)
  }
  chr <- function(key) {
    vapply(doc$rows, function(r) {
      v <- r[[key]]
      if (is.null(v)) NA_character_ else as.character(v)
    }, character(1))
  }
  rows <- tibble::tibble(
    analysis = chr("analysis"),
    group1 = chr("group1"),
    group1_level = chr("group1_level"),
    group2 = chr("group2"),
    group2_level = chr("group2_level"),
    variable = chr("variable"),
    variable_level = chr("variable_level"),
    context = chr("context"),
    stat_name = chr("stat_name"),
    stat_label = chr("stat_label"),
    warning = chr("warning"),
    error = chr("error")
  )
  rows$stat <- lapply(doc$rows, function(r) {
    v <- r$stat
    if (is.null(v)) NA else unlist(v, use.names = FALSE)
  })
  doc$rows <- rows[, ard_row_cols()]
  doc
}
