import { trpc } from "@/lib/trpc";
import { StatusBadge, EntityBadge, PaymentMethodBadge } from "@/components/StatusBadge";
import { MoneyDisplay } from "@/components/MoneyDisplay";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, Check, ChevronDown, Filter, Plus, Search, Trash2 } from "lucide-react";
import { useState } from "react";
import { Link } from "wouter";
import { toast } from "sonner";
import { formatMoney } from "@/components/MoneyDisplay";

type FilterStatus = "all" | "pending" | "overdue" | "paid" | "legal" | "scheduled";
type FilterEntity = "all" | "PJ" | "PF";

export default function Contas() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<FilterStatus>("all");
  const [entityFilter, setEntityFilter] = useState<FilterEntity>("all");
  const [showFilters, setShowFilters] = useState(false);

  const { data: transactions, isLoading, refetch } = trpc.transactions.list.useQuery({
    entityType: entityFilter !== "all" ? entityFilter : undefined,
    status: statusFilter !== "all" ? statusFilter : undefined,
    type: "expense",
  });

  const markPaid = trpc.transactions.markPaid.useMutation({
    onSuccess: () => { toast.success("Marcado como pago!"); refetch(); },
    onError: () => toast.error("Erro ao marcar como pago"),
  });

  const updateTx = trpc.transactions.update.useMutation({
    onSuccess: () => { toast.success("Status atualizado!"); refetch(); },
    onError: () => toast.error("Erro ao atualizar"),
  });

  const deleteTx = trpc.transactions.delete.useMutation({
    onSuccess: () => { toast.success("Excluído!"); refetch(); },
    onError: () => toast.error("Erro ao excluir"),
  });

  const filtered = (transactions || []).filter(tx =>
    tx.description.toLowerCase().includes(search.toLowerCase())
  );

  const totalPending = filtered.filter(t => t.status === "pending" || t.status === "overdue")
    .reduce((s, t) => s + parseFloat(t.amount as string), 0);

  const totalLegal = filtered.filter(t => t.status === "legal")
    .reduce((s, t) => s + parseFloat(t.amount as string), 0);

  const statusGroups = {
    overdue: filtered.filter(t => t.status === "overdue"),
    pending: filtered.filter(t => t.status === "pending"),
    scheduled: filtered.filter(t => t.status === "scheduled"),
    paid: filtered.filter(t => t.status === "paid"),
    legal: filtered.filter(t => t.status === "legal"),
  };

  const groupLabels: Record<string, { label: string; color: string }> = {
    overdue: { label: "Atrasados", color: "text-red-700" },
    pending: { label: "Pendentes", color: "text-yellow-700" },
    scheduled: { label: "Programados", color: "text-blue-700" },
    paid: { label: "Pagos", color: "text-green-700" },
    legal: { label: "Em Jurídico (não somados)", color: "text-gray-600" },
  };

  return (
    <div className="p-4 space-y-4 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Contas a Pagar</h1>
          <p className="text-sm text-muted-foreground">
            Pendente: <span className="font-semibold text-red-600">{formatMoney(totalPending)}</span>
            {totalLegal > 0 && <span className="ml-2 text-gray-500">(Jurídico: {formatMoney(totalLegal)})</span>}
          </p>
        </div>
        <Link href="/nova-transacao" className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors">
          <Plus className="w-4 h-4" />
          Novo
        </Link>
      </div>

      {/* Search & Filters */}
      <div className="space-y-2">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 rounded-xl"
            />
          </div>
          <Button
            variant="outline"
            size="icon"
            className="rounded-xl shrink-0"
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter className="w-4 h-4" />
          </Button>
        </div>

        {showFilters && (
          <div className="flex gap-2">
            <Select value={statusFilter} onValueChange={v => setStatusFilter(v as FilterStatus)}>
              <SelectTrigger className="rounded-xl flex-1">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os status</SelectItem>
                <SelectItem value="pending">Pendente</SelectItem>
                <SelectItem value="overdue">Atrasado</SelectItem>
                <SelectItem value="paid">Pago</SelectItem>
                <SelectItem value="legal">Jurídico</SelectItem>
                <SelectItem value="scheduled">Programado</SelectItem>
              </SelectContent>
            </Select>
            <Select value={entityFilter} onValueChange={v => setEntityFilter(v as FilterEntity)}>
              <SelectTrigger className="rounded-xl flex-1">
                <SelectValue placeholder="PJ/PF" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">PJ e PF</SelectItem>
                <SelectItem value="PJ">Somente PJ</SelectItem>
                <SelectItem value="PF">Somente PF</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <p className="text-muted-foreground">Nenhuma conta encontrada</p>
            <Link href="/nova-transacao" className="mt-3 inline-flex items-center gap-2 text-blue-600 text-sm font-medium">
              <Plus className="w-4 h-4" /> Adicionar conta
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-5">
          {Object.entries(statusGroups).map(([group, items]) => {
            if (items.length === 0) return null;
            const { label, color } = groupLabels[group];
            return (
              <div key={group}>
                <h3 className={`text-xs font-semibold uppercase tracking-wide mb-2 ${color}`}>
                  {label} ({items.length})
                </h3>
                <div className="space-y-2">
                  {items.map(tx => {
                    const dueDate = tx.dueDate ? new Date(tx.dueDate) : null;
                    const today = new Date();
                    const diffDays = dueDate ? Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)) : null;
                    const isUrgent = diffDays !== null && diffDays <= 3 && tx.status !== "paid";

                    return (
                      <Card key={tx.id} className={`transition-all ${
                        tx.status === "overdue" ? "border-red-200 bg-red-50/30" :
                        tx.status === "legal" ? "border-gray-200 bg-gray-50/50 opacity-75" :
                        isUrgent ? "border-yellow-200 bg-yellow-50/30" : ""
                      }`}>
                        <CardContent className="p-3">
                          <div className="flex items-start gap-3">
                            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                              tx.status === "overdue" ? "bg-red-100" :
                              tx.status === "paid" ? "bg-green-100" :
                              tx.status === "legal" ? "bg-gray-100" :
                              isUrgent ? "bg-yellow-100" : "bg-blue-50"
                            }`}>
                              {tx.status === "overdue" ? <AlertTriangle className="w-4 h-4 text-red-600" /> :
                               tx.status === "paid" ? <Check className="w-4 h-4 text-green-600" /> :
                               <span className="text-xs font-bold text-blue-700">{dueDate?.getDate() || "?"}</span>}
                            </div>

                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold truncate">{tx.description}</p>
                              <div className="flex flex-wrap items-center gap-1.5 mt-1">
                                <EntityBadge type={tx.entityType as "PJ" | "PF"} />
                                <StatusBadge status={tx.status as any} />
                                {tx.paymentMethod && <PaymentMethodBadge method={tx.paymentMethod} />}
                              </div>
                              {dueDate && (
                                <p className={`text-xs mt-1 ${
                                  tx.status === "overdue" ? "text-red-600 font-medium" :
                                  isUrgent ? "text-yellow-700 font-medium" : "text-muted-foreground"
                                }`}>
                                  {tx.status === "overdue" ? "Venceu em " : "Vence em "}
                                  {dueDate.toLocaleDateString("pt-BR")}
                                  {diffDays !== null && tx.status !== "paid" && tx.status !== "legal" && (
                                    <span className="ml-1">
                                      {diffDays < 0 ? `(${Math.abs(diffDays)}d atrás)` :
                                       diffDays === 0 ? "(hoje!)" :
                                       diffDays === 1 ? "(amanhã)" :
                                       `(em ${diffDays}d)`}
                                    </span>
                                  )}
                                </p>
                              )}
                            </div>

                            <div className="text-right shrink-0">
                              <MoneyDisplay amount={parseFloat(tx.amount as string)} type="expense" size="sm" />
                              <div className="flex gap-1 mt-2 justify-end">
                                {(tx.status === "pending" || tx.status === "overdue") && (
                                  <button
                                    onClick={() => markPaid.mutate({ id: tx.id })}
                                    className="p-1.5 rounded-lg bg-green-100 hover:bg-green-200 transition-colors"
                                    title="Marcar como pago"
                                  >
                                    <Check className="w-3.5 h-3.5 text-green-700" />
                                  </button>
                                )}
                                {tx.status !== "legal" && (
                                  <button
                                    onClick={() => updateTx.mutate({ id: tx.id, status: "legal" })}
                                    className="p-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 transition-colors"
                                    title="Mover para jurídico"
                                  >
                                    <span className="text-[10px] font-bold text-gray-600">JUR</span>
                                  </button>
                                )}
                                <button
                                  onClick={() => {
                                    if (confirm("Excluir esta transação?")) deleteTx.mutate({ id: tx.id });
                                  }}
                                  className="p-1.5 rounded-lg bg-red-50 hover:bg-red-100 transition-colors"
                                  title="Excluir"
                                >
                                  <Trash2 className="w-3.5 h-3.5 text-red-600" />
                                </button>
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
