import { motion, type HTMLMotionProps } from 'motion/react'
import { EASE_OUT } from '@/lib/motion'

type RevealProps = HTMLMotionProps<'div'> & { delay?: number }

/** Fades and lifts its children into place the first time they scroll into view. */
export function Reveal({ delay = 0, ...props }: RevealProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-64px' }}
      transition={{ duration: 0.5, ease: EASE_OUT, delay }}
      {...props}
    />
  )
}
