# Shared fixtures.
#
# Preparing data and reading ARDs is the expensive part of this suite, so both
# are memoised for the run. Expected values are always computed independently
# from the raw {pharmaverseadam} datasets with dplyr — never by calling the code
# under test — so a test failing means the pipeline and a direct dplyr computation
# disagree.

.fixtures <- new.env(parent = emptyenv())

memo <- function(key, expr) {
  if (is.null(.fixtures[[key]])) assign(key, expr, envir = .fixtures)
  get(key, envir = .fixtures)
}

#' The default lane: the study's own ADaM package (D0032 R2, #60)
fixture_data <- function() {
  memo("data", prepare_data(c("adsl", "adae", "advs")))
}

#' The alternate lane, for the tests of the derivations only it needs
fixture_data_pv <- function() {
  memo("data_pv", prepare_data(c("adsl", "adae", "adex", "advs"), sources = "pharmaverseadam"))
}

#' The committed ARD for a display's current iteration
fixture_ard <- function(slug) {
  memo(paste0("ard.", slug), {
    cur <- current_iteration(slug)
    testthat::skip_if(is.null(cur), paste0("no committed iteration for ", slug))
    read_ard(file.path(csr_root(), cur$ard))
  })
}

fixture_display <- function(slug, variant = "post_text") {
  memo(paste0("disp.", slug, ".", variant), {
    render_display(fixture_ard(slug), read_display_spec(slug), variant)
  })
}

# ---- independent reference data ---------------------------------------------

#' ADSL exactly as this project defines the safety analysis set, read straight
#' from the vendored pilot file rather than through prepare_data(). The pilot's
#' package has no screen failures, so the safety flag is the only filter.
ref_adsl <- function() {
  memo("ref_adsl", {
    d <- ref_phuse_adsl()
    d[blank_na(d$SAFFL) == "Y", , drop = FALSE]
  })
}

#' The alternate lane's ADSL, for the tests of the derivations only it needs
ref_adsl_pv <- function() {
  memo("ref_adsl_pv", {
    d <- pharmaverseadam::adsl
    d[d$ARM != "Screen Failure" & !is.na(d$SAFFL) & d$SAFFL == "Y", , drop = FALSE]
  })
}

#' ADAE for the safety set, with the actual arm joined from ADSL by subject —
#' the pilot's ADAE carries TRTA, not TRT01A, and the join is its own.
ref_adae <- function() {
  memo("ref_adae", {
    adsl <- ref_adsl()
    d <- ref_phuse_xpt("adae")
    d <- d[d$USUBJID %in% adsl$USUBJID, , drop = FALSE]
    d$TRT01A <- as.character(adsl$TRT01A)[match(d$USUBJID, adsl$USUBJID)]
    d
  })
}

#' Number of distinct subjects in `df` within a treatment arm
n_subjects <- function(df, arm = NULL) {
  if (!is.null(arm)) df <- df[!is.na(df$TRT01A) & df$TRT01A == arm, , drop = FALSE]
  length(unique(df$USUBJID))
}

#' Row labels with indentation (non-breaking spaces) removed
plain <- function(x) trimws(gsub("\u00a0", " ", x))

#' Read a rendered cell from a display object by row label
cell <- function(disp, label, column) {
  idx <- which(plain(disp$table$label) == label)
  testthat::expect_length(idx, 1)
  j <- which(disp$columns$levels == column)
  testthat::expect_length(j, 1)
  disp$table[[paste0("col", j)]][idx]
}

#' A throwaway repository root holding copies of one display's specs
scratch_root <- function(slugs) {
  root <- file.path(tempdir(), paste0("opencsr-", paste(sample(letters, 8), collapse = "")))
  dir.create(root, recursive = TRUE)
  dir.create(file.path(root, "docs", "design"), recursive = TRUE)
  file.create(file.path(root, "docs", "design", "contracts.md"))
  # the study model travels with the specs: nothing can name an arm without it
  file.copy(file.path(csr_root(), "library", "study.yaml"), file.path(root, "library", "study.yaml"))
  for (slug in slugs) {
    dir.create(file.path(root, "library", "tfl", slug), recursive = TRUE)
    for (f in list.files(display_dir(slug), full.names = TRUE)) {
      if (basename(f) == "iterations.yaml") next
      file.copy(f, file.path(root, "library", "tfl", slug, basename(f)))
    }
  }
  root
}

# ---- the CDISC pilot's own ADSL, read without the package -------------------

#' ADSL exactly as the CDISC pilot published it
#'
#' Read straight out of the vendored `.xpt.gz` with {haven}, with none of
#' [prepare_data()]'s derivations applied. `ref_adsl()` above cannot serve the
#' displays specified against `sources: phuse` — it is the {pharmaverseadam}
#' re-derivation, which carries neither the study's own population flags nor its
#' collected discontinuation reasons. Reading the file directly here keeps the
#' expected values independent of the data layer under test, the same way
#' `qc/reference-report-agreement.R` does.
ref_phuse_xpt <- function(name) {
  memo(paste0("ref_phuse_", name), {
    path <- file.path(
      csr_root(), "pipeline", "inst", "extdata", "phuse-cdiscpilot01", paste0(name, ".xpt.gz")
    )
    haven::read_xpt(memDecompress(readBin(path, "raw", file.size(path)), type = "gzip"))
  })
}

ref_phuse_adsl <- function() ref_phuse_xpt("adsl")

#' A character column with missing and empty values collapsed to ""
#'
#' SAS-era ADaM writes an unset flag as a blank string, not NA, and the two
#' appear in the same column. Comparing with `== "Y"` without this returns NA
#' for the blanks and silently drops them out of a `sum()`.
blank_na <- function(x) {
  x <- as.character(x)
  x[is.na(x)] <- ""
  x
}

#' Locate a display row by the analysis it renders
#'
#' `cell()` above addresses a row by its printed label, which does not identify
#' a row on these two displays: t-end-of-study prints "Missing" twice — once for
#' an unknown completion status and once for an unrecorded reason — and carries
#' footnote markers inside the label text. The display renders one row per entry
#' in the spec's `rows`, section headings included, so the entry's `analysis` is
#' the stable identity.
row_of <- function(slug, analysis) {
  rows <- read_display_spec(slug)$rows
  idx <- which(vapply(rows, function(r) identical(r$analysis, analysis), logical(1)))
  testthat::expect_length(idx, 1)
  idx
}

#' A rendered cell, addressed by analysis rather than by label
analysis_cell <- function(disp, slug, analysis, column) {
  j <- which(disp$columns$levels == column)
  testthat::expect_length(j, 1)
  disp$table[[paste0("col", j)]][row_of(slug, analysis)]
}

#' The count and the percentage a rendered "n (p%)" cell reports
count_at <- function(disp, slug, analysis, column) {
  as.integer(sub("[^0-9].*$", "", analysis_cell(disp, slug, analysis, column)))
}

pct_at <- function(disp, slug, analysis, column) {
  as.integer(sub("^.*\\(([0-9]+)%\\).*$", "\\1", analysis_cell(disp, slug, analysis, column)))
}

#' SAS rounds half away from zero; the displays follow it, so the expected
#' values here have to as well.
pct_half_up <- function(n, N) as.integer(floor(100 * n / N + 0.5))

#' The three planned treatment groups, in the order the displays declare
pilot_arms <- function() c("Placebo", "Xanomeline Low Dose", "Xanomeline High Dose")
