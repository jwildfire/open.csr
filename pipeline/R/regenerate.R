#' Output directory for a display
#' @noRd
output_dir <- function(slug, root = csr_root()) file.path(root, "outputs", slug)

#' Format an iteration version number
#' @noRd
version_label <- function(n) sprintf("v%03d", n)

#' Allocate the next iteration number for a display
#'
#' Robust against a ledger and an output tree that have drifted apart: the next
#' version is one past the highest number seen in **either**, so a partially
#' written iteration can never be silently overwritten.
#'
#' @param slug Display slug.
#' @param root Repository root.
#' @return Integer version number.
#' @noRd
next_version <- function(slug, root = csr_root()) {
  dirs <- list.dirs(output_dir(slug, root), full.names = FALSE, recursive = FALSE)
  from_fs <- suppressWarnings(as.integer(sub("^v", "", dirs[grepl("^v[0-9]{3}$", dirs)])))
  ledger <- iteration_ledger(slug, root)
  from_ledger <- if (nrow(ledger)) suppressWarnings(as.integer(sub("^v", "", ledger$version))) else integer(0)
  seen <- c(from_fs, from_ledger)
  seen <- seen[!is.na(seen)]
  if (!length(seen)) 1L else max(seen) + 1L
}

#' Read a display's iteration ledger
#'
#' @param slug Display slug.
#' @param root Repository root.
#' @return A tibble, empty when the display has never been regenerated.
#' @export
iteration_ledger <- function(slug, root = csr_root()) {
  path <- file.path(display_dir(slug, root), "iterations.yaml")
  empty <- tibble::tibble(
    version = character(0), created = character(0), actor = character(0),
    change_request = character(0), git_commit = character(0),
    spec_hash = character(0), display_hash = character(0),
    ard_hash = character(0), ard_rows = integer(0)
  )
  if (!file.exists(path)) {
    return(empty)
  }
  doc <- read_yaml_file(path)
  its <- doc$iterations %||% list()
  if (!length(its)) {
    return(empty)
  }
  field <- function(nm, default = NA_character_) {
    vapply(its, function(x) {
      v <- x[[nm]]
      if (is.null(v)) default else as.character(v)
    }, character(1))
  }
  tibble::tibble(
    version = field("version"),
    created = field("created"),
    actor = field("actor"),
    change_request = field("change_request"),
    git_commit = field("git_commit"),
    spec_hash = field("spec_hash"),
    display_hash = field("display_hash"),
    ard_hash = field("ard_hash"),
    ard_rows = as.integer(field("ard_rows", "0"))
  )
}

#' Pointer to a display's live iteration
#'
#' @param slug Display slug.
#' @param root Repository root.
#' @return The parsed `current.json`, or `NULL`.
#' @export
current_iteration <- function(slug, root = csr_root()) {
  path <- file.path(output_dir(slug, root), "current.json")
  if (!file.exists(path)) {
    return(NULL)
  }
  jsonlite::fromJSON(path, simplifyVector = TRUE)
}

#' Regenerate a display
#'
#' The end-to-end loop behind design decision D10: read the two committed
#' specs, rebuild the ARD from prepared ADaM data, render every declared
#' variant, and write the whole set into a **new** numbered iteration
#' (`outputs/<slug>/vNNN/`) alongside a manifest recording who regenerated it,
#' why, and from which commit. Nothing is ever overwritten; `current.json` moves
#' and `iterations.yaml` grows.
#'
#' @param slug Display slug.
#' @param root Repository root.
#' @param change_request Free-text reason for this iteration — the change
#'   request that motivated it. Recorded in the manifest and the ledger.
#' @param actor Who requested it (a handle, or an agent identifier).
#' @param data Optional prepared data list, to avoid re-preparing per display.
#'
#' @return A list describing the new iteration, invisibly.
#' @examples
#' \dontrun{
#' regenerate("t-ae-common", change_request = "Raise the in-text threshold to 10%.")
#' }
#' @export
regenerate <- function(slug, root = csr_root(), change_request = "Initial generation.",
                       actor = "@jwildfire", data = NULL) {
  analysis_spec <- read_analysis_spec(slug, root)
  display_spec <- read_display_spec(slug, root)
  check_specs_consistent(analysis_spec, display_spec)
  if (!identical(analysis_spec$id, slug)) {
    stop("analysis.yaml id '", analysis_spec$id, "' does not match directory '", slug, "'.", call. = FALSE)
  }

  needed <- unique(c("adsl", analysis_spec$dataset, analysis_spec$denominator))
  if (is.null(data)) data <- prepare_data(datasets = needed, sources = analysis_spec$sources)
  missing <- setdiff(needed, names(data))
  if (length(missing)) {
    stop("Prepared data is missing dataset(s): ", paste(missing, collapse = ", "), call. = FALSE)
  }
  check_data_sources(data, analysis_spec, needed, slug)

  custom_env <- source_custom(display_dir(slug, root))
  rows <- build_ard(analysis_spec, data, custom_env)

  version <- version_label(next_version(slug, root))
  dir <- file.path(output_dir(slug, root), version)
  dir.create(dir, recursive = TRUE, showWarnings = FALSE)

  file.copy(attr(analysis_spec, "path"), file.path(dir, "analysis.yaml"), overwrite = TRUE)
  file.copy(attr(display_spec, "path"), file.path(dir, "display.yaml"), overwrite = TRUE)

  provenance <- ard_provenance(
    attr(analysis_spec, "path"), attr(display_spec, "path"),
    data_manifest(data), needed, root
  )
  created <- iso_now()
  ard_path <- file.path(dir, "ard.json")
  write_ard(rows, ard_path, display = slug, provenance = provenance, created = created)

  rendered <- list()
  for (variant in names(display_spec$variants)) {
    disp <- render_display(rows, display_spec, variant = variant)
    stem <- if (variant == "post_text") "table" else paste0("table-", gsub("_", "-", variant))
    writeLines(disp$html, file.path(dir, paste0(stem, ".html")))
    # The submission artifact (#129 A). Written by the same loop, from the same
    # rendered cells, so the RTF a reviewer receives and the HTML the app shows
    # cannot disagree — and the hash lets CI prove the committed file is this
    # run's output rather than a hand-edited copy.
    rtf_path <- file.path(dir, paste0(stem, ".rtf"))
    write_rtf_display(disp, display_spec, rtf_path)
    rendered[[variant]] <- list(
      file = paste0(stem, ".html"),
      rtf = paste0(stem, ".rtf"),
      rtf_hash = hash_file(rtf_path),
      n_rows = nrow(disp$table)
    )
  }

  manifest <- list(
    display = slug,
    version = version,
    created = created,
    actor = actor,
    change_request = change_request,
    regulatory_id = analysis_spec$regulatory_id %||% NULL,
    git_commit = provenance$git_commit,
    spec_hash = provenance$spec_hash,
    display_hash = provenance$display_hash,
    ard_hash = hash_file(ard_path),
    ard_rows = nrow(rows),
    ard_warnings = sum(!is.na(rows$warning)),
    ard_errors = sum(!is.na(rows$error)),
    datasets = needed,
    data = provenance$data,
    environment = provenance$environment,
    variants = rendered
  )
  writeLines(
    jsonlite::toJSON(manifest, auto_unbox = TRUE, null = "null", na = "null", pretty = 2),
    file.path(dir, "manifest.json")
  )

  writeLines(
    jsonlite::toJSON(
      list(
        display = slug, version = version, updated = created,
        path = file.path("outputs", slug, version),
        ard = file.path("outputs", slug, version, "ard.json"),
        table = file.path("outputs", slug, version, "table.html"),
        variants = names(rendered)
      ),
      auto_unbox = TRUE, null = "null", pretty = 2
    ),
    file.path(output_dir(slug, root), "current.json")
  )

  append_iteration(slug, manifest, root)
  invisible(manifest)
}

#' Append an entry to a display's iteration ledger
#' @noRd
append_iteration <- function(slug, manifest, root = csr_root()) {
  path <- file.path(display_dir(slug, root), "iterations.yaml")
  doc <- if (file.exists(path)) read_yaml_file(path) else list(display = slug, iterations = list())
  doc$display <- slug
  doc$iterations <- c(doc$iterations %||% list(), list(list(
    version = manifest$version,
    created = manifest$created,
    actor = manifest$actor,
    change_request = manifest$change_request,
    git_commit = manifest$git_commit %||% "",
    spec_hash = manifest$spec_hash,
    display_hash = manifest$display_hash,
    ard_hash = manifest$ard_hash,
    ard_rows = manifest$ard_rows
  )))
  write_yaml_file(doc, path)
}

#' Regenerate every display in the library
#'
#' @param slugs Display slugs; defaults to every display in `library/tfl/`.
#' @param root Repository root.
#' @param change_request Reason recorded against each iteration.
#' @param actor Who requested it.
#'
#' @return A tibble summarising each regeneration, invisibly.
#' @export
regenerate_all <- function(slugs = display_slugs(root), root = csr_root(),
                           change_request = "Initial generation.", actor = "@jwildfire") {
  specs <- stats::setNames(lapply(slugs, function(s) read_analysis_spec(s, root)), slugs)
  # Displays no longer all read the same packaging of the study, so data is
  # prepared once per distinct `sources:` declaration rather than once overall.
  # Sharing one prepared list across every display would either force every
  # display onto one source or hand a display the wrong one; regenerate()
  # refuses the latter, so this grouping is what keeps the batch working.
  key <- vapply(specs, function(s) source_signature(s$sources), character(1))
  out <- list()
  for (k in unique(key)) {
    batch <- slugs[key == k]
    needed <- unique(c("adsl", unlist(lapply(specs[batch], function(s) c(s$dataset, s$denominator)))))
    data <- prepare_data(datasets = needed, sources = specs[[batch[1]]]$sources)
    for (s in batch) {
      m <- regenerate(s, root, change_request = change_request, actor = actor, data = data)
      out[[length(out) + 1]] <- tibble::tibble(
        display = m$display, version = m$version, ard_rows = m$ard_rows,
        ard_errors = m$ard_errors
      )
    }
  }
  invisible(do.call(rbind, out))
}

#' Stable key for an analysis spec's `sources:` declaration
#' @noRd
source_signature <- function(sources) {
  sources <- normalise_sources(sources)
  if (is.null(sources)) {
    return("<default>")
  }
  if (is.null(names(sources))) {
    return(paste0("<all>=", sources))
  }
  paste(paste0(names(sources), "=", unname(sources))[order(names(sources))], collapse = ",")
}

#' Refuse prepared data that came from a different packaging of the study
#'
#' [regenerate()] accepts a prepared data list so a batch does not re-read every
#' dataset per display. That shortcut is also a way to render a display against
#' inputs its spec never asked for, which would be a silent wrong answer rather
#' than a failure: the iteration would be written, the manifest would look
#' complete, and only the numbers would be wrong. The registry stamped by
#' [prepare_data()] is compared with the one the spec resolves to, per dataset,
#' and any disagreement stops the regeneration before anything is written.
#' @noRd
check_data_sources <- function(data, analysis_spec, needed, slug) {
  wanted <- data_sources(analysis_spec$sources)
  got <- tryCatch(data_sources_used(data), error = function(e) NULL)
  if (is.null(got)) {
    stop(
      "regenerate('", slug, "'): the supplied `data` carries no source stamp, ",
      "so it cannot be shown to match the spec's `sources:`. Pass a list from ",
      "prepare_data().",
      call. = FALSE
    )
  }
  disagree <- needed[vapply(needed, function(nm) {
    !identical(unname(got[[nm]]), unname(wanted[[nm]]))
  }, logical(1))]
  if (length(disagree)) {
    stop(
      "regenerate('", slug, "'): the supplied `data` was prepared from a different ",
      "source than the spec declares — ",
      paste(vapply(disagree, function(nm) {
        paste0(nm, ": spec wants '", wanted[[nm]], "', data holds '", got[[nm]], "'")
      }, character(1)), collapse = "; "),
      ".",
      call. = FALSE
    )
  }
  invisible(TRUE)
}
