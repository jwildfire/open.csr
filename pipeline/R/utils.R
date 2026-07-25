#' @importFrom rlang .data %||%
NULL

#' Round half away from zero ("half up")
#'
#' R's [base::round()] implements IEEE 754 round-half-to-even ("banker's
#' rounding"): `round(2.5)` is `2`, not `3`. SAS — and therefore essentially
#' every legacy clinical-trial reporting program — rounds half away from zero.
#' Reproducing SAS numbers in R requires the SAS rule, so every number rendered
#' by open.csr goes through this function rather than [base::round()].
#'
#' A relative tolerance is applied before truncation so that decimal values
#' whose binary representation falls a fraction below the exact half (for
#' example `2.675`, stored as `2.67499999999999982…`) still round up, matching
#' the decimal arithmetic SAS performs.
#'
#' @param x Numeric vector.
#' @param digits Integer number of decimal places. May be negative.
#'
#' @return A numeric vector the same length as `x`; `NA` is preserved.
#' @examples
#' round_half_up(c(0.5, 1.5, 2.5, -2.5))  # 1 2 3 -3   (base::round gives 0 2 2 -2)
#' round_half_up(2.675, 2)                # 2.68       (base::round gives 2.67)
#' @export
round_half_up <- function(x, digits = 0) {
  if (!is.numeric(x)) {
    stop("`x` must be numeric.", call. = FALSE)
  }
  scale <- 10^digits
  z <- abs(x) * scale
  # Nudge by a relative tolerance (~4.4e-16 per unit) so that values that are
  # exactly .5 in decimal but a hair below .5 in binary round up.
  z <- z * (1 + 2 * .Machine$double.eps)
  out <- sign(x) * floor(z + 0.5) / scale
  out[is.na(x)] <- NA_real_
  out[!is.finite(x)] <- x[!is.finite(x)]
  out
}

#' Default number of decimal places for a statistic
#'
#' Implements the collected-precision conventions used across the pharmaverse
#' (`tfrmt_sigdig`): counts are integers, percentages carry one decimal,
#' min/max are reported at collected precision, mean/median at +1 decimal and
#' sd/se at +2 decimals.
#'
#' @param stat_name Statistic name, e.g. `"mean"`.
#' @return Integer number of decimals.
#' @noRd
default_digits <- function(stat_name) {
  switch(stat_name,
    n = 0L, N = 0L, N_obs = 0L, N_miss = 0L, n_obs = 0L,
    p = 1L, pct = 1L,
    min = 0L, max = 0L,
    mean = 1L, median = 1L, p25 = 1L, p75 = 1L,
    sd = 2L, se = 2L,
    1L
  )
}

#' Statistics reported as proportions by `{cards}`
#' @noRd
proportion_stats <- function() c("p", "prop")

#' SHA-256 of a file's contents
#' @noRd
hash_file <- function(path) {
  if (!file.exists(path)) {
    stop("Cannot hash missing file: ", path, call. = FALSE)
  }
  paste0("sha256:", digest::digest(file = path, algo = "sha256"))
}

#' SHA-256 of an R object
#' @noRd
hash_object <- function(x) {
  paste0("sha256:", digest::digest(x, algo = "sha256"))
}

#' Locate the open.csr repository root
#'
#' Resolution order: the `path` argument, the `opencsr.root` option, the
#' `OPENCSR_ROOT` environment variable, then a walk up from the working
#' directory looking for the repository markers (`library/tfl` and
#' `docs/design/contracts.md`).
#'
#' @param path Optional explicit root.
#' @return Absolute path to the repository root.
#' @export
csr_root <- function(path = NULL) {
  if (!is.null(path)) {
    return(normalizePath(path, mustWork = TRUE))
  }
  opt <- getOption("opencsr.root", Sys.getenv("OPENCSR_ROOT", ""))
  if (nzchar(opt)) {
    return(normalizePath(opt, mustWork = TRUE))
  }
  dir <- normalizePath(getwd(), mustWork = TRUE)
  repeat {
    if (dir.exists(file.path(dir, "library", "tfl")) &&
      file.exists(file.path(dir, "docs", "design", "contracts.md"))) {
      return(dir)
    }
    parent <- dirname(dir)
    if (identical(parent, dir)) break
    dir <- parent
  }
  stop(
    "Could not locate the open.csr repository root. ",
    "Set options(opencsr.root = '/path/to/open.csr').",
    call. = FALSE
  )
}

#' Current git commit, or NULL when the tree is dirty
#'
#' Per contract §5 the recorded commit is `NULL` unless the working tree is
#' clean, so a hash in an artefact always identifies reproducible source.
#'
#' @param root Repository root.
#' @return A commit SHA, or `NULL`.
#' @noRd
git_commit <- function(root = csr_root()) {
  git <- Sys.which("git")
  if (!nzchar(git)) {
    return(NULL)
  }
  status <- suppressWarnings(system2(
    git, c("-C", shQuote(root), "status", "--porcelain"),
    stdout = TRUE, stderr = FALSE
  ))
  if (!is.null(attr(status, "status")) && attr(status, "status") != 0) {
    return(NULL)
  }
  if (length(status) > 0) {
    return(NULL)
  }
  sha <- suppressWarnings(system2(
    git, c("-C", shQuote(root), "rev-parse", "HEAD"),
    stdout = TRUE, stderr = FALSE
  ))
  if (length(sha) != 1 || !nzchar(sha)) {
    return(NULL)
  }
  sha
}

#' Environment provenance block
#' @noRd
environment_block <- function(pkgs = c(
                                "cards", "cardx", "gtsummary", "gt", "dplyr",
                                "pharmaverseadam", "jsonlite", "yaml", "digest"
                              )) {
  versions <- list()
  for (p in pkgs) {
    v <- tryCatch(as.character(utils::packageVersion(p)), error = function(e) NULL)
    if (!is.null(v)) versions[[p]] <- v
  }
  list(
    r = paste(R.version$major, R.version$minor, sep = "."),
    os = paste(Sys.info()[["sysname"]], Sys.info()[["release"]]),
    packages = versions
  )
}

#' ISO-8601 UTC timestamp
#' @noRd
iso_now <- function() {
  format(as.POSIXlt(Sys.time(), tz = "UTC"), "%Y-%m-%dT%H:%M:%SZ")
}

#' Coerce a `{cards}` list-column to an atomic character vector
#' @noRd
list_col_chr <- function(x) {
  if (is.null(x)) {
    return(character(0))
  }
  if (!is.list(x)) {
    return(as.character(x))
  }
  vapply(
    x,
    function(el) {
      if (is.null(el) || length(el) == 0) {
        return(NA_character_)
      }
      paste(as.character(el), collapse = "; ")
    },
    character(1)
  )
}

#' Read a YAML file, erroring helpfully when it is missing
#' @noRd
read_yaml_file <- function(path) {
  if (!file.exists(path)) {
    stop("Spec file not found: ", path, call. = FALSE)
  }
  yaml::read_yaml(path)
}

#' Write a YAML file with stable formatting
#' @noRd
write_yaml_file <- function(x, path) {
  writeLines(yaml::as.yaml(x, indent = 2), path)
  invisible(path)
}
