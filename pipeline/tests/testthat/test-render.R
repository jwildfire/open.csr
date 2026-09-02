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
    c("Placebo", "Xanomeline Low Dose", "Xanomeline High Dose", "Total", "p-value")
  )
  # the pilot's own package: planned and actual agree, 86 / 84 / 84 (#60); the
  # p-value column heads no subjects
  expect_equal(unname(disp$columns$n), c(86, 84, 84, 254, NA))
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

test_that("TFL-RND-008: a level prints under its declared label, a sub-block's test comes from the sibling analysis `p_from` names and sits on its first level only, and the report's zero and sub-1% presentations are display options (#61)", {
  disp <- fixture_display("t-demographics")
  lab <- plain(disp$table$label)
  expect_true(all(c("Male", "Female", "<65 yrs") %in% lab))
  expect_false(any(c("M", "F", "<65") %in% lab))
  expect_match(cell(disp, "<65 yrs", "p-value"), "^0\\.[0-9]{4}$")
  expect_identical(cell(disp, "65-80 yrs", "p-value"), "")
  expect_identical(cell(disp, ">80 yrs", "p-value"), "")
  expect_identical(cell(disp, "Other", "Placebo"), "0")
  expect_identical(cell(disp, "Other", "Total"), "1 (<1%)")
  # the sub-1% presentation is opt-in: the same report prints "1 ( 0%)" elsewhere
  expect_identical(format_stat(1 / 254, "p", list(p = 0), sub_one = TRUE), "<1")
  expect_identical(format_stat(1 / 254, "p", list(p = 0)), "0")
  expect_identical(format_stat(1 / 254, "p", list(p = 1), sub_one = TRUE), "0.4")
  expect_identical(format_stat(0, "p", list(p = 0), sub_one = TRUE), "0")
})

test_that("TFL-RND-009: a hierarchical row plan can order its levels by name, by one arm's count, or by the subjects summed across arms, and a bare-zero option applies to any pattern that prints a count (#62)", {
  ard <- fixture_ard("t-ae-incidence")
  spec <- read_display_spec("t-ae-incidence")
  hier <- which(vapply(spec$rows, function(r) identical(r$type, "hierarchical"), logical(1)))
  by_high <- render_display(ard, spec)
  spec$rows[[hier]]$sort <- list(outer = "alpha", inner = list(by = "sum"))
  by_sum <- render_display(ard, spec)
  spec$rows[[hier]]$sort <- NULL
  by_default <- render_display(ard, spec)
  socs <- function(d) { l <- plain(d$table$label); ind <- attr(regexpr("^(\u00a0\u00a0\u00a0)*", d$table$label), "match.length"); l[ind == 0 & l != "ANY BODY SYSTEM"] }
  expect_identical(socs(by_high), sort(socs(by_high)))
  expect_false(identical(socs(by_default), sort(socs(by_default))))
  expect_false(identical(by_high$table$label, by_sum$table$label))
  # a count of nobody prints bare under the events pattern too
  expect_identical(cell(by_high, "CARDIAC DISORDER", "Placebo"), "0")
  spec$format$zero_count <- NULL
  long <- render_display(ard, spec)
  expect_identical(cell(long, "CARDIAC DISORDER", "Placebo"), "0 (0.0%) [0]")
})
