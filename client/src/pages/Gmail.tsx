import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { EntityBadge } from "@/components/StatusBadge";
import { formatMoney } from "@/components/MoneyDisplay";
import {
  AlertCircle, Building2, Check, FileText, Mail, RefreshCw,
  ShoppingBag, Smartphone, Unlink, User, Zap
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const docTypeConfig: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  extrato:       { label: "Extrato Bancário", icon: <FileText className="w-4 h-4" />, color: "bg-blue-100 text-blue-700" },
  fatura_cartao: { label: "Fatura Cartão",    icon: <ShoppingBag className="w-4 h-4" />, color: "bg-purple-100 text-purple-700" },
  conta_servico: { label: "Conta de Serviço", icon: <Smartphone className="w-4 h-4" />, color: "bg-orange-100 text-orange-700" },
  boleto:        { label: "Boleto",           icon: <FileText className="w-4 h-4" />, color: "bg-yellow-100 text-yellow-700" },
  other:         { label: "Outro",            icon: <Mail className="w-4 h-4" />, color: "bg-gray-100 text-gray-600" },
};

interface FoundEmail {
  id: string;
  subject: string;
  sender: string;
  documentType: string;
  amount: number | null;
  dueDate: Date | null;
  entityType: "PJ" | "PF";
}

export default function Gmail() {
  const [scanning, setScanning] = useState(false);
  const [foundEmails, setFoundEmails] = useState<FoundEmail[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Record<string, { description: string; amount: string; entityType: "PJ" | "PF"; dueDate: string }>>({});
  const [importedIds, setImportedIds] = useState<Set<string>>(new Set());

  const { data: connected, refetch: refetchConnected } = trpc.gmail.isConnected.useQuery();
  const { data: authUrl } = trpc.gmail.getAuthUrl.useQuery(
    { origin: typeof window !== "undefined" ? window.location.origin : "" },
    { enabled: !connected?.connected }
  );

  const disconnect = trpc.gmail.disconnect.useMutation({
    onSuccess: () => { toast.success("Gmail desconectado"); refetchConnected(); setFoundEmails([]); },
  });

  const scan = trpc.gmail.scanEmails.useMutation({
    onSuccess: (data) => {
      setFoundEmails(data.found as FoundEmail[]);
      setScanning(false);
      if (data.total === 0) toast.info("Nenhum email financeiro encontrado nos últimos 30 dias");
      else toast.success(`${data.total} emails encontrados!`);
    },
    onError: (e) => { toast.error(e.message || "Erro ao escanear emails"); setScanning(false); },
  });

  const importEmail = trpc.gmail.importEmail.useMutation({
    onSuccess: (_, vars) => {
      toast.success("Importado com sucesso!");
      setImportedIds(prev => { const next = new Set(Array.from(prev)); next.add(vars.gmailMessageId); return next; });
      setEditingId(null);
    },
    onError: (e) => toast.error(e.message || "Erro ao importar"),
  });

  const handleScan = () => {
    setScanning(true);
    scan.mutate();
  };

  const handleImport = (email: FoundEmail) => {
    const edit = editValues[email.id];
    const description = edit?.description || email.subject;
    const amount = edit?.amount ? parseFloat(edit.amount.replace(",", ".")) : email.amount;
    const entityType = edit?.entityType || email.entityType;
    const dueDate = edit?.dueDate ? new Date(edit.dueDate + "T12:00:00") : (email.dueDate ? new Date(email.dueDate) : undefined);

    if (!amount || amount <= 0) { toast.error("Informe um valor válido"); return; }

    importEmail.mutate({
      gmailMessageId: email.id,
      description,
      amount,
      entityType,
      dueDate,
    });
  };

  const startEdit = (email: FoundEmail) => {
    setEditingId(email.id);
    setEditValues(prev => ({
      ...prev,
      [email.id]: {
        description: email.subject,
        amount: email.amount?.toFixed(2).replace(".", ",") || "",
        entityType: email.entityType,
        dueDate: email.dueDate ? new Date(email.dueDate).toISOString().split("T")[0] : "",
      }
    }));
  };

  return (
    <div className="p-4 space-y-4 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-red-50 rounded-xl flex items-center justify-center">
          <Mail className="w-5 h-5 text-red-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Importar do Gmail</h1>
          <p className="text-sm text-muted-foreground">Extratos, faturas e contas de serviço</p>
        </div>
      </div>

      {/* Connection Status */}
      {!connected?.connected ? (
        <Card className="border-blue-100 bg-blue-50/50">
          <CardContent className="p-5 text-center space-y-4">
            <div className="w-14 h-14 bg-white rounded-2xl shadow-sm flex items-center justify-center mx-auto">
              <Mail className="w-7 h-7 text-red-500" />
            </div>
            <div>
              <h3 className="font-semibold text-base">Conectar ao Gmail</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Autorize o acesso para buscar automaticamente extratos bancários,
                faturas de cartão e contas de serviço (Vivo, Copel, etc.)
              </p>
            </div>
            <div className="flex flex-col gap-2 text-left bg-white rounded-xl p-3 text-sm">
              <div className="flex items-center gap-2 text-green-700"><Check className="w-4 h-4" /> Apenas leitura (sem envio)</div>
              <div className="flex items-center gap-2 text-green-700"><Check className="w-4 h-4" /> Sem acesso a senhas</div>
              <div className="flex items-center gap-2 text-green-700"><Check className="w-4 h-4" /> Você pode revogar a qualquer momento</div>
            </div>
            <Button
              className="w-full rounded-xl"
              onClick={() => authUrl?.url && window.open(authUrl.url, "_self")}
              disabled={!authUrl?.url}
            >
              <Mail className="w-4 h-4 mr-2" />
              Conectar Gmail
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Connected */}
          <Card className="border-green-100 bg-green-50/50">
            <CardContent className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-green-100 rounded-xl flex items-center justify-center">
                  <Check className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-green-800">Gmail Conectado</p>
                  <p className="text-xs text-green-700">Pronto para escanear emails</p>
                </div>
              </div>
              <button
                onClick={() => disconnect.mutate()}
                className="flex items-center gap-1.5 text-xs text-red-600 hover:text-red-700 font-medium"
              >
                <Unlink className="w-3.5 h-3.5" />
                Desconectar
              </button>
            </CardContent>
          </Card>

          {/* Scan Button */}
          <Button
            className="w-full rounded-xl py-5 text-base font-semibold gap-2"
            onClick={handleScan}
            disabled={scanning}
          >
            {scanning ? (
              <><RefreshCw className="w-5 h-5 animate-spin" /> Escaneando emails...</>
            ) : (
              <><Zap className="w-5 h-5" /> Escanear Emails Agora</>
            )}
          </Button>

          {/* What we search */}
          {foundEmails.length === 0 && !scanning && (
            <Card>
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm">O que vamos buscar:</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 space-y-2">
                {Object.entries(docTypeConfig).filter(([k]) => k !== "other").map(([key, config]) => (
                  <div key={key} className="flex items-center gap-2.5">
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${config.color}`}>
                      {config.icon}
                    </div>
                    <span className="text-sm text-muted-foreground">{config.label}</span>
                  </div>
                ))}
                <p className="text-xs text-muted-foreground pt-1">
                  Nubank, Bradesco, Itaú, Santander, Vivo, Claro, TIM, Copel, Cemig e mais...
                </p>
              </CardContent>
            </Card>
          )}

          {/* Found Emails */}
          {foundEmails.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold">{foundEmails.length} emails encontrados</h2>
                <span className="text-xs text-muted-foreground">
                  {importedIds.size} importados
                </span>
              </div>

              {foundEmails.map(email => {
                const config = docTypeConfig[email.documentType] || docTypeConfig.other;
                const isImported = importedIds.has(email.id);
                const isEditing = editingId === email.id;
                const edit = editValues[email.id];

                return (
                  <Card key={email.id} className={isImported ? "opacity-60 border-green-200 bg-green-50/30" : ""}>
                    <CardContent className="p-4 space-y-3">
                      {/* Email info */}
                      <div className="flex items-start gap-3">
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${config.color}`}>
                          {config.icon}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold truncate">{email.subject}</p>
                          <p className="text-xs text-muted-foreground truncate">{email.sender}</p>
                          <div className="flex items-center gap-1.5 mt-1">
                            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${config.color} border-0`}>
                              {config.label}
                            </Badge>
                            <EntityBadge type={email.entityType} />
                          </div>
                        </div>
                        {isImported && (
                          <div className="shrink-0">
                            <div className="w-7 h-7 bg-green-100 rounded-full flex items-center justify-center">
                              <Check className="w-4 h-4 text-green-600" />
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Detected info */}
                      {!isEditing && !isImported && (
                        <div className="bg-muted/50 rounded-xl p-3 space-y-1.5">
                          <div className="flex justify-between items-center">
                            <span className="text-xs text-muted-foreground">Valor detectado:</span>
                            <span className="text-sm font-semibold">
                              {email.amount ? formatMoney(email.amount) : <span className="text-yellow-600 text-xs">Não detectado</span>}
                            </span>
                          </div>
                          {email.dueDate && (
                            <div className="flex justify-between items-center">
                              <span className="text-xs text-muted-foreground">Vencimento:</span>
                              <span className="text-xs font-medium">{new Date(email.dueDate).toLocaleDateString("pt-BR")}</span>
                            </div>
                          )}
                          <div className="flex justify-between items-center">
                            <span className="text-xs text-muted-foreground">Tipo:</span>
                            <EntityBadge type={email.entityType} />
                          </div>
                        </div>
                      )}

                      {/* Edit form */}
                      {isEditing && (
                        <div className="space-y-3 bg-muted/30 rounded-xl p-3">
                          <div className="space-y-1">
                            <Label className="text-xs">Descrição</Label>
                            <Input
                              value={edit?.description || ""}
                              onChange={e => setEditValues(prev => ({ ...prev, [email.id]: { ...prev[email.id], description: e.target.value } }))}
                              className="rounded-lg h-9 text-sm"
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                              <Label className="text-xs">Valor (R$)</Label>
                              <Input
                                placeholder="0,00"
                                value={edit?.amount || ""}
                                onChange={e => setEditValues(prev => ({ ...prev, [email.id]: { ...prev[email.id], amount: e.target.value } }))}
                                className="rounded-lg h-9 text-sm"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Vencimento</Label>
                              <Input
                                type="date"
                                value={edit?.dueDate || ""}
                                onChange={e => setEditValues(prev => ({ ...prev, [email.id]: { ...prev[email.id], dueDate: e.target.value } }))}
                                className="rounded-lg h-9 text-sm"
                              />
                            </div>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">PJ ou PF?</Label>
                            <div className="flex gap-2">
                              {(["PJ", "PF"] as const).map(et => (
                                <button
                                  key={et}
                                  type="button"
                                  onClick={() => setEditValues(prev => ({ ...prev, [email.id]: { ...prev[email.id], entityType: et } }))}
                                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border-2 text-xs font-semibold transition-all ${
                                    (edit?.entityType || email.entityType) === et
                                      ? et === "PJ" ? "border-blue-500 bg-blue-50 text-blue-700" : "border-purple-500 bg-purple-50 text-purple-700"
                                      : "border-border text-muted-foreground"
                                  }`}
                                >
                                  {et === "PJ" ? <Building2 className="w-3.5 h-3.5" /> : <User className="w-3.5 h-3.5" />}
                                  {et}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Actions */}
                      {!isImported && (
                        <div className="flex gap-2">
                          {!isEditing ? (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                className="flex-1 rounded-xl text-xs"
                                onClick={() => startEdit(email)}
                              >
                                Editar
                              </Button>
                              <Button
                                size="sm"
                                className="flex-1 rounded-xl text-xs"
                                onClick={() => handleImport(email)}
                                disabled={importEmail.isPending}
                              >
                                {importEmail.isPending ? "Importando..." : "Importar"}
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                className="flex-1 rounded-xl text-xs"
                                onClick={() => setEditingId(null)}
                              >
                                Cancelar
                              </Button>
                              <Button
                                size="sm"
                                className="flex-1 rounded-xl text-xs"
                                onClick={() => handleImport(email)}
                                disabled={importEmail.isPending}
                              >
                                Confirmar
                              </Button>
                            </>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
