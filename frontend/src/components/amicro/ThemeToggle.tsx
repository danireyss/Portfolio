/*
 * From Amicro's theme toggle (MIT License, Copyright (c) 2026 Syed Subhan Uddin), the
 * 'theme-toggle' case of:
 * https://github.com/Subhan-code/Amicro--Micro-transitions-/blob/main/src/components/toggles/AnimatedToggle.tsx
 *
 * Changes from the original: controlled by the site's theme instead of local state; switch
 * semantics and a focus ring; no haptics; it starts in place instead of animating on page load;
 * and the thumb's travel fits inside the track's border.
 */
import { Moon, Sun } from 'lucide-react'
import { motion } from 'motion/react'
import type { Theme } from '@/lib/theme'
import { cn } from '@/lib/utils'

type ThemeToggleProps = {
  theme: Theme
  onToggle: () => void
  className?: string
}

/** A sun/moon switch: the thumb spins across the track as the colors swap. */
export function ThemeToggle({ theme, onToggle, className }: ThemeToggleProps) {
  const isDark = theme === 'dark'
  return (
    <button
      type="button"
      role="switch"
      aria-checked={isDark}
      aria-label="Dark theme"
      onClick={onToggle}
      className={cn(
        'relative h-9 w-16 shrink-0 cursor-pointer rounded-full border p-1 outline-none transition-colors duration-300 focus-visible:ring-3 focus-visible:ring-ring/50',
        isDark ? 'border-indigo-700/50 bg-indigo-950' : 'border-amber-300 bg-amber-100',
        className,
      )}
    >
      <motion.span
        initial={false}
        animate={{ x: isDark ? 26 : 0, rotate: isDark ? 360 : 0 }}
        transition={{ type: 'spring', stiffness: 350, damping: 22 }}
        className={cn(
          'flex size-7 items-center justify-center rounded-full shadow-md',
          isDark ? 'bg-indigo-900 text-yellow-300' : 'bg-amber-400 text-white',
        )}
      >
        {isDark ? <Moon className="size-4 fill-yellow-300" /> : <Sun className="size-4 fill-white" />}
      </motion.span>
    </button>
  )
}
