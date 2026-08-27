# Kaplan-Meier statistics for Figure 14-1 of the CDISCPILOT01 clinical study
# report, "Time to Dermatologic Event by Treatment Group".
#
# The analysis is not invented here. It is stated twice in the study's own
# submission package, and this file implements exactly what those two documents
# say and nothing more:
#
#   define.xml, Analysis Results Metadata, ResultDisplay "Figure_14-1"
#     Documentation ....... "Kaplan-Meier estimates and log-rank analysis of
#                            time to first dermatological adverse event, safety
#                            population"
#     AnalysisDataset ..... ADTTE where SAFFL = "Y"
#     ParameterList ....... PARAMCD = "TTDE"
#     AnalysisVariables ... ADTTE.AVAL, ADTTE.CNSR
#     ProgrammingCode ..... proc lifetest data = adtte (where=(saffl="Y")) plots=s;
#                             id usubjid;
#                             strata trtan;
#                             time aval*cnsr(1);
#                             test trtan;
#                           run;
#
#   Statistical analysis plan, section 11.2
#     "The time to the first dermatological event will be compared across the
#      treatment groups using Kaplan-Meier methods. Graphical displays of the
#      survival curves will be presented."
#
# Two decisions follow from the SAS code and are worth stating, because both are
# reproductions of a 2006 result rather than modern defaults:
#
#   `time aval*cnsr(1)` makes CNSR = 1 the censoring value, so an event is
#   CNSR = 0. ADTTE's define.xml derivation confirms it: "if ADAE.TRTEMFL = 'Y'
#   then CNSR = 0, else CNSR = 1".
#
#   The median's confidence limits use the linear ("plain") transformation,
#   which is what PROC LIFETEST produced in the SAS release that generated the
#   report. It is not survfit()'s default. Chosen because it reproduces the
#   published limits exactly (27-48 and 24-46 days); the log-log transformation
#   does not (it gives 23-46 for the high-dose arm). Recorded here so the choice
#   is legible rather than buried in an argument.
#
# `test trtan` — the one-degree-of-freedom rank test for association with dose —
# is deliberately NOT computed. See the display's report; both tests the SAS
# step produces are p < 0.0001, and the published figure annotates the
# stratified log-rank, which is what `strata trtan` yields and what survdiff()
# reproduces.

# `custom.R` is sourced into a bare environment, so the package's own helpers
# are not in scope; this display needs one of them.
`%||%` <- function(x, y) if (is.null(x)) y else x

#' Kaplan-Meier estimates and the stratified log-rank test
#'
#' @param data   ADTTE, already restricted to the analysis set by build_ard().
#' @param spec   The analysis entry; `spec$group` names the stratification
#'   variable and `spec$param` the PARAMCD to analyse.
#' @param denom  The subject-level denominator dataset (unused: ADTTE is already
#'   one record per subject per parameter, so the risk set is the denominator).
#' @return A cards-shaped data frame.
km_time_to_event <- function(data, spec, denom) {
  if (!requireNamespace("survival", quietly = TRUE)) {
    stop("The `survival` package is required by km_time_to_event().", call. = FALSE)
  }
  group <- spec$group
  if (length(group) != 1) {
    stop("km_time_to_event() needs exactly one grouping variable.", call. = FALSE)
  }
  param <- spec$param %||% "TTDE"
  if (!is.null(data$PARAMCD)) {
    data <- data[!is.na(data$PARAMCD) & data$PARAMCD == param, , drop = FALSE]
  }
  if (!nrow(data)) {
    stop("km_time_to_event(): no records for PARAMCD '", param, "'.", call. = FALSE)
  }
  dup <- anyDuplicated(data$USUBJID)
  if (dup) {
    stop(
      "km_time_to_event(): ADTTE has more than one '", param, "' record for ",
      data$USUBJID[dup], "; the risk set would count a subject twice.",
      call. = FALSE
    )
  }

  # `time aval*cnsr(1)`: censored when CNSR is the censoring value, event
  # otherwise. Read from the spec so the mapping is declared, not assumed.
  censor_value <- as.numeric(spec$censor_value %||% 1)
  time <- as.numeric(data[[spec$time_var %||% "AVAL"]])
  cnsr <- as.numeric(data[[spec$censor_var %||% "CNSR"]])
  if (anyNA(time) || anyNA(cnsr)) {
    stop("km_time_to_event(): AVAL or CNSR is missing for at least one subject.", call. = FALSE)
  }
  event <- as.integer(cnsr != censor_value)

  strata <- data[[group]]
  levels <- if (is.factor(strata)) levels(droplevels(strata)) else sort(unique(as.character(strata)))
  strata <- factor(as.character(strata), levels = levels)

  df <- data.frame(.time = time, .event = event, .strata = strata, stringsAsFactors = FALSE)
  surv <- survival::Surv(df$.time, df$.event)

  # conf.type = "plain": see the header note on reproducing the published limits.
  fit <- survival::survfit(surv ~ .strata, data = df, conf.type = "plain")
  tbl <- summary(fit)$table
  if (is.null(dim(tbl))) tbl <- t(as.matrix(tbl))
  rownames(tbl) <- levels

  pieces <- list()
  for (lv in levels) {
    keep <- df$.strata == lv
    n_sub <- sum(keep)
    n_evt <- sum(df$.event[keep])
    n_cns <- n_sub - n_evt
    part <- if (length(levels) == 1) fit else fit[match(lv, levels)]

    # The step function, as coordinates: (0, 1) then one point per distinct
    # time survfit reports, which includes censoring-only times so the curve
    # runs to the end of follow-up rather than stopping at the last event.
    step_time <- c(0, as.numeric(part$time))
    step_surv <- c(1, as.numeric(part$surv))
    cens <- part$n.censor > 0
    row <- function(stat_name, stat_label, value, context) {
      out <- data.frame(
        group1 = group, group1_level = lv,
        group2 = NA_character_, group2_level = NA_character_,
        variable = spec$time_var %||% "AVAL", variable_level = param,
        context = context, stat_name = stat_name, stat_label = stat_label,
        warning = NA_character_, error = NA_character_,
        stringsAsFactors = FALSE
      )
      out$stat <- list(value)
      out
    }
    pieces <- c(pieces, list(
      row("time", "Time (days)", step_time, "survival"),
      row("surv", "Survival probability", step_surv, "survival"),
      row("n_risk", "Number at risk", c(n_sub, as.numeric(part$n.risk)), "survival"),
      row("n_event_at", "Events at time", c(0, as.numeric(part$n.event)), "survival"),
      row("censor_time", "Censoring time", as.numeric(part$time[cens]), "survival"),
      row("censor_surv", "Survival at censoring", as.numeric(part$surv[cens]), "survival"),
      row("N", "Number of subjects", n_sub, "survival_summary"),
      row("n", "Subjects with an event", n_evt, "survival_summary"),
      row("p", "Proportion with an event", n_evt / n_sub, "survival_summary"),
      row("n_censor", "Subjects censored", n_cns, "survival_summary"),
      row("p_censor", "Proportion censored", n_cns / n_sub, "survival_summary"),
      row("median", "Median time to event", unname(tbl[lv, "median"]), "survival_summary"),
      row("median_lcl", "Median 95% LCL", unname(tbl[lv, "0.95LCL"]), "survival_summary"),
      row("median_ucl", "Median 95% UCL", unname(tbl[lv, "0.95UCL"]), "survival_summary")
    ))
  }

  # `strata trtan` in PROC LIFETEST: the test of equality over strata. survdiff()
  # with rho = 0 is the log-rank form, on (number of strata - 1) df.
  if (length(levels) > 1) {
    sd <- survival::survdiff(surv ~ .strata, data = df, rho = 0)
    dfree <- length(sd$n) - 1
    stat_row <- function(stat_name, stat_label, value) {
      out <- data.frame(
        group1 = NA_character_, group1_level = NA_character_,
        group2 = NA_character_, group2_level = NA_character_,
        variable = spec$time_var %||% "AVAL", variable_level = param,
        context = "survival_test", stat_name = stat_name, stat_label = stat_label,
        warning = NA_character_, error = NA_character_,
        stringsAsFactors = FALSE
      )
      out$stat <- list(value)
      out
    }
    pieces <- c(pieces, list(
      stat_row("chisq", "Log-rank chi-square", unname(sd$chisq)),
      stat_row("df", "Degrees of freedom", dfree),
      # Named `p_value`, never `p`: the renderer scales any statistic called `p`
      # to a percentage, and a p-value multiplied by 100 would publish silently.
      stat_row("p_value", "Log-rank p-value", stats::pchisq(sd$chisq, dfree, lower.tail = FALSE))
    ))
  }

  out <- do.call(rbind, pieces)
  rownames(out) <- NULL
  out
}
