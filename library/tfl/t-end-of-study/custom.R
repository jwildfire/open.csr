# Display-specific statistics for t-end-of-study.
#
# The statistical analysis plan for CDISCPILOT01 specifies one hypothesis test
# on this table (SAP section 9.7.1.2): "Specific reasons for early study
# discontinuation (protocol completed, lack of efficacy, and adverse event) were
# compared using a Fisher's exact test." Three rows therefore carry a p-value;
# every other row does not. The v0 method vocabulary (contract section 2) has no
# hypothesis test, so those three rows set `custom: ard_count_and_fisher` and
# this function is dispatched instead of the built-in `subject_count`.
#
# It returns the same subject counts the built-in method would — the counting is
# the same {cards} call with the same arguments — plus two extra statistics
# addressed to a `p-value` display column. Making the test result an ordinary
# ARD row at its own group level is what lets display.yaml place it with
# `columns.patterns` instead of the renderer knowing anything about p-values.
#
# Contract: the function receives (data, spec, denominator) and returns a
# {cards}-shaped ARD. `spec$group` holds the grouping variable actually in
# force, which is how the engine also re-runs it for the Total column.

#' Flatten a {cards} ARD to the plain columns build_ard() reads
#'
#' {cards} stores levels and conditions in list columns. The engine coerces them
#' on the way into the ARD row schema; doing the same here means the counts and
#' the appended test rows can be a single data frame with no list-column
#' mismatch on `rbind`.
#' @noRd
flatten_cards_ard <- function(ard) {
  chr <- function(nm) {
    if (!nm %in% names(ard)) {
      return(rep(NA_character_, nrow(ard)))
    }
    x <- ard[[nm]]
    if (!is.list(x)) {
      return(as.character(x))
    }
    vapply(x, function(el) {
      if (is.null(el) || length(el) == 0) NA_character_ else paste(as.character(el), collapse = "; ")
    }, character(1))
  }
  out <- data.frame(
    group1 = chr("group1"), group1_level = chr("group1_level"),
    group2 = chr("group2"), group2_level = chr("group2_level"),
    variable = chr("variable"), variable_level = chr("variable_level"),
    context = chr("context"), stat_name = chr("stat_name"),
    stat_label = chr("stat_label"), warning = chr("warning"), error = chr("error"),
    stringsAsFactors = FALSE
  )
  out$stat <- lapply(ard$stat, function(x) if (is.null(x) || length(x) == 0) NA else x)
  out
}

#' Subject counts for one row, plus the SAP's Fisher's exact test across arms
#'
#' @param data Analysis dataset, already restricted to the analysis set and to
#'   the analysis entry's `filter` — i.e. the subjects this row counts.
#' @param spec The analysis entry (a list), including `spec$group`.
#' @param denominator Subject-level denominator dataset, restricted to the
#'   analysis set. Supplies both the row's denominator and the "not in this
#'   category" cell of the test's 2 x k table.
#' @return A data frame carrying the `{cards}` ARD columns: N, n and p per
#'   treatment group, and (when there is more than one group to compare) the
#'   test's p-value at group level `p-value`.
ard_count_and_fisher <- function(data, spec, denominator) {
  group <- spec$group
  # `%||%` is base R only from 4.4; a library file must run on the pinned 4.1
  # floor in DESCRIPTION, so the fallbacks here are spelled out.
  id <- if (is.null(spec$id)) "USUBJID" else spec$id
  label_var <- if (is.null(spec$variable)) spec$name else spec$variable
  flag_var <- ".opencsr_flag"
  denominator[[flag_var]] <- denominator[[id]] %in% unique(data[[id]])

  # Identical to the built-in subject_count method: the count is computed on the
  # denominator with a derived flag, so the denominator is always the analysis
  # set, never the number of rows that survived the filter.
  counts <- if (length(group)) {
    cards::ard_dichotomous(
      denominator,
      by = dplyr::all_of(group), variables = dplyr::all_of(flag_var),
      value = stats::setNames(list(TRUE), flag_var)
    )
  } else {
    cards::ard_dichotomous(
      denominator,
      variables = dplyr::all_of(flag_var),
      value = stats::setNames(list(TRUE), flag_var)
    )
  }
  counts <- flatten_cards_ard(counts)
  counts$variable <- label_var
  counts$variable_level <- "Y"
  counts$context <- "subject_count"

  if (!length(group)) {
    return(counts)
  }
  g <- as.character(denominator[[group]])
  levels_present <- if (is.factor(denominator[[group]])) {
    intersect(levels(denominator[[group]]), g)
  } else {
    sort(unique(g[!is.na(g)]))
  }
  # One group is the Total column, which the engine produces by re-running this
  # function against a constant grouping variable. There is no comparison to
  # make there, so no test row is emitted and the cell renders empty — rather
  # than a p-value for a hypothesis nobody stated.
  if (length(levels_present) < 2) {
    return(counts)
  }

  k <- vapply(levels_present, function(lv) sum(g == lv & denominator[[flag_var]], na.rm = TRUE), numeric(1))
  n <- vapply(levels_present, function(lv) sum(g == lv, na.rm = TRUE), numeric(1))
  tested <- stats::fisher.test(rbind(k, n - k))
  p_value <- unname(tested$p.value)

  test_rows <- data.frame(
    group1 = "statistic",
    group1_level = "p-value",
    group2 = NA_character_,
    group2_level = NA_character_,
    variable = label_var,
    variable_level = "Y",
    context = "hypothesis_test",
    stat_name = c("p_value", "p_value_fmt"),
    stat_label = c("Fisher's exact p-value", "Fisher's exact p-value (formatted)"),
    warning = NA_character_,
    error = NA_character_,
    stringsAsFactors = FALSE
  )
  # The numeric p-value is the analysis result and is what the ARD carries for
  # anyone re-checking it. The string is its presentation: the reference report
  # writes p < 0.0001 as "<.0001", which no {stat_name} pattern can express, and
  # a display must never round 6.1e-07 to "0.0000".
  test_rows$stat <- list(
    p_value,
    if (p_value < 0.0001) "<.0001" else formatC(p_value, format = "f", digits = 4)
  )
  rbind(counts, test_rows)
}
