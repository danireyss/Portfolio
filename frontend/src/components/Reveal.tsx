import { motion, type HTMLMotionProps } from 'motion/react'
import { EASE_OUT } from '@/lib/motion'

type RevealProps = HTMLMotionProps<'div'> & { delay?: number }

/** Fades and lifts its children into place the first time they scroll into view. */
export function Reveal({ delay = 0, ...props }: RevealProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-32px' }}
      transition={{ duration: 0.35, ease: EASE_OUT, delay }}
      {...props}
    />
  )
}
