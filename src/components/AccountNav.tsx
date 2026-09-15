import Link from 'next/link'
import { signOut } from 'next-auth/react'

interface AccountNavProps {
  profileHref: string
  dashboardHref: string
  userName?: string | null
}

export default function AccountNav({ profileHref, dashboardHref, userName }: AccountNavProps) {
  return (
    <nav className="border-b bg-white" aria-label="Account navigation">
      <div className="container mx-auto flex flex-wrap items-center justify-between gap-3 px-4 py-3 max-w-5xl">
        <div className="flex flex-wrap items-center gap-1">
          <span className="font-semibold text-sky-700 mr-4">Mediosk</span>
          <Link
            href={dashboardHref}
            className="px-2 py-1 text-sm text-slate-700 rounded hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-300"
          >
            Dashboard
          </Link>
          <Link
            href={profileHref}
            className="px-2 py-1 text-sm text-slate-700 rounded hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-300"
          >
            Profile &amp; Settings
          </Link>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {userName && <span className="text-sm text-slate-500">{userName}</span>}
          <button
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="px-3 py-1 text-sm border rounded hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-sky-300"
          >
            Sign out
          </button>
        </div>
      </div>
    </nav>
  )
}