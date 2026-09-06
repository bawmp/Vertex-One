import { Skeleton } from "@/components/ui/skeleton";

export default function ChargementFacturation() {
  return (
    <div className="flex flex-col gap-8">
      <Skeleton className="h-8 w-40" />

      {[0, 1].map((section) => (
        <div key={section} className="flex flex-col gap-2">
          <Skeleton className="mb-1 h-4 w-20" />
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-14 w-full rounded-lg" />
          ))}
        </div>
      ))}
    </div>
  );
}
