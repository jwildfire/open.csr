# Display-specific statistics for the CIBIC+ summary displays.
#
# The v0 method vocabulary (contract §2) describes data. This display also has to
# report a MODEL: the analysis of covariance CDISCPILOT01's statistical analysis
# plan specifies for its second primary endpoint. No built-in method produces a
# p-value, so the two analysis entries that need one set `custom:` and dispatch
# here.
#
# The model is not this file's invention. It is transcribed from the study's own
# Analysis Results Metadata (define.xml, `adamref:ResultDisplay` Table_14-3.02),
# which carries the SAS that produced the published table:
#
#   dose response      proc glm data = ADQSCIBC;
#                        where EFFFL='Y' and ANL01FL='Y' and AVISIT='Week 24'
#                              and PARAMCD="CIBICVAL";
#                        class sitegr1;
#                        model AVAL = trtpn sitegr1;
#                      run;
#
#   pairwise           proc glm data = ADQSCIBC;
#                        where <the same selection>;
#                        class trtpn sitegr1;
#                        model AVAL = trtpn sitegr1;
#                        means trtpn;
#                        lsmeans trtpn / OM STDERR PDIFF CL;
#                      run;
#
# Two notes on faithfully reproducing that in R, both of which matter and neither
# of which is a choice this file gets to make:
#
#   * The dose-response p-value is SAS's Type III test for TRTPN entered as a
#     CONTINUOUS covariate (randomised dose: 0, 54, 81). In an additive model a
#     one-degree-of-freedom Type III test is the partial F test, which is the
#     square of the t statistic on that coefficient — so the p-value is read
#     straight off the fitted coefficient, with no sums-of-squares machinery.
#
#   * `lsmeans / OM` weights the OTHER factor's levels by their observed margins.
#     Those weights are identical for every treatment level, so they cancel in a
#     DIFFERENCE of two LS means: the difference, its standard error and its
#     confidence limits are the ordinary contrast from the fitted model. The LS
#     means themselves would depend on the weighting; this display does not report
#     them, only their differences, which is what the published table reports.
#
# Contract: each function receives (data, spec, denominator) and returns a
# {cards}-shaped ARD. `spec$group` holds the grouping variable in force.

# The randomised doses CDISCPILOT01 assigns, in protocol order. TRTPN is the
# dose in milligrams; it is the model's continuous treatment term and the class
# variable in the pairwise model.
cibic_doses <- function() c(0, 54, 81)

#' Map planned dose (TRTPN) onto the treatment label the display columns use
#'
#' The published analysis models PLANNED treatment; the display library groups on
#' `TRT01A`. In the CDISC pilot's own ADaM package the two agree for all 254
#' subjects, which is what makes a model fitted on one renderable in columns
#' headed by the other. That agreement is asserted here rather than assumed: if a
#' packaging ever arrives where a subject's actual arm differs from the arm they
#' were randomised to, this display stops rather than quietly attributing a
#' planned-treatment contrast to an actual-treatment column.
#'
#' @param data Analysis dataset.
#' @param group Grouping variable name (`TRT01A`).
#' @return A named character vector, dose (as text) to group label.
cibic_dose_labels <- function(data, group) {
  for (v in c("TRTPN", "SITEGR1", "AVAL", group)) {
    if (!v %in% names(data)) {
      stop("The CIBIC+ analysis needs `", v, "`, which the analysis dataset does not carry.", call. = FALSE)
    }
  }
  pairs <- unique(data.frame(
    dose = as.numeric(data$TRTPN),
    label = as.character(data[[group]]),
    stringsAsFactors = FALSE
  ))
  pairs <- pairs[!is.na(pairs$dose) & !is.na(pairs$label), , drop = FALSE]
  if (anyDuplicated(pairs$dose) || anyDuplicated(pairs$label)) {
    stop(
      "Planned dose (TRTPN) and the display's grouping variable (", group,
      ") are not one-to-one in this data: the published CIBIC+ analysis models ",
      "planned treatment and cannot be reported in columns headed by a different ",
      "assignment. Specify the display against planned treatment instead.",
      call. = FALSE
    )
  }
  missing <- setdiff(cibic_doses(), pairs$dose)
  if (length(missing)) {
    stop(
      "Randomised dose(s) ", paste(missing, collapse = ", "),
      " are absent from the analysis data; the three-arm CIBIC+ model cannot be fitted.",
      call. = FALSE
    )
  }
  stats::setNames(pairs$label, as.character(pairs$dose))
}

#' Size of the analysis set in each treatment column
#'
#' The published table heads each column with the number of subjects in the
#' EFFICACY ANALYSIS SET, not the number who contributed a value at the visit —
#' at Week 8 those differ (79/81/74 against 77/81/73). Counting from the
#' denominator, which the engine has already restricted to the display's analysis
#' set, is what makes the header the population and the `n` row the observations.
#'
#' @param data Analysis dataset (unused: a population size is not an observation
#'   count, and taking it from the analysis dataset is precisely the error this
#'   function exists to avoid).
#' @param spec The analysis entry, including `spec$group`.
#' @param denominator Subject-level denominator, already restricted to the
#'   display's analysis set.
#' @return A data frame carrying the `{cards}` ARD columns.
ard_population_n <- function(data, spec, denominator) {
  group <- spec$group
  levels <- if (length(group)) {
    lv <- levels(denominator[[group]])
    if (is.null(lv)) sort(unique(as.character(denominator[[group]]))) else lv
  } else {
    NA_character_
  }
  counts <- vapply(levels, function(lv) {
    sub <- if (is.na(lv)) denominator else denominator[as.character(denominator[[group]]) == lv, , drop = FALSE]
    length(unique(sub$USUBJID))
  }, numeric(1))

  data.frame(
    group1 = if (length(group)) group else NA_character_,
    group1_level = as.character(levels),
    variable = "POPULATION",
    variable_level = NA_character_,
    context = "population",
    stat_name = "N",
    stat_label = "Subjects in the analysis set",
    stat = unname(counts),
    warning = NA_character_,
    error = NA_character_,
    stringsAsFactors = FALSE
  )
}

#' Analysis of covariance for the CIBIC+ score
#'
#' Returns the three model results the published table reports, each addressed to
#' the column the published table prints it in:
#'
#' \describe{
#'   \item{`DOSE_RESPONSE`}{One p-value for the whole model — the test that the
#'     coefficient on randomised dose is non-zero. Printed once, in the last
#'     treatment column, exactly as the reference table prints it.}
#'   \item{`XAN_VS_PBO`}{Each xanomeline arm against placebo, in that arm's own
#'     column.}
#'   \item{`HIGH_VS_LOW`}{High dose against low dose, in the high-dose column.}
#' }
#'
#' @param data Analysis dataset, already restricted to the analysis set and to
#'   the entry's `filter` (which carries the visit and the LOCF flag).
#' @param spec The analysis entry, including `spec$group`.
#' @param denominator Subject-level denominator (unused: a model has no
#'   denominator).
#' @return A data frame carrying the `{cards}` ARD columns.
ard_ancova <- function(data, spec, denominator) {
  group <- spec$group
  if (!length(group)) {
    stop("The CIBIC+ ANCOVA needs a grouping variable to address its results to.", call. = FALSE)
  }
  labels <- cibic_dose_labels(data, group)

  df <- data.frame(
    AVAL = as.numeric(data$AVAL),
    dose = as.numeric(data$TRTPN),
    site = factor(as.character(data$SITEGR1)),
    stringsAsFactors = FALSE
  )
  df <- df[stats::complete.cases(df), , drop = FALSE]
  df$arm <- factor(df$dose, levels = cibic_doses())

  # Dose response: TRTPN continuous, site group as a class variable.
  dose_fit <- stats::lm(AVAL ~ dose + site, data = df)
  dose_p <- stats::coef(summary(dose_fit))["dose", "Pr(>|t|)"]

  # Pairwise: TRTPN as a class variable, same site adjustment.
  fit <- stats::lm(AVAL ~ arm + site, data = df)
  beta <- stats::coef(fit)
  V <- stats::vcov(fit)
  dfree <- fit$df.residual
  contrast <- function(plus, minus) {
    v <- stats::setNames(rep(0, length(beta)), names(beta))
    if (!is.na(plus)) v[[paste0("arm", plus)]] <- 1
    if (!is.na(minus)) v[[paste0("arm", minus)]] <- -1
    est <- sum(v * beta)
    se <- sqrt(drop(t(v) %*% V %*% v))
    tcrit <- stats::qt(0.975, dfree)
    c(
      diff = est, se = se,
      lcl = est - tcrit * se, ucl = est + tcrit * se,
      pval = 2 * stats::pt(-abs(est / se), dfree)
    )
  }

  high <- labels[["81"]]
  low <- labels[["54"]]

  rows <- list(
    stat_row("DOSE_RESPONSE", high, "pval", dose_p, "p-value (dose response)", group)
  )
  for (entry in list(
    list(var = "XAN_VS_PBO", col = low, est = contrast(54, NA)),
    list(var = "XAN_VS_PBO", col = high, est = contrast(81, NA)),
    list(var = "HIGH_VS_LOW", col = high, est = contrast(81, 54))
  )) {
    for (nm in names(entry$est)) {
      rows[[length(rows) + 1]] <- stat_row(
        entry$var, entry$col, nm, unname(entry$est[[nm]]), ancova_stat_label(nm), group
      )
    }
  }
  do.call(rbind, rows)
}

#' One ARD row in the `{cards}` shape
#' @noRd
stat_row <- function(variable, group_level, stat_name, value, label, group) {
  data.frame(
    group1 = group,
    group1_level = group_level,
    variable = variable,
    variable_level = NA_character_,
    context = "ancova",
    stat_name = stat_name,
    stat_label = label,
    stat = value,
    warning = NA_character_,
    error = NA_character_,
    stringsAsFactors = FALSE
  )
}

#' Human-readable label for a model statistic
#'
#' The p-value is called `pval`, not `p`. `p` is reserved: the engine treats it as
#' a proportion and multiplies it by 100 on the way to the page, which would turn
#' 0.489 into 48.9.
#' @noRd
ancova_stat_label <- function(stat_name) {
  switch(stat_name,
    diff = "Difference of LS means",
    se = "Standard error",
    lcl = "Lower 95% confidence limit",
    ucl = "Upper 95% confidence limit",
    pval = "p-value",
    stat_name
  )
}
