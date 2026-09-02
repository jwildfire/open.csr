# The study model: library/study.yaml is the one place that spells the arms and
# the analysis sets, and its per-arm counts are DATA that the pipeline must
# reproduce. Expected values here come from the vendored pilot ADSL read straight
# with {haven}, never through the code under test.

model_arms <- function() vapply(study_model()$arms, function(a) a$label, character(1))

test_that("STD-MODEL-003: the treatment vocabulary and the analysis-set registry resolve from the study model, not from code (#59)", {
  m <- study_model()
  expect_identical(trt_levels(), model_arms())
  expect_identical(trt_levels(), c("Placebo", "Xanomeline Low Dose", "Xanomeline High Dose"))
  for (nm in names(m$analysis_sets)) {
    flag <- m$analysis_sets[[nm]]$flag
    expect_identical(analysis_set_flag(nm), if (is.null(flag)) NA_character_ else flag, info = nm)
  }
  expect_error(analysis_set_flag("no-such-set"), "Unknown analysis_set")
  # a model that spells an arm twice, or counts a set for the wrong arms, is refused
  bad <- m
  bad$arms[[2]]$label <- "Placebo"
  expect_error(validate_study_model(bad, "study.yaml"), "distinct `label`")
  bad <- m
  bad$analysis_sets$safety$subjects <- list(Placebo = 86)
  expect_error(validate_study_model(bad, "study.yaml"), "exactly the arms")
})

test_that("STD-MODEL-004: every count the model declares is what the default lane's ADSL holds, per arm and per set (#59)", {
  m <- study_model()
  raw <- ref_phuse_adsl()
  prepared <- fixture_data()$adsl
  for (nm in names(m$analysis_sets)) {
    s <- m$analysis_sets[[nm]]
    for (arm in model_arms()) {
      in_arm <- as.character(raw$TRT01P) == arm
      got <- if (is.null(s$flag)) sum(in_arm) else sum(in_arm & blank_na(raw[[s$flag]]) == "Y")
      expect_identical(got, as.integer(s$subjects[[arm]]), info = paste(nm, arm, "raw"))
      # and through the pipeline, on both assignments, since they agree in this packaging
      for (col in c("TRT01P", "TRT01A")) {
        sub <- prepared[as.character(prepared[[col]]) == arm, , drop = FALSE]
        got2 <- if (is.null(s$flag)) nrow(sub) else sum(sub[[s$flag]] == "Y")
        expect_identical(got2, as.integer(s$subjects[[arm]]), info = paste(nm, arm, col))
      }
    }
  }
})

test_that("STD-MODEL-005: every committed ARD carries a population record that agrees with the study model for its analysis set (#59)", {
  m <- study_model()
  for (slug in display_slugs()) {
    ard <- fixture_ard(slug)
    pop <- ard$provenance$population
    expect_false(is.null(pop), info = paste(slug, "has a population record"))
    expect_true(pop$analysis_set %in% names(m$analysis_sets), info = slug)
    if (is.null(pop$n)) {
      # a listing with no arm grouping: allowed, but it must say so
      expect_true(is.null(pop$group) || !pop$group %in% names(m$group_variables), info = slug)
      next
    }
    want <- m$analysis_sets[[pop$analysis_set]]$subjects
    for (arm in model_arms()) {
      expect_identical(as.integer(pop$n[[arm]]), as.integer(want[[arm]]), info = paste(slug, arm))
    }
  }
})

test_that("STD-SRC-001: the default registry serves every pilot dataset from the study's own package, and only the two datasets it lacks come from the alternate (#60)", {
  reg <- data_sources()
  pilot <- phuse_datasets()
  expect_true(all(reg[pilot] == "phuse"))
  alternate_only <- names(reg)[reg == "pharmaverseadam"]
  expect_setequal(alternate_only, c("adex", "adlb"))
  # the alternate lane is still readable, as a whole and per dataset
  expect_identical(unname(data_sources("pharmaverseadam")[["adsl"]]), "pharmaverseadam")
  expect_identical(unname(data_sources(c(adsl = "pharmaverseadam"))[["adsl"]]), "pharmaverseadam")
  # and no committed display reads it
  for (slug in display_slugs()) {
    srcs <- vapply(fixture_ard(slug)$provenance$data, function(d) d$source_pkg, character(1))
    expect_true(all(srcs == "phuse-org/phuse-scripts:data/adam"), info = slug)
  }
})

test_that("STD-SRC-002: the pilot's ADVS prepares without derived-record or timepoint columns the alternate carries, and its series keys match (#60)", {
  prepared <- fixture_data()
  advs <- prepared$advs
  # no derived records in this packaging: DTYPE is supplied all-missing so the
  # displays' `is.na(DTYPE)` filters mean "observed" on both lanes
  expect_true("DTYPE" %in% names(advs))
  expect_true(all(is.na(advs$DTYPE)))
  expect_true(all(c("BLVAL", "CHGBL", "EOTFL") %in% names(advs)))
  expect_true(any(advs$EOTFL == "Y"))
  # an unset timepoint is the blank string in this packaging; the key treats it as absent
  key <- advs_series_key(advs)
  expect_true(all(nzchar(key)))
  expect_false(any(grepl("NA$", key)))
})
