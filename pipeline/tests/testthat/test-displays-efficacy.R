# Efficacy displays (EFT01-EFT09).
#
# Expected values are never obtained by calling the code under test. They come
# either from the vendored .xpt.gz read directly here, or from
# quality/data/efficacy-reference.json, which holds the CDISCPILOT01 reference
# report's own published figures. A failure means the pipeline disagrees with
# one of those, not that it disagrees with itself.
#
# The standalone reproducer qc/efficacy-agreement.R runs the same comparison
# over the ARDs at full precision; these tests run it over the RENDERED cells,
# so the format patterns, the digit plan and the half-up rounding are covered
# too. Both must pass.

ARMS_EFF <- c("Placebo", "Xanomeline Low Dose", "Xanomeline High Dose")

#' A vendored PHUSE dataset, read without going through prepare_data()
eff_raw <- function(name) {
  memo(paste0("effraw.", name), {
    path <- file.path(
      csr_root(), "pipeline", "inst", "extdata", "phuse-cdiscpilot01",
      paste0(name, ".xpt.gz")
    )
    testthat::skip_if_not(file.exists(path), paste0("vendored ", name, " is absent"))
    d <- as.data.frame(haven::read_xpt(
      memDecompress(readBin(path, "raw", file.size(path)), type = "gzip")
    ))
    d$AVISIT <- trimws(d$AVISIT)
    d[d$EFFFL == "Y", , drop = FALSE]
  })
}

eff_reference <- function() {
  memo("eff_reference", {
    path <- file.path(csr_root(), "quality", "data", "efficacy-reference.json")
    testthat::skip_if_not(file.exists(path), "reference record is absent")
    jsonlite::fromJSON(path, simplifyVector = FALSE)$displays
  })
}

# The rendered cell for a row label and treatment column, indentation stripped.
# `occurrence` picks among repeated labels: these displays reuse "n", "Mean (SD)" and
# "Median (Range)" once per section, so the section is chosen by position.
eff_cell <- function(slug, label, arm, occurrence = 1) {
  disp <- fixture_display(slug)
  idx <- which(plain(disp$table$label) == label)
  testthat::expect_gte(length(idx), occurrence)
  j <- which(disp$columns$levels == arm)
  testthat::expect_length(j, 1)
  disp$table[[paste0("col", j)]][idx[occurrence]]
}

fmt <- function(x, stat, digits = list()) format_stat(x, stat, digits)

EFF_DIGITS <- list(mean = 1, sd = 2, median = 1, min = 0, max = 0,
                   estimate = 1, se = 2, lcl = 1, ucl = 1, pvalue = 3)

test_that("DSP-EFF-001: efficacy descriptive statistics match the vendored ADaM computed directly (#1)", {
  adas <- eff_raw("adqsadas")
  adas <- adas[adas$PARAMCD == "ACTOT", ]
  cases <- list(
    list(slug = "t-eff-adas-wk24", rows = function(d) d[d$ANL01FL == "Y" & d$AVISITN == 24, ]),
    list(slug = "t-eff-adas-wk8", rows = function(d) d[d$ANL01FL == "Y" & d$AVISITN == 8, ]),
    list(slug = "t-eff-adas-wk16", rows = function(d) d[d$ANL01FL == "Y" & d$AVISITN == 16, ]),
    list(slug = "t-eff-adas-wk24-male",
         rows = function(d) d[d$ANL01FL == "Y" & d$AVISITN == 24 & d$SEX == "M", ]),
    list(slug = "t-eff-adas-wk24-female",
         rows = function(d) d[d$ANL01FL == "Y" & d$AVISITN == 24 & d$SEX == "F", ]),
    list(slug = "t-eff-adas-wk24-completers",
         rows = function(d) d[d$ANL01FL == "Y" & d$AVISITN == 24 & d$COMP24FL == "Y" & !(d$DTYPE %in% "LOCF"), ])
  )
  for (case in cases) {
    sub <- case$rows(adas)
    disp <- fixture_display(case$slug)
    labels <- plain(disp$table$label)
    for (arm in ARMS_EFF) {
      x <- sub[sub$TRTP == arm, ]
      j <- which(disp$columns$levels == arm)
      # The three sections repeat the same three row labels, in order:
      # baseline, the on-treatment visit, then the change.
      for (k in seq_along(c("BASE", "AVAL", "CHG"))) {
        v <- x[[c("BASE", "AVAL", "CHG")[k]]]
        v <- v[!is.na(v)]
        n_idx <- which(labels == "n")[k]
        m_idx <- which(labels == "Mean (SD)")[k]
        r_idx <- which(labels == "Median (Range)")[k]
        col <- disp$table[[paste0("col", j)]]
        expect_identical(col[n_idx], as.character(length(v)),
                         info = paste(case$slug, arm, k, "n"))
        expect_identical(
          col[m_idx],
          paste0(fmt(mean(v), "mean", EFF_DIGITS), " (", fmt(stats::sd(v), "sd", EFF_DIGITS), ")"),
          info = paste(case$slug, arm, k, "mean (sd)")
        )
        expect_identical(
          col[r_idx],
          paste0(fmt(stats::median(v), "median", EFF_DIGITS), " (",
                 fmt(min(v), "min", EFF_DIGITS), ";", fmt(max(v), "max", EFF_DIGITS), ")"),
          info = paste(case$slug, arm, k, "median (range)")
        )
      }
    }
  }
})

test_that("DSP-EFF-002: the ANCOVA statistics reproduce the reference report exactly (#1)", {
  ref <- eff_reference()
  slugs <- c("t-eff-adas-wk24", "t-eff-adas-wk8", "t-eff-adas-wk16",
             "t-eff-adas-wk24-completers", "t-eff-adas-wk24-male",
             "t-eff-adas-wk24-female", "t-eff-npix-mean")
  for (slug in slugs) {
    cells <- ref[[slug]]$cells
    disp <- fixture_display(slug)
    labels <- plain(disp$table$label)
    col_of <- function(arm) disp$table[[paste0("col", which(disp$columns$levels == arm))]]
    dose <- labels[grepl("^p-value \\(dose response\\)", labels)][1]
    expect_identical(eff_cell(slug, dose, ARMS_EFF[3]),
                     fmt(cells$p_dose, "pvalue", EFF_DIGITS), info = slug)
    xp <- labels[grepl("^p-value \\(Xanomeline - Placebo\\)", labels)][1]
    for (i in 2:3) {
      expect_identical(eff_cell(slug, xp, ARMS_EFF[i]),
                       fmt(cells$p_xan_placebo[[i - 1]], "pvalue", EFF_DIGITS),
                       info = paste(slug, ARMS_EFF[i]))
      d <- cells$diff_xan_placebo[[i - 1]]
      ci <- cells$ci_xan_placebo[[i - 1]]
      idx <- which(labels == "Difference of LS means (SE)")[1]
      j <- which(disp$columns$levels == ARMS_EFF[i])
      expect_identical(disp$table[[paste0("col", j)]][idx],
                       paste0(fmt(d[[1]], "estimate", EFF_DIGITS), " (", fmt(d[[2]], "se", EFF_DIGITS), ")"),
                       info = paste(slug, ARMS_EFF[i], "diff"))
      cidx <- which(labels == "95% CI")[1]
      expect_identical(disp$table[[paste0("col", j)]][cidx],
                       paste0("(", fmt(ci[[1]], "lcl", EFF_DIGITS), ";", fmt(ci[[2]], "ucl", EFF_DIGITS), ")"),
                       info = paste(slug, ARMS_EFF[i], "ci"))
    }
    hl <- labels[grepl("^p-value \\(Xanomeline High - Xanomeline Low\\)", labels)][1]
    expect_identical(eff_cell(slug, hl, ARMS_EFF[3]),
                     fmt(cells$p_high_low, "pvalue", EFF_DIGITS), info = slug)
    d <- cells$diff_high_low[[1]]
    j <- which(disp$columns$levels == ARMS_EFF[3])
    idx <- which(labels == "Difference of LS means (SE)")[2]
    expect_identical(disp$table[[paste0("col", j)]][idx],
                     paste0(fmt(d[[1]], "estimate", EFF_DIGITS), " (", fmt(d[[2]], "se", EFF_DIGITS), ")"),
                     info = paste(slug, "high vs low diff"))
  }
})

test_that("DSP-EFF-003: the completers display separates population size from records summarised (#1)", {
  disp <- fixture_display("t-eff-adas-wk24-completers")
  # The column header states the population; the n row states what was summarised.
  expect_identical(unname(disp$columns$n[disp$columns$levels == "Placebo"]), 60)
  expect_identical(eff_cell("t-eff-adas-wk24-completers", "n", "Placebo"), "59")
  expect_identical(unname(disp$columns$n[disp$columns$levels == "Xanomeline Low Dose"]), 28)
  expect_identical(eff_cell("t-eff-adas-wk24-completers", "n", "Xanomeline Low Dose"), "27")
  # And where nobody is missing, the two agree.
  expect_identical(unname(disp$columns$n[disp$columns$levels == "Xanomeline High Dose"]), 30)
  expect_identical(eff_cell("t-eff-adas-wk24-completers", "n", "Xanomeline High Dose"), "30")
})

test_that("DSP-EFF-004: the over-time display's two imputation lanes select different records (#1)", {
  ref <- eff_reference()$`t-eff-adas-overtime`$cells
  disp <- fixture_display("t-eff-adas-overtime")
  labels <- plain(disp$table$label)
  # Row blocks in spec order: baseline, then windowed 8/16/24, then LOCF 8/16/24.
  n_rows <- which(labels == "n")
  order_ <- c("Baseline", "Week 8 (Windowed)", "Week 16 (Windowed)", "Week 24 (Windowed)",
              "Week 8 LOCF", "Week 16 LOCF", "Week 24 LOCF")
  for (arm in ARMS_EFF) {
    j <- which(disp$columns$levels == arm)
    col <- disp$table[[paste0("col", j)]]
    for (i in seq_along(order_)) {
      expect_identical(col[n_rows[i]], as.character(as.integer(ref[[arm]][[order_[i]]][[1]])),
                       info = paste(arm, order_[i], "n"))
    }
  }
  # Week 8 agrees between lanes (nobody is missing yet); Weeks 16 and 24 do not.
  pl <- disp$table[[paste0("col", which(disp$columns$levels == "Placebo"))]]
  expect_identical(pl[n_rows[2]], pl[n_rows[5]])
  expect_false(identical(pl[n_rows[3]], pl[n_rows[6]]))
  expect_false(identical(pl[n_rows[4]], pl[n_rows[7]]))
  # Each visit's baseline row is that visit's contributors, so the windowed
  # baseline moves while the LOCF baseline stays at the column's own baseline.
  b <- which(labels == "Baseline of these subjects, mean (SD)")
  expect_false(identical(pl[b[2]], pl[b[5]]))
  expect_identical(pl[b[4]], pl[b[6]])
})

test_that("DSP-EFF-005: the repeated-measures fit reproduces the reference report's PROC MIXED output (#1)", {
  rows <- fixture_ard("t-eff-adas-mmrm")$rows
  m <- function(s) {
    v <- rows$stat[rows$analysis == "mmrm" & rows$stat_name == s &
                     !is.na(rows$variable_level) & rows$variable_level == "model"]
    expect_length(v, 1)
    as.numeric(unlist(v))
  }
  expect_identical(m("n_obs"), 539)
  expect_identical(m("n_subjects"), 234)
  # SAS PROC MIXED, printed in the reference report's own supporting output.
  sas <- c("UN(1,1)" = 16.8209, "UN(2,1)" = 11.2056, "UN(2,2)" = 28.2581,
           "UN(3,1)" = 11.8853, "UN(3,2)" = 14.4451, "UN(3,3)" = 31.3944)
  for (nm in names(sas)) {
    # Six significant figures. The optimisers are not the same one, so the
    # agreement is on the estimates, not on the last bit of the search.
    expect_equal(m(nm), unname(sas[[nm]]), tolerance = 1e-4, info = nm)
  }
  expect_equal(m("reml_criterion"), 3087.84303515, tolerance = 1e-8)
})

test_that("DSP-EFF-006: the repeated-measures LS means are the visit-averaged treatment effect (#1)", {
  rows <- fixture_ard("t-eff-adas-mmrm")$rows
  ls_placebo <- as.numeric(unlist(rows$stat[
    rows$analysis == "mmrm" & rows$stat_name == "estimate" &
      !is.na(rows$variable_level) & rows$variable_level == "lsmean" &
      rows$group1_level == "Placebo"]))
  expect_length(ls_placebo, 1)
  # Averaged over Weeks 8, 16 and 24 this is about 1.55. Conditioned on Week 24
  # it is about 2.33 — a different estimand, and one this display does not
  # report. The gap is wide enough that swapping them could not pass unnoticed.
  expect_equal(ls_placebo, 1.5535, tolerance = 1e-3)
  expect_gt(abs(ls_placebo - 2.33), 0.5)
  spec <- read_analysis_spec("t-eff-adas-mmrm")
  expect_identical(as.character(spec$analyses$mmrm$lsmeans_over), "all")
})

test_that("DSP-EFF-007: the NPI-X endpoint follows the analysis plan, not the shipped NPTOTMN parameter (#1)", {
  npix <- eff_raw("adqsnpix")
  span <- npix[npix$PARAMCD == "NPTOT" & npix$ANL01FL == "Y" &
                 npix$AVISITN >= 4 & npix$AVISITN <= 24, ]
  per_subject <- vapply(split(span$AVAL, span$USUBJID), function(x) mean(x, na.rm = TRUE), numeric(1))
  arms <- vapply(split(span$TRTP, span$USUBJID), function(x) as.character(x)[1], character(1))
  # The second "n" row is the Weeks 4-24 section; the first is baseline.
  for (arm in ARMS_EFF) {
    v <- per_subject[arms == arm]
    expect_identical(eff_cell("t-eff-npix-mean", "n", arm, occurrence = 2), as.character(length(v)),
                     info = paste("SAP-literal n", arm))
  }
  # 78 / 75 / 69, which is what the reference report published, against a
  # baseline section of 79 / 81 / 74.
  expect_identical(eff_cell("t-eff-npix-mean", "n", "Placebo", occurrence = 2), "78")
  expect_identical(eff_cell("t-eff-npix-mean", "n", "Placebo", occurrence = 1), "79")
  # The study's own derived parameter answers a narrower question: it omits
  # twelve subjects and adds none. The display declares that; this keeps it true.
  shipped <- npix[npix$PARAMCD == "NPTOTMN" & npix$AVISITN == 98, ]
  expect_length(setdiff(unique(shipped$USUBJID), names(per_subject)), 0)
  expect_length(setdiff(names(per_subject), unique(shipped$USUBJID)), 12)
})

test_that("DSP-EFF-008: a derived subject record refuses a carry column that varies inside the subject (#1)", {
  df <- data.frame(
    USUBJID = c("A", "A", "B", "B"),
    TRTP = c("Placebo", "Placebo", "Placebo", "Placebo"),
    BASE = c(1, 1, 2, 2),
    AVAL = c(10, 20, 30, 40),
    stringsAsFactors = FALSE
  )
  spec <- list(group = "TRTP", derive = list(
    statistic = "mean", value = "AVAL", id = "USUBJID", carry = "BASE"
  ))
  out <- derive_subject_summary(df, spec)
  expect_identical(nrow(out), 2L)
  expect_identical(out$AVAL, c(15, 35))
  expect_identical(out$BASE, c(1, 2))

  df$BASE[2] <- 99
  expect_error(derive_subject_summary(df, spec), "not constant within USUBJID")
})

test_that("DSP-EFF-009: every rendered efficacy cell matches the reference report bar the five declared (#1)", {
  path <- file.path(csr_root(), "quality", "data", "efficacy-agreement.json")
  skip_if_not(file.exists(path), "agreement record is absent")
  rec <- jsonlite::fromJSON(path, simplifyVector = FALSE)
  differing <- unlist(lapply(rec$displays, function(d) d$reference_cells_differing))
  # Exactly five, all in the repeated-measures display, all explained by the
  # small-sample correction that display's footnotes declare. A sixth, or a
  # different fifth, is a regression and fails here.
  expect_length(differing, 5)
  expect_true(all(vapply(rec$displays, function(d) {
    length(d$reference_cells_differing) == 0
  }, logical(1))[setdiff(names(rec$displays), "t-eff-adas-mmrm")]))
  expect_identical(sort(unname(unlist(differing))), sort(c(
    "lsmean[6]: 0.55 here, 0.56 in the reference",
    "p_xan_placebo[1]: 0.954 here, 0.955 in the reference",
    "p_xan_placebo[2]: 0.555 here, 0.556 in the reference",
    "ci_xan_placebo[3]: -1.8 here, -1.9 in the reference",
    "p_high_low[1]: 0.605 here, 0.606 in the reference"
  )))
  expect_identical(rec$route_A_vs_B$values_compared, rec$route_A_vs_B$values_agreeing)
})
