#' Column set of the open.csr ARD row schema (contract §5)
#' @noRd
ard_row_cols <- function() {
  c(
    "analysis", "group1", "group1_level", "group2", "group2_level",
    "variable", "variable_level", "context", "stat_name", "stat_label",
    "stat", "warning", "error"
  )
}

#' Level label used for the total column
#' @noRd
total_label <- function() "Total"

#' Build an ARD from an analysis specification
#'
#' Interprets an ARS-aligned `analysis.yaml` (contract §2) into `{cards}` calls
#' and flattens the result into the open.csr ARD row schema (contract §5) — one
#' row per computed statistic, carrying the `analysis` name that produced it and
#' `{cards}`' per-statistic `warning`/`error` strings as data.
#'
#' Each entry in `analyses` is evaluated independently against the analysis
#' dataset, restricted to the analysis set and to the entry's optional `filter`
#' expression. When the spec sets `total: true`, every analysis is evaluated a
#' second time with a constant grouping column so the total column is an
#' ordinary group level rather than a rendering special case.
#'
#' @param spec Validated analysis spec (see [read_analysis_spec()]).
#' @param data Prepared data list (see [prepare_data()]).
#' @param custom_env Environment holding the display's `custom.R` functions, or
#'   `NULL`. Supply a directory path to source `custom.R` from it.
#'
#' @return A tibble in the ARD row schema. `stat` is a list column so
#'   list-valued statistics survive to JSON as arrays.
#' @export
build_ard <- function(spec, data, custom_env = NULL) {
  spec <- validate_analysis_spec(spec)
  if (is.character(custom_env)) custom_env <- source_custom(custom_env)
  if (!spec$dataset %in% names(data)) {
    stop("Prepared data has no dataset '", spec$dataset, "'.", call. = FALSE)
  }
  if (!spec$denominator %in% names(data)) {
    stop("Prepared data has no denominator dataset '", spec$denominator, "'.", call. = FALSE)
  }

  base_data <- apply_analysis_set(data[[spec$dataset]], spec$analysis_set)
  denom <- apply_analysis_set(data[[spec$denominator]], spec$analysis_set)
  group <- spec$group

  pieces <- list()
  for (a in spec$analyses) {
    adata <- apply_filter(base_data, a$filter, a$name)
    pieces[[length(pieces) + 1]] <-
      run_analysis(a, adata, denom, group, custom_env)
    if (spec$total && a$method != "listing") {
      pieces[[length(pieces) + 1]] <-
        run_analysis_total(a, adata, denom, group, custom_env)
    }
  }
  out <- do.call(rbind, pieces)
  out <- tibble::as_tibble(out)
  out[, ard_row_cols()]
}

#' Evaluate an analysis entry's `filter` expression
#' @noRd
apply_filter <- function(df, filter, name) {
  if (is.null(filter) || identical(filter, "") || isTRUE(is.na(filter))) {
    return(df)
  }
  keep <- tryCatch(
    eval(parse(text = filter), envir = df, enclos = parent.frame()),
    error = function(e) {
      stop(
        "analysis '", name, "': could not evaluate filter `", filter, "`: ",
        conditionMessage(e),
        call. = FALSE
      )
    }
  )
  if (!is.logical(keep) || length(keep) != nrow(df)) {
    stop("analysis '", name, "': filter `", filter, "` must yield one logical per row.", call. = FALSE)
  }
  df[!is.na(keep) & keep, , drop = FALSE]
}

#' Dispatch one analysis entry to its method implementation
#' @noRd
run_analysis <- function(a, adata, denom, group, custom_env) {
  if (!is.null(a$custom)) {
    return(run_custom(a, adata, denom, group, custom_env))
  }
  ard <- switch(a$method,
    continuous = method_continuous(a, adata, group),
    categorical = method_categorical(a, adata, group),
    subject_count = method_subject_count(a, adata, denom, group),
    hierarchical_count = method_hierarchical_count(a, adata, denom, group),
    listing = return(method_listing(a, adata)),
    stop("Method '", a$method, "' has no built-in implementation; use `custom:`.", call. = FALSE)
  )
  ard_to_rows(ard, a$name)
}

#' Evaluate an analysis a second time to produce the total column
#'
#' A constant column is added to both the analysis dataset and the denominator
#' so that the total is computed by exactly the same code path as the treatment
#' columns; only the group label differs.
#' @noRd
run_analysis_total <- function(a, adata, denom, group, custom_env) {
  const <- ".opencsr_total"
  adata[[const]] <- total_label()
  denom[[const]] <- total_label()
  rows <- run_analysis(a, adata, denom, const, custom_env)
  rows$group1 <- if (length(group)) group else NA_character_
  rows$group1_level <- ifelse(rows$group1_level == const, total_label(), rows$group1_level)
  rows$group1_level[is.na(rows$group1_level)] <- total_label()
  rows
}

#' Source a display's `custom.R` into a fresh environment
#' @noRd
source_custom <- function(dir) {
  path <- if (grepl("\\.R$", dir)) dir else file.path(dir, "custom.R")
  if (!file.exists(path)) {
    return(NULL)
  }
  env <- new.env(parent = globalenv())
  sys.source(path, envir = env)
  env
}

#' Call a display-specific statistic function
#'
#' Contract §2: the function receives `(data, spec, denominator)` and returns a
#' `{cards}` ARD (or any data frame carrying the `{cards}` columns).
#' @noRd
run_custom <- function(a, adata, denom, group, custom_env) {
  if (is.null(custom_env) || !exists(a$custom, envir = custom_env, inherits = FALSE)) {
    stop(
      "analysis '", a$name, "' requests custom function '", a$custom,
      "', which was not found in the display's custom.R.",
      call. = FALSE
    )
  }
  fn <- get(a$custom, envir = custom_env, inherits = FALSE)
  spec <- a
  spec$group <- group
  ard <- fn(adata, spec, denom)
  if (!is.data.frame(ard)) {
    stop("custom function '", a$custom, "' must return a data frame / cards ARD.", call. = FALSE)
  }
  ard_to_rows(ard, a$name)
}

# ---- method implementations -------------------------------------------------

#' `continuous`: N, mean, sd, median, q1, q3, min, max
#' @noRd
method_continuous <- function(a, adata, group) {
  ard <- if (length(group)) {
    cards::ard_continuous(
      adata,
      by = dplyr::all_of(group), variables = dplyr::all_of(a$variables)
    )
  } else {
    cards::ard_continuous(adata, variables = dplyr::all_of(a$variables))
  }
  if (length(a$statistics)) {
    ard <- ard[ard$stat_name %in% as.character(a$statistics), , drop = FALSE]
  }
  ard
}

#' `categorical`: n and percent by level
#' @noRd
method_categorical <- function(a, adata, group) {
  if (length(group)) {
    cards::ard_categorical(
      adata,
      by = dplyr::all_of(group), variables = dplyr::all_of(a$variables)
    )
  } else {
    cards::ard_categorical(adata, variables = dplyr::all_of(a$variables))
  }
}

#' `subject_count`: unique subjects meeting the filter, over a subject-level denominator
#'
#' The count is computed on the denominator dataset with a derived logical flag
#' so that the denominator is always the analysis-set subject count, never the
#' number of records in the event dataset.
#' @noRd
method_subject_count <- function(a, adata, denom, group) {
  id <- a$id %||% "USUBJID"
  flag_var <- ".opencsr_flag"
  denom[[flag_var]] <- denom[[id]] %in% unique(adata[[id]])
  ard <- if (length(group)) {
    cards::ard_dichotomous(
      denom,
      by = dplyr::all_of(group), variables = dplyr::all_of(flag_var),
      value = stats::setNames(list(TRUE), flag_var)
    )
  } else {
    cards::ard_dichotomous(
      denom,
      variables = dplyr::all_of(flag_var),
      value = stats::setNames(list(TRUE), flag_var)
    )
  }
  ard$variable <- a$variable %||% a$name
  ard$variable_level <- rep(list("Y"), nrow(ard))
  ard$context <- "subject_count"
  ard
}

#' `hierarchical_count`: subject counts nested by a variable hierarchy
#' @noRd
method_hierarchical_count <- function(a, adata, denom, group) {
  id <- a$id %||% "USUBJID"
  if (length(group)) {
    cards::ard_stack_hierarchical(
      data = adata,
      variables = dplyr::all_of(a$hierarchy),
      by = dplyr::all_of(group),
      denominator = denom,
      id = dplyr::all_of(id)
    )
  } else {
    cards::ard_stack_hierarchical(
      data = adata,
      variables = dplyr::all_of(a$hierarchy),
      denominator = denom,
      id = dplyr::all_of(id)
    )
  }
}

#' `listing`: row passthrough of `variables`
#'
#' Each record becomes one ARD row per listed variable, addressed by a record
#' index in `group1_level`, so a listing serialises into the same schema as a
#' summary table and needs no second serialiser.
#' @noRd
method_listing <- function(a, adata) {
  vars <- a$variables
  missing <- setdiff(vars, names(adata))
  if (length(missing)) {
    stop("analysis '", a$name, "': listing variables not in data: ", paste(missing, collapse = ", "), call. = FALSE)
  }
  if (length(a$sort)) {
    ord <- do.call(order, lapply(as.character(a$sort), function(v) adata[[v]]))
    adata <- adata[ord, , drop = FALSE]
  }
  n <- nrow(adata)
  if (n == 0) {
    return(empty_rows(a$name))
  }
  idx <- rep(seq_len(n), times = length(vars))
  var <- rep(vars, each = n)
  values <- unlist(lapply(vars, function(v) as.character(adata[[v]])), use.names = FALSE)
  data.frame(
    analysis = a$name,
    group1 = "record",
    group1_level = formatC(idx, width = 4, flag = "0"),
    group2 = NA_character_,
    group2_level = NA_character_,
    variable = var,
    variable_level = NA_character_,
    context = "listing",
    stat_name = "value",
    stat_label = var,
    stringsAsFactors = FALSE
  ) |>
    transform(stat = I(as.list(values)), warning = NA_character_, error = NA_character_)
}

#' Zero-row frame in the ARD row schema
#' @noRd
empty_rows <- function(analysis) {
  out <- data.frame(
    analysis = character(0), group1 = character(0), group1_level = character(0),
    group2 = character(0), group2_level = character(0), variable = character(0),
    variable_level = character(0), context = character(0), stat_name = character(0),
    stat_label = character(0), warning = character(0), error = character(0),
    stringsAsFactors = FALSE
  )
  out$stat <- list()
  out[, ard_row_cols()]
}

# ---- flattening -------------------------------------------------------------

#' Flatten a `{cards}` ARD into the open.csr row schema
#'
#' `{cards}` stores levels, statistics and conditions in list columns and
#' formatting closures in `fmt_fun`, which do not serialise (design decision
#' D5). This drops the closures, coerces levels and conditions to strings, keeps
#' `stat` as a list column and stamps the originating analysis name.
#' @noRd
ard_to_rows <- function(ard, analysis_name) {
  df <- as.data.frame(ard)
  if (nrow(df) == 0) {
    return(empty_rows(analysis_name))
  }
  get_chr <- function(nm) {
    if (!nm %in% names(df)) {
      return(rep(NA_character_, nrow(df)))
    }
    list_col_chr(df[[nm]])
  }
  stat <- df$stat
  if (!is.list(stat)) stat <- as.list(stat)
  stat <- lapply(stat, function(x) if (is.null(x) || length(x) == 0) NA else x)

  out <- data.frame(
    analysis = rep(analysis_name, nrow(df)),
    group1 = get_chr("group1"),
    group1_level = get_chr("group1_level"),
    group2 = get_chr("group2"),
    group2_level = get_chr("group2_level"),
    variable = get_chr("variable"),
    variable_level = get_chr("variable_level"),
    context = get_chr("context"),
    stat_name = get_chr("stat_name"),
    stat_label = get_chr("stat_label"),
    warning = get_chr("warning"),
    error = get_chr("error"),
    stringsAsFactors = FALSE
  )
  out$stat <- stat
  out[, ard_row_cols()]
}

#' Resolve a binding address against an ARD
#'
#' Implements the binding address of contract §5 —
#' `<analysis>:<stat_name>[;group=<level>][;variable_level=<level>]` — used by
#' text blocks. Errors unless exactly one row matches, so an orphaned binding is
#' a loud build failure rather than a stale sentence.
#'
#' @param ard ARD rows (tibble) or the list returned by [read_ard()].
#' @param address Binding address string.
#' @return The matching row's `stat`, unlisted.
#' @examples
#' \dontrun{
#' ard_binding(read_ard("outputs/t-ae-overview/v001/ard.json"), "any_ae:n;group=Placebo")
#' }
#' @export
ard_binding <- function(ard, address) {
  rows <- if (is.list(ard) && !is.data.frame(ard) && !is.null(ard$rows)) ard$rows else ard
  parts <- strsplit(address, ";", fixed = TRUE)[[1]]
  head_parts <- strsplit(parts[1], ":", fixed = TRUE)[[1]]
  if (length(head_parts) != 2) {
    stop("Binding address must start with `<analysis>:<stat_name>`; got '", address, "'.", call. = FALSE)
  }
  keep <- rows$analysis == head_parts[1] & rows$stat_name == head_parts[2]
  for (p in parts[-1]) {
    kv <- strsplit(p, "=", fixed = TRUE)[[1]]
    key <- switch(kv[1],
      group = "group1_level",
      variable_level = "variable_level",
      variable = "variable",
      kv[1]
    )
    keep <- keep & !is.na(rows[[key]]) & rows[[key]] == kv[2]
  }
  hit <- rows[keep, , drop = FALSE]
  if (nrow(hit) != 1) {
    stop(
      "Binding '", address, "' resolved ", nrow(hit),
      " ARD rows; exactly one is required.",
      call. = FALSE
    )
  }
  unlist(hit$stat[[1]])
}
