#!/usr/bin/env Rscript
# Do the two public packagings of CDISCPILOT01 agree?
#
# open.csr's demonstration study is available two ways: the pharmaverse's
# re-derivation ({pharmaverseadam}) and the CDISC pilot submission's own ADaM
# package (vendored from phuse-org/phuse-scripts). They overlap on three
# domains — ADSL, ADAE and ADVS — and they do not agree on all of them.
#
# This script measures the overlap and compares the measurement with the record
# committed at quality/data/source-agreement.json. Any difference is an exit
# code of 1: either the sources changed under us, or someone changed the record
# without changing the data.
#
# It is deliberately written WITHOUT loading {opencsr}: it reads the vendored
# .xpt.gz files itself and compares with base R. The same facts are measured a
# second time, through prepare_data() and dplyr, by TFL-SRC-001 in
# pipeline/tests/testthat/test-data-phuse.R. Two routes sharing no code have to
# land on the same numbers.
#
# Usage:
#   Rscript qc/source-agreement.R            # check; exit 1 on disagreement
#   Rscript qc/source-agreement.R --write    # rewrite the committed record

args <- commandArgs(trailingOnly = TRUE)
write_mode <- "--write" %in% args

root <- getwd()
while (!file.exists(file.path(root, "docs", "design", "contracts.md"))) {
  parent <- dirname(root)
  if (identical(parent, root)) stop("Could not locate the open.csr repository root.")
  root <- parent
}
record_path <- file.path(root, "quality", "data", "source-agreement.json")
vendor <- file.path(root, "pipeline", "inst", "extdata", "phuse-cdiscpilot01")

read_vendored <- function(name) {
  path <- file.path(vendor, paste0(name, ".xpt.gz"))
  haven::read_xpt(memDecompress(readBin(path, "raw", file.size(path)), type = "gzip"))
}

# Missing is missing: SAS character columns carry "" where R would carry NA, and
# the two packagings do not agree about which they use. Everything else is
# compared as text, exactly.
norm <- function(x) {
  x <- as.character(x)
  x[!is.na(x) & !nzchar(x)] <- NA_character_
  x
}

differs <- function(x, y) {
  x <- norm(x)
  y <- norm(y)
  !((is.na(x) & is.na(y)) | (!is.na(x) & !is.na(y) & x == y))
}

# For every variable, the number of records the two sources disagree on and —
# when that is not zero — the exact value pairs behind it. A scalar count can be
# right for the wrong reason; the pairs cannot.
compare_vars <- function(a, b, vars) {
  out <- list()
  for (v in vars) {
    if (!v %in% names(a) || !v %in% names(b)) {
      out[[v]] <- list(n_diff = NA, note = if (!v %in% names(a)) "absent from phuse" else "absent from pharmaverseadam")
      next
    }
    d <- differs(a[[v]], b[[v]])
    entry <- list(n_diff = sum(d))
    if (sum(d) > 0) {
      pairs <- paste0(
        ifelse(is.na(norm(a[[v]])[d]), "<NA>", norm(a[[v]])[d]), " > ",
        ifelse(is.na(norm(b[[v]])[d]), "<NA>", norm(b[[v]])[d])
      )
      tab <- table(pairs)
      entry$pairs <- as.list(stats::setNames(as.integer(tab), names(tab)))
    }
    out[[v]] <- entry
  }
  out
}

measure <- function() {
  ph_adsl <- read_vendored("adsl")
  ph_adae <- read_vendored("adae")
  ph_advs <- read_vendored("advs")
  ph_adcm <- read_vendored("adcm")

  pv_adsl <- pharmaverseadam::adsl
  pv_adsl <- pv_adsl[as.character(pv_adsl$ARM) != "Screen Failure", , drop = FALSE]
  ids <- ph_adsl$USUBJID
  pv_adae <- pharmaverseadam::adae
  pv_adae <- pv_adae[pv_adae$USUBJID %in% ids, , drop = FALSE]
  pv_advs <- pharmaverseadam::advs
  pv_advs <- pv_advs[pv_advs$USUBJID %in% ids, , drop = FALSE]

  a <- ph_adsl[order(ph_adsl$USUBJID), , drop = FALSE]
  b <- pv_adsl[order(pv_adsl$USUBJID), , drop = FALSE]
  subjects_identical <- identical(as.character(a$USUBJID), as.character(b$USUBJID))
  if (!subjects_identical) stop("ADSL subject sets differ; the rest of this comparison is meaningless.")

  ae_a <- ph_adae[order(ph_adae$USUBJID, ph_adae$AESEQ), , drop = FALSE]
  ae_b <- pv_adae[order(pv_adae$USUBJID, pv_adae$AESEQ), , drop = FALSE]
  ae_key_identical <- identical(
    paste(ae_a$USUBJID, ae_a$AESEQ), paste(ae_b$USUBJID, ae_b$AESEQ)
  )
  if (!ae_key_identical) stop("ADAE keys differ; the rest of this comparison is meaningless.")

  # Baseline vitals reach ADSL by different routes: the pilot ships them on
  # ADSL, the pharmaverse packaging only has them as ADVS baseline records.
  bl_route <- function(paramcd) {
    s <- pv_advs[!is.na(pv_advs$ABLFL) & pv_advs$ABLFL == "Y" & pv_advs$PARAMCD == paramcd,
      c("USUBJID", "AVAL"),
      drop = FALSE
    ]
    s <- s[!duplicated(s$USUBJID), , drop = FALSE]
    s$AVAL[match(a$USUBJID, s$USUBJID)]
  }
  bl <- list()
  for (nm in list(c("WEIGHT", "WEIGHTBL"), c("HEIGHT", "HEIGHTBL"), c("BMI", "BMIBL"))) {
    ph_v <- as.numeric(a[[nm[2]]])
    pv_v <- bl_route(nm[1])
    delta <- abs(ph_v - pv_v)
    bl[[nm[1]]] <- list(
      phuse_var = nm[2],
      n_phuse = sum(!is.na(ph_v)),
      n_pharmaverseadam = sum(!is.na(pv_v)),
      n_over_0_01 = sum(delta > 0.01, na.rm = TRUE),
      max_abs_delta = round(max(delta, na.rm = TRUE), 6)
    )
  }

  cm01 <- ph_adcm[as.character(ph_adcm$STUDYID) == "CDISCPILOT01", , drop = FALSE]
  cm02 <- ph_adcm[as.character(ph_adcm$STUDYID) == "CDISCPILOT02", , drop = FALSE]
  remapped <- sub("^02-", "01-", as.character(cm02$USUBJID))
  cm_key <- data.frame(
    USUBJID = c(as.character(cm01$USUBJID), remapped),
    AGE = c(cm01$AGE, cm02$AGE),
    SEX = c(as.character(cm01$SEX), as.character(cm02$SEX)),
    TRTA = c(as.character(cm01$TRTA), as.character(cm02$TRTA)),
    stringsAsFactors = FALSE
  )
  cm_key <- cm_key[!duplicated(cm_key$USUBJID), , drop = FALSE]
  ref <- a[match(cm_key$USUBJID, a$USUBJID), , drop = FALSE]

  list(
    study = "CDISCPILOT01",
    sources = list(
      phuse = "phuse-org/phuse-scripts:data/adam (CDISC pilot submission ADaM package)",
      pharmaverseadam = paste0("pharmaverseadam ", as.character(utils::packageVersion("pharmaverseadam")))
    ),
    comparison_rule = paste(
      "Values compared as text after normalising empty string to NA.",
      "ADSL is aligned on USUBJID after removing the 52 pharmaverseadam screen",
      "failures; ADAE is aligned on USUBJID+AESEQ."
    ),
    adsl = list(
      n_subjects = list(phuse = nrow(a), pharmaverseadam = nrow(b)),
      subjects_identical = subjects_identical,
      screen_failures = list(
        phuse = sum(as.character(ph_adsl$ARM) == "Screen Failure"),
        pharmaverseadam = sum(as.character(pharmaverseadam::adsl$ARM) == "Screen Failure")
      ),
      variables = compare_vars(a, b, c(
        "AGE", "SEX", "RACE", "ETHNIC", "AGEGR1", "ARM", "TRT01P", "TRT01A",
        "SITEID", "SAFFL", "TRTSDT", "TRTEDT", "DTHFL"
      )),
      population_flags_only_in_phuse = sort(intersect(
        c("ITTFL", "EFFFL", "COMP8FL", "COMP16FL", "COMP24FL", "DISCONFL", "DSRAEFL"),
        setdiff(names(a), names(b))
      )),
      discontinuation_reason_only_in_phuse = sort(intersect(
        c("DCDECOD", "DCREASCD"), setdiff(names(a), names(b))
      )),
      baseline_vitals = bl
    ),
    adae = list(
      n_records = list(phuse = nrow(ae_a), pharmaverseadam = nrow(ae_b)),
      n_subjects = list(
        phuse = length(unique(ae_a$USUBJID)),
        pharmaverseadam = length(unique(ae_b$USUBJID))
      ),
      keys_identical = ae_key_identical,
      variables = compare_vars(ae_a, ae_b, c(
        "AETERM", "AEDECOD", "AEBODSYS", "AESOC", "AESEV", "AESER", "AEREL",
        "AEOUT", "TRTEMFL", "AENDY"
      ))
    ),
    advs = list(
      n_records = list(phuse = nrow(ph_advs), pharmaverseadam = nrow(pv_advs)),
      parameters = list(
        phuse = sort(unique(as.character(ph_advs$PARAMCD))),
        pharmaverseadam = sort(unique(as.character(pv_advs$PARAMCD)))
      ),
      derived_records_pharmaverseadam = sum(!is.na(pv_advs$DTYPE)),
      derived_records_phuse = if ("DTYPE" %in% names(ph_advs)) sum(!is.na(ph_advs$DTYPE)) else 0L
    ),
    adcm = list(
      in_cdiscpilot01_folder = FALSE,
      in_study_define_xml = FALSE,
      n_records = list(CDISCPILOT01 = nrow(cm01), CDISCPILOT02 = nrow(cm02)),
      relabelled_subjects = length(unique(cm02$USUBJID)),
      remapped_subjects_found_in_adsl = sum(!is.na(ref$USUBJID)),
      remapped_subjects_matching_adsl_age_sex_arm = sum(
        !is.na(ref$USUBJID) &
          cm_key$AGE == ref$AGE &
          cm_key$SEX == as.character(ref$SEX) &
          cm_key$TRTA == as.character(ref$TRT01A)
      ),
      adsl_subjects_with_no_record = length(setdiff(a$USUBJID, cm_key$USUBJID))
    )
  )
}

measured <- measure()

if (write_mode) {
  dir.create(dirname(record_path), recursive = TRUE, showWarnings = FALSE)
  jsonlite::write_json(measured, record_path, auto_unbox = TRUE, pretty = TRUE, digits = NA)
  cat("wrote ", record_path, "\n", sep = "")
  quit(status = 0)
}

if (!file.exists(record_path)) {
  cat("MISSING RECORD: ", record_path, "\n", sep = "")
  cat("Run: Rscript qc/source-agreement.R --write\n")
  quit(status = 1)
}

recorded <- jsonlite::fromJSON(record_path, simplifyVector = FALSE)

# Round-trip the measurement through JSON so both sides have the same shape:
# a bare character vector and a JSON array of strings must compare as equal.
measured <- jsonlite::fromJSON(
  jsonlite::toJSON(measured, auto_unbox = TRUE, digits = NA),
  simplifyVector = FALSE
)

# Compare the two nested lists leaf by leaf, reporting every path that differs
# rather than the first.
flatten <- function(x, prefix = "") {
  if (!is.list(x)) {
    return(stats::setNames(list(x), prefix))
  }
  if (!length(x)) {
    return(stats::setNames(list(list()), prefix))
  }
  nms <- names(x)
  if (is.null(nms)) nms <- as.character(seq_along(x))
  out <- list()
  for (i in seq_along(x)) {
    key <- if (nzchar(prefix)) paste0(prefix, ".", nms[i]) else nms[i]
    out <- c(out, flatten(x[[i]], key))
  }
  out
}

as_text <- function(v) {
  if (is.null(v) || (is.list(v) && !length(v))) {
    return("<empty>")
  }
  paste(format(unlist(v)), collapse = ", ")
}

fm <- flatten(measured)
fr <- flatten(recorded)
paths <- union(names(fm), names(fr))
bad <- character(0)
for (p in paths) {
  m <- if (p %in% names(fm)) as_text(fm[[p]]) else "<absent from measurement>"
  r <- if (p %in% names(fr)) as_text(fr[[p]]) else "<absent from record>"
  if (!identical(m, r)) bad <- c(bad, sprintf("  %s\n    recorded: %s\n    measured: %s", p, r, m))
}

if (length(bad)) {
  cat("SOURCE AGREEMENT CHANGED — ", length(bad), " difference(s) from the committed record:\n", sep = "")
  cat(paste(bad, collapse = "\n"), "\n", sep = "")
  cat("\nIf the change is intended, review it and re-record with --write.\n")
  quit(status = 1)
}

cat("OK: source agreement matches ", record_path, " (", length(paths), " facts)\n", sep = "")
quit(status = 0)
