import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Building2, Download, LogOut, Plus, User, Bell, Calendar } from "lucide-react";
import { useState, useMemo } from "react";
import { toast } from "sonner";

// Gera lista de meses dos últimos 2 anos
function getMonthOptions() {
  const opts: { label: string; from: string; to: string }[] = [];
  const now = new Date();
  for (let i = 0; i < 24; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const from = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
    const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    const to = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${lastDay}`;
    const label = d.toLocaleString('pt-BR', { month: 'long', year: 'numeric' });
    opts.push({ label: label.charAt(0).toUpperCase() + label.slice(1), from, to });
  }
  return opts;
}

export default function Configuracoes() {
  const { user, logout } = useAuth();
  const [newAccountName, setNewAccountName] = useState("");
  const [newAccountBank, setNewAccountBank] = useState("");
  const [newAccountType, setNewAccountType] = useState<"PJ" | "PF">("PF");
  const [exportPeriod, setExportPeriod] = useState<string>("all");

  const monthOptions = useMemo(() => getMonthOptions(), []);

  const { data: accounts, refetch } = trpc.accounts.list.useQuery();

  // Filtros de exportação baseados no período selecionado
  const exportInput = useMemo(() => {
    if (exportPeriod === "all") return undefined;
    const opt = monthOptions.find(o => o.from === exportPeriod);
    if (!opt) return undefined;
    return { from: opt.from, to: opt.to };
  }, [exportPeriod, monthOptions]);

  const { data: csvData, isLoading: csvLoading } = trpc.export.csv.useQuery(exportInput);
  const { data: summary } = trpc.export.summary.useQuery();

  const notifyBackup = trpc.system.notifyOwner.useMutation({
    onSuccess: () => toast.success("Resumo financeiro enviado para suas notificações Manus!"),
    onError: () => toast.error("Erro ao enviar notificação"),
  });

  const createAccount = trpc.accounts.create.useMutation({
    onSuccess: () => { toast.success("Conta criada!"); refetch(); setNewAccountName(""); setNewAccountBank(""); },
    onError: (e) => toast.error(e.message || "Erro ao criar conta"),
  });

  const handleExport = () => {
    if (!csvData?.csv) { toast.error("Nenhum dado para exportar"); return; }
    const bom = '\uFEFF'; // BOM para Excel reconhecer UTF-8
    const blob = new Blob([bom + csvData.csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = csvData.filename || `financeiro_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`CSV exportado — ${csvData.total} transações`);
  };

  const handleBackupNotification = () => {
    if (!summary) return;
    const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    notifyBackup.mutate({
      title: `📊 Resumo Financeiro — ${summary.month}`,
      content: `Entradas: ${fmt(summary.income)}\nSaídas: ${fmt(summary.expense)}\nSaldo: ${fmt(summary.balance)}\n\nPendentes: ${summary.pending} transações\nAtrasados: ${summary.overdue} transações\n\nAcesse o sistema para ver detalhes: https://gestorfins-cs7aayyt.manus.space`,
    });
  };

  return (
    <div className="p-4 space-y-5 max-w-2xl mx-auto">
      <h1 className="text-xl font-bold">Configurações</h1>

      {/* Perfil */}
      <Card>
        <CardHeader className="pb-3 pt-4 px-4">
          <CardTitle className="text-sm">Perfil</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
              <User className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <p className="font-semibold">{user?.name || "Usuário"}</p>
              <p className="text-sm text-muted-foreground">{user?.email || ""}</p>
            </div>
          </div>
          <Button variant="outline" className="w-full mt-4 rounded-xl gap-2" onClick={() => logout()}>
            <LogOut className="w-4 h-4" />
            Sair da conta
          </Button>
        </CardContent>
      </Card>

      {/* Contas Bancárias */}
      <Card>
        <CardHeader className="pb-3 pt-4 px-4">
          <CardTitle className="text-sm">Contas Bancárias</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-3">
          {(accounts || []).map(acc => (
            <div key={acc.id} className="flex items-center gap-3 p-3 rounded-xl bg-muted/50">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${acc.type === "PJ" ? "bg-blue-100" : "bg-purple-100"}`}>
                {acc.type === "PJ" ? <Building2 className="w-4 h-4 text-blue-600" /> : <User className="w-4 h-4 text-purple-600" />}
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium">{acc.name}</p>
                <p className="text-xs text-muted-foreground">{acc.bank || ""} · {acc.type}</p>
              </div>
            </div>
          ))}

          <div className="space-y-2 pt-2 border-t border-border">
            <p className="text-xs font-medium text-muted-foreground">Adicionar conta</p>
            <Input
              placeholder="Nome da conta (ex: Nubank PJ)"
              value={newAccountName}
              onChange={e => setNewAccountName(e.target.value)}
              className="rounded-xl"
            />
            <div className="flex gap-2">
              <Input
                placeholder="Banco (opcional)"
                value={newAccountBank}
                onChange={e => setNewAccountBank(e.target.value)}
                className="rounded-xl flex-1"
              />
              <Select value={newAccountType} onValueChange={v => setNewAccountType(v as "PJ" | "PF")}>
                <SelectTrigger className="rounded-xl w-24">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PJ">PJ</SelectItem>
                  <SelectItem value="PF">PF</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              className="w-full rounded-xl gap-2"
              variant="outline"
              onClick={() => {
                if (!newAccountName.trim()) { toast.error("Informe o nome da conta"); return; }
                createAccount.mutate({ name: newAccountName, bank: newAccountBank || undefined, type: newAccountType });
              }}
              disabled={createAccount.isPending}
            >
              <Plus className="w-4 h-4" />
              Adicionar Conta
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Exportar Dados */}
      <Card>
        <CardHeader className="pb-3 pt-4 px-4">
          <CardTitle className="text-sm flex items-center gap-2">
            <Download className="w-4 h-4" />
            Exportar Dados (Backup)
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-3">
          <p className="text-xs text-muted-foreground">
            Baixe suas transações em CSV — abre direto no Excel. Salve no Google Drive, Dropbox ou OneDrive para ter backup seguro.
          </p>

          {/* Seletor de período */}
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <Calendar className="w-3 h-3" /> Período
            </p>
            <Select value={exportPeriod} onValueChange={setExportPeriod}>
              <SelectTrigger className="rounded-xl">
                <SelectValue placeholder="Selecione o período" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os dados</SelectItem>
                {monthOptions.map(opt => (
                  <SelectItem key={opt.from} value={opt.from}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {csvData && (
            <p className="text-xs text-muted-foreground">
              {csvData.total} transações encontradas
            </p>
          )}

          <Button
            className="w-full rounded-xl gap-2"
            onClick={handleExport}
            disabled={csvLoading || !csvData?.csv}
          >
            <Download className="w-4 h-4" />
            {csvLoading ? "Preparando..." : `Baixar CSV${csvData?.total ? ` (${csvData.total} registros)` : ""}`}
          </Button>
        </CardContent>
      </Card>

      {/* Resumo por Notificação */}
      <Card>
        <CardHeader className="pb-3 pt-4 px-4">
          <CardTitle className="text-sm flex items-center gap-2">
            <Bell className="w-4 h-4" />
            Resumo Financeiro
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-3">
          <p className="text-xs text-muted-foreground">
            Receba um resumo do mês atual nas suas notificações do Manus com entradas, saídas, saldo e pendências.
          </p>
          {summary && (
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-green-50 rounded-lg p-2">
                <p className="text-green-700 font-medium">Entradas</p>
                <p className="text-green-800 font-bold">{summary.income.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
              </div>
              <div className="bg-red-50 rounded-lg p-2">
                <p className="text-red-700 font-medium">Saídas</p>
                <p className="text-red-800 font-bold">{summary.expense.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
              </div>
              <div className="bg-blue-50 rounded-lg p-2">
                <p className="text-blue-700 font-medium">Pendentes</p>
                <p className="text-blue-800 font-bold">{summary.pending} contas</p>
              </div>
              <div className="bg-orange-50 rounded-lg p-2">
                <p className="text-orange-700 font-medium">Atrasados</p>
                <p className="text-orange-800 font-bold">{summary.overdue} contas</p>
              </div>
            </div>
          )}
          <Button
            variant="outline"
            className="w-full rounded-xl gap-2"
            onClick={handleBackupNotification}
            disabled={notifyBackup.isPending || !summary}
          >
            <Bell className="w-4 h-4" />
            Enviar resumo para minhas notificações
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
