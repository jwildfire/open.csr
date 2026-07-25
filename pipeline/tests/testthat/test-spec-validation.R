# NB: utils::modifyList() will not replace an *unnamed* list element, so the
# overrides are applied by name explicitly.
with_overrides <- function(base, over) {
  for (nm in names(over)) base[[nm]] <- over[[nm]]
  base
}

minimal_analysis <- function(...) {
  with_overrides(
    list(
      id = "t-x", title = "X", type = "table", dataset = "adsl",
      analysis_set = "safety", group = "TRT01A",
      analyses = list(list(name = "a", method = "categorical", variables = "SEX"))
    ),
    list(...)
  )
}

minimal_display <- function(...) {
  with_overrides(
    list(
      id = "t-x", title = "X", study = "CDISCPILOT01",
      population_label = "Safety Analysis Set", cutoff = "2014-07-01"
    ),
    list(...)
  )
}

test_that("TFL-SPEC-001: an unknown analysis method is rejected by name (#1)", {
  spec <- minimal_analysis(analyses = list(list(name = "a", method = "regression")))
  expect_error(validate_analysis_spec(spec), "unknown method 'regression'")
  expect_error(validate_analysis_spec(spec), "Known methods")
})

test_that("TFL-SPEC-002: missing required analysis keys are reported together (#1)", {
  spec <- minimal_analysis()
  spec$dataset <- NULL
  spec$analysis_set <- NULL
  err <- expect_error(validate_analysis_spec(spec))
  expect_match(conditionMessage(err), "dataset")
  expect_match(conditionMessage(err), "analysis_set")
  expect_error(validate_analysis_spec(minimal_analysis(analyses = list())), "at least one entry")
  expect_error(validate_analysis_spec(minimal_analysis(type = "graph")), "must be one of")
})

test_that("TFL-SPEC-002: per-method required fields are enforced (#1)", {
  expect_error(
    validate_analysis_spec(minimal_analysis(
      analyses = list(list(name = "a", method = "categorical"))
    )),
    "requires `variables`"
  )
  expect_error(
    validate_analysis_spec(minimal_analysis(
      analyses = list(list(name = "a", method = "hierarchical_count", hierarchy = "AEDECOD"))
    )),
    "hierarchy"
  )
  expect_error(
    validate_analysis_spec(minimal_analysis(
      analyses = list(list(name = "a", method = "figure"))
    )),
    "requires `custom:`"
  )
  expect_error(
    validate_analysis_spec(minimal_analysis(group = c("TRT01A", "SEX"))),
    "at most one grouping variable"
  )
  expect_error(
    validate_analysis_spec(minimal_analysis(group = list(), total = TRUE)),
    "requires a grouping variable"
  )
})

test_that("TFL-SPEC-003: a display must identify its study, population and data cut-off (#1)", {
  for (key in c("study", "population_label", "cutoff", "title", "id")) {
    spec <- minimal_display()
    spec[[key]] <- NULL
    expect_error(validate_display_spec(spec), key)
    spec[[key]] <- ""
    expect_error(validate_display_spec(spec), "non-empty string")
  }
  expect_silent(validate_display_spec(minimal_display()))
})

test_that("TFL-SPEC-004: bare YAML `n` read as a boolean is rejected with an explanation (#1)", {
  # yaml 1.1 turns `pattern: n` into FALSE; silently rendering "FALSE" would be worse.
  spec <- minimal_display(rows = list(list(analysis = "a", pattern = FALSE)))
  err <- expect_error(validate_display_spec(spec))
  expect_match(conditionMessage(err), "must be a string")
  expect_match(conditionMessage(err), "YAML 1.1")
  expect_error(
    validate_display_spec(minimal_display(rows = list(list(pattern = "n_pct")))),
    "needs `analysis:`"
  )
})

test_that("TFL-SPEC-005: a display row naming an unknown analysis fails the build (#1)", {
  a <- validate_analysis_spec(minimal_analysis())
  d <- validate_display_spec(minimal_display(rows = list(list(analysis = "b", pattern = "n_pct"))))
  expect_error(check_specs_consistent(a, d), "unknown analysis 'b'")
  d2 <- validate_display_spec(minimal_display(id = "t-y"))
  expect_error(check_specs_consistent(a, d2), "must match")
  expect_true(check_specs_consistent(a, validate_display_spec(minimal_display())))
})

test_that("TFL-SPEC-006: every committed display in the library validates (#1)", {
  slugs <- display_slugs()
  expect_gte(length(slugs), 6)
  for (slug in slugs) {
    a <- read_analysis_spec(slug)
    d <- read_display_spec(slug)
    expect_identical(a$id, slug)
    expect_true(check_specs_consistent(a, d))
    expect_true("post_text" %in% names(d$variants))
  }
})
