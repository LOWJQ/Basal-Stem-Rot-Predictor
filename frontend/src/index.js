import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './App.css'

const params = new URLSearchParams(window.location.search)
const isAnalysisPath = window.location.pathname.endsWith('/analysis.html')
const shouldRenderApp = params.get('view') === 'analysis' || isAnalysisPath

document.documentElement.dataset.view = shouldRenderApp ? 'analysis' : 'landing'

if (shouldRenderApp) {
  const root = ReactDOM.createRoot(document.getElementById('root'))

  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  )
}
