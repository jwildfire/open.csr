#!/usr/bin/env Rscript
# Do open.csr's populations and end-of-study displays agree with the report the
# CDISC pilot itself published?
#
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

args <- commandArgs(trailingOnly = TRUE)
verbose <- "--verbose" %in% args
self_test <- "--self-test" %in% args

root <- getwd()
while (!file.exists(file.path(root, "docs", "design", "contracts.md"))) {
  parent <- dirname(root)
  if (identical(parent, root)) stop("Could not locate the open.csr repository root.")
  root <- parent
}

record_path <- file.path(root, "quality", "data", "reference-report-agreement.json")
adsl_path <- file.path(root, "pipeline", "inst", "extdata", "phuse-cdiscpilot01", "adsl.xpt.gz")

record <- jsonlite::fromJSON(record_path, simplifyVector = FALSE)

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

route_a <- function(slug, perturb = FALSE) {
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
  if (perturb) html <- sub("60 \\(70%\\)", "61 (70%)", html)
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
  Filter(function(r) any(nzchar(r$cells)), rows)
}

# ---- route C: the transcribed report ----------------------------------------

route_c <- function(slug, perturb = FALSE) {
  spec <- record$displays[[slug]]
  lapply(spec$rows, function(r) {
    printed <- vapply(r$printed, function(x) norm_cell(x), character(1))
    if (perturb) printed[1] <- norm_cell("99 ( 99%)")
    list(
      analysis = r$analysis,
      label = norm_label(r$label),
      cells = c(unname(printed), if (is.null(r$p_value_printed)) "" else r$p_value_printed)
    )
  })
}

# ---- comparison -------------------------------------------------------------

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
