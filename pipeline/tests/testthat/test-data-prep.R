# The pharmaverse re-derivation is the ALTERNATE lane since v0.4.0 (D0032 R2,
# #60). The derivations below exist because that packaging lacks what the
# study's own states, so they are tested on the lane that needs them.

test_that("TFL-PREP-001: screen failures are excluded from every prepared dataset (#1)", {
  prepared <- fixture_data_pv()
  raw_sf <- pharmaverseadam::adsl$USUBJID[pharmaverseadam::adsl$ARM == "Screen Failure"]
  expect_length(raw_sf, 52)
  expect_equal(nrow(prepared$adsl), nrow(pharmaverseadam::adsl) - 52)
  for (nm in names(prepared)) {
    expect_false(any(prepared[[nm]]$USUBJID %in% raw_sf), info = nm)
  }
  expect_false("Screen Failure" %in% as.character(prepared$adsl$ARM))
})

test_that("TFL-PREP-002: ITTFL is derived from randomisation, SAFFL is used as shipped (#1)", {
  prepared <- fixture_data_pv()
  expected_itt <- ifelse(!is.na(prepared$adsl$RANDDT), "Y", "N")
  expect_identical(prepared$adsl$ITTFL, expected_itt)
  # every non-screen-failure subject in CDISCPILOT01 was randomised and dosed
  expect_equal(sum(prepared$adsl$ITTFL == "Y"), 254)
  expect_equal(sum(prepared$adsl$SAFFL == "Y"), 254)
  expect_false(any(is.na(prepared$adsl$SAFFL)))
})

test_that("TFL-PREP-003: COMPLFL and DISCREAS reconstruct EOSSTT exactly (#1)", {
  adsl <- fixture_data_pv()$adsl
  ref <- ref_adsl_pv()
  expect_equal(sum(adsl$COMPLFL == "Y"), sum(ref$EOSSTT == "COMPLETED"))
  expect_equal(sum(adsl$COMPLFL == "N"), sum(ref$EOSSTT == "DISCONTINUED"))
  # DISCREAS is populated for discontinued subjects only, and partitions them
  expect_equal(sum(!is.na(adsl$DISCREAS)), sum(adsl$COMPLFL == "N"))
  expect_true(all(is.na(adsl$DISCREAS[adsl$COMPLFL == "Y"])))
  expect_equal(sum(adsl$DISCREAS == "Death", na.rm = TRUE), sum(ref$DTHFL == "Y", na.rm = TRUE))
  expect_equal(
    sum(adsl$DISCREAS == "Death", na.rm = TRUE) +
      sum(adsl$DISCREAS == "Other/Not specified", na.rm = TRUE),
    sum(adsl$COMPLFL == "N")
  )
})

test_that("TFL-PREP-004: baseline vitals are merged from ADVS onto ADSL (#1)", {
  adsl <- fixture_data_pv()$adsl
  advs <- pharmaverseadam::advs
  bl <- advs[advs$ABLFL %in% "Y" & advs$PARAMCD == "WEIGHT" & advs$USUBJID %in% adsl$USUBJID, ]
  expect_equal(sum(!is.na(adsl$BLWT)), nrow(bl))
  one <- bl$USUBJID[1]
  expect_equal(adsl$BLWT[adsl$USUBJID == one], bl$AVAL[bl$USUBJID == one])
  expect_true(all(c("BLWT", "BLHT", "BLBMI") %in% names(adsl)))
})

test_that("TFL-PREP-005: the manifest describes every prepared dataset with a sha256 hash (#1)", {
  prepared <- fixture_data_pv()
  m <- data_manifest(prepared)
  expect_setequal(m$dataset, names(prepared))
  expect_equal(m$n_row[m$dataset == "adsl"], nrow(prepared$adsl))
  expect_true(all(grepl("^sha256:[0-9a-f]{64}$", m$hash)))
  expect_true(all(m$source_pkg == "pharmaverseadam"))
  expect_true(all(nzchar(m$source_version)))
  # the hash is content-addressed: the same data yields the same hash
  expect_identical(m$hash[m$dataset == "adsl"], hash_object(prepared$adsl))
  expect_error(data_manifest(list(adsl = prepared$adsl)), "no manifest")
})

test_that("TFL-PREP-006: the analysis-set registry rejects unknown sets and applies flags (#1)", {
  prepared <- fixture_data_pv()
  expect_error(apply_analysis_set(prepared$adsl, "responders"), "Unknown analysis_set")
  # 'efficacy' IS a known set (it maps to EFFFL); on a source that does not
  # state one, the failure must name the missing flag, not the set
  expect_error(apply_analysis_set(prepared$adsl, "efficacy"), "population flag 'EFFFL'")
  expect_equal(nrow(apply_analysis_set(prepared$adsl, "safety")), 254)
  expect_equal(nrow(apply_analysis_set(prepared$adsl, "all")), 254)
  # 'completers' is the study model's COMP24FL: stated by the study's own package,
  # absent from the re-derivation, so the alternate lane must say so by name
  expect_error(apply_analysis_set(prepared$adsl, "completers"), "population flag 'COMP24FL'")
  expect_equal(nrow(apply_analysis_set(fixture_data()$adsl, "completers")), 118)
  expect_error(apply_analysis_set(data.frame(x = 1), "safety"), "population flag")
})

test_that("TFL-PREP-007: treatment arms are ordered by dose, not alphabetically (#1)", {
  adsl <- fixture_data_pv()$adsl
  expect_identical(
    levels(adsl$TRT01A),
    c("Placebo", "Xanomeline Low Dose", "Xanomeline High Dose")
  )
  expect_identical(levels(fixture_data_pv()$adae$TRT01A), levels(adsl$TRT01A))
})

test_that("TFL-PREP-017: Race (Origin) is derived on both lanes — ethnicity first, then race, with the report's labels (#61)", {
  for (adsl in list(fixture_data()$adsl, fixture_data_pv()$adsl)) {
    expect_true(is.factor(adsl$RACEOR))
    expect_identical(levels(adsl$RACEOR), c("Caucasian", "African Descent", "Hispanic", "Other"))
    hisp <- as.character(adsl$ETHNIC) == "HISPANIC OR LATINO"
    expect_true(all(adsl$RACEOR[hisp] == "Hispanic"))
    expect_true(all(adsl$RACEOR[!hisp & adsl$RACE == "WHITE"] == "Caucasian"))
    expect_equal(sum(adsl$RACEOR == "Caucasian") + sum(adsl$RACEOR == "Hispanic"), sum(adsl$RACE == "WHITE"))
  }
})
