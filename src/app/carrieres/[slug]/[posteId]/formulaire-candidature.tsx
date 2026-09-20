"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import Script from "next/script";
import { ArrowRight, Check, FileText, Mail, MessageSquare, Phone, Send, UploadCloud, User } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { soumettreCandidature } from "@/lib/actions/recrutement-publique";
import { formaterTaille } from "@/lib/one-form/fichiers";
import { TAILLE_MAX_CV_OCTETS } from "@/lib/recrutement/validation";

const CHAMP =
  "w-full rounded-xl border border-stone-200 bg-white py-3 pl-11 pr-4 text-base text-stone-900 shadow-sm outline-none transition placeholder:text-stone-400 focus:border-primary focus:ring-4 focus:ring-primary/15";

// Positions fixes (jamais aléatoires) : le rendu serveur et navigateur doivent être identiques.
const CONFETTIS = [
  { dx: -140, dy: -120, rot: 240, couleur: "bg-amber-400" },
  { dx: -90, dy: -170, rot: -200, couleur: "bg-rose-400" },
  { dx: -30, dy: -190, rot: 300, couleur: "bg-sky-400" },
  { dx: 40, dy: -180, rot: -260, couleur: "bg-primary" },
  { dx: 100, dy: -150, rot: 220, couleur: "bg-violet-400" },
  { dx: 150, dy: -100, rot: -180, couleur: "bg-amber-300" },
  { dx: -160, dy: -40, rot: 160, couleur: "bg-sky-300" },
  { dx: 165, dy: -30, rot: -140, couleur: "bg-rose-300" },
  { dx: -120, dy: 30, rot: 320, couleur: "bg-primary" },
  { dx: 125, dy: 40, rot: -300, couleur: "bg-amber-400" },
  { dx: -60, dy: 70, rot: 200, couleur: "bg-violet-300" },
  { dx: 70, dy: 80, rot: -220, couleur: "bg-sky-400" },
];

export function FormulaireCandidature({ slug, posteId, titrePoste, nomEntreprise }: { slug: string; posteId: string; titrePoste: string; nomEntreprise: string }) {
  const [enCours, startTransition] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<{ prenom: string; email: boolean } | null>(null);
  const [cv, setCv] = useState<File | null>(null);

  function choisirCv(e: React.ChangeEvent<HTMLInputElement>) {
    setErreur(null);
    const fichier = e.target.files?.[0] ?? null;
    if (fichier && fichier.size > TAILLE_MAX_CV_OCTETS) {
      e.target.value = "";
      setCv(null);
      setErreur(`Ce fichier fait ${formaterTaille(fichier.size)} : le CV ne doit pas dépasser ${formaterTaille(TAILLE_MAX_CV_OCTETS)}.`);
      return;
    }
    setCv(fichier);
  }

  function envoyer(formData: FormData) {
    setErreur(null);
    startTransition(async () => {
      const resultat = await soumettreCandidature(null, formData);
      if (resultat?.succes) {
        setSucces({ prenom: resultat.prenom ?? "", email: !!formData.get("email") });
      } else {
        setErreur(resultat?.erreur ?? "Une erreur est survenue, veuillez réessayer.");
        // Le jeton anti-spam n'est valable qu'une fois : nouveau défi avant tout renvoi.
        (window as unknown as { turnstile?: { reset: () => void } }).turnstile?.reset();
      }
    });
  }

  if (succes) {
    return (
      <div className="relative overflow-hidden rounded-3xl bg-white p-8 text-center shadow-xl shadow-primary/10 ring-1 ring-stone-100">
        <div className="relative mx-auto mb-6 flex size-24 items-center justify-center">
          {CONFETTIS.map((c, i) => (
            <span
              key={i}
              aria-hidden
              className={`carrieres-confetti absolute left-1/2 top-1/2 size-2.5 rounded-sm ${c.couleur}`}
              style={{ "--dx": `${c.dx}px`, "--dy": `${c.dy}px`, "--rot": `${c.rot}deg`, "--delai": `${300 + i * 40}ms` } as React.CSSProperties}
            />
          ))}
          <span className="carrieres-pop flex size-24 items-center justify-center rounded-full bg-gradient-to-br from-primary to-marque-orange text-white shadow-lg shadow-primary/30">
            <svg viewBox="0 0 24 24" className="size-12" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path className="carrieres-coche" d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
          </span>
        </div>
        <h2 className="text-2xl font-bold tracking-tight text-stone-900">Merci{succes.prenom ? ` ${succes.prenom}` : ""} !</h2>
        <p className="mt-2 leading-relaxed text-stone-600">
          Votre candidature pour <span className="font-semibold text-stone-800">{titrePoste}</span> chez {nomEntreprise} a bien été envoyée.
        </p>
        <p className="mt-2 text-sm text-stone-500">
          {succes.email ? "Un email de confirmation vous a été envoyé. " : ""}Nous reviendrons vers vous rapidement.
        </p>
        <Link
          href={`/carrieres/${slug}`}
          className="group mt-6 inline-flex items-center gap-2 rounded-full bg-primary/10 px-5 py-2.5 text-sm font-semibold text-primary transition hover:bg-primary hover:text-primary-foreground"
        >
          Voir les autres offres
          <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" aria-hidden />
        </Link>
      </div>
    );
  }

  return (
    // onSubmit plutôt que action={...} : React 19 vide automatiquement les champs
    // d'un formulaire après une action, même en cas d'erreur — le candidat perdait
    // alors tout ce qu'il avait saisi (et son CV) au moindre message d'erreur.
    <form
      onSubmit={(e) => {
        e.preventDefault();
        envoyer(new FormData(e.currentTarget));
      }}
      className="flex flex-col gap-5 rounded-3xl bg-white p-6 shadow-xl shadow-primary/10 ring-1 ring-stone-100 sm:p-8"
    >
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="posteId" value={posteId} />

      <div>
        <h2 className="text-2xl font-bold tracking-tight text-stone-900">Postulez en 2 minutes</h2>
        <p className="mt-1 text-sm text-stone-500">Quelques informations et votre CV, on s&apos;occupe du reste.</p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="nom" className="text-sm font-medium text-stone-700">
          Nom complet
        </label>
        <div className="relative">
          <User className="pointer-events-none absolute left-3.5 top-1/2 size-4.5 -translate-y-1/2 text-stone-400" aria-hidden />
          <input id="nom" name="nom" required minLength={2} autoComplete="name" placeholder="Votre nom et prénom" className={CHAMP} />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="telephone" className="text-sm font-medium text-stone-700">
          Téléphone
        </label>
        <div className="relative">
          <Phone className="pointer-events-none absolute left-3.5 top-1/2 size-4.5 -translate-y-1/2 text-stone-400" aria-hidden />
          <input id="telephone" name="telephone" type="tel" required minLength={6} autoComplete="tel" placeholder="6 XX XX XX XX" className={CHAMP} />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="text-sm font-medium text-stone-700">
          Email <span className="font-normal text-stone-400">(recommandé, pour recevoir une confirmation)</span>
        </label>
        <div className="relative">
          <Mail className="pointer-events-none absolute left-3.5 top-1/2 size-4.5 -translate-y-1/2 text-stone-400" aria-hidden />
          <input id="email" name="email" type="email" autoComplete="email" placeholder="vous@exemple.com" className={CHAMP} />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="message" className="text-sm font-medium text-stone-700">
          Un mot pour nous <span className="font-normal text-stone-400">(optionnel)</span>
        </label>
        <div className="relative">
          <MessageSquare className="pointer-events-none absolute left-3.5 top-3.5 size-4.5 text-stone-400" aria-hidden />
          <textarea id="message" name="message" rows={3} placeholder="Présentez-vous en quelques lignes" className={`${CHAMP} resize-none`} />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-stone-700">Votre CV</span>
        <label
          htmlFor="cv"
          className="group flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-stone-300 bg-stone-50 px-4 py-6 text-center transition-all duration-300 hover:border-primary hover:bg-primary/5 has-[:focus-visible]:border-primary has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-primary/15"
        >
          <span className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary transition-transform duration-300 group-hover:-translate-y-1 group-hover:scale-110">
            {cv ? <FileText className="size-6" aria-hidden /> : <UploadCloud className="size-6" aria-hidden />}
          </span>
          {cv ? (
            <>
              <span className="max-w-full truncate font-semibold text-stone-800">{cv.name}</span>
              <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600">
                <Check className="size-3.5" aria-hidden />
                {formaterTaille(cv.size)} — cliquez pour changer
              </span>
            </>
          ) : (
            <>
              <span className="font-semibold text-stone-800">Ajoutez votre CV</span>
              <span className="text-xs text-stone-500">PDF ou Word (.docx) · {formaterTaille(TAILLE_MAX_CV_OCTETS)} maximum</span>
            </>
          )}
          <input id="cv" name="cv" type="file" accept=".pdf,.docx" required onChange={choisirCv} className="sr-only" />
        </label>
      </div>

      {process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ? (
        <>
          <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer />
          <div className="cf-turnstile" data-sitekey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY} />
        </>
      ) : null}

      {erreur ? (
        <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700 ring-1 ring-rose-100">
          {erreur}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={enCours}
        className="group inline-flex items-center justify-center gap-2 rounded-full bg-primary px-6 py-3.5 text-base font-semibold text-primary-foreground shadow-lg shadow-primary/30 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-primary/40 disabled:translate-y-0 disabled:opacity-70"
      >
        {enCours ? <Spinner /> : <Send className="size-4.5 transition-transform group-hover:translate-x-0.5" aria-hidden />}
        {enCours ? "Envoi en cours…" : "Envoyer ma candidature"}
      </button>
    </form>
  );
}
