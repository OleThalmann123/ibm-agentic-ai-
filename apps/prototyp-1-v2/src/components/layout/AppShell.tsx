import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { Users, Settings, LogOut, Menu, X, Calculator } from 'lucide-react';
import { useState } from 'react';
import { EmployerOnboarding } from '@/components/onboarding/EmployerOnboarding';
import { AsklepiosLogo } from '@/components/brand/AsklepiosLogo';

const navItems = [
  { to: '/assistants', label: 'Assistenzpersonen', icon: Users },
  { to: '/payroll', label: 'Lohnabrechnung', icon: Calculator },
  { to: '/settings', label: 'Einstellungen', icon: Settings },
];

export function AppShell() {
  const { user, employer, loading, signOut, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const userEmail = user?.email ?? '';

  return (
    <div className="flex h-screen bg-background">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar - always expanded */}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-50 flex flex-col w-64 bg-sidebar border-r border-sidebar-border transition-transform duration-300 lg:relative lg:translate-x-0",
        sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
      )}>
        {/* Logo */}
        <div className="flex items-center justify-between h-16 px-4 border-b border-sidebar-border">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-white/80 border border-sidebar-border flex items-center justify-center overflow-hidden shadow-sm">
              <AsklepiosLogo className="w-full h-full object-contain p-1" />
            </div>
            <div>
              <h1 className="font-semibold text-sm text-sidebar-foreground">Asklepios</h1>
              <p className="text-[10px] text-sidebar-foreground/60 truncate max-w-[140px]">
                {employer?.name ?? 'IV-Assistenzbeitrag'}
              </p>
            </div>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden text-sidebar-foreground/60"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-3 space-y-1">
          <p className="px-3 py-1 text-[10px] font-semibold text-sidebar-foreground/40 uppercase tracking-wider">
            Verwaltung
          </p>
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) => cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                isActive
                  ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              )}
            >
              <item.icon className="w-5 h-5 flex-shrink-0" />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        {/* User section */}
        <div className="border-t border-sidebar-border p-3">
          <div className="flex items-center gap-3 px-3 py-2 mb-2">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
              <span className="text-primary text-xs font-semibold">
                {userEmail.charAt(0)?.toUpperCase() ?? '?'}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-sidebar-foreground/50">Eingeloggt als</p>
              <p className="text-sm font-medium text-sidebar-foreground truncate">{userEmail}</p>
            </div>
          </div>
          <button
            onClick={handleSignOut}
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm text-sidebar-foreground/70 hover:bg-destructive/10 hover:text-destructive transition-colors"
          >
            <LogOut className="w-5 h-5 flex-shrink-0" />
            <span>Abmelden</span>
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar (mobile) */}
        <header className="flex items-center h-14 px-4 border-b bg-background lg:hidden">
          <button onClick={() => setSidebarOpen(true)} className="mr-3" aria-label="Menü öffnen">
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-white border border-border flex items-center justify-center overflow-hidden shadow-sm">
              <AsklepiosLogo className="w-full h-full object-contain p-1" />
            </div>
            <span className="font-semibold text-sm">Asklepios</span>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 min-h-0 overflow-hidden flex flex-col">
          <Outlet />
        </main>
      </div>

      {/* First-use onboarding overlay (wait for auth check before showing) */}
      {!loading && !employer && (
        <div className="fixed inset-0 z-[100] overflow-y-auto bg-background/80 backdrop-blur-sm">
          <div className="min-h-full flex items-center justify-center p-4 py-8">
            <div className="w-full max-w-xl animate-in fade-in slide-in-from-bottom-4 duration-500">
              <EmployerOnboarding onComplete={async () => {
                await refreshProfile();
              }} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
