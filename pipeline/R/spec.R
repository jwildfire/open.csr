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
  spec$sources <- normalise_sources(spec$sources)
  # Resolving the registry here turns an unknown source id or an unknown
  # dataset name into a spec-validation error, at the point the spec is read,
  # rather than a prepare_data() error three calls later.
  data_sources(spec$sources)
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
  spec$figure <- validate_figure_block(spec$figure, spec$id)
  spec$rows <- lapply(seq_along(spec$rows), function(i) {
    r <- spec$rows[[i]]
    if (is.null(r$analysis) && !isTRUE(r$section)) {
      stop("display rows[[", i, "]] needs `analysis:` unless it is a `section:` row.", call. = FALSE)
    }
    for (key in c("analysis", "variable", "level", "label", "pattern", "na_text")) {
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

#' Validate a display spec's `figure:` block
#'
#' Contract §3. A figure is drawn from the ARD and from nothing else, so every
#' choice a reader could mistake for data — which analysis supplies the curve,
#' which statistic is the abscissa, the axis limits, the drawing order — is
#' declared here rather than inferred at render time. Axis limits are optional
#' and fall back to the data range; everything else is required, because a figure
#' with a guessed series list is a figure nobody specified.
#'
#' Appearance is deliberately *not* declarable. The series are named and ordered
#' here; their colours and dash patterns come from [figure_palette()], which has
#' a dark-scheme counterpart and is colour-vision-safe. A hex value in a display
#' specification would be a presentation choice masquerading as part of the
#' display's definition.
#'
#' @param figure The raw `figure` value parsed from YAML, or `NULL`.
#' @param id Display id, for error messages.
#' @return The normalised block, or `NULL` when the display is not a figure.
#' @noRd
validate_figure_block <- function(figure, id) {
  if (is.null(figure)) {
    return(NULL)
  }
  if (!is.list(figure)) {
    stop("display spec `figure` must be a mapping.", call. = FALSE)
  }
  req <- function(key, value) {
    if (!is.character(value) || length(value) != 1 || !nzchar(value)) {
      stop(
        "display '", id, "': `figure.", key, "` must be a non-empty string.",
        call. = FALSE
      )
    }
    value
  }
  # YAML 1.1 reads a bare `y:` key as the boolean true, so a `y:` axis arrives
  # under the name "TRUE" and the axis looks absent. The axes are therefore named
  # `x_axis`/`y_axis`, and a key that survived the coercion is reported as what it
  # is rather than as a missing mapping.
  bad_keys <- intersect(names(figure), c("TRUE", "FALSE"))
  if (length(bad_keys)) {
    stop(
      "display '", id, "': the `figure:` block has a key named '", bad_keys[1],
      "'. YAML 1.1 reads bare `y`, `n`, `yes`, `no`, `on` and `off` as booleans ",
      "- the axes are `x_axis:` and `y_axis:`.",
      call. = FALSE
    )
  }
  figure$analysis <- req("analysis", figure$analysis)
  # A flow figure (kind: flow) draws boxes of counts, not curves on axes; its
  # own block is `boxes`, checked here, and the axis checks below do not apply.
  if (identical(figure$kind, "flow")) {
    req("analysis", figure$analysis)
    if (!is.list(figure$boxes) || !length(figure$boxes)) {
      stop("display '", id, "': a flow figure needs a `boxes:` list.", call. = FALSE)
    }
    for (b in figure$boxes) {
      req("boxes[].level", b$level)
      req("boxes[].label", b$label)
    }
    figure$width <- figure$width %||% 760
    figure$height <- figure$height %||% 330
    return(figure)
  }
  for (axis in c("x_axis", "y_axis")) {
    ax <- figure[[axis]]
    if (!is.list(ax)) {
      stop("display '", id, "': `figure.", axis, "` must be a mapping.", call. = FALSE)
    }
    ax$label <- req(paste0(axis, ".label"), ax$label)
    for (key in c("min", "max")) {
      if (!is.null(ax[[key]])) ax[[key]] <- as.numeric(ax[[key]])
    }
    if (!is.null(ax$ticks)) ax$ticks <- as.numeric(unlist(ax$ticks))
    if (!is.null(ax$min) && !is.null(ax$max) && ax$min >= ax$max) {
      stop(
        "display '", id, "': `figure.", axis, "` has min >= max (",
        ax$min, " >= ", ax$max, ").",
        call. = FALSE
      )
    }
    figure[[axis]] <- ax
  }
  if (!length(figure$series)) {
    stop(
      "display '", id, "': `figure.series` must list at least one series; a ",
      "figure that infers its own series is not a specified figure.",
      call. = FALSE
    )
  }
  figure$series <- lapply(seq_along(figure$series), function(i) {
    s <- figure$series[[i]]
    if (!is.list(s)) {
      stop("display '", id, "': `figure.series[[", i, "]]` must be a mapping.", call. = FALSE)
    }
    s$level <- req(paste0("series[[", i, "]].level"), s$level)
    s$label <- s$label %||% s$level
    s
  })
  levels <- vapply(figure$series, function(s) s$level, character(1))
  if (anyDuplicated(levels)) {
    stop("display '", id, "': `figure.series` names a level twice.", call. = FALSE)
  }
  stats <- figure$stats %||% list()
  figure$stats <- list(
    time = as.character(stats$time %||% "time"),
    value = as.character(stats$value %||% "surv"),
    censor_time = if (is.null(stats$censor_time)) NULL else as.character(stats$censor_time),
    censor_value = if (is.null(stats$censor_value)) NULL else as.character(stats$censor_value)
  )
  if (!is.null(figure$at_risk)) {
    ar <- figure$at_risk
    if (!is.list(ar)) {
      stop("display '", id, "': `figure.at_risk` must be a mapping.", call. = FALSE)
    }
    # The strip prints committed statistics, so it names them; a strip that let
    # the renderer derive its own counts would be a second calculation of the
    # risk set with nothing to check it against.
    ar$times <- req("at_risk.times", ar$times)
    ar$counts <- req("at_risk.counts", ar$counts)
    ar$label <- as.character(ar$label %||% "Number at risk")
    figure$at_risk <- ar
  }
  if (!is.null(figure$annotation)) {
    a <- figure$annotation
    if (!is.list(a)) {
      stop("display '", id, "': `figure.annotation` must be a mapping.", call. = FALSE)
    }
    # One address per token. Every annotated number is addressed into the ARD, so
    # an annotation cannot state a result the analysis does not hold.
    if (is.null(a$bindings) && !is.null(a$binding)) {
      a$bindings <- list(value = a$binding)
    }
    if (!is.list(a$bindings) || !length(a$bindings) || is.null(names(a$bindings))) {
      stop(
        "display '", id, "': `figure.annotation` must declare `bindings:` as a ",
        "mapping of template token to ARD address, so every annotated value ",
        "comes from the analysis rather than from prose.",
        call. = FALSE
      )
    }
    a$bindings <- lapply(a$bindings, as.character)
    a$template <- as.character(a$template %||% "{value}")
    missing_tok <- names(a$bindings)[
      !vapply(names(a$bindings), function(nm) {
        grepl(paste0("{", nm, "}"), a$template, fixed = TRUE)
      }, logical(1))
    ]
    if (length(missing_tok)) {
      stop(
        "display '", id, "': `figure.annotation.template` has no '{",
        missing_tok[1], "}' token for the binding of that name.",
        call. = FALSE
      )
    }
    a$binding <- NULL
    figure$annotation <- a
  }
  figure$width <- as.numeric(figure$width %||% 900)
  figure$height <- as.numeric(figure$height %||% 460)
  figure$plot_title <- if (is.null(figure$plot_title)) NULL else as.character(figure$plot_title)
  figure
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
  # A `type: figure` display that declares no plot renders as a table and would
  # publish silently as one; a plot on a display that is not typed as a figure
  # would never reach the figure numbering. Both are spec errors, not warnings.
  is_figure <- identical(analysis_spec$type, "figure")
  has_block <- !is.null(display_spec$figure)
  if (is_figure && !has_block) {
    stop(
      "analysis.yaml declares `type: figure` but display.yaml has no `figure:` ",
      "block, so '", analysis_spec$id, "' would render as a table.",
      call. = FALSE
    )
  }
  if (!is_figure && has_block) {
    stop(
      "display.yaml declares a `figure:` block but analysis.yaml types '",
      analysis_spec$id, "' as '", analysis_spec$type,
      "', so the figure would never be numbered as one.",
      call. = FALSE
    )
  }
  if (has_block && !display_spec$figure$analysis %in% known) {
    stop(
      "display.yaml `figure.analysis` references unknown analysis '",
      display_spec$figure$analysis, "'; analysis.yaml defines: ",
      paste(known, collapse = ", "), ".",
      call. = FALSE
    )
  }
  invisible(TRUE)
}

#' Normalise an analysis spec's `sources:` key
#'
#' A display may name the packaging of the study its numbers come from
#' (contract §2). Three shapes are accepted, matching [data_sources()]:
#' absent/`NULL` (the default registry), a single source id (`sources: phuse`),
#' or a per-dataset mapping (`sources: {adsl: phuse}`). YAML parses the mapping
#' as a list, so it is flattened to the named character vector `data_sources()`
#' expects, and validated here rather than at prepare time so a typo is a spec
#' error with the spec's own vocabulary in the message.
#'
#' @param sources The raw `sources` value from `analysis.yaml`.
#' @return `NULL`, a length-one unnamed character vector, or a fully named
#'   character vector.
#' @noRd
normalise_sources <- function(sources) {
  if (is.null(sources) || identical(sources, "")) {
    return(NULL)
  }
  if (is.list(sources)) {
    if (!length(sources)) {
      return(NULL)
    }
    nms <- names(sources)
    if (is.null(nms) || any(!nzchar(nms))) {
      stop(
        "analysis spec `sources` mapping must name every dataset, ",
        "for example `sources: {adsl: phuse}`.",
        call. = FALSE
      )
    }
    flat <- vapply(sources, function(x) {
      if (length(x) != 1 || !is.character(x)) {
        stop("analysis spec `sources` values must each be a single source id.", call. = FALSE)
      }
      x
    }, character(1))
    return(stats::setNames(unname(flat), nms))
  }
  if (!is.character(sources)) {
    stop(
      "analysis spec `sources` must be a source id or a dataset-to-source mapping; got ",
      class(sources)[1], ".",
      call. = FALSE
    )
  }
  if (length(sources) != 1 || !is.null(names(sources))) {
    return(sources)
  }
  sources
}
