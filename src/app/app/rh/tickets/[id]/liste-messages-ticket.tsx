import { Card } from "@/components/ui/card";

type Message = { id: string; contenu: string; auteurNom: string; creeLe: Date };

export function ListeMessagesTicket({ messages }: { messages: Message[] }) {
  if (messages.length === 0) {
    return <p className="text-sm text-muted-foreground">Aucun message pour le moment.</p>;
  }

  return (
    <Card className="p-0">
      <div className="flex flex-col divide-y divide-border">
        {messages.map((m, index) => (
          <div
            key={m.id}
            style={{ animationDelay: `${Math.min(index, 8) * 30}ms` }}
            className="flex animate-in fade-in slide-in-from-bottom-1 flex-col gap-1 px-4 py-2.5 text-sm duration-300 fill-mode-both"
          >
            <div className="flex items-center justify-between">
              <p className="font-medium">{m.auteurNom}</p>
              <span className="text-xs text-muted-foreground">{new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(m.creeLe)}</span>
            </div>
            <p className="whitespace-pre-line text-muted-foreground">{m.contenu}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}
