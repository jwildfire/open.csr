test_that("TFL-FMT-001: round_half_up rounds half away from zero, unlike base::round (#1)", {
  # The whole point: base R rounds half to even, SAS rounds half up.
  expect_identical(round_half_up(c(0.5, 1.5, 2.5, 3.5)), c(1, 2, 3, 4))
  expect_identical(base::round(c(0.5, 1.5, 2.5, 3.5)), c(0, 2, 2, 4))
  expect_identical(round_half_up(c(-0.5, -1.5, -2.5)), c(-1, -2, -3))
  expect_identical(round_half_up(0.125, 2), 0.13)
  expect_identical(base::round(0.125, 2), 0.12)
})

test_that("TFL-FMT-001: round_half_up survives binary representation error (#1)", {
  # 2.675 is stored as 2.67499999999999982…; decimal arithmetic (and SAS) give 2.68.
  expect_identical(round_half_up(2.675, 2), 2.68)
  expect_identical(round_half_up(1.45, 1), 1.5)
  expect_identical(round_half_up(1.005, 2), 1.01)
  # Values genuinely below the half are untouched.
  expect_identical(round_half_up(2.6749, 2), 2.67)
  expect_identical(round_half_up(2.4, 0), 2)
})

test_that("TFL-FMT-001: round_half_up preserves NA, Inf and vector length (#1)", {
  out <- round_half_up(c(1.25, NA, Inf, -Inf), 1)
  expect_length(out, 4)
  expect_identical(out[1], 1.3)
  expect_true(is.na(out[2]))
  expect_identical(out[3], Inf)
  expect_identical(out[4], -Inf)
  expect_error(round_half_up("a"), "must be numeric")
})

test_that("TFL-FMT-002: format_stat scales proportions to percent and pads decimals (#1)", {
  expect_identical(format_stat(0.3385827, "p"), "33.9")
  expect_identical(format_stat(1, "p"), "100.0")
  expect_identical(format_stat(0, "p"), "0.0")
  # trailing zeros are kept: a percentage is always reported to its declared precision
  expect_identical(format_stat(0.25, "p"), "25.0")
})

test_that("TFL-FMT-002: format_stat applies the collected-precision defaults (#1)", {
  expect_identical(format_stat(86, "n"), "86")
  expect_identical(format_stat(75.1496, "mean"), "75.1")
  expect_identical(format_stat(8.2456, "sd"), "8.25")
  expect_identical(format_stat(51, "min"), "51")
  expect_identical(format_stat(NA_real_, "mean"), NA_character_)
})

test_that("TFL-FMT-003: format_stat honours an explicit digit plan (#1)", {
  expect_identical(format_stat(66.6045, "mean", list(mean = 2)), "66.60")
  expect_identical(format_stat(0.3385827, "p", list(p = 0)), "34")
  expect_identical(format_stat(0.3385827, "p", list(p = 3)), "33.858")
})

test_that("TFL-FMT-003: the row-level digit plan overrides the display digit plan (#1)", {
  disp <- fixture_display("t-demographics")
  idx <- which(plain(disp$table$label) == "Mean (SD)")
  expect_gt(length(idx), 1)
  vals <- disp$table$col1[idx]
  # Age uses the display-level plan (mean 1 dp, sd 2 dp) …
  expect_identical(vals[1], "75.2 (8.59)")
  # … baseline weight overrides the mean to 2 dp on its own rows.
  expect_true("62.76 (12.77)" %in% vals)
})
