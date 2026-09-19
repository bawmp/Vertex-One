/**
 * Halos colorés qui dérivent lentement derrière la page (animation déjà
 * définie dans globals.css, désactivée pour qui a demandé de réduire les
 * animations). Purement décoratif.
 */
export function FondAnime() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden bg-gradient-to-b from-primary/[0.07] via-white to-white">
      <div className="animate-flotter-lentement absolute -left-24 -top-24 size-[28rem] rounded-full bg-primary/25 blur-3xl" />
      <div className="animate-flotter-lentement-inverse absolute -right-20 top-10 size-[24rem] rounded-full bg-amber-300/40 blur-3xl" />
      <div className="animate-flotter-lentement absolute left-1/3 top-[26rem] size-[22rem] rounded-full bg-sky-300/30 blur-3xl" />
      <div className="animate-flotter-lentement-inverse absolute -right-10 top-[44rem] size-[20rem] rounded-full bg-rose-300/25 blur-3xl" />
    </div>
  );
}
