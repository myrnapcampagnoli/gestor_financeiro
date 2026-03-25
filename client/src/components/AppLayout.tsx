import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import {
  Bell, Calendar, CreditCard, FileText, Home, LogOut, Mail, Menu, Plus, Settings, X
} from "lucide-react";
import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";

const navItems = [
  { path: "/", label: "Dashboard", icon: Home },
  { path: "/contas", label: "Contas", icon: CreditCard },
  { path: "/historico", label: "Histórico", icon: FileText },
  { path: "/calendario", label: "Calendário", icon: Calendar },
  { path: "/gmail", label: "Gmail", icon: Mail },
];

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, isAuthenticated, logout } = useAuth();
  const [location] = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const { data: notifications } = trpc.notifications.list.useQuery(undefined, { enabled: isAuthenticated });
  const unreadCount = notifications?.filter(n => !n.isRead).length || 0;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-muted-foreground text-sm">Carregando...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-sm w-full text-center space-y-6">
          <div className="space-y-2">
            <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto">
              <CreditCard className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900">Gestor Financeiro</h1>
            <p className="text-gray-500 text-sm">Controle suas finanças PJ e PF em um só lugar</p>
          </div>
          <Button className="w-full" size="lg" onClick={() => window.location.href = getLoginUrl()}>
            Entrar com Manus
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar - Desktop */}
      <aside className="hidden md:flex flex-col w-64 bg-card border-r border-border shrink-0">
        <div className="p-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center">
              <CreditCard className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="font-bold text-sm text-foreground">Gestor Financeiro</p>
              <p className="text-xs text-muted-foreground truncate max-w-[140px]">{user?.name || user?.email}</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {navItems.map(({ path, label, icon: Icon }) => (
            <Link key={path} href={path}>
              <a className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors",
                location === path
                  ? "bg-blue-50 text-blue-700"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}>
                <Icon className="w-4 h-4 shrink-0" />
                {label}
                {label === "Gmail" && unreadCount > 0 && (
                  <Badge variant="destructive" className="ml-auto text-xs px-1.5 py-0.5 h-5">{unreadCount}</Badge>
                )}
              </a>
            </Link>
          ))}
        </nav>

        <div className="p-3 border-t border-border space-y-1">
          <Link href="/nova-transacao">
            <a className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors">
              <Plus className="w-4 h-4" />
              Nova Transação
            </a>
          </Link>
          <Link href="/configuracoes">
            <a className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
              <Settings className="w-4 h-4" />
              Configurações
            </a>
          </Link>
          <button
            onClick={() => logout()}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors w-full"
          >
            <LogOut className="w-4 h-4" />
            Sair
          </button>
        </div>
      </aside>

      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="fixed inset-0 bg-black/50" onClick={() => setSidebarOpen(false)} />
          <aside className="relative flex flex-col w-72 bg-card shadow-xl">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center">
                  <CreditCard className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="font-bold text-sm">Gestor Financeiro</p>
                  <p className="text-xs text-muted-foreground truncate max-w-[160px]">{user?.name}</p>
                </div>
              </div>
              <button onClick={() => setSidebarOpen(false)} className="p-1 rounded-lg hover:bg-muted">
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 p-3 space-y-1">
              {navItems.map(({ path, label, icon: Icon }) => (
                <Link key={path} href={path}>
                  <a onClick={() => setSidebarOpen(false)} className={cn(
                    "flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium transition-colors",
                    location === path ? "bg-blue-50 text-blue-700" : "text-muted-foreground hover:bg-muted"
                  )}>
                    <Icon className="w-5 h-5" />
                    {label}
                  </a>
                </Link>
              ))}
            </nav>
            <div className="p-3 border-t border-border space-y-1">
              <Link href="/nova-transacao">
                <a onClick={() => setSidebarOpen(false)} className="flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium bg-blue-600 text-white">
                  <Plus className="w-5 h-5" />
                  Nova Transação
                </a>
              </Link>
              <button onClick={() => logout()} className="flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium text-muted-foreground hover:bg-muted w-full">
                <LogOut className="w-5 h-5" />
                Sair
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile Header */}
        <header className="md:hidden sticky top-0 z-40 bg-card border-b border-border px-4 py-3 flex items-center justify-between">
          <button onClick={() => setSidebarOpen(true)} className="p-2 rounded-lg hover:bg-muted -ml-2">
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center">
              <CreditCard className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-sm">Gestor Financeiro</span>
          </div>
          <Link href="/notificacoes">
            <a className="relative p-2 rounded-lg hover:bg-muted -mr-2">
              <Bell className="w-5 h-5" />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center font-bold">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </a>
          </Link>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-auto pb-20 md:pb-0">
          {children}
        </main>

        {/* Mobile Bottom Nav */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-card border-t border-border flex items-center justify-around px-2 py-2 safe-bottom">
          {navItems.slice(0, 4).map(({ path, label, icon: Icon }) => (
            <Link key={path} href={path}>
              <a className={cn(
                "flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-colors min-w-[60px]",
                location === path ? "text-blue-600" : "text-muted-foreground"
              )}>
                <Icon className="w-5 h-5" />
                <span className="text-[10px] font-medium">{label}</span>
              </a>
            </Link>
          ))}
          <Link href="/nova-transacao">
            <a className="flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-colors min-w-[60px] text-muted-foreground">
              <div className="w-9 h-9 bg-blue-600 rounded-full flex items-center justify-center -mt-5 shadow-lg">
                <Plus className="w-5 h-5 text-white" />
              </div>
              <span className="text-[10px] font-medium mt-0.5">Novo</span>
            </a>
          </Link>
        </nav>
      </div>
    </div>
  );
}
