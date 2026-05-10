import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowDownCircle, ArrowUpCircle, ArrowLeftRight, Download, Search,
  ChevronLeft, ChevronRight, Building2, User, TrendingUp, TrendingDown,
  Wallet, AlertCircle, Scale,
} from "lucide-react";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import { formatMoney } from "@/components/MoneyDisplay";

// ─── Helpers ─────────────────────────────────────────────────────────────────

type TxType = "income" | "expense" | "transfer";
type EntityType = "PJ" | "PF";
type TxStatus = "paid" | "pending" | "overdue" | "legal" | "scheduled";

interface Tx {
  id: number;
  description: string;
  amount: string | number;
  type: string;
  entityType: string;
  status: string;
  paymentMethod?: string | null;
  dueDate?: Date | string | null;
  paidAt?: Date | string | null;
  createdAt: Date | string;
  notes?: string | null;
  importedFrom?: string | null;
  categoryId?: number | null;
}

function amt(tx: Tx) {
  return parseFloat(String(tx.amount));
}

function txDate(tx: Tx): Date {
  const d = tx.dueDate || tx.createdAt;
  return d ? new Date(d) : new Date();
}

function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function formatDateFull(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("pt-BR");
}

const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const MONTHS_FULL = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

// Detect bank/account from importedFrom or description
function detectBanco(tx: Tx): string {
  const src = (tx.importedFrom || "").toLowerCase();
  const desc = (tx.description || "").toLowerCase();
  const notes = (tx.notes || "").toLowerCase();
  const all = src + " " + desc + " " + notes;

  if (src.includes("nubank pj") || all.includes("nubank pj")) return "Nubank PJ";
  if (src.includes("nubank pf") || all.includes("nubank pf")) return "Nubank PF";
  // Banco 301 = PJ (CNPJ 09.189 Domus)
  if (src.includes("banco 301") || src.includes("301") || all.includes("banco 301")) return "Banco 301 PJ";
  if (src.includes("santander pf") || all.includes("santander pf")) return "Santander PF";
  if (src.includes("santander pj") || all.includes("santander pj")) return "Santander PJ";
  if (src.includes("bradesco pf") || all.includes("bradesco pf")) return "Bradesco PF";
  if (src.includes("bradesco pj") || all.includes("bradesco pj")) return "Bradesco PJ";
  if (src.includes("infinitypay") || all.includes("infinitypay")) return "InfinityPay PJ";
  if (src.includes("nubank") && tx.entityType === "PJ") return "Nubank PJ";
  if (src.includes("nubank") && tx.entityType === "PF") return "Nubank PF";
  return "";
}

// Detect transaction category/type label from description
function detectLabel(tx: Tx): { label: string; color: string } {
  const d = (tx.description || "").toLowerCase();
  const n = (tx.notes || "").toLowerCase();
  const text = d + " " + n;

  if (tx.type === "transfer") return { label: "Transf. interna", color: "text-blue-600 bg-blue-50 border-blue-200" };
  if (tx.status === "legal") return { label: "Jurídico", color: "text-gray-600 bg-gray-50 border-gray-200" };

  // Income types
  if (tx.type === "income") {
    if (text.includes("resgate rdb") || text.includes("rendimento")) return { label: "Rendimento", color: "text-emerald-700 bg-emerald-50 border-emerald-200" };
    if (text.includes("pix recebido") || text.includes("transferencia") || text.includes("transferência")) return { label: "Transf. recebida", color: "text-teal-700 bg-teal-50 border-teal-200" };
    if (text.includes("consulta") || text.includes("honorario") || text.includes("honorário")) return { label: "Receita médica", color: "text-green-700 bg-green-50 border-green-200" };
    return { label: "Entrada", color: "text-green-700 bg-green-50 border-green-200" };
  }

  // Expense types
  if (text.includes("pis") || text.includes("cofins") || text.includes("csll") || text.includes("irpj") || text.includes("darf") || text.includes("simples nacional") || text.includes("iss") || text.includes("inss") || text.includes("fgts")) return { label: "Imposto", color: "text-orange-700 bg-orange-50 border-orange-200" };
  if (text.includes("fatura") || text.includes("nubank") && text.includes("pagamento")) return { label: "Fatura cartão", color: "text-purple-700 bg-purple-50 border-purple-200" };
  if (text.includes("condominio") || text.includes("condomínio") || text.includes("aluguel") || text.includes("copel") || text.includes("sanepar") || text.includes("ligga") || text.includes("vivo") || text.includes("ultragaz")) return { label: "Casa", color: "text-amber-700 bg-amber-50 border-amber-200" };
  if (text.includes("aline") || text.includes("salario") || text.includes("salário") || text.includes("vale") || text.includes("unimed aline") || text.includes("fgts")) return { label: "Equipe", color: "text-indigo-700 bg-indigo-50 border-indigo-200" };
  if (text.includes("santander") || text.includes("bradesco") || text.includes("credito imob") || text.includes("crédito imob") || text.includes("financiamento")) return { label: "Financiamento", color: "text-red-700 bg-red-50 border-red-200" };
  if (text.includes("contabilizei") || text.includes("bertoncello") || text.includes("amplimed") || text.includes("crm")) return { label: "Consultório", color: "text-cyan-700 bg-cyan-50 border-cyan-200" };
  if (text.includes("netflix") || text.includes("spotify") || text.includes("chatgpt") || text.includes("gamma") || text.includes("hbo") || text.includes("assinatura")) return { label: "Assinatura", color: "text-violet-700 bg-violet-50 border-violet-200" };
  if (text.includes("ifood") || text.includes("99food") || text.includes("restaurante") || text.includes("lanche")) return { label: "Alimentação", color: "text-yellow-700 bg-yellow-50 border-yellow-200" };

  return { label: "Saída", color: "text-red-700 bg-red-50 border-red-200" };
}

// Status indicator
function statusDot(status: string) {
  switch (status) {
    case "paid": return <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" title="Pago" />;
    case "pending": return <span className="w-2 h-2 rounded-full bg-yellow-400 shrink-0" title="Pendente" />;
    case "overdue": return <span className="w-2 h-2 rounded-full bg-red-500 shrink-0 animate-pulse" title="Atrasado" />;
    case "legal": return <span className="w-2 h-2 rounded-full bg-gray-400 shrink-0" title="Jurídico" />;
    case "scheduled": return <span className="w-2 h-2 rounded-full bg-blue-400 shrink-0" title="Programado" />;
    default: return <span className="w-2 h-2 rounded-full bg-gray-300 shrink-0" />;
  }
}

// ─── Row Component ────────────────────────────────────────────────────────────

function ExtratoRow({ tx, runningBalance }: { tx: Tx; runningBalance: number }) {
  const value = amt(tx);
  const isIncome = tx.type === "income";
  const isTransfer = tx.type === "transfer";
  const isLegal = tx.status === "legal";
  const banco = detectBanco(tx);
  const { label, color } = detectLabel(tx);
  const isPJ = tx.entityType === "PJ";

  return (
    <div className={`flex items-center gap-2 px-3 py-2.5 border-b border-border/50 hover:bg-muted/30 transition-colors text-sm group ${isLegal ? "opacity-60" : ""}`}>
      {/* Date */}
      <div className="w-10 shrink-0 text-xs text-muted-foreground font-mono tabular-nums">
        {formatDate(tx.dueDate || tx.createdAt)}
      </div>

      {/* PJ/PF indicator */}
      <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${isPJ ? "bg-blue-100" : "bg-amber-100"}`}>
        {isPJ
          ? <Building2 className="w-2.5 h-2.5 text-blue-700" />
          : <User className="w-2.5 h-2.5 text-amber-700" />}
      </div>

      {/* Type icon */}
      <div className="shrink-0">
        {isTransfer
          ? <ArrowLeftRight className="w-3.5 h-3.5 text-blue-500" />
          : isIncome
          ? <ArrowUpCircle className="w-3.5 h-3.5 text-green-600" />
          : <ArrowDownCircle className="w-3.5 h-3.5 text-red-500" />}
      </div>

      {/* Description + bank */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          {statusDot(tx.status)}
          <span className="truncate font-medium text-[13px]">{tx.description}</span>
        </div>
        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
          {banco && (
            <span className="text-[10px] text-muted-foreground font-medium">{banco}</span>
          )}
          <span className={`text-[10px] px-1.5 py-0 rounded-full border font-medium ${color}`}>
            {label}
          </span>
          {tx.paymentMethod === "pix" && (
            <span className="text-[10px] text-violet-600 font-medium">PIX</span>
          )}
        </div>
      </div>

      {/* Amount */}
      <div className="text-right shrink-0 min-w-[80px]">
        <div className={`font-semibold tabular-nums text-[13px] ${
          isTransfer ? "text-blue-600" :
          isIncome ? "text-green-600" :
          "text-red-600"
        }`}>
          {isTransfer ? "⇄ " : isIncome ? "+ " : "− "}
          {formatMoney(value)}
        </div>
        {/* Running balance — only for non-transfer, non-legal */}
        {!isTransfer && !isLegal && (
          <div className={`text-[10px] tabular-nums mt-0.5 ${runningBalance >= 0 ? "text-muted-foreground" : "text-red-500"}`}>
            {formatMoney(runningBalance)}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Month Section ────────────────────────────────────────────────────────────

function MonthSection({ month, txs, startBalance }: { month: string; txs: Tx[]; startBalance: number }) {
  const entradas = txs.filter(t => t.type === "income" && t.status !== "legal").reduce((s, t) => s + amt(t), 0);
  const saidas = txs.filter(t => t.type === "expense" && t.status !== "legal").reduce((s, t) => s + amt(t), 0);
  const saldoMes = entradas - saidas;
  const endBalance = startBalance + saldoMes;

  // Calculate running balance per row
  let running = startBalance;
  const rows: { tx: Tx; balance: number }[] = [];
  for (const tx of txs) {
    if (tx.type !== "transfer" && tx.status !== "legal") {
      running += tx.type === "income" ? amt(tx) : -amt(tx);
    }
    rows.push({ tx, balance: running });
  }

  return (
    <div className="rounded-xl border border-border overflow-hidden shadow-sm">
      {/* Month header */}
      <div className="bg-muted/60 px-3 py-2 flex items-center justify-between border-b border-border">
        <span className="text-xs font-bold uppercase tracking-wide text-foreground">{month}</span>
        <div className="flex items-center gap-3 text-xs">
          <span className="text-green-600 font-semibold flex items-center gap-1">
            <TrendingUp className="w-3 h-3" />
            {formatMoney(entradas)}
          </span>
          <span className="text-red-600 font-semibold flex items-center gap-1">
            <TrendingDown className="w-3 h-3" />
            {formatMoney(saidas)}
          </span>
          <span className={`font-bold flex items-center gap-1 ${saldoMes >= 0 ? "text-emerald-700" : "text-red-700"}`}>
            <Wallet className="w-3 h-3" />
            {saldoMes >= 0 ? "+" : ""}{formatMoney(saldoMes)}
          </span>
        </div>
      </div>

      {/* Saldo inicial */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50/50 border-b border-blue-100 text-xs text-blue-700">
        <span className="font-medium">Saldo inicial:</span>
        <span className="font-bold tabular-nums">{formatMoney(startBalance)}</span>
      </div>

      {/* Transactions */}
      <div>
        {rows.map(({ tx, balance }) => (
          <ExtratoRow key={tx.id} tx={tx} runningBalance={balance} />
        ))}
      </div>

      {/* Saldo final */}
      <div className={`flex items-center gap-2 px-3 py-1.5 border-t text-xs font-bold ${endBalance >= 0 ? "bg-green-50/50 border-green-100 text-green-700" : "bg-red-50/50 border-red-100 text-red-700"}`}>
        <span>Saldo final:</span>
        <span className="tabular-nums">{formatMoney(endBalance)}</span>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Historico() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState<number | null>(null); // null = all months of year
  const [search, setSearch] = useState("");
  const [entityFilter, setEntityFilter] = useState<"all" | "PJ" | "PF">("all");
  const [typeFilter, setTypeFilter] = useState<"all" | "income" | "expense" | "transfer">("all");
  const [accountFilter, setAccountFilter] = useState<string>("all");

  // Fetch all transactions for the year
  const fromDate = useMemo(() => new Date(year, 0, 1), [year]);
  const toDate = useMemo(() => new Date(year, 11, 31, 23, 59, 59), [year]);

  const { data: transactions, isLoading } = trpc.transactions.list.useQuery({
    from: fromDate,
    to: toDate,
    entityType: entityFilter !== "all" ? (entityFilter as EntityType) : undefined,
    type: typeFilter !== "all" ? typeFilter : undefined,
  });

  const { data: csvData } = trpc.export.csv.useQuery();

  // Detect unique accounts from importedFrom
  const accounts = useMemo(() => {
    if (!transactions) return [];
    const set = new Set<string>();
    transactions.forEach(tx => {
      const b = detectBanco(tx as Tx);
      if (b) set.add(b);
    });
    return Array.from(set).sort();
  }, [transactions]);

  // Filter transactions
  const filtered = useMemo(() => {
    if (!transactions) return [];
    return (transactions as Tx[]).filter(tx => {
      if (search && !tx.description.toLowerCase().includes(search.toLowerCase())) return false;
      if (accountFilter !== "all" && detectBanco(tx) !== accountFilter) return false;
      if (month !== null) {
        const d = txDate(tx);
        if (d.getMonth() !== month) return false;
      }
      return true;
    });
  }, [transactions, search, accountFilter, month]);

  // Sort by date ascending for running balance calculation
  const sorted = useMemo(() =>
    [...filtered].sort((a, b) => txDate(a).getTime() - txDate(b).getTime()),
    [filtered]
  );

  // Group by month
  const grouped = useMemo(() => {
    const map: Record<string, Tx[]> = {};
    sorted.forEach(tx => {
      const d = txDate(tx);
      const key = `${MONTHS_FULL[d.getMonth()]} ${d.getFullYear()}`;
      if (!map[key]) map[key] = [];
      map[key].push(tx);
    });
    return map;
  }, [sorted]);

  // Calculate running balance across months
  const monthStartBalances = useMemo(() => {
    const balances: Record<string, number> = {};
    let running = 0;
    for (const [monthKey, txs] of Object.entries(grouped)) {
      balances[monthKey] = running;
      txs.forEach(tx => {
        if (tx.type !== "transfer" && tx.status !== "legal") {
          running += tx.type === "income" ? amt(tx) : -amt(tx);
        }
      });
    }
    return balances;
  }, [grouped]);

  // Summary totals
  const totalIncome = filtered.filter(t => t.type === "income" && t.status !== "legal").reduce((s, t) => s + amt(t as Tx), 0);
  const totalExpense = filtered.filter(t => t.type === "expense" && t.status !== "legal").reduce((s, t) => s + amt(t as Tx), 0);
  const totalTransfer = filtered.filter(t => t.type === "transfer").reduce((s, t) => s + amt(t as Tx), 0);
  const saldo = totalIncome - totalExpense;

  const handleExport = () => {
    if (!csvData?.csv) return;
    const blob = new Blob([csvData.csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `extrato_${year}${month !== null ? `_${MONTHS[month]}` : ""}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exportado!");
  };

  const prevYear = () => setYear(y => y - 1);
  const nextYear = () => setYear(y => y + 1);

  return (
    <div className="p-4 space-y-4 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Extrato</h1>
          <p className="text-xs text-muted-foreground">Movimentações consolidadas</p>
        </div>
        <Button variant="outline" size="sm" className="rounded-xl gap-2" onClick={handleExport}>
          <Download className="w-4 h-4" />
          CSV
        </Button>
      </div>

      {/* Year navigation */}
      <div className="flex items-center justify-between bg-muted/40 rounded-xl px-3 py-2">
        <button onClick={prevYear} className="p-1 rounded-lg hover:bg-muted transition-colors">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="font-bold text-sm">{year}</span>
        <button onClick={nextYear} className="p-1 rounded-lg hover:bg-muted transition-colors">
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Month pills */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
        <button
          onClick={() => setMonth(null)}
          className={`shrink-0 px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
            month === null ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
          }`}
        >
          Todos
        </button>
        {MONTHS.map((m, i) => (
          <button
            key={m}
            onClick={() => setMonth(i)}
            className={`shrink-0 px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
              month === i ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            {m}
          </button>
        ))}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-xl border border-green-200 bg-green-50/50 p-2.5 text-center">
          <TrendingUp className="w-4 h-4 text-green-600 mx-auto mb-1" />
          <p className="text-[10px] text-muted-foreground">Entradas</p>
          <p className="text-xs font-bold text-green-700 tabular-nums">{formatMoney(totalIncome)}</p>
        </div>
        <div className="rounded-xl border border-red-200 bg-red-50/50 p-2.5 text-center">
          <TrendingDown className="w-4 h-4 text-red-600 mx-auto mb-1" />
          <p className="text-[10px] text-muted-foreground">Saídas</p>
          <p className="text-xs font-bold text-red-700 tabular-nums">{formatMoney(totalExpense)}</p>
        </div>
        <div className={`rounded-xl border p-2.5 text-center ${saldo >= 0 ? "border-emerald-200 bg-emerald-50/50" : "border-red-200 bg-red-50/50"}`}>
          <Wallet className={`w-4 h-4 mx-auto mb-1 ${saldo >= 0 ? "text-emerald-600" : "text-red-600"}`} />
          <p className="text-[10px] text-muted-foreground">Saldo</p>
          <p className={`text-xs font-bold tabular-nums ${saldo >= 0 ? "text-emerald-700" : "text-red-700"}`}>{formatMoney(saldo)}</p>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3 text-[10px] text-muted-foreground flex-wrap">
        <span className="flex items-center gap-1"><Building2 className="w-3 h-3 text-blue-600" /> PJ (empresa)</span>
        <span className="flex items-center gap-1"><User className="w-3 h-3 text-amber-600" /> PF (pessoal)</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" /> Pago</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow-400 inline-block" /> Pendente</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" /> Atrasado</span>
        <span className="flex items-center gap-1"><Scale className="w-3 h-3 text-gray-500" /> Jurídico (excl. saldo)</span>
      </div>

      {/* Filters */}
      <div className="space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar descrição..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 rounded-xl"
          />
        </div>
        <div className="flex gap-2">
          <Select value={entityFilter} onValueChange={v => setEntityFilter(v as any)}>
            <SelectTrigger className="rounded-xl flex-1 text-xs h-8">
              <SelectValue placeholder="PJ/PF" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">PJ e PF</SelectItem>
              <SelectItem value="PJ">🔵 PJ (empresa)</SelectItem>
              <SelectItem value="PF">🟤 PF (pessoal)</SelectItem>
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={v => setTypeFilter(v as any)}>
            <SelectTrigger className="rounded-xl flex-1 text-xs h-8">
              <SelectValue placeholder="Tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os tipos</SelectItem>
              <SelectItem value="income">🟢 Entradas</SelectItem>
              <SelectItem value="expense">🔴 Saídas</SelectItem>
              <SelectItem value="transfer">⚪ Transferências</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {accounts.length > 0 && (
          <Select value={accountFilter} onValueChange={setAccountFilter}>
            <SelectTrigger className="rounded-xl w-full text-xs h-8">
              <SelectValue placeholder="Conta/Banco" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as contas</SelectItem>
              {accounts.map(a => (
                <SelectItem key={a} value={a}>{a}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Transactions */}
      {isLoading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
        </div>
      ) : Object.keys(grouped).length === 0 ? (
        <div className="rounded-xl border border-border p-8 text-center">
          <AlertCircle className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Nenhuma transação encontrada</p>
          <p className="text-xs text-muted-foreground mt-1">Tente ajustar os filtros ou importar dados</p>
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(grouped).map(([monthKey, txs]) => (
            <MonthSection
              key={monthKey}
              month={monthKey}
              txs={txs}
              startBalance={monthStartBalances[monthKey] ?? 0}
            />
          ))}

          {/* Transfers note */}
          {totalTransfer > 0 && (
            <div className="rounded-xl border border-blue-200 bg-blue-50/40 px-3 py-2 text-xs text-blue-700 flex items-start gap-2">
              <ArrowLeftRight className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                <strong>{formatMoney(totalTransfer)}</strong> em transferências internas (entre suas próprias contas) foram identificadas e <strong>não entram no cálculo do saldo</strong>.
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
