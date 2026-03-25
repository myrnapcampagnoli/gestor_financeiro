import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Building2, Download, LogOut, Plus, User } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export default function Configuracoes() {
  const { user, logout } = useAuth();
  const [newAccountName, setNewAccountName] = useState("");
  const [newAccountBank, setNewAccountBank] = useState("");
  const [newAccountType, setNewAccountType] = useState<"PJ" | "PF">("PF");

  const { data: accounts, refetch } = trpc.accounts.list.useQuery();
  const { data: csvData } = trpc.export.csv.useQuery();

  const createAccount = trpc.accounts.create.useMutation({
    onSuccess: () => { toast.success("Conta criada!"); refetch(); setNewAccountName(""); setNewAccountBank(""); },
    onError: (e) => toast.error(e.message || "Erro ao criar conta"),
  });

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

          {/* Add Account */}
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

      {/* Exportar */}
      <Card>
        <CardHeader className="pb-3 pt-4 px-4">
          <CardTitle className="text-sm">Exportar Dados</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-2">
          <p className="text-xs text-muted-foreground">
            Exporte todas as suas transações em formato CSV para backup ou análise em Excel.
          </p>
          <Button variant="outline" className="w-full rounded-xl gap-2" onClick={handleExport}>
            <Download className="w-4 h-4" />
            Exportar CSV
          </Button>
        </CardContent>
      </Card>

      {/* Info */}
      <Card className="border-blue-100 bg-blue-50/30">
        <CardContent className="p-4">
          <p className="text-xs text-blue-700 font-medium">💡 Dica de Backup</p>
          <p className="text-xs text-blue-600 mt-1">
            Exporte seu CSV regularmente e salve no Google Drive, Dropbox ou OneDrive para ter backup dos seus dados financeiros.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
