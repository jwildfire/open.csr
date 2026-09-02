# The demographics display is the reference report's Table 14-2.01 (#61):
# intent-to-treat, a Total and a p-value column. Expected values are computed
# from the vendored pilot ADSL read with {haven}, never through the pipeline.

demo_ref <- function() {
  d <- ref_phuse_adsl()
  d <- d[blank_na(d$ITTFL) == "Y", , drop = FALSE]
  d$RACEOR <- ifelse(blank_na(d$ETHNIC) == "HISPANIC OR LATINO", "Hispanic",
    ifelse(d$RACE == "WHITE", "Caucasian", ifelse(d$RACE == "BLACK OR AFRICAN AMERICAN", "African Descent", "Other")))
  d
}
demo_row <- function(disp, block, stat) {
  # the k-th row labelled `stat` after the section heading `block`
  lab <- plain(disp$table$label)
  start <- which(lab == block)
  testthat::expect_length(start, 1)
  idx <- which(lab == stat & seq_along(lab) > start)[1]
  testthat::expect_false(is.na(idx))
  idx
}

test_that("DSP-DEMO-001: the age summary matches the pilot's ADSL computed directly, and the display is the intent-to-treat population with a Total column (#61)", {
  disp <- fixture_display("t-demographics")
  ref <- demo_ref()
  expect_identical(disp$columns$levels, c("Placebo", "Xanomeline Low Dose", "Xanomeline High Dose", "Total", "p-value"))
  for (arm in c("Placebo", "Xanomeline Low Dose", "Xanomeline High Dose")) {
    j <- which(disp$columns$levels == arm)
    age <- ref$AGE[ref$TRT01P == arm]
    expect_identical(disp$table[[paste0("col", j)]][demo_row(disp, "Age (y)", "n")], as.character(length(age)))
    expect_identical(disp$table[[paste0("col", j)]][demo_row(disp, "Age (y)", "Mean")], format_stat(mean(age), "mean", list(mean = 1)))
    expect_identical(disp$table[[paste0("col", j)]][demo_row(disp, "Age (y)", "SD")], format_stat(stats::sd(age), "sd", list(sd = 2)))
    expect_identical(disp$table[[paste0("col", j)]][demo_row(disp, "Age (y)", "Median")], format_stat(stats::median(age), "median", list(median = 1)))
    expect_identical(disp$table[[paste0("col", j)]][demo_row(disp, "Age (y)", "Max")], format_stat(max(age), "max", list(max = 1)))
  }
  expect_identical(disp$table$col1[demo_row(disp, "Age (y)", "Mean")], "75.2")
  expect_identical(disp$table$col4[demo_row(disp, "Age (y)", "n")], "254")
})

test_that("DSP-DEMO-002: sex, Race (Origin) and age-group counts and percentages match ADSL, printed the way the report prints them (#61)", {
  disp <- fixture_display("t-demographics")
  ref <- demo_ref()
  pct <- function(n, N) {
    p <- 100 * n / N
    shown <- if (p > 0 && round(p) == 0) "<1" else as.character(as.integer(round_half_up(p, 0)))
    if (n == 0) "0" else paste0(n, " (", shown, "%)")
  }
  for (arm in c("Placebo", "Xanomeline Low Dose", "Xanomeline High Dose")) {
    sub <- ref[ref$TRT01P == arm, ]
    expect_identical(cell(disp, "Female", arm), pct(sum(sub$SEX == "F"), nrow(sub)))
    expect_identical(cell(disp, "Caucasian", arm), pct(sum(sub$RACEOR == "Caucasian"), nrow(sub)))
    expect_identical(cell(disp, "Other", arm), pct(sum(sub$RACEOR == "Other"), nrow(sub)))
    expect_identical(cell(disp, ">80 yrs", arm), pct(sum(sub$AGEGR1 == ">80"), nrow(sub)))
  }
  expect_identical(cell(disp, ">80 yrs", "Total"), "77 (30%)")
  # a count of nobody prints bare, and a share under half a percent prints "<1%"
  expect_identical(cell(disp, "Other", "Placebo"), "0")
  expect_identical(cell(disp, "Other", "Total"), "1 (<1%)")
})

test_that("DSP-DEMO-003: every p-value on the display is the one-way ANOVA or Pearson chi-square the report's footnote names, recomputed independently (#61)", {
  disp <- fixture_display("t-demographics")
  ref <- demo_ref()
  g <- factor(ref$TRT01P)
  fmt <- function(p) if (p < 0.0001) "<.0001" else formatC(p, format = "f", digits = 4)
  anova_p <- function(x) summary(stats::aov(x[!is.na(x)] ~ g[!is.na(x)]))[[1]][["Pr(>F)"]][[1]]
  chisq_p <- function(x) suppressWarnings(stats::chisq.test(table(g, x), correct = FALSE))$p.value
  cont <- list("Age (y)" = ref$AGE, "MMSE" = ref$MMSETOT, "Duration of disease" = ref$DURDIS,
    "Years of education" = ref$EDUCLVL, "Baseline weight(kg)" = ref$WEIGHTBL,
    "Baseline height(cm)" = ref$HEIGHTBL, "Baseline BMI" = ref$BMIBL)
  for (block in names(cont)) {
    expect_identical(disp$table$col5[demo_row(disp, block, "n")], fmt(anova_p(cont[[block]])), info = block)
    expect_identical(disp$table$col5[demo_row(disp, block, "Mean")], "", info = paste(block, "mean row carries no test"))
  }
  expect_identical(cell(disp, "<65 yrs", "p-value"), fmt(chisq_p(ref$AGEGR1)))
  expect_identical(cell(disp, "65-80 yrs", "p-value"), "")
  expect_identical(disp$table$col5[demo_row(disp, "Sex", "n")], fmt(chisq_p(ref$SEX)))
  expect_identical(disp$table$col5[demo_row(disp, "Race (Origin)", "n")], fmt(chisq_p(ref$RACEOR)))
  expect_identical(cell(disp, "<12 months", "p-value"), fmt(chisq_p(ref$DURDSGR1)))
  expect_identical(cell(disp, "<25", "p-value"), fmt(chisq_p(ref$BMIBLGR1)))
  # the figures the report prints
  expect_identical(disp$table$col5[demo_row(disp, "Age (y)", "n")], "0.5934")
  expect_identical(cell(disp, "<25", "p-value"), "0.2326")
})

test_that("DSP-DEMO-004: Race (Origin) is a stated recode of race and ethnicity, not a data conflict — 218 + 12 = 230 (#61)", {
  raw <- ref_phuse_adsl()
  expect_true(all(blank_na(raw$RACE[blank_na(raw$ETHNIC) == "HISPANIC OR LATINO"]) == "WHITE"))
  prepared <- fixture_data()$adsl
  expect_identical(levels(prepared$RACEOR), c("Caucasian", "African Descent", "Hispanic", "Other"))
  expect_identical(unname(as.integer(table(prepared$RACEOR))), c(218L, 23L, 12L, 1L))
  expect_equal(sum(prepared$RACE == "WHITE"), 218 + 12)
  # the CDISC-coded race stays in the ARD for the narrative, unrendered
  ard <- fixture_ard("t-demographics")$rows
  expect_true(any(ard$analysis == "race" & ard$variable_level == "WHITE"))
  expect_false("WHITE" %in% plain(fixture_display("t-demographics")$table$label))
})

test_that("DSP-DISP-001: disposition counts reproduce EOSSTT (#1)", {
  disp <- fixture_display("t-disposition")
  ref <- ref_adsl()
  for (arm in c("Placebo", "Xanomeline Low Dose", "Xanomeline High Dose")) {
    sub <- ref[ref$TRT01A == arm, ]
    expect_match(cell(disp, "Subjects randomised", arm), paste0("^", nrow(sub), " \\(100\\.0%\\)$"))
    # the pilot's ADSL states completion as the complement of its DISCONFL
    expect_match(cell(disp, "Completed the study", arm), paste0("^", sum(blank_na(sub$DISCONFL) != "Y"), " \\("))
    expect_match(cell(disp, "Discontinued the study", arm), paste0("^", sum(blank_na(sub$DISCONFL) == "Y"), " \\("))
  }
})

test_that("DSP-DISP-002: the derived discontinuation reasons partition the discontinuations (#1)", {
  disp <- fixture_display("t-disposition")
  count_of <- function(label, col) as.integer(sub(" .*$", "", cell(disp, label, col)))
  for (arm in c("Placebo", "Xanomeline Low Dose", "Xanomeline High Dose", "Total")) {
    expect_equal(
      count_of("Death", arm) + count_of("Other / not specified", arm),
      count_of("Discontinued the study", arm),
      info = arm
    )
  }
  expect_equal(count_of("Died on study", "Total"), sum(blank_na(ref_adsl()$DTHFL) == "Y"))
})

test_that("DSP-EXP-001: average daily dose and cumulative dose match the pilot's ADSL computed directly (#60)", {
  disp <- fixture_display("t-exposure")
  ref <- ref_adsl()
  means <- which(plain(disp$table$label) == "Mean")
  sds <- which(plain(disp$table$label) == "SD")
  ns <- which(plain(disp$table$label) == "n")
  # five continuous blocks: two for the safety population, two for the completers, then duration
  expect_length(means, 5)
  for (arm in c("Placebo", "Xanomeline Low Dose", "Xanomeline High Dose")) {
    j <- which(disp$columns$levels == arm)
    sub <- ref[ref$TRT01A == arm, ]
    expect_identical(disp$table[[paste0("col", j)]][ns[1]], as.character(nrow(sub)))
    expect_identical(disp$table[[paste0("col", j)]][means[1]], format_stat(mean(sub$AVGDD), "mean", list(mean = 1)))
    expect_identical(disp$table[[paste0("col", j)]][sds[2]], format_stat(stats::sd(sub$CUMDOSE), "sd", list(sd = 2)))
    expect_identical(disp$table[[paste0("col", j)]][means[5]], format_stat(mean(sub$TRTDUR), "mean", list(mean = 1)))
  }
  # the figures the reference report prints for the safety population
  expect_identical(disp$table$col1[means[1]], "0.0")
  expect_identical(disp$table$col2[means[1]], "54.0")
  expect_identical(disp$table$col3[means[1]], "71.6")
  expect_identical(disp$table$col3[sds[1]], "8.11")
  expect_identical(disp$table$col3[means[2]], "7551.0")
})

test_that("DSP-EXP-002: the completers block summarises the subjects flagged COMP24FL, the exposure categories are monotone, and no exposure dataset is read (#60)", {
  disp <- fixture_display("t-exposure")
  ref <- ref_adsl()
  ns <- which(plain(disp$table$label) == "n")
  means <- which(plain(disp$table$label) == "Mean")
  for (arm in c("Placebo", "Xanomeline Low Dose", "Xanomeline High Dose")) {
    j <- which(disp$columns$levels == arm)
    comp <- ref[ref$TRT01A == arm & blank_na(ref$COMP24FL) == "Y", ]
    expect_identical(disp$table[[paste0("col", j)]][ns[3]], as.character(nrow(comp)))
    expect_identical(disp$table[[paste0("col", j)]][means[4]], format_stat(mean(comp$CUMDOSE), "mean", list(mean = 1)))
    counts <- vapply(c("≥ 1 day", "≥ 30 days", "≥ 90 days", "≥ 180 days"), function(l) as.integer(sub(" .*$", "", cell(disp, l, arm))), integer(1))
    expect_true(all(diff(counts) <= 0), info = arm)
    x <- ref$TRTDUR[ref$TRT01A == arm]
    expect_equal(unname(counts), c(sum(x >= 1), sum(x >= 30), sum(x >= 90), sum(x >= 180)), info = arm)
  }
  expect_identical(unname(vapply(1:3, function(j) disp$table[[paste0("col", j)]][ns[3]], character(1))), c("60", "28", "30"))
  ard <- fixture_ard("t-exposure")
  expect_setequal(vapply(ard$provenance$data, function(d) d$dataset, character(1)), "adsl")
})

test_that("DSP-AE-001: AE overview subject counts match ADAE computed directly (#1)", {
  disp <- fixture_display("t-ae-overview")
  adsl <- ref_adsl()
  teae <- ref_adae()[ref_adae()$TRTEMFL %in% "Y", ]
  for (arm in c("Placebo", "Xanomeline Low Dose", "Xanomeline High Dose")) {
    n_arm <- sum(adsl$TRT01A == arm)
    n_any <- n_subjects(teae, arm)
    expect_identical(
      cell(disp, "Subjects with ≥1 adverse event", arm),
      paste0(n_any, " (", format_stat(n_any / n_arm, "p"), "%)")
    )
    n_ser <- n_subjects(teae[teae$AESER %in% "Y", ], arm)
    expect_identical(
      cell(disp, "Subjects with a serious adverse event", arm),
      paste0(n_ser, " (", format_stat(n_ser / n_arm, "p"), "%)")
    )
  }
})

test_that("DSP-AE-002: severity rows never exceed the any-AE row (#1)", {
  disp <- fixture_display("t-ae-overview")
  count_of <- function(label, col) as.integer(sub(" .*$", "", cell(disp, label, col)))
  for (arm in c("Placebo", "Xanomeline Low Dose", "Xanomeline High Dose", "Total")) {
    any_ae <- count_of("Subjects with ≥1 adverse event", arm)
    for (sev in c("Mild", "Moderate", "Severe")) {
      expect_lte(count_of(sev, arm), any_ae)
    }
    expect_lte(count_of("Subjects with a serious adverse event", arm), any_ae)
    expect_lte(count_of("Subjects with a related adverse event", arm), any_ae)
  }
})

test_that("DSP-AE-003: the custom event-count row counts records, not subjects (#1)", {
  disp <- fixture_display("t-ae-overview")
  teae <- ref_adae()[ref_adae()$TRTEMFL %in% "Y", ]
  for (arm in c("Placebo", "Xanomeline Low Dose", "Xanomeline High Dose")) {
    expect_identical(cell(disp, "Number of events", arm), as.character(sum(teae$TRT01A == arm)))
  }
  expect_identical(cell(disp, "Number of events", "Total"), as.character(nrow(teae)))
  # events always outnumber the subjects reporting them in this study
  expect_gt(nrow(teae), n_subjects(teae))
})

test_that("DSP-AE-004: common-AE SOC and PT counts match ADAE computed directly (#1)", {
  disp <- fixture_display("t-ae-common")
  teae <- ref_adae()[ref_adae()$TRTEMFL %in% "Y", ]
  adsl <- ref_adsl()
  checks <- list(
    list(level = "GASTROINTESTINAL DISORDERS", col = "AEBODSYS"),
    list(level = "DIARRHOEA", col = "AEDECOD"),
    list(level = "APPLICATION SITE PRURITUS", col = "AEDECOD")
  )
  for (chk in checks) {
    for (arm in c("Placebo", "Xanomeline Low Dose", "Xanomeline High Dose")) {
      sub <- teae[teae[[chk$col]] == chk$level & teae$TRT01A == arm, ]
      n <- n_subjects(sub)
      n_arm <- sum(adsl$TRT01A == arm)
      expect_identical(
        cell(disp, chk$level, arm),
        paste0(n, " (", format_stat(n / n_arm, "p"), "%)"),
        info = paste(chk$level, arm)
      )
    }
  }
})

test_that("DSP-AE-005: the in-text AE variant applies the 5% threshold declared in the spec (#1)", {
  spec <- read_display_spec("t-ae-common")
  expect_equal(spec$variants$in_text$filter$min_pct, 5)
  intext <- fixture_display("t-ae-common", "in_text")
  post <- fixture_display("t-ae-common", "post_text")
  expect_lt(nrow(intext$table), nrow(post$table) / 2)

  # partition the preferred terms by the threshold, straight from the ARD
  rows <- fixture_ard("t-ae-common")$rows
  pt <- rows[rows$variable == "AEDECOD" & rows$stat_name == "p" & rows$group1_level != "Total", ]
  max_p <- tapply(vapply(pt$stat, function(s) unlist(s), numeric(1)), pt$variable_level, max)
  above <- names(max_p)[max_p >= 0.05]
  below <- names(max_p)[max_p < 0.05]
  expect_gt(length(above), 5)
  expect_gt(length(below), 5)

  shown_post <- plain(post$table$label)
  shown_text <- plain(intext$table$label)
  # every term is in the full display; only the ones reaching 5% are in-text
  expect_true(all(above %in% shown_post))
  expect_true(all(below %in% shown_post))
  expect_true(all(above %in% shown_text))
  expect_false(any(below %in% shown_text))
  # the headline example both ways
  expect_true("DIARRHOEA" %in% shown_text)
})

test_that("DSP-SAE-001: the serious-AE listing has one row per serious event record (#1)", {
  disp <- fixture_display("l-ae-serious")
  sae <- ref_adae()[ref_adae()$AESER %in% "Y", ]
  expect_equal(nrow(disp$table), nrow(sae))
  expect_setequal(disp$table$col6, sae$AEDECOD)
  expect_setequal(disp$table$col1, sae$USUBJID)
  # sorting is by subject then start day, as the spec declares
  expect_identical(disp$table$col1, sort(disp$table$col1))
})

test_that("DSP-ALL-001: every display renders a table that actually contains numbers (#1)", {
  slugs <- display_slugs()
  expect_gte(length(slugs), 6)
  for (slug in slugs) {
    disp <- fixture_display(slug)
    expect_gt(nrow(disp$table), 2)
    cells <- unlist(disp$table[, setdiff(names(disp$table), "label")])
    # five is the disposition flow's whole table (#63); anything smaller is a display with nothing in it
    expect_gte(sum(grepl("[0-9]", cells)), 5)
    expect_match(disp$html, "[0-9]", info = slug)
  }
})

test_that("DSP-ALL-002: every display declares a regulatory identifier and a source line (#1)", {
  for (slug in display_slugs()) {
    a <- read_analysis_spec(slug)
    d <- read_display_spec(slug)
    expect_true(nzchar(a$regulatory_id %||% ""), info = slug)
    expect_match(d$source, "Data cut-off", info = slug)
    expect_gt(length(d$footnotes), 0)
  }
})

# ---- Summary of Populations (DST02) and End of Study Data (DST03) -----------
#
# Both are specified against `sources: phuse` — the CDISC pilot's own ADaM
# package — so the expected values below come from ref_phuse_adsl(), which reads
# the vendored file directly rather than through prepare_data(). Rows are
# addressed by the analysis they render, not by their printed label: the
# end-of-study table prints "Missing" on two different rows.

test_that("DSP-POP-001: the population rows match the study's own flags in ADSL (#1)", {
  disp <- fixture_display("t-populations")
  ref <- ref_phuse_adsl()
  trt <- blank_na(ref$TRT01P)
  rows <- list(itt = "ITTFL", safety = "SAFFL", efficacy = "EFFFL")
  for (nm in names(rows)) {
    flagged <- blank_na(ref[[rows[[nm]]]]) == "Y"
    for (arm in pilot_arms()) {
      n <- sum(trt == arm & flagged)
      expect_identical(count_at(disp, "t-populations", nm, arm), n, info = paste(nm, arm))
      expect_identical(
        pct_at(disp, "t-populations", nm, arm), pct_half_up(n, sum(trt == arm)),
        info = paste(nm, arm)
      )
    }
    expect_identical(count_at(disp, "t-populations", nm, "Total"), sum(flagged), info = nm)
    expect_identical(
      pct_at(disp, "t-populations", nm, "Total"), pct_half_up(sum(flagged), nrow(ref)),
      info = nm
    )
  }
  # The study states its own sets rather than having them re-derived: every
  # subject is ITT and safety, and twenty fewer are efficacy.
  expect_identical(count_at(disp, "t-populations", "itt", "Total"), 254L)
  expect_identical(count_at(disp, "t-populations", "efficacy", "Total"), 234L)
})

test_that("DSP-POP-002: completion rows use COMP24FL and the complement of DISCONFL (#1)", {
  disp <- fixture_display("t-populations")
  ref <- ref_phuse_adsl()
  trt <- blank_na(ref$TRT01P)
  wk24 <- blank_na(ref$COMP24FL) == "Y"
  # "Complete Study" is open.csr's derivation, not a variable the study ships:
  # the reference report prints the row and states no definition for it.
  study <- blank_na(ref$DISCONFL) != "Y"
  for (arm in pilot_arms()) {
    expect_identical(
      count_at(disp, "t-populations", "complete_wk24", arm), sum(trt == arm & wk24), info = arm
    )
    expect_identical(
      count_at(disp, "t-populations", "complete_study", arm), sum(trt == arm & study), info = arm
    )
  }
  expect_identical(count_at(disp, "t-populations", "complete_wk24", "Total"), 118L)
  expect_identical(count_at(disp, "t-populations", "complete_study", "Total"), 110L)
  # Completing the study implies completing Week 24; the reverse is not true,
  # and the eight-subject gap is what the end-of-study table's footnote counts.
  expect_true(all(study <= wk24))
  expect_identical(sum(wk24) - sum(study), 8L)
})

test_that("DSP-POP-003: the display reads the packaging that states the flags it reports (#1)", {
  spec <- read_analysis_spec("t-populations")
  expect_identical(unname(spec$sources), "phuse")
  # Not a preference: the pharmaverse re-derivation of this study carries no
  # EFFFL and no COMP24FL, so the table cannot be built from it at all.
  pv <- pharmaverseadam::adsl
  expect_false("EFFFL" %in% names(pv))
  expect_false("COMP24FL" %in% names(pv))
  expect_true(all(c("EFFFL", "COMP24FL", "DISCONFL") %in% names(ref_phuse_adsl())))
})

test_that("DSP-POP-004: planned and actual treatment agree for every subject (#1)", {
  # Both displays group on TRT01P and say so in a footnote. That is only
  # harmless because the two agree here; if the study's data ever changed the
  # footnote would become false, and this is what would say so.
  ref <- ref_phuse_adsl()
  expect_identical(nrow(ref), 254L)
  expect_identical(sum(blank_na(ref$TRT01P) != blank_na(ref$TRT01A)), 0L)
  for (slug in c("t-populations", "t-end-of-study")) {
    expect_identical(read_analysis_spec(slug)$group, "TRT01P", info = slug)
  }
})

test_that("DSP-EOS-001: the completion-status rows partition each treatment group (#1)", {
  disp <- fixture_display("t-end-of-study")
  ref <- ref_phuse_adsl()
  trt <- blank_na(ref$TRT01P)
  rows <- c("completed_wk24", "early_term", "completion_missing")
  for (arm in c(pilot_arms(), "Total")) {
    n_arm <- if (arm == "Total") nrow(ref) else sum(trt == arm)
    counts <- vapply(rows, function(r) count_at(disp, "t-end-of-study", r, arm), integer(1))
    expect_identical(sum(counts), as.integer(n_arm), info = arm)
  }
  expect_identical(count_at(disp, "t-end-of-study", "completed_wk24", "Total"), 118L)
  expect_identical(count_at(disp, "t-end-of-study", "early_term", "Total"), 136L)
  # Every subject has a completion status recorded, so the Missing row is a
  # declared zero rather than a row nobody looked at.
  expect_identical(count_at(disp, "t-end-of-study", "completion_missing", "Total"), 0L)
})

test_that("DSP-EOS-002: the early-termination reasons partition the early terminations (#1)", {
  disp <- fixture_display("t-end-of-study")
  ref <- ref_phuse_adsl()
  trt <- blank_na(ref$TRT01P)
  early <- blank_na(ref$COMP24FL) == "N"
  reason <- blank_na(ref$DCREASCD)
  reasons <- c(
    et_ae = "Adverse Event", et_death = "Death", et_loe = "Lack of Efficacy",
    et_ltfu = "Lost to Follow-up", et_withdrew = "Withdrew Consent",
    et_physician = "Physician Decision", et_ie = "I/E Not Met",
    et_protocol = "Protocol Violation", et_sponsor = "Sponsor Decision"
  )
  for (arm in c(pilot_arms(), "Total")) {
    in_arm <- if (arm == "Total") rep(TRUE, nrow(ref)) else trt == arm
    total <- 0L
    for (nm in names(reasons)) {
      n <- sum(in_arm & early & reason == reasons[[nm]])
      expect_identical(count_at(disp, "t-end-of-study", nm, arm), n, info = paste(nm, arm))
      total <- total + n
    }
    # The nine reasons plus the missing-reason row account for every early
    # termination, so no subject falls through a reason the spec forgot.
    total <- total + count_at(disp, "t-end-of-study", "et_missing", arm)
    expect_identical(total, sum(in_arm & early), info = arm)
  }
})

test_that("DSP-EOS-003: a p-value appears on exactly the rows the analysis plan names (#1)", {
  disp <- fixture_display("t-end-of-study")
  ref <- ref_phuse_adsl()
  trt <- blank_na(ref$TRT01P)
  early <- blank_na(ref$COMP24FL) == "N"
  reason <- blank_na(ref$DCREASCD)
  j <- which(disp$columns$levels == "p-value")
  expect_length(j, 1)
  pcol <- disp$table[[paste0("col", j)]]
  tested <- list(
    completed_wk24 = blank_na(ref$COMP24FL) == "Y",
    et_ae = early & reason == "Adverse Event",
    et_loe = early & reason == "Lack of Efficacy"
  )
  # SAP section 9.7.1.2 names protocol completion, adverse event and lack of
  # efficacy, and no other row; so does the printed report. Everything else must
  # be blank — a p-value on a row nobody stated a hypothesis for is a finding
  # invented by the software.
  carries <- which(!is.na(pcol) & nzchar(pcol))
  expect_setequal(carries, vapply(names(tested), function(n) row_of("t-end-of-study", n), integer(1)))
  for (nm in names(tested)) {
    flag <- tested[[nm]]
    k <- vapply(pilot_arms(), function(a) sum(trt == a & flag), numeric(1))
    n <- vapply(pilot_arms(), function(a) sum(trt == a), numeric(1))
    p <- stats::fisher.test(rbind(k, n - k))$p.value
    want <- if (p < 0.0001) "<.0001" else formatC(p, format = "f", digits = 4)
    expect_identical(analysis_cell(disp, "t-end-of-study", nm, "p-value"), want, info = nm)
  }
})

test_that("DSP-EOS-004: every percentage is based on the treatment group, not the discontinuations (#1)", {
  disp <- fixture_display("t-end-of-study")
  ref <- ref_phuse_adsl()
  trt <- blank_na(ref$TRT01P)
  rows <- read_display_spec("t-end-of-study")$rows
  named <- Filter(function(r) !is.null(r$analysis), rows)
  # The reason rows are where the two candidate denominators differ sharply: 44
  # of the 84 randomised to low dose is 52%, but 44 of the 56 who terminated
  # early is 79%. The reference report uses the treatment group, and so does this.
  for (arm in c(pilot_arms(), "Total")) {
    n_arm <- if (arm == "Total") nrow(ref) else sum(trt == arm)
    for (r in named) {
      expect_identical(
        pct_at(disp, "t-end-of-study", r$analysis, arm),
        pct_half_up(count_at(disp, "t-end-of-study", r$analysis, arm), n_arm),
        info = paste(r$analysis, arm)
      )
    }
  }
  expect_identical(pct_at(disp, "t-end-of-study", "et_ae", "Xanomeline Low Dose"), 52L)
})

test_that("DSP-REF-001: both displays publish the figures the pilot's own report printed (#1)", {
  # The published cells against the report, inside the suite. The standalone
  # qc/reference-report-agreement.R additionally recomputes them a third way and
  # is what CI runs; this keeps a regeneration that walks away from the reference
  # from passing devtools::test().
  record <- jsonlite::fromJSON(
    file.path(csr_root(), "quality", "data", "reference-report-agreement.json"),
    simplifyVector = FALSE
  )
  norm <- function(x) trimws(gsub("[[:space:]]+", " ", gsub("\\(\\s+", "(", x)))
  expect_setequal(names(record$displays), c("t-populations", "t-end-of-study", "t-demographics", "t-exposure", "t-ae-incidence", "t-sae-incidence", "t-subjects-by-site"))
  n_checked <- 0L
  for (slug in c("t-populations", "t-end-of-study")) {
    disp <- fixture_display(slug)
    spec <- record$displays[[slug]]
    for (row in spec$rows) {
      for (k in seq_along(row$printed)) {
        expect_identical(
          norm(analysis_cell(disp, slug, row$analysis, spec$columns[[k]])),
          norm(row$printed[[k]]),
          info = paste(slug, row$analysis, spec$columns[[k]])
        )
        n_checked <- n_checked + 1L
      }
      p <- row$p_value_printed
      if (!is.null(p)) {
        expect_identical(analysis_cell(disp, slug, row$analysis, "p-value"), p, info = row$analysis)
        n_checked <- n_checked + 1L
      }
    }
  }
  expect_identical(n_checked, 75L)
})

test_that("DSP-REF-002: the demographics and exposure displays publish every cell the pilot's own report printed for Tables 14-2.01 and 14-4.01 (#61)", {
  record <- jsonlite::fromJSON(
    file.path(csr_root(), "quality", "data", "reference-report-agreement.json"),
    simplifyVector = FALSE
  )
  norm <- function(x) trimws(gsub("[[:space:]]+", " ", gsub("\\(\\s+", "(", x)))
  data_rows <- function(disp) {
    tb <- disp$table
    keep <- vapply(seq_len(nrow(tb)), function(i) any(nzchar(unlist(tb[i, -1]))), logical(1))
    tb <- tb[keep, , drop = FALSE]
    tb$label <- plain(tb$label)
    tb
  }
  n_checked <- 0L
  # demographics: the report's 58 lines, in order, four cells and a p-value each
  disp <- fixture_display("t-demographics")
  tb <- data_rows(disp)
  rows <- record$displays[["t-demographics"]]$rows
  expect_identical(nrow(tb), length(rows))
  for (i in seq_along(rows)) {
    expect_identical(tb$label[i], norm(rows[[i]]$label), info = rows[[i]]$analysis)
    for (k in 1:4) {
      expect_identical(norm(tb[[paste0("col", k)]][i]), norm(rows[[i]]$printed[[k]]), info = paste(rows[[i]]$analysis, k))
      n_checked <- n_checked + 1L
    }
    expect_identical(tb$col5[i], rows[[i]]$p_value_printed %||% "", info = rows[[i]]$analysis)
    n_checked <- n_checked + 1L
  }
  # exposure: six report cells per line, gathered from the rendered blocks the record names
  disp <- fixture_display("t-exposure")
  tb <- data_rows(disp)
  for (row in record$displays[["t-exposure"]]$rows) {
    got <- unlist(lapply(row$published_from, function(pf) {
      hits <- which(tb$label == pf$label)
      unlist(tb[hits[[pf$occurrence]], paste0("col", unlist(pf$columns))])
    }))
    expect_identical(norm(unname(got)), vapply(row$printed, norm, character(1)), info = row$analysis)
    n_checked <- n_checked + length(got)
  }
  expect_identical(n_checked, 58L * 5L + 12L * 6L)
})

# The incidence tables, Tables 14-5.01 and 14-5.02 of the reference report (#62).
# Expected values come from the vendored ADAE and ADSL read with {haven}.

aei_ref <- function(serious = FALSE) {
  adsl <- ref_adsl()
  ae <- ref_phuse_xpt("adae")
  ae <- ae[ae$USUBJID %in% adsl$USUBJID & blank_na(ae$TRTEMFL) == "Y", , drop = FALSE]
  if (serious) ae <- ae[blank_na(ae$AESER) == "Y", , drop = FALSE]
  ae$ARM <- as.character(adsl$TRT01A)[match(ae$USUBJID, adsl$USUBJID)]
  ae
}
aei_fisher <- function(k1, n1, k2, n2) {
  if (k1 == 0 && k2 == 0) return("")
  p <- stats::fisher.test(rbind(c(k1, k2), c(n1 - k1, n2 - k2)))$p.value
  s <- if (p >= 0.995) ">0.99" else if (p < 0.0005) "<0.001" else formatC(round_half_up(p, 3), format = "f", digits = 3)
  if (p < 0.15) paste0(s, "*") else s
}

test_that("DSP-AEI-001: the any-event row and every organ-class row count subjects, percentages and events as the reference does, recomputed directly from ADAE (#62)", {
  disp <- fixture_display("t-ae-incidence")
  ae <- aei_ref()
  adsl <- ref_adsl()
  arms <- c("Placebo", "Xanomeline Low Dose", "Xanomeline High Dose")
  N <- vapply(arms, function(a) sum(adsl$TRT01A == a), numeric(1))
  cell_for <- function(sub, i) {
    n <- length(unique(sub$USUBJID[sub$ARM == arms[i]]))
    if (n == 0) "0" else sprintf("%d (%s%%) [%d]", n, format_stat(n / N[i], "p", list(p = 1)), sum(sub$ARM == arms[i]))
  }
  for (i in seq_along(arms)) {
    expect_identical(cell(disp, "ANY BODY SYSTEM", arms[i]), cell_for(ae, i))
    expect_identical(cell(disp, "CARDIAC DISORDERS", arms[i]), cell_for(ae[ae$AEBODSYS == "CARDIAC DISORDERS", ], i))
    expect_identical(cell(disp, "SINUS BRADYCARDIA", arms[i]), cell_for(ae[ae$AEDECOD == "SINUS BRADYCARDIA", ], i))
  }
  # the figures the report prints on its first line
  expect_identical(cell(disp, "ANY BODY SYSTEM", "Placebo"), "65 (75.6%) [281]")
  expect_identical(cell(disp, "ANY BODY SYSTEM", "Xanomeline High Dose"), "76 (90.5%) [433]")
  expect_identical(disp$columns$levels, c(arms, "Placebo vs. Low Dose", "Placebo vs. High Dose"))
})

test_that("DSP-AEI-002: every p-value is Fisher's exact test of placebo against the arm on subject incidence, starred below 0.15, >0.99 when it rounds to one, and blank where neither arm has a subject with the event (#62)", {
  disp <- fixture_display("t-ae-incidence")
  ae <- aei_ref()
  adsl <- ref_adsl()
  arms <- c("Placebo", "Xanomeline Low Dose", "Xanomeline High Dose")
  N <- vapply(arms, function(a) sum(adsl$TRT01A == a), numeric(1))
  k <- function(sub, i) length(unique(sub$USUBJID[sub$ARM == arms[i]]))
  checks <- list(
    list(label = "ANY BODY SYSTEM", sub = ae),
    list(label = "SINUS BRADYCARDIA", sub = ae[ae$AEDECOD == "SINUS BRADYCARDIA", ]),
    list(label = "MYOCARDIAL INFARCTION", sub = ae[ae$AEDECOD == "MYOCARDIAL INFARCTION", ]),
    list(label = "CARDIAC DISORDER", sub = ae[ae$AEDECOD == "CARDIAC DISORDER", ])
  )
  for (chk in checks) {
    expect_identical(cell(disp, chk$label, "Placebo vs. Low Dose"), aei_fisher(k(chk$sub, 1), N[1], k(chk$sub, 2), N[2]), info = chk$label)
    expect_identical(cell(disp, chk$label, "Placebo vs. High Dose"), aei_fisher(k(chk$sub, 1), N[1], k(chk$sub, 3), N[3]), info = chk$label)
  }
  expect_identical(cell(disp, "ANY BODY SYSTEM", "Placebo vs. Low Dose"), "0.007*")
  expect_identical(cell(disp, "MYOCARDIAL INFARCTION", "Placebo vs. High Dose"), ">0.99")
  expect_identical(cell(disp, "CARDIAC DISORDER", "Placebo vs. Low Dose"), "")
})

test_that("DSP-AEI-003: organ classes print alphabetically and preferred terms by high-dose subjects then name, the order the reference prints; the serious-events table orders terms by subjects summed across the arms (#62)", {
  disp <- fixture_display("t-ae-incidence")
  lab <- plain(disp$table$label)
  ind <- attr(regexpr("^(\u00a0\u00a0\u00a0)*", disp$table$label), "match.length") / 3
  socs <- lab[ind == 0 & lab != "ANY BODY SYSTEM"]
  expect_identical(socs, sort(socs))
  expect_identical(lab[1], "ANY BODY SYSTEM")
  ae <- aei_ref()
  card <- lab[seq(which(lab == "CARDIAC DISORDERS") + 1, which(lab == socs[2]) - 1)]
  high <- vapply(card, function(p) length(unique(ae$USUBJID[ae$AEDECOD == p & ae$ARM == "Xanomeline High Dose"])), numeric(1))
  expect_identical(card, card[order(-high, card)])
  sae <- plain(fixture_display("t-sae-incidence")$table$label)
  expect_identical(sae, c("ANY BODY SYSTEM", "NERVOUS SYSTEM DISORDERS", "SYNCOPE", "PARTIAL SEIZURES WITH SECONDARY GENERALISATION"))
})

test_that("DSP-AEI-004: the serious-events table counts the same way as the incidence table through one shared implementation (#62)", {
  spec <- read_analysis_spec("t-sae-incidence")
  expect_identical(spec$custom_from, "t-ae-incidence")
  expect_false(file.exists(file.path(display_dir("t-sae-incidence"), "custom.R")))
  disp <- fixture_display("t-sae-incidence")
  ae <- aei_ref(serious = TRUE)
  expect_equal(nrow(ae), 3)
  expect_identical(cell(disp, "ANY BODY SYSTEM", "Placebo"), "0")
  expect_identical(cell(disp, "ANY BODY SYSTEM", "Xanomeline High Dose"), "2 (2.4%) [2]")
  expect_identical(cell(disp, "ANY BODY SYSTEM", "Placebo vs. High Dose"), "0.243")
})

test_that("DSP-REF-003: the incidence and serious-events displays publish every cell the pilot's own report printed for Tables 14-5.01 and 14-5.02 — 258 lines of three cells and two p-values (#62)", {
  record <- jsonlite::fromJSON(
    file.path(csr_root(), "quality", "data", "reference-report-agreement.json"),
    simplifyVector = FALSE
  )
  norm <- function(x) trimws(gsub("[[:space:]]+", " ", gsub("\\(\\s+", "(", x)))
  n_checked <- 0L
  for (slug in c("t-ae-incidence", "t-sae-incidence")) {
    tb <- fixture_display(slug)$table
    keep <- vapply(seq_len(nrow(tb)), function(i) any(nzchar(unlist(tb[i, -1]))), logical(1))
    tb <- tb[keep, , drop = FALSE]
    tb$label <- plain(tb$label)
    rows <- record$displays[[slug]]$rows
    known <- record$displays[[slug]]$known_differences %||% list()
    expect_identical(nrow(tb), length(rows), info = slug)
    for (i in seq_along(rows)) {
      expect_identical(tb$label[i], norm(rows[[i]]$label), info = rows[[i]]$analysis)
      for (k in 1:3) {
        expect_identical(norm(tb[[paste0("col", k)]][i]), norm(rows[[i]]$printed[[k]]), info = paste(rows[[i]]$analysis, k))
      }
      want <- vapply(rows[[i]]$p_values_printed, function(x) x %||% "", character(1))
      for (kd in known) {
        # a recorded difference: the display prints what the record says it prints
        if (identical(kd$analysis, rows[[i]]$analysis)) {
          expect_identical(tb[[paste0("col", kd$column)]][i], kd$recomputed, info = kd$analysis)
          want[kd$column - 3] <- kd$recomputed
        }
      }
      expect_identical(unname(c(tb$col4[i], tb$col5[i])), unname(want), info = rows[[i]]$analysis)
      n_checked <- n_checked + 5L
    }
  }
  expect_length(record$displays[["t-ae-incidence"]]$known_differences, 4)
  expect_identical(n_checked, 258L * 5L)
})

test_that("DSP-FLOW-001: the disposition figure counts screened, screen-failure, randomised, Week 24 and study completers from DM and ADSL directly, prints them in its table and draws them in its flow (#63)", {
  disp <- fixture_display("f-disposition")
  dm <- ref_phuse_xpt("dm")
  adsl <- ref_phuse_adsl()
  want <- c(
    length(unique(dm$USUBJID)),
    sum(blank_na(dm$ARM) == "Screen Failure"),
    nrow(adsl),
    sum(blank_na(adsl$COMP24FL) == "Y"),
    sum(blank_na(adsl$DISCONFL) != "Y")
  )
  expect_identical(want, c(306L, 52L, 254L, 118L, 110L))
  expect_identical(disp$table$col1, as.character(want))
  for (n in want) expect_true(grepl(paste0("= ", n, "<"), disp$figure), info = n)
  expect_false(grepl("http", disp$figure, fixed = TRUE))
  expect_true(grepl("<svg", disp$figure, fixed = TRUE))
  # the screened count is DM's, not ADSL's: this is the one display reading the screened population
  prov <- fixture_ard("f-disposition")$provenance$data
  expect_setequal(vapply(prov, function(x) x$dataset, character(1)), c("adsl", "dm"))
# The subjects-by-site table (Table 14-1.03) and the report's in-text redraws
# of Section 14 tables (Tables 11-1, 12-1, 12-4) — Issue E of D0032 (#63).

test_that("DSP-SITE-001: every site row counts the intent-to-treat, efficacy and Week 24 completer subjects per arm and overall, equal to a direct count of ADSL (#63)", {
  disp <- fixture_display("t-subjects-by-site")
  raw <- ref_phuse_adsl()
  arms <- c("Placebo", "Xanomeline Low Dose", "Xanomeline High Dose")
  expect_length(disp$columns$levels, 12)
  lab <- plain(disp$table$label)
  for (site in c("701", "704", "717")) {
    i <- which(grepl(paste0(" / ", site, "$"), lab))
    expect_length(i, 1)
    in_site <- blank_na(raw$SITEID) == site
    k <- 0
    for (a in c(arms, "Total")) {
      in_arm <- if (a == "Total") rep(TRUE, nrow(raw)) else as.character(raw$TRT01P) == a
      for (flag in c("ITTFL", "EFFFL", "COMP24FL")) {
        k <- k + 1
        expect_identical(disp$table[[paste0("col", k)]][i], as.character(sum(in_site & in_arm & blank_na(raw[[flag]]) == "Y")), info = paste(site, a, flag))
      }
    }
  }
  tot <- which(lab == "TOTAL")
  expect_identical(unname(vapply(1:12, function(k) disp$table[[paste0("col", k)]][tot], character(1))), c("86", "79", "60", "84", "81", "28", "84", "74", "30", "254", "234", "118"))
})

test_that("DSP-SITE-002: the seven small sites are listed under pooled id 900, each on its own line, after the ten that stand alone (#63)", {
  disp <- fixture_display("t-subjects-by-site")
  lab <- plain(disp$table$label)
  raw <- ref_phuse_adsl()
  pooled <- sort(unique(blank_na(raw$SITEID[blank_na(raw$SITEGR1) == "900"])))
  expect_length(pooled, 7)
  for (s in pooled) expect_true(paste0("900 / ", s) %in% lab, info = s)
  standalone <- sort(unique(blank_na(raw$SITEID[blank_na(raw$SITEGR1) != "900"])))
  expect_length(standalone, 10)
  for (s in standalone) expect_true(paste0(s, " / ", s) %in% lab, info = s)
  expect_identical(lab[1], "701 / 701")
  expect_identical(lab[18], "TOTAL")
})

test_that("DSP-REF-004: the subjects-by-site display publishes every cell the pilot's own report printed for Table 14-1.03 (#63)", {
  record <- jsonlite::fromJSON(
    file.path(csr_root(), "quality", "data", "reference-report-agreement.json"),
    simplifyVector = FALSE
  )
  tb <- fixture_display("t-subjects-by-site")$table
  tb$label <- plain(tb$label)
  rows <- record$displays[["t-subjects-by-site"]]$rows
  expect_length(rows, 18)
  expect_identical(nrow(tb), length(rows))
  n_checked <- 0L
  for (i in seq_along(rows)) {
    expect_identical(tb$label[i], rows[[i]]$label, info = rows[[i]]$analysis)
    for (k in 1:12) {
      expect_identical(tb[[paste0("col", k)]][i], rows[[i]]$printed[[k]], info = paste(rows[[i]]$analysis, k))
      n_checked <- n_checked + 1L
    }
  }
  expect_identical(n_checked, 216L)
})

test_that("DSP-INTXT-001: the in-text demographics redraw is the report's Table 11-1 — mean and range, percentages, race as White/Caucasian or other — from the same ARD as the full table (#63)", {
  full <- fixture_display("t-demographics")
  intext <- fixture_display("t-demographics", "in_text")
  expect_identical(intext$columns$levels, c("Placebo", "Xanomeline Low Dose", "Xanomeline High Dose", "Total"))
  expect_identical(cell(intext, "Age (years), mean (range)", "Placebo"), "75.2 (52-89)")
  expect_identical(cell(intext, "Age (years), mean (range)", "Total"), "75.1 (51-89)")
  expect_identical(cell(intext, "Male", "Xanomeline High Dose"), "52%")
  expect_identical(cell(intext, "White/Caucasian", "Total"), "86%")
  expect_identical(cell(intext, "Other", "Placebo"), "13%")
  expect_identical(cell(intext, "Education (years), mean (range)", "Xanomeline Low Dose"), "13.2 (3-24)")
  # one ARD, two renderings: the mean the redraw prints is the full table's mean
  expect_identical(sub(" .*$", "", cell(intext, "Age (years), mean (range)", "Placebo")), full$table$col1[which(plain(full$table$label) == "Mean")[1]])
})

test_that("DSP-INTXT-002: the in-text incidence redraw is the report's Table 12-1 — terms at 5% or more in any arm, flat, in title case, an asterisk where the placebo comparison has p < 0.15 (#63)", {
  intext <- fixture_display("t-ae-incidence", "in_text")
  lab <- plain(intext$table$label)
  expect_identical(intext$columns$levels, c("Placebo", "Xanomeline Low Dose", "Xanomeline High Dose"))
  expect_false(any(grepl("DISORDERS$", lab)))
  expect_identical(lab[1:4], c("Sinus Bradycardia", "Vomiting", "Nausea", "Diarrhoea"))
  expect_identical(cell(intext, "Sinus Bradycardia", "Xanomeline Low Dose"), "7 (8.3%)*")
  expect_identical(cell(intext, "Sinus Bradycardia", "Placebo"), "2 (2.3%)")
  expect_identical(cell(intext, "Vomiting", "Xanomeline High Dose"), "7 (8.3%)")
  expect_identical(cell(intext, "Application Site Pruritus", "Xanomeline High Dose"), "22 (26.2%)*")
  expect_identical(cell(intext, "Blister", "Placebo"), "0")
  # every term shown reaches 5% in at least one arm; the full table has many more
  ard <- fixture_ard("t-ae-incidence")$rows
  for (term in lab) {
    p <- ard[ard$analysis == "by_soc_pt" & ard$variable == "AEDECOD" & toupper(term) == ard$variable_level & ard$stat_name == "p", ]
    expect_gte(max(unlist(p$stat)), 0.05, label = term)
  }
  expect_gt(nrow(fixture_display("t-ae-incidence")$table), 4 * nrow(intext$table))
})

test_that("DSP-INTXT-003: the in-text weight redraw is the report's Table 12-4 — n and mean per arm for baseline and the changes at Week 24 and end of treatment — from the weight table's own ARD (#63)", {
  intext <- fixture_display("t-weight", "in_text")
  expect_identical(intext$columns$levels, c("Placebo n", "Placebo Mean", "Low Dose n", "Low Dose Mean", "High Dose n", "High Dose Mean"))
  lab <- plain(intext$table$label)
  i <- which(lab == "Baseline")
  expect_identical(unname(vapply(1:6, function(k) intext$table[[paste0("col", k)]][i], character(1))), c("86", "62.8", "83", "67.3", "84", "70.0"))
  i <- which(lab == "Change at Week 24")
  expect_identical(unname(vapply(1:6, function(k) intext$table[[paste0("col", k)]][i], character(1))), c("59", "0.1", "27", "-0.3", "30", "1.0"))
  i <- which(lab == "Change at End of Treatment")
  expect_identical(unname(vapply(1:6, function(k) intext$table[[paste0("col", k)]][i], character(1))), c("84", "0.2", "83", "-0.4", "81", "0.1"))
})
