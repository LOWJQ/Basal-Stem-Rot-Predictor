function formatMetric(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return 'N/A'
  }

  return Number(value).toFixed(2)
}

export default function HistorySummaryView({ scan }) {
  if (!scan) return null

  const env = scan.env_summary || {}

  return (
    <div className="results-page">
      <div className="results-header">
        <h1 className="results-title">Saved Analysis</h1>
        <p className="results-subtitle">
          This history entry was saved before full replay data was available, so
          this view shows the recorded summary.
        </p>
      </div>

      <div className="results-summary-grid">
        <div className="results-stat">
          <span className="results-stat-label">Infected trees</span>
          <span className="results-stat-value">{scan.infected_count}</span>
        </div>

        <div className="results-stat">
          <span className="results-stat-label">Average risk</span>
          <span className="results-stat-value">{formatMetric(scan.avg_risk_score)}</span>
        </div>

        <div className="results-stat">
          <span className="results-stat-label">High-risk cells</span>
          <span className="results-stat-value">{scan.high_cells}</span>
        </div>

        <div className="results-stat">
          <span className="results-stat-label">Medium-risk cells</span>
          <span className="results-stat-value">{scan.medium_cells}</span>
        </div>
      </div>

      <div className="results-detail-panel history-summary-panel">
        <div className="results-detail-content">
          <h3>Scan details</h3>
          <p><strong>Recorded:</strong> {new Date(scan.timestamp).toLocaleString()}</p>
          <p><strong>Latitude:</strong> {scan.lat}</p>
          <p><strong>Longitude:</strong> {scan.lon}</p>
          <p><strong>Altitude:</strong> {scan.altitude} m</p>
          <p><strong>Low-risk cells:</strong> {scan.low_cells}</p>
          <p><strong>Avg temperature:</strong> {formatMetric(env.avg_temperature)} C</p>
          <p><strong>Avg humidity:</strong> {formatMetric(env.avg_humidity)} %</p>
          <p><strong>Avg soil moisture:</strong> {formatMetric(env.avg_soil_moisture)}</p>
        </div>
      </div>
    </div>
  )
}
