test_that("TFL-IO-001: ard.json matches the owned schema, top to bottom (#1)", {
  doc <- jsonlite::fromJSON(
    file.path(csr_root(), current_iteration("t-ae-overview")$ard),
    simplifyVector = FALSE
  )
  expect_identical(doc$schema, "opencsr/ard/v1")
  expect_identical(doc$display, "t-ae-overview")
  expect_match(doc$created, "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}Z$")
  expect_setequal(
    names(doc),
    c("schema", "display", "created", "provenance", "rows")
  )
  expect_gt(length(doc$rows), 0)
  for (row in doc$rows[seq_len(min(20, length(doc$rows)))]) {
    expect_setequal(names(row), c(
      "analysis", "group1", "group1_level", "group2", "group2_level",
      "variable", "variable_level", "context", "stat_name", "stat_label",
      "stat", "warning", "error"
    ))
    expect_true(nzchar(row$analysis))
  }
})

test_that("TFL-IO-002: the provenance envelope is complete and machine-checkable (#1)", {
  doc <- read_ard(file.path(csr_root(), current_iteration("t-demographics")$ard))
  p <- doc$provenance
  expect_setequal(names(p), c("spec_hash", "display_hash", "data", "environment", "git_commit"))
  expect_match(p$spec_hash, "^sha256:[0-9a-f]{64}$")
  expect_match(p$display_hash, "^sha256:[0-9a-f]{64}$")
  expect_gt(length(p$data), 0)
  for (d in p$data) {
    expect_setequal(names(d), c("dataset", "hash", "n_row", "n_col", "source_pkg", "source_version"))
    expect_match(d$hash, "^sha256:[0-9a-f]{64}$")
    expect_identical(d$source_pkg, "pharmaverseadam")
  }
  expect_true(nzchar(p$environment$r))
  expect_true(!is.null(p$environment$packages$cards))
  # the recorded spec hash is the hash of the spec that is committed beside it
  ver_dir <- file.path(csr_root(), current_iteration("t-demographics")$path)
  expect_identical(p$spec_hash, hash_file(file.path(ver_dir, "analysis.yaml")))
  expect_identical(p$display_hash, hash_file(file.path(ver_dir, "display.yaml")))
})

test_that("TFL-IO-003: write_ard / read_ard round-trip an ARD without loss (#1)", {
  rows <- build_ard(read_analysis_spec("t-disposition"), fixture_data())
  path <- file.path(tempdir(), "roundtrip-ard.json")
  write_ard(rows, path, display = "t-disposition", provenance = list(spec_hash = "sha256:x"))
  back <- read_ard(path)

  expect_equal(nrow(back$rows), nrow(rows))
  expect_identical(back$rows$analysis, rows$analysis)
  expect_identical(back$rows$stat_name, rows$stat_name)
  expect_identical(back$rows$group1_level, rows$group1_level)
  expect_equal(unlist(back$rows$stat), unlist(rows$stat))
  # numbers stay numbers
  expect_true(is.numeric(unlist(back$rows$stat[back$rows$stat_name == "n"])))
  expect_identical(back$display, "t-disposition")
  unlink(path)
})

test_that("TFL-IO-004: reading refuses a document that is not an opencsr ARD (#1)", {
  path <- file.path(tempdir(), "foreign-ard.json")
  writeLines(jsonlite::toJSON(list(schema = "cards/ard/v9", rows = list()), auto_unbox = TRUE), path)
  expect_error(read_ard(path), "Unexpected ARD schema")
  unlink(path)
  expect_error(
    write_ard(data.frame(a = 1), file.path(tempdir(), "x.json"), display = "t-x"),
    "missing column"
  )
})

test_that("TFL-IO-005: every committed ARD is readable and internally consistent (#1)", {
  for (slug in display_slugs()) {
    cur <- current_iteration(slug)
    expect_false(is.null(cur), info = slug)
    doc <- read_ard(file.path(csr_root(), cur$ard))
    expect_identical(doc$display, slug, info = slug)
    expect_gt(nrow(doc$rows), 0)
    expect_true(all(nzchar(doc$rows$analysis)), info = slug)
    expect_true(all(is.na(doc$rows$error)), info = slug)
    known <- names(read_analysis_spec(slug)$analyses)
    expect_true(all(doc$rows$analysis %in% known), info = slug)
  }
})
