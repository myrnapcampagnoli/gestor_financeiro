import { cn } from "@/lib/utils";

type Status = "paid" | "pending" | "overdue" | "legal" | "scheduled";
type EntityType = "PJ" | "PF";

const statusConfig: Record<Status, { label: string; className: string }> = {
  paid:      { label: "Pago",       className: "bg-green-100 text-green-800 border border-green-200" },
  pending:   { label: "Pendente",   className: "bg-yellow-100 text-yellow-800 border border-yellow-200" },
  overdue:   { label: "Atrasado",   className: "bg-red-100 text-red-800 border border-red-200" },
  legal:     { label: "Jurídico",   className: "bg-gray-100 text-gray-600 border border-gray-200" },
  scheduled: { label: "Programado", className: "bg-blue-100 text-blue-800 border border-blue-200" },
};

const entityConfig: Record<EntityType, { className: string }> = {
  PJ: { className: "bg-blue-100 text-blue-800 border border-blue-200" },
  PF: { className: "bg-purple-100 text-purple-800 border border-purple-200" },
};

export function StatusBadge({ status, className }: { status: Status; className?: string }) {
  const config = statusConfig[status] || statusConfig.pending;
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium", config.className, className)}>
      {config.label}
    </span>
  );
}

export function EntityBadge({ type, className }: { type: EntityType; className?: string }) {
  const config = entityConfig[type];
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold", config.className, className)}>
      {type}
    </span>
  );
}

export function PaymentMethodBadge({ method }: { method: string }) {
  const labels: Record<string, string> = {
    credit: "Crédito", debit: "Débito", pix: "PIX", cash: "Dinheiro", boleto: "Boleto", other: "Outro"
  };
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-600">
      {labels[method] || method}
    </span>
  );
}
