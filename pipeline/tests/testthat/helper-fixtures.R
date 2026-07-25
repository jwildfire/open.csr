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

fixture_data <- function() {
  memo("data", prepare_data(c("adsl", "adae", "adex")))
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

#' ADSL exactly as this project defines the safety analysis set, computed
#' directly from the source package rather than through prepare_data().
ref_adsl <- function() {
  memo("ref_adsl", {
    d <- pharmaverseadam::adsl
    d[d$ARM != "Screen Failure" & !is.na(d$SAFFL) & d$SAFFL == "Y", , drop = FALSE]
  })
}

ref_adae <- function() {
  memo("ref_adae", {
    ids <- ref_adsl()$USUBJID
    d <- pharmaverseadam::adae
    d[d$USUBJID %in% ids, , drop = FALSE]
  })
}

ref_adex <- function() {
  memo("ref_adex", {
    ids <- ref_adsl()$USUBJID
    d <- pharmaverseadam::adex
    d[d$USUBJID %in% ids, , drop = FALSE]
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
  for (slug in slugs) {
    dir.create(file.path(root, "library", "tfl", slug), recursive = TRUE)
    for (f in list.files(display_dir(slug), full.names = TRUE)) {
      if (basename(f) == "iterations.yaml") next
      file.copy(f, file.path(root, "library", "tfl", slug, basename(f)))
    }
  }
  root
}
