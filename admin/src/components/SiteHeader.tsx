import { Header } from './Header'
import { SidebarTrigger } from "@/components/ui/sidebar"
import { ThemeToggle } from './ThemeToggle'
import { AuthState } from '../types'

interface SiteHeaderProps {
  authState: AuthState
  onLogout: () => void
  activeSection: string
}

export function SiteHeader({ authState, onLogout, activeSection }: SiteHeaderProps) {
  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b px-4">
      <div className="flex items-center gap-4">
        <SidebarTrigger className="-ml-1" />
        <div className="text-sm text-muted-foreground">
          Admin / <span className="text-primary uppercase">{activeSection}</span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <ThemeToggle />
        <Header
          isAuthenticated={authState.isAuthenticated}
          profile={authState.profile}
          onLogout={onLogout}
          compact={true}
        />
      </div>
    </header>
  )
}