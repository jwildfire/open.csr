#!/usr/bin/env Rscript

# Run the opencsr testthat suite and emit qc/testthat-results.json (contract §8).
#
#   Rscript qc/run-tests.R
#
# The JSON is the R half of the evidence stream: scripts/evidence.mjs normalises
# it alongside the vitest results into per-module evidence.json. One record per
# test, with the test title verbatim so the requirement IDs it carries survive.
#
# Exits 1 when any test fails or errors, so it can gate CI.

suppressWarnings(suppressMessages({
  library(testthat)
  library(jsonlite)
}))

repo_root <- function() {
  args <- commandArgs(trailingOnly = FALSE)
  file_arg <- grep("^--file=", args, value = TRUE)
  here <- if (length(file_arg)) {
    dirname(normalizePath(sub("^--file=", "", file_arg[1])))
  } else {
    getwd()
  }
  dir <- here
  repeat {
    if (dir.exists(file.path(dir, "library", "tfl")) &&
      file.exists(file.path(dir, "docs", "design", "contracts.md"))) {
      return(dir)
    }
    parent <- dirname(dir)
    if (identical(parent, dir)) break
    dir <- parent
  }
  stop("Could not locate the open.csr repository root from ", here)
}

root <- repo_root()
options(opencsr.root = root)

message("open.csr root: ", root)
message("Running testthat suite in pipeline/tests/testthat ...")

results <- testthat::test_local(
  path = file.path(root, "pipeline"),
  reporter = testthat::ProgressReporter$new(update_interval = Inf),
  stop_on_failure = FALSE
)

df <- as.data.frame(results)

status_of <- function(i) {
  if (isTRUE(df$error[i]) || df$error[i] %in% TRUE) {
    return("error")
  }
  if (df$failed[i] > 0) {
    return("fail")
  }
  if (isTRUE(df$skipped[i])) {
    return("skip")
  }
  "pass"
}

records <- lapply(seq_len(nrow(df)), function(i) {
  list(
    file = as.character(df$file[i]),
    test = as.character(df$test[i]),
    status = status_of(i)
  )
})

statuses <- vapply(records, function(r) r$status, character(1))
doc <- list(
  suite = "r-unit",
  package = "opencsr",
  generated = format(as.POSIXlt(Sys.time(), tz = "UTC"), "%Y-%m-%dT%H:%M:%SZ"),
  environment = list(
    r = paste(R.version$major, R.version$minor, sep = "."),
    os = paste(Sys.info()[["sysname"]], Sys.info()[["release"]])
  ),
  summary = list(
    total = length(records),
    passed = sum(statuses == "pass"),
    failed = sum(statuses == "fail"),
    errored = sum(statuses == "error"),
    skipped = sum(statuses == "skip")
  ),
  records = records
)

out <- file.path(root, "qc", "testthat-results.json")
dir.create(dirname(out), showWarnings = FALSE, recursive = TRUE)
writeLines(jsonlite::toJSON(doc, auto_unbox = TRUE, pretty = 2, null = "null"), out)

message(sprintf(
  "\n%d tests: %d passed, %d failed, %d errored, %d skipped -> %s",
  doc$summary$total, doc$summary$passed, doc$summary$failed,
  doc$summary$errored, doc$summary$skipped, out
))

if (doc$summary$failed > 0 || doc$summary$errored > 0) {
  quit(status = 1)
}
