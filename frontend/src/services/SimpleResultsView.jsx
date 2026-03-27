import { useState } from 'react'

export default function SimpleResultsView({ result }) {
  const [selectedCell, setSelectedCell] = useState(() => {
    if (!result?.heatmap?.length) return null
    return [...result.heatmap].sort((a, b) => b.risk_score - a.risk_score)[0]
  })

  const [selectedWeek, setSelectedWeek] = useState(0)

  const simulationImage = result.simulation_frames[selectedWeek]

  return (
    <div className="results-page">
      <div className="results-header">
        <h1 className="results-title">Analysis Result</h1>
        <p className="results-subtitle">
          Review the detected infections and inspect any area on the heatmap.
        </p>
      </div>

      <div className="results-summary-grid">
        <div className="results-stat">
          <span className="results-stat-label">Infected trees</span>
          <span className="results-stat-value">{result.infected_points.length}</span>
        </div>

        <div className="results-stat">
          <span className="results-stat-label">Avg temperature(°C)</span>
          <span className="results-stat-value">{result.environment_summary.avg_temperature}</span>
        </div>

        <div className="results-stat">
          <span className="results-stat-label">Avg humidity(%)</span>
          <span className="results-stat-value">{result.environment_summary.avg_humidity}</span>
        </div>

        <div className="results-stat">
          <span className="results-stat-label">Avg Soil Moisture(mÂ³/mÂ³)</span>
          <span className="results-stat-value">{result.environment_summary.avg_soil_moisture}</span>
        </div>
      </div>

      <h2 className="results-section-title">Generated heatmap</h2>

      <div className="results-main-grid">
        <div>
          <div className="results-image-block interactive">
            <img
              src={result.output_image}
              alt="Generated heatmap"
              className="results-image"
            />

            <div className="heatmap-grid-overlay">
              {result.heatmap.map((cell, index) => {
                const isSelected =
                  selectedCell &&
                  selectedCell.x === cell.x &&
                  selectedCell.y === cell.y

                return (
                  <button
                    key={index}
                    type="button"
                    className={`heatmap-grid-cell ${isSelected ? 'selected' : ''}`}
                    onClick={() => setSelectedCell(cell)}
                    aria-label={`Select heatmap cell row ${cell.y}, column ${cell.x}`}
                  />
                )
              })}
            </div>
          </div>
        </div>

        <div className="results-detail-panel">
          {selectedCell && (
            <div className="results-detail-content">
              <h3>
                {selectedCell.risk.charAt(0).toUpperCase() + selectedCell.risk.slice(1)} risk
              </h3>

              <p><strong>Score:</strong> {(selectedCell.risk_score * 100).toFixed(2)}%</p>
              <p><strong>Latitude:</strong> {selectedCell.lat}</p>
              <p><strong>Longitude:</strong> {selectedCell.lon}</p>
              <p><strong>Temperature(°C):</strong> {selectedCell.factors.temperature}</p>
              <p><strong>Humidity(%):</strong> {selectedCell.factors.humidity}</p>
              <p><strong>Soil moisture(mÂ³/mÂ³):</strong> {selectedCell.factors.soil_moisture}</p>
              <p><strong>Infected trees in this area:</strong> {selectedCell.detected_infected_trees}</p>
              <p><strong>Nearby infected tree:</strong> {selectedCell.infection_nearby ? 'Yes' : 'No'}</p>

              <div className="results-detail-block">
                <h4>Risk Level Reasoning</h4>
                <ul>
                  {selectedCell.explanation.reasons.map((reason, index) => (
                    <li key={index}>{reason}</li>
                  ))}
                </ul>
              </div>

              <div className="results-detail-block">
                <h4>Recommended action</h4>
                <ul>
                  {selectedCell.explanation.actions.map((action, index) => (
                    <li key={index}>{action}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="results-simulation-section">
        <div className="results-simulation-header">
          <h2 className="results-section-title">Spread simulation</h2>
          <span className="results-week-label">
            {selectedWeek === 0 ? 'Now' : `Week ${selectedWeek}`}
          </span>
        </div>

        <div className="results-simulation-image-wrap">
          <img
            src={simulationImage}
            alt={`Simulation week ${selectedWeek}`}
            className="results-simulation-image"
          />
        </div>

        <div className="results-slider-wrap">
          <input
            type="range"
            min="0"
            max="12"
            value={selectedWeek}
            onChange={(e) => setSelectedWeek(Number(e.target.value))}
            className="results-slider"
          />

          <div className="results-slider-labels">
            <span>Now</span>
            <span>Week 12</span>
          </div>
        </div>
      </div>

    </div>
  )
}
