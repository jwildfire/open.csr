# Display-specific statistics (contract section 2).
#
# Thin wrappers, as the ADAS-Cog displays are: the statistics live in {opencsr}
# so they are tested once and shared, and every model term and every derivation
# rule is declared in this display's analysis.yaml rather than written here.
#
# The secondary efficacy endpoint is a statistic of a subject, not of a record —
# the mean of that subject's available total scores over the Week 4 to Week 24
# windows — so both functions collapse the records to one per subject before
# anything is computed. `derive_subject_summary()` refuses to carry a column
# that varies inside a subject, which is what stops the covariate in the model
# below from silently depending on record order.

subject_mean <- function(data, spec, denominator = NULL) {
  opencsr::ard_derived_continuous(data, spec, denominator)
}

subject_mean_ancova <- function(data, spec, denominator = NULL) {
  opencsr::ard_derived_ancova(data, spec, denominator)
}

population_n <- function(data, spec, denominator = NULL) {
  opencsr::ard_population_n(data, spec, denominator)
}
