# RTF artifacts (obot.roadmap #129 A).
#
# The claim under test is narrow and load-bearing: the submission-format RTF a
# reviewer receives carries the SAME numbers as the HTML display and the ARD
# behind it. So the assertions are about content travelling intact — every
# rendered cell, the title, the footnotes, the source line — rather than about
# RTF syntax, which is {r2rtf}'s business and not open.csr's.
#
# Text is compared against an INDEPENDENT encoder written here from the RTF
# specification (7-bit: `\`, `{` and `}` escaped, everything above ASCII as
# `\uc1\uNNNN?`), not by calling the encoder under test — the same discipline the
# ARD tests use when they recompute expected values with dplyr.

as_rtf_text <- function(x) {
  x <- gsub("\\", "\\\\", x, fixed = TRUE)
  x <- gsub("{", "\\{", x, fixed = TRUE)
  x <- gsub("}", "\\}", x, fixed = TRUE)
  points <- utf8ToInt(x)
  chars <- strsplit(x, "")[[1]]
  paste0(ifelse(points < 128L, chars, paste0("\\uc1\\u", points, "?")), collapse = "")
}

test_that("TFL-RTF-001: a rendered display encodes as a complete RTF document (#1)", {
  disp <- fixture_display("t-ae-overview")
  rtf <- render_rtf(disp, read_display_spec("t-ae-overview"))
  expect_type(rtf, "character")
  expect_length(rtf, 1)
  expect_match(rtf, "^\\{\\\\rtf1")
  expect_match(rtf, "\\}\\s*$")
  expect_gt(nchar(rtf), 2000)
})

test_that("TFL-RTF-002: every cell of the rendered display survives into the RTF (#1)", {
  disp <- fixture_display("t-ae-overview")
  rtf <- render_rtf(disp, read_display_spec("t-ae-overview"))
  cells <- unlist(disp$table[, setdiff(names(disp$table), "label")], use.names = FALSE)
  cells <- unique(cells[nzchar(cells)])
  expect_gt(length(cells), 10)
  # RTF escapes a backslash and braces; none of these cells contain any.
  missing <- cells[!vapply(cells, function(c) grepl(as_rtf_text(c), rtf, fixed = TRUE), logical(1))]
  expect_identical(missing, character(0))
})

test_that("TFL-RTF-002: row labels arrive without the HTML indentation trick (#1)", {
  disp <- fixture_display("t-ae-common")
  rtf <- render_rtf(disp, read_display_spec("t-ae-common"))
  indented <- disp$table$label[grepl("\u00a0", disp$table$label)]
  expect_gt(length(indented), 0)
  # The non-breaking spaces exist only so HTML preserves indentation; RTF has
  # real indentation and must not carry the workaround into a submission file.
  expect_false(grepl("\u00a0", rtf, fixed = TRUE))
  expect_true(grepl(as_rtf_text(plain(indented[1])), rtf, fixed = TRUE))
})

test_that("TFL-RTF-003: the title, population, footnotes and source line travel with the table (#1)", {
  spec <- read_display_spec("t-ae-overview")
  rtf <- render_rtf(fixture_display("t-ae-overview"), spec)
  expect_true(grepl(as_rtf_text(spec$title), rtf, fixed = TRUE))
  expect_true(grepl(as_rtf_text(spec$population_label), rtf, fixed = TRUE))
  expect_true(grepl(spec$study, rtf, fixed = TRUE))
  for (note in spec$footnotes) expect_true(grepl(as_rtf_text(note), rtf, fixed = TRUE))
  expect_true(grepl("open.csr display t-ae-overview", rtf, fixed = TRUE))
})

test_that("TFL-RTF-003: column headers carry the treatment arms and their subject counts (#1)", {
  disp <- fixture_display("t-ae-overview")
  rtf <- render_rtf(disp, read_display_spec("t-ae-overview"))
  for (level in disp$columns$levels) expect_true(grepl(as_rtf_text(level), rtf, fixed = TRUE))
  counts <- disp$columns$n[!is.na(disp$columns$n)]
  expect_gt(length(counts), 0)
  for (n in counts) expect_true(grepl(paste0("(N=", format(n, trim = TRUE), ")"), rtf, fixed = TRUE))
})

test_that("TFL-RTF-004: a listing renders as RTF as well as a summary table does (#1)", {
  spec <- read_display_spec("l-ae-serious")
  rtf <- render_rtf(fixture_display("l-ae-serious"), spec)
  expect_match(rtf, "^\\{\\\\rtf1")
  expect_true(grepl(as_rtf_text(spec$title), rtf, fixed = TRUE))
})

test_that("TFL-RTF-004: the in-text variant renders its own, smaller RTF (#1)", {
  spec <- read_display_spec("t-ae-common")
  full <- render_rtf(fixture_display("t-ae-common", "post_text"), spec)
  in_text <- render_rtf(fixture_display("t-ae-common", "in_text"), spec)
  expect_match(in_text, "^\\{\\\\rtf1")
  # The in-text variant is a thresholded view of the same ARD, so it is shorter.
  expect_lt(nchar(in_text), nchar(full))
  expect_true(grepl("(in-text variant)", in_text, fixed = TRUE))
})

test_that("TFL-RTF-005: regenerate writes an RTF beside every rendered variant (#1)", {
  root <- scratch_root("t-disposition")
  m <- regenerate("t-disposition", root,
    change_request = "RTF artifacts.", actor = "@tester", data = fixture_data()
  )
  dir <- file.path(root, "outputs", "t-disposition", m$version)
  expect_true(all(c("table.rtf", "table-in-text.rtf") %in% list.files(dir)))
  expect_gt(file.size(file.path(dir, "table.rtf")), 1000)
  first <- readLines(file.path(dir, "table.rtf"), n = 1)
  expect_match(first, "^\\{\\\\rtf1")
  unlink(root, recursive = TRUE)
})

test_that("TFL-RTF-005: the manifest records each variant's RTF and its hash (#1)", {
  root <- scratch_root("t-disposition")
  m <- regenerate("t-disposition", root,
    change_request = "RTF artifacts.", actor = "@tester", data = fixture_data()
  )
  expect_identical(m$variants$post_text$rtf, "table.rtf")
  expect_identical(m$variants$in_text$rtf, "table-in-text.rtf")
  expect_match(m$variants$post_text$rtf_hash, "^sha256:")
  # The recorded hash is the file's, which is what lets CI prove the committed
  # RTF is the one this pipeline run produced rather than a hand-edited copy.
  expect_identical(
    m$variants$post_text$rtf_hash,
    hash_file(file.path(root, "outputs", "t-disposition", m$version, "table.rtf"))
  )
  man <- jsonlite::fromJSON(
    file.path(root, "outputs", "t-disposition", m$version, "manifest.json"),
    simplifyVector = FALSE
  )
  expect_identical(man$variants$post_text$rtf, "table.rtf")
  expect_match(man$variants$post_text$rtf_hash, "^sha256:")
  unlink(root, recursive = TRUE)
})

test_that("TFL-RTF-006: every committed display has an RTF whose hash matches its manifest (#1)", {
  slugs <- display_slugs()
  expect_gt(length(slugs), 0)
  for (slug in slugs) {
    cur <- current_iteration(slug)
    skip_if(is.null(cur), paste0("no committed iteration for ", slug))
    dir <- file.path(csr_root(), cur$path)
    man <- jsonlite::fromJSON(file.path(dir, "manifest.json"), simplifyVector = FALSE)
    for (variant in names(man$variants)) {
      entry <- man$variants[[variant]]
      expect_false(is.null(entry$rtf), info = paste(slug, variant))
      path <- file.path(dir, entry$rtf)
      expect_true(file.exists(path), info = path)
      expect_identical(hash_file(path), entry$rtf_hash, info = path)
    }
  }
})
