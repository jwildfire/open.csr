#!/usr/bin/env Rscript
# Vendor the PHUSE CDISCPILOT01 ADaM package into pipeline/inst/extdata/.
#
# Re-runnable. Downloads each .xpt from phuse-org/phuse-scripts at a pinned
# commit, verifies that git's blob SHA-1 of the downloaded bytes equals the SHA
# recorded in that commit's tree (so the vendored copy is provably byte-identical
# to the upstream file, not merely "looks right"), gzips it, and rewrites
# PROVENANCE.json.
#
# Usage: Rscript qc/vendor-phuse-data.R [--check]
#   --check  verify the vendored files against PROVENANCE.json without network.

args <- commandArgs(trailingOnly = TRUE)
check_only <- "--check" %in% args

root <- normalizePath(file.path(dirname(sub("^--file=", "", grep("^--file=", commandArgs(FALSE), value = TRUE)[1])), ".."), mustWork = FALSE)
if (!dir.exists(file.path(root, "pipeline"))) root <- normalizePath(getwd())
dest <- file.path(root, "pipeline", "inst", "extdata", "phuse-cdiscpilot01")

REPO <- "phuse-org/phuse-scripts"
COMMIT <- "398a6d33ced9359ffb58c46650a6d488811176b1"

# dataset -> upstream path within the repo, at COMMIT
FILES <- c(
  adsl     = "data/adam/cdiscpilot01/adsl.xpt",
  adae     = "data/adam/cdiscpilot01/adae.xpt",
  advs     = "data/adam/cdiscpilot01/advs.xpt",
  adlbc    = "data/adam/cdiscpilot01/adlbc.xpt",
  adlbh    = "data/adam/cdiscpilot01/adlbh.xpt",
  adlbhy   = "data/adam/cdiscpilot01/adlbhy.xpt",
  adqsadas = "data/adam/cdiscpilot01/adqsadas.xpt",
  adqscibc = "data/adam/cdiscpilot01/adqscibc.xpt",
  adqsnpix = "data/adam/cdiscpilot01/adqsnpix.xpt",
  adtte    = "data/adam/cdiscpilot01/adtte.xpt",
  adcm     = "data/adam/cdisc/adcm.xpt",
  # The study's own SDTM medications and demographics domains (#65, #63): ADCM
  # is derived from CM rather than taken from the relabelled PHUSE copy, and DM
  # carries the screened subjects the ADaM package does not.
  cm       = "data/sdtm/cdiscpilot01/cm.xpt",
  dm       = "data/sdtm/cdiscpilot01/dm.xpt"
)

git_blob_sha1 <- function(path) {
  raw <- readBin(path, "raw", file.size(path))
  header <- c(charToRaw(paste0("blob ", length(raw))), as.raw(0L))
  digest::digest(c(header, raw), algo = "sha1", serialize = FALSE)
}

sha256_file <- function(path) digest::digest(file = path, algo = "sha256")

prov_path <- file.path(dest, "PROVENANCE.json")

if (check_only) {
  prov <- jsonlite::fromJSON(prov_path, simplifyVector = FALSE)
  bad <- character(0)
  for (f in prov$files) {
    p <- file.path(dest, f$vendored)
    if (!file.exists(p)) { bad <- c(bad, paste0(f$vendored, ": missing")); next }
    if (!identical(sha256_file(p), f$gz_sha256)) {
      bad <- c(bad, paste0(f$vendored, ": gz sha256 mismatch"))
    }
    raw <- tryCatch(
      memDecompress(readBin(p, "raw", file.size(p)), type = "gzip"),
      error = function(e) NULL
    )
    if (is.null(raw)) {
      bad <- c(bad, paste0(f$vendored, ": not readable as gzip"))
    } else if (!identical(digest::digest(raw, algo = "sha256", serialize = FALSE), f$sha256)) {
      bad <- c(bad, paste0(f$vendored, ": decompressed sha256 mismatch"))
    }
  }
  if (length(bad)) { cat(paste(bad, collapse = "\n"), "\n"); quit(status = 1) }
  cat("OK: ", length(prov$files), " vendored files match PROVENANCE.json\n", sep = "")
  quit(status = 0)
}

dir.create(dest, recursive = TRUE, showWarnings = FALSE)

# The commit's recursive tree gives the authoritative blob SHA for each path.
tree <- jsonlite::fromJSON(
  sprintf("https://api.github.com/repos/%s/git/trees/%s?recursive=1", REPO, COMMIT),
  simplifyVector = TRUE
)
if (isTRUE(tree$truncated)) stop("Upstream tree listing was truncated; cannot verify blob SHAs.")
tree_sha <- stats::setNames(tree$tree$sha, tree$tree$path)

entries <- list()
for (nm in names(FILES)) {
  upstream <- FILES[[nm]]
  expected <- tree_sha[[upstream]]
  if (is.null(expected) || is.na(expected)) stop("Path not present at ", COMMIT, ": ", upstream)
  tmp <- tempfile(fileext = ".xpt")
  utils::download.file(
    sprintf("https://raw.githubusercontent.com/%s/%s/%s", REPO, COMMIT, upstream),
    tmp, quiet = TRUE, mode = "wb"
  )
  got <- git_blob_sha1(tmp)
  if (!identical(got, expected)) {
    stop("Blob SHA mismatch for ", upstream, ": upstream ", expected, ", downloaded ", got)
  }
  out <- file.path(dest, paste0(nm, ".xpt.gz"))
  raw <- readBin(tmp, "raw", file.size(tmp))
  con <- gzfile(out, "wb", compression = 9)
  writeBin(raw, con)
  close(con)
  entries[[length(entries) + 1]] <- list(
    dataset = nm,
    upstream_path = upstream,
    blob_sha1 = unname(expected),
    sha256 = digest::digest(raw, algo = "sha256", serialize = FALSE),
    bytes = length(raw),
    vendored = basename(out),
    gz_sha256 = sha256_file(out),
    gz_bytes = as.integer(file.size(out))
  )
  cat(sprintf("  %-9s %9d -> %7d bytes\n", nm, length(raw), file.size(out)))
  unlink(tmp)
}

jsonlite::write_json(
  list(
    source_repo = paste0("https://github.com/", REPO),
    commit = COMMIT,
    commit_date = "2025-08-25T14:48:53Z",
    retrieved = format(Sys.Date()),
    licence = "MIT",
    licence_file = "LICENSE-phuse-scripts.md",
    licence_url = sprintf("https://github.com/%s/blob/%s/LICENSE.md", REPO, COMMIT),
    verification = paste(
      "Each vendored file's git blob SHA-1 was recomputed from the downloaded",
      "bytes and matched against the SHA recorded in the commit's recursive tree."
    ),
    files = entries
  ),
  prov_path, auto_unbox = TRUE, pretty = TRUE
)
cat("wrote ", prov_path, "\n", sep = "")
