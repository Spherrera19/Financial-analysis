import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from './components/layout'
import { LedgerProvider } from './context/LedgerContext'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,  // 30 s — prevents hammering FastAPI on tab switches
      retry: 1,
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <LedgerProvider>
          <App />
        </LedgerProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
)
