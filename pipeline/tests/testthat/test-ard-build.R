test_that("TFL-ARD-001: build_ard returns one row per computed statistic, tagged with its analysis (#1)", {
  spec <- read_analysis_spec("t-demographics")
  rows <- build_ard(spec, fixture_data())
  expect_true(all(ard_row_cols() %in% names(rows)))
  expect_setequal(unique(rows$analysis), names(spec$analyses))
  # every row is one statistic
  expect_true(all(nzchar(rows$stat_name)))
  expect_true(all(vapply(rows$stat, function(x) length(x) >= 1, logical(1))))
  # AGE mean exists once per column, including the total column
  age_mean <- rows[rows$analysis == "age" & rows$stat_name == "mean", ]
  expect_setequal(
    age_mean$group1_level,
    c("Placebo", "Xanomeline Low Dose", "Xanomeline High Dose", "Total")
  )
})

test_that("TFL-ARD-001: continuous statistics equal a direct dplyr computation (#1)", {
  rows <- build_ard(read_analysis_spec("t-demographics"), fixture_data())
  ref <- ref_adsl()
  for (arm in c("Placebo", "Xanomeline Low Dose", "Xanomeline High Dose")) {
    age <- ref$AGE[ref$TRT01A == arm]
    expect_equal(ard_binding(rows, paste0("age:N;group=", arm)), length(age))
    expect_equal(ard_binding(rows, paste0("age:mean;group=", arm)), mean(age))
    expect_equal(ard_binding(rows, paste0("age:sd;group=", arm)), stats::sd(age))
    expect_equal(ard_binding(rows, paste0("age:median;group=", arm)), stats::median(age))
    expect_equal(ard_binding(rows, paste0("age:min;group=", arm)), min(age))
    expect_equal(ard_binding(rows, paste0("age:max;group=", arm)), max(age))
  }
  expect_equal(ard_binding(rows, "age:mean;group=Total"), mean(ref$AGE))
})

test_that("TFL-ARD-002: subject_count uses the analysis-set subject denominator (#1)", {
  rows <- build_ard(read_analysis_spec("t-ae-overview"), fixture_data(), display_dir("t-ae-overview"))
  adsl <- ref_adsl()
  adae <- ref_adae()
  for (arm in c("Placebo", "Xanomeline Low Dose", "Xanomeline High Dose")) {
    n_arm <- sum(adsl$TRT01A == arm)
    teae <- adae[adae$TRTEMFL %in% "Y" & adae$TRT01A == arm, ]
    expect_equal(ard_binding(rows, paste0("any_ae:N;group=", arm)), n_arm)
    expect_equal(ard_binding(rows, paste0("any_ae:n;group=", arm)), n_subjects(teae))
    expect_equal(
      ard_binding(rows, paste0("any_ae:p;group=", arm)),
      n_subjects(teae) / n_arm
    )
  }
})

test_that("TFL-ARD-003: hierarchical_count nests preferred terms under their SOC (#1)", {
  rows <- build_ard(read_analysis_spec("t-ae-common"), fixture_data())
  adae <- ref_adae()
  teae <- adae[adae$TRTEMFL %in% "Y", ]

  soc <- rows[rows$variable == "AEBODSYS" & rows$context == "hierarchical", ]
  pt <- rows[rows$variable == "AEDECOD" & rows$context == "hierarchical", ]
  expect_true(nrow(soc) > 0 && nrow(pt) > 0)
  # inner rows always name their outer level
  expect_true(all(pt$group2 == "AEBODSYS"))
  expect_true(all(!is.na(pt$group2_level)))
  expect_true(all(pt$group2_level %in% soc$variable_level))

  gi <- teae[teae$AEBODSYS == "GASTROINTESTINAL DISORDERS" & teae$TRT01A == "Placebo", ]
  expect_equal(
    ard_binding(rows, "by_soc_pt:n;group=Placebo;variable=AEBODSYS;variable_level=GASTROINTESTINAL DISORDERS"),
    n_subjects(gi)
  )
  diarrhoea <- teae[teae$AEDECOD == "DIARRHOEA" & teae$TRT01A == "Placebo", ]
  expect_equal(
    ard_binding(rows, "by_soc_pt:n;group=Placebo;variable=AEDECOD;variable_level=DIARRHOEA"),
    n_subjects(diarrhoea)
  )
  # a subject with two PTs in one SOC is counted once at SOC level
  expect_lte(
    ard_binding(rows, "by_soc_pt:n;group=Placebo;variable=AEDECOD;variable_level=DIARRHOEA"),
    ard_binding(rows, "by_soc_pt:n;group=Placebo;variable=AEBODSYS;variable_level=GASTROINTESTINAL DISORDERS")
  )
})

test_that("TFL-ARD-004: the total column is produced by the same code path as the arms (#1)", {
  rows <- build_ard(read_analysis_spec("t-ae-overview"), fixture_data(), display_dir("t-ae-overview"))
  arms <- c("Placebo", "Xanomeline Low Dose", "Xanomeline High Dose")
  n_arms <- vapply(arms, function(a) ard_binding(rows, paste0("any_ae:n;group=", a)), numeric(1))
  expect_equal(ard_binding(rows, "any_ae:n;group=Total"), sum(n_arms))
  expect_equal(ard_binding(rows, "any_ae:N;group=Total"), nrow(ref_adsl()))
  # the total rows carry the grouping variable name, not the internal constant
  totals <- rows[rows$group1_level == "Total", ]
  expect_true(all(totals$group1 == "TRT01A"))
  expect_false(any(grepl("opencsr", rows$group1, fixed = TRUE)))
})

test_that("TFL-ARD-005: listing passes records through as one row per variable (#1)", {
  rows <- build_ard(read_analysis_spec("l-ae-serious"), fixture_data())
  sae <- ref_adae()[ref_adae()$AESER %in% "Y", ]
  vars <- read_analysis_spec("l-ae-serious")$analyses$sae_records$variables
  expect_equal(nrow(rows), nrow(sae) * length(vars))
  expect_true(all(rows$context == "listing"))
  expect_setequal(unique(rows$variable), vars)
  expect_equal(length(unique(rows$group1_level)), nrow(sae))
  pts <- unlist(rows$stat[rows$variable == "AEDECOD"])
  expect_setequal(pts, sae$AEDECOD)
})

test_that("TFL-ARD-006: an analysis may dispatch to a function in custom.R (#1)", {
  spec <- read_analysis_spec("t-ae-overview")
  env <- source_custom(display_dir("t-ae-overview"))
  expect_true(is.environment(env))
  rows <- build_ard(spec, fixture_data(), env)
  teae <- ref_adae()[ref_adae()$TRTEMFL %in% "Y", ]
  expect_equal(ard_binding(rows, "n_events:n;group=Placebo"), sum(teae$TRT01A == "Placebo"))
  expect_equal(ard_binding(rows, "n_events:n;group=Total"), nrow(teae))
  expect_true(all(rows$context[rows$analysis == "n_events"] == "event_count"))
  # a missing custom function is a build failure, not a silent skip
  expect_error(build_ard(spec, fixture_data(), new.env()), "custom function")
})

test_that("TFL-ARD-007: an analysis filter restricts the records it summarises (#1)", {
  rows <- build_ard(read_analysis_spec("t-exposure"), fixture_data())
  ref <- ref_adsl()
  comp <- ref[ref$TRT01A == "Placebo" & blank_na(ref$COMP24FL) == "Y", ]
  expect_equal(ard_binding(rows, "avg_daily_dose_comp:N;group=Placebo"), nrow(comp))
  expect_equal(ard_binding(rows, "total_dose_comp:mean;group=Placebo"), mean(comp$CUMDOSE))
  expect_equal(ard_binding(rows, "total_dose:N;group=Placebo"), sum(ref$TRT01A == "Placebo"))
  # a filter that does not yield one logical per row is rejected
  spec <- read_analysis_spec("t-exposure")
  spec$analyses[[3]]$filter <- "AVGDD"
  expect_error(build_ard(spec, fixture_data()), "one logical per row")
  spec$analyses[[3]]$filter <- "NOSUCHVAR == 1"
  expect_error(build_ard(spec, fixture_data()), "could not evaluate filter")
})

test_that("TFL-ARD-008: cards' per-statistic warning and error columns survive into the ARD (#1)", {
  rows <- build_ard(read_analysis_spec("t-exposure"), fixture_data())
  expect_true(all(c("warning", "error") %in% names(rows)))
  expect_true(is.character(rows$warning))
  expect_true(is.character(rows$error))
  # Placebo's planned dose is zero for every subject, so its dispersion is
  # computed on a constant vector: the result is retained as 0, never dropped.
  pl <- rows[rows$analysis == "avg_daily_dose" & rows$group1_level == "Placebo", ]
  expect_gt(nrow(pl), 0)
  expect_equal(unlist(pl$stat[pl$stat_name == "sd"]), 0)
  expect_equal(sum(rows$error != "", na.rm = TRUE), 0)
})

test_that("TFL-ARD-009: a binding address must resolve to exactly one ARD row (#1)", {
  rows <- build_ard(read_analysis_spec("t-demographics"), fixture_data())
  expect_equal(ard_binding(rows, "sex:n;group=Placebo;variable_level=F"), sum(ref_adsl()$SEX == "F" & ref_adsl()$TRT01A == "Placebo"))
  expect_error(ard_binding(rows, "sex:n;group=Placebo"), "resolved 2 ARD rows")
  expect_error(ard_binding(rows, "nope:n;group=Placebo"), "resolved 0 ARD rows")
  expect_error(ard_binding(rows, "sex-n"), "must start with")
})

test_that("TFL-QNT-001: quartiles follow the SAS-compatible type-2 definition (#1)", {
  rows <- build_ard(read_analysis_spec("t-exposure"), fixture_data())
  ref <- ref_adsl()
  x <- ref$CUMDOSE[ref$TRT01A == "Xanomeline High Dose"]
  got <- rows[rows$analysis == "total_dose" & rows$group1_level == "Xanomeline High Dose" & rows$stat_name == "p25", ]
  expect_equal(nrow(got), 1)
  expect_equal(unlist(got$stat), unname(stats::quantile(x, 0.25, type = 2)))
  # and that is NOT R's default; the difference is the point of the requirement
  expect_false(isTRUE(all.equal(
    unname(stats::quantile(x, 0.25, type = 2)),
    unname(stats::quantile(x, 0.25, type = 7))
  )))
})
