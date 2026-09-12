import { Menu } from 'lucide-react'
import { motion } from 'motion/react'
import { useState } from 'react'
import { Link, useLocation } from 'react-router'
import { usePhotos, usePrefetchPage, useSite } from '@/api/queries'
import { ThemeToggle } from '@/components/amicro/ThemeToggle'
import { Button } from '@/components/ui/button'
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
} from '@/components/ui/navigation-menu'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { setTheme, useTheme } from '@/lib/theme'
import { cn } from '@/lib/utils'

type NavItem = { to: string; label: string; needsGalleries?: boolean }

const LINKS: NavItem[] = [
  { to: '/', label: 'Home' },
  { to: '/projects', label: 'Projects' },
  { to: '/photos', label: 'Photos', needsGalleries: true },
  { to: '/resume', label: 'Resume' },
  { to: '/contact', label: 'Contact' },
]

export function Nav() {
  const { data } = useSite()
  const { pathname } = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)
  const isActive = (to: string) => (to === '/' ? pathname === '/' : pathname.startsWith(to))
  const name = data?.profile.name ?? ''
  // The Photos link appears once a gallery's media folder actually has photos in it.
  const photos = usePhotos()
  const hasGalleries = photos.data?.galleries.some((gallery) => gallery.photos.length > 0) ?? false
  const links = LINKS.filter((link) => !link.needsGalleries || hasGalleries)
  const theme = useTheme()
  // Pointing at (or tabbing to, or touching) a link starts fetching its page's data, so the page
  // usually opens with it already there.
  const prefetch = usePrefetchPage()
  const prefetchOn = (to: string) => ({
    onMouseEnter: () => prefetch(to),
    onFocus: () => prefetch(to),
    onTouchStart: () => prefetch(to),
  })

  return (
    <header className="fixed inset-x-0 top-0 z-50 h-[70px] border-b border-border/60 bg-background/80 backdrop-blur">
      <div className="page flex h-full items-center justify-between">
        <Link to="/" className="font-heading text-xl text-heading transition-colors hover:text-primary">
          {name}
        </Link>

        <div className="flex items-center gap-2 md:gap-4">
          <NavigationMenu viewport={false} className="hidden md:flex" aria-label="Main">
            <NavigationMenuList>
              {links.map(({ to, label }) => (
                <NavigationMenuItem key={to}>
                  {/* The underline alone marks the current page. Radix sets data-active="" (so
                      data-active:, not data-[active=true]:), and shadcn's grey box is cleared for
                      focus too: a clicked link keeps focus, and the box would fade back in every
                      time the browser tab regains focus. Keyboard focus still gets the ring. */}
                  <NavigationMenuLink asChild active={isActive(to)}>
                    <Link
                      to={to}
                      {...prefetchOn(to)}
                      className="relative bg-transparent hover:bg-transparent focus:bg-transparent data-active:bg-transparent data-active:text-primary data-active:hover:bg-transparent data-active:focus:bg-transparent"
                    >
                      {label}
                      {isActive(to) && (
                        <motion.span
                          layoutId="nav-underline"
                          className="absolute inset-x-2 -bottom-0.5 h-px bg-primary"
                          transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                        />
                      )}
                    </Link>
                  </NavigationMenuLink>
                </NavigationMenuItem>
              ))}
            </NavigationMenuList>
          </NavigationMenu>

          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open menu">
                <Menu />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-64">
              <SheetHeader>
                <SheetTitle className="font-heading">{name || 'Menu'}</SheetTitle>
              </SheetHeader>
              <nav aria-label="Main" className="flex flex-col gap-1 px-4">
                {links.map(({ to, label }) => (
                  <Link
                    key={to}
                    to={to}
                    {...prefetchOn(to)}
                    onClick={() => setMenuOpen(false)}
                    aria-current={isActive(to) ? 'page' : undefined}
                    className={cn(
                      'rounded-md px-3 py-2 text-lg transition-colors',
                      isActive(to) ? 'text-primary' : 'hover:bg-muted',
                    )}
                  >
                    {label}
                  </Link>
                ))}
              </nav>
            </SheetContent>
          </Sheet>

          {/* Far right on every screen size: after the links (desktop) or the menu button (mobile). */}
          <ThemeToggle theme={theme} onToggle={() => setTheme(theme === 'dark' ? 'light' : 'dark')} />
        </div>
      </div>
    </header>
  )
}
