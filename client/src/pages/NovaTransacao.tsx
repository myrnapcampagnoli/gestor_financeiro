import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Building2, CreditCard, DollarSign, Hash, Repeat, User } from "lucide-react";
import { useState } from "react";
import { useLocation, useSearch } from "wouter";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Tab = "single" | "installment";

export default function NovaTransacao() {
  const [, navigate] = useLocation();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const defaultType = params.get("type") === "income" ? "income" : "expense";

  const [tab, setTab] = useState<Tab>("single");
  const [type, setType] = useState<"income" | "expense" | "transfer">(defaultType);
  const [entityType, setEntityType] = useState<"PJ" | "PF">("PF");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("pix");
  const [status, setStatus] = useState("pending");
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [installmentCount, setInstallmentCount] = useState("2");
  const [startDate, setStartDate] = useState("");

  const { data: categories } = trpc.categories.list.useQuery();
  const [categoryId, setCategoryId] = useState<string>("");

  const createTx = trpc.transactions.create.useMutation({
    onSuccess: () => { toast.success("Transação criada!"); navigate("/contas"); },
    onError: (e) => toast.error(e.message || "Erro ao criar transação"),
  });

  const createInstallment = trpc.installments.create.useMutation({
    onSuccess: () => { toast.success("Parcelamento criado!"); navigate("/contas"); },
    onError: (e) => toast.error(e.message || "Erro ao criar parcelamento"),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const amountNum = parseFloat(amount.replace(",", "."));
    if (!description.trim()) { toast.error("Informe a descrição"); return; }
    if (!amountNum || amountNum <= 0) { toast.error("Informe um valor válido"); return; }

    if (tab === "installment") {
      if (!startDate) { toast.error("Informe a data de início"); return; }
      createInstallment.mutate({
        description, totalAmount: amountNum,
        installmentCount: parseInt(installmentCount),
        entityType, paymentMethod: paymentMethod as any,
        categoryId: categoryId ? parseInt(categoryId) : undefined,
        startDate: new Date(startDate + "T12:00:00"),
      });
    } else {
      createTx.mutate({
        description, amount: amountNum, type, entityType,
        paymentMethod: paymentMethod as any,
        status: status as any,
        dueDate: dueDate ? new Date(dueDate + "T12:00:00") : undefined,
        notes: notes || undefined,
        categoryId: categoryId ? parseInt(categoryId) : undefined,
      });
    }
  };

  return (
    <div className="p-4 max-w-lg mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1 as any)} className="p-2 rounded-xl hover:bg-muted transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-xl font-bold">Nova Transação</h1>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 p-1 bg-muted rounded-xl">
        <button
          onClick={() => setTab("single")}
          className={cn("flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-colors",
            tab === "single" ? "bg-white shadow-sm text-foreground" : "text-muted-foreground")}
        >
          <DollarSign className="w-4 h-4" />
          Avulso
        </button>
        <button
          onClick={() => setTab("installment")}
          className={cn("flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-colors",
            tab === "installment" ? "bg-white shadow-sm text-foreground" : "text-muted-foreground")}
        >
          <Repeat className="w-4 h-4" />
          Parcelado
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Tipo PJ/PF */}
        <div className="flex gap-2">
          <button type="button" onClick={() => setEntityType("PJ")}
            className={cn("flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border-2 text-sm font-semibold transition-all",
              entityType === "PJ" ? "border-blue-500 bg-blue-50 text-blue-700" : "border-border text-muted-foreground hover:border-blue-200")}>
            <Building2 className="w-4 h-4" />
            Pessoa Jurídica (PJ)
          </button>
          <button type="button" onClick={() => setEntityType("PF")}
            className={cn("flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border-2 text-sm font-semibold transition-all",
              entityType === "PF" ? "border-purple-500 bg-purple-50 text-purple-700" : "border-border text-muted-foreground hover:border-purple-200")}>
            <User className="w-4 h-4" />
            Pessoa Física (PF)
          </button>
        </div>

        {/* Tipo de transação (só para avulso) */}
        {tab === "single" && (
          <div className="flex gap-2">
            {(["expense", "income", "transfer"] as const).map(t => (
              <button key={t} type="button" onClick={() => setType(t)}
                className={cn("flex-1 py-2.5 rounded-xl border-2 text-xs font-semibold transition-all",
                  type === t
                    ? t === "expense" ? "border-red-400 bg-red-50 text-red-700"
                      : t === "income" ? "border-green-400 bg-green-50 text-green-700"
                      : "border-blue-400 bg-blue-50 text-blue-700"
                    : "border-border text-muted-foreground")}>
                {t === "expense" ? "Saída" : t === "income" ? "Entrada" : "Transferência"}
              </button>
            ))}
          </div>
        )}

        {/* Descrição */}
        <div className="space-y-1.5">
          <Label htmlFor="description">Descrição *</Label>
          <Input id="description" placeholder="Ex: Conta Vivo, Aluguel, Fornecedor..." value={description} onChange={e => setDescription(e.target.value)} className="rounded-xl" required />
        </div>

        {/* Valor */}
        <div className="space-y-1.5">
          <Label htmlFor="amount">{tab === "installment" ? "Valor Total *" : "Valor *"}</Label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-medium">R$</span>
            <Input id="amount" placeholder="0,00" value={amount} onChange={e => setAmount(e.target.value)} className="pl-9 rounded-xl text-lg font-semibold" required />
          </div>
        </div>

        {/* Parcelamento */}
        {tab === "installment" && (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="installmentCount">Nº de Parcelas *</Label>
              <div className="relative">
                <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input id="installmentCount" type="number" min="2" max="60" value={installmentCount} onChange={e => setInstallmentCount(e.target.value)} className="pl-9 rounded-xl" />
              </div>
              {amount && parseInt(installmentCount) >= 2 && (
                <p className="text-xs text-muted-foreground">
                  {parseInt(installmentCount)}x de R$ {(parseFloat(amount.replace(",", ".")) / parseInt(installmentCount)).toFixed(2).replace(".", ",")}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="startDate">Data 1ª Parcela *</Label>
              <Input id="startDate" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="rounded-xl" required />
            </div>
          </div>
        )}

        {/* Forma de pagamento */}
        <div className="space-y-1.5">
          <Label>Forma de Pagamento</Label>
          <div className="grid grid-cols-4 gap-2">
            {[
              { value: "credit", label: "Crédito", icon: "💳" },
              { value: "debit", label: "Débito", icon: "🏧" },
              { value: "pix", label: "PIX", icon: "⚡" },
              { value: "cash", label: "Dinheiro", icon: "💵" },
            ].map(m => (
              <button key={m.value} type="button" onClick={() => setPaymentMethod(m.value)}
                className={cn("flex flex-col items-center gap-1 py-2.5 rounded-xl border-2 text-xs font-medium transition-all",
                  paymentMethod === m.value ? "border-blue-500 bg-blue-50 text-blue-700" : "border-border text-muted-foreground hover:border-blue-200")}>
                <span className="text-base">{m.icon}</span>
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {/* Status e Vencimento (só para avulso) */}
        {tab === "single" && (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pendente</SelectItem>
                  <SelectItem value="paid">Pago</SelectItem>
                  <SelectItem value="scheduled">Programado</SelectItem>
                  <SelectItem value="overdue">Atrasado</SelectItem>
                  <SelectItem value="legal">Jurídico</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dueDate">Vencimento</Label>
              <Input id="dueDate" type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className="rounded-xl" />
            </div>
          </div>
        )}

        {/* Categoria */}
        {categories && categories.length > 0 && (
          <div className="space-y-1.5">
            <Label>Categoria</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger className="rounded-xl">
                <SelectValue placeholder="Selecionar categoria..." />
              </SelectTrigger>
              <SelectContent>
                {categories.map(cat => (
                  <SelectItem key={cat.id} value={String(cat.id)}>
                    {cat.icon} {cat.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Observações */}
        {tab === "single" && (
          <div className="space-y-1.5">
            <Label htmlFor="notes">Observações</Label>
            <Textarea id="notes" placeholder="Notas adicionais..." value={notes} onChange={e => setNotes(e.target.value)} className="rounded-xl resize-none" rows={2} />
          </div>
        )}

        <Button type="submit" className="w-full rounded-xl py-6 text-base font-semibold"
          disabled={createTx.isPending || createInstallment.isPending}>
          {createTx.isPending || createInstallment.isPending ? "Salvando..." :
           tab === "installment" ? `Criar ${installmentCount} Parcelas` : "Salvar Transação"}
        </Button>
      </form>
    </div>
  );
}
