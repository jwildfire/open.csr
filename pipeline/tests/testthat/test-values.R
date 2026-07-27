# The values store (obot.roadmap #129 B).
#
# A value is a named number with provenance. What has to be true of it: it says
# what it came from, it equals what its ARD row says, a derived value equals the
# arithmetic it declares, and a declaration that cannot resolve is a build error
# rather than a silently missing name.
#
# Expected values are read straight out of the committed ard.json — not through
# build_values() — so a failure means the store and the ARD disagree.

ard_stat <- function(slug, analysis, stat_name, group = NULL, variable_level = NULL) {
  cur <- current_iteration(slug)
  testthat::skip_if(is.null(cur), paste0("no committed iteration for ", slug))
  doc <- jsonlite::fromJSON(file.path(csr_root(), cur$ard), simplifyVector = FALSE)
  hits <- Filter(function(r) {
    ok <- identical(r$analysis, analysis) && identical(r$stat_name, stat_name)
    if (!is.null(group)) ok <- ok && identical(r$group1_level, group)
    if (!is.null(variable_level)) ok <- ok && identical(r$variable_level, variable_level)
    ok
  }, doc$rows)
  testthat::expect_length(hits, 1)
  unlist(hits[[1]]$stat)
}

test_that("TFL-VAL-001: the committed declaration validates and every value is uniquely named (#1)", {
  spec <- read_values_spec()
  expect_gt(length(spec$values), 5)
  ids <- vapply(spec$values, function(v) v$id, character(1))
  expect_identical(anyDuplicated(ids), 0L)
  expect_true(all(nzchar(ids)))
})

test_that("TFL-VAL-001: a declaration missing a label, an id or a source is rejected (#1)", {
  expect_error(validate_values_spec(list(values = list())), "non-empty")
  expect_error(validate_values_spec(list(values = list(list(label = "No id")))), "needs an `id`")
  expect_error(
    validate_values_spec(list(values = list(list(id = "x", source = "a:b:c")))),
    "needs a `label`"
  )
  expect_error(
    validate_values_spec(list(values = list(list(id = "x", label = "L")))),
    "exactly one of"
  )
  expect_error(
    validate_values_spec(list(values = list(
      list(id = "x", label = "L", source = "a:b:c", derived = list(op = "sum", inputs = c("a", "b")))
    ))),
    "exactly one of"
  )
})

test_that("TFL-VAL-002: a malformed binding address or unknown operation is rejected (#1)", {
  expect_error(
    validate_values_spec(list(values = list(list(id = "x", label = "L", source = "display:analysis")))),
    "expected <display>:<analysis>:<stat_name>"
  )
  expect_error(
    validate_values_spec(list(values = list(
      list(id = "x", label = "L", derived = list(op = "logarithm", inputs = c("a", "b")))
    ))),
    "known operations"
  )
  expect_error(
    validate_values_spec(list(values = list(
      list(id = "x", label = "L", derived = list(op = "ratio", inputs = c("a")))
    ))),
    "exactly two inputs"
  )
})

test_that("TFL-VAL-003: every ARD-sourced value equals its row in the committed ARD (#1)", {
  store <- build_values()
  sourced <- Filter(function(v) identical(v$kind, "ard"), store$values)
  expect_gt(length(sourced), 5)
  for (v in sourced) {
    parts <- strsplit(strsplit(v$source$address, ";", fixed = TRUE)[[1]][1], ":", fixed = TRUE)[[1]]
    quals <- strsplit(v$source$address, ";", fixed = TRUE)[[1]][-1]
    kv <- strsplit(quals, "=", fixed = TRUE)
    group <- NULL
    level <- NULL
    for (q in kv) {
      if (identical(q[1], "group")) group <- q[2]
      if (identical(q[1], "variable_level")) level <- q[2]
    }
    expect_equal(
      as.numeric(v$value),
      as.numeric(ard_stat(parts[1], parts[2], parts[3], group, level)),
      info = v$id
    )
  }
})

test_that("TFL-VAL-003: every value carries the iteration and hash of the ARD it came from (#1)", {
  store <- build_values()
  for (v in Filter(function(v) identical(v$kind, "ard"), store$values)) {
    expect_match(v$source$ard_hash, "^sha256:", info = v$id)
    expect_match(v$source$ard_file, "^outputs/", info = v$id)
    expect_match(v$source$iteration, "^v\\d{3}$", info = v$id)
    expect_identical(
      v$source$ard_hash,
      hash_file(file.path(csr_root(), v$source$ard_file)),
      info = v$id
    )
  }
})

test_that("TFL-VAL-004: a derived value equals the arithmetic it declares (#1)", {
  store <- build_values()
  by_id <- stats::setNames(lapply(store$values, function(v) v), vapply(store$values, function(v) v$id, character(1)))
  derived <- Filter(function(v) identical(v$kind, "derived"), store$values)
  expect_gt(length(derived), 0)
  for (v in derived) {
    inputs <- unname(vapply(v$derivation$inputs, function(i) as.numeric(by_id[[i]]$value), numeric(1)))
    expected <- switch(v$derivation$op,
      sum = sum(inputs),
      difference = inputs[1] - inputs[2],
      ratio = inputs[1] / inputs[2],
      percent = 100 * inputs[1] / inputs[2]
    )
    expect_equal(as.numeric(v$value), expected, info = v$id)
  }
})

test_that("TFL-VAL-004: a derivation naming a value declared after it is an error (#1)", {
  spec <- list(values = list(
    list(id = "b", label = "Derived first", derived = list(op = "sum", inputs = c("a", "a"))),
    list(id = "a", label = "Source second", source = "t-ae-overview:any_ae:n;group=Total")
  ))
  expect_error(build_values(spec = spec), "not declared before it")
})

test_that("TFL-VAL-005: an unresolvable binding fails the build rather than producing a blank value (#1)", {
  spec <- list(values = list(
    list(id = "x", label = "No such analysis", source = "t-ae-overview:not_an_analysis:n;group=Total")
  ))
  expect_error(build_values(spec = spec), "resolved 0 ARD rows|Value 'x'")

  spec2 <- list(values = list(
    list(id = "y", label = "No such display", source = "t-not-a-display:any:n")
  ))
  expect_error(build_values(spec = spec2), "no committed iteration")
})

test_that("TFL-VAL-006: percentages are scaled and rounded at presentation, never in the store (#1)", {
  store <- build_values()
  pct <- Filter(function(v) identical(v$format$scale, 100), store$values)
  expect_gt(length(pct), 0)
  for (v in pct) {
    # The stored value stays the ARD's proportion in [0, 1]; only `formatted`
    # carries the scaling, which is what keeps the store comparable to the ARD.
    expect_lte(as.numeric(v$value), 1)
    expect_equal(
      as.numeric(v$formatted),
      round_half_up(as.numeric(v$value) * 100, v$format$digits),
      tolerance = 1e-9, info = v$id
    )
  }
})

test_that("TFL-VAL-007: the committed store matches a fresh build of the declaration (#1)", {
  committed <- read_values()
  skip_if(is.null(committed), "values store has not been generated yet")
  fresh <- build_values()
  expect_identical(committed$schema, fresh$schema)
  expect_identical(
    vapply(committed$values, function(v) v$id, character(1)),
    vapply(fresh$values, function(v) v$id, character(1))
  )
  for (i in seq_along(fresh$values)) {
    expect_equal(
      as.numeric(committed$values[[i]]$value),
      as.numeric(fresh$values[[i]]$value),
      info = fresh$values[[i]]$id
    )
    expect_identical(
      committed$values[[i]]$formatted,
      fresh$values[[i]]$formatted,
      info = fresh$values[[i]]$id
    )
  }
})
