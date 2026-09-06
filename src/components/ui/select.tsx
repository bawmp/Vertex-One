import * as React from "react"
import { cn } from "cn"

// Wrapper léger sur <select> natif — même rythme visuel (hauteur, radius,
// focus ring) que Input, pour remplacer les className dupliquées ad hoc
// dans chaque formulaire du produit.
function Select({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      data-slot="select"
      className={cn(
        "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 text-sm shadow-xs transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 md:text-sm dark:bg-input/30",
        className
      )}
      {...props}
    />
  )
}

export { Select }
