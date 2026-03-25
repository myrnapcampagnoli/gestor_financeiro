import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, Bell, BellOff, Check, CheckCheck, Clock, Download, Info } from "lucide-react";
import { toast } from "sonner";

const notifConfig: Record<string, { icon: React.ReactNode; color: string }> = {
  due_soon:  { icon: <Clock className="w-4 h-4" />, color: "bg-yellow-100 text-yellow-700" },
  overdue:   { icon: <AlertTriangle className="w-4 h-4" />, color: "bg-red-100 text-red-700" },
  imported:  { icon: <Download className="w-4 h-4" />, color: "bg-blue-100 text-blue-700" },
  info:      { icon: <Info className="w-4 h-4" />, color: "bg-gray-100 text-gray-600" },
};

export default function Notificacoes() {
  const { data: notifications, isLoading, refetch } = trpc.notifications.list.useQuery();

  const markRead = trpc.notifications.markRead.useMutation({
    onSuccess: () => refetch(),
  });

  const markAllRead = trpc.notifications.markAllRead.useMutation({
    onSuccess: () => { toast.success("Todas marcadas como lidas"); refetch(); },
  });

  const unread = (notifications || []).filter(n => !n.isRead);

  return (
    <div className="p-4 space-y-4 max-w-2xl mx-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-bold">Notificações</h1>
          {unread.length > 0 && (
            <span className="w-6 h-6 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-bold">
              {unread.length}
            </span>
          )}
        </div>
        {unread.length > 0 && (
          <Button variant="outline" size="sm" className="rounded-xl gap-1.5 text-xs" onClick={() => markAllRead.mutate()}>
            <CheckCheck className="w-3.5 h-3.5" />
            Marcar todas
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
        </div>
      ) : (notifications || []).length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center space-y-3">
            <BellOff className="w-10 h-10 text-muted-foreground mx-auto" />
            <p className="text-muted-foreground">Nenhuma notificação</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {(notifications || []).map(notif => {
            const config = notifConfig[notif.type] || notifConfig.info;
            return (
              <Card key={notif.id} className={!notif.isRead ? "border-blue-100 bg-blue-50/30" : ""}>
                <CardContent className="p-3">
                  <div className="flex items-start gap-3">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${config.color}`}>
                      {config.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold">{notif.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{notif.message}</p>
                      <p className="text-[11px] text-muted-foreground mt-1">
                        {new Date(notif.createdAt).toLocaleDateString("pt-BR", {
                          day: "numeric", month: "short", hour: "2-digit", minute: "2-digit"
                        })}
                      </p>
                    </div>
                    {!notif.isRead && (
                      <button
                        onClick={() => markRead.mutate({ id: notif.id })}
                        className="p-1.5 rounded-lg bg-blue-100 hover:bg-blue-200 transition-colors shrink-0"
                        title="Marcar como lida"
                      >
                        <Check className="w-3.5 h-3.5 text-blue-700" />
                      </button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
