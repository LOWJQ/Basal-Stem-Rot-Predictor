import { useEffect, useRef, useState } from 'react'

const API_BASE = (() => {
  if (process.env.REACT_APP_API_BASE_URL) return process.env.REACT_APP_API_BASE_URL
  const h = window.location.hostname
  return h === 'localhost' || h === '127.0.0.1' || h === '[::1]'
    ? 'http://127.0.0.1:5000'
    : 'https://divine-surprise-production-58e6.up.railway.app'
})()

export default function AgentStream({ analysisData, onComplete }) {
  const [steps, setSteps] = useState([])
  const [done, setDone] = useState(false)
  const calledRef = useRef(false)

  useEffect(() => {
    if (!analysisData || calledRef.current) return
    calledRef.current = true

    const payload = {
      infected_count: analysisData.infected_points?.length ?? 0,
      avg_humidity: analysisData.environment_summary?.avg_humidity ?? 0,
      avg_soil_moisture: analysisData.environment_summary?.avg_soil_moisture ?? 0,
      avg_temperature: analysisData.environment_summary?.avg_temperature ?? 0,
      high_risk_cells: analysisData.report?.summary?.high_risk_cells ?? 0,
    }

    fetch(`${API_BASE}/agent-stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
      .then((res) => {
        const reader = res.body.getReader()
        const decoder = new TextDecoder()

        function read() {
          reader.read().then(({ done: streamDone, value }) => {
            if (streamDone) return
            const chunk = decoder.decode(value)
            chunk
              .split('\n')
              .filter((l) => l.startsWith('data:'))
              .forEach((line) => {
                const raw = line.replace(/^data:\s*/, '').trim()
                if (raw === '[DONE]') {
                  setDone(true)
                  setTimeout(onComplete, 600)
                } else {
                  try {
                    setSteps((prev) => [...prev, JSON.parse(raw)])
                  } catch {}
                }
              })
            read()
          })
        }
        read()
      })
      .catch(() => {
        setDone(true)
        onComplete()
      })
  }, [analysisData, onComplete])

  return (
    <div className="agent-stream-wrap">
      <div className="agent-stream-header">
        <div className={`agent-stream-indicator${done ? ' done' : ''}`} />
        <span className="agent-stream-title">PalmGuard AI Agent - Autonomous Analysis</span>
      </div>

      <div className="agent-stream-steps">
        {steps.map((step, i) => {
          const isLatest = i === steps.length - 1 && !done
          return (
            <div
              key={i}
              className={`agent-stream-step${isLatest ? ' active' : ' dim'}`}
            >
              <span className="agent-stream-step-arrow">{'>'}</span>
              <span>{step.text}</span>
            </div>
          )
        })}

        {!done && steps.length > 0 && (
          <div className="agent-stream-cursor">_</div>
        )}
      </div>
    </div>
  )
}
