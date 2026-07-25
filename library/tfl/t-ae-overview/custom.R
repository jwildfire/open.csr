# Display-specific statistics for t-ae-overview.
#
# The v0 method vocabulary (contract §2) counts *subjects*; an AE overview also
# has to report the number of *events*, which no built-in method provides. Rather
# than widen the vocabulary for one display, the analysis entry sets
# `custom: ard_event_count` and this function is dispatched instead.
#
# Contract: the function receives (data, spec, denominator) and returns a
# {cards}-shaped ARD. `spec` is the analysis entry, with `spec$group` holding the
# grouping variable actually in force — which is how the same function also
# produces the Total column (the engine re-runs it against a constant group).

#' Count adverse-event records per group
#'
#' @param data Analysis dataset, already restricted to the analysis set and to
#'   the analysis entry's `filter`.
#' @param spec The analysis entry (a list), including `spec$group`.
#' @param denominator Subject-level denominator dataset (unused: an event count
#'   has no denominator, and reporting a percentage of subjects against a count
#'   of events would be wrong).
#' @return A data frame carrying the `{cards}` ARD columns.
ard_event_count <- function(data, spec, denominator) {
  group <- spec$group
  levels <- if (length(group)) {
    lv <- levels(data[[group]])
    if (is.null(lv)) sort(unique(as.character(data[[group]]))) else lv
  } else {
    NA_character_
  }
  counts <- vapply(levels, function(lv) {
    if (is.na(lv)) nrow(data) else sum(as.character(data[[group]]) == lv, na.rm = TRUE)
  }, numeric(1))

  data.frame(
    group1 = if (length(group)) group else NA_character_,
    group1_level = as.character(levels),
    variable = "AENUM",
    variable_level = NA_character_,
    context = "event_count",
    stat_name = "n",
    stat_label = "Number of events",
    stat = unname(counts),
    warning = NA_character_,
    error = NA_character_,
    stringsAsFactors = FALSE
  )
}
