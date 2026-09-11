import { Check, Download } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { IconSwap, IconSwapItem } from '@/components/amicro/IconSwap'
import { Button } from '@/components/ui/button'

const RESET_AFTER_MS = 2000

/** A download link whose icon springs from ↓ to ✓ when clicked, via Amicro's IconSwap. */
export function DownloadButton({ href, children }: { href: string; children: ReactNode }) {
  const [started, setStarted] = useState(false)

  useEffect(() => {
    if (!started) return
    const timer = setTimeout(() => setStarted(false), RESET_AFTER_MS)
    return () => clearTimeout(timer)
  }, [started])

  return (
    <Button asChild>
      <a href={href} download onClick={() => setStarted(true)}>
        <IconSwap>
          <IconSwapItem key={started ? 'started' : 'idle'} data-icon="inline-start">
            {started ? <Check /> : <Download />}
          </IconSwapItem>
        </IconSwap>
        {children}
        <span className="sr-only" aria-live="polite">
          {started ? 'Download started' : ''}
        </span>
      </a>
    </Button>
  )
}
