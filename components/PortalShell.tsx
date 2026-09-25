'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import clsx from 'clsx'
import { ShieldCheck, Users, Building2, LogOut, ListChecks, Mail } from 'lucide-react'
import { Background } from './Background'
import { PoweredBy } from './PoweredBy'

export function PortalShell({
  userName,
  userRole,
  children,
}: {
  userName: string
  userRole: string
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const router = useRouter()

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
    router.refresh()
  }

  const nav = [
    { href: '/admin', label: 'Screenings', icon: ListChecks, exact: false },
    { href: '/admin/clients', label: 'Clients', icon: Building2, exact: true },
    ...(userRole === 'admin'
      ? [
          { href: '/admin/users', label: 'Team', icon: Users, exact: true },
          { href: '/admin/email', label: 'Email', icon: Mail, exact: true },
        ]
      : []),
  ]

  function isActive(href: string, exact: boolean) {
    if (exact) return pathname === href
    if (href === '/admin')
      return (
        pathname === '/admin' ||
        pathname.startsWith('/admin/orders')
      )
    return pathname.startsWith(href)
  }

  return (
    <Background variant="shell">
      <div className="min-h-screen">
        <header className="sticky top-0 z-20 bg-[rgb(var(--canvas))]/95 backdrop-blur border-b border-white/10">
          <div className="max-w-6xl mx-auto px-5 h-14 flex items-center gap-6">
            <Link href="/admin" className="flex items-center gap-2 text-white">
              <ShieldCheck size={20} className="text-astblue-500" />
              <span className="font-semibold tracking-wide text-sm">
                ALL-STAR <span className="text-astblue-400">SCREENING</span>
              </span>
            </Link>
            <nav className="flex items-center gap-1 flex-1">
              {nav.map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  className={clsx(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors',
                    isActive(n.href, n.exact)
                      ? 'bg-white/10 text-white'
                      : 'text-white/60 hover:text-white hover:bg-white/5'
                  )}
                >
                  <n.icon size={15} />
                  {n.label}
                </Link>
              ))}
            </nav>
            <div className="flex items-center gap-3 text-sm">
              <span className="text-white/70 hidden sm:block">{userName}</span>
              <button
                onClick={logout}
                className="flex items-center gap-1.5 text-white/60 hover:text-white transition-colors"
                title="Log out"
              >
                <LogOut size={15} />
              </button>
            </div>
          </div>
        </header>
        <main className="max-w-6xl mx-auto px-5 py-8 pb-16">{children}</main>
        <PoweredBy tone="light" />
      </div>
    </Background>
  )
}
