#' Render a figure from an ARD as inline SVG
#'
#' The figure half of contract §3. A figure is drawn from the ARD and from
#' nothing else — the same rule the tables follow (design decision D4) — so the
#' curve a reviewer sees and the numbers in the table beneath it cannot disagree
#' about the data they describe. `render_figure()` never sees a subject and never
#' re-fits anything.
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
#' ## Why the styling is doubled
#'
#' The site embeds a rendered display by lifting its `<body>` and discarding the
#' `<head>` (`sanitizeEmbeddedHtml()` in `scripts/site-lib.mjs`). A figure whose
#' colours live in a `<head>` stylesheet therefore arrives on the site with no
#' `fill:none` and no strokes — every survival curve becomes a filled black
#' wedge, and nothing errors while it happens. So every drawn element carries its
#' appearance twice: as an SVG presentation attribute, which survives any
#' sanitiser because it is part of the element, and as a rule in a `<style>`
#' element **inside** the `<svg>`, which survives the same lift and adds the
#' dark-scheme palette. CSS outranks presentation attributes, so the stylesheet
#' wins where it survives and the attribute is the floor where it does not. The
#' floor is a correct light-scheme figure, never a black wedge.
#'
#' @param rows ARD rows (tibble) in the schema of contract §5.
#' @param display_spec Validated display spec carrying a `figure:` block.
#' @param vcfg The variant's configuration.
#'
#' @return A length-one character string holding a complete `<svg>` element, or
#'   `NULL` when the display declares no figure.
#' @noRd
figure_svg <- function(rows, display_spec, vcfg = list()) {
  fig <- display_spec$figure
  if (is.null(fig)) {
    return(NULL)
  }
  # Two kinds of figure so far: the step curves this function draws, and a
  # flow of subject counts (the reference report's Figure 10-1, #63).
  if (identical(fig$kind, "flow")) {
    return(figure_flow_svg(rows, fig, display_spec, vcfg))
  }
  series <- figure_series_data(rows, fig, display_spec$id)
  at_risk <- figure_at_risk(rows, fig, series, display_spec$id)

  width <- fig$width
  strip_h <- if (is.null(at_risk)) 0 else 26 + 20 * length(series)
  height <- fig$height + strip_h
  pad <- list(left = 74, right = 22, top = if (is.null(fig$plot_title)) 24 else 46, bottom = 62)
  x0 <- pad$left
  x1 <- width - pad$right
  y0 <- pad$top
  y1 <- fig$height - pad$bottom
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
  add(svg_rect(x0, y0, x1 - x0, y1 - y0, fill = "none", cls = "frame", stroke_opacity = 0.35))
  for (t in yticks) {
    if (t <= ylim[1] || t >= ylim[2]) next
    add(svg_line(x0, sy(t), x1, sy(t), cls = "grid", stroke_opacity = 0.12))
  }

  # Axes: ticks, tick labels, titles.
  xdig <- figure_tick_digits(fig$x_axis, xticks)
  for (t in xticks) {
    add(svg_line(sx(t), y1, sx(t), y1 + 5, cls = "axis", stroke_opacity = 0.55))
    add(svg_text(sx(t), y1 + 20, figure_num(t, xdig), anchor = "middle", size = 13, cls = "tick"))
  }
  ydig <- figure_tick_digits(fig$y_axis, yticks)
  for (t in yticks) {
    add(svg_line(x0 - 5, sy(t), x0, sy(t), cls = "axis", stroke_opacity = 0.55))
    add(svg_text(x0 - 10, sy(t) + 4, figure_num(t, ydig), anchor = "end", size = 13, cls = "tick"))
  }
  add(svg_text((x0 + x1) / 2, fig$height - 16, fig$x_axis$label,
    anchor = "middle", size = 14, weight = "600", cls = "axlab"
  ))
  add(svg_text(
    18, (y0 + y1) / 2, fig$y_axis$label,
    anchor = "middle", size = 14, weight = "600", cls = "axlab",
    transform = paste0("rotate(-90 18 ", figure_num((y0 + y1) / 2, 2), ")")
  ))
  if (!is.null(fig$plot_title)) {
    add(svg_text((x0 + x1) / 2, y0 - 18, fig$plot_title,
      anchor = "middle", size = 16, weight = "700", cls = "axlab"
    ))
  }

  # The curves, in declared order.
  for (s in series) {
    add(svg_path(
      figure_step_path(s$time, s$value, sx, sy),
      stroke = s$color, dash = s$dash, width = 2.1, cls = paste0("series s", s$index)
    ))
    if (length(s$censor_time)) {
      marks <- vapply(seq_along(s$censor_time), function(i) {
        cx <- sx(s$censor_time[i])
        cy <- sy(s$censor_value[i])
        svg_line(cx, cy - 4.5, cx, cy + 4.5,
          stroke = s$color, width = 1.4, cls = paste0("mark s", s$index)
        )
      }, character(1))
      add(paste0(marks, collapse = ""))
    }
  }

  # Legend, inside the plot area at the top right, as in the reference figure.
  add(figure_legend(series, x1, y0))

  # The annotation, resolved from the ARD by binding address so the number the
  # plot states is provably the number the ARD holds.
  if (!is.null(fig$annotation)) {
    add(figure_annotation(rows, fig$annotation, display_spec, x0, y1))
  }

  # The numbers-at-risk strip, from committed statistics.
  if (!is.null(at_risk)) {
    add(figure_risk_strip(at_risk, series, sx, x0, fig$height))
  }

  paste0(
    # No `xmlns`: this SVG is only ever inlined into HTML, where the parser puts
    # it in the SVG namespace by itself, and the assembled document is gated on
    # carrying no `http://` of any kind so that it is provably self-contained.
    "<svg class=\"opencsr-figure\" viewBox=\"0 0 ",
    figure_num(width, 0), " ", figure_num(height, 0), "\" ",
    "width=\"100%\" role=\"img\" ",
    "style=\"max-width:", figure_num(width, 0), "px;height:auto;display:block;margin:0 auto\" ",
    "font-family=\"-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif\">",
    "<title>", html_escape(vcfg$title %||% display_spec$title), "</title>",
    figure_style(length(series)),
    paste0(parts, collapse = ""),
    "</svg>"
  )
}

#' A flow of subject counts, drawn from the ARD
#'
#' Each box in `figure.boxes` names an ARD level and prints its count beside the
#' declared label; `from` draws the arrow that feeds it, `side: right` hangs it
#' off its source to the right (a branch, such as the screen failures) instead
#' of below it. Pure arithmetic on committed statistics, like the curves.
#' @noRd
figure_flow_svg <- function(rows, fig, display_spec, vcfg = list()) {
  count_of <- function(level) {
    hit <- rows$stat[rows$analysis == fig$analysis & !is.na(rows$variable_level) &
      rows$variable_level == level & rows$stat_name == "n"]
    if (!length(hit)) {
      stop("display '", display_spec$id, "': the ARD has no count for flow level '", level, "'.", call. = FALSE)
    }
    unlist(hit[[1]])
  }
  width <- fig$width
  height <- fig$height
  boxes <- fig$boxes
  n_main <- sum(vapply(boxes, function(b) !identical(b$side, "right"), logical(1)))
  bw <- 300
  bh <- 40
  gap <- (height - 30 - n_main * bh) / max(1, n_main - 1)
  cx <- width / 2 - 60
  pos <- list()
  i <- 0
  for (b in boxes) {
    if (identical(b$side, "right")) next
    pos[[b$level]] <- list(x = cx - bw / 2, y = 15 + i * (bh + gap), w = bw, h = bh)
    i <- i + 1
  }
  for (b in boxes) {
    if (!identical(b$side, "right")) next
    src <- pos[[b$from]]
    pos[[b$level]] <- list(x = src$x + bw + 40, y = src$y, w = 200, h = bh)
  }
  parts <- character(0)
  add <- function(...) parts <<- c(parts, paste0(...))
  for (b in boxes) {
    p <- pos[[b$level]]
    add(svg_rect(p$x, p$y, p$w, p$h, fill = "none", stroke = "currentColor", cls = "flow-box", stroke_opacity = 0.7))
    add(svg_text(p$x + p$w / 2, p$y + bh / 2 + 5,
      paste0(b$label, " = ", figure_num(count_of(b$level), 0)),
      anchor = "middle", size = 13, weight = "600", cls = "flow-label"
    ))
    if (!is.null(b$from)) {
      s <- pos[[b$from]]
      if (identical(b$side, "right")) {
        add(svg_line(s$x + s$w, s$y + bh / 2, p$x, p$y + bh / 2, cls = "flow-arrow", stroke_opacity = 0.7))
        add(svg_path(sprintf("M%s %s l-8 -4 l0 8 z", figure_num(p$x, 1), figure_num(p$y + bh / 2, 1)), stroke = "currentColor", width = 1, cls = "flow-head"))
      } else {
        add(svg_line(s$x + s$w / 2, s$y + s$h, p$x + p$w / 2, p$y, cls = "flow-arrow", stroke_opacity = 0.7))
        add(svg_path(sprintf("M%s %s l-4 -8 l8 0 z", figure_num(p$x + p$w / 2, 1), figure_num(p$y, 1)), stroke = "currentColor", width = 1, cls = "flow-head"))
      }
    }
  }
  paste0(
    "<svg class=\"opencsr-figure\" viewBox=\"0 0 ", figure_num(width, 0), " ", figure_num(height, 0), "\" ",
    "width=\"100%\" role=\"img\" ",
    "style=\"max-width:", figure_num(width, 0), "px;height:auto;display:block;margin:0 auto\" ",
    "font-family=\"-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif\">",
    "<title>", html_escape(vcfg$title %||% display_spec$title), "</title>",
    paste0(parts, collapse = ""),
    "</svg>"
  )
}

#' The figure palette
#'
#' Okabe-Ito, which stays distinguishable under every common form of colour
#' vision deficiency, with a lighter variant swapped in under a dark colour
#' scheme so the curves keep their contrast against either background. Each
#' series also carries its own dash pattern, so the figure survives being printed
#' in greyscale — a regulatory display is read on paper as often as on a screen,
#' and a reader who cannot separate two hues can still separate two dashes.
#'
#' The palette lives here rather than in `display.yaml` on purpose. A hex colour
#' written into a display specification is a presentation choice masquerading as
#' part of the display's definition, and it has no dark-scheme counterpart, so
#' the spec declares the series and the engine dresses them.
#' @noRd
figure_palette <- function() {
  list(
    light = c("#0072B2", "#009E73", "#D55E00", "#CC79A7", "#8C6D1F"),
    dark = c("#56B4E9", "#00C69B", "#E69F00", "#F0A3CE", "#D6BE58"),
    dash = c("", "8 4", "2 3", "10 3 2 3", "5 2")
  )
}

#' The stylesheet carried inside the `<svg>`
#'
#' See the note on doubled styling in [figure_svg()]. This element travels with
#' the figure through the site's embed path, so it is where the dark-scheme
#' palette can safely live; the light-scheme values repeat the presentation
#' attributes already on the elements, so stripping it changes nothing visible in
#' a light scheme and cannot produce an unstyled figure.
#' @noRd
figure_style <- function(n) {
  pal <- figure_palette()
  idx <- function(i) ((i - 1) %% length(pal$light)) + 1
  light <- vapply(seq_len(n), function(i) {
    sprintf(".opencsr-figure .s%d{stroke:%s;}", i, pal$light[[idx(i)]])
  }, character(1))
  dark <- vapply(seq_len(n), function(i) {
    sprintf(".opencsr-figure .s%d{stroke:%s;}", i, pal$dark[[idx(i)]])
  }, character(1))
  paste0(
    "<style>",
    ".opencsr-figure .series{fill:none;}",
    ".opencsr-figure .frame,.opencsr-figure .grid,.opencsr-figure .axis{stroke:currentColor;}",
    ".opencsr-figure .tick,.opencsr-figure .axlab,.opencsr-figure .note{fill:currentColor;}",
    paste(light, collapse = ""),
    "@media (prefers-color-scheme: dark){", paste(dark, collapse = ""), "}",
    "</style>"
  )
}

#' Pull each declared series' coordinates out of the ARD
#'
#' A series whose statistics are missing is an error, not an omitted curve: a
#' figure that silently drops a treatment group is worse than one that fails.
#' @noRd
figure_series_data <- function(rows, fig, id) {
  pal <- figure_palette()
  lapply(seq_along(fig$series), function(i) {
    s <- fig$series[[i]]
    time <- figure_stat(rows, fig$analysis, s$level, fig$stats$time)
    value <- figure_stat(rows, fig$analysis, s$level, fig$stats$value)
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
    ct <- figure_stat(rows, fig$analysis, s$level, fig$stats$censor_time) %||% numeric(0)
    cv <- figure_stat(rows, fig$analysis, s$level, fig$stats$censor_value) %||% numeric(0)
    if (length(ct) != length(cv)) ct <- cv <- numeric(0)
    k <- ((i - 1) %% length(pal$light)) + 1
    c(s, list(
      index = i, color = pal$light[[k]], dash = pal$dash[[k]],
      time = time, value = value, censor_time = ct, censor_value = cv
    ))
  })
}

#' One list-valued statistic for one series level, as a numeric vector
#'
#' `NULL` means the statistic is absent (a caller's error to report); a
#' zero-length vector means it was asked for and is legitimately empty.
#' @noRd
figure_stat <- function(rows, analysis, level, stat_name) {
  if (is.null(stat_name)) {
    return(numeric(0))
  }
  hit <- rows$stat[rows$analysis == analysis &
    !is.na(rows$group1_level) & rows$group1_level == level &
    rows$stat_name == stat_name]
  if (!length(hit)) {
    return(NULL)
  }
  v <- unlist(hit[[1]], use.names = FALSE)
  if (is.null(v)) numeric(0) else as.numeric(v)
}

#' The numbers-at-risk strip, when the spec declares one
#'
#' The counts are read from the ARD, not recomputed from the curve: a reader who
#' checks the strip against `ard.json` must find the same integers there, and a
#' strip the renderer derived would be a second calculation of the risk set with
#' nothing to check it against.
#' @noRd
figure_at_risk <- function(rows, fig, series, id) {
  cfg <- fig$at_risk
  if (is.null(cfg)) {
    return(NULL)
  }
  times <- figure_stat(rows, fig$analysis, series[[1]]$level, cfg$times)
  if (is.null(times) || !length(times)) {
    stop(
      "display '", id, "': the numbers-at-risk strip declares statistic '",
      cfg$times, "', which the ARD does not carry for series '",
      series[[1]]$level, "'.",
      call. = FALSE
    )
  }
  counts <- lapply(series, function(s) figure_stat(rows, fig$analysis, s$level, cfg$counts))
  bad <- vapply(counts, function(v) is.null(v) || length(v) != length(times), logical(1))
  if (any(bad)) {
    stop(
      "display '", id, "': the numbers-at-risk strip declares ", length(times),
      " times, but ",
      paste(vapply(series[bad], function(s) s$level, character(1)), collapse = ", "),
      " reported a different number of counts.",
      call. = FALSE
    )
  }
  list(times = times, counts = counts, label = cfg$label %||% "Number at risk")
}

#' Draw the numbers-at-risk strip beneath the axis label
#' @noRd
figure_risk_strip <- function(at_risk, series, sx, x0, top) {
  out <- svg_text(x0 - 56, top + 14, at_risk$label,
    anchor = "start", size = 13, weight = "600", cls = "axlab"
  )
  for (i in seq_along(series)) {
    row_y <- top + 14 + 20 * i
    out <- paste0(
      out,
      svg_line(x0 - 56, row_y - 4, x0 - 34, row_y - 4,
        stroke = series[[i]]$color, dash = series[[i]]$dash, width = 2.1,
        cls = paste0("mark s", series[[i]]$index)
      ),
      paste0(vapply(seq_along(at_risk$times), function(j) {
        svg_text(sx(at_risk$times[j]), row_y, figure_num(at_risk$counts[[i]][j], 0),
          anchor = "middle", size = 13, cls = "tick"
        )
      }, character(1)), collapse = "")
    )
  }
  out
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
  out <- svg_rect(bx, by, box_w, box_h, fill = "none", cls = "frame", stroke_opacity = 0.35)
  for (i in seq_along(series)) {
    s <- series[[i]]
    ly <- by + 7 + i * 20 - 7
    out <- paste0(
      out,
      svg_line(bx + 10, ly, bx + 32, ly,
        stroke = s$color, dash = s$dash, width = 2.1,
        cls = paste0("mark s", s$index)
      ),
      svg_text(bx + 40, ly + 4, s$label, anchor = "start", size = 13, cls = "tick")
    )
  }
  out
}

#' The annotation box, with every value resolved from the ARD
#'
#' The annotation states results on the face of the plot, so each one is
#' addressed into the ARD rather than written as prose: an annotation that could
#' drift from the analysis it describes is the same defect as a curve that could.
#' `ard_binding()` errors unless an address resolves to exactly one row, so a
#' stale annotation is a build failure rather than a wrong number on a figure.
#'
#' Values are formatted by [format_stat()] at the display's declared precision,
#' which is what applies the `<0.0001` convention to a p-value too small to print
#' — a log-rank p of 8e-14 rounded to four places reads `0.0000`, and no
#' statistic in a clinical study report should assert a probability of zero.
#' @noRd
figure_annotation <- function(rows, ann, display_spec, x0, y1) {
  digits <- display_spec$format$digits
  text <- ann$template
  for (nm in names(ann$bindings)) {
    address <- ann$bindings[[nm]]
    stat_name <- sub("^.*:", "", sub(";.*$", "", address))
    value <- format_stat(ard_binding(rows, address), stat_name, digits)
    text <- gsub(paste0("{", nm, "}"), value, text, fixed = TRUE)
  }
  w <- 16 + nchar(text) * 7.2
  bx <- x0 + 14
  by <- y1 - 40
  paste0(
    svg_rect(bx, by, w, 26, fill = "none", cls = "frame", stroke_opacity = 0.45),
    svg_text(bx + 8, by + 17, text, anchor = "start", size = 13, cls = "note")
  )
}

# ---- SVG primitives ---------------------------------------------------------
#
# Every primitive takes both a presentation attribute and a class: the attribute
# is the floor that survives a sanitiser, the class is what the in-SVG
# stylesheet addresses. See the note on doubled styling in figure_svg().

#' @noRd
svg_rect <- function(x, y, w, h, fill = "none", stroke = "currentColor",
                     stroke_opacity = 1, cls = NULL) {
  paste0(
    "<rect", svg_class(cls), " x=\"", figure_num(x), "\" y=\"", figure_num(y),
    "\" width=\"", figure_num(w), "\" height=\"", figure_num(h),
    "\" fill=\"", fill, "\" stroke=\"", stroke,
    "\" stroke-opacity=\"", figure_num(stroke_opacity), "\"/>"
  )
}

#' @noRd
svg_line <- function(x1, y1, x2, y2, stroke = "currentColor", stroke_opacity = 1,
                     width = 1, dash = "", cls = NULL) {
  paste0(
    "<line", svg_class(cls), " x1=\"", figure_num(x1), "\" y1=\"", figure_num(y1),
    "\" x2=\"", figure_num(x2), "\" y2=\"", figure_num(y2),
    "\" stroke=\"", stroke, "\" stroke-width=\"", figure_num(width),
    "\" stroke-opacity=\"", figure_num(stroke_opacity), "\"",
    if (nzchar(dash)) paste0(" stroke-dasharray=\"", dash, "\"") else "",
    "/>"
  )
}

#' @noRd
svg_path <- function(d, stroke, width = 2, dash = "", cls = NULL) {
  paste0(
    "<path", svg_class(cls), " d=\"", d, "\" fill=\"none\" stroke=\"", stroke,
    "\" stroke-width=\"", figure_num(width), "\"",
    if (nzchar(dash)) paste0(" stroke-dasharray=\"", dash, "\"") else "",
    " stroke-linejoin=\"miter\"/>"
  )
}

#' @noRd
svg_text <- function(x, y, text, anchor = "start", size = 13, weight = "400",
                     transform = NULL, cls = NULL) {
  paste0(
    "<text", svg_class(cls), " x=\"", figure_num(x), "\" y=\"", figure_num(y),
    "\" text-anchor=\"", anchor, "\" font-size=\"", figure_num(size, 0),
    "\" font-weight=\"", weight, "\" fill=\"currentColor\"",
    if (is.null(transform)) "" else paste0(" transform=\"", transform, "\""),
    ">", html_escape(as.character(text)), "</text>"
  )
}

#' @noRd
svg_class <- function(cls) {
  if (is.null(cls) || !nzchar(cls)) "" else paste0(" class=\"", cls, "\"")
}
