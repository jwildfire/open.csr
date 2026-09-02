#!/usr/bin/env Rscript
# Do open.csr's populations and end-of-study displays agree with the report the
# CDISC pilot itself published?
#
# Four displays are held to the report: t-populations (DST02) and t-end-of-study
# (DST03) rebuild Tables 14-1.01 and 14-1.02; t-demographics (DMT01) rebuilds
# Table 14-2.01 and t-exposure (EXT01) Table 14-4.01 (#61, D0032).
# t-populations (DST02) and t-end-of-study (DST03) rebuild Tables 14-1.01 and
# 14-1.02 of the CDISCPILOT01 clinical study report. Those tables were produced
# in 2006 by SAS programs (adsl1.sas, adsl2.sas) written by a different team, on
# the same subject-level data. That makes the printed report the strongest
# second measurement available: it shares no code with this repository, and it
# cannot be tuned after the fact.
#
# Three routes have to land on the same cell:
#
#   A  a from-scratch recomputation, below. It reads the vendored adsl.xpt.gz
#      with {haven} and NEVER loads {opencsr}: the analysis definitions are
#      restated here in plain R rather than read out of library/tfl/*/analysis.yaml,
#      because a check that reuses the spec under test only proves the spec is
#      self-consistent.
#   B  the cell text parsed out of the committed table.html — what the pipeline
#      actually published, not what it could publish if re-run.
#   C  quality/data/reference-report-agreement.json — the 2006 report,
#      transcribed by hand.
#
# Any disagreement between any two of them is exit status 1.
#
# Usage:
#   Rscript qc/reference-report-agreement.R           # check
#   Rscript qc/reference-report-agreement.R --verbose # print every cell
#   Rscript qc/reference-report-agreement.R --self-test
#       Perturb each route in turn and confirm the comparison catches it. A green
#       check nobody has seen fail is not evidence.
#   Rscript qc/reference-report-agreement.R --verify-transcription [--pdf <path>]
#       Re-read the report itself and require route C to match it. Route C is the
#       only route that cannot be re-derived from this repository, so it is the
#       only one where a mistake survives a green check; it did, twice. Needs the
#       network and pdftotext, so it is a maintainer command, not a CI step.

args <- commandArgs(trailingOnly = TRUE)
verbose <- "--verbose" %in% args
self_test <- "--self-test" %in% args
verify_transcription <- "--verify-transcription" %in% args

root <- getwd()
while (!file.exists(file.path(root, "docs", "design", "contracts.md"))) {
  parent <- dirname(root)
  if (identical(parent, root)) stop("Could not locate the open.csr repository root.")
  root <- parent
}

record_path <- file.path(root, "quality", "data", "reference-report-agreement.json")
adsl_path <- file.path(root, "pipeline", "inst", "extdata", "phuse-cdiscpilot01", "adsl.xpt.gz")

record <- jsonlite::fromJSON(record_path, simplifyVector = FALSE)

# base R only gained `%||%` in 4.4; DESCRIPTION pins a 4.1 floor.
`%||%` <- function(x, y) if (is.null(x)) y else x

# ---- route A: recomputation, no {opencsr} -----------------------------------

adsl <- haven::read_xpt(memDecompress(readBin(adsl_path, "raw", file.size(adsl_path)), type = "gzip"))

blank_na <- function(x) {
  x <- as.character(x)
  x[is.na(x)] <- ""
  x
}

# Facts the two displays' footnotes assert. Asserted here rather than assumed:
# each one is a claim a reader could check, so a change in the data has to break
# this script rather than quietly change a footnote's meaning.
stopifnot(
  nrow(adsl) == 254,
  !any(blank_na(adsl$ARM) == "Screen Failure"),
  all(blank_na(adsl$ITTFL) == "Y"),
  all(blank_na(adsl$TRT01P) == blank_na(adsl$TRT01A)),
  all(blank_na(adsl$COMP24FL) %in% c("Y", "N"))
)

arms <- c("Placebo", "Xanomeline Low Dose", "Xanomeline High Dose")
trt <- blank_na(adsl$TRT01P)
col_n <- c(vapply(arms, function(a) sum(trt == a), numeric(1)), Total = nrow(adsl))

# SAS rounds half away from zero; R's round() rounds half to even. The report
# was produced by SAS, so the recomputation has to round the SAS way.
round_half_up <- function(x, digits = 0) {
  scale <- 10^digits
  sign(x) * floor(abs(x) * scale * (1 + 2 * .Machine$double.eps) + 0.5) / scale
}

fmt_n_pct <- function(n, N) sprintf("%d (%d%%)", n, as.integer(round_half_up(100 * n / N)))

# The analysis definitions, restated from the report and the SAP. Each is a
# subject-level logical over ADSL.
early <- blank_na(adsl$COMP24FL) == "N"
reason <- blank_na(adsl$DCREASCD)

definitions <- list(
  "t-populations" = list(
    itt = blank_na(adsl$ITTFL) == "Y",
    safety = blank_na(adsl$SAFFL) == "Y",
    efficacy = blank_na(adsl$EFFFL) == "Y",
    complete_wk24 = blank_na(adsl$COMP24FL) == "Y",
    # "Complete Study" is the complement of the study's own DISCONFL.
    complete_study = blank_na(adsl$DISCONFL) != "Y"
  ),
  "t-end-of-study" = list(
    completed_wk24 = blank_na(adsl$COMP24FL) == "Y",
    early_term = early,
    completion_missing = !(blank_na(adsl$COMP24FL) %in% c("Y", "N")),
    et_ae = early & reason == "Adverse Event",
    et_death = early & reason == "Death",
    et_loe = early & reason == "Lack of Efficacy",
    et_ltfu = early & reason == "Lost to Follow-up",
    et_withdrew = early & reason == "Withdrew Consent",
    et_physician = early & reason == "Physician Decision",
    et_ie = early & reason == "I/E Not Met",
    et_protocol = early & reason == "Protocol Violation",
    et_sponsor = early & reason == "Sponsor Decision",
    et_missing = early & reason == ""
  )
)

# SAP section 9.7.1.2: protocol completion, lack of efficacy and adverse event
# are compared with Fisher's exact test. One test per row, across all three
# treatment groups at once, which is why the report prints one p-value per row
# rather than one per active arm.
fisher_rows <- c("completed_wk24", "et_ae", "et_loe")

fisher_p <- function(flag) {
  k <- vapply(arms, function(a) sum(trt == a & flag), numeric(1))
  n <- vapply(arms, function(a) sum(trt == a), numeric(1))
  stats::fisher.test(rbind(k, n - k))$p.value
}

fmt_p <- function(p) if (p < 0.0001) "<.0001" else formatC(p, format = "f", digits = 4)

# The demographics and exposure tables are continuous summaries and category
# counts rather than subject flags. Recomputed here in base R, SAS rounding, with
# the report's own presentation rules: a share under one half of a percent prints
# "<1%", a count of nobody prints as a bare 0.
fmt_num <- function(x, digits) formatC(round_half_up(x, digits), format = "f", digits = digits)
fmt_n_pct_demo <- function(n, N) {
  if (n == 0) return("0")
  pct <- 100 * n / N
  shown <- if (pct > 0 && round_half_up(pct, 0) == 0) "<1" else as.character(as.integer(round_half_up(pct, 0)))
  sprintf("%d (%s%%)", n, shown)
}
summ_cells <- function(x_by_group, stat, digits) {
  vapply(x_by_group, function(x) {
    x <- x[!is.na(x)]
    switch(stat,
      N = as.character(length(x)),
      mean = fmt_num(mean(x), digits), sd = fmt_num(stats::sd(x), digits),
      median = fmt_num(stats::median(x), digits), min = fmt_num(min(x), digits), max = fmt_num(max(x), digits)
    )
  }, character(1))
}
anova_p <- function(x, g) summary(stats::aov(x ~ factor(g)))[[1]][["Pr(>F)"]][[1]]
chisq_p <- function(x, g) suppressWarnings(stats::chisq.test(table(g, x), correct = FALSE))$p.value

# Race (Origin), restated from the report: Hispanic by ethnicity first, then race.
race_origin <- function(race, ethnic) {
  ifelse(ethnic == "HISPANIC OR LATINO", "Hispanic",
    ifelse(race == "WHITE", "Caucasian", ifelse(race == "BLACK OR AFRICAN AMERICAN", "African Descent", "Other")))
}

demo_digits <- c(mean = 1, sd = 2, median = 1, min = 1, max = 1)
demo_vars <- list(
  age = "AGE", mmse = "MMSETOT", durdis = "DURDIS", educ = "EDUCLVL",
  weight = "WEIGHTBL", height = "HEIGHTBL", bmi = "BMIBL"
)
demo_cats <- list(
  agegr = list(var = "AGEGR1", levels = c("<65", "65-80", ">80")),
  sex = list(var = "SEX", levels = c("M", "F")),
  raceor = list(var = "RACEOR", levels = c("Caucasian", "African Descent", "Hispanic", "Other")),
  durdisgr = list(var = "DURDSGR1", levels = c("<12", ">=12")),
  bmigr = list(var = "BMIBLGR1", levels = c("<25", "25-<30", ">=30"))
)

route_a_demographics <- function(perturb = FALSE) {
  d <- as.data.frame(adsl)
  d <- d[blank_na(d$ITTFL) == "Y", , drop = FALSE]
  d$RACEOR <- race_origin(blank_na(d$RACE), blank_na(d$ETHNIC))
  if (perturb) d$AGE[1] <- d$AGE[1] + 40
  g <- blank_na(d$TRT01P)
  by_group <- function(x) c(lapply(arms, function(a) x[g == a]), list(x))
  out <- list()
  for (nm in names(demo_vars)) {
    x <- as.numeric(d[[demo_vars[[nm]]]])
    out[[paste0(nm, ":N")]] <- c(summ_cells(by_group(x), "N", 0), fmt_p(anova_p(x[!is.na(x)], g[!is.na(x)])))
    for (st in c("mean", "sd", "median", "min", "max")) {
      out[[paste0(nm, ":", st)]] <- c(summ_cells(by_group(x), st, demo_digits[[st]]), "")
    }
  }
  for (nm in names(demo_cats)) {
    v <- blank_na(d[[demo_cats[[nm]]$var]])
    N <- c(vapply(arms, function(a) sum(g == a & nzchar(v)), numeric(1)), sum(nzchar(v)))
    p <- fmt_p(chisq_p(v[nzchar(v)], g[nzchar(v)]))
    if (nm %in% c("sex", "raceor")) out[[paste0(nm, ":N")]] <- c(as.character(N), p)
    for (i in seq_along(demo_cats[[nm]]$levels)) {
      lv <- demo_cats[[nm]]$levels[i]
      n <- c(vapply(arms, function(a) sum(g == a & v == lv), numeric(1)), sum(v == lv))
      cells <- vapply(seq_along(n), function(j) fmt_n_pct_demo(n[j], N[j]), character(1))
      # a sub-block with no n row prints its test beside its first level
      out[[paste0(nm, ":", lv)]] <- c(cells, if (i == 1 && !nm %in% c("sex", "raceor")) p else "")
    }
  }
  out
}

route_a_exposure <- function(perturb = FALSE) {
  d <- as.data.frame(adsl)
  d <- d[blank_na(d$SAFFL) == "Y", , drop = FALSE]
  if (perturb) d$AVGDD[1] <- d$AVGDD[1] + 1
  g <- blank_na(d$TRT01P)
  comp <- blank_na(d$COMP24FL) == "Y"
  out <- list()
  for (an in c(avg_daily_dose = "AVGDD", total_dose = "CUMDOSE")) {
    nm <- names(which(c(avg_daily_dose = "AVGDD", total_dose = "CUMDOSE") == an))
    x <- as.numeric(d[[an]])
    groups <- c(lapply(arms, function(a) x[g == a & comp]), lapply(arms, function(a) x[g == a]))
    for (st in c("N", "mean", "sd", "median", "min", "max")) {
      digits <- if (st == "N") 0 else demo_digits[[st]]
      # no p-value column on this table; the empty seventh cell matches the record's
      out[[paste0(nm, ":", st)]] <- c(summ_cells(groups, st, digits), "")
    }
  }
  out
}

# The incidence tables: subjects with an event, the percentage of the arm, the
# number of events, and Fisher's exact test of placebo against each active arm —
# from the vendored ADAE and ADSL, in base R.
adae_path <- file.path(root, "pipeline", "inst", "extdata", "phuse-cdiscpilot01", "adae.xpt.gz")
adae <- haven::read_xpt(memDecompress(readBin(adae_path, "raw", file.size(adae_path)), type = "gzip"))

fmt_fisher_ref <- function(p) {
  if (is.na(p)) return("")
  s <- if (p >= 0.995) ">0.99" else formatC(round_half_up(p, 3), format = "f", digits = 3)
  if (s != "0.000" && grepl("0$", s)) s <- sub("0$", "", s)
  if (p < 0.15) paste0(s, "*") else s
}
incidence_line <- function(ids_by_arm, events_by_arm) {
  N <- col_n[seq_along(arms)]
  n <- vapply(ids_by_arm, length, numeric(1))
  cells <- vapply(seq_along(arms), function(i) {
    if (n[i] == 0) "0" else sprintf("%d (%s%%) [%d]", n[i], fmt_num(100 * n[i] / N[i], 1), events_by_arm[i])
  }, character(1))
  ps <- vapply(2:3, function(i) {
    if (n[1] == 0 && n[i] == 0) return("")
    fmt_fisher_ref(stats::fisher.test(rbind(c(n[1], n[i]), c(N[1] - n[1], N[i] - n[i])))$p.value)
  }, character(1))
  c(cells, ps)
}
route_a_incidence <- function(serious = FALSE, perturb = FALSE) {
  d <- as.data.frame(adae)
  d <- d[blank_na(d$TRTEMFL) == "Y", , drop = FALSE]
  if (serious) d <- d[blank_na(d$AESER) == "Y", , drop = FALSE]
  d$ARM <- trt[match(d$USUBJID, adsl$USUBJID)]
  d <- d[d$USUBJID %in% adsl$USUBJID[blank_na(adsl$SAFFL) == "Y"], , drop = FALSE]
  if (perturb) d <- d[-1, , drop = FALSE]
  line_for <- function(sub) {
    incidence_line(
      lapply(arms, function(a) unique(sub$USUBJID[sub$ARM == a])),
      vapply(arms, function(a) sum(sub$ARM == a), numeric(1))
    )
  }
  out <- list(any = line_for(d))
  for (soc in sort(unique(blank_na(d$AEBODSYS)))) {
    in_soc <- d[blank_na(d$AEBODSYS) == soc, , drop = FALSE]
    out[[paste0("soc:", soc)]] <- line_for(in_soc)
    for (pt in sort(unique(blank_na(in_soc$AEDECOD)))) {
      out[[paste0("pt:", soc, "|", pt)]] <- line_for(in_soc[blank_na(in_soc$AEDECOD) == pt, , drop = FALSE])
    }
  }
  out
}

route_a <- function(slug, perturb = FALSE) {
  if (slug == "t-ae-incidence") return(route_a_incidence(FALSE, perturb))
  if (slug == "t-sae-incidence") return(route_a_incidence(TRUE, perturb))
  if (slug == "t-demographics") return(route_a_demographics(perturb))
  if (slug == "t-exposure") return(route_a_exposure(perturb))
  defs <- definitions[[slug]]
  out <- list()
  for (nm in names(defs)) {
    flag <- defs[[nm]]
    if (perturb && nm == names(defs)[1]) flag[which(flag)[1]] <- FALSE
    cells <- c(
      vapply(seq_along(arms), function(i) fmt_n_pct(sum(trt == arms[i] & flag), col_n[i]), character(1)),
      fmt_n_pct(sum(flag), col_n[["Total"]])
    )
    p <- if (nm %in% fisher_rows) fmt_p(fisher_p(flag)) else ""
    out[[nm]] <- c(cells, p)
  }
  out
}

# ---- route B: the committed rendered display --------------------------------

# gt writes each body row as one <th id="stub_1_N"> holding the row label
# followed by one <td headers="stub_1_N colJ"> per column, so the published
# cells can be read back out of the artifact without a HTML parser.
strip_tags <- function(x) gsub("<[^>]*>", "", x)

unescape <- function(x) {
  x <- gsub("&amp;", "&", x, fixed = TRUE)
  x <- gsub("&lt;", "<", x, fixed = TRUE)
  x <- gsub("&gt;", ">", x, fixed = TRUE)
  gsub("&nbsp;", " ", x, fixed = TRUE)
}

# Footnote markers on the display's row labels ("Adverse Event [1]") are
# presentation; the report carries its own ("Lack of Efficacy[2]"). Neither is
# part of the row's identity.
norm_label <- function(x) {
  x <- unescape(x)
  x <- gsub("\u00a0", " ", x)
  x <- gsub("\\[[0-9]+\\]", "", x)
  trimws(gsub("[[:space:]]+", " ", x))
}

norm_cell <- function(x) {
  x <- unescape(x)
  x <- gsub("\u00a0", " ", x)
  x <- gsub("\\(\\s+", "(", x)
  trimws(gsub("[[:space:]]+", " ", x))
}

route_b <- function(slug, perturb = FALSE) {
  cur <- jsonlite::fromJSON(file.path(root, "outputs", slug, "current.json"), simplifyVector = TRUE)
  html <- paste(readLines(file.path(root, cur$table), warn = FALSE), collapse = "\n")
  # The perturbation has to reach every display, whatever its cells say: bump the
  # first published cell of the first column by a leading digit.
  if (perturb) html <- sub('(<td headers="stub_1_[0-9]+ col1"[^>]*>)([0-9])', "\\19\\2", html)
  stubs <- regmatches(html, gregexpr('<th id="stub_1_[0-9]+"[^>]*>.*?</th>', html))[[1]]
  ids <- as.integer(sub('^<th id="stub_1_([0-9]+)".*$', "\\1", stubs))
  labels <- norm_label(strip_tags(stubs))
  rows <- list()
  for (i in seq_along(ids)) {
    tds <- regmatches(
      html,
      gregexpr(sprintf('<td headers="stub_1_%d col[0-9]+"[^>]*>.*?</td>', ids[i]), html)
    )[[1]]
    rows[[i]] <- list(label = labels[i], cells = norm_cell(strip_tags(tds)))
  }
  # Section headings render as a labelled row with every cell empty.
  rows <- Filter(function(r) any(nzchar(r$cells)), rows)
  spec <- record$displays[[slug]]
  needs_map <- any(vapply(spec$rows, function(r) !is.null(r$published_from), logical(1)))
  if (!needs_map) {
    return(rows)
  }
  # The report and the rendered display do not share a layout: each record row
  # says which rendered rows, by label and occurrence, supply its cells.
  lapply(spec$rows, function(r) {
    cells <- unlist(lapply(r$published_from, function(pf) {
      hits <- Filter(function(x) identical(x$label, norm_label(pf$label)), rows)
      if (length(hits) < pf$occurrence) {
        stop(slug, ": the rendered display has no occurrence ", pf$occurrence, " of a row labelled '", pf$label, "'.", call. = FALSE)
      }
      hits[[pf$occurrence]]$cells[unlist(pf$columns)]
    }))
    list(label = norm_label(r$label), cells = cells)
  })
}

# ---- route C: the transcribed report ----------------------------------------

route_c <- function(slug, perturb = FALSE) {
  spec <- record$displays[[slug]]
  lapply(spec$rows, function(r) {
    printed <- vapply(r$printed, function(x) norm_cell(x), character(1))
    if (perturb) printed[1] <- norm_cell("99 ( 99%)")
    ps <- if (!is.null(r$p_values_printed)) {
      vapply(r$p_values_printed, function(x) x %||% "", character(1))
    } else if (is.null(r$p_value_printed)) {
      ""
    } else {
      r$p_value_printed
    }
    list(
      analysis = r$analysis,
      label = norm_label(r$label),
      cells = c(unname(printed), unname(ps))
    )
  })
}

# ---- verifying route C against the source document --------------------------

# Routes A and B are re-derived from files in this repository every time the
# script runs, so a mistake in either shows up as a disagreement. Route C cannot
# be: it is typed. Nothing in the repository can contradict it, which makes it
# the one route where an error survives a green check — and where an error is
# worst, because the specs are written from the same reading, so all three routes
# agree on the same mistake.
#
# This mode closes that hole. It reads the report itself, extracts the two pages
# this record transcribes, and requires the record to match. It needs the network
# and poppler's pdftotext, so it is a maintainer command rather than a CI step
# (see `not_in_ci` in the record); run it whenever the record is edited.
#
#   Rscript qc/reference-report-agreement.R --verify-transcription
#   Rscript qc/reference-report-agreement.R --verify-transcription --pdf /path/to.pdf
#   Rscript qc/reference-report-agreement.R --verify-transcription --self-test

source_doc <- record$reference$source_document

locate_pdf <- function() {
  explicit <- if ("--pdf" %in% args) args[which(args == "--pdf") + 1] else ""
  from_env <- Sys.getenv("OPENCSR_PILOT_PDF", "")
  for (p in c(explicit, from_env)) {
    if (nzchar(p) && file.exists(p)) return(p)
  }
  url <- sprintf(
    "https://raw.githubusercontent.com/%s/%s/%s",
    source_doc$repository, source_doc$commit, source_doc$path
  )
  dest <- tempfile(fileext = ".pdf")
  cat("  fetching the report from", url, "\n")
  status <- utils::download.file(url, dest, quiet = TRUE, mode = "wb")
  if (!identical(status, 0L) || !file.exists(dest)) {
    stop("could not fetch the source document; pass --pdf <path> instead.", call. = FALSE)
  }
  dest
}

# The report page is fixed-width text: a data row is a label followed by exactly
# four "n ( p%)" cells and an optional p-value. Parsing it this way rather than
# by column position means a shifted margin cannot silently drop a column.
# A printed cell: a count with its percentage ("14 ( 16%)", "1 ( <1%)"), or a
# bare number ("75.2", "0"). Labels can carry digits too ("65-80 yrs", "[2]"),
# so a line's cells are the LAST n_cells matches, a trailing four-decimal
# p-value is read as the p-value column, and the text before the first cell is
# the label. Header, footer and note lines are skipped by name.
cell_pattern <- "(<\\.0001|<?[0-9]+(\\.[0-9]+)?([[:space:]]*\\([[:space:]]*<?[0-9]+(\\.[0-9])?%\\))?([[:space:]]*\\[[0-9]+\\])?)"
pvalue_pattern <- "^(<\\.0001|[0-9]\\.[0-9]{4})$"
fisher_pattern <- "(>0\\.99|0\\.[0-9]{2,3})\\*?"
# the incidence tables print "n ( p.p%) [events]" or a bare 0 — never a bare decimal, which is a p-value
incidence_cell_pattern <- "[0-9]+[[:space:]]*\\([[:space:]]*[0-9]+\\.[0-9]%\\)[[:space:]]*\\[[0-9]+\\]|(?<![[:alnum:].])0(?![[:alnum:].%])"
skip_pattern <- "\\(N=|^[[:space:]]*(Protocol:|Population:|Table 14|Source:|NOTE:|Note:|\\[1\\]|Summary|Incidence|Placebo|Xanomeline|System Organ|Preferred Term|square|definite|group\\.?[[:space:]]*$)"

parse_report_page <- function(pdf, page, n_cells = 4, allow_p = TRUE, p_columns = 1) {
  out <- tempfile(fileext = ".txt")
  status <- suppressWarnings(system2(
    "pdftotext",
    c("-layout", "-f", page, "-l", page, shQuote(pdf), shQuote(out)),
    stdout = FALSE, stderr = FALSE
  ))
  if (!identical(as.integer(status), 0L) || !file.exists(out)) {
    stop(
      "pdftotext failed (is poppler installed? `brew install poppler` / ",
      "`apt-get install poppler-utils`).",
      call. = FALSE
    )
  }
  lines <- readLines(out, warn = FALSE)
  # Where the report prints two p-value columns, a lone p-value is assigned by
  # where it sits on the line relative to the "High Dose" header.
  high_at <- NA_integer_
  for (l in lines) if (grepl("Low Dose", l) && grepl("High Dose", l)) high_at <- regexpr("High Dose", l)
  rows <- list()
  for (line in lines) {
    if (!nzchar(trimws(line)) || grepl(skip_pattern, line)) next
    m <- if (p_columns == 2) gregexpr(incidence_cell_pattern, line, perl = TRUE)[[1]] else gregexpr(cell_pattern, line)[[1]]
    if (m[1] == -1 || length(m) < n_cells) {
      # a label wrapped onto its own line continues the previous row's label
      if (p_columns == 2 && length(rows) && !grepl("[0-9]", line) && nzchar(trimws(line))) {
        rows[[length(rows)]]$label <- norm_label(paste(rows[[length(rows)]]$label, trimws(line)))
      }
      next
    }
    starts <- as.integer(m)
    lens <- attr(m, "match.length")
    txt <- vapply(seq_along(starts), function(i) substr(line, starts[i], starts[i] + lens[i] - 1), character(1))
    p <- ""
    if (p_columns == 2) {
      idx <- seq.int(length(txt) - n_cells + 1, length(txt))
      # the p-values follow the last cell; anything matching the Fisher form is one
      tail_from <- starts[idx[n_cells]] + lens[idx[n_cells]]
      tail_txt <- substr(line, tail_from, nchar(line))
      pm <- gregexpr(fisher_pattern, tail_txt)[[1]]
      ps <- if (pm[1] == -1) character(0) else regmatches(tail_txt, list(pm))[[1]]
      pos <- if (pm[1] == -1) integer(0) else tail_from + as.integer(pm) - 1L
      p <- c("", "")
      if (length(ps) == 2) p <- ps
      if (length(ps) == 1) p[if (!is.na(high_at) && pos[1] >= high_at - 2) 2 else 1] <- ps
      cells <- vapply(txt[idx], norm_cell, character(1))
      label <- norm_label(substr(line, 1, starts[idx[1]] - 1))
      rows[[length(rows) + 1]] <- list(label = label, cells = unname(cells), p = p)
      next
    }
    if (allow_p && length(txt) >= n_cells + 1 && grepl(pvalue_pattern, trimws(txt[length(txt)]))) {
      p <- trimws(txt[length(txt)])
      keep <- seq_len(length(txt) - 1)
      txt <- txt[keep]; starts <- starts[keep]; lens <- lens[keep]
    }
    idx <- seq.int(length(txt) - n_cells + 1, length(txt))
    cells <- vapply(txt[idx], norm_cell, character(1))
    label <- norm_label(substr(line, 1, starts[idx[1]] - 1))
    rows[[length(rows) + 1]] <- list(label = label, cells = unname(cells), p = p)
  }
  list(lines = lines, rows = rows)
}

verify_transcription_run <- function(mutate = NULL) {
  bad <- character(0)
  pdf <- locate_pdf()

  got <- digest::digest(file = pdf, algo = "sha256")
  if (!identical(got, source_doc$sha256)) {
    return(sprintf(
      "  the document is not the one this record was written from:\n    expected sha256 %s\n    got      sha256 %s",
      source_doc$sha256, got
    ))
  }

  for (slug in names(record$displays)) {
    page <- unlist(source_doc$pages[[slug]])
    spec <- record$displays[[slug]]
    n_cells <- spec$n_cells %||% 4
    parsed <- list(lines = character(0), rows = list())
    for (pg in page) {
      one <- parse_report_page(pdf, pg, n_cells = n_cells, allow_p = n_cells == 4, p_columns = spec$p_columns %||% 1)
      parsed$lines <- c(parsed$lines, one$lines)
      parsed$rows <- c(parsed$rows, one$rows)
    }
    printed <- parsed$rows
    expected <- record$displays[[slug]]$rows
    if (!is.null(mutate)) expected <- mutate(expected)

    if (length(printed) != length(expected)) {
      bad <- c(bad, sprintf(
        "  %s: page(s) %s of the report have %d data rows, the record has %d",
        slug, paste(page, collapse = "-"), length(printed), length(expected)
      ))
      next
    }
    for (i in seq_along(expected)) {
      e <- expected[[i]]
      p <- printed[[i]]
      # `report_label` is what the report prints before the cells (the block name
      # shares the line with the first row); `label` is what the display prints.
      want_label <- norm_label(e$report_label %||% e$label)
      if (!identical(want_label, p$label)) {
        bad <- c(bad, sprintf(
          "  %s row %d: record label '%s', report prints '%s'",
          slug, i, want_label, p$label
        ))
      }
      rec_cells <- vapply(e$printed, norm_cell, character(1))
      if (!identical(unname(rec_cells), p$cells)) {
        bad <- c(bad, sprintf(
          "  %s / %s: record cells %s, report prints %s",
          slug, e$analysis,
          paste(rec_cells, collapse = " | "), paste(p$cells, collapse = " | ")
        ))
      }
      rec_p <- if (!is.null(e$p_values_printed)) vapply(e$p_values_printed, function(x) x %||% "", character(1)) else e$p_value_printed %||% ""
      if (!identical(unname(rec_p), unname(p$p))) {
        bad <- c(bad, sprintf(
          "  %s / %s: record p-value '%s', report prints '%s'",
          slug, e$analysis, paste(rec_p, collapse = " | "), paste(p$p, collapse = " | ")
        ))
      }
    }
    # The population the table was run on is part of what it claims, and the two
    # tables in this pair state different ones. Getting them the wrong way round
    # is exactly the error this mode was written after.
    stated <- grep("^Population:", trimws(parsed$lines), value = TRUE)[1]
    claimed <- record$reference$tables[[slug]]
    want <- trimws(sub("^Population:", "", stated %||% ""))
    if (!nzchar(want) || !grepl(want, claimed, fixed = TRUE)) {
      bad <- c(bad, sprintf(
        "  %s: the report states 'Population: %s'; the record describes it as '%s'",
        slug, want, claimed
      ))
    }
  }
  bad
}

if (verify_transcription) {
  if (self_test) {
    cat("Self-test: the record perturbed, then left alone.\n")
    failures <- character(0)
    caught <- verify_transcription_run(mutate = function(rows) {
      rows[[1]]$printed[[1]] <- "99 ( 99%)"
      rows
    })
    if (length(caught)) {
      cat(sprintf("  ok   perturbing the record was caught (%d line(s))\n", length(caught)))
    } else {
      cat("  FAIL perturbing the record went UNDETECTED\n")
      failures <- c(failures, "mutated")
    }
    clean <- verify_transcription_run()
    if (length(clean)) {
      cat("  FAIL the unperturbed record does not match the report:\n")
      cat(paste(clean, collapse = "\n"), "\n", sep = "")
      failures <- c(failures, "clean")
    } else {
      cat("  ok   the unperturbed record matches the report\n")
    }
    quit(status = if (length(failures)) 1 else 0)
  }

  bad <- verify_transcription_run()
  if (length(bad)) {
    cat("TRANSCRIPTION DISAGREES WITH THE SOURCE REPORT —", length(bad), "problem(s):\n")
    cat(paste(bad, collapse = "\n"), "\n", sep = "")
    quit(status = 1)
  }
  n_rows <- sum(vapply(record$displays, function(d) length(d$rows), numeric(1)))
  cat(sprintf(
    "OK: all %d transcribed rows across %d tables match pages %s of %s (sha256 %s).\n",
    n_rows, length(record$displays),
    paste(unlist(source_doc$pages), collapse = ", "),
    basename(source_doc$path), substr(source_doc$sha256, 1, 12)
  ))
  quit(status = 0)
}

# ---- comparison -------------------------------------------------------------

# A difference the record declares, with the two strings it declares. Nothing
# else is allowed to differ, and a declared one is required to still differ.
known_difference <- function(slug, analysis, column) {
  for (k in record$displays[[slug]]$known_differences %||% list()) {
    if (identical(k$analysis, analysis) && identical(as.integer(k$column), as.integer(column))) return(k)
  }
  NULL
}

compare <- function(slug, perturb = NULL) {
  a <- route_a(slug, perturb = identical(perturb, "a"))
  b <- route_b(slug, perturb = identical(perturb, "b"))
  c_ <- route_c(slug, perturb = identical(perturb, "c"))
  bad <- character(0)

  if (length(b) != length(c_)) {
    return(sprintf(
      "  %s: the published display has %d data rows, the report has %d",
      slug, length(b), length(c_)
    ))
  }
  for (i in seq_along(c_)) {
    ref <- c_[[i]]
    pub <- b[[i]]
    rec <- a[[ref$analysis]]
    if (is.null(rec)) {
      bad <- c(bad, sprintf("  %s / %s: no recomputation is defined for this row", slug, ref$analysis))
      next
    }
    if (!identical(pub$label, ref$label)) {
      bad <- c(bad, sprintf(
        "  %s row %d: published label '%s', report label '%s'", slug, i, pub$label, ref$label
      ))
    }
    n_cols <- length(ref$cells)
    pub_cells <- c(pub$cells, rep("", max(0, n_cols - length(pub$cells))))[seq_len(n_cols)]
    for (j in seq_len(n_cols)) {
      trio <- c(recomputed = rec[j], published = pub_cells[j], report = ref$cells[j])
      known <- known_difference(slug, ref$analysis, j)
      if (!is.null(known)) {
        # A recorded difference must still be exactly the recorded difference:
        # recomputation and publication agree with each other and with what the
        # record says they print, and the report still prints what it printed.
        # A known difference that has closed is reported too, so the list
        # cannot go stale.
        ok <- identical(unname(trio[["recomputed"]]), known$recomputed) &&
          identical(unname(trio[["published"]]), known$recomputed) &&
          identical(unname(trio[["report"]]), known$report)
        if (!ok) {
          bad <- c(bad, sprintf(
            "  %s / %s / column %d: recorded as a known difference (%s vs report %s) but now\n    recomputed: %s\n    published:  %s\n    report:     %s",
            slug, ref$analysis, j, known$recomputed, known$report,
            trio[["recomputed"]], trio[["published"]], trio[["report"]]
          ))
        } else if (verbose) {
          cat(sprintf("  ok  %-16s %-18s col %d  %s (known difference from %s)\n", slug, ref$analysis, j, trio[["recomputed"]], trio[["report"]]))
        }
        next
      }
      if (length(unique(trio)) != 1) {
        bad <- c(bad, sprintf(
          "  %s / %s / column %d:\n    recomputed: %s\n    published:  %s\n    report:     %s",
          slug, ref$analysis, j, trio[["recomputed"]], trio[["published"]], trio[["report"]]
        ))
      } else if (verbose) {
        cat(sprintf("  ok  %-16s %-18s col %d  %s\n", slug, ref$analysis, j, trio[["report"]]))
      }
    }
  }
  bad
}

slugs <- names(record$displays)

if (self_test) {
  # Prove the comparison can fail before trusting it green: break one route at a
  # time and require a non-empty complaint each time.
  cat("Self-test: each route perturbed in turn.\n")
  failures <- character(0)
  for (route in c("a", "b", "c")) {
    caught <- unlist(lapply(slugs, function(s) compare(s, perturb = route)))
    label <- c(a = "recomputation", b = "published display", c = "transcribed report")[[route]]
    if (length(caught)) {
      cat(sprintf("  ok   perturbing the %-18s was caught (%d cell(s))\n", label, length(caught)))
    } else {
      cat(sprintf("  FAIL perturbing the %-18s went UNDETECTED\n", label))
      failures <- c(failures, route)
    }
  }
  clean <- unlist(lapply(slugs, compare))
  if (length(clean)) {
    cat("  FAIL the unperturbed comparison does not pass\n")
    failures <- c(failures, "clean")
  } else {
    cat("  ok   the unperturbed comparison passes\n")
  }
  quit(status = if (length(failures)) 1 else 0)
}

bad <- unlist(lapply(slugs, compare))
n_cells <- sum(vapply(slugs, function(s) {
  sum(vapply(route_c(s), function(r) length(r$cells), numeric(1)))
}, numeric(1)))

if (length(bad)) {
  cat("REFERENCE REPORT DISAGREEMENT —", length(bad), "cell(s):\n")
  cat(paste(bad, collapse = "\n"), "\n", sep = "")
  quit(status = 1)
}

cat(sprintf(
  "OK: %d cells across %d displays agree three ways — recomputed from adsl.xpt.gz, published in outputs/, and printed in %s.\n",
  n_cells, length(slugs), record$reference$document
))
quit(status = 0)
