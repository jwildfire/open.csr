test_that("TFL-ITER-001: regenerate writes a complete, self-describing iteration (#1)", {
  root <- scratch_root("t-disposition")
  m <- regenerate("t-disposition", root,
    change_request = "First cut.", actor = "@tester", data = fixture_data()
  )
  expect_identical(m$version, "v001")
  dir <- file.path(root, "outputs", "t-disposition", "v001")
  expect_setequal(
    list.files(dir),
    c(
      "analysis.yaml", "display.yaml", "ard.json", "manifest.json",
      "table.html", "table-in-text.html",
      # The submission artifacts, written by the same loop (#129 A).
      "table.rtf", "table-in-text.rtf"
    )
  )
  # the spec snapshot is byte-identical to the spec that was read
  expect_identical(
    hash_file(file.path(dir, "analysis.yaml")),
    hash_file(file.path(display_dir("t-disposition"), "analysis.yaml"))
  )
  expect_gt(nchar(readLines(file.path(dir, "table.html")) |> paste(collapse = "")), 1000)
  unlink(root, recursive = TRUE)
})

test_that("TFL-ITER-002: the manifest records who, why, from what and how many (#1)", {
  root <- scratch_root("t-ae-overview")
  regenerate("t-ae-overview", root, change_request = "First cut.", actor = "@tester", data = fixture_data())
  man <- jsonlite::fromJSON(
    file.path(root, "outputs", "t-ae-overview", "v001", "manifest.json"),
    simplifyVector = FALSE
  )
  expect_identical(man$display, "t-ae-overview")
  expect_identical(man$actor, "@tester")
  expect_identical(man$change_request, "First cut.")
  expect_identical(man$regulatory_id, "AET01")
  expect_match(man$ard_hash, "^sha256:")
  expect_gt(man$ard_rows, 0)
  expect_equal(man$ard_errors, 0)
  expect_true(all(c("post_text", "in_text") %in% names(man$variants)))
  expect_identical(man$variants$post_text$file, "table.html")
  expect_true(!is.null(man$environment$r))
  unlink(root, recursive = TRUE)
})

test_that("TFL-ITER-003: a second regeneration never overwrites the first (#1)", {
  root <- scratch_root("t-disposition")
  first <- regenerate("t-disposition", root, change_request = "First cut.", actor = "@a", data = fixture_data())
  second <- regenerate("t-disposition", root, change_request = "Reviewer asked for a Total column.", actor = "@b", data = fixture_data())
  expect_identical(first$version, "v001")
  expect_identical(second$version, "v002")
  expect_true(dir.exists(file.path(root, "outputs", "t-disposition", "v001")))
  expect_true(dir.exists(file.path(root, "outputs", "t-disposition", "v002")))

  cur <- current_iteration("t-disposition", root)
  expect_identical(cur$version, "v002")
  expect_identical(cur$ard, "outputs/t-disposition/v002/ard.json")

  ledger <- iteration_ledger("t-disposition", root)
  expect_equal(nrow(ledger), 2)
  expect_identical(ledger$version, c("v001", "v002"))
  expect_identical(ledger$actor, c("@a", "@b"))
  expect_identical(ledger$change_request[2], "Reviewer asked for a Total column.")
  expect_true(all(grepl("^sha256:", ledger$ard_hash)))

  # regenerate_all() drives the same loop across a set of displays
  summary <- regenerate_all("t-disposition", root, change_request = "Batch.", actor = "@c")
  expect_identical(summary$display, "t-disposition")
  expect_identical(summary$version, "v003")
  expect_equal(summary$ard_errors, 0)
  expect_identical(current_iteration("t-disposition", root)$version, "v003")
  unlink(root, recursive = TRUE)
})

test_that("TFL-ITER-004: version allocation is robust to ledger and filesystem drift (#1)", {
  root <- scratch_root("t-disposition")
  regenerate("t-disposition", root, change_request = "First cut.", actor = "@a", data = fixture_data())
  # an iteration directory that never made it into the ledger
  dir.create(file.path(root, "outputs", "t-disposition", "v007"), recursive = TRUE)
  expect_identical(next_version("t-disposition", root), 8L)
  m <- regenerate("t-disposition", root, change_request = "After a crash.", actor = "@a", data = fixture_data())
  expect_identical(m$version, "v008")
  # and the reverse: a ledger entry whose directory was deleted
  unlink(file.path(root, "outputs", "t-disposition", "v008"), recursive = TRUE)
  expect_identical(next_version("t-disposition", root), 9L)
  unlink(root, recursive = TRUE)
})

test_that("TFL-ITER-005: the committed t-ae-common ledger tells a two-iteration change-request story (#1)", {
  ledger <- iteration_ledger("t-ae-common")
  expect_gte(nrow(ledger), 2)
  expect_identical(ledger$version[1:2], c("v001", "v002"))
  expect_true(all(nzchar(ledger$change_request)))
  expect_true(all(nzchar(ledger$actor)))
  expect_true(all(grepl("^\\d{4}-\\d{2}-\\d{2}T", ledger$created)))
  # the change request added a Total column: the specs, and therefore the ARDs, differ
  expect_false(identical(ledger$display_hash[1], ledger$display_hash[2]))
  expect_false(identical(ledger$ard_hash[1], ledger$ard_hash[2]))
  expect_gt(ledger$ard_rows[2], ledger$ard_rows[1])

  v1 <- read_ard(file.path(csr_root(), "outputs", "t-ae-common", "v001", "ard.json"))
  v2 <- read_ard(file.path(csr_root(), "outputs", "t-ae-common", "v002", "ard.json"))
  expect_false("Total" %in% v1$rows$group1_level)
  expect_true("Total" %in% v2$rows$group1_level)
  # the numbers that were already there did not move
  expect_equal(
    ard_binding(v1$rows, "by_soc_pt:n;group=Placebo;variable=AEDECOD;variable_level=DIARRHOEA"),
    ard_binding(v2$rows, "by_soc_pt:n;group=Placebo;variable=AEDECOD;variable_level=DIARRHOEA")
  )
})

test_that("TFL-ITER-006: regenerate refuses specs whose ids disagree with each other or the directory (#1)", {
  root <- scratch_root("t-disposition")
  dir <- file.path(root, "library", "tfl", "t-disposition")
  rename <- function(file, id) {
    spec <- yaml::read_yaml(file.path(dir, file))
    spec$id <- id
    writeLines(yaml::as.yaml(spec), file.path(dir, file))
  }

  # the two specs disagree with each other
  rename("analysis.yaml", "t-somethingelse")
  expect_error(regenerate("t-disposition", root, data = fixture_data()), "must match")

  # the two specs agree with each other but not with the directory
  rename("display.yaml", "t-somethingelse")
  expect_error(regenerate("t-disposition", root, data = fixture_data()), "does not match directory")

  expect_false(dir.exists(file.path(root, "outputs", "t-disposition", "v001")))
  unlink(root, recursive = TRUE)
})

test_that("TFL-ITER-007: every display in the library has a current iteration on disk (#1)", {
  for (slug in display_slugs()) {
    cur <- current_iteration(slug)
    expect_false(is.null(cur), info = slug)
    dir <- file.path(csr_root(), cur$path)
    expect_true(dir.exists(dir), info = slug)
    expect_true(file.exists(file.path(dir, "ard.json")), info = slug)
    expect_true(file.exists(file.path(dir, "table.html")), info = slug)
    expect_true(file.exists(file.path(dir, "manifest.json")), info = slug)
    ledger <- iteration_ledger(slug)
    expect_true(cur$version %in% ledger$version, info = slug)
  }
})
