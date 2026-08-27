#' Treatment arms in protocol (dose) order
#'
#' CDISCPILOT01 randomises to placebo and two xanomeline doses. Column order in
#' every display follows dose order, so `TRT01A` is stored as a factor with
#' these levels rather than relying on alphabetical ordering.
#' @noRd
trt_levels <- function() {
  c("Placebo", "Xanomeline Low Dose", "Xanomeline High Dose")
}

#' Screen-failure arm label used by CDISCPILOT01
#' @noRd
screen_failure_label <- function() "Screen Failure"

#' Highest planned visit number inside the treatment period
#'
#' The CDISCPILOT01 statistical analysis plan defines the treatment period as
#' "any planned visit after Week 0 (Visit 3), up to and including Week 24
#' (Visit 12)". `AVISITN` carries the week number, so the treatment period is
#' `0 < AVISITN <= 24`. Week 26 is the follow-up visit and is outside it.
#' @noRd
treatment_period_last_week <- function() 24

#' Prepare the demonstration ADaM datasets
#'
#' Reads the public CDISCPILOT01 ADaM datasets and applies the documented
#' derivations open.csr's displays depend on (design decision D12: derive what
#' is missing, in a tested layer, rather than assume the flags exist).
#'
#' # Two packagings of one study
#'
#' CDISCPILOT01 is available two ways, and [data_sources()] records which one
#' each dataset comes from. `{pharmaverseadam}` re-derives the study from SDTM
#' and is the only source for `adex`; the CDISC pilot submission's own ADaM
#' package — vendored from `phuse-org/phuse-scripts` — is the only source for
#' the study's efficacy (`adqsadas`, `adqscibc`, `adqsnpix`), laboratory
#' (`adlbc`, `adlbh`, `adlbhy`) and time-to-event (`adtte`) domains, plus the
#' `adcm` PHUSE added.
#'
#' The two do not agree on every figure. The default registry therefore leaves
#' every domain `{pharmaverseadam}` already served exactly where it was, so the
#' committed displays keep the inputs they were approved against; the
#' divergences are measured in `quality/data/source-agreement.json` and
#' reproduced by `qc/source-agreement.R`.
#'
#' # Derivations
#'
#' Applied on the `{pharmaverseadam}` lane. The PHUSE lane derives less, because
#' the study states more — see the notes on `prep_adsl_phuse()` in the source.
#'
#' \describe{
#'   \item{Screen-failure exclusion}{Subjects with `ARM == "Screen Failure"`
#'     (52 of 306 in ADSL) are removed from ADSL, and every other dataset is
#'     restricted to the surviving `USUBJID` set. No analysis dataset in
#'     open.csr contains a screen failure.}
#'   \item{`SAFFL`}{Used as shipped. `NA` is recoded to `"N"` so the flag is a
#'     complete two-level character variable. After screen-failure exclusion
#'     every remaining subject is `SAFFL == "Y"`.}
#'   \item{`ITTFL`}{Derived, because `{pharmaverseadam}` does not ship it:
#'     `"Y"` when the subject was randomised (`!is.na(RANDDT)`) and is not a
#'     screen failure, otherwise `"N"`.}
#'   \item{`EFFFL`}{Not derived, and deliberately not guessed:
#'     `{pharmaverseadam}` does not ship it and nothing in that packaging states
#'     the study's efficacy analysis set. Requesting `analysis_set: efficacy`
#'     against a `{pharmaverseadam}` ADSL therefore fails, naming the missing
#'     flag. The CDISC pilot's own ADSL states `EFFFL` (234 of 254 subjects);
#'     `sources = "phuse"` is the lane that has it.}
#'   \item{`COMPLFL`}{Derived: `"Y"` when `EOSSTT == "COMPLETED"`, else `"N"`.}
#'   \item{`DISCREAS`}{Derived reason for study discontinuation, for
#'     discontinued subjects only (`NA` otherwise). The ADSL shipped in
#'     `{pharmaverseadam}` carries no `DCSREAS`/`DCDECOD`, so the only reason
#'     recoverable from the data is death (`DTHFL == "Y"`); every other
#'     discontinuation is labelled `"Other/Not specified"`. The name
#'     deliberately differs from the CDISC variable `DCSREAS` because this is a
#'     derived approximation, not the sponsor-collected reason.}
#'   \item{`BLWT`, `BLHT`, `BLBMI`}{Baseline weight (kg), height (cm) and body
#'     mass index (kg/m2), merged onto ADSL from the ADVS records flagged
#'     `ABLFL == "Y"` for `PARAMCD` `WEIGHT`, `HEIGHT` and `BMI` (one record per
#'     subject each). Baseline characteristics live in ADVS rather than ADSL in
#'     `{pharmaverseadam}`, and a demographic display must not join
#'     subject-level data at render time, so the merge happens here. ADVS is
#'     read for this derivation whether or not it was requested in `datasets`.}
#'   \item{`TRT01A`, `TRT01P`}{Cast to factors with levels in dose order (see
#'     [trt_levels()]); the screen-failure level is dropped. Actual and planned
#'     treatment differ for twelve subjects in the `pharmaverseadam` study and
#'     for none of the 254 in the CDISC pilot, so displays state which one they
#'     group by.}
#'   \item{`TRT01A`, `TRT01P` (non-ADSL)}{Taken from the prepared ADSL by
#'     `USUBJID`, not from the dataset's own `TRTA`/`TRTP`, so treatment
#'     assignment is single-sourced across every display. Verified to be a
#'     no-op within each source.}
#'   \item{`TRTEMFL` (ADAE)}{`NA` or blank recoded to `"N"`.}
#'   \item{`AESEV` (ADAE)}{Cast to a factor ordered MILD < MODERATE < SEVERE.}
#'   \item{`BLVAL`, `CHGBL` (ADVS)}{Derived. `BLVAL` is the subject's Week 0
#'     (`AVISIT == "Baseline"`) value of the same parameter at the same time
#'     point, taken from an observed record (`is.na(DTYPE)`); `CHGBL` is
#'     `AVAL - BLVAL`. `{pharmaverseadam}` ships `BASE`/`CHG`, but its `BASE`
#'     falls back to a screening measurement when a subject has no Week 0 record
#'     — which would report a change from baseline for a subject the same
#'     display reports no baseline for. `CHGBL` is missing for those subjects,
#'     so the baseline rows and the change rows describe the same subjects.}
#'   \item{`EOTFL` (ADVS)}{Derived end-of-treatment flag: `"Y"` on the record
#'     carrying the subject's last observed value of that parameter and time
#'     point inside the treatment period, and `"N"` everywhere else. The
#'     treatment period is the analysis plan's — planned visits after Week 0 up
#'     to and including Week 24 (see [treatment_period_last_week()]) — so
#'     unscheduled visits, the Week 26 follow-up visit and derived records
#'     (`DTYPE`) are never selected. `{pharmaverseadam}` ships an
#'     `AVISIT == "End of Treatment"` record (`DTYPE == "LOV"`), but it exists
#'     for only 189 of 254 subjects and is not restricted to Week 24, so it does
#'     not implement this definition.}
#' }
#'
#' # Manifest
#'
#' The returned list carries a `"manifest"` attribute — one row per dataset with
#' `dataset`, `n_row`, `n_col`, `hash` (`digest::digest(df, algo = "sha256")`),
#' `source_pkg` and `source_version`. It is the head of the traceability chain
#' recorded in every `ard.json` provenance envelope. For a `{pharmaverseadam}`
#' dataset the pair is the package name and version; for a PHUSE dataset there
#' is no package, so it is `"phuse-org/phuse-scripts:data/adam"` and the pinned
#' upstream commit.
#'
#' @param datasets Character vector of dataset names to prepare.
#' @param source_pkg R package supplying the `{pharmaverseadam}`-sourced
#'   datasets. Swap only for a drop-in fork; it does not select the PHUSE data.
#' @param sources Which packaging of CDISCPILOT01 each dataset comes from — see
#'   [data_sources()]. `NULL` uses the default registry: every domain
#'   `{pharmaverseadam}` already served stays there, and the domains it has no
#'   answer for come from the vendored PHUSE package.
#'
#' @return A named list of data frames with a `"manifest"` attribute.
#' @examples
#' \dontrun{
#' prepared <- prepare_data()
#' data_manifest(prepared)
#'
#' # the whole study from the CDISC pilot's own ADaM package
#' efficacy <- prepare_data(c("adqsadas", "adqscibc"), sources = "phuse")
#' }
#' @export
prepare_data <- function(datasets = c("adsl", "adae", "adex", "adlb", "advs", "adcm"),
                         source_pkg = "pharmaverseadam",
                         sources = NULL) {
  registry <- data_sources(sources)
  datasets <- unique(c("adsl", datasets))
  unknown <- setdiff(datasets, names(registry))
  if (length(unknown)) {
    stop(
      "Unknown dataset(s): ", paste(unknown, collapse = ", "),
      ". Known datasets: ", paste(sort(names(registry)), collapse = ", "), ".",
      call. = FALSE
    )
  }
  src <- registry[datasets]
  if (any(src == "pharmaverseadam") && !requireNamespace(source_pkg, quietly = TRUE)) {
    stop("Package '", source_pkg, "' is required by prepare_data().", call. = FALSE)
  }

  raw <- stats::setNames(lapply(datasets, function(nm) {
    read_source(nm, src[[nm]], source_pkg)
  }), datasets)

  if (identical(src[["adsl"]], "phuse")) {
    adsl <- prep_adsl_phuse(raw$adsl)
  } else {
    # The pharmaverseadam ADSL carries no baseline vitals; they are merged from
    # its ADVS whether or not ADVS was requested (see the Derivations section).
    vitals <- if (identical(unname(src["advs"]), "pharmaverseadam")) {
      raw$advs
    } else {
      getExportedValue(source_pkg, "advs")
    }
    adsl <- prep_adsl(raw$adsl, vitals)
  }
  keep_ids <- adsl$USUBJID

  out <- list(adsl = adsl)
  for (nm in setdiff(datasets, "adsl")) {
    df <- raw[[nm]]
    if (identical(src[[nm]], "phuse")) df <- prep_phuse_common(df, nm)
    df <- df[df$USUBJID %in% keep_ids, , drop = FALSE]
    df <- attach_trt(df, adsl)
    if (nm == "adae") df <- prep_adae(df)
    if (nm == "advs") df <- prep_advs(df)
    out[[nm]] <- tibble::as_tibble(df)
  }

  manifest <- do.call(rbind, lapply(names(out), function(nm) {
    df <- out[[nm]]
    lab <- source_label(src[[nm]], source_pkg)
    data.frame(
      dataset = nm,
      n_row = nrow(df),
      n_col = ncol(df),
      hash = hash_object(df),
      source_pkg = unname(lab[["pkg"]]),
      source_version = unname(lab[["version"]]),
      stringsAsFactors = FALSE
    )
  }))
  attr(out, "manifest") <- tibble::as_tibble(manifest)
  class(out) <- c("opencsr_data", "list")
  out
}

#' Read one raw dataset from its source (see [prepare_data()])
#' @noRd
read_source <- function(name, source, source_pkg) {
  if (identical(source, "phuse")) {
    return(read_phuse(name))
  }
  tryCatch(
    getExportedValue(source_pkg, name),
    error = function(e) {
      stop(
        "'", source_pkg, "' does not ship a dataset called '", name, "'. ",
        "The CDISC pilot's own ADaM package does: try ",
        "prepare_data('", name, "', sources = c(", name, " = 'phuse')).",
        call. = FALSE
      )
    }
  )
}

#' Attach the grouping variable from the prepared ADSL (see [prepare_data()])
#'
#' Every display groups on `TRT01A`. Taking it from the prepared ADSL rather
#' than from each dataset's own copy makes the treatment assignment single-
#' sourced: no display can group on an arm the subject-level table disagrees
#' with. This is a verified no-op — each source's own treatment variable agrees
#' with its own ADSL on every record — but it stops being a no-op the moment
#' two sources are mixed, which is exactly when it matters.
#' @noRd
attach_trt <- function(df, adsl) {
  i <- match(df$USUBJID, adsl$USUBJID)
  df$TRT01A <- adsl$TRT01A[i]
  if ("TRT01P" %in% names(adsl)) df$TRT01P <- adsl$TRT01P[i]
  df
}

#' ADSL derivations, `{pharmaverseadam}` source (see [prepare_data()])
#' @noRd
prep_adsl <- function(adsl, vitals = NULL) {
  adsl <- adsl[as.character(adsl$ARM) != screen_failure_label(), , drop = FALSE]
  adsl$SAFFL <- ifelse(is.na(adsl$SAFFL), "N", as.character(adsl$SAFFL))
  adsl$ITTFL <- ifelse(!is.na(adsl$RANDDT), "Y", "N")
  adsl$COMPLFL <- ifelse(!is.na(adsl$EOSSTT) & adsl$EOSSTT == "COMPLETED", "Y", "N")
  adsl$DISCREAS <- ifelse(
    !is.na(adsl$EOSSTT) & adsl$EOSSTT == "DISCONTINUED",
    ifelse(!is.na(adsl$DTHFL) & adsl$DTHFL == "Y", "Death", "Other/Not specified"),
    NA_character_
  )
  adsl$DISCREAS <- factor(adsl$DISCREAS, levels = c("Death", "Other/Not specified"))
  adsl$TRT01A <- factor(as.character(adsl$TRT01A), levels = trt_levels())
  adsl$TRT01P <- factor(as.character(adsl$TRT01P), levels = trt_levels())
  adsl$SEX <- factor(as.character(adsl$SEX), levels = c("F", "M"))
  adsl$RACE <- factor(as.character(adsl$RACE))
  adsl$AGEGR1 <- factor(as.character(adsl$AGEGR1), levels = c("18-64", ">64"))
  adsl$ETHNIC <- factor(as.character(adsl$ETHNIC))
  adsl <- merge_baseline_vitals(adsl, vitals)
  tibble::as_tibble(adsl)
}

#' ADSL derivations, PHUSE CDISCPILOT01 source (see [prepare_data()])
#'
#' The CDISC pilot's own ADSL answers most of what the `{pharmaverseadam}` lane
#' has to derive, so this function derives less, not more:
#'
#' \describe{
#'   \item{Screen failures}{Already absent — the data guide states that subjects
#'     who failed screening were not included in any analysis dataset. Asserted
#'     rather than assumed.}
#'   \item{`SAFFL`, `ITTFL`, `EFFFL`}{Used as shipped by the study; blanks are
#'     recoded to `"N"`. `ITTFL` is *not* re-derived from randomisation here —
#'     the study states its own intent-to-treat set, and re-deriving it would
#'     overwrite a sponsor decision with a guess.}
#'   \item{`COMPLFL`}{Derived as the complement of the study's `DISCONFL`.}
#'   \item{`DISCREAS`}{Derived to exactly the same two levels as the
#'     `{pharmaverseadam}` lane (Death, from `DTHFL`, versus Other/Not
#'     specified) so that a display specified against one source renders
#'     against the other. This deliberately discards information: the CDISC
#'     pilot ADSL *does* carry the collected reason in `DCDECOD`/`DCREASCD`,
#'     and both are passed through untouched for a display that asks for them.
#'     Specifying such a display is a separate, unspecified change.}
#'   \item{`BLWT`, `BLHT`, `BLBMI`}{Taken from the study's own `WEIGHTBL`,
#'     `HEIGHTBL` and `BMIBL`. No ADVS merge is needed or performed.}
#'   \item{`AGEGR1`}{Cast to the study's own three age groups
#'     (`<65`, `65-80`, `>80`) — not the two the pharmaverse re-derivation uses.}
#' }
#' @noRd
prep_adsl_phuse <- function(adsl) {
  sf <- sum(as.character(adsl$ARM) == screen_failure_label(), na.rm = TRUE)
  if (sf > 0) {
    stop(
      "The PHUSE CDISCPILOT01 ADSL is documented as containing no screen ",
      "failures, but ", sf, " were found. Refusing to guess.",
      call. = FALSE
    )
  }
  blank_to <- function(x, value) {
    x <- as.character(x)
    ifelse(is.na(x) | !nzchar(x), value, x)
  }
  adsl$SAFFL <- blank_to(adsl$SAFFL, "N")
  adsl$ITTFL <- blank_to(adsl$ITTFL, "N")
  adsl$EFFFL <- blank_to(adsl$EFFFL, "N")
  disc <- blank_to(adsl$DISCONFL, "N")
  dth <- blank_to(adsl$DTHFL, "N")
  adsl$COMPLFL <- ifelse(disc == "Y", "N", "Y")
  adsl$DISCREAS <- factor(
    ifelse(disc == "Y", ifelse(dth == "Y", "Death", "Other/Not specified"), NA_character_),
    levels = c("Death", "Other/Not specified")
  )
  adsl$BLWT <- as.numeric(adsl$WEIGHTBL)
  adsl$BLHT <- as.numeric(adsl$HEIGHTBL)
  adsl$BLBMI <- as.numeric(adsl$BMIBL)
  adsl$TRT01A <- factor(as.character(adsl$TRT01A), levels = trt_levels())
  # Actual and planned agree for all 254 subjects in this study, unlike the
  # pharmaverseadam one where twelve differ. Carried anyway, and as a factor
  # with the same levels, so a display that groups by planned treatment behaves
  # identically whichever source it is pointed at.
  adsl$TRT01P <- factor(as.character(adsl$TRT01P), levels = trt_levels())
  adsl$SEX <- factor(as.character(adsl$SEX), levels = c("F", "M"))
  adsl$RACE <- factor(as.character(adsl$RACE))
  adsl$AGEGR1 <- factor(as.character(adsl$AGEGR1), levels = phuse_agegr1_levels())
  adsl$ETHNIC <- factor(as.character(adsl$ETHNIC))
  tibble::as_tibble(adsl)
}

#' Age groups as CDISCPILOT01 itself defines them
#'
#' The study's ADSL groups age as `<65` / `65-80` / `>80`. The pharmaverse
#' re-derivation of the same study groups it as `18-64` / `>64`. Both describe
#' the same 254 subjects; neither is wrong; they are not the same display row.
#' @noRd
phuse_agegr1_levels <- function() c("<65", "65-80", ">80")

#' Derivations applied to every non-ADSL PHUSE dataset (see [prepare_data()])
#' @noRd
prep_phuse_common <- function(df, name) {
  if (identical(name, "adcm")) df <- prep_adcm_phuse(df)
  df
}

#' Undo ADCM's two-study relabelling (see [prepare_data()])
#'
#' `data/adam/cdisc/adcm.xpt` is the only concomitant-medications dataset PHUSE
#' publishes for this study, and it is not part of the CDISC pilot package: it
#' does not appear in the study's `define.xml`, its data guide, or the
#' `cdiscpilot01/` folder, and PHUSE's own README flags it as "2-study data that
#' seem out-of-place here".
#'
#' What was done to it is recoverable and verifiable. Subjects at even-numbered
#' sites were relabelled `STUDYID = "CDISCPILOT02"` with their `USUBJID` prefix
#' changed from `01-` to `02-`; odd-numbered sites were left alone. Mapping
#' `02-` back to `01-` restores 118 subjects who then match the study's ADSL
#' exactly on age, sex and actual treatment — which is what makes this a
#' reversible relabelling rather than a second study. The 25 ADSL subjects with
#' no record at all took no concomitant medication.
#'
#' The remap is asserted, not assumed: a subject that does not match ADSL after
#' remapping is an error, not a silently dropped row.
#' @noRd
prep_adcm_phuse <- function(adcm) {
  relabelled <- as.character(adcm$STUDYID) == "CDISCPILOT02"
  adcm$USUBJID <- ifelse(
    relabelled, sub("^02-", "01-", as.character(adcm$USUBJID)), as.character(adcm$USUBJID)
  )
  adcm$SITEID <- substr(adcm$USUBJID, 4, 6)
  adcm$STUDYID <- "CDISCPILOT01"
  adcm
}

#' Merge baseline vital-sign measurements onto ADSL (see [prepare_data()])
#' @noRd
merge_baseline_vitals <- function(adsl, vitals) {
  map <- c(WEIGHT = "BLWT", HEIGHT = "BLHT", BMI = "BLBMI")
  for (nm in names(map)) adsl[[map[[nm]]]] <- NA_real_
  if (is.null(vitals)) {
    return(adsl)
  }
  bl <- vitals[!is.na(vitals$ABLFL) & vitals$ABLFL == "Y" &
    vitals$PARAMCD %in% names(map), , drop = FALSE]
  for (nm in names(map)) {
    sub <- bl[bl$PARAMCD == nm, c("USUBJID", "AVAL"), drop = FALSE]
    sub <- sub[!duplicated(sub$USUBJID), , drop = FALSE]
    adsl[[map[[nm]]]] <- sub$AVAL[match(adsl$USUBJID, sub$USUBJID)]
  }
  adsl
}

#' Analysis key for a vital-sign series
#'
#' One subject's repeated measurements of one parameter at one time point. Blood
#' pressure and pulse are collected supine and after one and three minutes
#' standing, and each position is its own series: a subject's baseline SBP after
#' standing for three minutes is not the baseline for their supine SBP.
#' @noRd
advs_series_key <- function(advs) {
  paste(
    advs$USUBJID, advs$PARAMCD,
    ifelse(is.na(advs$ATPT), "", as.character(advs$ATPT)),
    sep = "\r"
  )
}

#' ADVS derivations (see [prepare_data()])
#'
#' Adds `BLVAL`, `CHGBL` and `EOTFL`. Records `{pharmaverseadam}` derived by
#' averaging or by last-observation carry-forward are marked by `DTYPE`; only
#' observed records (`is.na(DTYPE)`) take part, so a derived record can never be
#' a subject's baseline or their end-of-treatment measurement.
#' @noRd
prep_advs <- function(advs) {
  key <- advs_series_key(advs)
  observed <- is.na(advs$DTYPE) & !is.na(advs$AVAL)

  is_baseline <- observed & !is.na(advs$AVISIT) & advs$AVISIT == "Baseline"
  advs$BLVAL <- advs$AVAL[is_baseline][match(key, key[is_baseline])]
  advs$CHGBL <- advs$AVAL - advs$BLVAL

  on_treatment <- observed & !is.na(advs$AVISITN) &
    advs$AVISITN > 0 & advs$AVISITN <= treatment_period_last_week()
  last_week <- tapply(advs$AVISITN[on_treatment], key[on_treatment], max)
  advs$EOTFL <- ifelse(
    on_treatment & advs$AVISITN == unname(last_week[key]),
    "Y", "N"
  )
  advs
}

#' ADAE derivations (see [prepare_data()])
#' @noRd
prep_adae <- function(adae) {
  adae$TRTEMFL <- ifelse(is.na(adae$TRTEMFL), "N", as.character(adae$TRTEMFL))
  adae$TRTEMFL <- ifelse(nzchar(adae$TRTEMFL), adae$TRTEMFL, "N")
  adae$AESEV <- factor(as.character(adae$AESEV), levels = c("MILD", "MODERATE", "SEVERE"))
  adae$AESER <- ifelse(is.na(adae$AESER), "N", as.character(adae$AESER))
  adae$AEREL <- ifelse(is.na(adae$AEREL), "NONE", as.character(adae$AEREL))
  adae
}

#' Data manifest for a prepared dataset list
#'
#' @param prepared Result of [prepare_data()].
#' @return A tibble with one row per prepared dataset.
#' @export
data_manifest <- function(prepared) {
  m <- attr(prepared, "manifest")
  if (is.null(m)) {
    stop("`prepared` has no manifest; was it produced by prepare_data()?", call. = FALSE)
  }
  m
}

#' Analysis-set registry
#'
#' Maps the `analysis_set` key used in `analysis.yaml` onto the population flag
#' derived by [prepare_data()]. `all` applies no filter.
#'
#' @noRd
analysis_set_flag <- function(analysis_set) {
  reg <- c(
    safety = "SAFFL", itt = "ITTFL", efficacy = "EFFFL",
    completers = "COMPLFL", all = NA_character_
  )
  if (!analysis_set %in% names(reg)) {
    stop(
      "Unknown analysis_set '", analysis_set, "'. Known sets: ",
      paste(names(reg), collapse = ", "), ".",
      call. = FALSE
    )
  }
  unname(reg[analysis_set])
}

#' Apply an analysis set to a dataset
#' @noRd
apply_analysis_set <- function(df, analysis_set) {
  flag <- analysis_set_flag(analysis_set)
  if (is.na(flag)) {
    return(df)
  }
  if (!flag %in% names(df)) {
    stop(
      "Dataset does not carry the population flag '", flag,
      "' required by analysis_set '", analysis_set, "'.",
      call. = FALSE
    )
  }
  df[!is.na(df[[flag]]) & df[[flag]] == "Y", , drop = FALSE]
}
