#' Mixed model for repeated measures on a change-from-baseline endpoint
#'
#' The supportive analysis CDISCPILOT01's statistical analysis plan asks for
#' alongside the LOCF primary (SAP section 10.1.1): a likelihood-based repeated
#' measures model of the change from baseline, with
#'
#' \itemize{
#'   \item the fixed categorical effects of treatment, site group, visit and
#'     treatment-by-visit;
#'   \item the continuous effect of the baseline score and its interaction with
#'     visit;
#'   \item an unstructured within-subject covariance matrix, fitted by REML.
#'   }
#'
#' Every one of those terms is declared in the display's `analysis.yaml`, not
#' written here: `factors`, `covariates`, `visit`, `visit_interactions` and
#' `treatment` name the columns, and this function assembles the formula. The
#' model is fitted with [nlme::gls()] using `corSymm` (the unstructured
#' correlation) and `varIdent` (a free variance per visit), which is the same
#' parameterisation SAS `PROC MIXED ... type=un` fits.
#'
#' @section Least-squares means:
#'
#' A least-squares mean is the model's prediction averaged over the balanced
#' population of the classification effects it does not condition on — every
#' site group weighted equally — with continuous covariates held at their mean
#' over the records the model was fitted to. It is computed here by building the
#' design-matrix row for each combination, averaging those rows into a single
#' contrast vector, and applying it to the fitted coefficients and their
#' covariance. That is the definition, applied directly, rather than a
#' re-implementation of any particular package's marginal-means machinery.
#'
#' `lsmeans_over` chooses which visits are averaged into that population:
#' `"all"` (the default) averages over every visit in the model and produces
#' the treatment main-effect least-squares mean; naming a visit level conditions
#' on it instead. The two answer different questions and are not interchangeable
#' — see the note in the CDISCPILOT01 display that uses this.
#'
#' @section What this does not implement:
#'
#' Standard errors and degrees of freedom are the model-based ones: the
#' contrast's variance from the fitted covariance matrix, on the residual
#' degrees of freedom. SAS's `PROC MIXED` defaults for a repeated-measures model
#' — Kenward-Roger degrees of freedom with Prasad-Rao-Jeske-Kackar-Harville
#' standard errors — inflate both slightly to account for the covariance
#' parameters having been estimated rather than known. Not implementing them is
#' a deliberate scope decision and the display that uses this function states
#' the measured size of the difference in its own footnotes.
#'
#' @param data The analysis dataset, already restricted to the analysis set and
#'   to the analysis entry's `filter`.
#' @param spec The analysis entry. Recognised keys: `response`, `subject`,
#'   `visit`, `visit_levels`, `treatment` (defaults to `group`),
#'   `treatment_levels`, `factors`, `covariates`, `visit_interactions`,
#'   `conf_level`, `lsmeans_over`, `contrasts`.
#' @param denominator Ignored; present for the `custom.R` calling contract.
#'
#' @return A data frame in the `{cards}` ARD shape: one `lsmean`/`se` pair per
#'   treatment level, plus `estimate`, `se`, `pvalue`, `lcl` and `ucl` for each
#'   declared contrast, and the fitted covariance parameters as a record of what
#'   was actually fitted.
#' @examples
#' \dontrun{
#' ard_mmrm(observed, list(
#'   response = "CHG", subject = "USUBJID", visit = "AVISITN",
#'   treatment = "TRTP", factors = "SITEGR1", covariates = "BASE",
#'   visit_interactions = c("BASE", "TRTP"),
#'   contrasts = list(list(name = "xan_vs_placebo", test = "Xanomeline Low Dose",
#'                         reference = "Placebo", column = "Xanomeline Low Dose"))
#' ))
#' }
#' @export
ard_mmrm <- function(data, spec, denominator = NULL) {
  if (!requireNamespace("nlme", quietly = TRUE)) {
    stop("ard_mmrm(): the 'nlme' package is required.", call. = FALSE)
  }
  response <- spec$response %||% "CHG"
  treatment <- spec$treatment %||% spec$group[1]
  subject <- spec$subject %||% "USUBJID"
  visit <- spec$visit %||% "AVISITN"
  factors <- as.character(spec$factors %||% character(0))
  covariates <- as.character(spec$covariates %||% character(0))
  inter <- as.character(spec$visit_interactions %||% character(0))
  conf <- as.numeric(spec$conf_level %||% 0.95)
  contrasts <- spec$contrasts %||% list()

  df <- as.data.frame(data)
  needed <- unique(c(response, treatment, subject, visit, factors, covariates))
  missing <- setdiff(needed, names(df))
  if (length(missing)) {
    stop(
      "ard_mmrm(): the analysis dataset has no column(s): ",
      paste(missing, collapse = ", "), ".",
      call. = FALSE
    )
  }
  df <- df[stats::complete.cases(df[, needed, drop = FALSE]), , drop = FALSE]
  if (!nrow(df)) {
    stop("ard_mmrm(): no complete cases for the declared model terms.", call. = FALSE)
  }

  tlev <- as.character(spec$treatment_levels %||% sort(unique(as.character(df[[treatment]]))))
  df[[treatment]] <- factor(as.character(df[[treatment]]), levels = tlev)
  vlev <- as.character(spec$visit_levels %||% sort(unique(df[[visit]])))
  vcol <- ".opencsr_visit"
  df[[vcol]] <- factor(as.character(df[[visit]]), levels = vlev)
  if (anyNA(df[[vcol]]) || anyNA(df[[treatment]])) {
    stop("ard_mmrm(): a record falls outside the declared `visit_levels` or `treatment_levels`.", call. = FALSE)
  }
  for (f in factors) df[[f]] <- factor(as.character(df[[f]]))
  idx <- ".opencsr_vidx"
  df[[idx]] <- as.integer(df[[vcol]])
  df <- df[order(as.character(df[[subject]]), df[[idx]]), , drop = FALSE]
  if (anyDuplicated(paste(df[[subject]], df[[idx]]))) {
    stop(
      "ard_mmrm(): a subject has more than one record at the same visit. ",
      "The within-subject covariance is indexed by visit, so the records must be unique.",
      call. = FALSE
    )
  }

  # response ~ <covariate>*visit ... + <treatment>*visit + <factor> ...
  terms_ <- c(
    vapply(covariates, function(v) if (v %in% inter) paste0(v, " * ", vcol) else v, character(1)),
    if (treatment %in% inter) paste0(treatment, " * ", vcol) else c(treatment, vcol),
    factors
  )
  form <- stats::as.formula(paste(response, "~", paste(unique(terms_), collapse = " + ")))
  fit <- nlme::gls(
    form,
    data = df,
    correlation = nlme::corSymm(form = stats::as.formula(paste0("~ ", idx, " | ", subject))),
    weights = nlme::varIdent(form = stats::as.formula(paste0("~ 1 | ", vcol))),
    method = "REML",
    control = nlme::glsControl(opt = "optim", msMaxIter = 500)
  )

  b <- stats::coef(fit)
  V <- stats::vcov(fit)
  dfree <- fit$dims$N - fit$dims$p
  rhs <- stats::formula(fit)[-2]

  over <- as.character(spec$lsmeans_over %||% "all")
  ls_visits <- if (identical(over, "all")) vlev else over
  bad <- setdiff(ls_visits, vlev)
  if (length(bad)) {
    stop("ard_mmrm(): `lsmeans_over` names visit(s) not in the model: ", paste(bad, collapse = ", "), ".", call. = FALSE)
  }

  ls_vector <- function(trt) {
    grid <- c(
      lapply(stats::setNames(factors, factors), function(f) levels(df[[f]])),
      stats::setNames(list(ls_visits), vcol)
    )
    nd <- expand.grid(grid, stringsAsFactors = FALSE)
    for (f in factors) nd[[f]] <- factor(nd[[f]], levels = levels(df[[f]]))
    nd[[vcol]] <- factor(nd[[vcol]], levels = vlev)
    nd[[treatment]] <- factor(trt, levels = tlev)
    for (v in covariates) nd[[v]] <- mean(df[[v]])
    colMeans(stats::model.matrix(rhs, data = nd))
  }
  Lv <- lapply(tlev, ls_vector)
  names(Lv) <- tlev

  rows <- function(column, level, stats_) {
    data.frame(
      group1 = treatment, group1_level = column,
      group2 = NA_character_, group2_level = NA_character_,
      variable = response, variable_level = level, context = "mmrm",
      stat_name = names(stats_), stat_label = names(stats_),
      stat = unname(stats_), warning = NA_character_, error = NA_character_,
      stringsAsFactors = FALSE
    )
  }

  out <- list()
  for (t in tlev) {
    est <- sum(Lv[[t]] * b)
    se <- sqrt(as.numeric(t(Lv[[t]]) %*% V %*% Lv[[t]]))
    out[[length(out) + 1]] <- rows(t, "lsmean", c(estimate = est, se = se))
  }
  for (k in contrasts) {
    if (is.null(k$name) || is.null(k$column) || is.null(k$test) || is.null(k$reference)) {
      stop("ard_mmrm(): every contrast needs `name`, `column`, `test` and `reference`.", call. = FALSE)
    }
    for (lv in c(k$test, k$reference)) {
      if (!lv %in% tlev) {
        stop("ard_mmrm(): '", lv, "' is not a declared treatment level.", call. = FALSE)
      }
    }
    cc <- Lv[[k$test]] - Lv[[k$reference]]
    est <- sum(cc * b)
    se <- sqrt(as.numeric(t(cc) %*% V %*% cc))
    p <- 2 * stats::pt(-abs(est / se), dfree)
    half <- stats::qt(1 - (1 - conf) / 2, dfree) * se
    out[[length(out) + 1]] <- rows(k$column, k$name, c(
      estimate = est, se = se, pvalue = p,
      lcl = est - half, ucl = est + half
    ))
  }

  # The fitted covariance parameters and the REML criterion are carried into the
  # ARD as data. They are what makes the fit checkable against another
  # implementation: two programs can agree on a rounded LS mean by accident, and
  # cannot agree on six covariance parameters and a log-likelihood by accident.
  cov_par <- mmrm_covariance(fit, vlev)
  out[[length(out) + 1]] <- rows(NA_character_, "model", c(
    stats::setNames(cov_par$value, cov_par$name),
    n_obs = fit$dims$N, n_subjects = length(unique(df[[subject]])),
    df_residual = dfree, reml_criterion = -2 * as.numeric(fit$logLik)
  ))
  do.call(rbind, out)
}

#' Unstructured covariance estimates from a fitted [nlme::gls()] model
#'
#' Reassembles the visit-by-visit covariance matrix from the correlation
#' structure and the per-visit variance weights, named the way SAS prints it
#' (`UN(i,j)`) so the two can be compared without a translation step.
#' @noRd
mmrm_covariance <- function(fit, vlev) {
  k <- length(vlev)
  # varIdent reports a ratio for every stratum except the reference one, named
  # by stratum. Aligning by name rather than by position means a change in the
  # reference stratum cannot silently pair a variance with the wrong visit.
  w <- stats::coef(fit$modelStruct$varStruct, unconstrained = FALSE)
  ratio <- stats::setNames(rep(1, k), vlev)
  if (length(w)) ratio[names(w)] <- w
  s <- as.numeric(fit$sigma) * unname(ratio[vlev])
  cr <- nlme::corMatrix(fit$modelStruct$corStruct)
  cr <- if (is.list(cr)) cr[[which.max(vapply(cr, nrow, integer(1)))]] else cr
  V <- diag(s, nrow = k) %*% cr %*% diag(s, nrow = k)
  nm <- c()
  val <- c()
  for (j in seq_len(k)) {
    for (i in j:k) {
      nm <- c(nm, sprintf("UN(%d,%d)", i, j))
      val <- c(val, V[i, j])
    }
  }
  list(name = nm, value = val)
}
