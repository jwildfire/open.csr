# Vital signs, weight and concomitant medications.
#
# These tests are the in-suite half of the qualification of `t-vitals`,
# `t-vitals-change`, `t-weight` and `t-conmeds`. The standalone half is
# `qc/vitals-conmeds-agreement.R`, which recomputes every publishable statistic in
# the four committed ARDs from the raw {pharmaverseadam} datasets and compares
# both against the sponsor's 2006 clinical study report. The two halves check
# different things on purpose:
#
#   * the agreement script checks the ARD -- data to statistic;
#   * these tests check the RENDERED CELLS -- statistic to table -- and they check
#     them against `quality/data/vitals-conmeds-reference.json`, so the assertion
#     is that the table prints what a different implementation printed in 2006,
#     with no arithmetic on this side of the comparison at all.
#
# Everything a transcription cannot supply -- how baseline and end of treatment
# are selected, which subjects a change row is entitled to, the internal
# consistency of a hierarchical count -- is computed here directly from
# {pharmaverseadam}, never by calling the code under test.

vwc_ref <- function() {
  memo("vwc_ref", jsonlite::fromJSON(
    file.path(csr_root(), "quality", "data", "vitals-conmeds-reference.json"),
    simplifyVector = FALSE
  ))
}

vwc_adsl <- function() {
  memo("vwc_adsl", {
    d <- pharmaverseadam::adsl
    d[d$ARM != "Screen Failure" & !is.na(d$SAFFL) & d$SAFFL == "Y", , drop = FALSE]
  })
}

# Observed ADVS records for the safety analysis set, with this file's own baseline
# and end-of-treatment derivations. Nothing here comes from prepare_data().
vwc_advs <- function() {
  memo("vwc_advs", {
    ids <- vwc_adsl()$USUBJID
    d <- pharmaverseadam::advs
    d <- d[d$USUBJID %in% ids & is.na(d$DTYPE) & !is.na(d$AVAL), , drop = FALSE]
    d$POS <- ifelse(is.na(d$ATPT), "-", as.character(d$ATPT))
    d$SERIES <- paste(d$USUBJID, d$PARAMCD, d$POS, sep = "~")
    bl <- d[!is.na(d$AVISIT) & d$AVISIT == "Baseline", c("SERIES", "AVAL")]
    d$BASELINE <- bl$AVAL[match(d$SERIES, bl$SERIES)]
    d$DELTA <- d$AVAL - d$BASELINE
    win <- d[!is.na(d$AVISITN) & d$AVISITN > 0 & d$AVISITN <= 24, , drop = FALSE]
    win <- win[order(win$SERIES, win$AVISITN), , drop = FALSE]
    keep <- win[!duplicated(win$SERIES, fromLast = TRUE), , drop = FALSE]
    d$LAST <- paste(d$SERIES, d$AVISITN) %in% paste(keep$SERIES, keep$AVISITN)
    d
  })
}

vwc_adcm <- function() {
  memo("vwc_adcm", {
    ids <- vwc_adsl()$USUBJID
    d <- pharmaverseadam::adcm
    d[d$USUBJID %in% ids, , drop = FALSE]
  })
}

vwc_arms <- function() c("Placebo", "Xanomeline Low Dose", "Xanomeline High Dose")

# Records feeding one cell of a vital-signs display.
vwc_pick <- function(paramcd, pos, visit) {
  d <- vwc_advs()
  d <- d[d$PARAMCD == paramcd & d$POS == pos, , drop = FALSE]
  if (visit == "End of treatment") d[d$LAST, , drop = FALSE] else d[!is.na(d$AVISIT) & d$AVISIT == visit, , drop = FALSE]
}

# A rendered display flattened to label / indent / one column per treatment group.
vwc_flat <- function(disp) {
  raw <- disp$table$label
  lead <- attr(regexpr("^(   )*", raw), "match.length")
  out <- data.frame(
    label = trimws(substring(raw, lead + 1L)),
    indent = as.integer(lead / 3L),
    stringsAsFactors = FALSE
  )
  for (j in seq_along(disp$columns$levels)) {
    out[[disp$columns$levels[j]]] <- disp$table[[paste0("col", j)]]
  }
  out
}

VWC_MEASURE <- c(
  "Systolic Blood Pressure (mmHg)" = "SYSBP",
  "Diastolic Blood Pressure (mmHg)" = "DIABP",
  "Pulse (beats/min)" = "PULSE"
)
VWC_POSITION <- c(
  "After lying down for 5 minutes" = "AFTER LYING DOWN FOR 5 MINUTES",
  "After standing for 1 minute" = "AFTER STANDING FOR 1 MINUTE",
  "After standing for 3 minutes" = "AFTER STANDING FOR 3 MINUTES"
)

# Walk a vital-signs display and return one record per rendered statistic block,
# carrying the headings it sits under. A cell that ended up under the wrong
# measure, position or visit is a different key here, and fails to match.
vwc_blocks <- function(disp) {
  flat <- vwc_flat(disp)
  measure <- position <- visit <- NA_character_
  out <- list()
  cur <- NULL
  for (i in seq_len(nrow(flat))) {
    lab <- flat$label[i]
    if (flat$indent[i] == 0L && lab %in% names(VWC_MEASURE)) {
      measure <- VWC_MEASURE[[lab]]
      next
    }
    if (flat$indent[i] == 1L && lab %in% names(VWC_POSITION)) {
      position <- VWC_POSITION[[lab]]
      next
    }
    if (flat$indent[i] == 2L) {
      visit <- lab
      next
    }
    cur <- paste(measure, position, visit, sep = "|")
    out[[cur]] <- c(out[[cur]], stats::setNames(list(flat[i, , drop = FALSE]), lab))
  }
  out
}

# The four cell strings the reference's six statistics imply, at the precision
# this display group declares.
vwc_expected <- function(rc) {
  list(
    "n" = format(rc$n),
    "Mean (SD)" = paste0(rc$mean, " (", rc$sd, ")"),
    "Median" = rc$median,
    "Min, Max" = paste0(rc$min, ", ", rc$max)
  )
}

# ---- the two vital-signs displays -------------------------------------------

test_that("DSP-VS-001: every rendered cell of the vital signs summary is what the reference report printed (#1)", {
  disp <- fixture_display("t-vitals")
  blocks <- vwc_blocks(disp)
  cells <- vwc_ref()$displays[["t-vitals"]]$cells
  expect_length(cells, 81)
  checked <- 0L
  for (key in names(cells)) {
    parts <- strsplit(key, "|", fixed = TRUE)[[1]]
    block <- blocks[[paste(parts[1], parts[2], parts[3], sep = "|")]]
    expect_false(is.null(block), info = key)
    exp <- vwc_expected(cells[[key]])
    for (lab in names(exp)) {
      expect_identical(block[[lab]][[parts[4]]], exp[[lab]], info = paste(key, lab))
      checked <- checked + 1L
    }
  }
  expect_identical(checked, 81L * 4L)
})

test_that("DSP-VS-002: baseline and end of treatment select one record per subject, parameter and position (#1)", {
  d <- vwc_advs()
  for (visit in c("Baseline", "Week 24", "End of treatment")) {
    sel <- do.call(rbind, lapply(names(VWC_POSITION), function(p) {
      do.call(rbind, lapply(unname(VWC_MEASURE), function(m) vwc_pick(m, VWC_POSITION[[p]], visit)))
    }))
    expect_identical(anyDuplicated(sel$SERIES), 0L, info = visit)
  }
  eot <- d[d$LAST, , drop = FALSE]
  # Inside the analysis plan's treatment period, and no unscheduled or derived record.
  expect_true(all(eot$AVISITN > 0 & eot$AVISITN <= 24))
  expect_true(all(is.na(eot$DTYPE)))
  # It really is each series' last visit inside that period.
  win <- d[!is.na(d$AVISITN) & d$AVISITN > 0 & d$AVISITN <= 24, , drop = FALSE]
  latest <- vapply(split(win$AVISITN, win$SERIES), max, numeric(1))
  expect_equal(unname(latest[eot$SERIES]), as.numeric(eot$AVISITN))
  # The Week 26 follow-up visit is on the study and is never selected.
  expect_true(any(d$AVISITN == 26, na.rm = TRUE))
  expect_false(any(eot$AVISITN == 26))
})

test_that("DSP-VSC-001: every rendered cell of the vital signs change display is what the reference report printed (#1)", {
  disp <- fixture_display("t-vitals-change")
  blocks <- vwc_blocks(disp)
  cells <- vwc_ref()$displays[["t-vitals-change"]]$cells
  expect_length(cells, 54)
  for (key in names(cells)) {
    parts <- strsplit(key, "|", fixed = TRUE)[[1]]
    block <- blocks[[paste(parts[1], parts[2], parts[3], sep = "|")]]
    expect_false(is.null(block), info = key)
    exp <- vwc_expected(cells[[key]])
    for (lab in names(exp)) {
      expect_identical(block[[lab]][[parts[4]]], exp[[lab]], info = paste(key, lab))
    }
  }
  # No baseline, no change: the change display never reports a subject the value
  # display has no baseline for, and the shortfall is exactly those subjects.
  for (visit in c("Week 24", "End of treatment")) {
    for (m in unname(VWC_MEASURE)) {
      for (p in unname(VWC_POSITION)) {
        d <- vwc_pick(m, p, visit)
        expect_equal(
          sum(!is.na(d$DELTA)), nrow(d) - sum(is.na(d$BASELINE)),
          info = paste(m, p, visit)
        )
      }
    }
  }
})

# ---- weight -----------------------------------------------------------------

test_that("DSP-WT-001: every rendered cell of the weight display is what the reference report printed (#1)", {
  disp <- fixture_display("t-weight")
  flat <- vwc_flat(disp)
  cells <- vwc_ref()$displays[["t-weight"]]$cells
  expect_length(cells, 15)
  section <- NA_character_
  visit <- NA_character_
  seen <- character(0)
  for (i in seq_len(nrow(flat))) {
    if (flat$indent[i] == 0L) {
      section <- if (grepl("^Weight change", flat$label[i])) "WEIGHT_CHG" else "WEIGHT"
      next
    }
    if (flat$indent[i] == 1L) {
      visit <- flat$label[i]
      next
    }
    for (arm in vwc_arms()) {
      key <- paste(section, visit, arm, sep = "|")
      rc <- cells[[key]]
      expect_false(is.null(rc), info = key)
      expect_identical(flat[[arm]][i], vwc_expected(rc)[[flat$label[i]]], info = paste(key, flat$label[i]))
      seen <- c(seen, key)
    }
  }
  expect_setequal(unique(seen), names(cells))
})

# ---- concomitant medications -------------------------------------------------

test_that("DSP-CM-001: concomitant medication counts match ADCM computed directly (#1)", {
  disp <- fixture_display("t-conmeds")
  flat <- vwc_flat(disp)
  cm <- vwc_adcm()
  adsl <- vwc_adsl()
  count_of <- function(s) as.integer(sub(" .*$", "", s))
  pct_of <- function(s) as.numeric(sub("^.*\\((.*)%\\)$", "\\1", s))

  n_class <- 0L
  n_term <- 0L
  cls <- NA_character_
  for (i in seq_len(nrow(flat))) {
    lab <- flat$label[i]
    if (flat$indent[i] == 0L && flat[[vwc_arms()[1]]][i] == "") next
    if (flat$indent[i] == 0L && grepl("^Subjects receiving", lab)) next
    if (flat$indent[i] == 0L) {
      cls <- lab
      n_class <- n_class + 1L
    } else {
      n_term <- n_term + 1L
    }
    for (arm in vwc_arms()) {
      sub <- cm[as.character(cm$TRT01P) == arm, , drop = FALSE]
      sub <- if (flat$indent[i] == 0L) {
        sub[as.character(sub$CMCLAS) == cls, , drop = FALSE]
      } else {
        sub[as.character(sub$CMCLAS) == cls & as.character(sub$CMDECOD) == lab, , drop = FALSE]
      }
      n <- length(unique(sub$USUBJID))
      denom <- sum(as.character(adsl$TRT01P) == arm)
      expect_identical(count_of(flat[[arm]][i]), n, info = paste(cls, lab, arm))
      expect_lt(abs(pct_of(flat[[arm]][i]) - 100 * n / denom), 0.05)
    }
  }
  expect_identical(n_class, 10L)
  expect_identical(n_term, 34L)

  # The "at least one" row, and its agreement with the 2006 report.
  ref_any <- vwc_ref()$displays[["t-conmeds"]]$any
  for (arm in vwc_arms()) {
    n <- length(unique(cm$USUBJID[as.character(cm$TRT01P) == arm]))
    expect_identical(count_of(cell(disp, "Subjects receiving at least one concomitant medication", arm)), n)
    expect_identical(n, ref_any[[arm]]$n)
  }
})

test_that("DSP-CM-002: a subject counted for a medication is counted for its class (#1)", {
  disp <- fixture_display("t-conmeds")
  flat <- vwc_flat(disp)
  count_of <- function(s) as.integer(sub(" .*$", "", s))
  any_row <- which(grepl("^Subjects receiving", flat$label))[1]
  cls_i <- NA_integer_
  for (i in seq_len(nrow(flat))) {
    if (flat[[vwc_arms()[1]]][i] == "") next
    if (i == any_row) next
    for (arm in vwc_arms()) {
      if (flat$indent[i] == 0L) {
        # No class may exceed the number of subjects taking anything at all.
        expect_lte(count_of(flat[[arm]][i]), count_of(flat[[arm]][any_row]))
      } else {
        # And no medication may exceed the class it sits under.
        expect_lte(count_of(flat[[arm]][i]), count_of(flat[[arm]][cls_i]))
      }
    }
    if (flat$indent[i] == 0L) cls_i <- i
  }
})

test_that("DSP-CM-003: the in-text variant applies the 5% threshold its spec declares (#1)", {
  full <- vwc_flat(fixture_display("t-conmeds"))
  short <- vwc_flat(fixture_display("t-conmeds", "in_text"))
  pct_of <- function(s) as.numeric(sub("^.*\\((.*)%\\)$", "\\1", s))
  reaches <- function(row) {
    any(vapply(vwc_arms(), function(a) pct_of(row[[a]]) >= 5, logical(1)))
  }
  terms_full <- full[full$indent == 1L, , drop = FALSE]
  terms_short <- short[short$indent == 1L, , drop = FALSE]
  expect_true(nrow(terms_short) < nrow(terms_full))
  # Shown terms all reach the threshold; dropped terms all fail it.
  for (i in seq_len(nrow(terms_short))) expect_true(reaches(terms_short[i, ]))
  dropped <- setdiff(terms_full$label, terms_short$label)
  for (lab in dropped) {
    for (i in which(terms_full$label == lab)) expect_false(reaches(terms_full[i, ]))
  }
  # The full display is unaffected by the variant's filter.
  expect_gt(nrow(terms_full), 30)
})

# ---- the definitions this display group owns ---------------------------------

test_that("DSP-VWC-001: all four displays group by planned treatment over the safety analysis set (#1)", {
  adsl <- vwc_adsl()
  planned <- vapply(vwc_arms(), function(a) sum(as.character(adsl$TRT01P) == a), numeric(1))
  actual <- vapply(vwc_arms(), function(a) sum(as.character(adsl$TRT01A) == a), numeric(1))
  # The departure from the rest of the library is real, not cosmetic: twelve
  # subjects received a treatment other than the one planned.
  expect_false(identical(planned, actual))
  expect_equal(sum(as.character(adsl$TRT01P) != as.character(adsl$TRT01A)), 12)

  for (slug in c("t-vitals", "t-vitals-change", "t-weight", "t-conmeds")) {
    spec <- read_analysis_spec(slug)
    expect_identical(spec$group, "TRT01P", info = slug)
    expect_identical(spec$analysis_set, "safety", info = slug)
    expect_false(spec$total, info = slug)
    disp <- fixture_display(slug)
    expect_identical(disp$columns$levels, vwc_arms(), info = slug)
    expect_equal(unname(disp$columns$n), unname(planned), info = slug)
  }
})

test_that("DSP-VWC-002: the committed three-route agreement record is green and describes this iteration (#1)", {
  path <- file.path(csr_root(), "quality", "data", "vitals-conmeds-agreement.json")
  expect_true(file.exists(path))
  rec <- jsonlite::fromJSON(path, simplifyVector = FALSE)
  expect_true(isTRUE(rec$ok))
  expect_length(rec$findings, 0)
  expect_gt(rec$comparisons, 2000)
  slugs <- vapply(rec$displays, function(d) d$display, character(1))
  expect_setequal(slugs, c("t-vitals", "t-vitals-change", "t-weight", "t-conmeds"))
  for (d in rec$displays) {
    # Stale evidence is worse than none: the record has to be about the iteration
    # that is committed now, and it has to have left nothing unchecked.
    expect_identical(d$version, current_iteration(d$display)$version, info = d$display)
    expect_identical(d$unchecked, 0L, info = d$display)
    expect_identical(d$recomputed, d$publishable_statistics, info = d$display)
  }
})
