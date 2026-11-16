import { QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import { MotionConfig } from 'motion/react'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { App } from './App'

/**
 * The app and everything around it, the same in the browser (src/main.tsx) and on the server
 * (src/entry-server.tsx); each wraps it in its own router.
 */
export function Root({ queryClient }: { queryClient: QueryClient }) {
  return (
    <QueryClientProvider client={queryClient}>
      {/* Honor the OS "reduce motion" setting in every motion component. */}
      <MotionConfig reducedMotion="user">
        <TooltipProvider>
          <App />
          <Toaster position="bottom-right" />
        </TooltipProvider>
      </MotionConfig>
    </QueryClientProvider>
  )
}
