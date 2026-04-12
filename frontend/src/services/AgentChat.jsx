import { useEffect, useMemo, useRef, useState } from 'react'
import { getDeviceId } from './api'

const API_BASE = (() => {
  if (process.env.REACT_APP_API_BASE_URL) return process.env.REACT_APP_API_BASE_URL
  const h = window.location.hostname
  return h === 'localhost' || h === '127.0.0.1' || h === '[::1]'
    ? 'http://127.0.0.1:5000'
    : 'https://divine-surprise-production-58e6.up.railway.app'
})()

const WORD_TYPE_DELAY_MS = 110
const COLLAPSE_THRESHOLD = 10

function buildInitialAgentMessage(result) {
  const infectedCount = result?.infected_points?.length ?? 0
  const riskBand = result?.report?.summary?.risk_band ?? 'unknown'

  return `I detected ${infectedCount} infected tree(s) with an overall ${riskBand} risk rating. I have cross-referenced your YOLO scan results with live environmental data to produce this assessment. What would you like to know?`
}

function getSuggestedQuestions(result) {
  const items = Array.isArray(result?.suggested_questions) ? result.suggested_questions : []
  return items
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .slice(0, 4)
}

function buildCurrentScanPayload(result) {
  if (!result) return {}

  return {
    history_id: result.history_id,
    title: result.title,
    image_size: result.image_size,
    infected_points: result.infected_points,
    heatmap: result.heatmap,
    heatmap_grid: result.heatmap_grid,
    grid_coordinates: result.grid_coordinates,
    environment_summary: result.environment_summary,
    report: result.report,
    suggested_questions: result.suggested_questions,
  }
}

function AgentMessage({ text }) {
  return (
    <div className="agent-chat-msg-agent">
      <div className="agent-chat-msg-label">PalmGuard AI</div>
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

function EarlierMessagesDivider({ expanded, hiddenCount, onToggle }) {
  return (
    <div className="agent-chat-divider">
      <span className="agent-chat-divider-line">Earlier messages</span>
      <button
        type="button"
        className="agent-chat-divider-toggle"
        onClick={onToggle}
      >
        {expanded ? `Hide (${hiddenCount})` : 'Show'}
      </button>
    </div>
  )
}

export default function AgentChat({ result }) {
  const suggestedQuestions = useMemo(
    () => getSuggestedQuestions(result),
    [result?.history_id, result?.suggested_questions]
  )
  const currentScanPayload = useMemo(() => buildCurrentScanPayload(result), [result])
  const initialMessage = useMemo(
    () => ({ role: 'agent', text: buildInitialAgentMessage(result) }),
    [result?.history_id, result?.infected_points?.length, result?.report?.summary?.risk_band]
  )

  const [messages, setMessages] = useState([initialMessage])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [showEarlierMessages, setShowEarlierMessages] = useState(false)

  const typingTimeoutRef = useRef(null)
  const messagesRef = useRef(null)
  const stickToBottomRef = useRef(true)

  useEffect(() => {
    setMessages([initialMessage])
    setInput('')
    setLoading(false)
    setShowEarlierMessages(false)
    stickToBottomRef.current = true
  }, [initialMessage, result?.history_id])

  useEffect(() => (
    () => {
      if (typingTimeoutRef.current) {
        window.clearTimeout(typingTimeoutRef.current)
      }
    }
  ), [])

  useEffect(() => {
    const node = messagesRef.current
    if (!node || !stickToBottomRef.current) return
    node.scrollTop = node.scrollHeight
  }, [messages, loading, showEarlierMessages])

  const handleMessagesScroll = () => {
    const node = messagesRef.current
    if (!node) return

    const distanceFromBottom = node.scrollHeight - node.scrollTop - node.clientHeight
    stickToBottomRef.current = distanceFromBottom < 96
  }

  const revealAgentReply = (text) => new Promise((resolve) => {
    const fullText = String(text || '').trim()

    if (!fullText) {
      setMessages((prev) => [...prev, { role: 'agent', text: 'No response received.' }])
      resolve()
      return
    }

    const words = fullText.split(/\s+/)
    const messageIndexRef = { current: -1 }

    setMessages((prev) => {
      messageIndexRef.current = prev.length
      return [...prev, { role: 'agent', text: '' }]
    })

    let wordIndex = 0

    const typeNextWord = () => {
      setMessages((prev) => prev.map((message, index) => (
        index === messageIndexRef.current
          ? { ...message, text: words.slice(0, wordIndex + 1).join(' ') }
          : message
      )))

      wordIndex += 1

      if (wordIndex < words.length) {
        typingTimeoutRef.current = window.setTimeout(typeNextWord, WORD_TYPE_DELAY_MS)
      } else {
        typingTimeoutRef.current = null
        resolve()
      }
    }

    typingTimeoutRef.current = window.setTimeout(typeNextWord, WORD_TYPE_DELAY_MS)
  })

  const sendMessage = async (text) => {
    const msg = (text ?? input).trim()
    if (!msg || loading) return

    const nextConversation = [...messages, { role: 'user', text: msg }]

    setInput('')
    setMessages(nextConversation)
    setLoading(true)
    stickToBottomRef.current = true

    try {
      const res = await fetch(`${API_BASE}/agent-chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Device-Id': getDeviceId(),
        },
        body: JSON.stringify({
          message: msg,
          report: result?.report ?? {},
          environment_summary: result?.environment_summary ?? {},
          infected_count: result?.infected_points?.length ?? 0,
          current_scan: currentScanPayload,
          conversation: nextConversation,
          history_id: result?.history_id ?? null,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data?.error || data?.warning || 'Unable to get a response from PalmGuard AI.')
      }

      await revealAgentReply(data?.reply || data?.warning || 'No response received.')
    } catch (error) {
      await revealAgentReply(
        error?.message || 'Unable to reach the agent. Please check your connection and try again.'
      )
    } finally {
      setLoading(false)
    }
  }

  const hasUserMessage = messages.some((message) => message.role === 'user')
  const shouldCollapseMessages = messages.length > COLLAPSE_THRESHOLD
  const hiddenMessages = shouldCollapseMessages ? messages.slice(0, -COLLAPSE_THRESHOLD) : []
  const visibleMessages = shouldCollapseMessages ? messages.slice(-COLLAPSE_THRESHOLD) : messages

  return (
    <div className="agent-chat-wrap">
      <div className="agent-chat-header">
        <div className="agent-chat-dot" />
        <span className="agent-chat-title">PalmGuard AI Agent</span>
        <span className="agent-chat-subtitle">Context-aware - remembers this plot</span>
      </div>

      <div className="agent-chat-messages" ref={messagesRef} onScroll={handleMessagesScroll}>
        {shouldCollapseMessages ? (
          <>
            {showEarlierMessages
              ? hiddenMessages.map((msg, index) => (
                msg.role === 'agent'
                  ? <AgentMessage key={`older-agent-${index}`} text={msg.text} />
                  : <UserMessage key={`older-user-${index}`} text={msg.text} />
              ))
              : null}

            <EarlierMessagesDivider
              expanded={showEarlierMessages}
              hiddenCount={hiddenMessages.length}
              onToggle={() => setShowEarlierMessages((current) => !current)}
            />
          </>
        ) : null}

        {visibleMessages.map((msg, index) => (
          msg.role === 'agent'
            ? <AgentMessage key={`visible-agent-${index}`} text={msg.text} />
            : <UserMessage key={`visible-user-${index}`} text={msg.text} />
        ))}

        {loading ? (
          <div className="agent-chat-reasoning">Agent is reasoning...</div>
        ) : null}
      </div>

      {!hasUserMessage && suggestedQuestions.length ? (
        <div className="agent-chat-suggestions">
          {suggestedQuestions.map((question, index) => (
            <button
              key={index}
              className="agent-chat-suggest-btn button-secondary"
              onClick={() => sendMessage(question)}
              disabled={loading}
            >
              {question}
            </button>
          ))}
        </div>
      ) : null}

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
