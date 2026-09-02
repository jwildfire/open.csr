#!/usr/bin/env Rscript
# Kenward-Roger for the repeated-measures display — the spike D0032 Issue H asked
# for (#66), kept as a maintainer command rather than a CI step because it needs
# the compiled {mmrm} package, which the pipeline does not depend on.
#
#   Rscript qc/mmrm-kenward-roger.R
#
# What it measures: the same model t-eff-adas-mmrm fits with nlme::gls — the
# same 539 records from 234 subjects, unstructured covariance by visit — refitted
# with mmrm::mmrm using Kenward-Roger degrees of freedom and the Kenward-Roger
# (Prasad-Rao-Jeske-Kackar-Harville) adjusted covariance, then the reference's
# quantities: visit-averaged least-squares means with sites equally weighted and
# the baseline at its mean, and the three treatment contrasts.
#
# What it found (2026-09-02, mmrm 0.3.15): the refit reproduces SAS's REML
# criterion to every printed digit (3087.843035 against 3087.84303515) and
# moves ONE of the five cells the display footnotes as differing — the lower
# confidence limit of high dose against placebo, -1.85, which prints -1.9 as the
# report does where the model-based fit printed -1.8. The other four do not
# move: the three p-values stay one thousandth below the report's (0.954 /
# 0.555 / 0.604 against 0.955 / 0.556 / 0.606) and the high-dose least-squares
# mean's standard error prints 0.55 against the report's 0.56. Kenward-Roger is
# therefore not the whole explanation, and the pipeline keeps the model-based
# fit: a compiled dependency for one cell, with four still open, is not a trade
# the display's footnote can justify. The four are stated there.
if (!requireNamespace("mmrm", quietly = TRUE)) stop("install.packages(\"mmrm\") first; this is a maintainer command, not a CI step.")
suppressMessages({ pkgload::load_all("pipeline", quiet = TRUE); library(mmrm) })
options(opencsr.root = getwd())
spec <- read_analysis_spec("t-eff-adas-mmrm"); a <- spec$analyses$mmrm
data <- prepare_data(c("adsl", "adqsadas"))
df <- apply_analysis_set(data$adqsadas, "efficacy")
df <- df[with(df, eval(parse(text = a$filter))), ]
df$TRTP <- factor(as.character(df$TRTP), levels = a$treatment_levels)
df$VISIT <- factor(as.character(df$AVISITN), levels = as.character(a$visit_levels))
df$SITEGR1 <- factor(as.character(df$SITEGR1)); df$USUBJID <- factor(df$USUBJID)
df <- df[order(df$USUBJID, df$VISIT), ]
cat("records:", nrow(df), " subjects:", length(unique(df$USUBJID)), "\n")
fit <- mmrm(CHG ~ BASE * VISIT + TRTP * VISIT + SITEGR1 + us(VISIT | USUBJID), data = df, method = "Kenward-Roger", vcov = "Kenward-Roger", reml = TRUE)
cat("REML:", sprintf("%.6f", -2 * logLik(fit)), " (SAS -2RLL 3087.84303515)\n")
b <- coef(fit); X <- model.matrix(fit)
# an LS mean row: BASE at its mean, sites equally weighted, at week 24
site_lev <- levels(df$SITEGR1); base_mean <- mean(df$BASE)
# the reference's LS means are the visit-averaged treatment main effect (equal
# weight over the three visits and over sites, BASE at its mean) — the quantity
# the 2006 PROC MIXED computed, as the display's footnote records
row_for <- function(arm) {
  nd <- expand.grid(SITEGR1 = factor(site_lev, levels = site_lev), VISIT = factor(levels(df$VISIT), levels = levels(df$VISIT)))
  nd$BASE <- base_mean; nd$TRTP <- factor(arm, levels = levels(df$TRTP))
  mm <- model.matrix(delete.response(terms(fit)), nd)
  colMeans(mm)[names(b)]
}
rows <- sapply(levels(df$TRTP), row_for)
res <- function(L, label) {
  d <- df_1d(fit, unname(L)); d <- lapply(d, as.numeric); ci <- d$est + c(-1, 1) * qt(0.975, d$df) * d$se
  cat(sprintf("%-28s est %6.2f  se %5.3f  df %6.1f  p %.4f  ci [%5.2f, %5.2f]\n", label, d$est, d$se, d$df, d$p_val, ci[1], ci[2]))
}

for (arm in levels(df$TRTP)) res(rows[, arm], paste("LS mean", arm))
res(rows[, 2] - rows[, 1], "Low - Placebo"); res(rows[, 3] - rows[, 1], "High - Placebo"); res(rows[, 3] - rows[, 2], "High - Low")
cat("\nreference (Table 14-3.11): LS means 1.6 (0.49), 1.5 (0.52), 1.1 (0.56); Low-Pl -0.0 (0.7) p 0.955 CI [-1.4, 1.3]; High-Pl -0.4 (0.72) p 0.556 CI [-1.9, 1.0]; High-Low -0.4 (0.75) p 0.606 CI [-1.9, 1.1]\n")
