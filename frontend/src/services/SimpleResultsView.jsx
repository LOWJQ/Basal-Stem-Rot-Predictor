import { useState } from 'react'

function formatRiskHeading(risk) {
  if (!risk) return ['RISK AREA', 'SELECTED']
  if (risk === 'high') return ['HIGH RISK -', 'IMMEDIATE ACTION']
  if (risk === 'medium') return ['MEDIUM RISK -', 'PREVENTIVE ACTION']
  return ['LOW RISK -', 'MONITORING ADVISED']
}

function getRiskAdvisory(risk) {
  if (risk === 'high') {
    return 'This analysis suggests immediate intervention is required in this area.'
  }

  if (risk === 'medium') {
    return 'This analysis suggests preventive action should be planned for this area.'
  }

  return 'This analysis suggests continued monitoring is appropriate for this area.'
}

function getRecommendationHeading(risk) {
  if (risk === 'high') return 'Immediate Actions'
  if (risk === 'medium') return 'Preventive Actions'
  return 'Monitoring Actions'
}

function getRiskScoreLabel(risk) {
  if (risk === 'high') return 'High risk range'
  if (risk === 'medium') return 'Medium risk range'
  return 'Low risk range'
}

function formatMetric(value, digits = 1) {
  const numericValue = Number(value)
  if (!Number.isFinite(numericValue)) return 'N/A'
  return numericValue.toFixed(digits)
}

function formatPercent(value, digits = 1) {
  const numericValue = Number(value)
  if (!Number.isFinite(numericValue)) return 'N/A'
  return `${(numericValue * 100).toFixed(digits)}%`
}

function getPointsInCell(cell, infectedPoints, imageSize, gridSize = 6) {
  if (!cell || !Array.isArray(infectedPoints) || !infectedPoints.length || !imageSize) {
    return []
  }

  const width = Number(imageSize.width)
  const height = Number(imageSize.height)

  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return []
  }

  const cellWidth = Math.max(1, Math.floor(width / gridSize))
  const cellHeight = Math.max(1, Math.floor(height / gridSize))

  const x1 = cell.x * cellWidth
  const y1 = cell.y * cellHeight
  const x2 = cell.x === gridSize - 1 ? width : (cell.x + 1) * cellWidth
  const y2 = cell.y === gridSize - 1 ? height : (cell.y + 1) * cellHeight

  return infectedPoints.filter((point) => (
    Number(point.x) >= x1 &&
    Number(point.x) < x2 &&
    Number(point.y) >= y1 &&
    Number(point.y) < y2
  ))
}

function buildInfectionNarrative(pointsInCell) {
  if (!pointsInCell.length) return null

  const confidenceValues = pointsInCell
    .map((point) => Number(point.conf))
    .filter((value) => Number.isFinite(value))

  if (!confidenceValues.length) {
    return `${pointsInCell.length} infected tree${pointsInCell.length > 1 ? 's were' : ' was'} detected here, increasing local spread risk.`
  }

  if (confidenceValues.length === 1) {
    return `1 infected tree was detected here with ${formatPercent(confidenceValues[0])} confidence, increasing local spread risk.`
  }

  const averageConfidence =
    confidenceValues.reduce((sum, value) => sum + value, 0) / confidenceValues.length

  return `${pointsInCell.length} infected trees were detected here with ${formatPercent(averageConfidence)} average confidence, increasing local spread risk.`
}

function buildRiskNarrative(cell, infectedPoints, imageSize) {
  if (!cell) return []

  const points = []
  const temperature = Number(cell.factors?.temperature)
  const humidity = Number(cell.factors?.humidity)
  const soilMoisture = Number(cell.factors?.soil_moisture)
  const infectionNarrative = buildInfectionNarrative(
    getPointsInCell(cell, infectedPoints, imageSize)
  )

  if (infectionNarrative) {
    points.push(infectionNarrative)
  } else if (cell.infection_nearby) {
    points.push('Nearby infection increases the chance of spread into this zone.')
  }

  if (Number.isFinite(humidity)) {
    if (humidity >= 85) {
      points.push(`High humidity (${formatMetric(humidity)}%) supports pathogen survival.`)
    } else if (humidity >= 75) {
      points.push(`Humidity (${formatMetric(humidity)}%) remains favorable for disease activity.`)
    }
  }

  if (Number.isFinite(temperature)) {
    if (temperature >= 27) {
      points.push(`Warm temperature (${formatMetric(temperature)}°C) may accelerate pathogen activity.`)
    } else if (temperature >= 24) {
      points.push(`Moderate temperature (${formatMetric(temperature)}°C) can still support disease activity.`)
    }
  }

  if (Number.isFinite(soilMoisture)) {
    if (soilMoisture >= 0.2) {
      points.push(`Higher soil moisture (${formatMetric(soilMoisture, 3)}) may support fungal persistence.`)
    } else if (soilMoisture >= 0.12) {
      points.push(`Moderate soil moisture (${formatMetric(soilMoisture, 3)}) suggests continued monitoring.`)
    }
  }

  if (!points.length) {
    return cell.explanation?.reasons?.slice(0, 2) ?? []
  }

  return points.slice(0, 2)
}

function buildContextActions(cell) {
  if (!cell) return []

  const humidity = Number(cell.factors?.humidity)
  const temperature = Number(cell.factors?.temperature)
  const actions = []

  if (cell.risk === 'low') {
    if (Number.isFinite(humidity) && humidity >= 80) {
      actions.push(`Increase airflow in areas with humidity around ${formatMetric(humidity)}%.`)
    }

    if (cell.infection_nearby) {
      actions.push('Monitor the nearby high-risk cluster boundary for spread.')
    }

    actions.push('Reassess this zone within 3-5 days.')
    return actions.slice(0, 3)
  }

  if (cell.risk === 'medium') {
    if (Number.isFinite(humidity) && humidity >= 80) {
      actions.push(`Improve airflow and drainage where humidity remains near ${formatMetric(humidity)}%.`)
    }

    if (cell.infection_nearby || cell.detected_infected_trees > 0) {
      actions.push('Inspect nearby trees for early infection symptoms.')
    }

    if (cell.infection_nearby) {
      actions.push('Monitor adjacent areas closely for outward spread.')
    }

    actions.push('Schedule a follow-up scan within the next few days.')
    return actions.slice(0, 3)
  }

  if (cell.detected_infected_trees > 0) {
    actions.push('Isolate infected trees in this zone immediately.')
  }

  if (cell.infection_nearby) {
    actions.push('Inspect surrounding areas immediately to contain nearby spread.')
  }

  if (Number.isFinite(humidity) && humidity >= 80) {
    actions.push(`Reduce moisture buildup in areas with humidity near ${formatMetric(humidity)}%.`)
  }

  if (Number.isFinite(temperature) && temperature >= 27) {
    actions.push(`Prioritize this warm zone (${formatMetric(temperature)}°C) for urgent treatment.`)
  }

  return actions.slice(0, 3)
}

function getMetricSignal(metric, value) {
  const numericValue = Number(value)

  if (!Number.isFinite(numericValue)) {
    return { tone: 'neutral', status: 'Unavailable', helper: 'No reading available' }
  }

  if (metric === 'infected') {
    if (numericValue >= 3) {
      return { tone: 'high', status: 'Critical', helper: 'Immediate field attention needed' }
    }
    if (numericValue >= 1) {
      return { tone: 'medium', status: 'Detected', helper: 'Infection has been identified' }
    }
    return { tone: 'low', status: 'Clear', helper: 'No infected trees detected' }
  }

  if (metric === 'temperature') {
    if (numericValue >= 27) {
      return { tone: 'medium', status: 'Favorable', helper: 'Warm conditions may aid spread' }
    }
    if (numericValue >= 24) {
      return { tone: 'low', status: 'Monitor', helper: 'Conditions are moderately supportive' }
    }
    return { tone: 'low', status: 'Stable', helper: 'Less favorable for pathogen activity' }
  }

  if (metric === 'humidity') {
    if (numericValue >= 85) {
      return { tone: 'high', status: 'High', helper: 'Humidity strongly supports spread' }
    }
    if (numericValue >= 75) {
      return { tone: 'medium', status: 'Elevated', helper: 'Humidity remains supportive' }
    }
    return { tone: 'low', status: 'Moderate', helper: 'Humidity is less concerning' }
  }

  if (metric === 'soil') {
    if (numericValue >= 0.2) {
      return { tone: 'high', status: 'High', helper: 'Moisture may encourage fungal growth' }
    }
    if (numericValue >= 0.12) {
      return { tone: 'medium', status: 'Monitor', helper: 'Moisture should be watched' }
    }
    return { tone: 'low', status: 'Lower', helper: 'Moisture risk is relatively limited' }
  }

  if (metric === 'confidence') {
    if (numericValue >= 85) {
      return { tone: 'low', status: 'Strong', helper: 'Detections are highly reliable' }
    }
    if (numericValue >= 70) {
      return { tone: 'medium', status: 'Moderate', helper: 'Detections are reasonably reliable' }
    }
    return { tone: 'high', status: 'Review', helper: 'Confidence is lower than expected' }
  }

  return { tone: 'neutral', status: 'Unknown', helper: 'No interpretation available' }
}

function getDetectionConfidenceSummary(points) {
  if (!Array.isArray(points) || !points.length) {
    return null
  }

  const validConfidences = points
    .map((point) => Number(point.conf))
    .filter((value) => Number.isFinite(value))

  if (!validConfidences.length) {
    return null
  }

  const averageConfidence =
    validConfidences.reduce((sum, value) => sum + value, 0) / validConfidences.length

  return `${(averageConfidence * 100).toFixed(1)}% average confidence`
}

function getDetectionConfidenceValue(points) {
  if (!Array.isArray(points) || !points.length) {
    return 'N/A'
  }

  const validConfidences = points
    .map((point) => Number(point.conf))
    .filter((value) => Number.isFinite(value))

  if (!validConfidences.length) {
    return 'N/A'
  }

  const averageConfidence =
    validConfidences.reduce((sum, value) => sum + value, 0) / validConfidences.length

  return `${(averageConfidence * 100).toFixed(1)}%`
}

function getDetectionConfidenceRange(points) {
  if (!Array.isArray(points) || !points.length) {
    return null
  }

  const validConfidences = points
    .map((point) => Number(point.conf))
    .filter((value) => Number.isFinite(value))

  if (!validConfidences.length) {
    return null
  }

  const minConfidence = Math.min(...validConfidences)
  const maxConfidence = Math.max(...validConfidences)

  return `${(minConfidence * 100).toFixed(1)}% - ${(maxConfidence * 100).toFixed(1)}%`
}

export default function SimpleResultsView({ result }) {
  const [selectedCell, setSelectedCell] = useState(() => {
    if (!result?.heatmap?.length) return null
    return [...result.heatmap].sort((a, b) => b.risk_score - a.risk_score)[0]
  })
  const [selectedWeek, setSelectedWeek] = useState(0)
  const [detailView, setDetailView] = useState('overview')

  const simulationImage = result.simulation_frames[selectedWeek]
  const visibleNarrative = buildRiskNarrative(selectedCell, result.infected_points, result.image_size)
  const riskHeadingLines = formatRiskHeading(selectedCell?.risk)
  const visibleActions = buildContextActions(selectedCell)

  const infectedSignal = getMetricSignal('infected', result.infected_points.length)
  const temperatureSignal = getMetricSignal('temperature', result.environment_summary.avg_temperature)
  const humiditySignal = getMetricSignal('humidity', result.environment_summary.avg_humidity)
  const soilSignal = getMetricSignal('soil', result.environment_summary.avg_soil_moisture)
  const detectionConfidenceSummary = getDetectionConfidenceSummary(result.infected_points)
  const detectionConfidenceRange = getDetectionConfidenceRange(result.infected_points)

  const handleSelectCell = (cell) => {
    setSelectedCell(cell)
    setDetailView('overview')
  }

  return (
    <div className="results-page">
      <div className="results-header">
        <h1 className="results-title">Analysis Result</h1>
        <p className="results-subtitle">
          Review the detected infections and inspect any area on the heatmap.
        </p>
      </div>

      <div className="results-summary-stack">
        <div className="results-summary-grid results-summary-grid-detection">
          <div className={`results-stat tone-${infectedSignal.tone}`}>
            <div className="results-stat-topline">
              <span className="results-stat-label">Infected trees</span>
              <span className={`results-stat-badge tone-${infectedSignal.tone}`}>{infectedSignal.status}</span>
            </div>
            <span className="results-stat-value">{result.infected_points.length}</span>
            <span className="results-stat-helper">{infectedSignal.helper}</span>
          </div>

          <div className="results-stat tone-neutral">
            <div className="results-stat-topline">
              <span className="results-stat-label">Avg detection confidence</span>
              <span className="results-stat-badge tone-neutral">YOLO-V8 model</span>
            </div>
            <span className="results-stat-value">{getDetectionConfidenceValue(result.infected_points)}</span>
            <span className="results-stat-helper">
              {detectionConfidenceRange ? `${detectionConfidenceRange} range` : 'No infected trees detected'}
            </span>
          </div>
        </div>

        <div className="results-summary-grid results-summary-grid-environment">
          <div className={`results-stat tone-${temperatureSignal.tone}`}>
            <div className="results-stat-topline">
              <span className="results-stat-label">Avg temperature (°C)</span>
              <span className={`results-stat-badge tone-${temperatureSignal.tone}`}>{temperatureSignal.status}</span>
            </div>
            <span className="results-stat-value">{result.environment_summary.avg_temperature}</span>
            <span className="results-stat-helper">{temperatureSignal.helper}</span>
          </div>

          <div className={`results-stat tone-${humiditySignal.tone}`}>
            <div className="results-stat-topline">
              <span className="results-stat-label">Avg humidity (%)</span>
              <span className={`results-stat-badge tone-${humiditySignal.tone}`}>{humiditySignal.status}</span>
            </div>
            <span className="results-stat-value">{result.environment_summary.avg_humidity}</span>
            <span className="results-stat-helper">{humiditySignal.helper}</span>
          </div>

          <div className={`results-stat tone-${soilSignal.tone}`}>
            <div className="results-stat-topline">
              <span className="results-stat-label">Avg soil moisture (m³/m³)</span>
              <span className={`results-stat-badge tone-${soilSignal.tone}`}>{soilSignal.status}</span>
            </div>
            <span className="results-stat-value">{result.environment_summary.avg_soil_moisture}</span>
            <span className="results-stat-helper">{soilSignal.helper}</span>
          </div>
        </div>
      </div>

      <h2 className="results-section-title">Generated heatmap</h2>

      <div className="results-main-grid">
        <div className="results-visual-column">
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
                    onClick={() => handleSelectCell(cell)}
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
              {detailView === 'overview' ? (
                <>
                  <span className={`results-priority-kicker risk-${selectedCell.risk}`}>Priority</span>
                  <h3 className="results-priority-heading">
                    <span>{riskHeadingLines[0]}</span>
                    <span>{riskHeadingLines[1]}</span>
                  </h3>
                  <p className="results-priority-message">{getRiskAdvisory(selectedCell.risk)}</p>

                  <div className="results-detail-block">
                    <h4>{getRecommendationHeading(selectedCell.risk)}</h4>
                    <ul>
                      {visibleActions.map((action, index) => (
                        <li key={index}>{action}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="results-detail-block">
                    <h4>Risk Score</h4>
                    <p className="results-detail-score">
                      {(selectedCell.risk_score * 100).toFixed(2)}%
                      <span className="results-detail-score-label">
                        {getRiskScoreLabel(selectedCell.risk)}
                      </span>
                    </p>
                  </div>

                  <div className="results-detail-block">
                    <h4>Why this result was assigned</h4>
                    <ul>
                      {visibleNarrative.map((reason, index) => (
                        <li key={index}>{reason}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="results-detail-block results-detail-footer">
                    <button
                      type="button"
                      className="results-details-toggle"
                      onClick={() => setDetailView('details')}
                    >
                      Show supporting details →
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="results-detail-block results-detail-block-first">
                    <h4>Supporting Details</h4>
                    <ul className="results-supporting-list">
                      <li><strong>Latitude:</strong> {selectedCell.lat}</li>
                      <li><strong>Longitude:</strong> {selectedCell.lon}</li>
                      <li><strong>Temperature(°C):</strong> {selectedCell.factors.temperature}</li>
                      <li><strong>Humidity(%):</strong> {selectedCell.factors.humidity}</li>
                      <li><strong>Soil moisture(m³/m³):</strong> {selectedCell.factors.soil_moisture}</li>
                      <li><strong>Infected trees in this area:</strong> {selectedCell.detected_infected_trees}</li>
                      <li><strong>Nearby infected tree:</strong> {selectedCell.infection_nearby ? 'Yes' : 'No'}</li>
                    </ul>
                  </div>

                  <div className="results-detail-block results-detail-footer">
                    <button
                      type="button"
                      className="results-details-toggle"
                      onClick={() => setDetailView('overview')}
                    >
                      ← Back to overall analysis
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="results-simulation-section">
        <div className="results-simulation-header">
          <h2 className="results-section-title">Estimated Risk Expansion (If No Action Taken)</h2>
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
