# Custom statistics for t-demographics — the reference report's Table 14-2.01.
#
# The 2006 report prints, for every block of the demographics table, an "n" row
# carrying the number of subjects with a value and, in a final column, one
# p-value for the block: a one-way ANOVA across the three treatment groups for a
# continuous measure, Pearson's chi-square for a categorical one (the table's
# own footnote [1]). Each block's "n" row is therefore its own analysis entry,
# dispatched here, while the block's statistics and levels come from the
# built-in `continuous` and `categorical` methods on a sibling entry — so the
# p-value lands on exactly one row of the block rather than on every row the
# analysis feeds.
#
# Three sub-blocks (age groups, duration-of-disease groups, BMI groups) have no
# "n" row of their own in the report and print their p-value beside the first
# level instead. `p_on_level: "<65"` on the analysis entry puts the test rows
# under that level so the renderer places them there.

`%||%` <- function(x, y) if (is.null(x)) y else x

#' N per group and one test across the groups
#'
#' @param data The analysis dataset after the analysis set and filter.
#' @param spec The analysis entry: `variables` (one column), `test` ("anova" or
#'   "chisq"), optional `p_on_level`, and the `group` the engine supplies.
#' @param denominator Ignored; N here is the number of subjects with a value.
#' @return Rows in the `{cards}` ARD shape: `N` per group, and — when there is
#'   more than one group to compare — `p_value` and `p_value_fmt` at group level
#'   `p-value`.
ard_block_n_and_test <- function(data, spec, denominator) {
  group <- spec$group
  var <- spec$variables[[1]]
  x <- data[[var]]
  g <- as.character(data[[group]])
  present <- !is.na(x) & !is.na(g)
  if (is.factor(x)) present <- present & !is.na(as.character(x))

  levels_present <- if (is.factor(data[[group]])) {
    intersect(levels(data[[group]]), unique(g[present]))
  } else {
    sort(unique(g[present]))
  }

  n_rows <- data.frame(
    group1 = group,
    group1_level = levels_present,
    group2 = NA_character_,
    group2_level = NA_character_,
    variable = var,
    variable_level = NA_character_,
    context = "block_n",
    stat_name = "N",
    stat_label = "N",
    warning = NA_character_,
    error = NA_character_,
    stringsAsFactors = FALSE
  )
  n_rows$stat <- lapply(levels_present, function(lv) sum(present & g == lv))

  # The Total column is produced by re-running this function against a constant
  # grouping column; there is nothing to compare there, so no test row.
  if (length(levels_present) < 2) {
    return(n_rows)
  }

  test <- spec$test %||% "anova"
  p_value <- if (identical(test, "anova")) {
    fit <- stats::aov(x[present] ~ factor(g[present], levels = levels_present))
    summary(fit)[[1]][["Pr(>F)"]][[1]]
  } else if (identical(test, "chisq")) {
    tab <- table(factor(g[present], levels = levels_present), as.character(x[present]))
    # SAS PROC FREQ's CHISQ is Pearson's statistic with no continuity correction,
    # and it prints the p-value whatever the expected counts are.
    suppressWarnings(stats::chisq.test(tab, correct = FALSE))$p.value
  } else {
    stop("analysis '", spec$name, "': unknown test '", test, "' (anova or chisq).", call. = FALSE)
  }

  test_rows <- data.frame(
    group1 = "statistic",
    group1_level = "p-value",
    group2 = NA_character_,
    group2_level = NA_character_,
    variable = var,
    variable_level = spec$p_on_level %||% NA_character_,
    context = "hypothesis_test",
    stat_name = c("p_value", "p_value_fmt"),
    stat_label = c(
      if (identical(test, "anova")) "One-way ANOVA p-value" else "Pearson chi-square p-value",
      "p-value (formatted)"
    ),
    warning = NA_character_,
    error = NA_character_,
    stringsAsFactors = FALSE
  )
  # The numeric p-value is the result; the string is its presentation. The report
  # writes p < 0.0001 as "<.0001", which no {stat_name} pattern can express, and
  # a display must never round a small p-value to "0.0000".
  test_rows$stat <- list(
    p_value,
    if (p_value < 0.0001) "<.0001" else formatC(p_value, format = "f", digits = 4)
  )
  rbind(n_rows, test_rows)
}
