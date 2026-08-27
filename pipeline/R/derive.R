#' Reduce an analysis dataset to one record per subject
#'
#' Some endpoints are not a statistic *of* a record — they are a statistic of a
#' subject, computed across that subject's records, and only then summarised.
#' CDISCPILOT01's secondary efficacy endpoint is the worked example: the SAP
#' (section 10.2.1) defines it as "the mean of all available total scores
#' between Weeks 4 and 24, inclusive", one number per subject, which the ANCOVA
#' then treats as the response.
#'
#' Expressing that as a `filter:` is impossible — a filter selects records, and
#' this endpoint has to *collapse* them — so it is declared as a `derive:` block
#' on the analysis entry and applied here, before any statistic is computed:
#'
#' \preformatted{
#' derive:
#'   statistic: mean        # mean, median, sum, min, max, first, last
#'   value: AVAL            # the column collapsed
#'   id: USUBJID            # one output record per distinct value of this
#'   carry: [TRTP, BASE]    # columns copied through, checked constant
#' }
#'
#' `carry` is checked, not trusted. A column that is not constant within a
#' subject cannot be copied onto that subject's single output record without
#' choosing a value silently, so a non-constant carry column is an error. That
#' is the difference between a derivation and a coincidence: if `BASE` varied
#' within a subject, the covariate in the model below would depend on record
#' order, and nothing downstream would ever say so.
#'
#' @param data The analysis dataset, already restricted to the analysis set and
#'   to the analysis entry's `filter`.
#' @param spec The analysis entry, carrying the `derive` block described above.
#'
#' @return A data frame with one row per `id`, holding the collapsed `value`
#'   column (under its original name) and every `carry` column.
#' @examples
#' \dontrun{
#' derive_subject_summary(weeks_4_24, list(
#'   derive = list(statistic = "mean", value = "AVAL", carry = c("TRTP", "BASE"))
#' ))
#' }
#' @export
derive_subject_summary <- function(data, spec) {
  d <- spec$derive
  if (!length(d)) {
    stop(
      "derive_subject_summary(): analysis '", spec$name %||% "<unnamed>",
      "' has no `derive:` block.",
      call. = FALSE
    )
  }
  stat <- as.character(d$statistic %||% "mean")
  value <- as.character(d$value %||% "AVAL")
  id <- as.character(d$id %||% "USUBJID")
  carry <- unique(c(as.character(spec$group %||% character(0)), as.character(d$carry %||% character(0))))
  carry <- setdiff(carry, c(id, value))

  fn <- switch(stat,
    mean = function(x) mean(x, na.rm = TRUE),
    median = function(x) stats::median(x, na.rm = TRUE),
    sum = function(x) sum(x, na.rm = TRUE),
    min = function(x) min(x, na.rm = TRUE),
    max = function(x) max(x, na.rm = TRUE),
    first = function(x) x[1],
    last = function(x) x[length(x)],
    stop(
      "derive_subject_summary(): unknown `derive.statistic` '", stat,
      "'. Known: mean, median, sum, min, max, first, last.",
      call. = FALSE
    )
  )

  df <- as.data.frame(data)
  missing <- setdiff(unique(c(id, value, carry)), names(df))
  if (length(missing)) {
    stop(
      "derive_subject_summary(): the analysis dataset has no column(s): ",
      paste(missing, collapse = ", "), ".",
      call. = FALSE
    )
  }
  if (!nrow(df)) {
    stop("derive_subject_summary(): no records to derive from.", call. = FALSE)
  }

  keys <- as.character(df[[id]])
  ord <- unique(keys)
  split_val <- split(df[[value]], factor(keys, levels = ord))
  derived <- vapply(split_val, function(x) as.numeric(fn(x[!is.na(x)])), numeric(1))
  n_used <- vapply(split_val, function(x) sum(!is.na(x)), numeric(1))

  # Carry columns are copied from each subject's first record, so the value
  # keeps its original type exactly (a factor stays a factor, a labelled column
  # keeps its label) rather than being rebuilt through a coercing template.
  first_idx <- match(ord, keys)
  out <- data.frame(stats::setNames(list(ord), id), stringsAsFactors = FALSE)
  for (cl in carry) {
    vals <- split(df[[cl]], factor(keys, levels = ord))
    varying <- vapply(vals, function(x) length(unique(x[!is.na(x)])) > 1, logical(1))
    if (any(varying)) {
      stop(
        "derive_subject_summary(): `carry` column '", cl, "' is not constant within ",
        id, " for ", sum(varying), " subject(s) (first: ", ord[which(varying)[1]],
        "). A derived subject record cannot carry a value that varies inside it.",
        call. = FALSE
      )
    }
    out[[cl]] <- df[[cl]][first_idx]
  }
  out[[value]] <- unname(derived)
  out[[".opencsr_n_derived"]] <- unname(n_used)
  rownames(out) <- NULL
  out
}

#' Summary statistics of a per-subject derived value
#'
#' [derive_subject_summary()] followed by the ordinary `continuous` method, so
#' a derived endpoint is summarised by the same `{cards}` call as any other
#' variable and reaches the ARD in the same shape.
#'
#' @inheritParams derive_subject_summary
#' @param denominator Ignored; present for the `custom.R` calling contract.
#' @return A data frame in the `{cards}` ARD shape.
#' @examples
#' \dontrun{
#' ard_derived_continuous(weeks_4_24, spec)
#' }
#' @export
ard_derived_continuous <- function(data, spec, denominator = NULL) {
  derived <- derive_subject_summary(data, spec)
  value <- as.character(spec$derive$value %||% "AVAL")
  group <- as.character(spec$group %||% character(0))
  a <- spec
  a$variables <- value
  method_continuous(a, derived, group)
}

#' ANCOVA of a per-subject derived value
#'
#' [derive_subject_summary()] followed by [ard_ancova()]. The model terms are
#' declared in the display's `analysis.yaml` exactly as they are for an
#' underived endpoint; the only difference is that the response is one number
#' per subject rather than one per record.
#'
#' @inheritParams derive_subject_summary
#' @param denominator Ignored; present for the `custom.R` calling contract.
#' @return A data frame in the `{cards}` ARD shape.
#' @examples
#' \dontrun{
#' ard_derived_ancova(weeks_4_24, spec)
#' }
#' @export
ard_derived_ancova <- function(data, spec, denominator = NULL) {
  ard_ancova(derive_subject_summary(data, spec), spec, denominator)
}
