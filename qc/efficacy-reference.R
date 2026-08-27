#!/usr/bin/env Rscript
# Does open.csr's CIBIC+ and time-to-event group agree with a second measurement,
# and with the study's own clinical study report?
#
#   Rscript qc/efficacy-reference.R            # check; exit 1 on disagreement
#   Rscript qc/efficacy-reference.R --verbose  # print every comparison, not just failures
#
# THREE MEASUREMENTS, TWO OF WHICH ARE OURS.
#
#   1. The pipeline. `regenerate()` reads the specs in library/tfl/, dispatches to
#      each display's custom.R and writes outputs/<slug>/vNNN/ard.json.
#   2. This script. It reads the vendored .xpt.gz files itself and recomputes
#      every published statistic from them.
#   3. quality/data/efficacy-reference.json — what the sponsor's own report
#      printed in 2006, in SAS, transcribed by hand.
#
# (1) and (2) are compared to full numeric precision. (2) and (3) are compared as
# the strings the display's declared digit plan produces. Two agreeing
# implementations can still be wrong together; neither can talk a 2006 document
# into agreeing with them.
#
# THIS SCRIPT SHARES NO CODE WITH THE PIPELINE. It never loads {opencsr}, never
# calls prepare_data(), and does not use the modelling functions the displays
# use:
#
#   * the analysis sets are taken from ADSL's own EFFFL/SAFFL and asserted
#     against the analysis datasets' copies, rather than through
#     apply_analysis_set();
#   * the analysis of covariance is solved from the normal equations with
#     hand-built model matrices, not by stats::lm(), and the dose-response
#     p-value comes from an F test comparing the residual sums of squares of two
#     nested fits rather than by reading a coefficient's t statistic — which is
#     also what makes the claim in t-cibic-week24/custom.R, that the Type III
#     one-degree-of-freedom test is the square of that t, a measured fact here
#     rather than an assertion there;
#   * the Cochran-Mantel-Haenszel statistic is built from per-stratum score sums
#     and their covariance, not from the Kronecker-product form the display uses;
#   * the Kaplan-Meier estimator, Greenwood's variance, the Brookmeyer-Crowley
#     median limits and the log-rank test are computed from risk sets here.
#     {survival} is not loaded.
#
# There is deliberately NO --write mode. Measurement (3) is a transcription of a
# document published in 2006; a script that could rewrite it would turn the one
# external anchor in this qualification into an echo of the code it is meant to
# check.

args <- commandArgs(trailingOnly = TRUE)
verbose <- "--verbose" %in% args

root <- getwd()
while (!file.exists(file.path(root, "docs", "design", "contracts.md"))) {
  parent <- dirname(root)
  if (identical(parent, root)) stop("Could not locate the open.csr repository root.")
  root <- parent
}
vendor <- file.path(root, "pipeline", "inst", "extdata", "phuse-cdiscpilot01")
record_path <- file.path(root, "quality", "data", "efficacy-reference.json")

suppressWarnings(suppressMessages({
  library(haven)
  library(jsonlite)
}))

TRT_LEVELS <- c("Placebo", "Xanomeline Low Dose", "Xanomeline High Dose")
DOSE_OF <- c("Placebo" = 0, "Xanomeline Low Dose" = 54, "Xanomeline High Dose" = 81)

read_vendored <- function(name) {
  path <- file.path(vendor, paste0(name, ".xpt.gz"))
  haven::read_xpt(memDecompress(readBin(path, "raw", file.size(path)), type = "gzip"))
}

# ---- half-up rounding and formatting ---------------------------------------
# The convention is the display's (contract §3); the implementation is this
# script's. `formatC` alone rounds half-to-even, which would disagree with the
# rendered cells on exact halves for reasons that have nothing to do with the
# analysis.

fmt <- function(x, d) {
  if (is.null(x) || length(x) == 0 || is.na(x)) {
    return(NA_character_)
  }
  scaled <- abs(x) * 10^d * (1 + 2 * .Machine$double.eps)
  v <- sign(x) * floor(scaled + 0.5) / 10^d
  sprintf(paste0("%.", d, "f"), v)
}

# ---- data ------------------------------------------------------------------

adsl <- read_vendored("adsl")
adsl$TRT01A <- as.character(adsl$TRT01A)
blank_na <- function(x) {
  x <- as.character(x)
  ifelse(is.na(x) | !nzchar(x), "N", x)
}
adsl$EFFFL <- blank_na(adsl$EFFFL)
adsl$SAFFL <- blank_na(adsl$SAFFL)

if (!all(adsl$TRT01A %in% TRT_LEVELS)) {
  stop("ADSL carries treatment labels this qualification does not know: ",
    paste(setdiff(unique(adsl$TRT01A), TRT_LEVELS), collapse = ", "),
    call. = FALSE
  )
}

#' Subject-level treatment and site, joined onto an analysis dataset
join_subject <- function(df) {
  i <- match(df$USUBJID, adsl$USUBJID)
  if (anyNA(i)) stop("Analysis records for subjects absent from ADSL.", call. = FALSE)
  df$.TRT <- adsl$TRT01A[i]
  df$.EFFFL <- adsl$EFFFL[i]
  df$.SAFFL <- adsl$SAFFL[i]
  df
}

cibc <- join_subject(read_vendored("adqscibc"))
adtte <- join_subject(read_vendored("adtte"))

# The analysis datasets carry their own copies of the population flags. Taking
# the flag from ADSL and asserting the copy agrees is stronger than trusting
# either: a display's population and a subject's record cannot disagree about
# whether that subject is in the analysis.
if (!identical(blank_na(cibc$EFFFL), cibc$.EFFFL)) {
  stop("ADQSCIBC's EFFFL disagrees with ADSL's for at least one record.", call. = FALSE)
}
if (!identical(blank_na(adtte$SAFFL), adtte$.SAFFL)) {
  stop("ADTTE's SAFFL disagrees with ADSL's for at least one record.", call. = FALSE)
}

# ---- linear models, from the normal equations ------------------------------

#' Least squares by solving X'X b = X'y
#'
#' @return list(beta, V, df, sse)
ols <- function(X, y) {
  XtX <- crossprod(X)
  beta <- drop(solve(XtX, crossprod(X, y)))
  resid <- drop(y - X %*% beta)
  dfree <- nrow(X) - ncol(X)
  sse <- sum(resid^2)
  list(beta = beta, V = (sse / dfree) * solve(XtX), df = dfree, sse = sse)
}

#' Indicator columns for the levels of a factor, dropping the first
dummies <- function(values, levels) {
  out <- vapply(levels[-1], function(lv) as.numeric(values == lv), numeric(length(values)))
  matrix(out, nrow = length(values), dimnames = list(NULL, levels[-1]))
}

#' The published analysis of covariance, at one visit
#'
#' Treatment and site group as factors for the pairwise contrasts; treatment as
#' randomised dose for the dose-response test. Both adjust for site group.
ancova_route2 <- function(df) {
  y <- as.numeric(df$AVAL)
  site_levels <- sort(unique(as.character(df$SITEGR1)))
  S <- dummies(as.character(df$SITEGR1), site_levels)
  arm <- as.character(df$.TRT)
  A <- dummies(arm, TRT_LEVELS)
  one <- matrix(1, nrow = length(y), dimnames = list(NULL, "(Intercept)"))

  fit <- ols(cbind(one, A, S), y)
  contrast <- function(plus, minus) {
    L <- rep(0, length(fit$beta))
    names(L) <- names(fit$beta)
    if (!is.na(plus)) L[[plus]] <- 1
    if (!is.na(minus)) L[[minus]] <- -1
    est <- sum(L * fit$beta)
    se <- sqrt(drop(t(L) %*% fit$V %*% L))
    tstat <- est / se
    crit <- stats::qt(0.975, fit$df)
    list(
      diff = est, se = se,
      lcl = est - crit * se, ucl = est + crit * se,
      pval = 2 * stats::pt(-abs(tstat), fit$df)
    )
  }

  # Dose response: dose as a continuous covariate, tested by comparing the
  # residual sums of squares of the fit with and without it.
  dose <- unname(DOSE_OF[arm])
  full <- ols(cbind(one, dose = dose, S), y)
  reduced <- ols(cbind(one, S), y)
  fstat <- ((reduced$sse - full$sse) / 1) / (full$sse / full$df)

  list(
    dose_response = list(pval = stats::pf(fstat, 1, full$df, lower.tail = FALSE), f = fstat),
    # Named for the column the published table prints the contrast in.
    xan_vs_pbo = list(
      "Xanomeline Low Dose" = contrast("Xanomeline Low Dose", NA),
      "Xanomeline High Dose" = contrast("Xanomeline High Dose", NA)
    ),
    high_vs_low = contrast("Xanomeline High Dose", "Xanomeline Low Dose")
  )
}

#' n, mean, sd, median, min and max of one visit's scores, by treatment
summary_route2 <- function(df) {
  stats::setNames(lapply(TRT_LEVELS, function(lv) {
    v <- as.numeric(df$AVAL[df$.TRT == lv])
    list(
      N = length(v), mean = mean(v), sd = stats::sd(v),
      median = stats::median(v), min = min(v), max = max(v)
    )
  }), TRT_LEVELS)
}

# ---- Cochran-Mantel-Haenszel, mean-score form ------------------------------

#' Row-mean-scores-differ statistic, stratified
#'
#' Built from each stratum's treatment-wise score sums and their covariance
#' under the hypergeometric null, summed across strata.
cmh_route2 <- function(df) {
  strata <- sort(unique(as.character(df$SITEGR1)))
  C <- length(TRT_LEVELS)
  d <- rep(0, C - 1)
  V <- matrix(0, C - 1, C - 1)
  for (k in strata) {
    sub <- df[as.character(df$SITEGR1) == k, , drop = FALSE]
    s <- as.numeric(sub$AVAL)
    n <- length(s)
    if (n < 2) next
    grp <- as.character(sub$.TRT)
    nc <- vapply(TRT_LEVELS, function(lv) sum(grp == lv), numeric(1))
    Tk <- vapply(TRT_LEVELS, function(lv) sum(s[grp == lv]), numeric(1))
    sbar <- mean(s)
    Ek <- nc * sbar
    v <- sum((s - sbar)^2) / (n - 1)
    cov_k <- v * (diag(nc, nrow = C) - outer(nc, nc) / n)
    d <- d + (Tk - Ek)[seq_len(C - 1)]
    V <- V + cov_k[seq_len(C - 1), seq_len(C - 1), drop = FALSE]
  }
  Q <- drop(t(d) %*% solve(V, d))
  list(Q = Q, df = C - 1, pval = stats::pchisq(Q, C - 1, lower.tail = FALSE))
}

#' Category counts and within-visit percentages, by treatment
categories_route2 <- function(df, category_names) {
  stats::setNames(lapply(TRT_LEVELS, function(lv) {
    s <- as.integer(df$AVAL[df$.TRT == lv])
    n_visit <- length(s)
    counts <- vapply(seq_along(category_names), function(i) sum(s == i), numeric(1))
    list(N = n_visit, n = counts, p = counts / n_visit)
  }), TRT_LEVELS)
}

# ---- Kaplan-Meier from risk sets -------------------------------------------

#' The estimator, Greenwood's variance and the Brookmeyer-Crowley median limits
#'
#' `event` is 1 for an event and 0 for a censored observation. The median is the
#' first time the estimate is at or below one half; its confidence limits are the
#' first times the linear (untransformed) pointwise band is at or below one half,
#' which is the transformation the display declares.
km_route2 <- function(time, event) {
  ord <- order(time, -event)
  time <- time[ord]
  event <- event[ord]
  n_total <- length(time)
  times <- sort(unique(time[event == 1]))
  n_risk <- vapply(times, function(t) sum(time >= t), numeric(1))
  n_event <- vapply(times, function(t) sum(time == t & event == 1), numeric(1))
  surv <- cumprod(1 - n_event / n_risk)
  greenwood <- cumsum(n_event / (n_risk * (n_risk - n_event)))
  se <- surv * sqrt(greenwood)

  first_at_or_below <- function(values) {
    hit <- which(values <= 0.5)
    if (!length(hit)) NA_real_ else times[hit[1]]
  }
  # Brookmeyer-Crowley: the interval is the set of times at which the pointwise
  # band still covers one half. The LOWER band falls through 0.5 first, so it
  # gives the EARLIER endpoint — the lower confidence limit for the median — and
  # the upper band gives the later one.
  z <- stats::qnorm(0.975)
  # Tick marks: one per distinct time at which somebody was censored, drawn at
  # the estimate then in force. A curve without them hides half of what a
  # time-to-event display is reporting, so they are measured here too rather
  # than trusted from the pipeline.
  censor_times <- sort(unique(time[event == 0]))
  step_at <- function(t) {
    hit <- which(times <= t)
    if (!length(hit)) 1 else surv[max(hit)]
  }
  list(
    N = n_total,
    n = sum(event == 1),
    p = sum(event == 1) / n_total,
    n_censor = sum(event == 0),
    p_censor = sum(event == 0) / n_total,
    median = first_at_or_below(surv),
    median_lcl = first_at_or_below(pmax(0, surv - z * se)),
    median_ucl = first_at_or_below(pmin(1, surv + z * se)),
    censor_time = censor_times,
    censor_surv = vapply(censor_times, step_at, numeric(1)),
    times = times, surv = surv, se = se
  )
}

#' A survival curve as a function of time, from its coordinates
#'
#' Two correct implementations of the same estimator do not have to agree on
#' which points they carry: {survival} records the estimate at censoring times
#' too, where it does not change, and this script records only event times. The
#' step FUNCTIONS are what must agree, so the comparison evaluates both on a
#' common grid instead of zipping two vectors together.
step_eval <- function(times, surv, grid) {
  vapply(grid, function(t) {
    hit <- which(times <= t)
    if (!length(hit)) 1 else surv[max(hit)]
  }, numeric(1))
}

#' Multivariate log-rank test across treatment groups
logrank_route2 <- function(time, event, group) {
  G <- length(TRT_LEVELS)
  times <- sort(unique(time[event == 1]))
  O <- vapply(TRT_LEVELS, function(lv) sum(event == 1 & group == lv), numeric(1))
  E <- rep(0, G)
  V <- matrix(0, G, G)
  for (t in times) {
    at_risk <- time >= t
    n <- sum(at_risk)
    d <- sum(time == t & event == 1)
    ng <- vapply(TRT_LEVELS, function(lv) sum(at_risk & group == lv), numeric(1))
    E <- E + d * ng / n
    if (n > 1) {
      f <- d * (n - d) / (n - 1)
      V <- V + f * (diag(ng / n, nrow = G) - outer(ng / n, ng / n))
    }
  }
  k <- seq_len(G - 1)
  dvec <- (O - E)[k]
  chisq <- drop(t(dvec) %*% solve(V[k, k, drop = FALSE], dvec))
  list(chisq = chisq, df = G - 1, pval = stats::pchisq(chisq, G - 1, lower.tail = FALSE))
}

#' Subjects at risk on the display's declared grid
at_risk_route2 <- function(time, grid) vapply(grid, function(t) sum(time >= t), numeric(1))

# ---- measurement -----------------------------------------------------------

visit_frame <- function(visit) {
  keep <- cibc$.EFFFL == "Y" &
    as.character(cibc$PARAMCD) == "CIBICVAL" &
    as.character(cibc$AVISIT) == visit &
    blank_na(cibc$ANL01FL) == "Y"
  cibc[keep, , drop = FALSE]
}

population_route2 <- function(flag) {
  vapply(TRT_LEVELS, function(lv) {
    sum(adsl[[flag]] == "Y" & adsl$TRT01A == lv)
  }, numeric(1))
}

CATEGORY_NAMES <- c(
  "Marked improvement", "Moderate improvement", "Minimal improvement",
  "No change", "Minimal worsening", "Moderate worsening", "Marked worsening"
)

measure <- function() {
  out <- list()
  for (entry in list(
    c(slug = "t-cibic-week8", visit = "Week 8"),
    c(slug = "t-cibic-week16", visit = "Week 16"),
    c(slug = "t-cibic-week24", visit = "Week 24")
  )) {
    df <- visit_frame(entry[["visit"]])
    out[[entry[["slug"]]]] <- list(
      population_n = population_route2("EFFFL"),
      summary = summary_route2(df),
      ancova = ancova_route2(df)
    )
  }

  visits <- c("Week 8", "Week 16", "Week 24")
  out[["t-cibic-categorical"]] <- list(
    population_n = population_route2("EFFFL"),
    visits = stats::setNames(lapply(visits, function(v) {
      df <- visit_frame(v)
      list(categories = categories_route2(df, CATEGORY_NAMES), cmh = cmh_route2(df))
    }), visits)
  )

  tte <- adtte[adtte$.SAFFL == "Y" & as.character(adtte$PARAMCD) == "TTDE", , drop = FALSE]
  time <- as.numeric(tte$AVAL)
  event <- 1 - as.numeric(tte$CNSR)
  grp <- as.character(tte$.TRT)
  grid <- c(0, 50, 100, 150, 200)
  out[["f-derm-time-to-event"]] <- list(
    population_n = population_route2("SAFFL"),
    km = stats::setNames(lapply(TRT_LEVELS, function(lv) {
      k <- km_route2(time[grp == lv], event[grp == lv])
      k$risk_n <- at_risk_route2(time[grp == lv], grid)
      k
    }), TRT_LEVELS),
    logrank = logrank_route2(time, event, grp),
    risk_time = grid
  )
  out
}

# ---- comparison ------------------------------------------------------------

failures <- list()
checks <- 0L

#' Compare one quantity measured two ways
#'
#' `other` is whichever measurement the label names — the committed ARD, or the
#' string the 2006 report printed. `route2` is always this script's own
#' recomputation. Both are named in the failure line, because a disagreement is
#' useless unless it says which side said what.
check <- function(what, other, route2, tol = 1e-8) {
  checks <<- checks + 1L
  show <- function(v) if (is.character(v)) v else format(v, digits = 10)
  ok <- if (is.character(route2) || is.character(other)) {
    identical(as.character(other), as.character(route2))
  } else if (is.na(route2) || is.na(other)) {
    is.na(route2) && is.na(other)
  } else {
    abs(other - route2) <= tol * max(1, abs(route2))
  }
  if (!ok) {
    failures[[length(failures) + 1]] <<- sprintf(
      "  %-62s  says %-14s route 2 says %s", what, show(other), show(route2)
    )
  } else if (verbose) {
    cat(sprintf("  ok  %-62s %s\n", what, show(route2)))
  }
  invisible(ok)
}

#' Compare this script's recomputation with what the 2006 report printed
#'
#' A separate name rather than a second argument order used carelessly: these
#' call sites read `check_report(what, ours, theirs)`, and getting the two the
#' wrong way round would put the wrong label on every disagreement the script
#' ever reports.
check_report <- function(what, route2, reported) {
  check(what, other = reported, route2 = route2)
}

# ---- the committed ARDs ----------------------------------------------------

ard_rows <- function(slug) {
  cur <- jsonlite::fromJSON(file.path(root, "outputs", slug, "current.json"), simplifyVector = TRUE)
  doc <- jsonlite::fromJSON(file.path(root, cur$ard), simplifyVector = FALSE)
  doc$rows
}

#' One statistic out of a committed ARD, by address
ard_stat <- function(rows, analysis, level, stat_name, variable = NULL, variable_level = NULL) {
  hit <- Filter(function(r) {
    identical(r$analysis, analysis) &&
      identical(as.character(r$group1_level), level) &&
      identical(r$stat_name, stat_name) &&
      (is.null(variable) || identical(r$variable, variable)) &&
      (is.null(variable_level) || identical(r$variable_level %||% NA, variable_level))
  }, rows)
  if (length(hit) != 1) {
    stop(
      "ARD address matched ", length(hit), " rows, expected exactly one: ",
      paste(analysis, level, variable %||% "-", variable_level %||% "-", stat_name),
      call. = FALSE
    )
  }
  v <- hit[[1]]$stat
  if (is.null(v)) NA_real_ else as.numeric(unlist(v))
}

#' One statistic that belongs to the study rather than to a treatment arm
#'
#' A log-rank test is a property of the comparison, not of a column. Its ARD rows
#' carry no `group1_level`, so they are addressed by context and name — and the
#' absence of a group is asserted, because a study-level statistic parked in one
#' arm's column would publish as that arm's result.
ard_study_stat <- function(rows, analysis, context, stat_name) {
  hit <- Filter(function(r) {
    identical(r$analysis, analysis) &&
      identical(r$context, context) &&
      identical(r$stat_name, stat_name)
  }, rows)
  if (length(hit) != 1) {
    stop(
      "ARD address matched ", length(hit), " rows, expected exactly one: ",
      paste(analysis, context, stat_name),
      call. = FALSE
    )
  }
  if (!is.null(hit[[1]]$group1_level) && !is.na(hit[[1]]$group1_level)) {
    stop(
      "The ", stat_name, " of ", context, " is a study-level statistic but its ARD row ",
      "is addressed to group '", hit[[1]]$group1_level, "'.",
      call. = FALSE
    )
  }
  as.numeric(unlist(hit[[1]]$stat))
}

`%||%` <- function(x, y) if (is.null(x)) y else x

record <- jsonlite::fromJSON(record_path, simplifyVector = FALSE)

# ---- run -------------------------------------------------------------------

cat("open.csr efficacy qualification — CIBIC+ and time to first dermatologic event\n")
cat("root: ", root, "\n", sep = "")
cat("vendored ADaM: ", vendor, "\n\n", sep = "")

m <- measure()

# ============ the three CIBIC+ summary tables ================================
for (slug in c("t-cibic-week8", "t-cibic-week16", "t-cibic-week24")) {
  cat("== ", slug, " (", record$displays[[slug]]$reference, ")\n", sep = "")
  ours <- m[[slug]]
  rows <- ard_rows(slug)
  ref <- record$displays[[slug]]
  digits <- ref$digits

  for (i in seq_along(TRT_LEVELS)) {
    lv <- TRT_LEVELS[i]
    check(
      paste(slug, "| pipeline | population N |", lv),
      ard_stat(rows, "population", lv, "N"), ours$population_n[[lv]]
    )
    check_report(
      paste(slug, "| report   | population N |", lv),
      fmt(ours$population_n[[lv]], 0), ref$population_n[[i]]
    )
    for (st in c("N", "mean", "sd", "median", "min", "max")) {
      check(
        paste(slug, "| pipeline | score", st, "|", lv),
        ard_stat(rows, "score", lv, st, variable = "AVAL"), ours$summary[[lv]][[st]]
      )
      check_report(
        paste(slug, "| report   | score", st, "|", lv),
        fmt(ours$summary[[lv]][[st]], digits[[st]]), ref$summary[[st]][[i]]
      )
    }
  }

  a <- ours$ancova
  high <- "Xanomeline High Dose"
  low <- "Xanomeline Low Dose"
  check(
    paste(slug, "| pipeline | ancova dose-response pval"),
    ard_stat(rows, "ancova", high, "pval", variable = "DOSE_RESPONSE"), a$dose_response$pval
  )
  check_report(
    paste(slug, "| report   | ancova dose-response pval"),
    fmt(a$dose_response$pval, digits$pval), ref$ancova$dose_response$pval
  )
  for (lv in c(low, high)) {
    for (st in c("pval", "diff", "se", "lcl", "ucl")) {
      check(
        paste(slug, "| pipeline | xan-vs-pbo", st, "|", lv),
        ard_stat(rows, "ancova", lv, st, variable = "XAN_VS_PBO"), a$xan_vs_pbo[[lv]][[st]]
      )
      check_report(
        paste(slug, "| report   | xan-vs-pbo", st, "|", lv),
        fmt(a$xan_vs_pbo[[lv]][[st]], digits[[st]]), ref$ancova$xan_vs_pbo[[lv]][[st]]
      )
    }
  }
  for (st in c("pval", "diff", "se", "lcl", "ucl")) {
    check(
      paste(slug, "| pipeline | high-vs-low", st),
      ard_stat(rows, "ancova", high, st, variable = "HIGH_VS_LOW"), a$high_vs_low[[st]]
    )
    check_report(
      paste(slug, "| report   | high-vs-low", st),
      fmt(a$high_vs_low[[st]], digits[[st]]), ref$ancova$high_vs_low[[st]]
    )
  }
  cat("   ", checks, " comparisons so far\n", sep = "")
}

# ============ the categorical analysis =======================================
{
  slug <- "t-cibic-categorical"
  cat("== ", slug, " (", record$displays[[slug]]$reference, ")\n", sep = "")
  ours <- m[[slug]]
  rows <- ard_rows(slug)
  ref <- record$displays[[slug]]
  digits <- ref$digits
  high <- "Xanomeline High Dose"

  for (i in seq_along(TRT_LEVELS)) {
    check(
      paste(slug, "| pipeline | population N |", TRT_LEVELS[i]),
      ard_stat(rows, "population", TRT_LEVELS[i], "N"), ours$population_n[[TRT_LEVELS[i]]]
    )
    check_report(
      paste(slug, "| report   | population N |", TRT_LEVELS[i]),
      fmt(ours$population_n[[TRT_LEVELS[i]]], 0), ref$population_n[[i]]
    )
  }

  for (visit in names(ours$visits)) {
    key <- paste0("week", sub("Week ", "", visit))
    v <- ours$visits[[visit]]
    vref <- ref$visits[[visit]]
    for (i in seq_along(TRT_LEVELS)) {
      lv <- TRT_LEVELS[i]
      check(
        paste(slug, "| pipeline |", visit, "| visit N |", lv),
        ard_stat(rows, paste0("cat_", key), lv, "N", variable_level = NA), v$categories[[lv]]$N
      )
      check_report(
        paste(slug, "| report   |", visit, "| visit N |", lv),
        fmt(v$categories[[lv]]$N, 0), vref$N[[i]]
      )
      for (j in seq_along(CATEGORY_NAMES)) {
        cat_name <- CATEGORY_NAMES[j]
        check(
          paste(slug, "| pipeline |", visit, "|", cat_name, "n |", lv),
          ard_stat(rows, paste0("cat_", key), lv, "n", variable_level = cat_name),
          v$categories[[lv]]$n[[j]]
        )
        check(
          paste(slug, "| pipeline |", visit, "|", cat_name, "p |", lv),
          ard_stat(rows, paste0("cat_", key), lv, "p", variable_level = cat_name),
          v$categories[[lv]]$p[[j]]
        )
        check_report(
          paste(slug, "| report   |", visit, "|", cat_name, "n |", lv),
          fmt(v$categories[[lv]]$n[[j]], 0), vref$n[[lv]][[j]]
        )
        # The published table leaves a percentage blank where the count is
        # zero; open.csr prints "0 (0%)". Only the non-empty cells are
        # comparable, which the record's transcription notes state.
        want_p <- vref$p[[lv]][[j]]
        if (!is.null(want_p)) {
          check_report(
            paste(slug, "| report   |", visit, "|", cat_name, "p |", lv),
            fmt(v$categories[[lv]]$p[[j]] * 100, digits$p), want_p
          )
        }
      }
    }
    check(
      paste(slug, "| pipeline |", visit, "| CMH pval"),
      ard_stat(rows, paste0("cmh_", key), high, "pval", variable = "CMH"), v$cmh$pval
    )
    check_report(
      paste(slug, "| report   |", visit, "| CMH pval"),
      fmt(v$cmh$pval, digits$pval), vref$cmh_pval
    )
    # The choice of CMH statistic is a decision, so the alternatives the
    # display did NOT choose are checked too: the record claims only the
    # row-mean-scores form reproduces the report, and that claim is measured.
    check_report(
      paste(slug, "| report   |", visit, "| CMH row-mean-scores variant"),
      fmt(v$cmh$pval, digits$pval), ref$cmh_variants_not_published$row_mean_scores[[visit]]
    )
  }
  cat("   ", checks, " comparisons so far\n", sep = "")
}

# ============ the time-to-event figure =======================================
{
  slug <- "f-derm-time-to-event"
  cat("== ", slug, " (", record$displays[[slug]]$reference, ")\n", sep = "")
  ours <- m[[slug]]
  rows <- ard_rows(slug)
  ref <- record$displays[[slug]]
  digits <- ref$digits

  for (i in seq_along(TRT_LEVELS)) {
    lv <- TRT_LEVELS[i]
    k <- ours$km[[lv]]
    check(
      paste(slug, "| pipeline | population N |", lv),
      ard_stat(rows, "km", lv, "N"), ours$population_n[[lv]]
    )
    for (st in c("N", "n", "p", "n_censor", "p_censor", "median", "median_lcl", "median_ucl")) {
      check(
        paste(slug, "| pipeline | km", st, "|", lv),
        ard_stat(rows, "km", lv, st), k[[st]]
      )
      want <- ref$km[[st]][[i]]
      scaled <- if (st %in% c("p", "p_censor")) k[[st]] * 100 else k[[st]]
      check_report(
        paste(slug, "| report   | km", st, "|", lv),
        fmt(scaled, digits[[st]]), if (is.null(want)) NA_character_ else want
      )
    }
    # The curve travels in the ARD as list-valued statistics, and it is compared
    # over its whole length rather than at its endpoints: a curve that agrees at
    # both ends can be wrong everywhere between them.
    curve_t <- ard_stat(rows, "km", lv, "time")
    curve_s <- ard_stat(rows, "km", lv, "surv")
    grid <- 0:max(c(curve_t, k$times))
    check(
      paste(slug, "| pipeline | survival curve over", length(grid), "days |", lv),
      max(abs(step_eval(curve_t, curve_s, grid) - step_eval(k$times, k$surv, grid))), 0
    )
    # Censoring is half of what a time-to-event display reports, and the tick
    # marks are the only place the figure shows it. Both the times and the
    # estimate in force at each are measured independently here.
    got_ct <- ard_stat(rows, "km", lv, "censor_time")
    got_cs <- ard_stat(rows, "km", lv, "censor_surv")
    check(
      paste(slug, "| pipeline | censoring times |", lv),
      if (length(got_ct) == length(k$censor_time)) max(abs(got_ct - k$censor_time)) else NA_real_, 0
    )
    check(
      paste(slug, "| pipeline | survival at censoring |", lv),
      if (length(got_cs) == length(k$censor_surv)) max(abs(got_cs - k$censor_surv)) else NA_real_, 0
    )
    # Every subject is either an event or a censoring, once.
    check(
      paste(slug, "| pipeline | events + censored = N |", lv),
      ard_stat(rows, "km", lv, "n") + ard_stat(rows, "km", lv, "n_censor"),
      ard_stat(rows, "km", lv, "N")
    )
    got_risk <- ard_stat(rows, "km", lv, "risk_n")
    check(
      paste(slug, "| pipeline | numbers at risk |", lv),
      if (length(got_risk) == length(k$risk_n)) max(abs(got_risk - k$risk_n)) else NA_real_, 0
    )
    check(
      paste(slug, "| pipeline | at-risk grid |", lv),
      max(abs(ard_stat(rows, "km", lv, "risk_time") - ours$risk_time)), 0
    )
  }

  # The log-rank test is a property of the study, not of an arm; ard_study_stat()
  # asserts that its ARD rows carry no treatment group at all.
  check(
    paste(slug, "| pipeline | log-rank chisq"),
    ard_study_stat(rows, "km", "survival_test", "chisq"), ours$logrank$chisq
  )
  check(
    paste(slug, "| pipeline | log-rank df"),
    ard_study_stat(rows, "km", "survival_test", "df"), ours$logrank$df
  )
  check(
    paste(slug, "| pipeline | log-rank p_value"),
    ard_study_stat(rows, "km", "survival_test", "p_value"), ours$logrank$pval
  )
  # The report states only "p<0.0001"; the record carries that as a ceiling
  # rather than a value, so this is an inequality, not an equality.
  checks <- checks + 1L
  if (!(ours$logrank$pval < as.numeric(ref$logrank$max_pval))) {
    failures[[length(failures) + 1]] <- sprintf(
      "  %-62s  says %-14s route 2 says %s", paste(slug, "| report | log-rank pval below ceiling"),
      paste0("<", ref$logrank$max_pval), format(ours$logrank$pval)
    )
  } else if (verbose) {
    cat(sprintf("  ok  %-60s %s < %s\n", paste(slug, "| report | log-rank pval"),
      format(ours$logrank$pval, digits = 3), ref$logrank$max_pval))
  }

  # The median confidence limits depend on a transformation the report does not
  # name. The record carries all three candidates and claims the linear form is
  # the only one that reproduces both published intervals; the linear form is
  # what this route computed, so that claim is checked here.
  for (lv in c("Xanomeline Low Dose", "Xanomeline High Dose")) {
    k <- ours$km[[lv]]
    plain <- ref$median_ci_variants_not_published$plain[[lv]]
    check_report(
      paste(slug, "| report   | median CI (linear) lcl |", lv),
      fmt(k$median_lcl, 0), plain[[1]]
    )
    check_report(
      paste(slug, "| report   | median CI (linear) ucl |", lv),
      fmt(k$median_ucl, 0), plain[[2]]
    )
  }
  cat("   ", checks, " comparisons so far\n", sep = "")
}

# ---- verdict ---------------------------------------------------------------

cat("\n", strrep("-", 78), "\n", sep = "")
if (length(failures)) {
  cat("DISAGREEMENTS (", length(failures), " of ", checks, " comparisons):\n", sep = "")
  cat(paste(unlist(failures), collapse = "\n"), "\n", sep = "")
  cat(strrep("-", 78), "\n", sep = "")
  cat("FAIL: the pipeline, this second measurement and the study's own report do not agree.\n")
  quit(status = 1)
}
cat(
  "PASS: ", checks, " comparisons. The committed ARDs, an independent recomputation\n",
  "from the vendored ADaM package, and the values the study's 2006 report printed\n",
  "all agree, for all five displays.\n",
  sep = ""
)
