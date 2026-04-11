import { useEffect, useRef, useState } from 'react'

const API_BASE = (() => {
  if (process.env.REACT_APP_API_BASE_URL) return process.env.REACT_APP_API_BASE_URL
  const h = window.location.hostname
  return h === 'localhost' || h === '127.0.0.1' || h === '[::1]'
    ? 'http://127.0.0.1:5000'
    : 'https://divine-surprise-production-58e6.up.railway.app'
})()

const SUGGESTED = [
  'Why is this area spreading fast?',
  'What should I prioritise first?',
  'How serious is this infection level?',
  'Will high humidity make it worse?',
]

function AgentMessage({ text }) {
  return (
    <div className="agent-chat-msg-agent">
      <div className="agent-chat-msg-label">PalmSentinel</div>
      <div className="agent-chat-bubble-agent">{text}</div>
    </div>
  )
}

function UserMessage({ text }) {
  return (
    <div className="agent-chat-msg-user">
      <div className="agent-chat-bubble-user">{text}</div>
    </div>
  )
}

export default function AgentChat({ result }) {
  const infectedCount = result?.infected_points?.length ?? 0
  const riskBand = result?.report?.summary?.risk_band ?? 'unknown'

  const [messages, setMessages] = useState([{
    role: 'agent',
    text: `I detected ${infectedCount} infected tree(s) with an overall ${riskBand} risk rating. I have cross-referenced your YOLO scan results with live environmental data to produce this assessment. What would you like to know?`,
  }])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  const sendMessage = async (text) => {
    const msg = (text ?? input).trim()
    if (!msg || loading) return
    setInput('')
    setMessages((prev) => [...prev, { role: 'user', text: msg }])
    setLoading(true)

    try {
      const res = await fetch(`${API_BASE}/agent-chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: msg,
          report: result?.report ?? {},
          environment_summary: result?.environment_summary ?? {},
          infected_count: infectedCount,
        }),
      })
      const data = await res.json()
      setMessages((prev) => [...prev, { role: 'agent', text: data.reply ?? 'No response received.' }])
    } catch {
      setMessages((prev) => [...prev, { role: 'agent', text: 'Unable to reach the agent. Please check your connection and try again.' }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="agent-chat-wrap">
      <div className="agent-chat-header">
        <div className="agent-chat-dot" />
        <span className="agent-chat-title">PalmSentinel Agent</span>
        <span className="agent-chat-subtitle">Context-aware - this scan only</span>
      </div>

      <div className="agent-chat-messages">
        {messages.map((msg, i) =>
          msg.role === 'agent'
            ? <AgentMessage key={i} text={msg.text} />
            : <UserMessage key={i} text={msg.text} />
        )}
        {loading && (
          <div className="agent-chat-reasoning">Agent is reasoning...</div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="agent-chat-suggestions">
        {SUGGESTED.map((q, i) => (
          <button
            key={i}
            className="agent-chat-suggest-btn button-secondary"
            onClick={() => sendMessage(q)}
            disabled={loading}
          >
            {q}
          </button>
        ))}
      </div>

      <div className="agent-chat-input-row">
        <input
          className="agent-chat-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
          placeholder="Ask about this scan..."
          disabled={loading}
        />
        <button
          className="agent-chat-send-btn button-primary"
          onClick={() => sendMessage()}
          disabled={loading || !input.trim()}
        >
          {loading ? '...' : 'Send'}
        </button>
      </div>
    </div>
  )
}
