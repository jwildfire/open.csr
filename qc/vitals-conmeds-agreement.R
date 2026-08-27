#!/usr/bin/env Rscript

# ==============================================================================
# Qualification of the vital signs, weight and concomitant-medication displays.
#
#   Rscript qc/vitals-conmeds-agreement.R
#
# Exits 1 on any disagreement, and writes quality/data/vitals-conmeds-agreement.json
# either way so the record of what was checked survives the run.
#
# THREE ROUTES TO THE SAME NUMBER.
#
#   Route A  the pipeline. Every statistic in the committed ARD of each display:
#            library/tfl/<slug>/*.yaml -> prepare_data() -> build_ard() -> {cards}.
#   Route B  this file. The same statistics recomputed from
#            pharmaverseadam::adsl / advs / adcm with base R, sharing NO code with
#            route A: its own safety-set filter, its own baseline join, its own
#            end-of-treatment selection, its own summary statistics and its own
#            half-up rounding. `opencsr` is never loaded, and the script refuses
#            to run if it has been.
#   Route C  quality/data/vitals-conmeds-reference.json: what the sponsor's 2006
#            clinical study report printed for the same displays, transcribed from
#            the published PDF. A SAS implementation nobody here wrote or read.
#
# Route B is checked against A exactly and against C at the precision C prints.
# Two agreeing implementations can be wrong together; a 2006 document cannot be
# talked into agreeing with them.
#
# COVERAGE IS PART OF THE CHECK. A reproducer that checks nothing passes. After
# comparing, this script asserts that every ARD row carrying a statistic these
# displays can print was visited, and that the row plan in each display.yaml
# prints no statistic outside that set. If a display starts printing a quantile,
# this script fails until it is taught to recompute one.
# ==============================================================================

suppressWarnings(suppressMessages({
  library(jsonlite)
  library(pharmaverseadam)
}))

if ("opencsr" %in% loadedNamespaces()) {
  stop("opencsr is loaded; route B must share no code with route A.", call. = FALSE)
}
for (fn in c("prepare_data", "build_ard", "render_display", "format_stat", "round_half_up")) {
  if (exists(fn, inherits = TRUE)) {
    stop(
      "Pipeline function '", fn, "' is reachable; route B must share no code with route A.",
      call. = FALSE
    )
  }
}

`%or%` <- function(x, y) if (is.null(x)) y else x

# ---- where we are ------------------------------------------------------------

repo_root <- function() {
  args <- commandArgs(trailingOnly = FALSE)
  file_arg <- grep("^--file=", args, value = TRUE)
  dir <- if (length(file_arg)) dirname(normalizePath(sub("^--file=", "", file_arg[1]))) else getwd()
  repeat {
    if (dir.exists(file.path(dir, "library", "tfl")) &&
      file.exists(file.path(dir, "docs", "design", "contracts.md"))) {
      return(dir)
    }
    parent <- dirname(dir)
    if (identical(parent, dir)) break
    dir <- parent
  }
  stop("Could not locate the open.csr repository root.", call. = FALSE)
}
root <- repo_root()

GROUPS <- c("Placebo", "Xanomeline Low Dose", "Xanomeline High Dose")
SLUGS <- c("t-vitals", "t-vitals-change", "t-weight", "t-conmeds")

# Statistics these displays are capable of printing. Anything outside this set is
# computed by {cards} but reaches no cell; anything a row plan asks for that is
# NOT in this set fails the coverage check below.
PUBLISHED_STATS <- c("N", "n", "p", "mean", "sd", "median", "min", "max")

# ---- rounding, written here rather than borrowed -----------------------------

# SAS rounds half away from zero, and every number open.csr prints goes through
# that rule rather than R's round-half-to-even. Route B implements the same rule
# from its own side: scale, split off the fraction, and treat the fraction as a
# half when it is within a few units in the last place of one. The pipeline
# reaches the same place by nudging the scaled value upward before truncating.
#
# The tolerance has to be that tight, and this was measured rather than guessed.
# An earlier version of this function pre-rounded to `digits + 3` decimals, which
# is a tolerance of 1e-4 rather than 1e-15, and it disagreed with both the
# pipeline and the 2006 report on exactly one of 1,341 statistics: the median
# change in weight at end of treatment in the high-dose group, which is
# -0.4499999999999890 and therefore genuinely below the half rather than a half
# stored imprecisely. Both other routes print -0.4; the loose tolerance printed
# -0.5. The tolerance below distinguishes the two, and still lifts 2.675 (stored
# as 2.67499999999999982) to 2.68.
half_up <- function(x, digits) {
  vapply(x, function(v) {
    if (is.na(v)) {
      return(NA_real_)
    }
    s <- if (v < 0) -1 else 1
    scaled <- abs(v) * 10^digits
    frac <- scaled - floor(scaled)
    tol <- 4 * .Machine$double.eps * max(1, scaled)
    s * (floor(scaled) + if (frac >= 0.5 - tol) 1 else 0) / 10^digits
  }, numeric(1))
}
shown <- function(x, digits) {
  if (is.na(x)) {
    return(NA_character_)
  }
  sprintf("%.*f", digits, half_up(x, digits))
}

# ---- route B: the data, derived independently --------------------------------

adsl <- as.data.frame(pharmaverseadam::adsl)
adsl <- adsl[as.character(adsl$ARM) != "Screen Failure", , drop = FALSE]
adsl <- adsl[!is.na(adsl$SAFFL) & adsl$SAFFL == "Y", , drop = FALSE]
safety_ids <- adsl$USUBJID
denominator <- vapply(GROUPS, function(g) sum(as.character(adsl$TRT01P) == g), numeric(1))

# --- ADVS ---------------------------------------------------------------------
vs_all <- as.data.frame(pharmaverseadam::advs)
vs_all <- vs_all[vs_all$USUBJID %in% safety_ids, , drop = FALSE]

vs <- vs_all[is.na(vs_all$DTYPE) & !is.na(vs_all$AVAL), , drop = FALSE]
vs$ATPTX <- ifelse(is.na(vs$ATPT), "-", as.character(vs$ATPT))
vs$SERIES <- paste(vs$USUBJID, vs$PARAMCD, vs$ATPTX, sep = "~")

# One observed record per series per analysis visit is what makes "the Week 24
# value" and "the last value" well defined. Assert it rather than assume it.
#
# Records with no AVISIT are screening, retrieval, ambulatory-ECG and unscheduled
# assessments: 13,174 of the 41,940 observed rows. They also carry no AVISITN, so
# no visit selection below can reach them, and they are excluded from this check
# rather than allowed to collide with each other under a shared NA.
named_visit <- vs[!is.na(vs$AVISIT), , drop = FALSE]
dup_visit <- sum(duplicated(paste(named_visit$SERIES, named_visit$AVISIT)))
if (dup_visit > 0) {
  stop(
    "ADVS holds ", dup_visit, " duplicate observed (subject, parameter, position, visit) ",
    "records; the baseline and end-of-treatment selections below are not well defined.",
    call. = FALSE
  )
}
stray <- sum(!is.na(vs$AVISITN) & is.na(vs$AVISIT))
if (stray > 0) {
  stop(
    stray, " observed ADVS records carry a visit number but no visit name; the ",
    "end-of-treatment window would select a record the visit checks cannot see.",
    call. = FALSE
  )
}

baseline <- vs[!is.na(vs$AVISIT) & vs$AVISIT == "Baseline", c("SERIES", "AVAL"), drop = FALSE]
names(baseline)[2] <- "BLVALUE"
vs <- merge(vs, baseline, by = "SERIES", all.x = TRUE, sort = FALSE)
vs$CHANGE <- vs$AVAL - vs$BLVALUE

# End of treatment: the last observed record of a series at a planned visit after
# Week 0 up to and including Week 24. Selected by sorting and keeping the final row
# of each series -- a different implementation of the same definition.
window <- vs[!is.na(vs$AVISITN) & vs$AVISITN > 0 & vs$AVISITN <= 24, , drop = FALSE]
window <- window[order(window$SERIES, window$AVISITN), , drop = FALSE]
eot <- window[!duplicated(window$SERIES, fromLast = TRUE), , drop = FALSE]

pick <- function(paramcd, atptx, visit) {
  src <- if (visit == "End of treatment") eot else vs
  d <- src[src$PARAMCD == paramcd & src$ATPTX == atptx, , drop = FALSE]
  if (visit != "End of treatment") {
    d <- d[!is.na(d$AVISIT) & d$AVISIT == visit, , drop = FALSE]
  }
  d
}

stats_for <- function(d, column, group) {
  x <- d[[column]][as.character(d$TRT01P) == group]
  x <- x[!is.na(x)]
  if (!length(x)) {
    return(NULL)
  }
  list(
    N = length(x), mean = mean(x), sd = stats::sd(x),
    median = stats::median(x), min = min(x), max = max(x)
  )
}

# --- ADCM ---------------------------------------------------------------------
cm <- as.data.frame(pharmaverseadam::adcm)
cm <- cm[cm$USUBJID %in% safety_ids, , drop = FALSE]

subjects_with <- function(d, g) length(unique(d$USUBJID[as.character(d$TRT01P) == g]))

# ---- route A: the committed ARDs ---------------------------------------------

read_current_ard <- function(slug) {
  cur <- fromJSON(file.path(root, "outputs", slug, "current.json"), simplifyVector = TRUE)
  doc <- fromJSON(file.path(root, cur$ard), simplifyVector = TRUE)
  rows <- doc$rows
  rows$stat <- suppressWarnings(as.numeric(vapply(rows$stat, function(s) {
    if (is.null(s) || length(s) == 0) NA_real_ else suppressWarnings(as.numeric(s[[1]]))
  }, numeric(1))))
  list(version = cur$version, path = cur$ard, rows = rows)
}

ards <- lapply(SLUGS, read_current_ard)
names(ards) <- SLUGS

row_key <- function(r, i) {
  paste(
    r$analysis[i], r$group1_level[i], r$variable[i],
    r$variable_level[i], r$group2_level[i], r$stat_name[i],
    sep = " / "
  )
}
publishable <- lapply(SLUGS, function(slug) {
  r <- ards[[slug]]$rows
  keep <- which(r$stat_name %in% PUBLISHED_STATS)
  vapply(keep, function(i) row_key(r, i), character(1))
})
names(publishable) <- SLUGS
visited <- stats::setNames(vector("list", length(SLUGS)), SLUGS)

findings <- character(0)
checks <- 0L
checks_ab <- 0L
checks_c <- 0L
fail <- function(...) findings[[length(findings) + 1L]] <<- paste0(...)

# Compare one statistic across the three routes.
#   slug     display slug
#   sel      named list of ARD selectors (analysis, group1_level, variable, ...)
#   stat     statistic name
#   b        route B value
#   ref_str  route C printed value, or NA when the reference does not print it
#   digits   precision route C prints it at
#   ref_scale multiplier taking route B's value onto route C's scale. The ARD
#            stores a percentage as a proportion in [0, 1] (contract section 5);
#            the 2006 report prints it as a percent, so those comparisons pass 100
#            here. Route A is always compared on the ARD's own scale.
compare <- function(slug, sel, stat, b, ref_str = NA_character_, digits = NA_integer_,
                    ref_scale = 1) {
  r <- ards[[slug]]$rows
  keep <- r$stat_name == stat
  for (nm in names(sel)) {
    v <- r[[nm]]
    keep <- keep & !is.na(v) & v == sel[[nm]]
  }
  if (!"group2_level" %in% names(sel)) keep <- keep & is.na(r$group2_level)
  if (!"variable_level" %in% names(sel)) {
    keep <- keep & (is.na(r$variable_level) | r$variable_level == "Y")
  }
  idx <- which(keep)
  label <- paste0(slug, " [", paste(unlist(sel), collapse = " / "), "] ", stat)
  if (length(idx) != 1L) {
    fail(label, ": matched ", length(idx), " ARD rows, expected exactly 1")
    return(invisible(NULL))
  }
  visited[[slug]] <<- c(visited[[slug]], row_key(r, idx))
  a <- r$stat[idx]
  checks <<- checks + 1L
  checks_ab <<- checks_ab + 1L
  if (is.na(a) || is.na(b) || abs(a - b) > 1e-9 * max(1, abs(b))) {
    fail(label, ": route A ", format(a, digits = 15), " vs route B ", format(b, digits = 15))
  }
  if (!is.na(ref_str)) {
    checks <<- checks + 1L
    checks_c <<- checks_c + 1L
    got <- shown(b * ref_scale, digits)
    if (!identical(got, ref_str)) {
      fail(label, ": route B prints ", got, " but the 2006 report prints ", ref_str)
    }
  }
  invisible(NULL)
}

# ---- reference ---------------------------------------------------------------

ref <- fromJSON(
  file.path(root, "quality", "data", "vitals-conmeds-reference.json"),
  simplifyVector = FALSE
)
DIG <- ref$digits

for (g in GROUPS) {
  checks <- checks + 1L
  if (!identical(as.numeric(ref$population[[g]]), unname(denominator[[g]]))) {
    fail(
      "population [", g, "]: route B ", denominator[[g]],
      " vs the 2006 report ", ref$population[[g]]
    )
  }
}

# ---- the two vital-signs displays --------------------------------------------

MEASURE <- c(SYSBP = "sbp", DIABP = "dbp", PULSE = "pulse")
POSITION <- c(
  "AFTER LYING DOWN FOR 5 MINUTES" = "lying",
  "AFTER STANDING FOR 1 MINUTE" = "stand1",
  "AFTER STANDING FOR 3 MINUTES" = "stand3"
)
VISIT <- c("Baseline" = "bl", "Week 24" = "wk24", "End of treatment" = "eot")

check_six <- function(slug, sel, b, rc) {
  compare(slug, sel, "N", b$N, format(rc$n), 0L)
  compare(slug, sel, "mean", b$mean, rc$mean, DIG$mean)
  compare(slug, sel, "sd", b$sd, rc$sd, DIG$sd)
  compare(slug, sel, "median", b$median, rc$median, DIG$median)
  compare(slug, sel, "min", b$min, rc$min, DIG$min)
  compare(slug, sel, "max", b$max, rc$max, DIG$max)
}

# `ard_column` is what the pipeline stored the statistic under; `b_column` is what
# route B derived it into. They differ for the change display on purpose: route B
# never reuses the pipeline's variable names for a value it derived itself.
check_vitals <- function(slug, ard_column, b_column) {
  cells <- ref$displays[[slug]]$cells
  for (key in names(cells)) {
    parts <- strsplit(key, "|", fixed = TRUE)[[1]]
    paramcd <- parts[1]
    atpt <- parts[2]
    visit <- parts[3]
    group <- parts[4]
    analysis <- paste(MEASURE[[paramcd]], POSITION[[atpt]], VISIT[[visit]], sep = "_")
    b <- stats_for(pick(paramcd, atpt, visit), b_column, group)
    if (is.null(b)) {
      fail(slug, " [", key, "]: route B found no observations")
      next
    }
    check_six(
      slug,
      list(analysis = analysis, group1_level = group, variable = ard_column),
      b, cells[[key]]
    )
  }
}
check_vitals("t-vitals", "AVAL", "AVAL")
check_vitals("t-vitals-change", "CHGBL", "CHANGE")

# ---- weight ------------------------------------------------------------------

for (key in names(ref$displays[["t-weight"]]$cells)) {
  parts <- strsplit(key, "|", fixed = TRUE)[[1]]
  what <- parts[1]
  visit <- parts[2]
  group <- parts[3]
  if (what == "WEIGHT") {
    analysis <- paste0("wt_", VISIT[[visit]])
    ard_column <- "AVAL"
    b_column <- "AVAL"
  } else {
    analysis <- paste0("chg_", VISIT[[visit]])
    ard_column <- "CHGBL"
    b_column <- "CHANGE"
  }
  b <- stats_for(pick("WEIGHT", "-", visit), b_column, group)
  if (is.null(b)) {
    fail("t-weight [", key, "]: route B found no observations")
    next
  }
  check_six(
    "t-weight",
    list(analysis = analysis, group1_level = group, variable = ard_column),
    b, ref$displays[["t-weight"]]$cells[[key]]
  )
}

# ---- the population analyses (they supply the column denominators) -----------

for (slug in c("t-vitals", "t-vitals-change", "t-weight")) {
  for (g in GROUPS) {
    n <- length(unique(vs_all$USUBJID[as.character(vs_all$TRT01P) == g]))
    sel <- list(analysis = "population", group1_level = g, variable = "POPFL")
    compare(slug, sel, "n", n)
    compare(slug, sel, "N", unname(denominator[[g]]), format(ref$population[[g]]), 0L)
    compare(slug, sel, "p", n / denominator[[g]])
  }
}

# ---- concomitant medications -------------------------------------------------

cmref <- ref$displays[["t-conmeds"]]
for (g in GROUPS) {
  n <- subjects_with(cm, g)
  sel <- list(analysis = "any_conmed", group1_level = g, variable = "CMFL")
  compare("t-conmeds", sel, "n", n, format(cmref$any[[g]]$n), 0L)
  compare("t-conmeds", sel, "N", unname(denominator[[g]]))
  compare(
    "t-conmeds", sel, "p", n / denominator[[g]],
    format(cmref$any[[g]]$pct), DIG$pct, ref_scale = 100
  )
}

# `ard_stack_hierarchical` also stacks a plain summary of the BY variable over the
# denominator: how many safety subjects are in each treatment group, out of how
# many in total. Its context is "categorical", so `expand_hierarchical` can never
# print it -- but it carries n, N and p, so it is recomputed here rather than
# excused, and the coverage check below counts it.
for (g in GROUPS) {
  sel <- list(
    analysis = "by_class_term", variable = "TRT01P", variable_level = g,
    context = "categorical"
  )
  compare("t-conmeds", sel, "n", unname(denominator[[g]]))
  compare("t-conmeds", sel, "N", nrow(adsl))
  compare("t-conmeds", sel, "p", denominator[[g]] / nrow(adsl))
}

for (cls in names(cmref$classes)) {
  block <- cmref$classes[[cls]]
  dcls <- cm[as.character(cm$CMCLAS) == cls, , drop = FALSE]
  for (g in GROUPS) {
    n <- subjects_with(dcls, g)
    sel <- list(
      analysis = "by_class_term", group1_level = g,
      variable = "CMCLAS", variable_level = cls
    )
    compare("t-conmeds", sel, "n", n, format(block$total[[g]]$n), 0L)
    compare("t-conmeds", sel, "N", unname(denominator[[g]]))
    compare(
      "t-conmeds", sel, "p", n / denominator[[g]],
      format(block$total[[g]]$pct), DIG$pct, ref_scale = 100
    )
  }
  for (term in names(block$terms)) {
    dterm <- dcls[as.character(dcls$CMDECOD) == term, , drop = FALSE]
    for (g in GROUPS) {
      n <- subjects_with(dterm, g)
      sel <- list(
        analysis = "by_class_term", group1_level = g,
        variable = "CMDECOD", variable_level = term, group2_level = cls
      )
      compare("t-conmeds", sel, "n", n, format(block$terms[[term]][[g]]$n), 0L)
      compare("t-conmeds", sel, "N", unname(denominator[[g]]))
      compare(
        "t-conmeds", sel, "p", n / denominator[[g]],
        format(block$terms[[term]][[g]]$pct), DIG$pct, ref_scale = 100
      )
    }
  }
}

# ---- coverage ----------------------------------------------------------------

coverage <- list()
for (slug in SLUGS) {
  want <- unique(publishable[[slug]])
  got <- unique(visited[[slug]])
  missing <- setdiff(want, got)
  coverage[[slug]] <- list(
    publishable = length(want), recomputed = length(got), unchecked = length(missing)
  )
  if (length(missing)) {
    fail(
      slug, ": ", length(missing), " ARD statistic(s) a cell could print were not ",
      "recomputed by route B; first is ", missing[1]
    )
  }
}

# And no row plan may print a statistic outside the set route B recomputes.
PATTERN_STATS <- list(
  n = "n", N = "N", n_pct = c("n", "p"), pct = "p",
  continuous = c("mean", "sd"), mean_sd = c("mean", "sd"),
  median = "median", median_range = c("median", "min", "max"),
  range = c("min", "max"), q1_q3 = c("p25", "p75"), value = "value"
)
pattern_stats <- function(p) {
  if (!is.null(PATTERN_STATS[[p]])) {
    return(PATTERN_STATS[[p]])
  }
  toks <- regmatches(p, gregexpr("\\{[^}]+\\}", p))[[1]]
  if (!length(toks)) {
    stop("Unknown row pattern '", p, "'.", call. = FALSE)
  }
  substr(toks, 2, nchar(toks) - 1)
}
for (slug in SLUGS) {
  spec <- yaml::read_yaml(file.path(root, "library", "tfl", slug, "display.yaml"))
  for (r in spec$rows) {
    if (isTRUE(r$section)) next
    for (st in pattern_stats(r$pattern %or% "n_pct")) {
      if (!st %in% PUBLISHED_STATS) {
        fail(slug, ": a row prints statistic '", st, "', which route B does not recompute")
      }
    }
  }
}

# ---- record ------------------------------------------------------------------

ok <- length(findings) == 0L
doc <- list(
  schema = "opencsr/agreement/v1",
  subject = "vital signs, weight and concomitant medications",
  generated = format(as.POSIXlt(Sys.time(), tz = "UTC"), "%Y-%m-%dT%H:%M:%SZ"),
  reproducer = "qc/vitals-conmeds-agreement.R",
  routes = list(
    A = "the open.csr pipeline, via each display's committed outputs/<slug>/current ARD",
    B = paste(
      "recomputed in qc/vitals-conmeds-agreement.R from pharmaverseadam::adsl / advs / adcm,",
      "sharing no code with the pipeline"
    ),
    C = paste(
      "quality/data/vitals-conmeds-reference.json, transcribed from the sponsor's",
      "clinical study report of 27 June 2006"
    )
  ),
  environment = list(
    r = paste(R.version$major, R.version$minor, sep = "."),
    os = paste(Sys.info()[["sysname"]], Sys.info()[["release"]]),
    pharmaverseadam = as.character(utils::packageVersion("pharmaverseadam"))
  ),
  displays = lapply(SLUGS, function(s) {
    list(
      display = s, version = ards[[s]]$version, ard = ards[[s]]$path,
      reference = ref$displays[[s]]$reference,
      publishable_statistics = coverage[[s]]$publishable,
      recomputed = coverage[[s]]$recomputed,
      unchecked = coverage[[s]]$unchecked
    )
  }),
  comparisons = checks,
  # The split, so a summary of this run never has to be arrived at by arithmetic.
  # `pipeline_vs_recomputation` is every publishable statistic, measured twice;
  # `recomputation_vs_report` is the subset the 2006 document also prints.
  pipeline_vs_recomputation = checks_ab,
  recomputation_vs_report = checks_c,
  ok = ok,
  findings = if (ok) list() else as.list(findings)
)
out <- file.path(root, "quality", "data", "vitals-conmeds-agreement.json")
writeLines(toJSON(doc, auto_unbox = TRUE, pretty = 2, null = "null"), out)

message(sprintf(
  "%d comparisons across %d displays (%d pipeline vs recomputation, %d recomputation vs the 2006 report) -> %s",
  checks, length(SLUGS), checks_ab, checks_c, out
))
for (s in SLUGS) {
  message(sprintf(
    "  %-16s %s  %d publishable statistics, %d recomputed, %d unchecked",
    s, ards[[s]]$version, coverage[[s]]$publishable,
    coverage[[s]]$recomputed, coverage[[s]]$unchecked
  ))
}
if (!ok) {
  message("\nDISAGREEMENT (", length(findings), "):")
  for (f in findings) message("  ", f)
  quit(status = 1)
}
message("\nAll three routes agree.")
