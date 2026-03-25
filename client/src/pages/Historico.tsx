import { trpc } from "@/lib/trpc";
import { StatusBadge, EntityBadge, PaymentMethodBadge } from "@/components/StatusBadge";
import { MoneyDisplay } from "@/components/MoneyDisplay";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowDownCircle, ArrowUpCircle, Download, Filter, Search } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { formatMoney } from "@/components/MoneyDisplay";

export default function Historico() {
  const [search, setSearch] = useState("");
  const [entityFilter, setEntityFilter] = useState<"all" | "PJ" | "PF">("all");
  const [typeFilter, setTypeFilter] = useState<"all" | "income" | "expense">("all");
  const [showFilters, setShowFilters] = useState(false);

  const { data: transactions, isLoading } = trpc.transactions.list.useQuery({
    entityType: entityFilter !== "all" ? entityFilter : undefined,
    type: typeFilter !== "all" ? typeFilter : undefined,
  });

  const { data: csvData } = trpc.export.csv.useQuery();

  const filtered = (transactions || []).filter(tx =>
    tx.description.toLowerCase().includes(search.toLowerCase())
  );

  const totalIncome = filtered.filter(t => t.type === "income").reduce((s, t) => s + parseFloat(t.amount as string), 0);
  const totalExpense = filtered.filter(t => t.type === "expense").reduce((s, t) => s + parseFloat(t.amount as string), 0);

  const handleExport = () => {
    if (!csvData?.csv) return;
    const blob = new Blob([csvData.csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `financeiro_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exportado!");
  };

  // Group by month
  const grouped: Record<string, typeof filtered> = {};
  filtered.forEach(tx => {
    const date = tx.createdAt ? new Date(tx.createdAt) : new Date();
    const key = date.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(tx);
  });

  return (
    <div className="p-4 space-y-4 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Histórico</h1>
        <Button variant="outline" size="sm" className="rounded-xl gap-2" onClick={handleExport}>
          <Download className="w-4 h-4" />
          CSV
        </Button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="border-green-100 bg-green-50/50">
          <CardContent className="p-3 flex items-center gap-2">
            <ArrowUpCircle className="w-8 h-8 text-green-600 shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">Total Entradas</p>
              <p className="text-sm font-bold text-green-700">{formatMoney(totalIncome)}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-red-100 bg-red-50/50">
          <CardContent className="p-3 flex items-center gap-2">
            <ArrowDownCircle className="w-8 h-8 text-red-600 shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">Total Saídas</p>
              <p className="text-sm font-bold text-red-700">{formatMoney(totalExpense)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search & Filters */}
      <div className="space-y-2">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 rounded-xl" />
          </div>
          <Button variant="outline" size="icon" className="rounded-xl shrink-0" onClick={() => setShowFilters(!showFilters)}>
            <Filter className="w-4 h-4" />
          </Button>
        </div>
        {showFilters && (
          <div className="flex gap-2">
            <Select value={entityFilter} onValueChange={v => setEntityFilter(v as any)}>
              <SelectTrigger className="rounded-xl flex-1">
                <SelectValue placeholder="PJ/PF" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">PJ e PF</SelectItem>
                <SelectItem value="PJ">Somente PJ</SelectItem>
                <SelectItem value="PF">Somente PF</SelectItem>
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={v => setTypeFilter(v as any)}>
              <SelectTrigger className="rounded-xl flex-1">
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="income">Entradas</SelectItem>
                <SelectItem value="expense">Saídas</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">Nenhuma transação encontrada</CardContent></Card>
      ) : (
        <div className="space-y-5">
          {Object.entries(grouped).map(([month, txs]) => (
            <div key={month}>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 capitalize">{month}</h3>
              <div className="space-y-2">
                {txs.map(tx => (
                  <Card key={tx.id}>
                    <CardContent className="p-3">
                      <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                          tx.type === "income" ? "bg-green-100" : "bg-red-50"
                        }`}>
                          {tx.type === "income"
                            ? <ArrowUpCircle className="w-4 h-4 text-green-600" />
                            : <ArrowDownCircle className="w-4 h-4 text-red-600" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{tx.description}</p>
                          <div className="flex flex-wrap items-center gap-1 mt-0.5">
                            <EntityBadge type={tx.entityType as "PJ" | "PF"} />
                            <StatusBadge status={tx.status as any} />
                            {tx.paymentMethod && <PaymentMethodBadge method={tx.paymentMethod} />}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <MoneyDisplay
                            amount={parseFloat(tx.amount as string)}
                            type={tx.type === "income" ? "income" : "expense"}
                            size="sm"
                            showSign
                          />
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            {new Date(tx.createdAt).toLocaleDateString("pt-BR")}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
