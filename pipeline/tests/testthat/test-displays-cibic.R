# The CIBIC+ and time-to-event displays, checked against the study's own report.
#
# The other display tests in this suite recompute their expected values from
# {pharmaverseadam} with dplyr. These cannot: what makes an efficacy display
# right is not that two of our own implementations agree, but that they agree
# with the analysis the sponsor published — so the expected values here are read
# from quality/data/efficacy-reference.json, a transcription of the 2006 clinical
# study report, and nothing in this repository can move them.
#
# The deep second measurement — every statistic recomputed from the vendored
# .xpt.gz files without loading {opencsr} — is qc/efficacy-reference.R, which the
# CI workflow runs and which exits non-zero on any disagreement. These tests are
# the cell-level half of the same claim: that what the report published is what
# the rendered display prints.

efficacy_record <- function() {
  memo("efficacy_record", {
    jsonlite::fromJSON(
      file.path(csr_root(), "quality", "data", "efficacy-reference.json"),
      simplifyVector = FALSE
    )$displays
  })
}

ARMS <- c("Placebo", "Xanomeline Low Dose", "Xanomeline High Dose")

#' The k-th cell with a given row label
#'
#' `cell()` insists a label be unique, which is right for a table with one
#' section and wrong for one that repeats its rows at three visits.
nth_cell <- function(disp, label, column, k = 1) {
  idx <- which(plain(disp$table$label) == label)
  testthat::expect_gte(length(idx), k)
  j <- which(disp$columns$levels == column)
  testthat::expect_length(j, 1)
  disp$table[[paste0("col", j)]][idx[k]]
}

CIBIC_WEEKS <- c(
  "t-cibic-week8" = "Week 8",
  "t-cibic-week16" = "Week 16",
  "t-cibic-week24" = "Week 24"
)

test_that("DSP-CIBIC-001: the CIBIC+ summary tables reproduce the published tables cell for cell (#1)", {
  rec <- efficacy_record()
  for (slug in names(CIBIC_WEEKS)) {
    disp <- fixture_display(slug)
    ref <- rec[[slug]]
    for (i in seq_along(ARMS)) {
      arm <- ARMS[i]
      expect_identical(cell(disp, "n", arm), ref$summary$N[[i]], info = paste(slug, arm))
      expect_identical(
        cell(disp, "Mean (SD)", arm),
        paste0(ref$summary$mean[[i]], " (", ref$summary$sd[[i]], ")"),
        info = paste(slug, arm)
      )
      expect_identical(
        cell(disp, "Median (Range)", arm),
        paste0(ref$summary$median[[i]], " (", ref$summary$min[[i]], "; ", ref$summary$max[[i]], ")"),
        info = paste(slug, arm)
      )
    }
  }
  # Not a tautology check: the three tables must not be the same table.
  expect_false(identical(
    fixture_display("t-cibic-week8")$table, fixture_display("t-cibic-week24")$table
  ))
})

test_that("DSP-CIBIC-002: the analysis of covariance reproduces the published model results (#1)", {
  rec <- efficacy_record()
  high <- "Xanomeline High Dose"
  low <- "Xanomeline Low Dose"
  for (slug in names(CIBIC_WEEKS)) {
    disp <- fixture_display(slug)
    a <- rec[[slug]]$ancova

    # One model-level result, printed once, in the last column.
    expect_identical(
      cell(disp, "p-value (dose response)", high), a$dose_response$pval,
      info = slug
    )
    # An empty cell, not a repeated one: a single model result belongs in one column.
    expect_identical(cell(disp, "p-value (dose response)", "Placebo"), "", info = slug)

    for (arm in c(low, high)) {
      e <- a$xan_vs_pbo[[arm]]
      expect_identical(cell(disp, "p-value (Xanomeline − Placebo)", arm), e$pval, info = paste(slug, arm))
      expect_identical(
        nth_cell(disp, "Difference of LS means (SE)", arm, 1),
        paste0(e$diff, " (", e$se, ")"),
        info = paste(slug, arm)
      )
      expect_identical(
        nth_cell(disp, "95% CI", arm, 1), paste0("(", e$lcl, "; ", e$ucl, ")"),
        info = paste(slug, arm)
      )
    }

    hl <- a$high_vs_low
    label <- "p-value (Xanomeline High − Xanomeline Low)"
    expect_identical(cell(disp, label, high), hl$pval, info = slug)
    expect_identical(
      nth_cell(disp, "Difference of LS means (SE)", high, 2),
      paste0(hl$diff, " (", hl$se, ")"),
      info = slug
    )
    expect_identical(
      nth_cell(disp, "95% CI", high, 2), paste0("(", hl$lcl, "; ", hl$ucl, ")"),
      info = slug
    )
  }
})

test_that("DSP-CIBIC-003: the column heading is the analysis set and the n row is the visit (#1)", {
  rec <- efficacy_record()
  for (slug in names(CIBIC_WEEKS)) {
    disp <- fixture_display(slug)
    ref <- rec[[slug]]
    for (i in seq_along(ARMS)) {
      expect_identical(
        as.character(disp$columns$n[[i]]), ref$population_n[[i]],
        info = paste(slug, ARMS[i])
      )
      # A subject can be in the analysis set without a score at this visit, but
      # never the other way round.
      expect_lte(
        as.numeric(ref$summary$N[[i]]), as.numeric(ref$population_n[[i]])
      )
    }
  }
  # The distinction is not decorative: at Week 8 the two genuinely differ, which
  # is what makes taking the heading from the denominator rather than from the
  # analysis dataset a decision with consequences.
  wk8 <- rec[["t-cibic-week8"]]
  expect_false(identical(wk8$summary$N, wk8$population_n))
})

test_that("DSP-CIBIC-004: the categorical analysis reports every category at every visit and partitions it (#1)", {
  disp <- fixture_display("t-cibic-categorical")
  ref <- efficacy_record()[["t-cibic-categorical"]]
  categories <- vapply(ref$categories, identity, character(1))
  expect_length(categories, 7)

  for (v in seq_along(ref$visits)) {
    visit <- names(ref$visits)[v]
    vref <- ref$visits[[visit]]
    for (i in seq_along(ARMS)) {
      arm <- ARMS[i]
      expect_identical(nth_cell(disp, "n", arm, v), vref$N[[i]], info = paste(visit, arm))
      total <- 0
      for (j in seq_along(categories)) {
        got <- nth_cell(disp, categories[j], arm, v)
        n <- vref$n[[arm]][[j]]
        expect_match(got, paste0("^", n, " \\("), info = paste(visit, arm, categories[j]))
        total <- total + as.numeric(n)
      }
      # Every subject scored at the visit falls in exactly one category.
      expect_identical(total, as.numeric(vref$N[[i]]), info = paste(visit, arm))
    }
  }
  # Categories nobody was scored in are still reported — the published table's
  # empty rows are information, not absence.
  expect_identical(nth_cell(disp, "Marked improvement", "Placebo", 1), "0 (0%)")
  expect_identical(nth_cell(disp, "Marked worsening", "Placebo", 1), "0 (0%)")
})

test_that("DSP-CIBIC-005: the categorical p-values are the published row-mean-scores CMH values (#1)", {
  disp <- fixture_display("t-cibic-categorical")
  ref <- efficacy_record()[["t-cibic-categorical"]]
  high <- "Xanomeline High Dose"
  variants <- ref$cmh_variants_not_published
  for (v in seq_along(ref$visits)) {
    visit <- names(ref$visits)[v]
    expect_identical(
      nth_cell(disp, "p-value", high, v), ref$visits[[visit]]$cmh_pval,
      info = visit
    )
    expect_identical(nth_cell(disp, "p-value", high, v), variants$row_mean_scores[[visit]])
    # The record claims the general-association statistic does NOT reproduce the
    # report. An identical value would make the display's choice of statistic
    # unfalsifiable, so the difference is asserted rather than assumed.
    expect_false(identical(
      nth_cell(disp, "p-value", high, v), variants$general_association[[visit]]
    ))
    expect_identical(nth_cell(disp, "p-value", "Placebo", v), "", info = visit)
  }
})

test_that("DSP-TTE-001: the time-to-event display reproduces the published narrative (#1)", {
  disp <- fixture_display("f-derm-time-to-event")
  km <- efficacy_record()[["f-derm-time-to-event"]]$km
  for (i in seq_along(ARMS)) {
    arm <- ARMS[i]
    # The column heading carries the analysis-set size; the rows carry the split.
    expect_identical(unname(disp$columns$n[[i]]), as.numeric(km$N[[i]]), info = arm)
    expect_identical(
      cell(disp, "Subjects with a dermatologic event, n (%)", arm),
      paste0(km$n[[i]], " (", km$p[[i]], "%)"), info = arm
    )
    expect_identical(
      cell(disp, "Censored, n (%)", arm),
      paste0(km$n_censor[[i]], " (", km$p_censor[[i]], "%)"), info = arm
    )
    # Every subject at risk either had an event or was censored.
    expect_identical(
      as.numeric(km$n[[i]]) + as.numeric(km$n_censor[[i]]), as.numeric(km$N[[i]])
    )
    med <- km$median[[i]]
    cellv <- cell(disp, "Median time to event, days (95% CI)", arm)
    if (is.null(med)) {
      # The placebo curve never reached 0.5. "NE" says the statistic is not
      # estimable; a blank cell would be read as an omission.
      expect_identical(cellv, "NE", info = arm)
    } else {
      expect_identical(
        cellv, paste0(med, " (", km$median_lcl[[i]], ", ", km$median_ucl[[i]], ")"), info = arm
      )
    }
  }
})

test_that("DSP-TTE-002: the survival figure is drawn from the ARD and cannot disagree with it (#1)", {
  disp <- fixture_display("f-derm-time-to-event")
  svg <- disp$figure
  spec <- read_display_spec("f-derm-time-to-event")
  fig <- spec$figure
  expect_type(svg, "character")
  expect_match(svg, "class=\"opencsr-figure\"", fixed = TRUE)

  paths <- regmatches(svg, gregexpr("<path class=\"series s[0-9]+\" d=\"[^\"]+\"", svg))[[1]]
  expect_length(paths, length(ARMS))

  # The plot frame, so a drawn coordinate can be checked against the ARD.
  x0 <- 74
  x1 <- fig$width - 22
  y0 <- 46
  y1 <- fig$height - 62

  ard <- fixture_ard("f-derm-time-to-event")
  stat <- function(name, arm) {
    unlist(ard$rows$stat[
      ard$rows$stat_name == name & !is.na(ard$rows$group1_level) &
        ard$rows$group1_level == arm
    ][[1]])
  }
  for (i in seq_along(ARMS)) {
    d <- sub('.*d="([^"]+)".*', "\\1", paths[i])
    # Survival is non-increasing, so the drawn y coordinate — which grows
    # downward — must never move back up.
    ys <- as.numeric(regmatches(d, gregexpr("(?<=V)[0-9.]+", d, perl = TRUE))[[1]])
    expect_gt(length(ys), 10)
    expect_true(all(diff(ys) >= 0), info = ARMS[i])

    # The curve ends where the ARD says it ends: the frame maps survival 1 to the
    # top of the plot and 0 to its foot, so the last vertex is a statement about
    # a committed number, not a drawing choice.
    surv <- stat("surv", ARMS[i])
    expect_equal(
      utils::tail(ys, 1), y1 - utils::tail(surv, 1) * (y1 - y0),
      tolerance = 0.01, info = ARMS[i]
    )

    # One tick mark per censored subject's time, at the ARD's coordinates.
    ct <- stat("censor_time", ARMS[i])
    expect_gt(length(ct), 0)

    # The numbers-at-risk strip prints the ARD's counts, in the ARD's order, at
    # the abscissa the ARD's declared times map to.
    risk_t <- stat("risk_time", ARMS[i])
    risk_n <- stat("risk_n", ARMS[i])
    expect_equal(risk_t, as.numeric(read_analysis_spec("f-derm-time-to-event")$analyses$km$risk_times))
    for (j in seq_along(risk_t)) {
      want_x <- x0 + (risk_t[j] - fig$x_axis$min) /
        (fig$x_axis$max - fig$x_axis$min) * (x1 - x0)
      expect_match(
        svg,
        paste0("x=\"", sprintf("%.2f", want_x), "\" y=\"[0-9.]+\" text-anchor=\"middle\"",
               "[^>]*>", risk_n[j], "</text>"),
        info = paste(ARMS[i], risk_t[j])
      )
    }
  }
})

test_that("DSP-TTE-003: the annotated test is addressed into the ARD and reported at its precision (#1)", {
  disp <- fixture_display("f-derm-time-to-event")
  # Chi-square and degrees of freedom travel with the p-value so a reader can
  # check it rather than take it on trust; the p-value itself is reported at the
  # boundary of the declared precision, never rounded through it to zero.
  expect_match(disp$figure, "Log-rank chi-square 60.27 on 2 df, p &lt;0.0001", fixed = TRUE)

  # The ARD keeps the probability itself: the boundary is presentation, and the
  # number stays addressable and strictly positive.
  ard <- fixture_ard("f-derm-time-to-event")
  p <- ard_binding(ard, "km:p_value")
  expect_gt(p, 0)
  expect_lt(p, 1e-4)

  # The test is a property of the study, not of a treatment arm: parking it in
  # one arm's column would publish a study-level statistic as that arm's.
  lr <- ard$rows[ard$rows$context == "survival_test", , drop = FALSE]
  expect_gt(nrow(lr), 0)
  expect_true(all(is.na(lr$group1_level)))

  # An annotation whose address no longer resolves is a build failure, not a
  # stale number left on the face of a figure.
  spec <- read_display_spec("f-derm-time-to-event")
  stripped <- ard
  stripped$rows <- ard$rows[ard$rows$stat_name != "p_value", , drop = FALSE]
  expect_error(render_display(stripped, spec), "resolved 0 ARD rows")
})

test_that("TFL-FIG-001: a figure is drawn only from its ARD, and a missing series fails the build (#1)", {
  spec <- read_display_spec("f-derm-time-to-event")
  ard <- fixture_ard("f-derm-time-to-event")

  # Same ARD, same spec, same picture: rendering is a function of the committed
  # analysis results dataset and nothing else.
  expect_identical(
    render_display(ard, spec)$figure, render_display(ard, spec)$figure
  )

  stripped <- ard
  stripped$rows <- ard$rows[!(ard$rows$stat_name %in% c("time", "surv") &
    ard$rows$group1_level == "Placebo"), , drop = FALSE]
  expect_error(render_display(stripped, spec), "the ARD has no")

  # A strip whose counts do not line up with its times is refused rather than
  # drawn short.
  short <- ard
  keep <- !(short$rows$stat_name == "risk_n" & short$rows$group1_level == "Placebo")
  trimmed <- short$rows[!keep, , drop = FALSE]
  trimmed$stat[[1]] <- trimmed$stat[[1]][1:2]
  short$rows <- rbind(short$rows[keep, , drop = FALSE], trimmed)
  expect_error(render_display(short, spec), "reported a different number of counts")

  # A display that declares no figure gets none, rather than an empty frame.
  expect_null(render_display(fixture_ard("t-disposition"), read_display_spec("t-disposition"))$figure)
})

test_that("TFL-FIG-002: a figure keeps its appearance when the site strips the document head (#1)", {
  # The site embeds a rendered display by lifting its <body> and discarding
  # <head> (sanitizeEmbeddedHtml in scripts/site-lib.mjs). A figure that leaves
  # its styling up there arrives with no `fill:none` and no strokes, so every
  # survival curve publishes as a filled black wedge — and nothing errors while
  # it happens. Each drawn element therefore carries its appearance as a
  # presentation attribute as well as a class.
  disp <- fixture_display("f-derm-time-to-event")
  body <- sub("(?s).*<body>", "", disp$html, perl = TRUE)
  expect_false(grepl("<head", body, fixed = TRUE))

  paths <- regmatches(body, gregexpr("<path[^>]*>", body))[[1]]
  expect_length(paths, length(ARMS))
  for (pth in paths) {
    expect_match(pth, "fill=\"none\"", fixed = TRUE)
    expect_match(pth, "stroke=\"#[0-9A-Fa-f]{6}\"")
  }
  # The stylesheet that carries the dark-scheme palette travels inside the
  # <svg>, so it survives the same lift.
  svgpart <- regmatches(body, regexpr("(?s)<svg.*</svg>", body, perl = TRUE))
  expect_match(svgpart, "prefers-color-scheme: dark", fixed = TRUE)
})

test_that("TFL-SPEC-008: a figure display and its figure block must agree, or the build fails (#1)", {
  # A `type: figure` display with no plot renders as a table and publishes
  # silently as one. Both halves of the mismatch are refused.
  a <- read_analysis_spec("f-derm-time-to-event")
  d <- read_display_spec("f-derm-time-to-event")

  no_block <- d
  no_block$figure <- NULL
  expect_error(check_specs_consistent(a, no_block), "would render as a table")

  as_table <- a
  as_table$type <- "table"
  expect_error(check_specs_consistent(as_table, d), "never be numbered as one")

  wrong_analysis <- d
  wrong_analysis$figure$analysis <- "nope"
  expect_error(check_specs_consistent(a, wrong_analysis), "references unknown analysis")

  # YAML 1.1 reads a bare `y:` key as the boolean true, so an axis written `y:`
  # arrives named "TRUE" and looks absent.
  boolean_axis <- d$figure
  names(boolean_axis)[names(boolean_axis) == "y_axis"] <- "TRUE"
  expect_error(validate_figure_block(boolean_axis, "t-x"), "reads bare `y`")
})

test_that("TFL-FMT-004: p-values are reported at the boundary of their declared precision (#1)", {
  # A tail probability is not a measurement: rounding 8.2e-14 to four decimals
  # would print 0.0000 and assert that the probability is zero.
  expect_identical(format_stat(8.2e-14, "pval", list(pval = 4)), "<0.0001")
  expect_identical(format_stat(0.00004, "pval", list(pval = 4)), "<0.0001")
  expect_identical(format_stat(0.0001, "pval", list(pval = 4)), "0.0001")
  expect_identical(format_stat(0.99999, "pval", list(pval = 4)), ">0.9999")
  expect_identical(format_stat(1, "pval", list(pval = 4)), "1.0000")
  expect_identical(format_stat(0, "pval", list(pval = 4)), "0.0000")
  expect_identical(format_stat(0.618, "pval", list(pval = 4)), "0.6180")
  expect_identical(format_stat(0.96, "pval", list(pval = 3)), "0.960")
  # `p` is a proportion, not a p-value, and keeps its percent scaling.
  expect_identical(format_stat(0.00004, "p", list(p = 1)), "0.0")
  expect_identical(format_stat(1e-9, "sd", list(sd = 2)), "0.00")
})

test_that("TFL-SPEC-007: a spec key YAML 1.1 resolved to a boolean is refused, not silently dropped (#1)", {
  path <- file.path(tempdir(), "boolean-key-display.yaml")
  writeLines(c(
    "id: t-x", "title: x", "study: S", "population_label: p", "cutoff: \"2014-07-01\"",
    "format:", "  digits:", "    N: 0", "    mean: 1"
  ), path)
  # Reads cleanly as YAML — and means something else. `digits[["N"]]` is NULL,
  # so the declared precision would never reach the renderer.
  raw <- yaml::read_yaml(path)
  expect_identical(names(raw$format$digits), c("FALSE", "mean"))
  expect_error(read_display_spec(path = path), "resolved to a boolean")
  unlink(path)

  # Every display in the library survives the same guard.
  for (slug in display_slugs()) expect_silent(read_display_spec(slug))
})

test_that("TFL-PREP-016: a display is refused data prepared from a packaging its spec did not ask for (#1)", {
  spec <- read_analysis_spec("t-cibic-week24")
  expect_identical(unname(spec$sources), "phuse")

  root <- scratch_root("t-cibic-week24")
  # Same datasets the display asks for, one of them from the other packaging.
  wrong <- prepare_data(c("adsl", "adqscibc"), sources = c(adsl = "pharmaverseadam"))
  # The wording is the surviving engine's, not this branch's. Two branches built
  # this guard independently; the one that reached dev first names the offending
  # dataset and both sides of the disagreement, so it is the one kept. What the
  # test asserts is unchanged: the refusal happens, and nothing is written.
  expect_error(
    regenerate("t-cibic-week24", root, data = wrong),
    "prepared from a different source than the spec declares"
  )
  expect_false(dir.exists(file.path(root, "outputs", "t-cibic-week24", "v001")))
  unlink(root, recursive = TRUE)
})
