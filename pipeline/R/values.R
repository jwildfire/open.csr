#' Schema identifier written into `values.json`
#' @noRd
values_schema <- function() "opencsr/values/v1"

#' Path to the values source declaration
#' @noRd
values_source_path <- function(root = csr_root()) {
  file.path(root, "library", "values", "values.yaml")
}

#' Path to the generated values store
#' @noRd
values_store_path <- function(root = csr_root()) {
  file.path(root, "outputs", "values", "values.json")
}

#' Derivation operators understood by the values builder
#'
#' Structural rather than free-text expressions: the JavaScript fidelity gate
#' re-evaluates the same declarations when it checks the store against the
#' committed ARDs, and two implementations can only agree on a closed vocabulary.
#' @noRd
value_ops <- function() c("sum", "difference", "ratio", "percent")

#' Read and validate the values source declaration
#'
#' @param root Repository root.
#' @param path Optional explicit path.
#' @return The parsed declaration with the source path in `attr(x, "path")`.
#' @export
read_values_spec <- function(root = csr_root(), path = NULL) {
  path <- path %||% values_source_path(root)
  if (!file.exists(path)) {
    stop("No values declaration at ", path, ".", call. = FALSE)
  }
  spec <- read_yaml_file(path)
  spec <- validate_values_spec(spec)
  attr(spec, "path") <- path
  spec
}

#' Validate a values declaration
#'
#' @param spec Parsed declaration.
#' @return `spec`, invisibly on success; an error otherwise.
#' @export
validate_values_spec <- function(spec) {
  if (!is.list(spec) || !length(spec$values)) {
    stop("A values declaration needs a non-empty `values:` list.", call. = FALSE)
  }
  ids <- character(0)
  for (v in spec$values) {
    if (is.null(v$id) || !nzchar(v$id)) stop("Every value needs an `id`.", call. = FALSE)
    if (v$id %in% ids) stop("Duplicate value id '", v$id, "'.", call. = FALSE)
    ids <- c(ids, v$id)
    if (is.null(v$label) || !nzchar(v$label)) {
      stop("Value '", v$id, "' needs a `label` — a value is a name, and a name has to read.", call. = FALSE)
    }
    has_source <- !is.null(v$source)
    has_derived <- !is.null(v$derived)
    if (has_source == has_derived) {
      stop(
        "Value '", v$id, "' must declare exactly one of `source:` (an ARD address) ",
        "or `derived:` (an operation over other values).",
        call. = FALSE
      )
    }
    if (has_source) {
      parts <- strsplit(strsplit(v$source, ";", fixed = TRUE)[[1]][1], ":", fixed = TRUE)[[1]]
      if (length(parts) != 3) {
        stop(
          "Value '", v$id, "' has source '", v$source,
          "'; expected <display>:<analysis>:<stat_name>[;qualifier=value].",
          call. = FALSE
        )
      }
    }
    if (has_derived) {
      if (!isTRUE(v$derived$op %in% value_ops())) {
        stop(
          "Value '", v$id, "' declares op '", v$derived$op %||% "<none>",
          "'; known operations: ", paste(value_ops(), collapse = ", "), ".",
          call. = FALSE
        )
      }
      inputs <- as.character(v$derived$inputs %||% character(0))
      if (identical(v$derived$op, "sum")) {
        if (length(inputs) < 2) stop("Value '", v$id, "': `sum` needs at least two inputs.", call. = FALSE)
      } else if (length(inputs) != 2) {
        stop("Value '", v$id, "': `", v$derived$op, "` needs exactly two inputs.", call. = FALSE)
      }
    }
  }
  invisible(spec)
}

#' Apply a declared derivation to resolved input values
#' @noRd
apply_value_op <- function(op, inputs) {
  switch(op,
    sum = sum(inputs),
    difference = inputs[1] - inputs[2],
    ratio = inputs[1] / inputs[2],
    percent = 100 * inputs[1] / inputs[2],
    stop("Unknown value operation '", op, "'.", call. = FALSE)
  )
}

#' Format a value for display
#'
#' `scale` then `digits`, half-up — the same convention prose bindings use, so a
#' value and an inline `{{ard:…}}` of the same statistic render identically.
#' @noRd
format_value <- function(value, format = list()) {
  if (is.null(value) || length(value) != 1 || is.na(value)) {
    return(NA_character_)
  }
  if (!is.numeric(value)) {
    return(as.character(value))
  }
  scale <- as.numeric(format$scale %||% 1)
  digits <- as.integer(format$digits %||% 0)
  formatC(round_half_up(value * scale, digits), format = "f", digits = digits, big.mark = "")
}

#' Build the values store from the committed ARDs
#'
#' Design D9 in one function: the declaration is source, this is the regeneration.
#' Each `source:` value resolves to exactly one row of the display's **committed**
#' ARD — the same iteration the report and the site are built from — and carries
#' that iteration's path and hash, so a value can always name the artifact it came
#' from. Derived values are evaluated over other values, in declaration order.
#'
#' @param root Repository root.
#' @param spec Optional pre-read declaration.
#' @return A list ready for JSON serialisation.
#' @export
build_values <- function(root = csr_root(), spec = NULL) {
  spec <- spec %||% read_values_spec(root)
  ards <- list()
  meta <- list()
  resolved <- list()
  out <- list()

  for (v in spec$values) {
    format <- v$format %||% list()
    if (!is.null(v$source)) {
      head <- strsplit(strsplit(v$source, ";", fixed = TRUE)[[1]][1], ":", fixed = TRUE)[[1]]
      slug <- head[1]
      address <- sub(paste0("^", slug, ":"), "", v$source)
      if (is.null(ards[[slug]])) {
        cur <- current_iteration(slug, root)
        if (is.null(cur)) {
          stop("Value '", v$id, "' binds display '", slug, "', which has no committed iteration.", call. = FALSE)
        }
        ard_path <- file.path(root, cur$ard)
        ards[[slug]] <- read_ard(ard_path)
        meta[[slug]] <- list(
          iteration = cur$version,
          ard_file = cur$ard,
          ard_hash = hash_file(ard_path)
        )
      }
      value <- tryCatch(
        ard_binding(ards[[slug]], address),
        error = function(e) stop("Value '", v$id, "': ", conditionMessage(e), call. = FALSE)
      )
      if (length(value) != 1) {
        stop("Value '", v$id, "' resolved ", length(value), " statistics; a value is a scalar.", call. = FALSE)
      }
      entry <- list(
        id = v$id,
        label = v$label,
        kind = "ard",
        value = unname(value),
        formatted = format_value(value, format),
        format = list(scale = as.numeric(format$scale %||% 1), digits = as.integer(format$digits %||% 0)),
        source = list(
          address = v$source,
          display = slug,
          analysis = strsplit(address, ":", fixed = TRUE)[[1]][1],
          iteration = meta[[slug]]$iteration,
          ard_file = meta[[slug]]$ard_file,
          ard_hash = meta[[slug]]$ard_hash
        ),
        notes = v$notes %||% NULL
      )
    } else {
      inputs <- as.character(v$derived$inputs)
      missing <- setdiff(inputs, names(resolved))
      if (length(missing)) {
        stop(
          "Value '", v$id, "' derives from ", paste(missing, collapse = ", "),
          ", which is not declared before it.",
          call. = FALSE
        )
      }
      value <- unname(apply_value_op(v$derived$op, unname(vapply(inputs, function(i) resolved[[i]], numeric(1)))))
      entry <- list(
        id = v$id,
        label = v$label,
        kind = "derived",
        value = unname(value),
        formatted = format_value(value, format),
        format = list(scale = as.numeric(format$scale %||% 1), digits = as.integer(format$digits %||% 0)),
        derivation = list(op = v$derived$op, inputs = inputs),
        notes = v$notes %||% NULL
      )
    }
    resolved[[v$id]] <- as.numeric(entry$value)
    out[[length(out) + 1]] <- entry
  }

  list(
    schema = values_schema(),
    study = spec$study %||% NULL,
    created = iso_now(),
    provenance = list(
      source_file = "library/values/values.yaml",
      source_hash = hash_file(attr(spec, "path") %||% values_source_path(root)),
      git_commit = git_commit(root),
      environment = environment_block()
    ),
    values = out
  )
}

#' Regenerate the values store
#'
#' Writes `outputs/values/values.json`. Like every other artifact in this
#' repository it is generated, never hand-edited: the numbers come from the
#' committed ARDs, and the JavaScript fidelity gate re-derives them at assembly
#' so a store that has drifted from its ARD fails the build.
#'
#' @param root Repository root.
#' @return The store, invisibly.
#' @examples
#' \dontrun{
#' regenerate_values()
#' }
#' @export
regenerate_values <- function(root = csr_root()) {
  store <- build_values(root)
  path <- values_store_path(root)
  dir.create(dirname(path), recursive = TRUE, showWarnings = FALSE)
  writeLines(
    jsonlite::toJSON(store, auto_unbox = TRUE, null = "null", na = "null", digits = NA, pretty = 2),
    path
  )
  invisible(store)
}

#' Read the generated values store
#'
#' @param root Repository root.
#' @return The parsed store, or `NULL` when it has never been generated.
#' @export
read_values <- function(root = csr_root()) {
  path <- values_store_path(root)
  if (!file.exists(path)) {
    return(NULL)
  }
  jsonlite::fromJSON(path, simplifyVector = FALSE)
}
