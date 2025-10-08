import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'

const el = document.getElementById('root')
if (!el) {
  // If this triggers, index.html doesn't have <div id="root"></div>
  throw new Error('Root element #root not found')
}

const root = createRoot(el)
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)

console.log('main.tsx mounted OK')
