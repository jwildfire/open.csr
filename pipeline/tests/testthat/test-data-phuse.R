# The CDISC pilot's own ADaM package, vendored from phuse-org/phuse-scripts.
#
# Expected values here are computed independently of the code under test:
# either from the raw vendored files, or from the record committed at
# quality/data/source-agreement.json, which qc/source-agreement.R produces by a
# route that never loads {opencsr}.

phuse_record <- function() {
  memo("phuse_record", jsonlite::fromJSON(
    file.path(csr_root(), "quality", "data", "source-agreement.json"),
    simplifyVector = FALSE
  ))
}

# The comparison rule stated in quality/data/source-agreement.json, implemented
# here rather than imported, so this file and qc/source-agreement.R agree by
# arriving at the same numbers rather than by sharing a function.
n_disagreeing <- function(x, y) {
  blank_na <- function(v) {
    v <- as.character(v)
    v[!is.na(v) & !nzchar(v)] <- NA_character_
    v
  }
  x <- blank_na(x)
  y <- blank_na(y)
  sum(!((is.na(x) & is.na(y)) | (!is.na(x) & !is.na(y) & x == y)))
}

test_that("TFL-PREP-008: every vendored PHUSE file matches its recorded provenance (#39)", {
  prov <- phuse_provenance()
  expect_identical(prov$licence, "MIT")
  expect_true(file.exists(file.path(phuse_dir(), prov$licence_file)))
  expect_match(prov$commit, "^[0-9a-f]{40}$")
  expect_identical(prov$source_repo, "https://github.com/phuse-org/phuse-scripts")
  expect_length(prov$files, 11)

  for (f in prov$files) {
    path <- file.path(phuse_dir(), f$vendored)
    expect_true(file.exists(path), info = f$dataset)
    # the recorded digest is of the decompressed .xpt, i.e. of the upstream file
    raw <- memDecompress(readBin(path, "raw", file.size(path)), type = "gzip")
    expect_identical(
      digest::digest(raw, algo = "sha256", serialize = FALSE), f$sha256,
      info = f$dataset
    )
    expect_identical(length(raw), f$bytes, info = f$dataset)
    expect_match(f$blob_sha1, "^[0-9a-f]{40}$")
    expect_match(f$upstream_path, "^data/adam/")
  }
  # verification is opt-in and, when asked for, actually verifies
  expect_silent(invisible(read_phuse("adtte", verify = TRUE)))
  expect_error(read_phuse("adnope"), "not a vendored PHUSE dataset")
})

test_that("TFL-PREP-009: the whole CDISCPILOT01 ADaM package is preparable (#39)", {
  # the ten datasets the study's own define.xml documents
  pilot <- c(
    "adae", "adlbc", "adlbh", "adlbhy", "adqsadas", "adqscibc", "adqsnpix",
    "adsl", "adtte", "advs"
  )
  expect_true(all(pilot %in% phuse_datasets()))
  # plus adcm, which PHUSE added and the pilot package does not contain
  expect_setequal(phuse_datasets(), c(pilot, "adcm"))

  reg <- data_sources()
  # the study's own package is the default for everything it publishes (#60);
  # the two datasets it lacks are the only ones the alternate serves by default
  expect_identical(unname(reg[c("adsl", "adae", "advs")]), rep("phuse", 3))
  expect_identical(unname(reg[c("adex", "adlb")]), rep("pharmaverseadam", 2))
  expect_identical(
    unname(reg[c("adqsadas", "adqscibc", "adqsnpix", "adtte", "adlbc", "adlbh", "adlbhy", "adcm")]),
    rep("phuse", 8)
  )
  expect_identical(unname(data_sources("phuse")[["adsl"]]), "phuse")
  expect_error(data_sources("cdisc.org"), "Unknown data source")

  prepared <- prepare_data(c("adqsadas", "adqscibc", "adqsnpix", "adtte", "adlbhy"))
  expect_setequal(
    names(prepared),
    c("adsl", "adqsadas", "adqscibc", "adqsnpix", "adtte", "adlbhy")
  )
  expect_equal(nrow(prepared$adtte), 254)
  expect_equal(sort(unique(as.character(prepared$adqsadas$PARAMCD)))[1], "ACITM01")
  expect_true("ACTOT" %in% as.character(prepared$adqsadas$PARAMCD))
  expect_identical(unique(as.character(prepared$adqscibc$PARAMCD)), "CIBICVAL")

  expect_error(prepare_data("adpp"), "Unknown dataset")
  # adex exists only in the pharmaverse re-derivation; asking PHUSE for it must
  # say so rather than return an empty frame
  expect_error(prepare_data("adex", sources = "phuse"), "Unknown dataset")
  # asking PHUSE for the two datasets only the re-derivation has names both
  expect_error(prepare_data(c("adsl", "adex", "adlb"), sources = "phuse"), "Unknown dataset\\(s\\): adex, adlb")
  # and the default `datasets` prepares wholesale from the study's own package
  expect_true(all(data_sources_used(prepare_data()) == "phuse"))
})

test_that("TFL-PREP-010: TRT01A on every dataset comes from the prepared ADSL (#39)", {
  prepared <- prepare_data(c("adae", "adqsadas", "adtte", "adlbc"))
  adsl <- prepared$adsl
  arm <- stats::setNames(as.character(adsl$TRT01A), adsl$USUBJID)
  for (nm in setdiff(names(prepared), "adsl")) {
    df <- prepared[[nm]]
    expect_identical(levels(df$TRT01A), trt_levels(), info = nm)
    expect_identical(as.character(df$TRT01A), unname(arm[df$USUBJID]), info = nm)
  }
  # and it is a no-op: each PHUSE dataset's own treatment variable already
  # agrees with its own ADSL on every record, so single-sourcing changes nothing
  # until two sources are mixed
  ph <- prepare_data(c("adae", "adqsadas", "adtte", "adlbc"), sources = "phuse")
  expect_equal(n_disagreeing(ph$adae$TRT01A, read_phuse("adae")$TRTA), 0)
  raw_tte <- read_phuse("adtte")
  expect_equal(n_disagreeing(ph$adtte$TRT01A, raw_tte$TRTA), 0)
  raw_adas <- read_phuse("adqsadas")
  expect_equal(n_disagreeing(ph$adqsadas$TRT01A, raw_adas$TRTP), 0)
})

test_that("TFL-PREP-011: the PHUSE ADSL states its populations instead of deriving them (#39)", {
  ph <- prepare_data("adsl", sources = "phuse")$adsl
  raw <- read_phuse("adsl")
  expect_equal(nrow(ph), 254)
  expect_equal(sum(as.character(raw$ARM) == "Screen Failure"), 0)

  # flags come from the study, not from a guess about randomisation
  expect_identical(ph$ITTFL, ifelse(nzchar(raw$ITTFL), raw$ITTFL, "N"))
  expect_identical(ph$EFFFL, ifelse(nzchar(raw$EFFFL), raw$EFFFL, "N"))
  expect_equal(sum(ph$EFFFL == "Y"), 234)
  expect_equal(sum(ph$ITTFL == "Y"), 254)
  expect_equal(sum(ph$SAFFL == "Y"), 254)

  # COMPLFL is the complement of the study's own DISCONFL
  expect_equal(sum(ph$COMPLFL == "N"), sum(raw$DISCONFL == "Y"))
  expect_equal(sum(ph$COMPLFL == "Y"), 110)

  # the same DISCREAS contract holds on both lanes, and the collected reason is
  # carried through untouched for a display that asks for it
  expect_identical(levels(ph$DISCREAS), c("Death", "Other/Not specified"))
  expect_equal(sum(!is.na(ph$DISCREAS)), sum(ph$COMPLFL == "N"))
  expect_equal(sum(ph$DISCREAS == "Death", na.rm = TRUE), 3)
  expect_true(all(c("DCDECOD", "DCREASCD") %in% names(ph)))
  expect_equal(sum(ph$DCREASCD == "Death"), 3)

  # baseline vitals are the study's own, not an ADVS merge
  expect_identical(ph$BLWT, as.numeric(raw$WEIGHTBL))
  expect_identical(ph$BLHT, as.numeric(raw$HEIGHTBL))
  expect_identical(ph$BLBMI, as.numeric(raw$BMIBL))

  # the study's three age groups, not the pharmaverse re-derivation's two
  expect_identical(levels(ph$AGEGR1), c("<65", "65-80", ">80"))
  expect_false(any(is.na(ph$AGEGR1)))
  expect_identical(levels(ph$TRT01A), trt_levels())
})

test_that("TFL-PREP-012: ADCM's two-study relabelling is reversed, and proven (#39)", {
  raw <- read_phuse("adcm")
  expect_setequal(unique(as.character(raw$STUDYID)), c("CDISCPILOT01", "CDISCPILOT02"))

  prepared <- prepare_data("adcm", sources = "phuse")
  cm <- prepared$adcm
  adsl <- prepared$adsl
  expect_identical(unique(as.character(cm$STUDYID)), "CDISCPILOT01")
  expect_false(any(grepl("^02-", cm$USUBJID)))
  expect_equal(nrow(cm), nrow(raw))
  expect_equal(length(unique(cm$USUBJID)), 229)
  expect_true(all(cm$USUBJID %in% adsl$USUBJID))

  # the remap is only legitimate because the relabelled subjects are the same
  # people: age, sex and actual treatment all agree with ADSL, for all 118
  moved <- unique(sub("^02-", "01-", as.character(raw$USUBJID[raw$STUDYID == "CDISCPILOT02"])))
  expect_equal(length(moved), 118)
  ref <- adsl[match(moved, adsl$USUBJID), ]
  expect_false(any(is.na(ref$USUBJID)))
  chk <- raw[raw$STUDYID == "CDISCPILOT02", ]
  chk <- chk[!duplicated(chk$USUBJID), ]
  chk <- chk[match(moved, sub("^02-", "01-", as.character(chk$USUBJID))), ]
  expect_equal(n_disagreeing(chk$AGE, ref$AGE), 0)
  expect_equal(n_disagreeing(chk$SEX, ref$SEX), 0)
  expect_equal(n_disagreeing(chk$TRTA, ref$TRT01A), 0)
  # and SITEID is rebuilt from the restored USUBJID rather than left saying 02
  expect_identical(cm$SITEID, substr(cm$USUBJID, 4, 6))
})

test_that("TFL-PREP-013: the manifest names the upstream commit for PHUSE data (#39)", {
  prepared <- prepare_data(c("adae", "adqsadas"))
  m <- data_manifest(prepared)
  expect_identical(m$source_pkg[m$dataset == "adae"], "phuse-org/phuse-scripts:data/adam")
  expect_identical(
    m$source_pkg[m$dataset == "adqsadas"], "phuse-org/phuse-scripts:data/adam"
  )
  expect_identical(m$source_version[m$dataset == "adqsadas"], phuse_provenance()$commit)
  expect_true(all(grepl("^sha256:[0-9a-f]{64}$", m$hash)))
  expect_equal(m$n_row[m$dataset == "adqsadas"], nrow(prepared$adqsadas))
})

test_that("TFL-PREP-014: the alternate lane still prepares whole, with its own derivations and arms (#39)", {
  # since v0.4.0 the re-derivation is the alternate (D0032 R2, #60); it must
  # stay readable wholesale, keep its own grouping, and carry its own arms onto
  # every dataset it serves — the lane is measured, not silently retired
  prepared <- fixture_data_pv()
  m <- data_manifest(prepared)
  expect_true(all(m$source_pkg == "pharmaverseadam"))
  expect_identical(m$hash[m$dataset == "adsl"], hash_object(prepared$adsl))
  expect_equal(nrow(prepared$adsl), nrow(ref_adsl_pv()))
  expect_identical(levels(prepared$adsl$AGEGR1), c("18-64", ">64"))
  arm <- stats::setNames(as.character(prepared$adsl$TRT01A), prepared$adsl$USUBJID)
  for (nm in c("adae", "adex", "advs")) {
    expect_equal(n_disagreeing(prepared[[nm]]$TRT01A, arm[prepared[[nm]]$USUBJID]), 0, info = nm)
  }
  # and it is the lane on which twelve subjects sit on a different actual arm
  ph <- fixture_data()$adsl
  moved <- sum(as.character(prepared$adsl$TRT01A) != as.character(ph$TRT01A)[match(prepared$adsl$USUBJID, ph$USUBJID)])
  expect_equal(moved, 12)
})

test_that("TFL-PREP-015: the efficacy analysis set exists and fails loudly without EFFFL (#39)", {
  ph <- prepare_data("adsl", sources = "phuse")$adsl
  expect_equal(nrow(apply_analysis_set(ph, "efficacy")), 234)
  expect_true(all(apply_analysis_set(ph, "efficacy")$EFFFL == "Y"))
  # the pharmaverse packaging states no efficacy set; asking for one must name
  # the missing flag rather than quietly return every subject
  pv <- fixture_data_pv()$adsl
  expect_false("EFFFL" %in% names(pv))
  expect_error(apply_analysis_set(pv, "efficacy"), "population flag 'EFFFL'")
})

test_that("TFL-SRC-001: the two sources' overlap matches the committed record (#39)", {
  rec <- phuse_record()

  ph_adsl <- read_phuse("adsl")
  pv_adsl <- pharmaverseadam::adsl
  pv_adsl <- pv_adsl[as.character(pv_adsl$ARM) != "Screen Failure", ]
  a <- ph_adsl[order(ph_adsl$USUBJID), ]
  b <- pv_adsl[order(pv_adsl$USUBJID), ]

  expect_equal(rec$adsl$n_subjects$phuse, nrow(a))
  expect_equal(rec$adsl$n_subjects$pharmaverseadam, nrow(b))
  expect_identical(rec$adsl$subjects_identical, identical(a$USUBJID, b$USUBJID))
  expect_true(rec$adsl$subjects_identical)
  expect_equal(rec$adsl$screen_failures$phuse, 0)
  expect_equal(
    rec$adsl$screen_failures$pharmaverseadam,
    sum(as.character(pharmaverseadam::adsl$ARM) == "Screen Failure")
  )
  for (v in names(rec$adsl$variables)) {
    expect_equal(rec$adsl$variables[[v]]$n_diff, n_disagreeing(a[[v]], b[[v]]), info = v)
  }
  # the divergences the record exists to pin down
  expect_equal(rec$adsl$variables$TRT01A$n_diff, 12)
  expect_equal(rec$adsl$variables$AGEGR1$n_diff, 254)
  expect_equal(rec$adsl$variables$AGE$n_diff, 0)
  expect_setequal(unlist(rec$adsl$population_flags_only_in_phuse), c(
    "ITTFL", "EFFFL", "COMP8FL", "COMP16FL", "COMP24FL", "DISCONFL", "DSRAEFL"
  ))
  expect_setequal(unlist(rec$adsl$discontinuation_reason_only_in_phuse), c("DCDECOD", "DCREASCD"))

  ph_adae <- read_phuse("adae")
  pv_adae <- pharmaverseadam::adae
  pv_adae <- pv_adae[pv_adae$USUBJID %in% a$USUBJID, ]
  ae_a <- ph_adae[order(ph_adae$USUBJID, ph_adae$AESEQ), ]
  ae_b <- pv_adae[order(pv_adae$USUBJID, pv_adae$AESEQ), ]
  expect_equal(rec$adae$n_records$phuse, nrow(ae_a))
  expect_equal(rec$adae$n_records$pharmaverseadam, nrow(ae_b))
  expect_true(rec$adae$keys_identical)
  expect_identical(
    paste(ae_a$USUBJID, ae_a$AESEQ), paste(ae_b$USUBJID, ae_b$AESEQ)
  )
  for (v in names(rec$adae$variables)) {
    expect_equal(rec$adae$variables[[v]]$n_diff, n_disagreeing(ae_a[[v]], ae_b[[v]]), info = v)
  }
  # the medical content is the same data; only the flags and study days differ
  for (v in c("AETERM", "AEDECOD", "AEBODSYS", "AESOC", "AESEV", "AESER", "AEREL", "AEOUT", "AENDY")) {
    expect_equal(rec$adae$variables[[v]]$n_diff, 0, info = v)
  }
  expect_equal(rec$adae$variables$TRTEMFL$n_diff, 69)

  ph_advs <- read_phuse("advs")
  pv_advs <- pharmaverseadam::advs
  pv_advs <- pv_advs[pv_advs$USUBJID %in% a$USUBJID, ]
  expect_equal(rec$advs$n_records$phuse, nrow(ph_advs))
  expect_equal(rec$advs$n_records$pharmaverseadam, nrow(pv_advs))
  expect_setequal(unlist(rec$advs$parameters$phuse), unique(as.character(ph_advs$PARAMCD)))
  expect_setequal(
    unlist(rec$advs$parameters$pharmaverseadam), unique(as.character(pv_advs$PARAMCD))
  )

  ph_adcm <- read_phuse("adcm")
  expect_false(rec$adcm$in_study_define_xml)
  expect_equal(rec$adcm$relabelled_subjects, 118)
  expect_equal(
    rec$adcm$n_records$CDISCPILOT02, sum(as.character(ph_adcm$STUDYID) == "CDISCPILOT02")
  )
  expect_equal(
    rec$adcm$remapped_subjects_matching_adsl_age_sex_arm,
    rec$adcm$remapped_subjects_found_in_adsl
  )
  expect_equal(rec$adcm$adsl_subjects_with_no_record, 25)
})
