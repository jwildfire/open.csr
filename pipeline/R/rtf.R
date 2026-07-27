#' Column widths for an RTF display
#'
#' The stub column carries labels — preferred terms run long — and every data
#' column is the same width, so the relative plan is one wide column and n equal
#' ones. Returned as relative units; `{r2rtf}` converts them against the page.
#' @noRd
rtf_col_widths <- function(n_data) c(3, rep(1, max(1L, n_data)))

#' Indentation level encoded in a rendered row label
#'
#' [indent_label()] prefixes labels with runs of three non-breaking spaces
#' because that is what survives HTML whitespace collapsing. RTF has real
#' indentation, so the level is recovered here and the non-breaking spaces are
#' dropped — a submission RTF must not carry an HTML rendering trick in its text.
#' @noRd
rtf_indent_level <- function(label) {
  nbsp <- vapply(gregexpr("\u00a0", label), function(m) sum(m > 0), numeric(1))
  as.integer(floor(nbsp / 3))
}

#' Strip the HTML indentation prefix from a label
#' @noRd
rtf_plain_label <- function(label) trimws(gsub("\u00a0", "", label))

#' Twips of left indent per nesting level
#' @noRd
rtf_indent_twips <- function() 150L

#' Encode text for RTF
#'
#' RTF is a 7-bit format: the control characters `\`, `{` and `}` have to be
#' escaped, and anything outside ASCII travels as a `\uc1\uNNNN?` escape with an
#' ASCII fallback character. CSR display text is full of both — em dashes in
#' subtitles, `≥` in AE row labels — and passing them through raw produces a file
#' that opens with mangled characters in a reviewer's Word rather than one that
#' fails loudly. So encoding happens here, on every string that enters the
#' document, and is asserted by the test suite.
#'
#' @param text Character vector.
#' @return `text` with RTF control characters and non-ASCII code points escaped.
#' @noRd
rtf_escape_text <- function(text) {
  vapply(as.character(text), function(x) {
    if (is.na(x)) {
      return("")
    }
    x <- gsub("\\", "\\\\", x, fixed = TRUE)
    x <- gsub("{", "\\{", x, fixed = TRUE)
    x <- gsub("}", "\\}", x, fixed = TRUE)
    if (!grepl("[^\x01-\x7f]", x, useBytes = FALSE)) {
      return(x)
    }
    chars <- strsplit(x, "")[[1]]
    points <- utf8ToInt(x)
    encoded <- ifelse(
      points < 128L, chars,
      paste0("\\uc1\\u", ifelse(points <= 32768L, points, points - 65536L), "?")
    )
    paste0(encoded, collapse = "")
  }, character(1), USE.NAMES = FALSE)
}

#' Header lines for an RTF display
#'
#' Two rows rather than one cell with a line break: the column name and the
#' `(N=…)` count are separate header rows in every CSR house style, and keeping
#' them separate is also what lets a reviewer's RTF reader wrap the name without
#' orphaning the count.
#' @noRd
rtf_headers <- function(columns) {
  levels <- rtf_escape_text(as.character(columns$levels))
  counts <- columns$n
  names <- paste(c("", levels), collapse = " | ")
  has_counts <- !is.null(counts) && any(!is.na(counts))
  if (!has_counts) {
    return(list(names = names, counts = NULL))
  }
  formatted <- vapply(seq_along(levels), function(i) {
    if (is.na(counts[i])) "" else paste0("(N=", format(counts[i], trim = TRUE), ")")
  }, character(1))
  list(names = names, counts = paste(c("", formatted), collapse = " | "))
}

#' Render a display as a submission-format RTF
#'
#' The RTF artifact is the same display the HTML renderer produces, in the format
#' statisticians and regulatory reviewers actually exchange. It is built from the
#' **rendered cell table** — the output of [render_display()], which is itself
#' built from the committed ARD — so an RTF can never disagree with the HTML
#' beside it: neither renderer touches subject-level data, and both consume the
#' same cells.
#'
#' Titles, footnotes and the source line come from `display.yaml`, so an RTF
#' carries the same declared provenance the HTML shows.
#'
#' @param display An `opencsr_display` from [render_display()].
#' @param display_spec Validated display spec (see [read_display_spec()]).
#' @param orientation Page orientation; landscape suits treatment-arm columns.
#'
#' @return A length-one character string: a complete RTF document.
#' @examples
#' \dontrun{
#' disp <- render_display(read_ard("outputs/t-ae-overview/v001/ard.json"),
#'                        read_display_spec("t-ae-overview"))
#' writeLines(render_rtf(disp, read_display_spec("t-ae-overview")), "table.rtf")
#' }
#' @export
render_rtf <- function(display, display_spec, orientation = "landscape") {
  if (!inherits(display, "opencsr_display")) {
    stop("render_rtf() needs an opencsr_display from render_display().", call. = FALSE)
  }
  tbl <- as.data.frame(display$table, stringsAsFactors = FALSE)
  if (!nrow(tbl)) {
    stop("Display '", display$id, "' has no rows to render as RTF.", call. = FALSE)
  }
  data_cols <- setdiff(names(tbl), "label")
  widths <- rtf_col_widths(length(data_cols))

  levels <- rtf_indent_level(tbl$label)
  tbl$label <- rtf_plain_label(tbl$label)
  # A listing's stub column is a record number; everything else is a row label.
  body <- tbl[, c("label", data_cols), drop = FALSE]
  body[] <- lapply(body, function(col) {
    col <- as.character(col)
    col[is.na(col)] <- ""
    rtf_escape_text(col)
  })

  indent <- matrix(0L, nrow = nrow(body), ncol = ncol(body))
  indent[, 1] <- levels * rtf_indent_twips()

  headers <- rtf_headers(display$columns)
  subtitle <- paste0("Study ", display_spec$study, " — ", display_spec$population_label)

  vcfg <- display_spec$variants[[display$variant]] %||% list()
  notes <- c(as.character(vcfg$footnotes %||% character(0)), as.character(display_spec$footnotes %||% character(0)))
  source_note <- display_spec$source %||% paste0("Data cut-off: ", display_spec$cutoff, ".")
  # {r2rtf} reads `_` as subscript markup, so the variant name travels in its
  # hyphenated form — "in-text" rather than a mangled "in\\sub text".
  provenance_note <- paste0(
    "open.csr display ", display_spec$id, " (", gsub("_", "-", display$variant),
    " variant); generated from the committed ARD."
  )

  doc <- r2rtf::rtf_page(body, orientation = orientation)
  doc <- r2rtf::rtf_title(doc, rtf_escape_text(display$title), rtf_escape_text(subtitle))
  doc <- r2rtf::rtf_colheader(doc, headers$names, col_rel_width = widths)
  if (!is.null(headers$counts)) {
    doc <- r2rtf::rtf_colheader(doc, headers$counts, col_rel_width = widths, border_top = "")
  }
  doc <- r2rtf::rtf_body(
    doc,
    col_rel_width = widths,
    text_justification = c("l", rep("c", length(data_cols))),
    text_indent_left = indent
  )
  # One call, every note: {r2rtf} attaches footnotes as an attribute, so calling
  # rtf_footnote() per note keeps only the last one.
  if (length(notes)) doc <- r2rtf::rtf_footnote(doc, rtf_escape_text(notes))
  doc <- r2rtf::rtf_source(doc, rtf_escape_text(paste(c(source_note, provenance_note), collapse = " ")))

  paste(unlist(r2rtf::rtf_encode(doc)), collapse = "\n")
}

#' Write a rendered display to an RTF file
#'
#' @param display An `opencsr_display`.
#' @param display_spec Validated display spec.
#' @param path Destination `.rtf` path.
#' @return `path`, invisibly.
#' @noRd
write_rtf_display <- function(display, display_spec, path) {
  writeLines(render_rtf(display, display_spec), path)
  invisible(path)
}
