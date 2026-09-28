import { cn } from "cn"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="skeleton" className={cn("vx-squelette rounded-md", className)} {...props} />
}

export { Skeleton }
