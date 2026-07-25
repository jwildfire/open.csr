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
  expect_identical(cell(disp, ">64", "Total"), paste0(sum(ref$AGEGR1 == ">64"), " (87.0%)"))
})

test_that("DSP-DISP-001: disposition counts reproduce EOSSTT (#1)", {
  disp <- fixture_display("t-disposition")
  ref <- ref_adsl()
  for (arm in c("Placebo", "Xanomeline Low Dose", "Xanomeline High Dose")) {
    sub <- ref[ref$TRT01A == arm, ]
    expect_match(cell(disp, "Subjects randomised", arm), paste0("^", nrow(sub), " \\(100\\.0%\\)$"))
    expect_match(cell(disp, "Completed the study", arm), paste0("^", sum(sub$EOSSTT == "COMPLETED"), " \\("))
    expect_match(cell(disp, "Discontinued the study", arm), paste0("^", sum(sub$EOSSTT == "DISCONTINUED"), " \\("))
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
  expect_equal(count_of("Died on study", "Total"), sum(ref_adsl()$DTHFL == "Y", na.rm = TRUE))
})

test_that("DSP-EXP-001: exposure duration matches the ADEX TDURD parameter (#1)", {
  disp <- fixture_display("t-exposure")
  dur <- ref_adex()[ref_adex()$PARAMCD == "TDURD", ]
  for (arm in c("Placebo", "Xanomeline Low Dose", "Xanomeline High Dose")) {
    x <- dur$AVAL[dur$TRT01A == arm]
    idx <- which(plain(disp$table$label) == "Mean (SD)")[1]
    j <- which(disp$columns$levels == arm)
    expect_identical(
      disp$table[[paste0("col", j)]][idx],
      paste0(format_stat(mean(x), "mean"), " (", format_stat(stats::sd(x), "sd"), ")")
    )
  }
  idx <- which(plain(disp$table$label) == "Median")[1]
  x <- dur$AVAL[dur$TRT01A == "Placebo"]
  expect_identical(disp$table$col1[idx], format_stat(stats::median(x), "median"))
})

test_that("DSP-EXP-002: cumulative exposure categories are monotone non-increasing (#1)", {
  disp <- fixture_display("t-exposure")
  labels <- c("≥ 1 day", "≥ 30 days", "≥ 90 days", "≥ 180 days")
  dur <- ref_adex()[ref_adex()$PARAMCD == "TDURD", ]
  for (arm in c("Placebo", "Xanomeline Low Dose", "Xanomeline High Dose")) {
    counts <- vapply(labels, function(l) as.integer(sub(" .*$", "", cell(disp, l, arm))), integer(1))
    expect_true(all(diff(counts) <= 0), info = arm)
    x <- dur$AVAL[dur$TRT01A == arm]
    expect_equal(unname(counts), c(sum(x >= 1), sum(x >= 30), sum(x >= 90), sum(x >= 180)), info = arm)
  }
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
