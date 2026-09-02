#' Where each demonstration dataset comes from
#'
#' open.csr's demonstration study is CDISCPILOT01 (the CDISC pilot submission's
#' xanomeline Alzheimer's study). Two public packagings of that study are
#' available, and they are not interchangeable:
#'
#' \describe{
#'   \item{`"pharmaverseadam"`}{The pharmaverse's re-derivation, built from
#'     `{pharmaversesdtm}` with `{admiral}`. It ships `adex` (which the CDISC
#'     pilot package does not), still contains the 52 screen failures, and
#'     carries no `ITTFL`/`EFFFL`, no `DCDECOD`, and no efficacy domains.}
#'   \item{`"phuse"`}{The CDISC pilot submission's *own* ADaM package, vendored
#'     from `phuse-org/phuse-scripts` (MIT). Ten datasets — the ten documented
#'     in the study's `define.xml` — plus `adcm`, which PHUSE added and the
#'     pilot package does not contain. Screen failures are already excluded,
#'     and the study's own population flags and discontinuation reasons are
#'     present.}
#' }
#'
#' The two disagree on figures open.csr publishes; the divergences are measured
#' and recorded in `quality/data/source-agreement.json` and reproduced by
#' `qc/source-agreement.R`. Because of that, the default registry does **not**
#' move any domain that `{pharmaverseadam}` already served — the six committed
#' displays keep the inputs they were approved against — and only adds the
#' domains `{pharmaverseadam}` has no answer for.
#'
#' @param source `NULL` for the default mixed registry; `"pharmaverseadam"` or
#'   `"phuse"` to take every dataset from one source; or a named character
#'   vector of per-dataset overrides applied on top of the default.
#'
#' @return A named character vector mapping dataset name to source id.
#' @examples
#' data_sources()[c("adae", "adqsadas")]
#' data_sources("phuse")[["adsl"]]
#' @export
data_sources <- function(source = NULL) {
  # What the pharmaverse re-derivation can serve, and the two datasets only it
  # serves. Since v0.4.0 the study's own package is the default for everything
  # it publishes (D0032 R2, #60): the re-derivation assigns twelve subjects to a
  # different actual treatment, and a report that read both told two versions
  # of the study. ADEX and ADLB have no pilot equivalent and no display reads
  # them; they stay reachable so the alternate lane can still be measured.
  pv <- c("adsl", "adae", "adex", "adlb", "advs")
  pv_only <- c("adex", "adlb")
  ph <- phuse_datasets()
  default <- c(
    stats::setNames(rep("phuse", length(ph)), ph),
    stats::setNames(rep("pharmaverseadam", length(pv_only)), pv_only)
  )
  if (is.null(source)) {
    return(default)
  }
  if (length(source) == 1 && is.null(names(source))) {
    if (identical(source, "pharmaverseadam")) {
      return(stats::setNames(rep("pharmaverseadam", length(pv)), pv))
    }
    if (identical(source, "phuse")) {
      return(stats::setNames(rep("phuse", length(ph)), ph))
    }
    stop(
      "Unknown data source '", source, "'. Known sources: pharmaverseadam, phuse. ",
      "Pass a named vector for per-dataset overrides.",
      call. = FALSE
    )
  }
  if (is.null(names(source)) || any(!nzchar(names(source)))) {
    stop("`source` must be a single source id or a fully named character vector.", call. = FALSE)
  }
  bad <- setdiff(unname(source), c("pharmaverseadam", "phuse"))
  if (length(bad)) {
    stop("Unknown data source(s): ", paste(unique(bad), collapse = ", "), ".", call. = FALSE)
  }
  # `out[names(source)] <- ...` would silently *add* an unrecognised dataset
  # name to the registry, so a typo would look like a successful override and
  # only surface as a confusing prepare_data() error later.
  unknown <- setdiff(names(source), names(default))
  if (length(unknown)) {
    stop(
      "Unknown dataset(s) in a source override: ", paste(unknown, collapse = ", "),
      ". Known datasets: ", paste(sort(names(default)), collapse = ", "), ".",
      call. = FALSE
    )
  }
  out <- default
  out[names(source)] <- unname(source)
  out
}

#' Directory holding the vendored PHUSE CDISCPILOT01 ADaM package
#' @noRd
phuse_dir <- function() {
  path <- system.file("extdata", "phuse-cdiscpilot01", package = "opencsr")
  if (!nzchar(path) || !dir.exists(path)) {
    stop(
      "The vendored PHUSE CDISCPILOT01 data is not installed with {opencsr}. ",
      "Run `Rscript qc/vendor-phuse-data.R` from the repository root.",
      call. = FALSE
    )
  }
  path
}

#' Provenance record for the vendored PHUSE data
#'
#' Reads `PROVENANCE.json` from the vendored data directory: the upstream repo,
#' the pinned commit, the licence, and per-file git blob SHA-1 and SHA-256
#' digests. `qc/vendor-phuse-data.R` writes it; nothing else should.
#'
#' @return A list with `source_repo`, `commit`, `licence` and `files`.
#' @examples
#' phuse_provenance()$commit
#' @export
phuse_provenance <- function() {
  jsonlite::fromJSON(file.path(phuse_dir(), "PROVENANCE.json"), simplifyVector = FALSE)
}

#' Dataset names available from the vendored PHUSE package
#'
#' @return A character vector, in the order recorded in `PROVENANCE.json`.
#' @examples
#' phuse_datasets()
#' @export
phuse_datasets <- function() {
  vapply(phuse_provenance()$files, function(f) f$dataset, character(1))
}

#' Read one vendored PHUSE dataset, exactly as published upstream
#'
#' Decompresses the vendored `.xpt.gz` in memory and parses it with
#' [haven::read_xpt()]. No derivation is applied — this is the raw upstream
#' file. [prepare_data()] is the layer that derives.
#'
#' @param name Dataset name, one of [phuse_datasets()].
#' @param verify Recompute the file's SHA-256 and compare it with the value
#'   recorded in `PROVENANCE.json` before parsing.
#'
#' @return A tibble.
#' @examples
#' \dontrun{
#' read_phuse("adqsadas")
#' }
#' @export
read_phuse <- function(name, verify = FALSE) {
  prov <- phuse_provenance()
  entry <- Filter(function(f) identical(f$dataset, name), prov$files)
  if (!length(entry)) {
    stop(
      "'", name, "' is not a vendored PHUSE dataset. Available: ",
      paste(phuse_datasets(), collapse = ", "), ".",
      call. = FALSE
    )
  }
  entry <- entry[[1]]
  path <- file.path(phuse_dir(), entry$vendored)
  if (!file.exists(path)) {
    stop("Vendored file is missing: ", path, call. = FALSE)
  }
  raw <- memDecompress(readBin(path, "raw", file.size(path)), type = "gzip")
  if (isTRUE(verify)) {
    got <- digest::digest(raw, algo = "sha256", serialize = FALSE)
    if (!identical(got, entry$sha256)) {
      stop(
        "Vendored '", name, "' does not match its recorded SHA-256 ",
        "(recorded ", entry$sha256, ", read ", got, ").",
        call. = FALSE
      )
    }
  }
  haven::read_xpt(raw)
}

#' Source label recorded in the data manifest for a source id
#'
#' The manifest's `source_pkg`/`source_version` pair is the head of the
#' traceability chain written into every `ard.json`. For `{pharmaverseadam}` it
#' is the package name and version; for the vendored PHUSE data there is no
#' package, so it is the upstream repository path and the pinned commit.
#'
#' @noRd
source_label <- function(source, source_pkg = "pharmaverseadam") {
  if (identical(source, "phuse")) {
    prov <- phuse_provenance()
    return(c(
      pkg = "phuse-org/phuse-scripts:data/adam",
      version = prov$commit
    ))
  }
  c(pkg = source_pkg, version = as.character(utils::packageVersion(source_pkg)))
}
