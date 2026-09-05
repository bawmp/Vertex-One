import { Triangle } from "lucide-react";
import { cn } from "@/lib/utils";

export function Wordmark({ className, sombre = false }: { className?: string; sombre?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-semibold tracking-tight", className)}>
      <Triangle
        className={cn("size-5 fill-primary stroke-none", sombre && "fill-white")}
        aria-hidden
      />
      <span className={sombre ? "text-white" : "text-foreground"}>
        Vertex <span className={sombre ? "text-emerald-200" : "text-primary"}>One</span>
      </span>
    </span>
  );
}
