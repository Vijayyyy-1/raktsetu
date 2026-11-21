import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { PublicRequest } from './screens/PublicRequest.tsx'

// /r/<id> is the public, no-login status page that shared request links open.
const shared = location.pathname.match(/^\/r\/(\d+)\/?$/)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {shared ? <PublicRequest id={Number(shared[1])} /> : <App />}
  </StrictMode>,
)
