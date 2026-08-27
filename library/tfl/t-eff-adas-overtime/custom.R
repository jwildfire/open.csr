# Display-specific statistics (contract section 2).
#
# Both functions are thin wrappers: the statistics themselves live in
# {opencsr} so that the seven ADAS-Cog displays share one tested
# implementation, and every model term is declared in this display's
# analysis.yaml rather than written in code.

ancova_change <- function(data, spec, denominator = NULL) {
  opencsr::ard_ancova(data, spec, denominator)
}

population_n <- function(data, spec, denominator = NULL) {
  opencsr::ard_population_n(data, spec, denominator)
}
