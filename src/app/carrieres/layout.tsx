/** Espace candidats : thème clair forcé (voir `.espace-clair` dans globals.css). */
export default function LayoutCarrieres({ children }: { children: React.ReactNode }) {
  return <div className="espace-clair min-h-screen bg-white text-foreground">{children}</div>;
}
