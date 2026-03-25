import { trpc } from "@/lib/trpc";
import { MoneyDisplay } from "@/components/MoneyDisplay";
import { StatusBadge, EntityBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertTriangle, ArrowDownCircle, ArrowUpCircle, Bell, Building2, Calendar,
  CheckCircle2, Clock, Scale, TrendingUp, User, Wallet
} from "lucide-react";
import { Link } from "wouter";
import { formatMoney } from "@/components/MoneyDisplay";

export default function Dashboard() {
  const { data: summary, isLoading } = trpc.dashboard.summary.useQuery();
  const { data: transactions } = trpc.transactions.list.useQuery({ excludeLegal: false });
  const { data: notifications } = trpc.notifications.list.useQuery();

  const unread = notifications?.filter(n => !n.isRead) || [];
  const upcoming = transactions?.filter(t =>
    (t.status === "pending" || t.status === "overdue") && t.type === "expense"
  ).sort((a, b) => {
    const da = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
    const db2 = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
    return da - db2;
  }).slice(0, 5) || [];

  if (isLoading) {
    return (
      <div className="p-4 space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-2 gap-3">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
        <Skeleton className="h-48 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="p-4 space-y-5 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            {new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}
          </p>
        </div>
        {unread.length > 0 && (
          <Link href="/notificacoes">
            <a className="relative">
              <div className="p-2 rounded-xl bg-red-50 border border-red-100">
                <Bell className="w-5 h-5 text-red-600" />
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center font-bold">
                  {unread.length}
                </span>
              </div>
            </a>
          </Link>
        )}
      </div>

      {/* Saldo Total */}
      <Card className="bg-gradient-to-br from-blue-600 to-blue-800 text-white border-0 shadow-lg">
        <CardContent className="p-5">
          <div className="flex items-center gap-2 mb-1">
            <Wallet className="w-4 h-4 opacity-80" />
            <span className="text-sm opacity-80">Saldo Total (excl. jurídico)</span>
          </div>
          <div className="text-4xl font-bold mb-4">
            {formatMoney(summary?.total.balance || 0)}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs opacity-70 mb-0.5">Total Entradas</p>
              <p className="text-lg font-semibold">{formatMoney(summary?.total.income || 0)}</p>
            </div>
            <div>
              <p className="text-xs opacity-70 mb-0.5">Total Saídas</p>
              <p className="text-lg font-semibold">{formatMoney(summary?.total.expense || 0)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Cards PJ e PF */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="border-blue-100 bg-blue-50/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 bg-blue-100 rounded-lg flex items-center justify-center">
                <Building2 className="w-4 h-4 text-blue-700" />
              </div>
              <span className="text-xs font-semibold text-blue-700 uppercase tracking-wide">PJ</span>
            </div>
            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <span className="text-xs text-muted-foreground">Entradas</span>
                <span className="text-xs font-semibold text-green-700">{formatMoney(summary?.pj.income || 0)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-muted-foreground">Saídas</span>
                <span className="text-xs font-semibold text-red-700">{formatMoney(summary?.pj.expense || 0)}</span>
              </div>
              <div className="border-t border-blue-100 pt-1.5 flex justify-between items-center">
                <span className="text-xs font-medium">Saldo</span>
                <span className={`text-sm font-bold ${(summary?.pj.balance || 0) >= 0 ? "text-green-700" : "text-red-700"}`}>
                  {formatMoney(summary?.pj.balance || 0)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-purple-100 bg-purple-50/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 bg-purple-100 rounded-lg flex items-center justify-center">
                <User className="w-4 h-4 text-purple-700" />
              </div>
              <span className="text-xs font-semibold text-purple-700 uppercase tracking-wide">PF</span>
            </div>
            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <span className="text-xs text-muted-foreground">Entradas</span>
                <span className="text-xs font-semibold text-green-700">{formatMoney(summary?.pf.income || 0)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-muted-foreground">Saídas</span>
                <span className="text-xs font-semibold text-red-700">{formatMoney(summary?.pf.expense || 0)}</span>
              </div>
              <div className="border-t border-purple-100 pt-1.5 flex justify-between items-center">
                <span className="text-xs font-medium">Saldo</span>
                <span className={`text-sm font-bold ${(summary?.pf.balance || 0) >= 0 ? "text-green-700" : "text-red-700"}`}>
                  {formatMoney(summary?.pf.balance || 0)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Status Cards */}
      <div className="grid grid-cols-3 gap-2">
        <Card className="border-yellow-100">
          <CardContent className="p-3 text-center">
            <Clock className="w-5 h-5 text-yellow-600 mx-auto mb-1" />
            <p className="text-lg font-bold text-yellow-700">{summary?.pending.count || 0}</p>
            <p className="text-[11px] text-muted-foreground">Pendentes</p>
            <p className="text-[11px] font-medium text-yellow-700">{formatMoney(summary?.pending.amount || 0)}</p>
          </CardContent>
        </Card>
        <Card className="border-red-100">
          <CardContent className="p-3 text-center">
            <AlertTriangle className="w-5 h-5 text-red-600 mx-auto mb-1" />
            <p className="text-lg font-bold text-red-700">{summary?.overdue.count || 0}</p>
            <p className="text-[11px] text-muted-foreground">Atrasados</p>
            <p className="text-[11px] font-medium text-red-700">{formatMoney(summary?.overdue.amount || 0)}</p>
          </CardContent>
        </Card>
        <Card className="border-gray-100">
          <CardContent className="p-3 text-center">
            <Scale className="w-5 h-5 text-gray-500 mx-auto mb-1" />
            <p className="text-lg font-bold text-gray-600">{summary?.legal.count || 0}</p>
            <p className="text-[11px] text-muted-foreground">Jurídico</p>
            <p className="text-[11px] font-medium text-gray-500">{formatMoney(summary?.legal.amount || 0)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Próximos Vencimentos */}
      {upcoming.length > 0 && (
        <Card>
          <CardHeader className="pb-3 pt-4 px-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Calendar className="w-4 h-4 text-blue-600" />
                Próximos Vencimentos
              </CardTitle>
              <Link href="/contas">
                <a className="text-xs text-blue-600 font-medium">Ver todos</a>
              </Link>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-2">
            {upcoming.map((tx) => {
              const dueDate = tx.dueDate ? new Date(tx.dueDate) : null;
              const today = new Date();
              const diffDays = dueDate ? Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)) : null;
              return (
                <div key={tx.id} className="flex items-center gap-3 p-2.5 rounded-xl bg-muted/50">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                    tx.status === "overdue" ? "bg-red-100" : diffDays !== null && diffDays <= 3 ? "bg-yellow-100" : "bg-blue-50"
                  }`}>
                    {tx.status === "overdue" ? (
                      <AlertTriangle className="w-4 h-4 text-red-600" />
                    ) : (
                      <Clock className="w-4 h-4 text-blue-600" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{tx.description}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <EntityBadge type={tx.entityType as "PJ" | "PF"} />
                      {dueDate && (
                        <span className="text-[11px] text-muted-foreground">
                          {tx.status === "overdue" ? "Venceu em " : "Vence em "}
                          {dueDate.toLocaleDateString("pt-BR")}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <MoneyDisplay amount={parseFloat(tx.amount as string)} type="expense" size="sm" />
                    <StatusBadge status={tx.status as any} className="mt-0.5" />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
      {upcoming.length === 0 && (summary?.pending.count || 0) === 0 && (
        <Card className="border-green-100 bg-green-50/50">
          <CardContent className="p-6 text-center">
            <CheckCircle2 className="w-10 h-10 text-green-600 mx-auto mb-2" />
            <p className="font-semibold text-green-800">Tudo em dia!</p>
            <p className="text-sm text-green-700 mt-1">Nenhuma conta pendente ou atrasada.</p>
          </CardContent>
        </Card>
      )}

      {/* Quick Actions */}
      <div className="grid grid-cols-2 gap-3 pb-2">
        <Link href="/nova-transacao">
          <a className="flex items-center gap-2 p-3 rounded-xl bg-blue-600 text-white font-medium text-sm justify-center hover:bg-blue-700 transition-colors">
            <ArrowDownCircle className="w-4 h-4" />
            Registrar Gasto
          </a>
        </Link>
        <Link href="/nova-transacao?type=income">
          <a className="flex items-center gap-2 p-3 rounded-xl bg-green-600 text-white font-medium text-sm justify-center hover:bg-green-700 transition-colors">
            <ArrowUpCircle className="w-4 h-4" />
            Registrar Entrada
          </a>
        </Link>
      </div>
    </div>
  );
}
