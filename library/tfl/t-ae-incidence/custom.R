# Custom statistics for the reference report's adverse-event incidence tables —
# Table 14-5.01 (all treatment-emergent events) and Table 14-5.02 (serious
# ones), which share this file through t-sae-incidence's `custom_from`.
#
# Each row of those tables carries, per arm, the subjects with at least one
# event, the percentage of the arm, and in brackets the number of times the
# event was recorded; and, in two final columns, Fisher's exact test of placebo
# against each active arm on the subject incidence. The built-in
# `hierarchical_count` method gives the first two of those; the event count and
# the tests are this file's. The report prints an asterisk beside a p-value
# under 0.15, ">0.99" for one that rounds to 1, and nothing at all where both
# arms have no subjects with the event — there is no test to run.

`%||%` <- function(x, y) if (is.null(x)) y else x

half_up <- function(x, digits) {
  scale <- 10^digits
  sign(x) * floor(abs(x) * scale * (1 + 2 * .Machine$double.eps) + 0.5) / scale
}

fmt_fisher <- function(p) {
  if (is.na(p)) return("")
  # the report prints a p-value under 0.0005 as 0.000, one that rounds to 1 as
  # >0.99, and drops a trailing zero at the third decimal (0.580 prints as 0.58)
  s <- if (p >= 0.995) ">0.99" else formatC(half_up(p, 3), format = "f", digits = 3)
  if (s != "0.000" && grepl("0$", s)) s <- sub("0$", "", s)
  if (p < 0.15) paste0(s, "*") else s
}

arm_levels <- function(denominator, group) {
  g <- denominator[[group]]
  if (is.factor(g)) levels(g) else sort(unique(as.character(g)))
}

# The per-arm statistics for one set of records (a SOC, a PT, or everything).
incidence_stats <- function(records, denominator, group, arms, id) {
  g_den <- as.character(denominator[[group]])
  g_rec <- as.character(records[[group]])
  lapply(arms, function(a) {
    N <- length(unique(denominator[[id]][g_den == a]))
    n <- length(unique(records[[id]][g_rec == a]))
    list(arm = a, N = N, n = n, p = if (N > 0) n / N else NA_real_, events = sum(g_rec == a))
  })
}

# Fisher's exact test of the reference arm against each other arm, on subjects.
fisher_rows <- function(stats, reference) {
  ref <- Filter(function(s) s$arm == reference, stats)[[1]]
  others <- Filter(function(s) s$arm != reference, stats)
  lapply(others, function(s) {
    p <- if (ref$n == 0 && s$n == 0) {
      NA_real_
    } else {
      stats::fisher.test(rbind(c(ref$n, s$n), c(ref$N - ref$n, s$N - s$n)))$p.value
    }
    list(level = paste(reference, "vs.", sub("^Xanomeline ", "", s$arm)), p = p)
  })
}

row_block <- function(stats, tests, variable, variable_level, group, group2 = NA_character_, group2_level = NA_character_, context = "hierarchical") {
  arm_rows <- do.call(rbind, lapply(stats, function(s) {
    data.frame(
      group1 = group, group1_level = s$arm, group2 = group2, group2_level = group2_level,
      variable = variable, variable_level = variable_level, context = context,
      stat_name = c("n", "N", "p", "events"),
      stat_label = c("n", "N", "%", "Events"),
      warning = NA_character_, error = NA_character_, stringsAsFactors = FALSE
    )
  }))
  arm_rows$stat <- unlist(lapply(stats, function(s) list(s$n, s$N, s$p, s$events)), recursive = FALSE)
  test_rows <- do.call(rbind, lapply(tests, function(t) {
    data.frame(
      group1 = "statistic", group1_level = t$level, group2 = group2, group2_level = group2_level,
      variable = variable, variable_level = variable_level, context = "hypothesis_test",
      stat_name = c("p_value", "p_value_fmt"),
      stat_label = c("Fisher's exact p-value", "Fisher's exact p-value (formatted)"),
      warning = NA_character_, error = NA_character_, stringsAsFactors = FALSE
    )
  }))
  test_rows$stat <- unlist(lapply(tests, function(t) list(t$p, fmt_fisher(t$p))), recursive = FALSE)
  rbind(arm_rows, test_rows)
}

#' The "ANY BODY SYSTEM" row: every record in the analysis data
ard_incidence_any <- function(data, spec, denominator) {
  group <- spec$group
  id <- spec$id %||% "USUBJID"
  arms <- arm_levels(denominator, group)
  stats <- incidence_stats(data, denominator, group, arms, id)
  tests <- fisher_rows(stats, spec$reference_arm %||% arms[[1]])
  row_block(stats, tests, variable = "ANY", variable_level = NA_character_, group = group, context = "subject_count")
}

#' One block per system organ class, then one per preferred term within it
ard_incidence_hierarchy <- function(data, spec, denominator) {
  group <- spec$group
  id <- spec$id %||% "USUBJID"
  hier <- spec$hierarchy
  arms <- arm_levels(denominator, group)
  reference <- spec$reference_arm %||% arms[[1]]
  out <- list()
  for (soc in sort(unique(as.character(data[[hier[1]]])))) {
    in_soc <- data[as.character(data[[hier[1]]]) == soc, , drop = FALSE]
    stats <- incidence_stats(in_soc, denominator, group, arms, id)
    out[[length(out) + 1]] <- row_block(stats, fisher_rows(stats, reference), hier[1], soc, group)
    for (pt in sort(unique(as.character(in_soc[[hier[2]]])))) {
      in_pt <- in_soc[as.character(in_soc[[hier[2]]]) == pt, , drop = FALSE]
      stats <- incidence_stats(in_pt, denominator, group, arms, id)
      out[[length(out) + 1]] <- row_block(stats, fisher_rows(stats, reference), hier[2], pt, group, group2 = hier[1], group2_level = soc)
    }
  }
  do.call(rbind, out)
}
