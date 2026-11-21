import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import App from './App.tsx'
import { PublicRequest } from './screens/PublicRequest.tsx'

// No retries: a failed call already surfaces (401 signs out, others toast once), and polling queries try again anyway.
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

// /r/<id> is the public, no-login status page that shared request links open.
const shared = location.pathname.match(/^\/r\/(\d+)\/?$/)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      {shared ? <PublicRequest id={Number(shared[1])} /> : <App />}
    </QueryClientProvider>
  </StrictMode>,
)
