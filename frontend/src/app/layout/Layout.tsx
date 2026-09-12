import { motion } from 'motion/react'
import { Suspense, useLayoutEffect } from 'react'
import { Outlet, useLocation } from 'react-router'
import { AdminBarSlot } from '@/components/AdminEdit'
import { PageSkeleton } from '@/components/QueryState'
import { Footer } from './Footer'
import { Nav } from './Nav'

export function Layout() {
  const { pathname } = useLocation()

  // Each page starts at the top; set before paint, so the old scroll position never flashes.
  useLayoutEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])

  return (
    <div className="flex min-h-svh flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[60] focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground"
      >
        Skip to content
      </a>
      <Nav />
      {/* Pages swap at once and fade in quickly; nothing waits for the old page to animate out. */}
      <motion.main
        key={pathname}
        id="main"
        className="page flex-1 pt-[70px]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.15, ease: 'easeOut' }}
      >
        {/* A page whose code hasn't loaded yet shows the skeleton meanwhile. */}
        <Suspense fallback={<PageSkeleton />}>
          <Outlet />
        </Suspense>
      </motion.main>
      <Footer />
      <AdminBarSlot />
    </div>
  )
}
