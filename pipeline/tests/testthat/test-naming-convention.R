# Guard suite: the evidence framework is only as good as the link between a test
# and the requirement it verifies, so the link is itself tested.

requirement_id_regex <- "^[A-Z]{2,4}-[A-Z]+-\\d+[A-D]?$"

test_names_in_suite <- function() {
  dir <- testthat::test_path()
  files <- list.files(dir, pattern = "^test-.*\\.R$", full.names = TRUE)
  out <- list()
  for (f in files) {
    exprs <- parse(f)
    for (e in exprs) {
      if (is.call(e) && identical(as.character(e[[1]]), "test_that")) {
        out[[length(out) + 1]] <- list(file = basename(f), test = as.character(e[[2]]))
      }
    }
  }
  out
}

# The R suite owns two matrices; the text, template and traceability matrices are
# verified by the vitest suite and are deliberately out of scope here.
r_matrix_files <- function() {
  file.path(csr_root(), "quality", "requirements", c("tfl-engine.md", "displays.md"))
}

matrix_ids <- function() {
  files <- r_matrix_files()
  ids <- character(0)
  for (f in files) {
    lines <- readLines(f, warn = FALSE)
    cells <- sub("^\\s*\\|\\s*([^|]+?)\\s*\\|.*$", "\\1", grep("^\\s*\\|", lines, value = TRUE))
    ids <- c(ids, cells[grepl(requirement_id_regex, cells)])
  }
  unique(ids)
}

test_that("TFL-QC-001: every test name carries requirement IDs and the tracking issue (#1)", {
  tests <- test_names_in_suite()
  expect_gt(length(tests), 25)
  bad <- character(0)
  for (t in tests) {
    if (!grepl("^[A-Z]{2,4}-[A-Z]+-\\d+[A-D]?(, [A-Z]{2,4}-[A-Z]+-\\d+[A-D]?)*: .+ \\(#\\d+\\)$", t$test)) {
      bad <- c(bad, paste0(t$file, ": ", t$test))
    }
  }
  expect_identical(bad, character(0))
})

test_that("TFL-QC-002: every requirement ID a test cites exists in a requirement matrix (#1)", {
  known <- matrix_ids()
  expect_gt(length(known), 20)
  cited <- unique(unlist(lapply(test_names_in_suite(), function(t) {
    strsplit(sub(":.*$", "", t$test), ", ", fixed = TRUE)[[1]]
  })))
  expect_true(all(grepl(requirement_id_regex, cited)))
  expect_identical(setdiff(cited, known), character(0))
})

test_that("TFL-QC-003: every requirement in a matrix is cited by at least one test (#1)", {
  known <- matrix_ids()
  cited <- unique(unlist(lapply(test_names_in_suite(), function(t) {
    strsplit(sub(":.*$", "", t$test), ", ", fixed = TRUE)[[1]]
  })))
  # an uncited requirement is an untested claim; the matrix must not carry one
  expect_identical(setdiff(known, cited), character(0))
})

test_that("TFL-QC-004: requirement matrices use the agreed column contract (#1)", {
  files <- r_matrix_files()
  expect_gte(length(files), 2)
  expect_true(all(file.exists(files)))
  for (f in files) {
    lines <- readLines(f, warn = FALSE)
    header <- grep("^\\|\\s*ID\\s*\\|", lines, value = TRUE)
    expect_gte(length(header), 1)
    for (h in header) {
      cols <- trimws(strsplit(h, "|", fixed = TRUE)[[1]])
      cols <- cols[nzchar(cols)]
      expect_identical(cols, c("ID", "Requirement", "Type", "Verification", "Status"), info = basename(f))
    }
    rows <- grep("^\\|\\s*[A-Z]{2,4}-", lines, value = TRUE)
    for (r in rows) {
      cells <- trimws(strsplit(r, "|", fixed = TRUE)[[1]])
      cells <- cells[nzchar(cells)]
      expect_length(cells, 5)
    }
  }
})
