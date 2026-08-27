#' Built-in cell format patterns
#'
#' Patterns are `{stat_name}` templates. `display.yaml`'s `format:` block adds
#' to or overrides them (contract §3), which keeps precision and presentation
#' declarative and therefore diffable — closures never enter a spec.
#' @noRd
default_patterns <- function() {
  list(
    n = "{n}",
    N = "{N}",
    n_pct = "{n} ({p}%)",
    pct = "{p}%",
    continuous = "{mean} ({sd})",
    mean_sd = "{mean} ({sd})",
    median = "{median}",
    median_range = "{median} ({min}, {max})",
    range = "{min}, {max}",
    q1_q3 = "{p25}, {p75}",
    value = "{value}"
  )
}

#' Format one statistic for display
#'
#' Applies the display's digit plan (falling back to the collected-precision
#' conventions in [default_digits()]) and half-up rounding. Statistics that
#' `{cards}` reports as proportions are scaled to percent, and a p-value too
#' small (or too large) to print at its declared precision is reported at the
#' boundary rather than rounded through it — see [format_pvalue_bound()].
#'
#' @param value Statistic value.
#' @param stat_name Statistic name.
#' @param digits Named list/vector of decimals by statistic name.
#' @param proportions Statistic names stored as proportions in \[0, 1\] and
#'   shown as percentages. Defaults to what `{cards}` produces; a display whose
#'   `custom.R` emits further proportions declares them in `display.yaml`'s
#'   `format.proportions` rather than pre-scaling them in the ARD, so the ARD
#'   keeps the statistic and the display keeps the presentation.
#'
#' @return A length-one character vector.
#' @examples
#' format_stat(0.3385827, "p")   # "33.9"
#' format_stat(8.5865, "sd")     # "8.59"
#' format_stat(8.2e-14, "pval", list(pval = 4)) # "<0.0001"
#' @export
format_stat <- function(value, stat_name, digits = list(), proportions = proportion_stats()) {
  if (is.null(value) || length(value) == 0) {
    return(NA_character_)
  }
  if (length(value) > 1) {
    return(paste(
      vapply(value, format_stat, character(1),
        stat_name = stat_name, digits = digits, proportions = proportions
      ),
      collapse = ", "
    ))
  }
  if (is.na(value)) {
    return(NA_character_)
  }
  if (!is.numeric(value)) {
    return(as.character(value))
  }
  if (stat_name %in% proportions) value <- value * 100
  d <- digits[[stat_name]]
  if (is.null(d)) d <- default_digits(stat_name)
  d <- as.integer(d)
  if (stat_name %in% pvalue_stats()) {
    bound <- format_pvalue_bound(value, d)
    if (!is.na(bound)) {
      return(bound)
    }
  }
  formatC(round_half_up(value, d), format = "f", digits = d, big.mark = "")
}

#' Report a p-value at the boundary of its declared precision
#'
#' Rounding is the right treatment for a measurement and the wrong treatment for
#' a tail probability. A log-rank p-value of 8.2e-14 rounded to four decimals
#' prints `0.0000`, which asserts that the probability is zero; it is not, and no
#' statistic in a clinical study report should read as though it were. The
#' convention regulatory tables use instead is to print the boundary — `<0.0001`
#' — and this function applies it, symmetrically, at whatever precision the
#' display declared. `>0.9999` is the same statement at the other end.
#'
#' This is presentation, not arithmetic: the ARD keeps the unrounded probability
#' and only the rendered cell changes, so the number remains addressable and a
#' bound never enters a computation.
#'
#' Which statistics are p-values is a naming convention, listed in
#' [pvalue_stats()]. `p` is deliberately not among them — the engine already
#' treats that name as a proportion and scales it to percent.
#'
#' @param value A p-value.
#' @param digits Decimals the display declared for it.
#' @return The boundary string, or `NA_character_` when the value prints
#'   faithfully at that precision.
#' @noRd
format_pvalue_bound <- function(value, digits) {
  if (is.na(digits) || digits < 1) {
    return(NA_character_)
  }
  smallest <- 10^(-digits)
  if (value > 0 && value < smallest) {
    return(paste0("<", formatC(smallest, format = "f", digits = digits)))
  }
  if (value < 1 && (1 - value) < smallest) {
    return(paste0(">", formatC(1 - smallest, format = "f", digits = digits)))
  }
  NA_character_
}

#' Render an ARD into a display
#'
#' Consumes an ARD (contract §5) and a display specification (contract §3) and
#' produces a self-contained `{gt}` HTML table. Display code never touches
#' subject-level data — the ARD is the only input — which is what allows the
#' in-text and post-text variants to be provably the same numbers.
#'
#' @param ard ARD rows, or the list returned by [read_ard()].
#' @param display_spec Validated display spec (see [read_display_spec()]).
#' @param variant Variant name; `post_text` (full display) or `in_text`
#'   (reduced narrative variant), or any variant declared in the spec.
#'
#' @return An object of class `opencsr_display`: a list with `html` (a complete
#'   standalone document), `table` (the rendered cell tibble), `gt`, `columns`,
#'   `title` and `variant`.
#' @export
render_display <- function(ard, display_spec, variant = "post_text") {
  rows <- if (is.list(ard) && !is.data.frame(ard) && !is.null(ard$rows)) ard$rows else ard
  display_spec <- validate_display_spec(display_spec)
  if (!variant %in% names(display_spec$variants)) {
    stop(
      "Display '", display_spec$id, "' declares no variant '", variant,
      "'; available: ", paste(names(display_spec$variants), collapse = ", "), ".",
      call. = FALSE
    )
  }
  vcfg <- display_spec$variants[[variant]] %||% list()
  patterns <- utils::modifyList(
    default_patterns(),
    display_spec$format[setdiff(names(display_spec$format), c("digits", "proportions"))]
  )
  digits <- display_spec$format$digits
  proportions <- as.character(display_spec$format$proportions %||% proportion_stats())

  is_listing <- nrow(rows) > 0 && all(rows$context == "listing")
  body <- if (is_listing) {
    listing_body(rows, display_spec, digits)
  } else {
    table_body(rows, display_spec, vcfg, patterns, digits, proportions)
  }

  title <- vcfg$title %||% display_spec$title
  gt_tbl <- build_gt(body, display_spec, vcfg, title, variant)
  figure <- figure_svg(rows, display_spec, vcfg)
  html <- standalone_html(gt_tbl, title, display_spec, variant, figure)

  structure(
    list(
      html = html,
      table = body$table,
      gt = gt_tbl,
      figure = figure,
      columns = body$columns,
      title = title,
      variant = variant,
      id = display_spec$id
    ),
    class = "opencsr_display"
  )
}

#' @export
print.opencsr_display <- function(x, ...) {
  cat("<opencsr_display>", x$id, "/", x$variant, "-", nrow(x$table), "rows\n")
  print(as.data.frame(x$table))
  invisible(x)
}

# ---- column plan ------------------------------------------------------------

#' Determine the display columns and their header counts
#' @noRd
display_columns <- function(rows, display_spec) {
  present <- unique(rows$group1_level[!is.na(rows$group1_level) & rows$group1 != "record"])
  order <- as.character(display_spec$columns$order %||% character(0))
  cols <- if (length(order)) order[order %in% present] else present
  if (!length(cols)) cols <- present
  counts <- vapply(cols, function(cl) {
    cand <- rows$stat[rows$stat_name == "N" & !is.na(rows$group1_level) & rows$group1_level == cl]
    if (!length(cand)) {
      return(NA_real_)
    }
    suppressWarnings(max(unlist(cand), na.rm = TRUE))
  }, numeric(1))
  list(levels = cols, n = counts)
}

# ---- row plan ---------------------------------------------------------------

#' Expand the declared row plan into concrete display rows
#' @noRd
expand_rows <- function(rows, display_spec, vcfg) {
  plan <- display_spec$rows
  if (!length(plan)) plan <- auto_row_plan(rows)
  min_pct <- vcfg$filter$min_pct
  out <- list()
  for (r in plan) {
    if (isTRUE(r$section)) {
      out[[length(out) + 1]] <- plan_row(
        label = r$label %||% "", section = TRUE, indent = r$indent %||% 0
      )
      next
    }
    if (identical(r$type, "hierarchical")) {
      out <- c(out, expand_hierarchical(rows, r, min_pct))
      next
    }
    if (identical(r$levels, "all")) {
      out <- c(out, expand_levels(rows, r, min_pct))
      next
    }
    out[[length(out) + 1]] <- plan_row(
      label = r$label %||% r$level %||% r$variable %||% r$analysis,
      analysis = r$analysis, variable = r$variable, variable_level = r$level,
      pattern = r$pattern %||% "n_pct", indent = r$indent %||% 0,
      digits = r$digits, na_text = r$na_text
    )
  }
  out <- drop_empty_sections(out)
  do.call(rbind, out)
}

#' One planned display row
#' @noRd
plan_row <- function(label, analysis = NA_character_, variable = NA_character_,
                     variable_level = NA_character_, group2_level = NA_character_,
                     pattern = NA_character_, indent = 0, section = FALSE,
                     digits = list(), na_text = NA_character_) {
  out <- data.frame(
    label = label, analysis = analysis %||% NA_character_,
    variable = variable %||% NA_character_,
    variable_level = variable_level %||% NA_character_,
    group2_level = group2_level %||% NA_character_,
    pattern = pattern %||% NA_character_,
    indent = as.integer(indent), section = section,
    na_text = na_text %||% NA_character_,
    stringsAsFactors = FALSE
  )
  out$digits <- list(digits %||% list())
  out
}

#' Expand `levels: all` into one row per observed level
#' @noRd
expand_levels <- function(rows, r, min_pct) {
  cand <- rows[rows$analysis == r$analysis, , drop = FALSE]
  if (!is.null(r$variable)) cand <- cand[cand$variable == r$variable, , drop = FALSE]
  levs <- unique(cand$variable_level[!is.na(cand$variable_level)])
  if (length(r$level_order)) {
    declared <- as.character(r$level_order)
    levs <- c(declared[declared %in% levs], setdiff(levs, declared))
  }
  keep <- vapply(levs, function(lv) {
    passes_threshold(cand[cand$variable_level == lv, , drop = FALSE], min_pct)
  }, logical(1))
  levs <- levs[keep]
  lapply(levs, function(lv) {
    plan_row(
      label = paste0(lv), analysis = r$analysis, variable = r$variable,
      variable_level = lv, pattern = r$pattern %||% "n_pct",
      indent = r$indent %||% 1, digits = r$digits
    )
  })
}

#' Expand a `hierarchical_count` analysis into nested SOC / PT rows
#'
#' Sorting and thresholding happen here, on the ARD, so the in-text variant is
#' a filtered view of exactly the same numbers as the post-text variant.
#' @noRd
expand_hierarchical <- function(rows, r, min_pct) {
  cand <- rows[rows$analysis == r$analysis & rows$context == "hierarchical", , drop = FALSE]
  hier <- as.character(r$levels %||% character(0))
  if (length(hier) < 2) {
    stop("hierarchical row plan needs `levels: [outer, inner]`.", call. = FALSE)
  }
  outer_rows <- cand[cand$variable == hier[1], , drop = FALSE]
  inner_rows <- cand[cand$variable == hier[2], , drop = FALSE]
  outers <- unique(outer_rows$variable_level)
  outers <- outers[order(-vapply(outers, function(o) {
    total_n(outer_rows[outer_rows$variable_level == o, , drop = FALSE])
  }, numeric(1)), outers)]

  out <- list()
  for (o in outers) {
    inner_o <- inner_rows[!is.na(inner_rows$group2_level) & inner_rows$group2_level == o, , drop = FALSE]
    inners <- unique(inner_o$variable_level)
    inners <- inners[order(-vapply(inners, function(p) {
      total_n(inner_o[inner_o$variable_level == p, , drop = FALSE])
    }, numeric(1)), inners)]
    inners <- inners[vapply(inners, function(p) {
      passes_threshold(inner_o[inner_o$variable_level == p, , drop = FALSE], min_pct)
    }, logical(1))]
    if (!length(inners)) next
    out[[length(out) + 1]] <- plan_row(
      label = o, analysis = r$analysis, variable = hier[1], variable_level = o,
      pattern = r$pattern %||% "n_pct", indent = 0
    )
    for (p in inners) {
      out[[length(out) + 1]] <- plan_row(
        label = p, analysis = r$analysis, variable = hier[2], variable_level = p,
        group2_level = o, pattern = r$pattern %||% "n_pct", indent = 1
      )
    }
  }
  out
}

#' Largest subject count across group levels, used for descending sorts
#' @noRd
total_n <- function(df) {
  v <- unlist(df$stat[df$stat_name == "n"])
  if (!length(v)) {
    return(0)
  }
  max(v, na.rm = TRUE)
}

#' Does any treatment column reach the variant's percentage threshold?
#'
#' The `Total` column is excluded so a threshold means "reached in at least one
#' treatment group", the convention used in AE tables.
#' @noRd
passes_threshold <- function(df, min_pct) {
  if (is.null(min_pct)) {
    return(TRUE)
  }
  keep <- df$stat_name == "p" & (is.na(df$group1_level) | df$group1_level != total_label())
  v <- unlist(df$stat[keep])
  if (!length(v)) {
    return(FALSE)
  }
  max(v, na.rm = TRUE) * 100 >= as.numeric(min_pct)
}

#' Drop section headings left with no data rows beneath them
#' @noRd
drop_empty_sections <- function(out) {
  keep <- rep(TRUE, length(out))
  for (i in seq_along(out)) {
    if (!isTRUE(out[[i]]$section)) next
    nxt <- if (i < length(out)) out[[i + 1]] else NULL
    if (is.null(nxt) || isTRUE(nxt$section)) keep[i] <- FALSE
  }
  out[keep]
}

#' Fallback row plan when `display.yaml` declares none
#' @noRd
auto_row_plan <- function(rows) {
  plan <- list()
  for (a in unique(rows$analysis)) {
    sub <- rows[rows$analysis == a, , drop = FALSE]
    ctx <- sub$context[1]
    for (v in unique(sub$variable)) {
      vs <- sub[sub$variable == v, , drop = FALSE]
      plan[[length(plan) + 1]] <- list(label = v, section = TRUE)
      if (ctx == "continuous") {
        for (pat in c("n", "mean_sd", "median", "range")) {
          plan[[length(plan) + 1]] <- list(
            analysis = a, variable = v, pattern = pat, indent = 1,
            label = switch(pat, n = "n", mean_sd = "Mean (SD)", median = "Median", range = "Min, Max")
          )
        }
      } else {
        plan[[length(plan) + 1]] <- list(analysis = a, variable = v, levels = "all", pattern = "n_pct", indent = 1)
      }
    }
  }
  plan
}

# ---- cell computation -------------------------------------------------------

#' Build the rendered table body for a summary display
#' @noRd
table_body <- function(rows, display_spec, vcfg, patterns, digits,
                       proportions = proportion_stats()) {
  cols <- display_columns(rows, display_spec)
  plan <- expand_rows(rows, display_spec, vcfg)
  if (is.null(plan) || nrow(plan) == 0) {
    stop("Display '", display_spec$id, "' produced no rows.", call. = FALSE)
  }
  cells <- matrix("", nrow = nrow(plan), ncol = length(cols$levels))
  for (i in seq_len(nrow(plan))) {
    if (isTRUE(plan$section[i])) next
    for (j in seq_along(cols$levels)) {
      cells[i, j] <- cell_value(rows, plan[i, ], cols$levels[j], patterns, digits, proportions)
    }
  }
  tbl <- tibble::tibble(label = indent_label(plan$label, plan$indent))
  for (j in seq_along(cols$levels)) {
    tbl[[paste0("col", j)]] <- cells[, j]
  }
  list(table = tbl, columns = cols, plan = plan)
}

#' Prefix labels with non-breaking spaces to encode indentation
#'
#' Non-breaking spaces survive HTML whitespace collapsing, so indentation is
#' preserved in the rendered table without a stylesheet rule.
#' @noRd
indent_label <- function(label, indent) {
  paste0(strrep("\u00a0\u00a0\u00a0", indent), label)
}

#' Compute one cell by substituting formatted statistics into a pattern
#' @noRd
cell_value <- function(rows, plan_row, col_level, patterns, digits,
                       proportions = proportion_stats()) {
  keep <- rows$analysis == plan_row$analysis &
    !is.na(rows$group1_level) & rows$group1_level == col_level
  if (!is.na(plan_row$variable)) keep <- keep & rows$variable == plan_row$variable
  if (!is.na(plan_row$variable_level)) {
    keep <- keep & !is.na(rows$variable_level) & rows$variable_level == plan_row$variable_level
  }
  if (!is.na(plan_row$group2_level)) {
    keep <- keep & !is.na(rows$group2_level) & rows$group2_level == plan_row$group2_level
  }
  sub <- rows[keep, , drop = FALSE]
  if (nrow(sub) == 0) {
    return("")
  }
  digits <- utils::modifyList(as.list(digits), as.list(plan_row$digits[[1]] %||% list()))
  pattern <- patterns[[plan_row$pattern]] %||% plan_row$pattern
  needed <- regmatches(pattern, gregexpr("\\{[^}]+\\}", pattern))[[1]]
  out <- pattern
  for (tok in needed) {
    nm <- substr(tok, 2, nchar(tok) - 1)
    hit <- sub$stat[sub$stat_name == nm]
    val <- if (length(hit)) format_stat(unlist(hit[[1]]), nm, digits, proportions) else NA_character_
    if (is.na(val)) {
      # A statistic that exists but is not estimable is not the same as a cell
      # with nothing behind it. `na_text:` lets the row say which it is — a
      # Kaplan-Meier median that never falls below 0.5 is "NE", not blank, and a
      # blank cell in a clinical study report is read as an omission. Without the
      # key the old behaviour (an empty cell) is unchanged.
      na_text <- plan_row$na_text
      if (!is.null(na_text) && !is.na(na_text)) {
        return(as.character(na_text))
      }
      return("")
    }
    out <- sub(tok, val, out, fixed = TRUE)
  }
  out
}

#' Build the rendered body for a listing display
#' @noRd
listing_body <- function(rows, display_spec, digits) {
  vars <- as.character(display_spec$columns$order %||% unique(rows$variable))
  vars <- vars[vars %in% unique(rows$variable)]
  recs <- sort(unique(rows$group1_level))
  tbl <- tibble::tibble(label = seq_along(recs))
  labels <- display_spec$columns$labels %||% list()
  for (j in seq_along(vars)) {
    v <- vars[j]
    vals <- vapply(recs, function(rc) {
      hit <- rows$stat[rows$group1_level == rc & rows$variable == v]
      if (!length(hit)) "" else as.character(unlist(hit[[1]]))
    }, character(1))
    vals[is.na(vals) | vals == "NA"] <- ""
    tbl[[paste0("col", j)]] <- unname(vals)
  }
  list(
    table = tbl,
    columns = list(
      levels = vapply(vars, function(v) as.character(labels[[v]] %||% v), character(1)),
      n = stats::setNames(rep(NA_real_, length(vars)), vars)
    ),
    plan = NULL
  )
}

# ---- gt assembly ------------------------------------------------------------

#' Assemble the `{gt}` object
#' @noRd
build_gt <- function(body, display_spec, vcfg, title, variant) {
  tbl <- body$table
  cols <- body$columns
  headers <- ifelse(
    is.na(cols$n),
    cols$levels,
    paste0(cols$levels, "\n(N=", format(cols$n, trim = TRUE), ")")
  )
  labels <- stats::setNames(as.list(headers), paste0("col", seq_along(headers)))

  g <- gt::gt(tbl, rowname_col = "label")
  g <- gt::cols_label(g, .list = labels)
  g <- gt::tab_header(
    g,
    title = title,
    subtitle = paste0("Study ", display_spec$study, " — ", display_spec$population_label)
  )
  g <- gt::cols_align(g, align = "left", columns = gt::everything())
  if (!is.null(body$plan)) {
    section_idx <- which(body$plan$section)
    if (length(section_idx)) {
      g <- gt::tab_style(
        g,
        style = gt::cell_text(weight = "bold"),
        locations = gt::cells_stub(rows = section_idx)
      )
    }
  } else {
    g <- gt::tab_options(g, row.striping.include_table_body = TRUE)
  }
  notes <- c(as.character(vcfg$footnotes %||% character(0)), display_spec$footnotes)
  for (fn in notes) g <- gt::tab_source_note(g, fn)
  src <- display_spec$source %||% paste0(
    "Source: ", paste(display_spec$datasets %||% character(0), collapse = ", "),
    ". Data cut-off: ", display_spec$cutoff, "."
  )
  g <- gt::tab_source_note(g, src)
  g <- gt::tab_source_note(g, paste0(
    "open.csr display ", display_spec$id, " (", variant, " variant); ",
    "generated from the committed ARD."
  ))
  g
}

#' Wrap a `{gt}` table in a complete standalone HTML document
#'
#' Inline CSS only, no external stylesheet, no script, no CDN — the rendered
#' display has to be openable from disk and publishable to a static site
#' unchanged.
#' @noRd
standalone_html <- function(gt_tbl, title, display_spec, variant, figure = NULL) {
  fragment <- gt::as_raw_html(gt_tbl, inline_css = TRUE)
  # The site embeds this document by lifting its <body> and discarding <head>
  # (sanitizeEmbeddedHtml in scripts/site-lib.mjs), so the plot carries its own
  # styling inside the <svg> rather than relying on a rule up here. See the note
  # in figure_svg().
  has_figure <- !is.null(figure) && length(figure) == 1 && !is.na(figure)
  css <- paste(
    "body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;",
    "margin:0;padding:24px;background:#ffffff;color:#111827;}",
    "main{max-width:1100px;margin:0 auto;}",
    ".meta{font-size:12px;color:#6b7280;margin-bottom:16px;}",
    "table{border-collapse:collapse;}",
    "@media (prefers-color-scheme: dark){body{background:#0b0f19;color:#e5e7eb;}",
    ".meta{color:#9ca3af;}}",
    if (has_figure) ".opencsr-figure{margin:0 auto 20px;}" else "",
    sep = ""
  )
  paste0(
    "<!doctype html>\n<html lang=\"en\">\n<head>\n<meta charset=\"utf-8\">\n",
    "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n",
    "<title>", html_escape(title), "</title>\n<style>", css, "</style>\n</head>\n<body>\n<main>\n",
    "<p class=\"meta\">", html_escape(display_spec$id), " &middot; ", html_escape(variant),
    " variant &middot; study ", html_escape(display_spec$study),
    " &middot; data cut-off ", html_escape(display_spec$cutoff), "</p>\n",
    if (has_figure) paste0("<figure class=\"opencsr-figure-block\">", figure, "</figure>\n") else "",
    fragment,
    "\n</main>\n</body>\n</html>\n"
  )
}

#' @noRd
html_escape <- function(x) {
  x <- gsub("&", "&amp;", x, fixed = TRUE)
  x <- gsub("<", "&lt;", x, fixed = TRUE)
  gsub(">", "&gt;", x, fixed = TRUE)
}
