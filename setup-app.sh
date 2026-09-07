#!/bin/bash

# Create remaining structure
mkdir -p public src/renderer/{pages/{Billing,Inventory,Purchase,Customers,Analytics,Settings},components,store,utils,hooks,styles}

# Main React entry
cat > src/renderer/main.jsx << 'REACT_EOF'
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
REACT_EOF

# App.jsx
cat > src/renderer/App.jsx << 'APP_EOF'
import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Provider } from 'react-redux'
import { store } from './store'
import Login from './pages/Login'
import Activation from './pages/Activation'
import Dashboard from './pages/Dashboard'
import BillingPage from './pages/Billing/BillingPage'
import InventoryPage from './pages/Inventory/InventoryPage'
import PurchasePage from './pages/Purchase/PurchasePage'
import CustomersPage from './pages/Customers/CustomersPage'
import AnalyticsPage from './pages/Analytics/AnalyticsPage'
import SettingsPage from './pages/Settings/SettingsPage'

function App() {
  const [licensed, setLicensed] = useState(null)
  const [authenticated, setAuthenticated] = useState(false)

  useEffect(() => {
    checkLicense()
  }, [])

  const checkLicense = async () => {
    const result = await window.ipcRenderer.invoke('check-license')
    setLicensed(result.licensed)
  }

  if (licensed === null) return <div className="flex items-center justify-center h-screen">Loading...</div>
  if (!licensed) return <Activation onActivated={() => setLicensed(true)} />
  if (!authenticated) return <Login onSuccess={() => setAuthenticated(true)} />

  return (
    <Provider store={store}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/billing" element={<BillingPage />} />
          <Route path="/inventory" element={<InventoryPage />} />
          <Route path="/purchase" element={<PurchasePage />} />
          <Route path="/customers" element={<CustomersPage />} />
          <Route path="/analytics" element={<AnalyticsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </BrowserRouter>
    </Provider>
  )
}

export default App
APP_EOF

# Redux Store
cat > src/renderer/store/index.js << 'STORE_EOF'
import { configureStore } from '@reduxjs/toolkit'
import authReducer from './slices/auth'

export const store = configureStore({
  reducer: {
    auth: authReducer,
  },
})
STORE_EOF

# Auth Slice
mkdir -p src/renderer/store/slices
cat > src/renderer/store/slices/auth.js << 'AUTH_SLICE_EOF'
import { createSlice } from '@reduxjs/toolkit'

const authSlice = createSlice({
  name: 'auth',
  initialState: {
    user: null,
    permissions: {}
  },
  reducers: {
    setUser: (state, action) => {
      state.user = action.payload.user
      state.permissions = action.payload.permissions
    },
    logout: (state) => {
      state.user = null
      state.permissions = {}
    }
  }
})

export const { setUser, logout } = authSlice.actions
export default authSlice.reducer
AUTH_SLICE_EOF

# API utility
cat > src/renderer/utils/api.js << 'API_EOF'
export const invokeIPC = (channel, data) => {
  return window.ipcRenderer.invoke(channel, data)
}

export const sendIPC = (channel, data) => {
  return window.ipcRenderer.send(channel, data)
}
API_EOF

# Global CSS
cat > src/renderer/styles/index.css << 'CSS_EOF'
@tailwind base;
@tailwind components;
@tailwind utilities;

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen',
    'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue',
    sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  background-color: #f5f5f5;
}
CSS_EOF

# Tailwind config
cat > tailwind.config.js << 'TAILWIND_EOF'
export default {
  content: [
    "./src/renderer/index.html",
    "./src/renderer/**/*.{js,jsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
TAILWIND_EOF

# PostCSS config
cat > postcss.config.js << 'POSTCSS_EOF'
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
POSTCSS_EOF

# Preload script
cat > src/main/preload.js << 'PRELOAD_EOF'
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('ipcRenderer', {
  invoke: (channel, data) => ipcRenderer.invoke(channel, data),
  send: (channel, data) => ipcRenderer.send(channel, data),
  on: (channel, func) => ipcRenderer.on(channel, (event, ...args) => func(...args)),
  once: (channel, func) => ipcRenderer.once(channel, (event, ...args) => func(...args)),
  removeListener: (channel, func) => ipcRenderer.removeListener(channel, func),
})
PRELOAD_EOF

# .gitignore
cat > .gitignore << 'GITIGNORE_EOF'
node_modules/
dist/
*.exe
*.dmg
*.app
.DS_Store
.env
*.log
.vite/
out/
GITIGNORE_EOF

# README
cat > README.md << 'README_EOF'
# Electronics Shop CRM

A desktop point-of-sale and inventory management system for electronics retail shops.

## Features

- Billing & Invoicing with barcode scanning
- Inventory Management
- Purchase Orders
- Customer Credit Tracking
- Sales Analytics & Reports
- Role-based Access Control
- Machine ID-based Licensing
- Auto-update via GitHub

## Installation

1. Clone the repository
2. `npm install`
3. `npm run dev` (for development)
4. `npm run build` (to build for distribution)

## Architecture

- Frontend: React 18 + Redux
- Desktop: Electron
- Database: SQLite
- Styling: Tailwind CSS

## License

Proprietary - All rights reserved
README_EOF

echo "App structure created successfully!"
