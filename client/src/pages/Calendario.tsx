import { trpc } from "@/lib/trpc";
import { StatusBadge, EntityBadge } from "@/components/StatusBadge";
import { MoneyDisplay } from "@/components/MoneyDisplay";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import { formatMoney } from "@/components/MoneyDisplay";

export default function Calendario() {
  const [currentDate, setCurrentDate] = useState(new Date());

  const { data: transactions, isLoading } = trpc.transactions.list.useQuery({
    excludeLegal: true,
  });

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startPad = firstDay.getDay();
  const daysInMonth = lastDay.getDate();

  const txByDay: Record<number, typeof transactions> = {};
  (transactions || []).forEach(tx => {
    if (!tx.dueDate) return;
    const d = new Date(tx.dueDate);
    if (d.getFullYear() === year && d.getMonth() === month) {
      const day = d.getDate();
      if (!txByDay[day]) txByDay[day] = [];
      txByDay[day]!.push(tx);
    }
  });

  const today = new Date();
  const isToday = (day: number) =>
    day === today.getDate() && month === today.getMonth() && year === today.getFullYear();

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));

  // Upcoming 30 days
  const upcoming = (transactions || [])
    .filter(tx => {
      if (!tx.dueDate) return false;
      const d = new Date(tx.dueDate);
      const diff = (d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24);
      return diff >= -1 && diff <= 30 && (tx.status === "pending" || tx.status === "overdue" || tx.status === "scheduled");
    })
    .sort((a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime());

  const totalUpcoming = upcoming.reduce((s, t) => s + parseFloat(t.amount as string), 0);

  return (
    <div className="p-4 space-y-4 max-w-2xl mx-auto">
      <h1 className="text-xl font-bold">Calendário</h1>

      {/* Mini Calendar */}
      <Card>
        <CardContent className="p-4">
          {/* Month Navigation */}
          <div className="flex items-center justify-between mb-4">
            <button onClick={prevMonth} className="p-2 rounded-xl hover:bg-muted transition-colors">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <h2 className="text-sm font-semibold capitalize">
              {currentDate.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
            </h2>
            <button onClick={nextMonth} className="p-2 rounded-xl hover:bg-muted transition-colors">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Day headers */}
          <div className="grid grid-cols-7 mb-1">
            {["D", "S", "T", "Q", "Q", "S", "S"].map((d, i) => (
              <div key={i} className="text-center text-[11px] font-semibold text-muted-foreground py-1">{d}</div>
            ))}
          </div>

          {/* Days */}
          <div className="grid grid-cols-7 gap-0.5">
            {[...Array(startPad)].map((_, i) => <div key={`pad-${i}`} />)}
            {[...Array(daysInMonth)].map((_, i) => {
              const day = i + 1;
              const dayTxs = txByDay[day] || [];
              const hasOverdue = dayTxs.some(t => t.status === "overdue");
              const hasPending = dayTxs.some(t => t.status === "pending");
              const totalDay = dayTxs.reduce((s, t) => s + parseFloat(t.amount as string), 0);

              return (
                <div key={day} className={`relative flex flex-col items-center p-1 rounded-lg min-h-[44px] cursor-default transition-colors ${
                  isToday(day) ? "bg-blue-600 text-white" :
                  hasOverdue ? "bg-red-50" :
                  hasPending ? "bg-yellow-50" :
                  dayTxs.length > 0 ? "bg-blue-50" : ""
                }`}>
                  <span className={`text-xs font-medium ${isToday(day) ? "text-white" : ""}`}>{day}</span>
                  {dayTxs.length > 0 && (
                    <div className="flex gap-0.5 mt-0.5 flex-wrap justify-center">
                      {dayTxs.slice(0, 3).map((tx, idx) => (
                        <div key={idx} className={`w-1.5 h-1.5 rounded-full ${
                          tx.status === "overdue" ? "bg-red-500" :
                          tx.status === "paid" ? "bg-green-500" :
                          isToday(day) ? "bg-white" : "bg-blue-500"
                        }`} />
                      ))}
                    </div>
                  )}
                  {totalDay > 0 && (
                    <span className={`text-[9px] font-medium mt-0.5 ${
                      isToday(day) ? "text-blue-100" :
                      hasOverdue ? "text-red-600" : "text-muted-foreground"
                    }`}>
                      {totalDay >= 1000 ? `${(totalDay/1000).toFixed(1)}k` : totalDay.toFixed(0)}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Legend */}
          <div className="flex items-center gap-4 mt-3 pt-3 border-t border-border">
            <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-red-500" /><span className="text-[11px] text-muted-foreground">Atrasado</span></div>
            <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-yellow-400" /><span className="text-[11px] text-muted-foreground">Pendente</span></div>
            <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-green-500" /><span className="text-[11px] text-muted-foreground">Pago</span></div>
          </div>
        </CardContent>
      </Card>

      {/* Próximos 30 dias */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Calendar className="w-4 h-4 text-blue-600" />
            Próximos 30 dias
          </h2>
          {totalUpcoming > 0 && (
            <span className="text-xs font-semibold text-red-600">
              Total: {formatMoney(totalUpcoming)}
            </span>
          )}
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
          </div>
        ) : upcoming.length === 0 ? (
          <Card><CardContent className="p-6 text-center text-muted-foreground text-sm">
            Nenhum compromisso nos próximos 30 dias
          </CardContent></Card>
        ) : (
          <div className="space-y-2">
            {upcoming.map(tx => {
              const dueDate = new Date(tx.dueDate!);
              const diffDays = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
              return (
                <Card key={tx.id} className={
                  tx.status === "overdue" ? "border-red-200 bg-red-50/30" :
                  diffDays <= 3 ? "border-yellow-200 bg-yellow-50/30" : ""
                }>
                  <CardContent className="p-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-12 h-12 rounded-xl flex flex-col items-center justify-center shrink-0 ${
                        tx.status === "overdue" ? "bg-red-100" :
                        diffDays <= 3 ? "bg-yellow-100" : "bg-blue-50"
                      }`}>
                        <span className={`text-lg font-bold leading-none ${
                          tx.status === "overdue" ? "text-red-700" :
                          diffDays <= 3 ? "text-yellow-700" : "text-blue-700"
                        }`}>{dueDate.getDate()}</span>
                        <span className={`text-[10px] font-medium ${
                          tx.status === "overdue" ? "text-red-600" :
                          diffDays <= 3 ? "text-yellow-600" : "text-blue-600"
                        }`}>{dueDate.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "")}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">{tx.description}</p>
                        <div className="flex flex-wrap items-center gap-1.5 mt-1">
                          <EntityBadge type={tx.entityType as "PJ" | "PF"} />
                          <StatusBadge status={tx.status as any} />
                        </div>
                        <p className={`text-xs mt-0.5 font-medium ${
                          tx.status === "overdue" ? "text-red-600" :
                          diffDays <= 0 ? "text-red-600" :
                          diffDays <= 3 ? "text-yellow-700" : "text-muted-foreground"
                        }`}>
                          {diffDays < 0 ? `Venceu há ${Math.abs(diffDays)} dias` :
                           diffDays === 0 ? "Vence hoje!" :
                           diffDays === 1 ? "Vence amanhã" :
                           `Vence em ${diffDays} dias`}
                        </p>
                      </div>
                      <MoneyDisplay amount={parseFloat(tx.amount as string)} type="expense" size="sm" />
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
