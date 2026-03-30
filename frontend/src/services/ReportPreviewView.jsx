import { getHistoryReportExcelUrl, getHistoryReportPdfUrl } from './api'

function formatValue(value, digits = 2) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return 'N/A'
  }

  return Number(value).toFixed(digits)
}

function formatPercent(value, digits = 1) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return 'N/A'
  }

  return `${(Number(value) * 100).toFixed(digits)}%`
}

function formatGeneratedDate(value) {
  if (!value) {
    return 'N/A'
  }

  const isoDate = String(value).split('T')[0]
  return isoDate || 'N/A'
}

export default function ReportPreviewView({ report, historyId }) {
  if (!report) return null

  const summary = report.summary || {}
  const location = report.location || {}
  const simulation = report.simulation || {}
  const confidenceRange = summary.detection_confidence_range
  const yieldRiskAssumptions = summary.yield_risk_assumptions
  const recommendationAreas = report.recommendation_areas || []
  const contextualRecommendations = recommendationAreas.map((entry) => entry.action)
  const infectedAreaLabels = summary.detected_areas || []

  return (
    <div className="results-page report-preview-page">
      <div className="results-header">
        <h1 className="results-title">Report Preview</h1>
        <p className="results-subtitle">
          This is the structured report payload that will be used for PDF export.
        </p>
        {historyId ? (
          <div className="report-preview-actions">
            <a
              className="report-preview-download report-preview-download-secondary"
              href={getHistoryReportPdfUrl(historyId)}
              target="_blank"
              rel="noreferrer"
            >
              Download PDF
            </a>
            <a
              className="report-preview-download report-preview-download-secondary"
              href={getHistoryReportExcelUrl(historyId)}
              target="_blank"
              rel="noreferrer"
            >
              Download Data in Excel
            </a>
          </div>
        ) : null}
      </div>

      <div className="report-preview-grid">
        <section className="report-preview-card">
          <h3>Summary</h3>
          <ul className="report-preview-list">
            <li><strong>Title:</strong> {report.title || 'Untitled report'}</li>
            <li><strong>Generated Date:</strong> {formatGeneratedDate(report.generated_at)}</li>
            <li><strong>Risk band:</strong> {summary.risk_band || 'N/A'}</li>
            <li><strong>Average risk score:</strong> {formatPercent(summary.average_risk_score, 1)}</li>
            <li><strong>Infected trees:</strong> {summary.infected_tree_count ?? 'N/A'}</li>
            <li>
              <strong>Detected areas:</strong>{' '}
              {infectedAreaLabels.length ? infectedAreaLabels.join(', ') : 'No specific infected area identified'}
            </li>
            <li><strong>High-risk areas:</strong> {summary.high_risk_cells ?? 'N/A'}</li>
            <li><strong>Estimated yield at risk:</strong> {summary.estimated_yield_at_risk_tonnes ?? 'N/A'} tons</li>
            {yieldRiskAssumptions ? (
              <li>
                <strong>Yield estimate basis:</strong>{' '}
                {yieldRiskAssumptions.cpo_tonnes_per_infected_tree} tons/tree at {(yieldRiskAssumptions.loss_factor * 100).toFixed(0)}% loss
              </li>
            ) : null}
          </ul>
        </section>

        <section className="report-preview-card">
          <h3>Location</h3>
          <ul className="report-preview-list">
            <li><strong>Latitude:</strong> {location.lat ?? 'N/A'}</li>
            <li><strong>Longitude:</strong> {location.lon ?? 'N/A'}</li>
            <li><strong>Altitude:</strong> {location.altitude ?? 'N/A'} m</li>
          </ul>
        </section>

        <section className="report-preview-card">
          <h3>Environment</h3>
          <ul className="report-preview-list">
            <li><strong>Avg temperature:</strong> {formatValue(summary.average_temperature)} °C</li>
            <li><strong>Avg humidity:</strong> {formatValue(summary.average_humidity)} %</li>
            <li><strong>Avg soil moisture:</strong> {formatValue(summary.average_soil_moisture, 3)}</li>
          </ul>
        </section>

        <section className="report-preview-card">
          <h3>Detection</h3>
          <ul className="report-preview-list">
            <li><strong>Avg confidence:</strong> {formatPercent(summary.average_detection_confidence)}</li>
            <li>
              <strong>Confidence range:</strong>{' '}
              {confidenceRange
                ? `${formatPercent(confidenceRange.min)} - ${formatPercent(confidenceRange.max)}`
                : 'N/A'}
            </li>
          </ul>
        </section>
      </div>

      <div className="report-preview-sections">
        <section className="report-preview-card">
          <h3>Key Findings</h3>
          <ul className="report-preview-list">
            {(report.key_findings || []).map((finding, index) => (
              <li key={index}>{finding}</li>
            ))}
          </ul>
        </section>

        <section className="report-preview-card">
          <h3>Recommendations</h3>
          <ul className="report-preview-list">
            {contextualRecommendations.map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        </section>

        <section className="report-preview-card">
          <h3>Top Risk Areas</h3>
          <ul className="report-preview-list">
            {(report.top_risk_cells || []).map((cell, index) => (
              <li key={index}>
                <strong>Area ({(cell.grid_position?.row ?? 0) + 1},{(cell.grid_position?.col ?? 0) + 1}):</strong>{' '}
                Lat {cell.lat}, Lon {cell.lon}, risk score = {formatPercent(cell.risk_score, 1)}
              </li>
            ))}
          </ul>
        </section>

        <section className="report-preview-card">
          <h3>Simulation</h3>
          <ul className="report-preview-list">
            <li><strong>Weeks simulated:</strong> {simulation.weeks_simulated ?? 'N/A'}</li>
            <li><strong>Average risk at start:</strong> {formatPercent(simulation.average_risk_start, 1)}</li>
            <li><strong>Average risk at end:</strong> {formatPercent(simulation.average_risk_end, 1)}</li>
            <li><strong>Trend:</strong> {simulation.trend || 'N/A'}</li>
          </ul>
        </section>
      </div>
    </div>
  )
}
