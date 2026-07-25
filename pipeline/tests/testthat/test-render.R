test_that("TFL-RND-001: rendered HTML is standalone — no CDN, no script, no external asset (#1)", {
  disp <- fixture_display("t-ae-overview")
  html <- disp$html
  expect_match(html, "^<!doctype html>")
  expect_false(grepl("http://|https://|//cdn", html))
  expect_false(grepl("<script", html, fixed = TRUE))
  expect_false(grepl("<link", html, fixed = TRUE))
  expect_match(html, "<style>")
  # and it contains real numbers, not a shell
  expect_match(html, "65 \\(75\\.6%\\)")
})

test_that("TFL-RND-002: the in-text variant is a strict subset of the post-text variant (#1)", {
  ard <- fixture_ard("t-ae-common")
  spec <- read_display_spec("t-ae-common")
  post <- render_display(ard, spec, "post_text")
  intext <- render_display(ard, spec, "in_text")

  expect_lt(nrow(intext$table), nrow(post$table))
  expect_gt(nrow(intext$table), 0)
  # every in-text row exists in the post-text render with identical cells:
  # one ARD, two variants, no re-authoring
  post_key <- paste(post$table$label, post$table$col1, post$table$col2, post$table$col3)
  intext_key <- paste(intext$table$label, intext$table$col1, intext$table$col2, intext$table$col3)
  expect_true(all(intext_key %in% post_key))
})

test_that("TFL-RND-002: the 5% threshold keeps exactly the terms that reach it (#1)", {
  ard <- fixture_ard("t-ae-common")
  spec <- read_display_spec("t-ae-common")
  intext <- render_display(ard, spec, "in_text")
  rows <- ard$rows
  pt <- rows[rows$variable == "AEDECOD" & rows$stat_name == "p" &
    rows$group1_level != "Total", ]
  reached <- unique(pt$variable_level[vapply(pt$stat, function(s) unlist(s) >= 0.05, logical(1))])
  shown <- plain(intext$table$label)
  # every displayed preferred term reaches the threshold …
  displayed_pt <- intersect(shown, unique(pt$variable_level))
  expect_setequal(displayed_pt, reached)
  # … and nothing that reached it was dropped
  expect_gt(length(reached), 5)
})

test_that("TFL-RND-003: columns follow the declared order and carry group counts (#1)", {
  disp <- fixture_display("t-demographics")
  expect_identical(
    disp$columns$levels,
    c("Placebo", "Xanomeline Low Dose", "Xanomeline High Dose", "Total")
  )
  expect_equal(unname(disp$columns$n), c(86, 96, 72, 254))
  expect_match(disp$html, "\\(N=86\\)")
  # a column declared but absent from the ARD is simply not rendered
  spec <- read_display_spec("t-demographics")
  spec$columns$order <- c("Placebo", "Nonexistent Arm")
  small <- render_display(fixture_ard("t-demographics"), spec)
  expect_identical(small$columns$levels, "Placebo")
})

test_that("TFL-RND-004: every display states study, analysis set and data cut-off (#1)", {
  for (slug in display_slugs()) {
    spec <- read_display_spec(slug)
    html <- fixture_display(slug)$html
    expect_match(html, spec$study, info = slug)
    expect_match(html, spec$population_label, info = slug)
    expect_match(html, spec$cutoff, fixed = TRUE, info = slug)
    expect_match(html, "Source:", info = slug)
  }
})

test_that("TFL-RND-005: rendering rejects a variant the display does not declare (#1)", {
  expect_error(
    render_display(fixture_ard("t-demographics"), read_display_spec("t-demographics"), "appendix"),
    "declares no variant"
  )
})

test_that("TFL-RND-006: section headings without data rows are dropped, indentation is preserved (#1)", {
  disp <- fixture_display("t-demographics")
  # section rows have empty cells; data rows do not
  sections <- which(disp$table$col1 == "" & nzchar(plain(disp$table$label)))
  expect_gt(length(sections), 0)
  expect_false(any(diff(sections) == 1)) # never two headings in a row
  # data rows are indented with non-breaking spaces; headings are not
  expect_true(all(grepl("^\u00a0", disp$table$label[-sections])))
  expect_false(any(grepl("^\u00a0", disp$table$label[sections])))
})

test_that("TFL-RND-007: a listing renders one column per listed variable with its label (#1)", {
  disp <- fixture_display("l-ae-serious")
  spec <- read_display_spec("l-ae-serious")
  expect_equal(length(disp$columns$levels), length(spec$columns$order))
  expect_true("System organ class" %in% disp$columns$levels)
  expect_equal(nrow(disp$table), sum(ref_adae()$AESER %in% "Y"))
  expect_match(disp$html, "SYNCOPE")
})
