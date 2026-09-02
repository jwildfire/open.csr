# Subject disposition counts for the flow figure (Figure 10-1 of the reference
# report). Five numbers, each a count of subjects: screened (every subject in
# DM), screen failures (DM's own arm label), randomised into the treatment phase
# (every subject in ADSL), completed Week 24 (COMP24FL) and completed the study
# through Week 26 (the complement of DISCONFL, the definition the populations
# table states for "Complete Study").
#
# Contract: (data, spec, denominator) -> a {cards}-shaped ARD. `data` is DM,
# whole; `denominator` is the prepared ADSL.

ard_disposition_flow <- function(data, spec, denominator) {
  blank_na <- function(x) {
    x <- as.character(x)
    x[is.na(x)] <- ""
    x
  }
  screened <- length(unique(data$USUBJID))
  screen_failures <- length(unique(data$USUBJID[blank_na(data$ARM) == "Screen Failure"]))
  randomised <- length(unique(denominator$USUBJID))
  completed_wk24 <- sum(blank_na(denominator$COMP24FL) == "Y")
  completed_study <- sum(blank_na(denominator$DISCONFL) != "Y")
  stages <- c(
    screened = screened, screen_failures = screen_failures, randomised = randomised,
    completed_wk24 = completed_wk24, completed_study = completed_study
  )
  data.frame(
    group1 = "population",
    group1_level = "All Subjects",
    group2 = NA_character_,
    group2_level = NA_character_,
    variable = "DSFLOW",
    variable_level = names(stages),
    context = "subject_count",
    stat_name = "n",
    stat_label = "n",
    stat = I(as.list(unname(stages))),
    warning = NA_character_,
    error = NA_character_,
    stringsAsFactors = FALSE
  )
}
