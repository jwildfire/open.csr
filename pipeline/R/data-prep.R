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

#' Prepare the demonstration ADaM datasets
#'
#' Reads the public CDISCPILOT01 ADaM datasets shipped in `{pharmaverseadam}`
#' and applies the documented derivations open.csr's displays depend on
#' (design decision D12: derive what is missing, in a tested layer, rather than
#' assume the flags exist).
#'
#' # Derivations
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
#'   \item{`EFFFL`}{Not derived in v0. CDISCPILOT01 has no efficacy ADaM in
#'     `{pharmaverseadam}`, so an efficacy analysis set would be unusable; the
#'     derivation path (from `{pharmaversesdtm}` QS) is roadmap.}
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
#'   \item{`TRT01A`}{Cast to a factor with levels in dose order (see
#'     [trt_levels()]); the screen-failure level is dropped.}
#'   \item{`TRTEMFL` (ADAE)}{`NA` recoded to `"N"`.}
#'   \item{`AESEV` (ADAE)}{Cast to a factor ordered MILD < MODERATE < SEVERE.}
#' }
#'
#' # Manifest
#'
#' The returned list carries a `"manifest"` attribute — one row per dataset with
#' `dataset`, `n_row`, `n_col`, `hash` (`digest::digest(df, algo = "sha256")`),
#' `source_pkg` and `source_version`. It is the head of the traceability chain
#' recorded in every `ard.json` provenance envelope.
#'
#' @param datasets Character vector of dataset names to prepare.
#' @param source_pkg Package supplying the raw ADaM data.
#'
#' @return A named list of data frames with a `"manifest"` attribute.
#' @examples
#' \dontrun{
#' prepared <- prepare_data()
#' data_manifest(prepared)
#' }
#' @export
prepare_data <- function(datasets = c("adsl", "adae", "adex", "adlb", "advs"),
                         source_pkg = "pharmaverseadam") {
  if (!requireNamespace(source_pkg, quietly = TRUE)) {
    stop("Package '", source_pkg, "' is required by prepare_data().", call. = FALSE)
  }
  datasets <- unique(c("adsl", datasets))
  raw <- lapply(datasets, function(nm) {
    getExportedValue(source_pkg, nm)
  })
  names(raw) <- datasets

  vitals <- raw$advs %||% getExportedValue(source_pkg, "advs")
  adsl <- prep_adsl(raw$adsl, vitals)
  keep_ids <- adsl$USUBJID

  out <- list(adsl = adsl)
  for (nm in setdiff(datasets, "adsl")) {
    df <- raw[[nm]]
    df <- df[df$USUBJID %in% keep_ids, , drop = FALSE]
    df$TRT01A <- factor(as.character(df$TRT01A), levels = trt_levels())
    if (nm == "adae") df <- prep_adae(df)
    out[[nm]] <- tibble::as_tibble(df)
  }

  version <- as.character(utils::packageVersion(source_pkg))
  manifest <- do.call(rbind, lapply(names(out), function(nm) {
    df <- out[[nm]]
    data.frame(
      dataset = nm,
      n_row = nrow(df),
      n_col = ncol(df),
      hash = hash_object(df),
      source_pkg = source_pkg,
      source_version = version,
      stringsAsFactors = FALSE
    )
  }))
  attr(out, "manifest") <- tibble::as_tibble(manifest)
  class(out) <- c("opencsr_data", "list")
  out
}

#' ADSL derivations (see [prepare_data()])
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
  adsl$SEX <- factor(as.character(adsl$SEX), levels = c("F", "M"))
  adsl$RACE <- factor(as.character(adsl$RACE))
  adsl$AGEGR1 <- factor(as.character(adsl$AGEGR1), levels = c("18-64", ">64"))
  adsl$ETHNIC <- factor(as.character(adsl$ETHNIC))
  adsl <- merge_baseline_vitals(adsl, vitals)
  tibble::as_tibble(adsl)
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

#' ADAE derivations (see [prepare_data()])
#' @noRd
prep_adae <- function(adae) {
  adae$TRTEMFL <- ifelse(is.na(adae$TRTEMFL), "N", as.character(adae$TRTEMFL))
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
  reg <- c(safety = "SAFFL", itt = "ITTFL", completers = "COMPLFL", all = NA_character_)
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
