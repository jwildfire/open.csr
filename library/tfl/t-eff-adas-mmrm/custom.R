# Display-specific statistics (contract section 2).
#
# Thin wrappers, as the other ADAS-Cog displays are: the statistics live in
# {opencsr} so they are tested once and shared, and every model term — the
# factors, the covariate, which of them interact with visit, and which visits
# the least-squares means average over — is declared in this display's
# analysis.yaml rather than written here.

mmrm_change <- function(data, spec, denominator = NULL) {
  opencsr::ard_mmrm(data, spec, denominator)
}

population_n <- function(data, spec, denominator = NULL) {
  opencsr::ard_population_n(data, spec, denominator)
}
