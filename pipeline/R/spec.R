#' Method vocabulary understood by [build_ard()]
#'
#' Contract §2. `figure` has no built-in implementation and must dispatch to a
#' function in the display's `custom.R`.
#' @noRd
ard_methods <- function() {
  c(
    "continuous", "categorical", "subject_count",
    "hierarchical_count", "listing", "figure"
  )
}

#' Path to a display's library directory
#' @noRd
display_dir <- function(slug, root = csr_root()) {
  file.path(root, "library", "tfl", slug)
}

#' Slugs of every display in the library
#'
#' @param root Repository root.
#' @return Character vector of display slugs, sorted.
#' @export
display_slugs <- function(root = csr_root()) {
  dir <- file.path(root, "library", "tfl")
  if (!dir.exists(dir)) {
    return(character(0))
  }
  slugs <- list.dirs(dir, full.names = FALSE, recursive = FALSE)
  sort(slugs[file.exists(file.path(dir, slugs, "analysis.yaml"))])
}

#' Read and validate an analysis specification
#'
#' @param slug Display slug, or a direct path when `path` is supplied.
#' @param root Repository root.
#' @param path Optional explicit path to an `analysis.yaml`.
#' @return The validated spec, a list, with the source path in `attr(x, "path")`.
#' @export
read_analysis_spec <- function(slug = NULL, root = csr_root(), path = NULL) {
  path <- path %||% file.path(display_dir(slug, root), "analysis.yaml")
  spec <- read_yaml_file(path)
  spec <- validate_analysis_spec(spec)
  attr(spec, "path") <- path
  spec
}

#' Read and validate a display specification
#'
#' @inheritParams read_analysis_spec
#' @param path Optional explicit path to a `display.yaml`.
#' @return The validated spec, a list, with the source path in `attr(x, "path")`.
#' @export
read_display_spec <- function(slug = NULL, root = csr_root(), path = NULL) {
  path <- path %||% file.path(display_dir(slug, root), "display.yaml")
  spec <- read_yaml_file(path)
  spec <- validate_display_spec(spec)
  attr(spec, "path") <- path
  spec
}

#' Validate an analysis specification
#'
#' Enforces contract §2: required keys, the method vocabulary, one grouping
#' variable in v0, and per-method required fields. Errors name the offending
#' analysis so a bad spec is a build failure with a usable message rather than
#' a downstream `{cards}` error.
#'
#' @param spec Parsed `analysis.yaml`.
#' @return The spec, normalised (defaults filled in).
#' @export
validate_analysis_spec <- function(spec) {
  if (!is.list(spec)) stop("analysis spec must be a mapping.", call. = FALSE)
  required <- c("id", "title", "type", "dataset", "analysis_set", "analyses")
  missing <- setdiff(required, names(spec))
  if (length(missing)) {
    stop("analysis spec is missing required key(s): ", paste(missing, collapse = ", "), call. = FALSE)
  }
  if (!spec$type %in% c("table", "listing", "figure")) {
    stop("analysis spec `type` must be one of table, listing, figure; got '", spec$type, "'.", call. = FALSE)
  }
  spec$group <- as.character(spec$group %||% character(0))
  if (length(spec$group) > 1) {
    stop("v0 supports at most one grouping variable; got ", length(spec$group), ".", call. = FALSE)
  }
  spec$total <- isTRUE(spec$total)
  if (spec$total && length(spec$group) == 0) {
    stop("`total: true` requires a grouping variable.", call. = FALSE)
  }
  spec$denominator <- spec$denominator %||% "adsl"
  if (!length(spec$analyses)) {
    stop("analysis spec must declare at least one entry under `analyses`.", call. = FALSE)
  }
  spec$analyses <- lapply(seq_along(spec$analyses), function(i) {
    a <- spec$analyses[[i]]
    if (is.null(a$name)) {
      stop("analyses[[", i, "]] is missing `name`.", call. = FALSE)
    }
    if (is.null(a$method)) {
      stop("analysis '", a$name, "' is missing `method`.", call. = FALSE)
    }
    if (!a$method %in% ard_methods()) {
      stop(
        "analysis '", a$name, "' uses unknown method '", a$method,
        "'. Known methods: ", paste(ard_methods(), collapse = ", "), ".",
        call. = FALSE
      )
    }
    if (a$method == "figure" && is.null(a$custom)) {
      stop("analysis '", a$name, "': method `figure` requires `custom:`.", call. = FALSE)
    }
    if (a$method %in% c("continuous", "categorical", "listing") &&
      is.null(a$custom) && !length(a$variables)) {
      stop("analysis '", a$name, "': method '", a$method, "' requires `variables`.", call. = FALSE)
    }
    if (a$method == "hierarchical_count" && is.null(a$custom) && length(a$hierarchy) < 2) {
      stop("analysis '", a$name, "': `hierarchical_count` requires a `hierarchy` of >= 2 variables.", call. = FALSE)
    }
    a$variables <- as.character(a$variables %||% character(0))
    a$hierarchy <- as.character(a$hierarchy %||% character(0))
    a$label <- a$label %||% a$name
    a
  })
  names(spec$analyses) <- vapply(spec$analyses, function(a) a$name, character(1))
  if (anyDuplicated(names(spec$analyses))) {
    stop("analysis names must be unique within a spec.", call. = FALSE)
  }
  spec
}

#' Validate a display specification
#'
#' Enforces contract §3 plus the ICH E3 header requirement carried through the
#' design (research section 03): every display must state its study, its
#' analysis set and its data cut-off. A display that cannot identify the set of
#' patients it describes is not renderable.
#'
#' @param spec Parsed `display.yaml`.
#' @return The spec, normalised.
#' @export
validate_display_spec <- function(spec) {
  if (!is.list(spec)) stop("display spec must be a mapping.", call. = FALSE)
  required <- c("id", "title", "study", "population_label", "cutoff")
  missing <- setdiff(required, names(spec))
  if (length(missing)) {
    stop("display spec is missing required key(s): ", paste(missing, collapse = ", "), call. = FALSE)
  }
  for (key in required) {
    if (!is.character(spec[[key]]) || !nzchar(spec[[key]])) {
      stop("display spec key `", key, "` must be a non-empty string.", call. = FALSE)
    }
  }
  spec$footnotes <- as.character(spec$footnotes %||% character(0))
  spec$format <- spec$format %||% list()
  spec$format$digits <- spec$format$digits %||% list()
  spec$columns <- spec$columns %||% list()
  spec$rows <- spec$rows %||% list()
  spec$variants <- spec$variants %||% list(post_text = list())
  if (!"post_text" %in% names(spec$variants)) {
    spec$variants$post_text <- list()
  }
  spec$rows <- lapply(seq_along(spec$rows), function(i) {
    r <- spec$rows[[i]]
    if (is.null(r$analysis) && !isTRUE(r$section)) {
      stop("display rows[[", i, "]] needs `analysis:` unless it is a `section:` row.", call. = FALSE)
    }
    for (key in c("analysis", "variable", "level", "label", "pattern")) {
      v <- r[[key]]
      if (!is.null(v) && !is.character(v)) {
        stop(
          "display rows[[", i, "]] key `", key, "` must be a string, got ",
          class(v)[1], ". YAML 1.1 reads bare `n`, `y`, `no`, `on` and `off` as ",
          "booleans - quote the value (for example `pattern: \"n\"`).",
          call. = FALSE
        )
      }
    }
    r
  })
  spec
}

#' Assert that a display spec is consistent with its analysis spec
#'
#' The two artefacts are edited independently, so the ids must agree and every
#' row plan entry must name an analysis that exists.
#' @noRd
check_specs_consistent <- function(analysis_spec, display_spec) {
  if (!identical(analysis_spec$id, display_spec$id)) {
    stop(
      "analysis.yaml id ('", analysis_spec$id, "') and display.yaml id ('",
      display_spec$id, "') must match.",
      call. = FALSE
    )
  }
  known <- names(analysis_spec$analyses)
  for (r in display_spec$rows) {
    if (!is.null(r$analysis) && !r$analysis %in% known) {
      stop(
        "display.yaml row references unknown analysis '", r$analysis,
        "'; analysis.yaml defines: ", paste(known, collapse = ", "), ".",
        call. = FALSE
      )
    }
  }
  invisible(TRUE)
}
