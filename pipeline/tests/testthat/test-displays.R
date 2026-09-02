test_that("DSP-DEMO-001: the age summary matches ADSL computed directly (#1)", {
  disp <- fixture_display("t-demographics")
  ref <- ref_adsl()
  age <- ref$AGE[ref$TRT01A == "Placebo"]
  idx <- which(plain(disp$table$label) == "Mean (SD)")[1]
  expect_identical(
    disp$table$col1[idx],
    paste0(format_stat(mean(age), "mean"), " (", format_stat(stats::sd(age), "sd"), ")")
  )
  expect_identical(disp$table$col1[idx], "75.2 (8.59)")
  n_idx <- which(plain(disp$table$label) == "n")[1]
  expect_identical(disp$table$col1[n_idx], as.character(length(age)))
  rng <- which(plain(disp$table$label) == "Min, Max")[1]
  expect_identical(disp$table$col1[rng], paste0(min(age), ", ", max(age)))
})

test_that("DSP-DEMO-002: sex, race and age-group counts match ADSL (#1)", {
  disp <- fixture_display("t-demographics")
  ref <- ref_adsl()
  for (arm in c("Placebo", "Xanomeline Low Dose", "Xanomeline High Dose")) {
    sub <- ref[ref$TRT01A == arm, ]
    n_f <- sum(sub$SEX == "F")
    expect_identical(
      cell(disp, "F", arm),
      paste0(n_f, " (", format_stat(n_f / nrow(sub), "p"), "%)")
    )
    n_white <- sum(sub$RACE == "WHITE")
    expect_identical(
      cell(disp, "WHITE", arm),
      paste0(n_white, " (", format_stat(n_white / nrow(sub), "p"), "%)")
    )
  }
  # the pilot's own age grouping, three levels, as the reference report prints it
  n80 <- sum(ref$AGEGR1 == ">80")
  expect_identical(n80, 77L)
  expect_identical(cell(disp, ">80", "Total"), paste0(n80, " (", format_stat(n80 / nrow(ref), "p"), "%)"))
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
    expect_gt(sum(grepl("[0-9]", cells)), 5)
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
  expect_setequal(names(record$displays), c("t-populations", "t-end-of-study"))
  n_checked <- 0L
  for (slug in names(record$displays)) {
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
