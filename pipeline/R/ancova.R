#' Analysis-of-covariance statistics for a change-from-baseline endpoint
#'
#' The statistic behind the CDISCPILOT01 efficacy displays. Its shape is fixed
#' by that study's statistical analysis plan (SAP section 10.1.1), which is a
#' fact about the study rather than a choice made here:
#'
#' \itemize{
#'   \item an ANCOVA of the change from baseline with the baseline score, the
#'     pooled site group and treatment as independent variables;
#'   \item a test for dose response, fitting the same model with treatment as a
#'     *continuous* dose rather than a class variable, and reporting the
#'     p-value for a non-zero dose coefficient;
#'   \item pairwise differences of least-squares means between treatment
#'     levels, with standard errors, two-sided p-values and 95% confidence
#'     intervals, unadjusted for multiplicity.
#'   }
#'
#' A difference of least-squares means between two levels of the treatment
#' factor does not depend on the values the other terms are held at — the
#' covariate and site contributions cancel — so the contrast is computed
#' directly from the fitted coefficients and their covariance matrix and needs
#' no marginal-means machinery.
#'
#' This is a `custom:` statistic (contract section 2): a display reaches it
#' through a one-line wrapper in its own `custom.R`, and every model term is
#' declared in that display's `analysis.yaml` rather than hard-coded here.
#'
#' @param data The analysis dataset, already restricted to the analysis set and
#'   to the analysis entry's `filter`.
#' @param spec The analysis entry, with `group` set to the grouping column.
#'   Recognised keys: `response`, `treatment` (defaults to `group`),
#'   `treatment_levels`, `factors`, `covariates`, `dose`, `contrasts`,
#'   `conf_level`.
#' @param denominator Ignored; present for the `custom.R` calling contract.
#'
#' @return A data frame in the `{cards}` ARD shape.
#' @examples
#' \dontrun{
#' ard_ancova(week24, list(
#'   group = "TRTP", response = "CHG", covariates = "BASE", factors = "SITEGR1",
#'   dose = "TRTPN",
#'   contrasts = list(list(name = "dose_response", type = "dose", column = "Xanomeline High Dose"))
#' ))
#' }
#' @export
ard_ancova <- function(data, spec, denominator = NULL) {
  response <- spec$response %||% "CHG"
  treatment <- spec$treatment %||% spec$group[1]
  factors <- as.character(spec$factors %||% character(0))
  covariates <- as.character(spec$covariates %||% character(0))
  dose <- spec$dose
  conf <- as.numeric(spec$conf_level %||% 0.95)
  contrasts <- spec$contrasts %||% list()
  if (!length(contrasts)) {
    stop("ard_ancova(): the analysis entry declares no `contrasts`.", call. = FALSE)
  }

  df <- as.data.frame(data)
  needed <- unique(c(response, treatment, factors, covariates, dose))
  missing <- setdiff(needed, names(df))
  if (length(missing)) {
    stop(
      "ard_ancova(): the analysis dataset has no column(s): ",
      paste(missing, collapse = ", "), ".",
      call. = FALSE
    )
  }
  levs <- as.character(spec$treatment_levels %||% sort(unique(as.character(df[[treatment]]))))
  df[[treatment]] <- factor(as.character(df[[treatment]]), levels = levs)
  for (f in factors) df[[f]] <- factor(as.character(df[[f]]))
  df <- df[stats::complete.cases(df[, needed, drop = FALSE]), , drop = FALSE]
  if (!nrow(df)) {
    stop("ard_ancova(): no complete cases for the declared model terms.", call. = FALSE)
  }

  fit <- ancova_fit(df, response, c(covariates, factors, treatment))
  b <- stats::coef(fit)
  # A rank-deficient fit leaves aliased terms as NA coefficients, and vcov()
  # has already dropped them. Drop them here too, so a contrast that needs one
  # fails by name instead of silently producing NA.
  b <- b[!is.na(b)]
  V <- stats::vcov(fit)
  if (!identical(dim(V), c(length(b), length(b)))) {
    stop("ard_ancova(): the fitted model's coefficient and covariance dimensions disagree.", call. = FALSE)
  }
  dfree <- fit$df.residual
  dose_p <- if (!is.null(dose)) {
    d_fit <- ancova_fit(df, response, c(covariates, factors, dose))
    cf <- summary(d_fit)$coefficients
    if (!dose %in% rownames(cf)) {
      stop("ard_ancova(): the dose term '", dose, "' was aliased out of the model.", call. = FALSE)
    }
    unname(cf[dose, 4])
  } else {
    NULL
  }

  out <- list()
  for (k in contrasts) {
    if (is.null(k$name) || is.null(k$column)) {
      stop("ard_ancova(): every contrast needs `name` and `column`.", call. = FALSE)
    }
    type <- k$type %||% "pairwise"
    if (identical(type, "dose")) {
      if (is.null(dose_p)) {
        stop("ard_ancova(): contrast '", k$name, "' asks for the dose test but no `dose` is declared.", call. = FALSE)
      }
      out[[length(out) + 1]] <- ancova_rows(
        k$column, treatment, response, k$name,
        c(pvalue = dose_p, n_model = nrow(df))
      )
      next
    }
    cc <- ancova_contrast(b, treatment, k$test, k$reference, levs)
    est <- sum(cc * b)
    se <- sqrt(as.numeric(t(cc) %*% V %*% cc))
    tstat <- est / se
    p <- 2 * stats::pt(-abs(tstat), dfree)
    half <- stats::qt(1 - (1 - conf) / 2, dfree) * se
    out[[length(out) + 1]] <- ancova_rows(
      k$column, treatment, response, k$name,
      c(
        estimate = est, se = se, pvalue = p,
        lcl = est - half, ucl = est + half, n_model = nrow(df)
      )
    )
  }
  do.call(rbind, out)
}

#' Fit one ANCOVA (see [ard_ancova()])
#' @noRd
ancova_fit <- function(df, response, terms) {
  form <- stats::as.formula(paste(response, "~", paste(terms, collapse = " + ")))
  stats::lm(form, data = df)
}

#' Contrast vector for a difference of least-squares means (see [ard_ancova()])
#'
#' Treatment enters the model with treatment contrasts, so the coefficient for
#' a level is already that level's difference from the reference level; the
#' contrast between two non-reference levels is the difference of their
#' coefficients. The reference level itself has no coefficient and contributes
#' a zero column.
#' @noRd
ancova_contrast <- function(b, treatment, test, reference, levs) {
  if (is.null(test) || is.null(reference)) {
    stop("ard_ancova(): a pairwise contrast needs `test` and `reference`.", call. = FALSE)
  }
  for (lv in c(test, reference)) {
    if (!lv %in% levs) {
      stop(
        "ard_ancova(): '", lv, "' is not a declared treatment level (",
        paste(levs, collapse = ", "), ").",
        call. = FALSE
      )
    }
  }
  cc <- stats::setNames(rep(0, length(b)), names(b))
  bump <- function(cc, lv, sign) {
    if (identical(lv, levs[1])) {
      return(cc)
    }
    nm <- paste0(treatment, lv)
    if (!nm %in% names(cc)) {
      stop("ard_ancova(): the model has no term '", nm, "'.", call. = FALSE)
    }
    cc[nm] <- cc[nm] + sign
    cc
  }
  cc <- bump(cc, test, 1)
  bump(cc, reference, -1)
}

#' Assemble ARD rows for one contrast (see [ard_ancova()])
#' @noRd
ancova_rows <- function(column, treatment, response, contrast, stats_) {
  data.frame(
    group1 = treatment,
    group1_level = column,
    group2 = NA_character_,
    group2_level = NA_character_,
    variable = response,
    variable_level = contrast,
    context = "ancova",
    stat_name = names(stats_),
    stat_label = names(stats_),
    stat = unname(stats_),
    warning = NA_character_,
    error = NA_character_,
    stringsAsFactors = FALSE
  )
}

#' Subject count of a display's analysis population
#'
#' The column header of an efficacy display states the size of the population
#' the column describes, which is not always the number of records summarised
#' in it — Table 14-3.07 of the CDISCPILOT01 report heads a column `(N=60)`
#' and summarises 59 records, because one completer has no assessment inside
#' the Week 24 window. Counting distinct subjects in the population is
#' therefore a separate statistic from the `N` `{cards}` reports for a
#' summarised variable, and this is it.
#'
#' Declare it as a `custom:` analysis whose `filter` selects the population
#' (not the visit), so the count is over every record the population owns.
#'
#' @param data The analysis dataset, already restricted to the analysis set and
#'   to the analysis entry's `filter`.
#' @param spec The analysis entry, with `group` set to the grouping column.
#'   Recognised key: `id_var` (defaults to `USUBJID`).
#' @param denominator Ignored; present for the `custom.R` calling contract.
#'
#' @return A data frame in the `{cards}` ARD shape, one `N` row per group level.
#' @examples
#' \dontrun{
#' ard_population_n(efficacy, list(group = "TRTP"))
#' }
#' @export
ard_population_n <- function(data, spec, denominator = NULL) {
  id <- spec$id_var %||% "USUBJID"
  group <- spec$group
  df <- as.data.frame(data)
  if (!id %in% names(df)) {
    stop("ard_population_n(): the analysis dataset has no column '", id, "'.", call. = FALSE)
  }
  if (!length(group)) {
    levels_ <- NA_character_
    counts <- length(unique(df[[id]]))
  } else {
    g <- as.character(df[[group[1]]])
    keep <- !is.na(g)
    levels_ <- if (is.factor(df[[group[1]]])) levels(df[[group[1]]]) else sort(unique(g[keep]))
    counts <- vapply(levels_, function(lv) length(unique(df[[id]][keep & g == lv])), numeric(1))
  }
  data.frame(
    group1 = if (length(group)) group[1] else NA_character_,
    group1_level = levels_,
    group2 = NA_character_,
    group2_level = NA_character_,
    variable = id,
    variable_level = NA_character_,
    context = "population",
    stat_name = "N",
    stat_label = "N",
    stat = unname(counts),
    warning = NA_character_,
    error = NA_character_,
    stringsAsFactors = FALSE
  )
}
