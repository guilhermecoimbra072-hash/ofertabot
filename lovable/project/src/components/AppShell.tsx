import { Link, useRouterState } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import {
  LayoutDashboard,
  Smartphone,
  Users,
  Tag,
  CalendarClock,
  History,
  Settings,
  Menu,
  X,
  Bot,
  LogOut,
} from "lucide-react";

const nav = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/conexao", label: "Conexão", icon: Smartphone },
  { to: "/grupos", label: "Grupos", icon: Users },
  { to: "/ofertas", label: "Ofertas", icon: Tag },
  { to: "/agenda", label: "Agenda", icon: CalendarClock },
  { to: "/historico", label: "Histórico", icon: History },
  { to: "/configuracoes", label: "Configurações", icon: Settings },
] as const;

function Brand() {
  return (
    <div className="flex items-center gap-2">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <Bot className="h-5 w-5" />
      </div>
      <span className="font-display text-lg font-semibold">OfertaBot</span>
    </div>
  );
}

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav className="flex flex-col gap-1">
      {nav.map(({ to, label, icon: Icon }) => {
        const active = path === to;
        return (
          <Link
            key={to}
            to={to}
            onClick={onNavigate}
            className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
              active
                ? "bg-sidebar-accent text-primary"
                : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

function LogoutLink() {
  return (
    <Link
      to="/login"
      className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-muted-foreground hover:bg-sidebar-accent/60"
    >
      <LogOut className="h-4 w-4" /> Sair
    </Link>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const path = useRouterState({ select: (s) => s.location.pathname });
  if (path === "/login") return <>{children}</>;

  return (
    <div className="flex min-h-screen w-full">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col justify-between border-r border-sidebar-border bg-sidebar p-4 lg:flex">
        <div className="space-y-8">
          <div className="px-2 pt-1">
            <Brand />
          </div>
          <NavList />
        </div>
        <LogoutLink />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-sidebar-border bg-sidebar/95 px-4 backdrop-blur lg:hidden">
          <Brand />
          <button
            aria-label="Abrir menu"
            onClick={() => setOpen(true)}
            className="rounded-lg p-2 hover:bg-sidebar-accent"
          >
            <Menu className="h-5 w-5" />
          </button>
        </header>

        {open && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <div
              className="absolute inset-0 bg-background/80 backdrop-blur-sm"
              onClick={() => setOpen(false)}
            />
            <div className="absolute inset-y-0 left-0 flex w-72 flex-col justify-between border-r border-sidebar-border bg-sidebar p-4 animate-in slide-in-from-left">
              <div className="space-y-8">
                <div className="flex items-center justify-between px-2 pt-1">
                  <Brand />
                  <button
                    aria-label="Fechar menu"
                    onClick={() => setOpen(false)}
                    className="rounded-lg p-2 hover:bg-sidebar-accent"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <NavList onNavigate={() => setOpen(false)} />
              </div>
              <LogoutLink />
            </div>
          </div>
        )}

        <main className="flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
