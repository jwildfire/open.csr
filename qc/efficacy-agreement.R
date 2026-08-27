#!/usr/bin/env Rscript
# Do the efficacy displays report the right numbers?
#
# Nine displays in this library publish the CDISCPILOT01 efficacy results. This
# script measures every figure in them a second time and fails if any
# measurement moves.
#
# THREE ROUTES, AND WHAT EACH IS WORTH
#
#   A  the pipeline          library/tfl/<slug>/*.yaml -> build_ard() -> the
#                            committed outputs/<slug>/vNNN/ard.json. Read here,
#                            never recomputed here.
#
#   B  this script           the vendored .xpt.gz read directly with {haven},
#                            every statistic recomputed in base R. It does NOT
#                            load {opencsr}: not the filters, not the analysis
#                            set, not the summary statistics, and not the
#                            ANCOVA — whose coefficients are obtained here by an
#                            explicit design matrix and a QR solve rather than
#                            through lm(), so the two routes do not even share a
#                            fitting function.
#
#   C  the reference report  the CDISC pilot's own published Section 14 tables,
#                            computed in SAS by different people in 2006-2007,
#                            recorded in quality/data/efficacy-reference.json.
#                            This shares no code with anything.
#
# A and B are independent implementations of the same specification; C is an
# independent implementation of the same *study*. Agreement of A with B says the
# pipeline computes what we think it computes. Agreement of A with C says what
# we think it computes is what the study reported.
#
# THE ONE PLACE THIS IS WEAKER, STATED PLAINLY
#
# For the repeated-measures display (t-eff-adas-mmrm) route B is not a second
# mixed-model implementation: fitting an unstructured MMRM twice in R would
# share {nlme} with the pipeline and prove little. Its second route is C — the
# reference report ships its own PROC MIXED output, so the six covariance
# parameters, the REML criterion and the observation counts are all compared
# against SAS. That is a stronger independent check than a second R fit, not a
# weaker one, but it is a different kind of check and is labelled as such in the
# record. Route B still checks that display's record selection independently.
#
# AND THIS SCRIPT IS NOT THE GATE THAT ENFORCES IT. Measured 2026-08-27, by
# changing one figure at a time in the committed ARD and running both gates:
#
#   * Change a printed MMRM figure — an LS mean, a treatment difference, a
#     confidence limit, a p-value, or the REML criterion — then re-run this
#     script with --write and again without it. It prints "All efficacy figures
#     agree across every route that is compared" and exits 0. Every time.
#   * The same change fails DSP-EFF-009 in pipeline/tests/testthat/
#     test-displays-efficacy.R, which pins the record's five declared
#     reference differences string by string. A changed sixth cell makes six
#     differences; a changed one of the five rewrites its string. Both fail.
#
# So the display IS guarded, and CI runs the gate that guards it. What is wrong
# is this script's closing sentence, which reads as coverage it does not have.
# The MMRM's published cells are compared by the testthat suite, not here. Do
# not read a green run of this script as having checked Table 14-3.11, and do
# not add that comparison to the summary count without adding the comparison
# itself first.
#
# Usage:
#   Rscript qc/efficacy-agreement.R            # check; exit 1 on disagreement
#   Rscript qc/efficacy-agreement.R --write    # rewrite the committed record

args <- commandArgs(trailingOnly = TRUE)
write_mode <- "--write" %in% args

suppressWarnings(suppressMessages({
  library(haven)
  library(jsonlite)
}))

root <- getwd()
while (!file.exists(file.path(root, "docs", "design", "contracts.md"))) {
  parent <- dirname(root)
  if (identical(parent, root)) stop("Could not locate the open.csr repository root.")
  root <- parent
}
vendor <- file.path(root, "pipeline", "inst", "extdata", "phuse-cdiscpilot01")
record_path <- file.path(root, "quality", "data", "efficacy-agreement.json")
reference_path <- file.path(root, "quality", "data", "efficacy-reference.json")

# ---- route B: the data, read and prepared without {opencsr} -----------------

read_vendored <- function(name) {
  path <- file.path(vendor, paste0(name, ".xpt.gz"))
  as.data.frame(haven::read_xpt(
    memDecompress(readBin(path, "raw", file.size(path)), type = "gzip")
  ))
}

ARMS <- c("Placebo", "Xanomeline Low Dose", "Xanomeline High Dose")

adas <- read_vendored("adqsadas")
npix <- read_vendored("adqsnpix")
# ADQSNPIX ships AVISIT right-aligned in a fixed-width field. Nothing here keys
# on AVISIT — visits are selected by AVISITN — but the whitespace is stripped so
# a future reader of this script is not misled by it.
npix$AVISIT <- trimws(npix$AVISIT)
adas$AVISIT <- trimws(adas$AVISIT)

eff <- function(df) df[df$EFFFL == "Y", , drop = FALSE]

# ---- route B: statistics ----------------------------------------------------

# SAS-compatible half-up rounding, so a value ending in exactly .5 lands where
# the display puts it. base::round() rounds half to even and would disagree with
# the pipeline on cells like the NPI-X placebo maximum of 64.5.
round_hu <- function(x, d = 0) {
  z <- abs(x) * 10^d
  sign(x) * trunc(z + 0.5 + 1e-9) / 10^d
}

summ <- function(x) {
  x <- x[!is.na(x)]
  list(n = length(x), mean = mean(x), sd = stats::sd(x),
       median = stats::median(x), min = min(x), max = max(x))
}

#' ANCOVA by explicit design matrix and QR solve.
#'
#' Deliberately not lm(): the pipeline uses lm() and stats::vcov(), so a second
#' route through those functions would share the arithmetic that matters. Here
#' the design matrix is assembled by hand with treatment-contrast dummies, the
#' coefficients come from qr.solve(), and the residual variance and the contrast
#' variance are formed directly from (X'X)^-1.
ancova_B <- function(df, response, covariates, factors, treatment = NULL, levels_ = NULL) {
  df <- df[stats::complete.cases(df[, c(response, covariates, factors, treatment), drop = FALSE]), ]
  y <- as.numeric(df[[response]])
  X <- matrix(1, nrow = nrow(df), ncol = 1, dimnames = list(NULL, "(Intercept)"))
  for (v in covariates) X <- cbind(X, stats::setNames(data.frame(as.numeric(df[[v]])), v))
  X <- as.matrix(X)
  dummies <- function(col, lv) {
    lv <- lv[-1]
    out <- vapply(lv, function(l) as.numeric(as.character(col) == l), numeric(length(col)))
    if (is.null(dim(out))) out <- matrix(out, ncol = length(lv))
    colnames(out) <- lv
    out
  }
  for (f in factors) {
    lv <- sort(unique(as.character(df[[f]])))
    d <- dummies(df[[f]], lv)
    colnames(d) <- paste0(f, colnames(d))
    X <- cbind(X, d)
  }
  if (!is.null(treatment) && length(levels_) > 1) {
    dt <- dummies(df[[treatment]], levels_)
    colnames(dt) <- paste0(treatment, colnames(dt))
    X <- cbind(X, dt)
  }
  qrX <- qr(X)
  beta <- qr.coef(qrX, y)
  keep <- !is.na(beta)
  X <- X[, keep, drop = FALSE]
  beta <- beta[keep]
  XtXinv <- chol2inv(chol(crossprod(X)))
  dimnames(XtXinv) <- list(colnames(X), colnames(X))
  resid <- y - as.numeric(X %*% beta)
  dfree <- nrow(X) - ncol(X)
  s2 <- sum(resid^2) / dfree
  list(beta = beta, V = s2 * XtXinv, df = dfree, treatment = treatment, levels = levels_)
}

ancova_contrast_B <- function(fit, test, reference, conf = 0.95) {
  cc <- stats::setNames(rep(0, length(fit$beta)), names(fit$beta))
  bump <- function(cc, lv, s) {
    if (identical(lv, fit$levels[1])) return(cc)
    cc[paste0(fit$treatment, lv)] <- cc[paste0(fit$treatment, lv)] + s
    cc
  }
  cc <- bump(bump(cc, test, 1), reference, -1)
  est <- sum(cc * fit$beta)
  se <- sqrt(as.numeric(t(cc) %*% fit$V %*% cc))
  half <- stats::qt(1 - (1 - conf) / 2, fit$df) * se
  list(estimate = est, se = se, pvalue = 2 * stats::pt(-abs(est / se), fit$df),
       lcl = est - half, ucl = est + half)
}

dose_p_B <- function(df, response, covariates, factors, dose) {
  # The dose-response test refits with treatment as a continuous dose rather
  # than a class variable, and reports the p-value for a non-zero slope.
  fit <- ancova_B(df, response, c(covariates, dose), factors)
  b <- fit$beta[[dose]]
  se <- sqrt(fit$V[dose, dose])
  2 * stats::pt(-abs(b / se), fit$df)
}

# ---- route B: the display definitions, restated independently ---------------

adas_eff <- eff(adas)
adas_eff <- adas_eff[adas_eff$PARAMCD == "ACTOT", , drop = FALSE]
observed <- function(df) df[!(df$DTYPE %in% "LOCF"), , drop = FALSE]

ancova_style <- function(df_visit, df_pop) {
  out <- list()
  out$column_N <- vapply(ARMS, function(a) length(unique(df_pop$USUBJID[df_pop$TRTP == a])), numeric(1))
  for (sec in c("baseline", "mid", "change")) {
    v <- switch(sec, baseline = "BASE", mid = "AVAL", change = "CHG")
    for (st in c("n", "mean", "sd", "median", "min", "max")) {
      out[[paste0(sec, ".", st)]] <- vapply(ARMS, function(a) {
        as.numeric(summ(df_visit[[v]][df_visit$TRTP == a])[[st]])
      }, numeric(1))
    }
  }
  fit <- ancova_B(df_visit, "CHG", "BASE", "SITEGR1", "TRTP", ARMS)
  lo <- ancova_contrast_B(fit, ARMS[2], ARMS[1])
  hi <- ancova_contrast_B(fit, ARMS[3], ARMS[1])
  hl <- ancova_contrast_B(fit, ARMS[3], ARMS[2])
  out$p_dose <- dose_p_B(df_visit, "CHG", "BASE", "SITEGR1", "TRTPN")
  out$p_xan_placebo <- c(lo$pvalue, hi$pvalue)
  out$diff_xan_placebo <- list(c(lo$estimate, lo$se), c(hi$estimate, hi$se))
  out$ci_xan_placebo <- list(c(lo$lcl, lo$ucl), c(hi$lcl, hi$ucl))
  out$p_high_low <- hl$pvalue
  out$diff_high_low <- list(c(hl$estimate, hl$se))
  out$ci_high_low <- list(c(hl$lcl, hl$ucl))
  out
}

route_B <- list()

for (spec in list(
  list(slug = "t-eff-adas-wk24", visit = 24, extra = NULL),
  list(slug = "t-eff-adas-wk8", visit = 8, extra = NULL),
  list(slug = "t-eff-adas-wk16", visit = 16, extra = NULL)
)) {
  v <- adas_eff[adas_eff$ANL01FL == "Y" & adas_eff$AVISITN == spec$visit, ]
  route_B[[spec$slug]] <- ancova_style(v, adas_eff)
}

# 14-3.07: Week-24 completers, observed cases inside the visit window. The
# population is every completer; the summarised records are only those with an
# assessment in the window, which is why n is below N.
comp <- adas_eff[adas_eff$COMP24FL == "Y", ]
route_B[["t-eff-adas-wk24-completers"]] <-
  ancova_style(observed(comp[comp$ANL01FL == "Y" & comp$AVISITN == 24, ]), comp)

for (sx in list(list(slug = "t-eff-adas-wk24-male", sex = "M"),
                list(slug = "t-eff-adas-wk24-female", sex = "F"))) {
  s <- adas_eff[adas_eff$SEX == sx$sex, ]
  route_B[[sx$slug]] <- ancova_style(s[s$ANL01FL == "Y" & s$AVISITN == 24, ], s)
}

# 14-3.10: per arm and visit row, the thirteen statistics the reference prints.
overtime_B <- list()
for (a in ARMS) {
  arm <- adas_eff[adas_eff$TRTP == a, ]
  rows <- list()
  b <- summ(arm$AVAL[arm$AVISITN == 0])
  rows[["Baseline"]] <- c(b$n, b$mean, b$sd, b$median, b$min, b$max)
  for (w in c(8, 16, 24)) {
    for (lane in c("Windowed", "LOCF")) {
      d <- arm[arm$ANL01FL == "Y" & arm$AVISITN == w, ]
      if (lane == "Windowed") d <- observed(d)
      s1 <- summ(d$AVAL); s2 <- summ(d$BASE); s3 <- summ(d$CHG)
      lab <- if (lane == "Windowed") sprintf("Week %d (Windowed)", w) else sprintf("Week %d LOCF", w)
      rows[[lab]] <- c(s1$n, s1$mean, s1$sd, s1$median, s1$min, s1$max,
                       s2$mean, s2$sd,
                       s3$mean, s3$sd, s3$median, s3$min, s3$max)
    }
  }
  overtime_B[[a]] <- rows
}
route_B[["t-eff-adas-overtime"]] <- overtime_B

# 14-3.11: route B checks the record selection only; the model's second route is
# the reference report's own PROC MIXED output (see the header).
mmrm_records <- observed(adas_eff[adas_eff$ANL01FL == "Y" & adas_eff$AVISITN %in% c(8, 16, 24), ])
route_B[["t-eff-adas-mmrm"]] <- list(
  n_obs = nrow(mmrm_records),
  n_subjects = length(unique(mmrm_records$USUBJID)),
  column_N = vapply(ARMS, function(a) length(unique(adas_eff$USUBJID[adas_eff$TRTP == a])), numeric(1))
)

# 14-3.12: the SAP's own definition — one mean per subject over the Weeks 4-24
# windows — derived here in base R with no reference to the pipeline's derive
# block, and the study's own NPTOTMN parameter measured beside it so the
# divergence the display declares stays measured rather than remembered.
npix_eff <- eff(npix)
base_np <- npix_eff[npix_eff$PARAMCD == "NPTOT" & npix_eff$AVISITN == 0, ]
span <- npix_eff[npix_eff$PARAMCD == "NPTOT" & npix_eff$ANL01FL == "Y" &
                   npix_eff$AVISITN >= 4 & npix_eff$AVISITN <= 24, ]
agg <- do.call(rbind, lapply(split(span, span$USUBJID), function(g) data.frame(
  USUBJID = g$USUBJID[1], TRTP = g$TRTP[1], TRTPN = g$TRTPN[1],
  SITEGR1 = g$SITEGR1[1], BASE = g$BASE[1],
  AVAL = mean(g$AVAL, na.rm = TRUE), n_assess = sum(!is.na(g$AVAL)),
  stringsAsFactors = FALSE
)))
npix_out <- list()
npix_out$column_N <- vapply(ARMS, function(a) length(unique(base_np$USUBJID[base_np$TRTP == a])), numeric(1))
for (st in c("n", "mean", "sd", "median", "min", "max")) {
  npix_out[[paste0("baseline.", st)]] <-
    vapply(ARMS, function(a) as.numeric(summ(base_np$AVAL[base_np$TRTP == a])[[st]]), numeric(1))
  npix_out[[paste0("mid.", st)]] <-
    vapply(ARMS, function(a) as.numeric(summ(agg$AVAL[agg$TRTP == a])[[st]]), numeric(1))
}
fit <- ancova_B(agg, "AVAL", "BASE", "SITEGR1", "TRTP", ARMS)
lo <- ancova_contrast_B(fit, ARMS[2], ARMS[1])
hi <- ancova_contrast_B(fit, ARMS[3], ARMS[1])
hl <- ancova_contrast_B(fit, ARMS[3], ARMS[2])
npix_out$p_dose <- dose_p_B(agg, "AVAL", "BASE", "SITEGR1", "TRTPN")
npix_out$p_xan_placebo <- c(lo$pvalue, hi$pvalue)
npix_out$diff_xan_placebo <- list(c(lo$estimate, lo$se), c(hi$estimate, hi$se))
npix_out$ci_xan_placebo <- list(c(lo$lcl, lo$ucl), c(hi$lcl, hi$ucl))
npix_out$p_high_low <- hl$pvalue
npix_out$diff_high_low <- list(c(hl$estimate, hl$se))
npix_out$ci_high_low <- list(c(hl$lcl, hl$ucl))
shipped <- npix_eff[npix_eff$PARAMCD == "NPTOTMN" & npix_eff$AVISITN == 98, ]
npix_out$nptotmn_divergence <- list(
  sap_literal_subjects = nrow(agg),
  nptotmn_subjects = nrow(shipped),
  omitted_by_nptotmn = length(setdiff(agg$USUBJID, shipped$USUBJID)),
  added_by_nptotmn = length(setdiff(shipped$USUBJID, agg$USUBJID)),
  omitted_assessment_counts = as.list(table(agg$n_assess[!agg$USUBJID %in% shipped$USUBJID])),
  nptotmn_n = vapply(ARMS, function(a) sum(shipped$TRTP == a), numeric(1))
)
route_B[["t-eff-npix-mean"]] <- npix_out

# ---- route A: the committed ARDs, read straight off disk --------------------

ard_rows <- function(slug) {
  cur <- jsonlite::fromJSON(file.path(root, "outputs", slug, "current.json"))
  jsonlite::fromJSON(file.path(root, cur$ard), simplifyVector = TRUE)$rows
}

pick <- function(rows, analysis, stat, level = NULL, variable = NULL, group = NULL) {
  k <- rows$analysis == analysis & rows$stat_name == stat
  if (!is.null(level)) k <- k & !is.na(rows$variable_level) & rows$variable_level == level
  if (!is.null(variable)) k <- k & rows$variable == variable
  if (!is.null(group)) k <- k & !is.na(rows$group1_level) & rows$group1_level == group
  v <- rows$stat[k]
  if (length(v) != 1) {
    stop(sprintf("ARD selection matched %d rows (analysis=%s stat=%s level=%s variable=%s group=%s)",
                 length(v), analysis, stat, level %||% "-", variable %||% "-", group %||% "-"),
         call. = FALSE)
  }
  as.numeric(unlist(v))
}
`%||%` <- function(a, b) if (is.null(a)) b else a

route_A <- list()
ancova_style_A <- function(rows, mid_analysis) {
  out <- list()
  out$column_N <- vapply(ARMS, function(a) pick(rows, "population", "N", group = a), numeric(1))
  for (sec in c("baseline", "mid", "change")) {
    v <- switch(sec, baseline = "BASE", mid = "AVAL", change = "CHG")
    for (st in c("N", "mean", "sd", "median", "min", "max")) {
      out[[paste0(sec, ".", tolower(gsub("^N$", "n", st)))]] <-
        vapply(ARMS, function(a) pick(rows, mid_analysis, st, variable = v, group = a), numeric(1))
    }
  }
  g <- function(st, lvl, col) pick(rows, "ancova", st, level = lvl, group = col)
  out$p_dose <- g("pvalue", "dose_response", ARMS[3])
  out$p_xan_placebo <- c(g("pvalue", "xan_vs_placebo", ARMS[2]), g("pvalue", "xan_vs_placebo", ARMS[3]))
  out$diff_xan_placebo <- list(
    c(g("estimate", "xan_vs_placebo", ARMS[2]), g("se", "xan_vs_placebo", ARMS[2])),
    c(g("estimate", "xan_vs_placebo", ARMS[3]), g("se", "xan_vs_placebo", ARMS[3])))
  out$ci_xan_placebo <- list(
    c(g("lcl", "xan_vs_placebo", ARMS[2]), g("ucl", "xan_vs_placebo", ARMS[2])),
    c(g("lcl", "xan_vs_placebo", ARMS[3]), g("ucl", "xan_vs_placebo", ARMS[3])))
  out$p_high_low <- g("pvalue", "high_vs_low", ARMS[3])
  out$diff_high_low <- list(c(g("estimate", "high_vs_low", ARMS[3]), g("se", "high_vs_low", ARMS[3])))
  out$ci_high_low <- list(c(g("lcl", "high_vs_low", ARMS[3]), g("ucl", "high_vs_low", ARMS[3])))
  out
}
for (slug in c("t-eff-adas-wk24", "t-eff-adas-wk8", "t-eff-adas-wk16",
               "t-eff-adas-wk24-completers", "t-eff-adas-wk24-male", "t-eff-adas-wk24-female")) {
  route_A[[slug]] <- ancova_style_A(ard_rows(slug), "summary")
}
{
  rows <- ard_rows("t-eff-npix-mean")
  out <- list()
  out$column_N <- vapply(ARMS, function(a) pick(rows, "population", "N", group = a), numeric(1))
  for (st in c("N", "mean", "sd", "median", "min", "max")) {
    nm <- tolower(gsub("^N$", "n", st))
    out[[paste0("baseline.", nm)]] <- vapply(ARMS, function(a) pick(rows, "baseline", st, variable = "AVAL", group = a), numeric(1))
    out[[paste0("mid.", nm)]] <- vapply(ARMS, function(a) pick(rows, "mean_4_24", st, variable = "AVAL", group = a), numeric(1))
  }
  g <- function(st, lvl, col) pick(rows, "ancova", st, level = lvl, group = col)
  out$p_dose <- g("pvalue", "dose_response", ARMS[3])
  out$p_xan_placebo <- c(g("pvalue", "xan_vs_placebo", ARMS[2]), g("pvalue", "xan_vs_placebo", ARMS[3]))
  out$diff_xan_placebo <- list(c(g("estimate", "xan_vs_placebo", ARMS[2]), g("se", "xan_vs_placebo", ARMS[2])),
                               c(g("estimate", "xan_vs_placebo", ARMS[3]), g("se", "xan_vs_placebo", ARMS[3])))
  out$ci_xan_placebo <- list(c(g("lcl", "xan_vs_placebo", ARMS[2]), g("ucl", "xan_vs_placebo", ARMS[2])),
                             c(g("lcl", "xan_vs_placebo", ARMS[3]), g("ucl", "xan_vs_placebo", ARMS[3])))
  out$p_high_low <- g("pvalue", "high_vs_low", ARMS[3])
  out$diff_high_low <- list(c(g("estimate", "high_vs_low", ARMS[3]), g("se", "high_vs_low", ARMS[3])))
  out$ci_high_low <- list(c(g("lcl", "high_vs_low", ARMS[3]), g("ucl", "high_vs_low", ARMS[3])))
  route_A[["t-eff-npix-mean"]] <- out
}
{
  rows <- ard_rows("t-eff-adas-overtime")
  o <- list()
  for (a in ARMS) {
    r <- list()
    r[["Baseline"]] <- c(pick(rows, "baseline", "N", variable = "AVAL", group = a),
                         vapply(c("mean", "sd", "median", "min", "max"),
                                function(s) pick(rows, "baseline", s, variable = "AVAL", group = a), numeric(1)))
    for (w in c(8, 16, 24)) for (lane in c("win", "locf")) {
      an <- sprintf("wk%d_%s", w, lane)
      lab <- if (lane == "win") sprintf("Week %d (Windowed)", w) else sprintf("Week %d LOCF", w)
      r[[lab]] <- c(
        pick(rows, an, "N", variable = "AVAL", group = a),
        vapply(c("mean", "sd", "median", "min", "max"), function(s) pick(rows, an, s, variable = "AVAL", group = a), numeric(1)),
        vapply(c("mean", "sd"), function(s) pick(rows, an, s, variable = "BASE", group = a), numeric(1)),
        vapply(c("mean", "sd", "median", "min", "max"), function(s) pick(rows, an, s, variable = "CHG", group = a), numeric(1)))
    }
    o[[a]] <- r
  }
  route_A[["t-eff-adas-overtime"]] <- o
}
{
  rows <- ard_rows("t-eff-adas-mmrm")
  m <- function(s) pick(rows, "mmrm", s, level = "model")
  route_A[["t-eff-adas-mmrm"]] <- list(
    n_obs = m("n_obs"), n_subjects = m("n_subjects"),
    df_residual = m("df_residual"), reml_criterion = m("reml_criterion"),
    covariance = vapply(c("UN(1,1)", "UN(2,1)", "UN(2,2)", "UN(3,1)", "UN(3,2)", "UN(3,3)"),
                        function(s) m(s), numeric(1)),
    column_N = vapply(ARMS, function(a) pick(rows, "population", "N", group = a), numeric(1)),
    lsmean = lapply(ARMS, function(a) c(pick(rows, "mmrm", "estimate", level = "lsmean", group = a),
                                        pick(rows, "mmrm", "se", level = "lsmean", group = a))),
    p_xan_placebo = c(pick(rows, "mmrm", "pvalue", level = "xan_vs_placebo", group = ARMS[2]),
                      pick(rows, "mmrm", "pvalue", level = "xan_vs_placebo", group = ARMS[3])),
    diff_xan_placebo = list(c(pick(rows, "mmrm", "estimate", level = "xan_vs_placebo", group = ARMS[2]),
                              pick(rows, "mmrm", "se", level = "xan_vs_placebo", group = ARMS[2])),
                            c(pick(rows, "mmrm", "estimate", level = "xan_vs_placebo", group = ARMS[3]),
                              pick(rows, "mmrm", "se", level = "xan_vs_placebo", group = ARMS[3]))),
    ci_xan_placebo = list(c(pick(rows, "mmrm", "lcl", level = "xan_vs_placebo", group = ARMS[2]),
                            pick(rows, "mmrm", "ucl", level = "xan_vs_placebo", group = ARMS[2])),
                          c(pick(rows, "mmrm", "lcl", level = "xan_vs_placebo", group = ARMS[3]),
                            pick(rows, "mmrm", "ucl", level = "xan_vs_placebo", group = ARMS[3]))),
    p_high_low = pick(rows, "mmrm", "pvalue", level = "high_vs_low", group = ARMS[3]),
    diff_high_low = list(c(pick(rows, "mmrm", "estimate", level = "high_vs_low", group = ARMS[3]),
                           pick(rows, "mmrm", "se", level = "high_vs_low", group = ARMS[3]))),
    ci_high_low = list(c(pick(rows, "mmrm", "lcl", level = "high_vs_low", group = ARMS[3]),
                         pick(rows, "mmrm", "ucl", level = "high_vs_low", group = ARMS[3])))
  )
}

# ---- comparison -------------------------------------------------------------

reference <- jsonlite::fromJSON(reference_path, simplifyVector = FALSE)$displays

# Display precision, so route C is compared at the precision the reference
# actually printed rather than at full double precision.
DIGITS <- list(n = 0, mean = 1, sd = 2, median = 1, min = 0, max = 0,
               estimate = 1, se = 2, lcl = 1, ucl = 1, pvalue = 3, N = 0)

failures <- character(0)
note <- function(...) failures <<- c(failures, paste0(...))

# `hard = TRUE` means a mismatch fails the run immediately: routes A and B are
# two implementations of one specification and must agree exactly. `hard =
# FALSE` is for route C, where a difference from the reference report may be a
# deliberate, declared scope decision — those are collected into the record
# instead, and it is the record comparison that fails when the SET of differing
# cells changes. That way a known difference stays visible without being fatal,
# and a NEW difference is fatal even though it is the same kind of difference.
cmp_num <- function(what, a, b, tol, hard = TRUE) {
  a <- as.numeric(a); b <- as.numeric(b)
  if (length(a) != length(b)) {
    if (hard) note(what, ": length ", length(a), " vs ", length(b))
    return(FALSE)
  }
  bad <- which(!(is.na(a) & is.na(b)) & (is.na(a) | is.na(b) | abs(a - b) > tol))
  if (length(bad)) {
    if (hard) {
      note(what, ": ", paste(sprintf("[%d] %s vs %s", bad, format(a[bad]), format(b[bad])), collapse = "; "))
    }
    return(FALSE)
  }
  TRUE
}

n_ab <- 0; n_ac <- 0
agree_ab <- 0; agree_ac <- 0

# A vs B — full double precision, same specification, two implementations.
for (slug in setdiff(names(route_B), "t-eff-adas-overtime")) {
  A <- route_A[[slug]]; B <- route_B[[slug]]
  for (k in intersect(names(B), names(A))) {
    if (k == "nptotmn_divergence") next
    a <- unlist(A[[k]]); b <- unlist(B[[k]])
    n_ab <- n_ab + length(b)
    if (cmp_num(paste0("A vs B  ", slug, " / ", k), a, b, 1e-8)) agree_ab <- agree_ab + length(b)
  }
}
for (a in ARMS) for (lab in names(route_B[["t-eff-adas-overtime"]][[a]])) {
  x <- route_A[["t-eff-adas-overtime"]][[a]][[lab]]
  y <- route_B[["t-eff-adas-overtime"]][[a]][[lab]]
  n_ab <- n_ab + length(y)
  if (cmp_num(paste0("A vs B  t-eff-adas-overtime / ", a, " / ", lab), x, y, 1e-8)) agree_ab <- agree_ab + length(y)
}

# A vs C — at the precision the reference printed.
round_like <- function(v, names_) {
  d <- vapply(names_, function(n) as.numeric(DIGITS[[n]] %||% 3), numeric(1))
  round_hu(v, d)
}
# Counted value by value, not key by key. Counting a whole key as disagreeing
# because one of its six numbers does would make the headline overstate the
# disagreement by a factor of two or three, and the footnotes on the displays
# quote these counts.
cmp_ref <- function(slug, key, a_val, c_val, stats_) {
  a <- round_like(as.numeric(unlist(a_val)), stats_)
  cc <- as.numeric(unlist(c_val))
  if (length(a) != length(cc)) {
    note("A vs C  ", slug, " / ", key, ": length ", length(a), " vs ", length(cc))
    return(character(0))
  }
  n_ac <<- n_ac + length(cc)
  bad <- which(abs(a - cc) > 1e-9)
  agree_ac <<- agree_ac + (length(cc) - length(bad))
  if (!length(bad)) {
    return(character(0))
  }
  sprintf("%s[%d]: %s here, %s in the reference", key, bad, format(a[bad]), format(cc[bad]))
}
ref_diffs <- list()
for (slug in names(reference)) {
  refc <- reference[[slug]]$cells
  A <- route_A[[slug]]
  if (slug == "t-eff-adas-overtime") {
    stats_ <- c("n", "mean", "sd", "median", "min", "max", "mean", "sd", "mean", "sd", "median", "min", "max")
    for (a in ARMS) for (lab in names(refc[[a]])) {
      st <- stats_[seq_along(unlist(refc[[a]][[lab]]))]
      ref_diffs[[slug]] <- c(ref_diffs[[slug]],
                             cmp_ref(slug, paste0(a, " / ", lab), A[[a]][[lab]], refc[[a]][[lab]], st))
    }
    next
  }
  for (k in names(refc)) {
    if (is.null(A[[k]])) next
    st <- if (grepl("\\.", k)) sub("^.*\\.", "", k)
          else if (grepl("^p_", k)) "pvalue"
          else if (grepl("^diff", k)) c("estimate", "se")
          else if (grepl("^ci", k)) c("lcl", "ucl")
          else if (k == "lsmean") c("estimate", "se")
          else "n"
    st <- rep(st, length.out = length(unlist(refc[[k]])))
    ref_diffs[[slug]] <- c(ref_diffs[[slug]], cmp_ref(slug, k, A[[k]], refc[[k]], st))
  }
}

measured <- list(
  study = "CDISCPILOT01",
  comparison_rule = paste(
    "Route A is the committed ARD. Route B recomputes every statistic from the",
    "vendored .xpt.gz in base R without loading {opencsr}, with the ANCOVA solved",
    "by an explicit design matrix and QR rather than lm(). Route C is the CDISC",
    "pilot's own published Section 14 tables. A and B are compared at full double",
    "precision (tolerance 1e-8); A and C at the precision the reference printed,",
    "after half-up rounding."),
  environment = list(r = paste0(R.version$major, ".", R.version$minor), os = Sys.info()[["sysname"]]),
  route_A_vs_B = list(values_compared = n_ab, values_agreeing = agree_ab),
  route_A_vs_C = list(values_compared = n_ac, values_agreeing = agree_ac),
  known_reference_differences = list(
    "t-eff-adas-mmrm" = paste(
      "Kenward-Roger degrees of freedom and Prasad-Rao-Jeske-Kackar-Harville",
      "standard errors are not implemented. Five of this display's cells differ",
      "from the reference at the last digit shown: the three p-values by 0.001,",
      "the high-dose LS mean SE (0.55 against 0.56) and one CI bound (-1.8",
      "against -1.9). The model itself matches: same 539 observations, all six",
      "covariance parameters to six significant figures, REML criterion to ten.")
  ),
  npix_nptotmn_divergence = route_B[["t-eff-npix-mean"]]$nptotmn_divergence,
  mmrm_model = route_A[["t-eff-adas-mmrm"]][c("n_obs", "n_subjects", "df_residual", "reml_criterion", "covariance")],
  displays = lapply(stats::setNames(names(reference), names(reference)), function(s) list(
    regulatory_id = NULL, reference_table = reference[[s]]$table,
    reference_cells_differing = as.list(ref_diffs[[s]] %||% character(0))
  ))
)

if (write_mode) {
  writeLines(jsonlite::toJSON(measured, auto_unbox = TRUE, pretty = 2, digits = 12, null = "null"), record_path)
  message("Wrote ", record_path)
} else {
  if (!file.exists(record_path)) {
    stop("No committed record at ", record_path, "; run with --write first.", call. = FALSE)
  }
  committed <- jsonlite::fromJSON(record_path, simplifyVector = FALSE)
  fresh <- jsonlite::fromJSON(jsonlite::toJSON(measured, auto_unbox = TRUE, digits = 12, null = "null"),
                              simplifyVector = FALSE)
  # The environment block is recorded and printed, never compared — the same
  # rule qc/source-agreement.R follows, and for the same reason.
  committed$environment <- NULL
  fresh$environment <- NULL
  if (!identical(committed, fresh)) {
    note("the committed record at quality/data/efficacy-agreement.json no longer describes this run")
  }
}

cat(sprintf("Route A vs B: %d of %d values agree (independent recomputation)\n", agree_ab, n_ab))
cat(sprintf("Route A vs C: %d of %d values agree (CDISCPILOT01 reference report)\n", agree_ac, n_ac))
cat(sprintf("MMRM: %d observations, %d subjects, REML criterion %.6f\n",
            route_A[["t-eff-adas-mmrm"]]$n_obs, route_A[["t-eff-adas-mmrm"]]$n_subjects,
            route_A[["t-eff-adas-mmrm"]]$reml_criterion))

if (length(failures)) {
  cat("\nDISAGREEMENTS\n")
  for (f in failures) cat("  - ", f, "\n", sep = "")
  cat("\n", length(failures), " disagreement(s).\n", sep = "")
  quit(status = 1)
}
cat("\nEvery figure this script compares agrees on every route it compares.\n")
cat("Table 14-3.11's published cells are NOT among them: the repeated-measures\n")
cat("display is compared against the reference report by DSP-EFF-009 in the\n")
cat("testthat suite instead. A green run here is not a check of that display.\n")
