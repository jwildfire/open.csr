#' The study model
#'
#' `library/study.yaml` declares what the study IS — its arms in print order, the
#' columns that carry an arm label, its analysis sets with the flag defining each
#' and the subjects each holds per arm, its cut-off and its data source — once.
#' [trt_levels()] and [analysis_set_flag()] resolve here rather than carrying the
#' study in code, and the counts under `analysis_sets` are what the assembler's
#' treatment-consistency gate holds every display to (D0032 R2, #59).
#'
#' The parsed file is memoised per path and modification time, so the tests and
#' the regeneration script pay for one read per run and still see an edit.
#'
#' @param root Repository root; see [csr_root()].
#' @return The parsed model as a named list.
#' @export
study_model <- function(root = csr_root()) {
  path <- file.path(root, "library", "study.yaml")
  if (!file.exists(path)) {
    stop("No study model at ", path, ". Every open.csr repository declares one.", call. = FALSE)
  }
  key <- normalizePath(path)
  mtime <- file.mtime(path)
  cached <- .study_cache[[key]]
  if (!is.null(cached) && identical(cached$mtime, mtime)) {
    return(cached$model)
  }
  model <- yaml::read_yaml(path)
  validate_study_model(model, path)
  assign(key, list(mtime = mtime, model = model), envir = .study_cache)
  model
}

.study_cache <- new.env(parent = emptyenv())

#' Refuse a study model that could let a display or a count go ungated
#' @noRd
validate_study_model <- function(m, path) {
  fail <- function(...) stop("library/study.yaml: ", ..., call. = FALSE)
  if (!is.character(m$id) || !nzchar(m$id)) fail("`id` is required.")
  if (!is.list(m$arms) || !length(m$arms)) fail("`arms` must list at least one arm.")
  labels <- vapply(m$arms, function(a) as.character(a$label %||% ""), character(1))
  if (any(!nzchar(labels)) || anyDuplicated(labels)) fail("every arm needs a distinct `label`.")
  # yaml::read_yaml() simplifies a homogeneous mapping to a named vector, so
  # these are checked by their names rather than by being lists.
  if (!length(names(m$group_variables))) fail("`group_variables` must map columns to an assignment.")
  bad_gv <- names(m$group_variables)[!unlist(m$group_variables) %in% c("planned", "actual")]
  if (length(bad_gv)) fail("`group_variables` assignment must be planned or actual: ", paste(bad_gv, collapse = ", "))
  if (!all(c("planned", "actual") %in% names(m$assignment_columns))) fail("`assignment_columns` needs planned and actual.")
  if (!is.list(m$analysis_sets) || !length(m$analysis_sets)) fail("`analysis_sets` must declare at least one set.")
  for (nm in names(m$analysis_sets)) {
    s <- m$analysis_sets[[nm]]
    if (!"flag" %in% names(s)) fail("analysis set '", nm, "' must declare `flag` (null for no filter).")
    if (is.null(names(s$subjects)) || !setequal(names(s$subjects), labels)) {
      fail("analysis set '", nm, "' must declare `subjects` for exactly the arms: ", paste(labels, collapse = ", "))
    }
  }
  if (is.null(m$source$default)) fail("`source.default` is required.")
  invisible(TRUE)
}

#' The arm labels, in print order
#' @inheritParams study_model
#' @export
study_arm_labels <- function(root = csr_root()) {
  vapply(study_model(root)$arms, function(a) as.character(a$label), character(1))
}

#' The subject-level column that carries the same assignment as a grouping column
#'
#' `TRTP` on an efficacy dataset and `TRT01P` on ADSL are the same planned
#' assignment; counting a display's population needs the ADSL one.
#' @param group A grouping column name, or `NULL`.
#' @inheritParams study_model
#' @return The ADSL column name, or `NA_character_` when `group` is not a
#'   treatment column the model knows.
#' @noRd
study_assignment_column <- function(group, root = csr_root()) {
  m <- study_model(root)
  if (is.null(group) || !length(group) || is.na(group[[1]])) {
    return(NA_character_)
  }
  kind <- m$group_variables[[group[[1]]]]
  if (is.null(kind)) {
    return(NA_character_)
  }
  as.character(m$assignment_columns[[kind]])
}

#' The population an ARD summarises, counted for the gate
#'
#' Recorded in every `ard.json` provenance envelope as `population`: the analysis
#' set, the grouping column, and the distinct subjects per arm in the
#' denominator after the analysis set is applied. The assembler compares these
#' with the study model for every placed display and refuses to build a document
#' whose displays disagree about who was in the study.
#'
#' @param spec The validated analysis spec.
#' @param denom The denominator dataset after [apply_analysis_set()].
#' @param group The spec's `group` vector.
#' @return A list: `analysis_set`, `group`, `n` (named per arm, or `NULL` when the
#'   display has no arm grouping), `total`.
#' @noRd
ard_population <- function(spec, denom, group, root = csr_root()) {
  labels <- study_arm_labels(root)
  gv <- if (length(group)) as.character(group[[1]]) else NA_character_
  col <- study_assignment_column(gv, root)
  n <- NULL
  if (!is.na(col) && col %in% names(denom)) {
    ids <- if ("USUBJID" %in% names(denom)) denom$USUBJID else seq_len(nrow(denom))
    arm <- factor(as.character(denom[[col]]), levels = labels)
    n <- lapply(labels, function(l) length(unique(ids[!is.na(arm) & arm == l])))
    names(n) <- labels
  }
  list(
    analysis_set = spec$analysis_set,
    group = if (is.na(gv)) NULL else gv,
    n = n,
    total = if ("USUBJID" %in% names(denom)) length(unique(denom$USUBJID)) else nrow(denom)
  )
}
