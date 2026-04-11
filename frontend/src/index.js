import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './App.css'

const params = new URLSearchParams(window.location.search)
const shouldRenderApp = params.get('view') === 'analysis'

if (shouldRenderApp) {
  const root = ReactDOM.createRoot(document.getElementById('root'))

  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  )
}
