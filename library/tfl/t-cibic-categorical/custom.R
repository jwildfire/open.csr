# Display-specific statistics for the CIBIC+ categorical analysis.
#
# Two things the built-in vocabulary cannot do, both needed by this display.
#
# 1. ADQSCIBC stores CIBIC+ as a bare number in AVAL. It carries no AVALC and the
#    study's define.xml declares no code list for it, so `method: categorical`
#    would produce rows labelled "2", "3", "4". The seven category names are
#    stated in the study's statistical analysis plan (Appendix 1, §14.1.2):
#
#      1 = Marked improvement   2 = Moderate improvement   3 = Minimal improvement
#      4 = No change            5 = Minimal worsening      6 = Moderate worsening
#      7 = Marked worsening
#
#    They are transcribed here, once, and every category is reported at every
#    visit — including the ones nobody was scored in, which is information: at no
#    visit, in any arm, was a subject rated markedly improved or markedly worsened.
#    `method: categorical` would silently drop those rows.
#
# 2. The published table's p-value is a stratified Cochran-Mantel-Haenszel test.
#    No built-in method fits a model.
#
# Contract: each function receives (data, spec, denominator) and returns a
# {cards}-shaped ARD. `spec$group` holds the grouping variable in force.

#' The CIBIC+ seven-point scale, as the study's analysis plan defines it
#'
#' Ordered from best to worst outcome, which is the order the published table
#' prints and the order the display's `level_order` repeats.
#' @return A named character vector, score (as text) to category name.
cibic_categories <- function() {
  c(
    "1" = "Marked improvement",
    "2" = "Moderate improvement",
    "3" = "Minimal improvement",
    "4" = "No change",
    "5" = "Minimal worsening",
    "6" = "Moderate worsening",
    "7" = "Marked worsening"
  )
}

#' Category frequencies for one visit
#'
#' Percentages are of the subjects with a value AT THIS VISIT, not of the
#' efficacy analysis set — which is what the published table does, and why `N`
#' is reported per visit as well as per population.
#'
#' @param data Analysis dataset, already restricted to the analysis set and to
#'   the entry's `filter` (which carries the visit).
#' @param spec The analysis entry, including `spec$group`.
#' @param denominator Subject-level denominator (unused: the denominator of this
#'   table is the visit, not the population).
#' @return A data frame carrying the `{cards}` ARD columns.
ard_cibic_categories <- function(data, spec, denominator) {
  group <- spec$group
  if (!length(group)) {
    stop("The CIBIC+ categorical analysis needs a grouping variable.", call. = FALSE)
  }
  cats <- cibic_categories()
  score <- as.character(as.integer(data$AVAL))
  unknown <- setdiff(unique(score[!is.na(score)]), names(cats))
  if (length(unknown)) {
    stop(
      "CIBIC+ scores outside the seven-point scale the analysis plan defines: ",
      paste(sort(unknown), collapse = ", "), ".",
      call. = FALSE
    )
  }
  levels <- levels(data[[group]])
  if (is.null(levels)) levels <- sort(unique(as.character(data[[group]])))

  rows <- list()
  for (lv in levels) {
    in_group <- !is.na(data[[group]]) & as.character(data[[group]]) == lv
    n_visit <- sum(in_group)
    rows[[length(rows) + 1]] <- cat_row(
      group, lv, NA_character_, "N", n_visit, "Subjects with a value at this visit"
    )
    for (code in names(cats)) {
      n <- sum(in_group & !is.na(score) & score == code)
      rows[[length(rows) + 1]] <- cat_row(group, lv, cats[[code]], "n", n, "Subjects")
      rows[[length(rows) + 1]] <- cat_row(
        group, lv, cats[[code]], "p",
        if (n_visit > 0) n / n_visit else NA_real_, "Percent of subjects at this visit"
      )
    }
  }
  do.call(rbind, rows)
}

#' Stratified Cochran-Mantel-Haenszel test of the category distributions
#'
#' The published table footnotes this as an "overall comparison of treatments
#' using CMH test ... controlling for site group". Three CMH statistics answer to
#' that description and they do not agree; the one that reproduces the published
#' p-values at all three visits (0.2727, 0.4003, 0.6180) is the ROW MEAN SCORES
#' DIFFER statistic — the mean-score (ANOVA) statistic on 2 degrees of freedom,
#' with the CIBIC+ score itself as the score. The general-association statistic
#' on 8 degrees of freedom, which the footnote's parenthetical "(Pearson
#' Chi-Square)" would suggest, does not. Which of the two SAS printed is settled
#' by the numbers, and the qualification record carries all three so the choice
#' is inspectable rather than asserted.
#'
#' Implemented from the generalised Mantel-Haenszel definition rather than by
#' calling a test function, because [stats::mantelhaen.test()] computes only the
#' general-association statistic.
#'
#' @param data Analysis dataset, already restricted to the analysis set and the
#'   entry's `filter`.
#' @param spec The analysis entry, including `spec$group`.
#' @param denominator Subject-level denominator (unused).
#' @return A data frame carrying the `{cards}` ARD columns.
ard_cibic_cmh <- function(data, spec, denominator) {
  group <- spec$group
  if (!"SITEGR1" %in% names(data)) {
    stop("The CIBIC+ CMH test stratifies on SITEGR1, which the analysis dataset does not carry.", call. = FALSE)
  }
  levels <- levels(data[[group]])
  if (is.null(levels)) levels <- sort(unique(as.character(data[[group]])))
  scores <- sort(unique(as.integer(data$AVAL[!is.na(data$AVAL)])))

  tab <- table(
    factor(as.integer(data$AVAL), levels = scores),
    factor(as.character(data[[group]]), levels = levels),
    factor(as.character(data$SITEGR1))
  )
  res <- cmh_row_mean_scores(tab, scores)

  # One model-level statistic, printed once, in the last treatment column —
  # which is where the published table prints it.
  col <- levels[length(levels)]
  out <- rbind(
    cat_row(group, col, NA_character_, "pval", res[["p"]], "p-value (CMH, controlling for site group)"),
    cat_row(group, col, NA_character_, "chisq", res[["Q"]], "CMH statistic"),
    cat_row(group, col, NA_character_, "df", res[["df"]], "Degrees of freedom")
  )
  out$variable <- "CMH"
  out$context <- "cmh"
  out
}

#' Generalised Mantel-Haenszel "row mean scores differ" statistic
#'
#' @param tab A scores x groups x strata contingency table.
#' @param scores Numeric scores for the first dimension.
#' @return A named numeric vector with `Q`, `df` and `p`.
#' @noRd
cmh_row_mean_scores <- function(tab, scores) {
  R <- dim(tab)[1]
  C <- dim(tab)[2]
  K <- dim(tab)[3]
  if (C < 2) stop("The CMH test needs at least two treatment groups.", call. = FALSE)
  B <- matrix(as.numeric(scores), nrow = 1)
  Cm <- diag(C)[-C, , drop = FALSE]

  A <- 0
  E <- 0
  V <- 0
  for (k in seq_len(K)) {
    n <- matrix(tab[, , k], nrow = R, ncol = C)
    N <- sum(n)
    if (N < 2) next
    r <- rowSums(n)
    cc <- colSums(n)
    A <- A + kronecker(Cm, B) %*% as.vector(n)
    E <- E + kronecker(Cm %*% cc, B %*% r) / N
    VR <- B %*% (diag(r, nrow = R) - outer(r, r) / N) %*% t(B)
    VC <- Cm %*% (diag(cc, nrow = C) - outer(cc, cc) / N) %*% t(Cm)
    V <- V + kronecker(VC, VR) / (N - 1)
  }
  d <- A - E
  rank <- qr(V)$rank
  if (rank < ncol(V)) {
    stop(
      "The CMH covariance matrix is rank ", rank, " of ", ncol(V),
      "; the treatment groups are not separately estimable within site groups.",
      call. = FALSE
    )
  }
  Q <- drop(t(d) %*% solve(V, d))
  c(Q = Q, df = rank, p = stats::pchisq(Q, rank, lower.tail = FALSE))
}

#' Size of the analysis set in each treatment column
#'
#' Identical in intent to the function of the same name in the CIBIC+ summary
#' displays: the column heading is the efficacy analysis set, which is larger
#' than the number of subjects assessed at any one visit.
#'
#' @param data Analysis dataset (unused).
#' @param spec The analysis entry, including `spec$group`.
#' @param denominator Subject-level denominator, already restricted to the
#'   display's analysis set.
#' @return A data frame carrying the `{cards}` ARD columns.
ard_population_n <- function(data, spec, denominator) {
  group <- spec$group
  levels <- levels(denominator[[group]])
  if (is.null(levels)) levels <- sort(unique(as.character(denominator[[group]])))
  rows <- lapply(levels, function(lv) {
    sub <- denominator[as.character(denominator[[group]]) == lv, , drop = FALSE]
    cat_row(group, lv, NA_character_, "N", length(unique(sub$USUBJID)), "Subjects in the analysis set")
  })
  out <- do.call(rbind, rows)
  out$variable <- "POPULATION"
  out$context <- "population"
  out
}

#' One ARD row in the `{cards}` shape
#' @noRd
cat_row <- function(group, group_level, variable_level, stat_name, value, label) {
  data.frame(
    group1 = group,
    group1_level = group_level,
    variable = "CIBICCAT",
    variable_level = variable_level,
    context = "categorical",
    stat_name = stat_name,
    stat_label = label,
    stat = as.numeric(value),
    warning = NA_character_,
    error = NA_character_,
    stringsAsFactors = FALSE
  )
}
