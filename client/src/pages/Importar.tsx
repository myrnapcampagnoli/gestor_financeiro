import { useState, useRef, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Upload, FileText, FileSpreadsheet, File, CheckCircle2, AlertCircle,
  Trash2, Edit2, ChevronDown, ChevronUp, ArrowLeft, Loader2, Info, Copy, Check,
} from "lucide-react";
import { Link } from "wouter";

// ─── Types ────────────────────────────────────────────────────────────────────

type DuplicateStatus = 'new' | 'duplicate_exact' | 'duplicate_similar';

interface DuplicateInfo {
  id: number;
  description: string;
  amount: number;
  dueDate?: Date | null;
  status: string;
}

interface DuplicateResult {
  index: number;
  status: DuplicateStatus;
  duplicates: DuplicateInfo[];
}

// Per-row action chosen by user: 'import' | 'skip' | 'replace'
type DuplicateAction = 'import' | 'skip' | 'replace';

interface BoletoData {
  linhaDigitavel?: string;
  codigoBarras?: string;
  vencimento?: string;
  valor?: number;
  beneficiario?: string;
  isBoleto: boolean;
}

interface ParsedTx {
  description: string;
  amount: number;
  type: "income" | "expense" | "transfer";
  entityType: "PJ" | "PF";
  dueDate?: string; // ISO string from JSON
  paymentMethod: "credit" | "debit" | "pix" | "cash" | "boleto" | "other";
  status: "paid" | "pending";
  notes?: string;
  boleto?: BoletoData;
  isTransferCandidate?: boolean;
  accountSource?: string; // e.g. "Nubank PF", "Banco 301 PJ"
}

type ImportSource = "import_csv" | "import_excel" | "import_pdf";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatMoney(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fileIcon(name: string) {
  const ext = name.toLowerCase();
  if (ext.endsWith(".pdf")) return <File className="w-5 h-5 text-red-500" />;
  if (ext.endsWith(".csv")) return <FileText className="w-5 h-5 text-green-600" />;
  return <FileSpreadsheet className="w-5 h-5 text-emerald-600" />;
}

function sourceFromName(name: string): ImportSource {
  const ext = name.toLowerCase();
  if (ext.endsWith(".pdf")) return "import_pdf";
  if (ext.endsWith(".xlsx") || ext.endsWith(".xls")) return "import_excel";
  return "import_csv";
}

// ─── Row editor ──────────────────────────────────────────────────────────────

function TxRow({
  tx,
  index,
  onUpdate,
  onRemove,
}: {
  tx: ParsedTx;
  index: number;
  onUpdate: (i: number, updated: ParsedTx) => void;
  onRemove: (i: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border border-border rounded-xl overflow-hidden">
      {/* Summary row */}
      <div
        className="flex items-center gap-2 px-3 py-2.5 cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={() => setExpanded((e) => !e)}
      >
        <span
          className={`w-2 h-2 rounded-full shrink-0 ${
            tx.type === "income" ? "bg-green-500" :
            tx.type === "transfer" ? "bg-blue-400" :
            "bg-red-500"
          }`}
        />
        <span className="flex-1 text-sm font-medium truncate">{tx.description}</span>
        {tx.isTransferCandidate && (
          <span className="text-[10px] bg-blue-100 text-blue-700 border border-blue-200 rounded-full px-1.5 py-0 shrink-0 font-medium">
            ⇄ Transfer
          </span>
        )}
        {tx.accountSource && (
          <span className="text-[10px] bg-violet-100 text-violet-700 border border-violet-200 rounded-full px-1.5 py-0 shrink-0 font-medium">
            {tx.accountSource}
          </span>
        )}
        <span className={`text-sm font-semibold shrink-0 ${
          tx.type === "income" ? "text-green-600" :
          tx.type === "transfer" ? "text-blue-600" :
          "text-red-600"
        }`}>
          {tx.type === "income" ? "+" : tx.type === "transfer" ? "⇄" : "-"}{formatMoney(tx.amount)}
        </span>
        <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0">{tx.entityType}</Badge>
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(index); }}
          className="p-1 rounded hover:bg-red-100 text-muted-foreground hover:text-red-600 shrink-0"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
        {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />}
      </div>

      {/* Edit form */}
      {expanded && (
        <div className="px-3 pb-3 pt-1 bg-muted/30 border-t border-border space-y-2">
          <div>
            <label className="text-xs text-muted-foreground">Descrição</label>
            <input
              className="w-full mt-0.5 px-2 py-1.5 text-sm border border-border rounded-lg bg-background"
              value={tx.description}
              onChange={(e) => onUpdate(index, { ...tx, description: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-muted-foreground">Valor (R$)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                className="w-full mt-0.5 px-2 py-1.5 text-sm border border-border rounded-lg bg-background"
                value={tx.amount}
                onChange={(e) => onUpdate(index, { ...tx, amount: parseFloat(e.target.value) || 0 })}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Vencimento</label>
              <input
                type="date"
                className="w-full mt-0.5 px-2 py-1.5 text-sm border border-border rounded-lg bg-background"
                value={tx.dueDate ? tx.dueDate.split("T")[0] : ""}
                onChange={(e) => onUpdate(index, { ...tx, dueDate: e.target.value || undefined })}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-muted-foreground">Tipo</label>
              <select
                className="w-full mt-0.5 px-2 py-1.5 text-sm border border-border rounded-lg bg-background"
                value={tx.type}
                onChange={(e) => onUpdate(index, { ...tx, type: e.target.value as "income" | "expense" | "transfer", isTransferCandidate: e.target.value === 'transfer' })}
              >
                <option value="expense">Saída / Despesa</option>
                <option value="income">Entrada / Receita</option>
                <option value="transfer">⇄ Transferência (ignorar)</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">PJ / PF</label>
              <select
                className="w-full mt-0.5 px-2 py-1.5 text-sm border border-border rounded-lg bg-background"
                value={tx.entityType}
                onChange={(e) => onUpdate(index, { ...tx, entityType: e.target.value as "PJ" | "PF" })}
              >
                <option value="PF">PF (Pessoal)</option>
                <option value="PJ">PJ (Empresa)</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-muted-foreground">Forma de Pagamento</label>
              <select
                className="w-full mt-0.5 px-2 py-1.5 text-sm border border-border rounded-lg bg-background"
                value={tx.paymentMethod}
                onChange={(e) => onUpdate(index, { ...tx, paymentMethod: e.target.value as ParsedTx["paymentMethod"] })}
              >
                <option value="pix">PIX</option>
                <option value="credit">Cartão Crédito</option>
                <option value="debit">Cartão Débito</option>
                <option value="boleto">Boleto</option>
                <option value="cash">Dinheiro</option>
                <option value="other">Outro</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Status</label>
              <select
                className="w-full mt-0.5 px-2 py-1.5 text-sm border border-border rounded-lg bg-background"
                value={tx.status}
                onChange={(e) => onUpdate(index, { ...tx, status: e.target.value as "paid" | "pending" })}
              >
                <option value="pending">Pendente</option>
                <option value="paid">Pago</option>
              </select>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Boleto Card ──────────────────────────────────────────────────────────────
function BoletoCard({ boleto }: { boleto: BoletoData }) {
  const [copied, setCopied] = useState(false);
  const copiable = boleto.linhaDigitavel || boleto.codigoBarras;

  const handleCopy = () => {
    if (!copiable) return;
    navigator.clipboard.writeText(copiable).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <Card className="border-amber-200 bg-amber-50/60">
      <CardHeader className="pb-2 pt-3 px-4">
        <CardTitle className="text-sm font-semibold text-amber-800 flex items-center gap-2">
          <File className="w-4 h-4" />
          Boleto detectado
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4 space-y-3">
        {boleto.beneficiario && (
          <div>
            <p className="text-xs text-muted-foreground">Beneficiário</p>
            <p className="text-sm font-medium">{boleto.beneficiario}</p>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          {boleto.valor !== undefined && (
            <div>
              <p className="text-xs text-muted-foreground">Valor</p>
              <p className="text-sm font-bold text-red-600">{formatMoney(boleto.valor)}</p>
            </div>
          )}
          {boleto.vencimento && (
            <div>
              <p className="text-xs text-muted-foreground">Vencimento</p>
              <p className="text-sm font-semibold">
                {new Date(boleto.vencimento).toLocaleDateString("pt-BR")}
              </p>
            </div>
          )}
        </div>
        {copiable && (
          <div>
            <p className="text-xs text-muted-foreground mb-1">
              {boleto.linhaDigitavel ? "Linha digitável" : "Código de barras"}
            </p>
            <div className="flex items-center gap-2 bg-white border border-amber-200 rounded-lg px-3 py-2">
              <code className="text-xs flex-1 break-all font-mono text-amber-900 leading-relaxed">
                {copiable}
              </code>
              <button
                onClick={handleCopy}
                className="shrink-0 p-1.5 rounded-md hover:bg-amber-100 transition-colors"
                title="Copiar linha digitável"
              >
                {copied
                  ? <Check className="w-4 h-4 text-green-600" />
                  : <Copy className="w-4 h-4 text-amber-700" />}
              </button>
            </div>
            {copied && (
              <p className="text-xs text-green-600 mt-1">✓ Copiado para a área de transferência!</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Importar() {
  const [dragging, setDragging] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [filename, setFilename] = useState<string | null>(null);
  const [source, setSource] = useState<ImportSource>("import_csv");
  const [transactions, setTransactions] = useState<ParsedTx[]>([]);
  const [selectAll, setSelectAll] = useState(true);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [step, setStep] = useState<"upload" | "preview" | "done">("upload");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Duplicate detection state
  const [duplicateResults, setDuplicateResults] = useState<DuplicateResult[]>([]);
  const [duplicateActions, setDuplicateActions] = useState<Record<number, DuplicateAction>>({});
  const [checkingDuplicates, setCheckingDuplicates] = useState(false);

  const checkDuplicates = trpc.import.checkDuplicates.useMutation();

  const getDuplicateResult = (i: number): DuplicateResult | undefined =>
    duplicateResults.find((r) => r.index === i);

  const getDuplicateAction = (i: number): DuplicateAction => duplicateActions[i] ?? 'import';

  const setDuplicateAction = (i: number, action: DuplicateAction) =>
    setDuplicateActions((prev) => ({ ...prev, [i]: action }));

  const bulkImport = trpc.import.bulk.useMutation({
    onSuccess: (data) => {
      toast.success(`${data.imported} transação(ões) importada(s) com sucesso!`);
      setStep("done");
    },
    onError: (err) => toast.error(err.message),
  });

  // ── File processing ──────────────────────────────────────────────────────

  const processFile = useCallback(async (file: File) => {
    setParsing(true);
    setFilename(file.name);
    setSource(sourceFromName(file.name));

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/upload/parse", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao processar arquivo");
      if (data.count === 0) {
        toast.warning("Nenhuma transação encontrada no arquivo. Verifique o formato.");
        setParsing(false);
        return;
      }
      // Normalize dates
      const txs: ParsedTx[] = (data.transactions as ParsedTx[]).map((t) => ({
        ...t,
        dueDate: t.dueDate ? new Date(t.dueDate).toISOString() : undefined,
      }));
      setTransactions(txs);
      setSelected(new Set(txs.map((_, i) => i)));
      setSelectAll(true);
      setDuplicateResults([]);
      setDuplicateActions({});
      setStep("preview");
      toast.success(`${data.count} transação(ões) detectada(s). Revise antes de importar.`);
      // Check for duplicates in background
      setCheckingDuplicates(true);
      checkDuplicates.mutate(
        { transactions: txs.map((t) => ({ description: t.description, amount: t.amount, dueDate: t.dueDate ? new Date(t.dueDate) : undefined })) },
        {
          onSuccess: (results) => {
            setDuplicateResults(results);
            const dupeCount = results.filter((r) => r.status !== 'new').length;
            if (dupeCount > 0) {
              toast.warning(`${dupeCount} transação(ões) podem ser duplicatas. Verifique antes de importar.`);
            }
            setCheckingDuplicates(false);
          },
          onError: () => setCheckingDuplicates(false),
        }
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro desconhecido";
      toast.error(msg);
    } finally {
      setParsing(false);
    }
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    e.target.value = "";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  // ── Selection ────────────────────────────────────────────────────────────

  const toggleAll = () => {
    if (selectAll) {
      setSelected(new Set());
      setSelectAll(false);
    } else {
      setSelected(new Set(transactions.map((_, i) => i)));
      setSelectAll(true);
    }
  };

  const toggleOne = (i: number) => {
    const next = new Set(selected);
    if (next.has(i)) next.delete(i);
    else next.add(i);
    setSelected(next);
    setSelectAll(next.size === transactions.length);
  };

  // ── Update / Remove ──────────────────────────────────────────────────────

  const updateTx = (i: number, updated: ParsedTx) => {
    setTransactions((prev) => prev.map((t, idx) => (idx === i ? updated : t)));
  };

  const removeTx = (i: number) => {
    setTransactions((prev) => prev.filter((_, idx) => idx !== i));
    setSelected((prev) => {
      const next = new Set<number>();
      prev.forEach((v) => { if (v < i) next.add(v); else if (v > i) next.add(v - 1); });
      return next;
    });
  };

  // ── Import ────────────────────────────────────────────────────────────────────────────────

  const handleImport = () => {
    const toImport = transactions
      .filter((_, i) => {
        if (!selected.has(i)) return false;
        const action = getDuplicateAction(i);
        return action !== 'skip';
      })
      .map((t) => {
        const origIndex = transactions.indexOf(t);
        const dupeResult = getDuplicateResult(origIndex);
        const action = getDuplicateAction(origIndex);
        const replaceId = action === 'replace' && dupeResult?.duplicates[0]?.id
          ? dupeResult.duplicates[0].id
          : undefined;
        return {
          ...t,
          dueDate: t.dueDate ? new Date(t.dueDate) : undefined,
          replaceId,
        };
      });

    if (toImport.length === 0) {
      toast.warning("Selecione ao menos uma transação para importar.");
      return;
    }

    bulkImport.mutate({ transactions: toImport, source });
  };

  // ─── Render ────────────────────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/" className="p-2 rounded-xl hover:bg-muted transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-xl font-bold">Importar Arquivo</h1>
          <p className="text-sm text-muted-foreground">CSV, Excel (.xlsx) ou PDF</p>
        </div>
      </div>

      {/* Step: Upload */}
      {step === "upload" && (
        <div className="space-y-4">
          {/* Drop zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-colors ${
              dragging ? "border-blue-500 bg-blue-50" : "border-border hover:border-blue-400 hover:bg-muted/30"
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls,.pdf"
              className="hidden"
              onChange={handleFileChange}
            />
            {parsing ? (
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
                <p className="text-sm text-muted-foreground">Processando arquivo...</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <div className="w-14 h-14 bg-blue-50 rounded-2xl flex items-center justify-center">
                  <Upload className="w-7 h-7 text-blue-600" />
                </div>
                <div>
                  <p className="font-semibold text-foreground">Toque para selecionar arquivo</p>
                  <p className="text-sm text-muted-foreground mt-1">ou arraste e solte aqui</p>
                </div>
                <div className="flex gap-2 flex-wrap justify-center">
                  <Badge variant="secondary" className="gap-1"><FileText className="w-3 h-3" /> CSV</Badge>
                  <Badge variant="secondary" className="gap-1"><FileSpreadsheet className="w-3 h-3" /> Excel</Badge>
                  <Badge variant="secondary" className="gap-1"><File className="w-3 h-3" /> PDF</Badge>
                </div>
              </div>
            )}
          </div>

          {/* Tips */}
          <Card className="border-blue-100 bg-blue-50/50">
            <CardContent className="pt-4 pb-4 space-y-2">
              <div className="flex items-start gap-2">
                <Info className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
                <div className="text-sm text-blue-800 space-y-1">
                  <p className="font-medium">Como exportar do seu banco:</p>
                  <ul className="list-disc list-inside space-y-0.5 text-xs">
                    <li><strong>Nubank:</strong> App → Extrato → Exportar → CSV</li>
                    <li><strong>Bradesco:</strong> Internet Banking → Extrato → Exportar</li>
                    <li><strong>Itaú:</strong> App → Extrato → Compartilhar → CSV</li>
                    <li><strong>Qualquer banco:</strong> Salve o extrato como PDF e envie aqui</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Step: Preview */}
      {step === "preview" && (
        <div className="space-y-4">
          {/* File info */}
          <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-xl">
            {filename && fileIcon(filename)}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{filename}</p>
              <p className="text-xs text-muted-foreground">{transactions.length} transação(ões) detectada(s)</p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => { setStep("upload"); setTransactions([]); }}>
              Trocar
            </Button>
          </div>

          {/* Select all + global entity toggle */}
          <div className="flex items-center justify-between px-1">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={selectAll}
                onChange={toggleAll}
                className="w-4 h-4 rounded accent-blue-600"
              />
              <span className="text-sm font-medium">
                Selecionar todas ({selected.size}/{transactions.length})
              </span>
            </label>
            <div className="flex gap-1">
              <Button
                variant="outline"
                size="sm"
                className="text-xs h-7"
                onClick={() => setTransactions((prev) => prev.map((t) => ({ ...t, entityType: "PF" })))}
              >
                Tudo PF
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-xs h-7"
                onClick={() => setTransactions((prev) => prev.map((t) => ({ ...t, entityType: "PJ" })))}
              >
                Tudo PJ
              </Button>
            </div>
          </div>

          {/* Boleto card - show if any transaction has boleto data */}
          {transactions.some((t) => t.boleto?.isBoleto) && (
            <BoletoCard boleto={transactions.find((t) => t.boleto?.isBoleto)!.boleto!} />
          )}

          {/* Duplicate check status banner */}
          {checkingDuplicates && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/40 rounded-lg px-3 py-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Verificando duplicatas...
            </div>
          )}
          {!checkingDuplicates && duplicateResults.some((r) => r.status !== 'new') && (
            <div className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              <span className="text-xs text-amber-800 font-medium">
                ⚠️ {duplicateResults.filter((r) => r.status !== 'new').length} possível(is) duplicata(s) encontrada(s)
              </span>
              <button
                className="text-xs text-amber-700 underline"
                onClick={() => {
                  duplicateResults.filter((r) => r.status !== 'new').forEach((r) => setDuplicateAction(r.index, 'skip'));
                }}
              >
                Pular todas
              </button>
            </div>
          )}

          {/* Transfer detection banner */}
          {transactions.some((t) => t.isTransferCandidate) && (
            <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
              <div className="flex items-center gap-2">
                <span className="text-blue-600 font-bold text-sm">⇄</span>
                <span className="text-xs text-blue-800 font-medium">
                  {transactions.filter((t) => t.isTransferCandidate).length} transferência(s) entre contas próprias detectada(s) — não entram no saldo
                </span>
              </div>
              <button
                className="text-xs text-blue-700 underline shrink-0"
                onClick={() => setTransactions((prev) =>
                  prev.map((t) => t.isTransferCandidate ? { ...t, type: 'transfer' as const } : t)
                )}
              >
                Ignorar todas
              </button>
            </div>
          )}

          {/* Transaction list */}
          <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
            {transactions.map((tx, i) => {
              const dupeResult = getDuplicateResult(i);
              const isDupe = dupeResult && dupeResult.status !== 'new';
              const action = getDuplicateAction(i);
              return (
                <div key={i} className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={selected.has(i)}
                    onChange={() => toggleOne(i)}
                    className="mt-3 w-4 h-4 rounded accent-blue-600 shrink-0"
                  />
                  <div className="flex-1 min-w-0 space-y-1">
                    <TxRow tx={tx} index={i} onUpdate={updateTx} onRemove={removeTx} />
                    {isDupe && (
                      <div className={`rounded-lg px-3 py-2 text-xs space-y-1.5 ${
                        dupeResult.status === 'duplicate_exact'
                          ? 'bg-red-50 border border-red-200'
                          : 'bg-amber-50 border border-amber-200'
                      }`}>
                        <p className={`font-semibold ${
                          dupeResult.status === 'duplicate_exact' ? 'text-red-700' : 'text-amber-700'
                        }`}>
                          {dupeResult.status === 'duplicate_exact' ? '🔴 Duplicata exata' : '🟡 Possível duplicata'} — já existe: &ldquo;{dupeResult.duplicates[0]?.description}&rdquo; ({dupeResult.duplicates[0]?.amount?.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })})
                        </p>
                        <div className="flex gap-1.5 flex-wrap">
                          <button
                            onClick={() => setDuplicateAction(i, 'skip')}
                            className={`px-2 py-0.5 rounded-full border text-xs font-medium transition-colors ${
                              action === 'skip'
                                ? 'bg-gray-600 text-white border-gray-600'
                                : 'border-gray-400 text-gray-600 hover:bg-gray-100'
                            }`}
                          >
                            Pular
                          </button>
                          <button
                            onClick={() => setDuplicateAction(i, 'import')}
                            className={`px-2 py-0.5 rounded-full border text-xs font-medium transition-colors ${
                              action === 'import'
                                ? 'bg-blue-600 text-white border-blue-600'
                                : 'border-blue-400 text-blue-600 hover:bg-blue-50'
                            }`}
                          >
                            Importar mesmo assim
                          </button>
                          <button
                            onClick={() => setDuplicateAction(i, 'replace')}
                            className={`px-2 py-0.5 rounded-full border text-xs font-medium transition-colors ${
                              action === 'replace'
                                ? 'bg-orange-600 text-white border-orange-600'
                                : 'border-orange-400 text-orange-600 hover:bg-orange-50'
                            }`}
                          >
                            Substituir existente
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Summary + Import button */}
          <div className="sticky bottom-0 bg-background pt-2 pb-1 space-y-2 border-t border-border">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Selecionadas:</span>
              <span className="font-semibold">{selected.size} transação(ões)</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Total selecionado:</span>
              <span className="font-semibold text-red-600">
                {formatMoney(
                  transactions
                    .filter((_, i) => selected.has(i))
                    .reduce((s, t) => s + t.amount, 0)
                )}
              </span>
            </div>
            <Button
              className="w-full"
              size="lg"
              onClick={handleImport}
              disabled={bulkImport.isPending || selected.size === 0}
            >
              {bulkImport.isPending ? (
                <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Importando...</>
              ) : (
                <><Upload className="w-4 h-4 mr-2" /> Importar {selected.size} transação(ões)</>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Step: Done */}
      {step === "done" && (
        <div className="text-center space-y-6 py-8">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-10 h-10 text-green-600" />
          </div>
          <div>
            <h2 className="text-xl font-bold">Importação concluída!</h2>
            <p className="text-muted-foreground mt-1">
              As transações foram adicionadas ao seu histórico.
            </p>
          </div>
          <div className="flex flex-col gap-3">
            <Link href="/historico">
              <Button className="w-full" size="lg">Ver Histórico</Button>
            </Link>
            <Button
              variant="outline"
              size="lg"
              className="w-full"
              onClick={() => { setStep("upload"); setTransactions([]); setFilename(null); }}
            >
              Importar outro arquivo
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
