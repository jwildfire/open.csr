#' opencsr: the R spine of open.csr
#'
#' `opencsr` turns public ADaM data into Analysis Results Data and rendered
#' displays under a contract that makes every number traceable:
#'
#' \enumerate{
#'   \item [prepare_data()] derives and stamps the analysis datasets;
#'   \item [build_ard()] interprets `analysis.yaml` into `{cards}` calls;
#'   \item [write_ard()] serialises the result with a provenance envelope;
#'   \item [render_display()] turns ARD plus `display.yaml` into `{gt}` HTML;
#'   \item [regenerate()] runs the whole loop into a new numbered iteration.
#' }
#'
#' Display code never sees subject-level data, and the pipeline is the only
#' thing that writes to `outputs/` — the two properties that make the
#' change-request loop auditable.
#'
#' @keywords internal
"_PACKAGE"
