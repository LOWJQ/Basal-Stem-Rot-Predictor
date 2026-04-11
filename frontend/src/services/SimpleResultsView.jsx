import { useEffect, useRef, useState } from 'react'
import { fetchHistorySimulationFrames, fetchHistoryReport } from './api'
import AgentChat from './AgentChat'

function formatRiskHeading(risk) {
  if (!risk) return ['RISK AREA', 'SELECTED']
  if (risk === 'high') return ['HIGH RISK', 'IMMEDIATE ACTION']
  if (risk === 'medium') return ['MEDIUM RISK', 'PREVENTIVE ACTION']
  return ['LOW RISK', 'MONITORING ADVISED']
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
      points.push(`Warm temperature (${formatMetric(temperature)}C) may accelerate pathogen activity.`)
    } else if (temperature >= 24) {
      points.push(`Moderate temperature (${formatMetric(temperature)}C) can still support disease activity.`)
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
    actions.push(`Prioritize this warm zone (${formatMetric(temperature)}C) for urgent treatment.`)
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

function getYieldAtRiskSignal(estimatedTonnes) {
  const numericValue = Number(estimatedTonnes)

  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return { tone: 'low', status: 'Limited', helper: 'No immediate yield exposure estimated' }
  }

  if (numericValue >= 1) {
    return { tone: 'high', status: 'Elevated', helper: 'Estimated output exposure is significant' }
  }

  if (numericValue >= 0.25) {
    return { tone: 'medium', status: 'Watch', helper: 'Potential output loss should be monitored' }
  }

  return { tone: 'low', status: 'Early', helper: 'Estimated exposure is currently limited' }
}

function buildExecutiveSummary(result) {
  const infectedCount = Array.isArray(result?.infected_points) ? result.infected_points.length : 0
  const highRiskCount = Array.isArray(result?.heatmap)
    ? result.heatmap.filter((cell) => cell.risk === 'high').length
    : 0

  if (infectedCount > 0 && highRiskCount > 0) {
    return `${infectedCount} infected tree${infectedCount === 1 ? '' : 's'} detected. Immediate action is recommended in ${highRiskCount} high-risk zone${highRiskCount === 1 ? '' : 's'}.`
  }

  if (infectedCount > 0) {
    return `${infectedCount} infected tree${infectedCount === 1 ? '' : 's'} detected. Targeted field inspection is recommended.`
  }

  if (highRiskCount > 0) {
    return `No infected trees were directly detected, but ${highRiskCount} high-risk zone${highRiskCount === 1 ? '' : 's'} still require close monitoring.`
  }

  return 'No infected trees were directly detected. Continue routine monitoring across the scanned area.'
}

export default function SimpleResultsView({ result, onReportUpdate }) {
  const visualColumnRef = useRef(null)
  const [selectedCell, setSelectedCell] = useState(() => {
    if (!result?.heatmap?.length) return null
    return [...result.heatmap].sort((a, b) => b.risk_score - a.risk_score)[0]
  })
  const [selectedWeek, setSelectedWeek] = useState(0)
  const [detailView, setDetailView] = useState('overview')
  const [detailPanelHeight, setDetailPanelHeight] = useState(null)
  const [isSimulationHelpOpen, setIsSimulationHelpOpen] = useState(false)
  const [resolvedSimulationFrames, setResolvedSimulationFrames] = useState(() => (
    Array.isArray(result?.simulation_frames) && result.simulation_frames.length
      ? result.simulation_frames
      : (result?.output_image ? [result.output_image] : [])
  ))
  const [simulationFrameStatus, setSimulationFrameStatus] = useState(
    result?.simulation_frames_status || 'complete'
  )
  const [expectedSimulationFrames, setExpectedSimulationFrames] = useState(
    Number(result?.simulation_expected_frames) || (
      Array.isArray(result?.simulation_frames) && result.simulation_frames.length
        ? result.simulation_frames.length
        : 1
    )
  )
  const [localReport, setLocalReport] = useState(result?.report ?? null)

  const infectedCount = result?.infected_points?.length ?? 0
  const highRiskCount = Array.isArray(result?.heatmap)
    ? result.heatmap.filter((cell) => cell.risk === 'high').length
    : 0
  const simulationFrames = resolvedSimulationFrames.length
    ? resolvedSimulationFrames
    : (result?.output_image ? [result.output_image] : [])
  const maxSimulationWeek = Math.max(0, simulationFrames.length - 1)
  const simulationImage = simulationFrames[selectedWeek] || simulationFrames[0] || result.output_image
  const visibleNarrative = buildRiskNarrative(selectedCell, result.infected_points, result.image_size)
  const riskHeadingLines = formatRiskHeading(selectedCell?.risk)
  const visibleActions = buildContextActions(selectedCell)

  const infectedSignal = getMetricSignal('infected', infectedCount)
  const temperatureSignal = getMetricSignal('temperature', result.environment_summary.avg_temperature)
  const humiditySignal = getMetricSignal('humidity', result.environment_summary.avg_humidity)
  const soilSignal = getMetricSignal('soil', result.environment_summary.avg_soil_moisture)
  const detectionConfidenceRange = getDetectionConfidenceRange(result.infected_points)
  const executiveSummary = buildExecutiveSummary(result)
  const estimatedYieldAtRisk = localReport?.summary?.estimated_yield_at_risk_tonnes
  const yieldRiskAssumptions = localReport?.summary?.yield_risk_assumptions
  const yieldRiskSignal = getYieldAtRiskSignal(estimatedYieldAtRisk)
  const summaryTone = infectedCount > 0 ? 'danger' : highRiskCount > 0 ? 'warning' : 'neutral'
  const summaryAction = infectedCount > 0
    ? 'Recommended action: dispatch immediate field inspection and isolate the highest-risk zones first.'
    : highRiskCount > 0
      ? 'Recommended action: prioritize scouting and preventive treatment in the highlighted zones.'
      : 'Recommended action: continue routine monitoring and schedule the next scan normally.'

  const metricCards = [
    {
      key: 'infected',
      label: 'Infected Trees',
      status: infectedSignal.status,
      tone: infectedSignal.tone,
      value: infectedCount,
      description: infectedSignal.helper,
    },
    {
      key: 'yield',
      label: 'Estimated Yield at Risk',
      status: yieldRiskSignal.status,
      tone: yieldRiskSignal.tone,
      value: Number.isFinite(Number(estimatedYieldAtRisk))
        ? `${Number(estimatedYieldAtRisk).toFixed(2)} tons`
        : 'N/A',
      description: yieldRiskAssumptions
        ? `Estimate uses ${yieldRiskAssumptions.cpo_tonnes_per_infected_tree} tons/tree and ${(yieldRiskAssumptions.loss_factor * 100).toFixed(0)}% loss.`
        : yieldRiskSignal.helper,
    },
    {
      key: 'confidence',
      label: 'Avg Detection Confidence',
      status: 'YOLO-V8 model',
      tone: 'neutral',
      value: getDetectionConfidenceValue(result.infected_points),
      description: detectionConfidenceRange
        ? `${detectionConfidenceRange} confidence range`
        : 'No infected trees detected in this scan.',
    },
    {
      key: 'temperature',
      label: 'Avg Temperature',
      status: temperatureSignal.status,
      tone: temperatureSignal.tone,
      value: Number.isFinite(Number(result.environment_summary.avg_temperature))
        ? `${result.environment_summary.avg_temperature} C`
        : 'N/A',
      description: temperatureSignal.helper,
    },
    {
      key: 'humidity',
      label: 'Avg Humidity',
      status: humiditySignal.status,
      tone: humiditySignal.tone,
      value: Number.isFinite(Number(result.environment_summary.avg_humidity))
        ? `${result.environment_summary.avg_humidity}%`
        : 'N/A',
      description: humiditySignal.helper,
    },
    {
      key: 'soil',
      label: 'Avg Soil Moisture',
      status: soilSignal.status,
      tone: soilSignal.tone,
      value: Number.isFinite(Number(result.environment_summary.avg_soil_moisture))
        ? result.environment_summary.avg_soil_moisture
        : 'N/A',
      description: soilSignal.helper,
    },
  ]

  const handleSelectCell = (cell) => {
    setSelectedCell(cell)
  }

  useEffect(() => {
    const node = visualColumnRef.current
    if (!node) return undefined

    const updateHeight = () => {
      setDetailPanelHeight(node.getBoundingClientRect().height)
    }

    updateHeight()

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateHeight)
      return () => window.removeEventListener('resize', updateHeight)
    }

    const observer = new ResizeObserver(() => updateHeight())
    observer.observe(node)
    window.addEventListener('resize', updateHeight)

    return () => {
      observer.disconnect()
      window.removeEventListener('resize', updateHeight)
    }
  }, [detailView, selectedCell, result])

  useEffect(() => {
    const nextFrames = Array.isArray(result?.simulation_frames) && result.simulation_frames.length
      ? result.simulation_frames
      : (result?.output_image ? [result.output_image] : [])

    setResolvedSimulationFrames(nextFrames)
    setSimulationFrameStatus(result?.simulation_frames_status || 'complete')
    setExpectedSimulationFrames(
      Number(result?.simulation_expected_frames) || nextFrames.length || 1
    )
  }, [result])

  useEffect(() => {
    setSelectedWeek(0)
  }, [result?.history_id, maxSimulationWeek])

  useEffect(() => {
    if (!result?.history_id) return undefined
    if (
      simulationFrameStatus === 'complete' &&
      resolvedSimulationFrames.length >= expectedSimulationFrames
    ) {
      return undefined
    }
    if (simulationFrameStatus === 'error') {
      return undefined
    }

    let isCancelled = false
    let timeoutId

    const pollSimulationFrames = async () => {
      try {
        const response = await fetchHistorySimulationFrames(result.history_id)
        if (isCancelled) return

        const nextFrames = Array.isArray(response.simulation_frames) && response.simulation_frames.length
          ? response.simulation_frames
          : (result.output_image ? [result.output_image] : [])

        const nextStatus = response.status || 'complete'
        const nextExpectedFrames = Number(response.expected_frames) || nextFrames.length || 1

        setResolvedSimulationFrames(nextFrames)
        setSimulationFrameStatus(nextStatus)
        setExpectedSimulationFrames(nextExpectedFrames)

        if (nextStatus === 'error') {
          return
        }

        if (nextStatus === 'complete' && nextFrames.length >= nextExpectedFrames) {
          if (result?.history_id) {
            try {
              const reportResponse = await fetchHistoryReport(result.history_id)
              if (reportResponse?.report) {
                setLocalReport(reportResponse.report)
                if (onReportUpdate) onReportUpdate(reportResponse.report)
              }
            } catch {
            }
          }
          return
        }

        if (nextStatus !== 'complete' || nextFrames.length < nextExpectedFrames) {
          timeoutId = window.setTimeout(pollSimulationFrames, 2000)
        }
      } catch {
        if (!isCancelled) {
          timeoutId = window.setTimeout(pollSimulationFrames, 4000)
        }
      }
    }

    pollSimulationFrames()

    return () => {
      isCancelled = true
      if (timeoutId) window.clearTimeout(timeoutId)
    }
  }, [
    expectedSimulationFrames,
    resolvedSimulationFrames.length,
    result?.history_id,
    result?.output_image,
    simulationFrameStatus,
  ])

  return (
    <div className="results-page">
      <section className="results-page-intro">
        <p className="results-page-label">Analysis dashboard</p>
        <h1 className="results-title">Field Risk Overview</h1>
        <p className="results-subtitle">
          Review the detected infections, environmental signals, and recommended actions for this
          scan.
        </p>
      </section>

      <section className={`results-summary-banner severity-${summaryTone}`}>
        <div className="results-summary-banner-content">
          <span className="results-summary-banner-label">Summary</span>
          <strong>{executiveSummary}</strong>
          <p>{summaryAction}</p>
        </div>
      </section>

      <section className="results-section">
        <div className="results-metric-grid">
          {metricCards.map((card) => (
            <article key={card.key} className="results-metric-card">
              <div className="results-metric-card-top">
                <span className="results-metric-label">{card.label}</span>
                <span className={`results-metric-badge tone-${card.tone}`}>{card.status}</span>
              </div>
              <div className="results-metric-value">{card.value}</div>
              <p className="results-metric-description">{card.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="results-section">
        <h2 className="results-section-title">Infection Risk Map</h2>

        <div className="results-map-layout">
          <div className="results-map-column" ref={visualColumnRef}>
            <div className="results-map-legend" aria-label="Heatmap legend">
              <div className="results-map-legend-items">
                <span className="results-map-legend-item">
                  <span className="results-map-legend-swatch risk-high" />
                  High risk
                </span>
                <span className="results-map-legend-item">
                  <span className="results-map-legend-swatch risk-medium" />
                  Medium risk
                </span>
                <span className="results-map-legend-item">
                  <span className="results-map-legend-swatch risk-low" />
                  Low risk
                </span>
                <span className="results-map-legend-item">
                  <span className="results-map-legend-swatch risk-infected" />
                  Blue dot = infected tree
                </span>
              </div>
            </div>

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

          <aside
            className="results-side-panel"
            style={detailPanelHeight ? { minHeight: `${detailPanelHeight}px` } : undefined}
          >
            {selectedCell ? (
              <div className="results-side-panel-content">
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
                        className="results-details-toggle button-secondary"
                        onClick={() => setDetailView('details')}
                      >
                        Show supporting details
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
                        <li><strong>Temperature (C):</strong> {selectedCell.factors.temperature}</li>
                        <li><strong>Humidity (%):</strong> {selectedCell.factors.humidity}</li>
                        <li><strong>Soil moisture:</strong> {selectedCell.factors.soil_moisture}</li>
                        <li><strong>Infected trees in this area:</strong> {selectedCell.detected_infected_trees}</li>
                        <li><strong>Nearby infected tree:</strong> {selectedCell.infection_nearby ? 'Yes' : 'No'}</li>
                      </ul>
                    </div>

                    <div className="results-detail-block results-detail-footer">
                      <button
                        type="button"
                        className="results-details-toggle button-secondary"
                        onClick={() => setDetailView('overview')}
                      >
                        Back to overall analysis
                      </button>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div className="results-side-empty">
                <h3>Select a risk cell</h3>
                <p>Choose an area on the heatmap to review its recommended action plan.</p>
              </div>
            )}
          </aside>
        </div>
      </section>

      <section className="results-section">
        <h2 className="results-section-title">Estimated Risk Expansion</h2>

        <div className="results-simulation-section">
          <div className="results-simulation-header">
            <div className="results-simulation-title-group">
              <span className="results-simulation-kicker">Projected spread timeline</span>
              <div className="results-simulation-help-wrap">
                <button
                  type="button"
                  className="results-simulation-help-button button-secondary"
                  aria-label="Explain simulation timeline"
                  aria-expanded={isSimulationHelpOpen}
                  onClick={() => setIsSimulationHelpOpen((current) => !current)}
                >
                  ?
                </button>

                {isSimulationHelpOpen ? (
                  <div className="results-simulation-help-popover" role="note">
                    Move the timeline to see projected spread over {Math.max(0, expectedSimulationFrames - 1)} week{expectedSimulationFrames - 1 === 1 ? '' : 's'} if no intervention is taken.
                  </div>
                ) : null}
              </div>
            </div>
            <span className="results-week-label">
              {selectedWeek === 0 ? 'Current state' : `Week ${selectedWeek}`}
            </span>
          </div>

          <div className="results-simulation-image-wrap">
            <img
              src={simulationImage}
              alt={`Simulation week ${selectedWeek}`}
              className="results-simulation-image"
            />
          </div>

          {simulationFrameStatus !== 'complete' ? (
            <p className="results-simulation-status">
              {simulationFrameStatus === 'error'
                  ? 'Future simulation frames could not be prepared right now.'
                  : 'Preparing future simulation frames...'}
            </p>
          ) : null}

          <div className="results-slider-wrap">
            <div className="results-slider-caption">
              <span>Current state</span>
              <span>
                {maxSimulationWeek === 0
                  ? `Week ${Math.max(0, expectedSimulationFrames - 1)}`
                  : `Week ${maxSimulationWeek}`}
              </span>
            </div>
            <input
              type="range"
              min="0"
              max={maxSimulationWeek}
              value={selectedWeek}
              onChange={(e) => setSelectedWeek(Number(e.target.value))}
              className="results-slider"
              disabled={maxSimulationWeek === 0}
            />
          </div>
        </div>
      </section>

      <section className="results-section">
        <AgentChat result={result} />
      </section>
    </div>
  )
}
