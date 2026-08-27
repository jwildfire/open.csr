# Drawing a figure display.
#
# open.csr's display contract has always named `figure` as a display type, and
# the engine has always been able to COMPUTE one: `method: figure` dispatches to
# a display's custom.R, which returns the curve as list-valued statistics in the
# ARD like any other result. What was missing was the last step. A display of
# type `figure` rendered its statistics as a table and drew nothing, so the one
# figure in the library was a figure in name only.
#
# This file draws it, under the same rule every other renderer in this package
# obeys: THE ARD IS THE ONLY INPUT. `render_figure()` never sees a subject, never
# re-fits anything, and cannot disagree with the table printed beneath it,
# because both read the same rows of the same committed analysis results
# dataset. A curve that could drift from its own statistics would be a second
# source of truth, which is the thing this project exists to abolish.
#
# The output is inline SVG with no external references, so the display stays a
# single self-contained file that diffs as text — the same property the HTML
# tables have. No plotting package is involved and no image is embedded.

#' Draw a figure display from its ARD
#'
#' @param rows ARD rows (contract §5).
#' @param display_spec Validated display spec carrying a `figure:` block.
#' @param columns The display's column plan, from `display_columns()`.
#' @return A length-one character vector of SVG markup, or `NA_character_` when
#'   the spec declares no figure.
#' @noRd
render_figure <- function(rows, display_spec, columns) {
  fig <- display_spec$figure
  if (!length(fig)) {
    return(NA_character_)
  }
  kind <- fig$kind %||% "step"
  if (!kind %in% c("kaplan_meier", "step")) {
    stop(
      "Display '", display_spec$id, "' declares figure kind '", kind,
      "'; this engine draws: kaplan_meier, step.",
      call. = FALSE
    )
  }
  x_stat <- fig$x$stat %||% stop("figure: `x.stat` is required.", call. = FALSE)
  y_stat <- fig$y$stat %||% stop("figure: `y.stat` is required.", call. = FALSE)
  analysis <- fig$analysis

  series <- lapply(columns$levels, function(lv) {
    list(
      label = lv,
      x = figure_stat(rows, analysis, lv, x_stat),
      y = figure_stat(rows, analysis, lv, y_stat)
    )
  })
  keep <- vapply(series, function(s) length(s$x) > 1 && length(s$x) == length(s$y), logical(1))
  if (!any(keep)) {
    stop(
      "Display '", display_spec$id, "' declares a figure but its ARD carries no ",
      "usable `", x_stat, "`/`", y_stat, "` series. A figure whose coordinates ",
      "are missing must fail rather than render an empty frame.",
      call. = FALSE
    )
  }
  series <- series[keep]

  at_risk <- figure_at_risk(rows, fig, columns)
  svg_figure(series, at_risk, fig, display_spec)
}

#' One list-valued statistic for one column, as a numeric vector
#' @noRd
figure_stat <- function(rows, analysis, level, stat_name) {
  hit <- rows$stat[
    (is.na(analysis) | rows$analysis == analysis) &
      !is.na(rows$group1_level) & rows$group1_level == level &
      rows$stat_name == stat_name
  ]
  if (!length(hit)) {
    return(numeric(0))
  }
  as.numeric(unlist(hit[[1]]))
}

#' The numbers-at-risk strip, when the spec declares one
#' @noRd
figure_at_risk <- function(rows, fig, columns) {
  cfg <- fig$at_risk
  if (!length(cfg)) {
    return(NULL)
  }
  times <- figure_stat(rows, fig$analysis, columns$levels[1], cfg$times)
  if (!length(times)) {
    return(NULL)
  }
  counts <- lapply(columns$levels, function(lv) figure_stat(rows, fig$analysis, lv, cfg$counts))
  names(counts) <- columns$levels
  ok <- vapply(counts, function(v) length(v) == length(times), logical(1))
  if (!all(ok)) {
    stop(
      "The numbers-at-risk strip declares ", length(times), " times but ",
      paste(names(counts)[!ok], collapse = ", "), " reported a different number of counts.",
      call. = FALSE
    )
  }
  list(times = times, counts = counts, label = cfg$label %||% "At risk")
}

# ---- SVG --------------------------------------------------------------------

#' The figure palette
#'
#' Okabe-Ito, which stays distinguishable under every common form of colour
#' vision deficiency, with a lighter variant swapped in under a dark colour
#' scheme so the curves keep their contrast against either background. Each
#' series also carries its own dash pattern, so the figure survives being
#' printed in greyscale — a regulatory display is read on paper as often as on a
#' screen.
#' @noRd
figure_palette <- function() {
  list(
    light = c("#0072B2", "#D55E00", "#009E73", "#CC79A7", "#8C6D1F"),
    dark = c("#56B4E9", "#E69F00", "#00C69B", "#F0A3CE", "#D6BE58"),
    dash = c("none", "7 4", "2 3", "10 3 2 3", "5 2")
  )
}

#' Assemble the SVG for a figure display
#' @noRd
svg_figure <- function(series, at_risk, fig, display_spec) {
  pal <- figure_palette()
  n <- length(series)

  # ---- geometry ------------------------------------------------------------
  width <- 760
  pad_l <- 66
  pad_r <- 14
  pad_t <- 14
  plot_w <- width - pad_l - pad_r
  plot_h <- 300
  axis_y <- pad_t + plot_h

  x_ticks <- if (!is.null(at_risk)) at_risk$times else pretty(range(unlist(lapply(series, `[[`, "x"))), 6)
  x_max <- max(c(x_ticks, unlist(lapply(series, `[[`, "x"))))
  x_min <- min(c(x_ticks, 0))
  if (!is.finite(x_max) || x_max <= x_min) x_max <- x_min + 1

  y_lim <- as.numeric(fig$y$limits %||% c(0, 1))
  y_ticks <- seq(y_lim[1], y_lim[2], length.out = 5)

  sx <- function(v) pad_l + (v - x_min) / (x_max - x_min) * plot_w
  sy <- function(v) pad_t + (y_lim[2] - v) / (y_lim[2] - y_lim[1]) * plot_h

  # The x-axis label sits at axis_y + 40; the legend clears it rather than
  # sharing the line with it.
  legend_y <- axis_y + 72
  risk_top <- legend_y + 30
  risk_h <- if (is.null(at_risk)) 0 else 20 + 18 * n
  height <- risk_top + risk_h + 8

  num <- function(v) formatC(v, format = "f", digits = 2)

  parts <- c(
    sprintf(
      paste0(
        "<svg class=\"opencsr-figure\" viewBox=\"0 0 %d %d\" width=\"100%%\" ",
        "role=\"img\" aria-label=\"%s\">"
      ),
      width, round(height), html_escape(display_spec$title)
    )
  )

  # ---- gridlines and axes --------------------------------------------------
  for (t in y_ticks) {
    parts <- c(parts, sprintf(
      "<line class=\"grid\" x1=\"%s\" y1=\"%s\" x2=\"%s\" y2=\"%s\"/>",
      num(sx(x_min)), num(sy(t)), num(sx(x_max)), num(sy(t))
    ))
    parts <- c(parts, sprintf(
      "<text class=\"tick\" x=\"%s\" y=\"%s\" text-anchor=\"end\" dy=\"0.32em\">%s</text>",
      num(pad_l - 8), num(sy(t)), formatC(t, format = "f", digits = 2)
    ))
  }
  for (t in x_ticks) {
    parts <- c(parts, sprintf(
      "<line class=\"axis\" x1=\"%s\" y1=\"%s\" x2=\"%s\" y2=\"%s\"/>",
      num(sx(t)), num(axis_y), num(sx(t)), num(axis_y + 5)
    ))
    parts <- c(parts, sprintf(
      "<text class=\"tick\" x=\"%s\" y=\"%s\" text-anchor=\"middle\">%s</text>",
      num(sx(t)), num(axis_y + 19), formatC(t, format = "d")
    ))
  }
  parts <- c(parts, sprintf(
    "<line class=\"axis\" x1=\"%s\" y1=\"%s\" x2=\"%s\" y2=\"%s\"/>",
    num(pad_l), num(axis_y), num(sx(x_max)), num(axis_y)
  ))
  parts <- c(parts, sprintf(
    "<line class=\"axis\" x1=\"%s\" y1=\"%s\" x2=\"%s\" y2=\"%s\"/>",
    num(pad_l), num(pad_t), num(pad_l), num(axis_y)
  ))
  parts <- c(parts, sprintf(
    "<text class=\"axlab\" x=\"%s\" y=\"%s\" text-anchor=\"middle\">%s</text>",
    num(pad_l + plot_w / 2), num(axis_y + 40), html_escape(fig$x$label %||% "")
  ))
  parts <- c(parts, sprintf(
    paste0(
      "<text class=\"axlab\" x=\"%s\" y=\"%s\" text-anchor=\"middle\" ",
      "transform=\"rotate(-90 %s %s)\">%s</text>"
    ),
    num(16), num(pad_t + plot_h / 2), num(16), num(pad_t + plot_h / 2),
    html_escape(fig$y$label %||% "")
  ))

  # ---- the curves ----------------------------------------------------------
  for (i in seq_len(n)) {
    s <- series[[i]]
    parts <- c(parts, sprintf(
      "<path class=\"series s%d\" d=\"%s\"/>",
      i, step_path(s$x, s$y, sx, sy, num)
    ))
  }

  # ---- legend --------------------------------------------------------------
  lx <- pad_l
  for (i in seq_len(n)) {
    parts <- c(parts, sprintf(
      "<line class=\"series s%d\" x1=\"%s\" y1=\"%s\" x2=\"%s\" y2=\"%s\"/>",
      i, num(lx), num(legend_y), num(lx + 26), num(legend_y)
    ))
    parts <- c(parts, sprintf(
      "<text class=\"tick\" x=\"%s\" y=\"%s\" dy=\"0.32em\">%s</text>",
      num(lx + 32), num(legend_y), html_escape(series[[i]]$label)
    ))
    lx <- lx + 34 + nchar(series[[i]]$label) * 6.6
  }

  # ---- numbers at risk -----------------------------------------------------
  if (!is.null(at_risk)) {
    parts <- c(parts, sprintf(
      "<text class=\"axlab\" x=\"%s\" y=\"%s\">%s</text>",
      num(pad_l - 52), num(risk_top), html_escape(at_risk$label)
    ))
    for (i in seq_len(n)) {
      lab <- series[[i]]$label
      row_y <- risk_top + 18 * i
      parts <- c(parts, sprintf(
        "<line class=\"series s%d\" x1=\"%s\" y1=\"%s\" x2=\"%s\" y2=\"%s\"/>",
        i, num(pad_l - 52), num(row_y - 4), num(pad_l - 34), num(row_y - 4)
      ))
      counts <- at_risk$counts[[lab]]
      for (j in seq_along(at_risk$times)) {
        parts <- c(parts, sprintf(
          "<text class=\"tick\" x=\"%s\" y=\"%s\" text-anchor=\"middle\">%s</text>",
          num(sx(at_risk$times[j])), num(row_y), formatC(counts[j], format = "d")
        ))
      }
    }
  }

  parts <- c(parts, "</svg>")
  paste(parts, collapse = "\n")
}

#' The step path for one series
#'
#' A survival curve is a step function: the estimate holds until the next event
#' time and then drops. Joining the points with straight segments would draw a
#' curve that claims values the estimator never took, so the path moves
#' horizontally to the next time and only then vertically to the new value.
#' @noRd
step_path <- function(x, y, sx, sy, num) {
  ord <- order(x)
  x <- x[ord]
  y <- y[ord]
  d <- sprintf("M %s %s", num(sx(x[1])), num(sy(y[1])))
  for (i in seq_along(x)[-1]) {
    d <- paste0(d, sprintf(" H %s V %s", num(sx(x[i])), num(sy(y[i]))))
  }
  d
}

#' CSS for the inline figure, including its dark-scheme palette
#' @noRd
figure_css <- function(n) {
  pal <- figure_palette()
  base <- paste(
    ".opencsr-figure{display:block;max-width:100%;margin:0 auto 20px;overflow:visible;}",
    ".opencsr-figure .axis{stroke:currentColor;stroke-width:1;opacity:0.55;}",
    ".opencsr-figure .grid{stroke:currentColor;stroke-width:1;opacity:0.14;}",
    ".opencsr-figure .tick{fill:currentColor;font-size:12px;opacity:0.85;}",
    ".opencsr-figure .axlab{fill:currentColor;font-size:12px;font-weight:600;}",
    ".opencsr-figure .series{fill:none;stroke-width:2;stroke-linejoin:round;}",
    sep = ""
  )
  series <- vapply(seq_len(n), function(i) {
    k <- ((i - 1) %% length(pal$light)) + 1
    dash <- pal$dash[[k]]
    sprintf(
      ".opencsr-figure .s%d{stroke:%s;%s}", i, pal$light[[k]],
      if (identical(dash, "none")) "" else paste0("stroke-dasharray:", dash, ";")
    )
  }, character(1))
  dark <- vapply(seq_len(n), function(i) {
    k <- ((i - 1) %% length(pal$dark)) + 1
    sprintf(".opencsr-figure .s%d{stroke:%s;}", i, pal$dark[[k]])
  }, character(1))
  paste0(
    base, paste(series, collapse = ""),
    "@media (prefers-color-scheme: dark){", paste(dark, collapse = ""), "}"
  )
}
