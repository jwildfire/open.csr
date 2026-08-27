#' Render a figure from an ARD as inline SVG
#'
#' The figure half of contract §3. A figure is drawn from the ARD and from
#' nothing else — the same rule the tables follow (design decision D4) — so the
#' curve a reviewer sees and the numbers in the table beneath it cannot disagree
#' about the data they describe.
#'
#' The plot is emitted as hand-built SVG rather than through a plotting package
#' for three reasons, all of which are about a regulated artifact rather than
#' about taste:
#'
#' * **It is a pure function of the ARD.** Every coordinate is arithmetic on
#'   statistics that are in `ard.json`, so a reviewer can recompute the drawing
#'   from the committed data, and the qualification script does exactly that.
#' * **It is byte-reproducible.** A raster device's output depends on the
#'   graphics device, the font stack and the machine; the iteration ledger
#'   hashes what it writes, and a hash that moves when nothing moved is a hash
#'   nobody trusts.
#' * **It carries no external reference.** No CDN, no font file, no linked
#'   image: the display stays openable from disk and publishable to a static
#'   site unchanged.
#'
#' Styling travels as SVG presentation attributes because the site strips
#' `<head>` when it embeds a rendered display. Text and axes use
#' `currentColor`, so the plot follows the page into dark mode.
#'
#' @param rows ARD rows (tibble) in the schema of contract §5.
#' @param display_spec Validated display spec carrying a `figure:` block.
#' @param vcfg The variant's configuration.
#'
#' @return A length-one character string holding a complete `<svg>` element.
#' @noRd
figure_svg <- function(rows, display_spec, vcfg = list()) {
  fig <- display_spec$figure
  if (is.null(fig)) {
    return(NULL)
  }
  series <- figure_series_data(rows, fig, display_spec$id)

  width <- fig$width
  height <- fig$height
  pad <- list(left = 74, right = 22, top = if (is.null(fig$plot_title)) 24 else 46, bottom = 62)
  x0 <- pad$left
  x1 <- width - pad$right
  y0 <- pad$top
  y1 <- height - pad$bottom
  if (x1 <= x0 || y1 <= y0) {
    stop(
      "display '", display_spec$id, "': `figure.width`/`figure.height` leave no ",
      "room for the plot area.",
      call. = FALSE
    )
  }

  xlim <- figure_limits(fig$x_axis, unlist(lapply(series, function(s) s$time)))
  ylim <- figure_limits(fig$y_axis, unlist(lapply(series, function(s) s$value)))
  sx <- function(v) x0 + (v - xlim[1]) / (xlim[2] - xlim[1]) * (x1 - x0)
  sy <- function(v) y1 - (v - ylim[1]) / (ylim[2] - ylim[1]) * (y1 - y0)

  xticks <- figure_ticks(fig$x_axis, xlim)
  yticks <- figure_ticks(fig$y_axis, ylim)

  parts <- character(0)
  add <- function(...) parts <<- c(parts, paste0(...))

  # Plot frame and gridlines. Drawn first so every curve sits above them.
  add(svg_rect(x0, y0, x1 - x0, y1 - y0, fill = "none", stroke = "currentColor", stroke_opacity = 0.35))
  for (t in yticks) {
    if (t <= ylim[1] || t >= ylim[2]) next
    add(svg_line(x0, sy(t), x1, sy(t), stroke = "currentColor", stroke_opacity = 0.12))
  }

  # Axes: ticks, tick labels, titles.
  xdig <- figure_tick_digits(fig$x_axis, xticks)
  for (t in xticks) {
    add(svg_line(sx(t), y1, sx(t), y1 + 5, stroke = "currentColor", stroke_opacity = 0.55))
    add(svg_text(sx(t), y1 + 20, figure_num(t, xdig), anchor = "middle", size = 13))
  }
  ydig <- figure_tick_digits(fig$y_axis, yticks)
  for (t in yticks) {
    add(svg_line(x0 - 5, sy(t), x0, sy(t), stroke = "currentColor", stroke_opacity = 0.55))
    add(svg_text(x0 - 10, sy(t) + 4, figure_num(t, ydig), anchor = "end", size = 13))
  }
  add(svg_text((x0 + x1) / 2, height - 16, fig$x_axis$label, anchor = "middle", size = 14, weight = "600"))
  add(svg_text(
    18, (y0 + y1) / 2, fig$y_axis$label,
    anchor = "middle", size = 14, weight = "600",
    transform = paste0("rotate(-90 18 ", figure_num((y0 + y1) / 2, 2), ")")
  ))
  if (!is.null(fig$plot_title)) {
    add(svg_text((x0 + x1) / 2, y0 - 18, fig$plot_title, anchor = "middle", size = 16, weight = "700"))
  }

  # The curves, in declared order.
  for (s in series) {
    add(svg_path(
      figure_step_path(s$time, s$value, sx, sy),
      stroke = s$color, dash = s$dash, width = 2.1
    ))
    if (length(s$censor_time)) {
      marks <- vapply(seq_along(s$censor_time), function(i) {
        cx <- sx(s$censor_time[i])
        cy <- sy(s$censor_value[i])
        svg_line(cx, cy - 4.5, cx, cy + 4.5, stroke = s$color, width = 1.4)
      }, character(1))
      add(paste0(marks, collapse = ""))
    }
  }

  # Legend, inside the plot area at the top right, as in the reference figure.
  add(figure_legend(series, x1, y0))

  # The annotation, resolved from the ARD by binding address so the number the
  # plot states is provably the number the ARD holds.
  if (!is.null(fig$annotation)) {
    add(figure_annotation(rows, fig$annotation, x0, y1))
  }

  paste0(
    "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 ",
    figure_num(width, 0), " ", figure_num(height, 0), "\" ",
    "width=\"100%\" role=\"img\" ",
    "style=\"max-width:", figure_num(width, 0), "px;height:auto;display:block;margin:0 auto\" ",
    "font-family=\"-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif\">",
    "<title>", html_escape(vcfg$title %||% display_spec$title), "</title>",
    paste0(parts, collapse = ""),
    "</svg>"
  )
}

#' Pull each declared series' coordinates out of the ARD
#'
#' A series whose statistics are missing is an error, not an omitted curve: a
#' figure that silently drops a treatment group is worse than one that fails.
#' @noRd
figure_series_data <- function(rows, fig, id) {
  pick <- function(level, stat_name) {
    if (is.null(stat_name)) {
      return(numeric(0))
    }
    hit <- rows$stat[rows$analysis == fig$analysis &
      !is.na(rows$group1_level) & rows$group1_level == level &
      rows$stat_name == stat_name]
    if (!length(hit)) {
      return(NULL)
    }
    v <- unlist(hit[[1]], use.names = FALSE)
    if (is.null(v)) numeric(0) else as.numeric(v)
  }
  lapply(fig$series, function(s) {
    time <- pick(s$level, fig$stats$time)
    value <- pick(s$level, fig$stats$value)
    if (is.null(time) || is.null(value)) {
      stop(
        "display '", id, "': the ARD has no '", fig$stats$time, "'/'",
        fig$stats$value, "' statistics for analysis '", fig$analysis,
        "' at series level '", s$level, "'.",
        call. = FALSE
      )
    }
    if (length(time) != length(value)) {
      stop(
        "display '", id, "': series '", s$level, "' has ", length(time),
        " abscissa values and ", length(value), " ordinate values.",
        call. = FALSE
      )
    }
    if (!length(time)) {
      stop("display '", id, "': series '", s$level, "' has no points.", call. = FALSE)
    }
    ct <- pick(s$level, fig$stats$censor_time) %||% numeric(0)
    cv <- pick(s$level, fig$stats$censor_value) %||% numeric(0)
    if (length(ct) != length(cv)) ct <- cv <- numeric(0)
    c(s, list(time = time, value = value, censor_time = ct, censor_value = cv))
  })
}

#' Axis limits: declared where declared, data range otherwise
#' @noRd
figure_limits <- function(axis, values) {
  values <- values[is.finite(values)]
  lo <- axis$min %||% (if (length(values)) min(values) else 0)
  hi <- axis$max %||% (if (length(values)) max(values) else 1)
  if (!is.finite(lo) || !is.finite(hi) || lo >= hi) {
    stop("Figure axis has a degenerate range (", lo, ", ", hi, ").", call. = FALSE)
  }
  c(lo, hi)
}

#' Tick positions: declared where declared, five evenly spaced otherwise
#' @noRd
figure_ticks <- function(axis, lim) {
  if (!is.null(axis$ticks)) {
    return(axis$ticks[axis$ticks >= lim[1] & axis$ticks <= lim[2]])
  }
  seq(lim[1], lim[2], length.out = 5)
}

#' Decimals for an axis's tick labels
#'
#' Declared, or the fewest that render every tick without loss — so an axis of
#' whole days is not labelled "0.0" and one of probabilities is not labelled "0".
#' @noRd
figure_tick_digits <- function(axis, ticks) {
  if (!is.null(axis$digits)) {
    return(as.integer(axis$digits))
  }
  for (d in 0:4) {
    if (all(abs(ticks - round(ticks, d)) < 1e-9)) {
      return(d)
    }
  }
  4L
}

#' A number, formatted for SVG output at a fixed precision
#'
#' Fixed precision, always: the iteration ledger hashes the rendered file, so a
#' coordinate that prints with a platform-dependent number of digits would move
#' the hash without moving the figure.
#' @noRd
figure_num <- function(x, digits = 2) {
  out <- formatC(round_half_up(as.numeric(x), digits), format = "f", digits = digits)
  out <- sub("^-0(\\.0*)?$", "0\\1", out)
  out
}

#' The Kaplan-Meier step, as an SVG path
#'
#' A survival curve is right-continuous: `S` holds its value on `[t_i, t_i+1)`
#' and drops at `t_i+1`. So the path runs horizontally to the next time, then
#' vertically to the new value — never diagonally between points, which would
#' draw a survival probability the estimator never took.
#' @noRd
figure_step_path <- function(time, value, sx, sy) {
  ord <- order(time)
  time <- time[ord]
  value <- value[ord]
  d <- paste0("M", figure_num(sx(time[1])), " ", figure_num(sy(value[1])))
  if (length(time) > 1) {
    for (i in 2:length(time)) {
      d <- paste0(
        d, "H", figure_num(sx(time[i])),
        "V", figure_num(sy(value[i]))
      )
    }
  }
  d
}

#' The series legend
#' @noRd
figure_legend <- function(series, x1, y0) {
  labels <- vapply(series, function(s) s$label, character(1))
  # A monospace-free estimate of the widest label; generous enough that the box
  # never clips and tight enough that it does not cover the curves.
  box_w <- 34 + max(nchar(labels)) * 7.4
  box_h <- 14 + length(series) * 20
  bx <- x1 - box_w - 14
  by <- y0 + 12
  out <- svg_rect(bx, by, box_w, box_h,
    fill = "none", stroke = "currentColor", stroke_opacity = 0.35
  )
  for (i in seq_along(series)) {
    s <- series[[i]]
    ly <- by + 7 + i * 20 - 7
    out <- paste0(
      out,
      svg_line(bx + 10, ly, bx + 32, ly, stroke = s$color, dash = s$dash, width = 2.1),
      svg_text(bx + 40, ly + 4, s$label, anchor = "start", size = 13)
    )
  }
  out
}

#' The annotation box, with its value resolved from the ARD
#' @noRd
figure_annotation <- function(rows, ann, x0, y1) {
  value <- ard_binding(rows, ann$binding)
  text <- gsub("{value}", figure_annotation_value(value, ann$format), ann$template, fixed = TRUE)
  w <- 16 + nchar(text) * 7.2
  bx <- x0 + 14
  by <- y1 - 40
  paste0(
    svg_rect(bx, by, w, 26, fill = "none", stroke = "currentColor", stroke_opacity = 0.45),
    svg_text(bx + 8, by + 17, text, anchor = "start", size = 13)
  )
}

#' Format an annotated statistic
#'
#' `p_value` carries the reporting convention a reader expects of a p-value: an
#' explicit relation, and a floor rather than a string of zeros. Anything else is
#' shown as given.
#' @noRd
figure_annotation_value <- function(value, format) {
  value <- unname(unlist(value))[1]
  if (identical(format, "p_value")) {
    if (!is.finite(value)) {
      return("not estimable")
    }
    if (value < 0.0001) {
      return("< 0.0001")
    }
    return(paste0("= ", formatC(round_half_up(value, 4), format = "f", digits = 4)))
  }
  as.character(value)
}

# ---- SVG primitives ---------------------------------------------------------

#' @noRd
svg_rect <- function(x, y, w, h, fill = "none", stroke = "currentColor",
                     stroke_opacity = 1) {
  paste0(
    "<rect x=\"", figure_num(x), "\" y=\"", figure_num(y),
    "\" width=\"", figure_num(w), "\" height=\"", figure_num(h),
    "\" fill=\"", fill, "\" stroke=\"", stroke,
    "\" stroke-opacity=\"", figure_num(stroke_opacity), "\"/>"
  )
}

#' @noRd
svg_line <- function(x1, y1, x2, y2, stroke = "currentColor", stroke_opacity = 1,
                     width = 1, dash = "") {
  paste0(
    "<line x1=\"", figure_num(x1), "\" y1=\"", figure_num(y1),
    "\" x2=\"", figure_num(x2), "\" y2=\"", figure_num(y2),
    "\" stroke=\"", stroke, "\" stroke-width=\"", figure_num(width),
    "\" stroke-opacity=\"", figure_num(stroke_opacity), "\"",
    if (nzchar(dash)) paste0(" stroke-dasharray=\"", dash, "\"") else "",
    "/>"
  )
}

#' @noRd
svg_path <- function(d, stroke, width = 2, dash = "") {
  paste0(
    "<path d=\"", d, "\" fill=\"none\" stroke=\"", stroke,
    "\" stroke-width=\"", figure_num(width), "\"",
    if (nzchar(dash)) paste0(" stroke-dasharray=\"", dash, "\"") else "",
    " stroke-linejoin=\"miter\"/>"
  )
}

#' @noRd
svg_text <- function(x, y, text, anchor = "start", size = 13, weight = "400",
                     transform = NULL) {
  paste0(
    "<text x=\"", figure_num(x), "\" y=\"", figure_num(y),
    "\" text-anchor=\"", anchor, "\" font-size=\"", figure_num(size, 0),
    "\" font-weight=\"", weight, "\" fill=\"currentColor\"",
    if (is.null(transform)) "" else paste0(" transform=\"", transform, "\""),
    ">", html_escape(as.character(text)), "</text>"
  )
}
