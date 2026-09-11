import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { MotionConfig } from 'motion/react'
import { BrowserRouter } from 'react-router'
import '@fontsource/ibm-plex-sans/400.css'
import '@fontsource/ibm-plex-sans/500.css'
import '@fontsource/ibm-plex-sans/600.css'
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/playfair-display/500.css'
import '@fontsource/playfair-display/700.css'
import '@fontsource/playfair-display/500-italic.css'
import './index.css'
import { createQueryClient } from '@/api/queries'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { App } from './App'

const queryClient = createQueryClient()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        {/* Honor the OS "reduce motion" setting in every motion component. */}
        <MotionConfig reducedMotion="user">
          <TooltipProvider>
            <App />
            <Toaster position="bottom-right" />
          </TooltipProvider>
        </MotionConfig>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)
