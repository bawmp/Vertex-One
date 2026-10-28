// Avatar aux initiales, teinté dans la charte (bleu marine et orange) selon le nom : toujours la même couleur pour la même
// personne. Sans état ni hook : utilisable côté serveur comme côté navigateur.
const TEINTES = [
  "bg-marque-bleu-100 text-marque-bleu-700 dark:bg-marque-bleu-800/60 dark:text-marque-bleu-100",
  "bg-marque-orange-100 text-marque-orange-700 dark:bg-marque-orange-900/50 dark:text-marque-orange-200",
  "bg-marque-bleu-600 text-white",
  "bg-marque-orange-500 text-white",
  "bg-marque-bleu-200 text-marque-bleu-800 dark:bg-marque-bleu-700/60 dark:text-marque-bleu-50",
  "bg-muted text-foreground",
];

const TAILLES = {
  sm: "size-7 text-[11px]",
  md: "size-9 text-xs",
  lg: "size-11 text-sm",
} as const;

const POINTS = { sm: "size-2", md: "size-2.5", lg: "size-3" } as const;

export function initiales(nom: string): string {
  const mots = nom.trim().split(/\s+/).filter(Boolean);
  if (mots.length === 0) return "?";
  const premiere = Array.from(mots[0])[0] ?? "?";
  const derniere = mots.length > 1 ? (Array.from(mots[mots.length - 1])[0] ?? "") : "";
  return (premiere + derniere).toUpperCase();
}

function teinte(nom: string): string {
  let somme = 0;
  for (const caractere of nom) somme = (somme * 31 + caractere.charCodeAt(0)) >>> 0;
  return TEINTES[somme % TEINTES.length];
}

/**
 * `enLigne` : `undefined` = pas de pastille de présence ; sinon un point vert (avec une onde discrète) ou gris.
 * `libellePresence` : texte accessible du point, déjà traduit par l'appelant.
 */
export function AvatarPersonne({ nom, taille = "md", enLigne, libellePresence, className = "" }: { nom: string; taille?: keyof typeof TAILLES; enLigne?: boolean; libellePresence?: string; className?: string }) {
  return (
    <span className={`relative inline-flex shrink-0 ${className}`}>
      <span aria-hidden className={`flex items-center justify-center rounded-full font-semibold select-none ${TAILLES[taille]} ${teinte(nom)}`}>
        {initiales(nom)}
      </span>
      {enLigne === undefined ? null : (
        <span className={`absolute -right-0.5 -bottom-0.5 flex ${POINTS[taille]}`} role="img" aria-label={libellePresence}>
          {enLigne ? <span aria-hidden className="animate-chat-onde absolute inset-0 rounded-full bg-emerald-500" /> : null}
          <span aria-hidden className={`relative size-full rounded-full ring-2 ring-card ${enLigne ? "bg-emerald-500" : "bg-muted-foreground/40"}`} />
        </span>
      )}
    </span>
  );
}
