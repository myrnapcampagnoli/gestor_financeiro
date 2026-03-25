import { cn } from "@/lib/utils";

interface MoneyDisplayProps {
  amount: number;
  type?: "income" | "expense" | "neutral";
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
  showSign?: boolean;
}

const sizeClasses = {
  sm: "text-sm font-medium",
  md: "text-base font-semibold",
  lg: "text-xl font-bold",
  xl: "text-3xl font-bold",
};

export function MoneyDisplay({ amount, type = "neutral", size = "md", className, showSign = false }: MoneyDisplayProps) {
  const formatted = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  }).format(Math.abs(amount));

  const colorClass =
    type === "income" ? "text-green-700" :
    type === "expense" ? "text-red-700" :
    "text-foreground";

  const sign = showSign ? (type === "income" ? "+" : type === "expense" ? "-" : "") : "";

  return (
    <span className={cn(sizeClasses[size], colorClass, className)}>
      {sign}{formatted}
    </span>
  );
}

export function formatMoney(amount: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  }).format(amount);
}
