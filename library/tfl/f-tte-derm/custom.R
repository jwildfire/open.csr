# Display-specific statistics for the time-to-first-dermatologic-event figure.
#
# CDISCPILOT01's only figure. The study's Analysis Results Metadata (define.xml,
# `adamref:ResultDisplay` Figure_14-1) carries the SAS that produced it:
#
#   proc lifetest data = adtte (where=(saffl="Y")) plots=s;
#     id usubjid;
#     strata trtan;
#     time aval*cnsr(1);
#     test trtan;
#   run;
#
# — Kaplan-Meier estimates by treatment group, with the stratified log-rank test.
# `cnsr(1)` means CNSR = 1 is the CENSORED value, so the event indicator is
# 1 - CNSR.
#
# Everything this file computes is what that procedure prints. The curve
# coordinates travel in the ARD as list-valued statistics, so the figure is drawn
# from the analysis results dataset like every other display in this library —
# the renderer never sees a subject.
#
# On the confidence limits for the median. SAS's quantile confidence limits
# depend on the transformation in force, and the three available choices do not
# agree on this data. Only the linear (untransformed Brookmeyer-Crowley) limits
# reproduce BOTH published intervals — 27 to 48 days for the low dose and 24 to
# 46 days for the high dose. The log-log transformation, which is the modern SAS
# default, gives 23 rather than 24 for the high dose. The linear form is
# therefore what this display uses, declared here rather than left to a library
# default, and the qualification record carries all three so the choice is
# inspectable.
#
# Contract: each function receives (data, spec, denominator) and returns a
# {cards}-shaped ARD. `spec$group` holds the grouping variable in force.

#' Size of the analysis set in each treatment column
#'
#' @param data Analysis dataset (unused).
#' @param spec The analysis entry, including `spec$group`.
#' @param denominator Subject-level denominator, already restricted to the
#'   display's analysis set.
#' @return A data frame carrying the `{cards}` ARD columns.
ard_population_n <- function(data, spec, denominator) {
  group <- spec$group
  levels <- levels(denominator[[group]])
  if (is.null(levels)) levels <- sort(unique(as.character(denominator[[group]])))
  rows <- lapply(levels, function(lv) {
    sub <- denominator[as.character(denominator[[group]]) == lv, , drop = FALSE]
    tte_row(group, lv, "POPULATION", "N", length(unique(sub$USUBJID)), "Subjects in the analysis set", "population")
  })
  do.call(rbind, rows)
}

#' Kaplan-Meier estimates, medians, the log-rank test and the curve itself
#'
#' @param data Analysis dataset, already restricted to the analysis set and to
#'   the entry's `filter` (which selects the time-to-event parameter).
#' @param spec The analysis entry, including `spec$group` and the optional
#'   `risk_times` grid for the numbers-at-risk strip under the curve.
#' @param denominator Subject-level denominator (unused: every subject in the
#'   analysis set contributes a record to ADTTE).
#' @return A data frame carrying the `{cards}` ARD columns. `stat` holds vectors
#'   for the curve coordinates and the at-risk counts.
ard_kaplan_meier <- function(data, spec, denominator) {
  if (!requireNamespace("survival", quietly = TRUE)) {
    stop(
      "The time-to-event display needs the {survival} package, which ships with R ",
      "but is not installed in this library.",
      call. = FALSE
    )
  }
  group <- spec$group
  if (!length(group)) {
    stop("The Kaplan-Meier analysis needs a grouping variable.", call. = FALSE)
  }
  for (v in c("AVAL", "CNSR")) {
    if (!v %in% names(data)) {
      stop("The Kaplan-Meier analysis needs `", v, "`, which the analysis dataset does not carry.", call. = FALSE)
    }
  }
  if (!all(stats::na.omit(as.numeric(data$CNSR)) %in% c(0, 1))) {
    stop("CNSR carries values other than 0 and 1; the event indicator cannot be derived.", call. = FALSE)
  }

  levels <- levels(data[[group]])
  if (is.null(levels)) levels <- sort(unique(as.character(data[[group]])))
  risk_times <- as.numeric(spec$risk_times %||% c(0, 30, 60, 90, 120, 150, 180))

  df <- data.frame(
    time = as.numeric(data$AVAL),
    event = 1 - as.numeric(data$CNSR),
    arm = factor(as.character(data[[group]]), levels = levels),
    stringsAsFactors = FALSE
  )
  df <- df[stats::complete.cases(df), , drop = FALSE]

  rows <- list()
  for (lv in levels) {
    sub <- df[df$arm == lv, , drop = FALSE]
    fit <- survival::survfit(
      survival::Surv(time, event) ~ 1,
      data = sub, conf.type = "plain"
    )
    tab <- summary(fit)$table
    n <- nrow(sub)
    events <- sum(sub$event == 1)

    add <- function(stat_name, value, label) {
      rows[[length(rows) + 1]] <<- tte_row(group, lv, "KM", stat_name, value, label, "km")
    }
    add("N", n, "Subjects at risk at day 0")
    add("n", events, "Subjects with an event")
    add("p", events / n, "Percent of subjects with an event")
    # Censored subjects are reported as a count, not a percentage: `p` is the
    # only proportion name the renderer scales to percent, and it is already
    # spoken for by the event rate.
    add("n_censor", n - events, "Subjects censored")
    add("median", unname(tab[["median"]]), "Median time to first event (days)")
    add("lcl", unname(tab[["0.95LCL"]]), "Lower 95% confidence limit for the median")
    add("ucl", unname(tab[["0.95UCL"]]), "Upper 95% confidence limit for the median")

    # The curve, as a step function anchored at (0, 1). Carried as vectors so the
    # renderer draws from the ARD rather than from subject-level data.
    add("km_time", c(0, fit$time), "Event times (days)")
    add("km_surv", c(1, fit$surv), "Event-free probability at each event time")
    add("risk_time", risk_times, "Times at which subjects at risk are reported (days)")
    add("risk_n", vapply(risk_times, function(t) sum(sub$time >= t), numeric(1)), "Subjects at risk")
  }

  # One log-rank test across all groups, printed once, in the last column.
  ld <- survival::survdiff(survival::Surv(time, event) ~ arm, data = df)
  dfree <- length(ld$n) - 1L
  col <- levels[length(levels)]
  rows[[length(rows) + 1]] <- tte_row(group, col, "LOGRANK", "chisq", unname(ld$chisq), "Log-rank chi-square", "logrank")
  rows[[length(rows) + 1]] <- tte_row(group, col, "LOGRANK", "df", dfree, "Degrees of freedom", "logrank")
  rows[[length(rows) + 1]] <- tte_row(
    group, col, "LOGRANK", "pval",
    stats::pchisq(unname(ld$chisq), dfree, lower.tail = FALSE), "Log-rank p-value", "logrank"
  )
  do.call(rbind, rows)
}

#' One ARD row in the `{cards}` shape, tolerating a vector-valued statistic
#' @noRd
tte_row <- function(group, group_level, variable, stat_name, value, label, context) {
  out <- data.frame(
    group1 = group,
    group1_level = group_level,
    variable = variable,
    variable_level = NA_character_,
    context = context,
    stat_name = stat_name,
    stat_label = label,
    warning = NA_character_,
    error = NA_character_,
    stringsAsFactors = FALSE
  )
  out$stat <- list(as.numeric(value))
  out
}

`%||%` <- function(x, y) if (is.null(x)) y else x
