#!/usr/bin/env Rscript

# Rebuild every committed artefact under outputs/ from the specs in library/tfl/.
#
#   Rscript qc/regenerate-library.R
#
# This is the "agents write source, the pipeline writes outputs" rule made
# executable: the whole outputs/ tree is reproducible from the two YAML files per
# display plus the pinned data package.
#
# t-ae-common is regenerated twice on purpose. Its committed history is the
# worked example of the change-request loop (design §4.3): v001 is the display as
# first specified, v002 is the display after a medical-writer change request was
# applied as a spec edit. The script replays that history so the iteration ledger
# on disk is a real record rather than a hand-written one.

suppressWarnings(suppressMessages(library(pkgload)))

root <- normalizePath(file.path(dirname(sub("^--file=", "", grep("^--file=", commandArgs(FALSE), value = TRUE)[1])), ".."))
options(opencsr.root = root)
pkgload::load_all(file.path(root, "pipeline"), quiet = TRUE)

# ---- start from a clean tree ------------------------------------------------

unlink(list.files(file.path(root, "outputs"), full.names = TRUE), recursive = TRUE)
for (slug in display_slugs(root)) {
  unlink(file.path(display_dir(slug, root), "iterations.yaml"))
}

specs <- lapply(display_slugs(root), function(s) read_analysis_spec(s, root))
needed <- unique(c("adsl", unlist(lapply(specs, function(s) c(s$dataset, s$denominator)))))
message("Preparing data: ", paste(needed, collapse = ", "))
data <- prepare_data(datasets = needed)

# ---- five displays, one iteration each --------------------------------------

initial <- c("t-demographics", "t-disposition", "t-exposure", "t-ae-overview", "l-ae-serious")
for (slug in initial) {
  m <- regenerate(
    slug, root,
    change_request = paste0(
      "Initial generation of ", read_analysis_spec(slug, root)$regulatory_id,
      " from the statistical analysis plan shell."
    ),
    actor = "@jwildfire", data = data
  )
  message(sprintf("%-16s %s  %d ARD rows", slug, m$version, m$ard_rows))
}

# ---- t-ae-common: the change-request loop, replayed -------------------------

ae_dir <- display_dir("t-ae-common", root)
analysis_path <- file.path(ae_dir, "analysis.yaml")
display_path <- file.path(ae_dir, "display.yaml")
after <- list(analysis = readLines(analysis_path), display = readLines(display_path))

# v001: the display as originally specified — no pooled Total column.
before_analysis <- sub("^total: true$", "total: false", after$analysis)
before_display <- sub(
  '^  order: \\[Placebo, "Xanomeline Low Dose", "Xanomeline High Dose", Total\\]$',
  '  order: [Placebo, "Xanomeline Low Dose", "Xanomeline High Dose"]',
  after$display
)
before_display <- before_display[!grepl("^  - \"The Total column pools", before_display)]
stopifnot(!identical(before_analysis, after$analysis), !identical(before_display, after$display))

writeLines(before_analysis, analysis_path)
writeLines(before_display, display_path)
m1 <- regenerate(
  "t-ae-common", root,
  change_request = paste(
    "Initial generation of AET02 from the statistical analysis plan shell:",
    "treatment-emergent adverse events by system organ class and preferred term,",
    "with a 5% threshold on the in-text variant."
  ),
  actor = "@jwildfire", data = data
)
message(sprintf("%-16s %s  %d ARD rows", "t-ae-common", m1$version, m1$ard_rows))

# v002: the change request, applied as a spec edit and regenerated.
writeLines(after$analysis, analysis_path)
writeLines(after$display, display_path)
m2 <- regenerate(
  "t-ae-common", root,
  change_request = paste(
    "Change request CR-001 (medical writer, Section 12.2.1 review):",
    "add an All Subjects (Total) column to AET02 so the in-text summary can quote",
    "a pooled overall rate alongside the by-arm rates.",
    "Applied as a spec edit - analysis.yaml `total: false` -> `true`,",
    "display.yaml `columns.order` gains Total - and regenerated; no output was hand-edited."
  ),
  actor = "@medical-writer", data = data
)
message(sprintf("%-16s %s  %d ARD rows", "t-ae-common", m2$version, m2$ard_rows))

message("\nLibrary regenerated: ", length(display_slugs(root)), " displays.")
