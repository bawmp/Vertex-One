// template.tsx (contrairement à layout.tsx) se remonte à chaque navigation
// au sein de /app — c'est ce qui permet une transition d'entrée à chaque
// changement de page sans avoir à l'ajouter dans chaque fichier page.tsx.
export default function TemplateApp({ children }: { children: React.ReactNode }) {
  return <div className="animate-in fade-in slide-in-from-bottom-1 duration-300 ease-out">{children}</div>;
}
