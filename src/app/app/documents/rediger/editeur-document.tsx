"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TextAlign from "@tiptap/extension-text-align";
import { Table, TableRow, TableCell, TableHeader } from "@tiptap/extension-table";
import Image from "@tiptap/extension-image";
import { Node } from "@tiptap/core";
import {
  AlignCenter, AlignJustify, AlignLeft, AlignRight, Bold, FileDown, FileText, ImagePlus, Italic, List, ListOrdered, Minus, Quote, Redo2, Save, Scissors,
  Strikethrough, Table2, Underline as IconeSouligne, Undo2, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { enregistrerDansDocuments, enregistrerDocumentRedige } from "@/lib/actions/redaction";
import type { ContenuRedaction } from "@/lib/redaction/contenu";
import { libellePage, type MiseEnPage } from "@/lib/redaction/mise-en-page";

const CHEMIN = "/app/documents/rediger";
const IMAGE_MAX_OCTETS = 1_000_000;

/** Saut de page : un bloc sans contenu, exporté comme saut de page réel en PDF et en Word. */
const SautDePage = Node.create({
  name: "pageBreak",
  group: "block",
  atom: true,
  selectable: true,
  parseHTML: () => [{ tag: "div[data-saut-de-page]" }],
  renderHTML: () => ["div", { "data-saut-de-page": "", class: "saut-de-page" }, ["span", {}, "Saut de page"]],
});

/** Image avec une largeur réglable (en % de la largeur de la page). */
const ImageLargeur = Image.extend({
  addAttributes() {
    return { ...this.parent?.(), largeur: { default: 60 } };
  },
});

type Identite = { nom: string; groupeNom: string | null; adresse: string | null; ville: string | null; niu: string | null; rccm: string | null; couleur: string; aLogo: boolean };

/** Redimensionne et réencode une image choisie (PNG ou JPEG, 1 Mo maximum, 1400 px de large maximum) — jamais d'envoi brut. */
async function preparerImage(fichier: File): Promise<string> {
  if (!/^image\/(png|jpeg|webp|gif)$/.test(fichier.type)) throw new Error("Format d'image non pris en charge (PNG, JPEG, WebP ou GIF).");
  const bitmap = await createImageBitmap(fichier);
  const ratio = Math.min(1, 1400 / bitmap.width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
  canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Image illisible.");
  if (fichier.type !== "image/png") {
    ctx.fillStyle = "#ffffff"; // un JPEG n'a pas de transparence : fond blanc
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const sortie = fichier.type === "image/png" ? "image/png" : "image/jpeg";
  for (const qualite of [0.9, 0.75, 0.6, 0.45]) {
    const url = canvas.toDataURL(sortie, qualite);
    if (Math.floor(((url.length - url.indexOf(",") - 1) * 3) / 4) <= IMAGE_MAX_OCTETS) return url;
    if (sortie === "image/png") break; // la qualité n'agit pas sur un PNG
  }
  // PNG trop lourd : repli en JPEG (fond blanc)
  for (const qualite of [0.8, 0.6, 0.45]) {
    const url = canvas.toDataURL("image/jpeg", qualite);
    if (Math.floor(((url.length - url.indexOf(",") - 1) * 3) / 4) <= IMAGE_MAX_OCTETS) return url;
  }
  throw new Error("Image trop lourde (1 Mo maximum après compression).");
}

function Bouton({ titre, actif, onClick, disabled, children }: { titre: string; actif?: boolean; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={titre}
      aria-label={titre}
      aria-pressed={actif}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex size-8 items-center justify-center rounded-md text-sm transition-colors hover:bg-muted disabled:opacity-40 ${actif ? "bg-primary/10 text-primary" : "text-foreground"}`}
    >
      {children}
    </button>
  );
}

export function EditeurDocument({
  id,
  titreInitial,
  contenuInitial,
  miseEnPageInitiale,
  identite,
  peutModifier,
  peutCreer,
}: {
  id: string;
  titreInitial: string;
  contenuInitial: ContenuRedaction;
  miseEnPageInitiale: MiseEnPage;
  identite: Identite;
  peutModifier: boolean;
  peutCreer: boolean;
}) {
  const [titre, setTitre] = useState(titreInitial);
  const [miseEnPage, setMiseEnPage] = useState<MiseEnPage>(miseEnPageInitiale);
  const [etat, setEtat] = useState<"enregistre" | "modifie" | "enregistrement" | "erreur">("enregistre");
  const [message, setMessage] = useState<string | null>(null);
  const [apercu, setApercu] = useState<string | null>(null);
  const [occupe, setOccupe] = useState<string | null>(null);
  const refFichier = useRef<HTMLInputElement>(null);
  const minuterie = useRef<ReturnType<typeof setTimeout> | null>(null);
  const derniereVersion = useRef(0);

  const editeur = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] }, link: false, code: false, codeBlock: false }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      ImageLargeur.configure({ allowBase64: true }),
      SautDePage,
    ],
    content: contenuInitial,
    editable: peutModifier,
    immediatelyRender: false, // rendu côté serveur désactivé : l'éditeur n'existe que dans le navigateur
    shouldRerenderOnTransaction: true, // la barre d'outils suit la sélection (gras actif, titre courant...)
    editorProps: { attributes: { class: "editeur-contenu", "aria-label": "Contenu du document" } },
    onUpdate: () => {
      derniereVersion.current += 1;
      setEtat("modifie");
    },
  });

  const enregistrer = useCallback(async (): Promise<boolean> => {
    if (!editeur || !peutModifier) return true;
    const version = derniereVersion.current;
    setEtat("enregistrement");
    const r = await enregistrerDocumentRedige(id, { titre, contenu: editeur.getJSON(), miseEnPage });
    if ("erreur" in r) {
      setEtat("erreur");
      setMessage(r.erreur);
      return false;
    }
    setMessage(null);
    setEtat(version === derniereVersion.current ? "enregistre" : "modifie"); // modifié pendant l'enregistrement : à refaire
    return true;
  }, [editeur, id, titre, miseEnPage, peutModifier]);

  // Enregistrement automatique 1,5 s après la dernière modification.
  useEffect(() => {
    if (etat !== "modifie") return;
    if (minuterie.current) clearTimeout(minuterie.current);
    minuterie.current = setTimeout(() => void enregistrer(), 1500);
    return () => {
      if (minuterie.current) clearTimeout(minuterie.current);
    };
  }, [etat, enregistrer, titre, miseEnPage]);

  // Une modification du titre ou de la mise en page déclenche aussi l'enregistrement.
  const majMiseEnPage = <K extends keyof MiseEnPage>(cle: K, valeur: MiseEnPage[K]) => {
    setMiseEnPage((m) => ({ ...m, [cle]: valeur }));
    derniereVersion.current += 1;
    setEtat("modifie");
  };

  useEffect(() => {
    const avant = (e: BeforeUnloadEvent) => {
      if (etat === "modifie" || etat === "enregistrement") e.preventDefault();
    };
    window.addEventListener("beforeunload", avant);
    return () => window.removeEventListener("beforeunload", avant);
  }, [etat]);

  async function telecharger(format: "pdf" | "docx") {
    setOccupe(format);
    if (await enregistrer()) {
      const a = document.createElement("a");
      a.href = `${CHEMIN}/${id}/export?format=${format}`;
      a.click();
    }
    setOccupe(null);
  }

  async function ouvrirApercu() {
    setOccupe("apercu");
    if (await enregistrer()) setApercu(`${CHEMIN}/${id}/export?format=pdf&apercu=1&t=${Date.now()}`);
    setOccupe(null);
  }

  async function versDocuments(format: "pdf" | "docx") {
    setOccupe(`docs-${format}`);
    if (await enregistrer()) {
      const r = await enregistrerDansDocuments(id, format);
      setMessage("erreur" in r && r.erreur ? r.erreur : `« ${r.nom} » a été ajouté à vos documents.`);
    }
    setOccupe(null);
  }

  async function choisirImage(fichier: File | undefined) {
    if (!fichier || !editeur) return;
    try {
      const src = await preparerImage(fichier);
      editeur.chain().focus().setImage({ src, alt: fichier.name.slice(0, 120) }).run();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Image impossible à insérer.");
    }
    if (refFichier.current) refFichier.current.value = "";
  }

  if (!editeur) return <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground"><Spinner /> Chargement de l&apos;éditeur…</div>;

  const dansTableau = editeur.isActive("table");
  const niveau = editeur.isActive("heading", { level: 1 }) ? "1" : editeur.isActive("heading", { level: 2 }) ? "2" : editeur.isActive("heading", { level: 3 }) ? "3" : "0";
  const libelleEtat = etat === "enregistrement" ? "Enregistrement…" : etat === "modifie" ? "Modifications non enregistrées" : etat === "erreur" ? "Échec de l'enregistrement" : "Enregistré";
  const coordonnees = [identite.adresse, identite.ville].filter(Boolean).join(", ");
  const dateJour = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(new Date());
  const avecEntete = miseEnPage.enteteEntreprise || !!miseEnPage.enteteGauche || !!miseEnPage.enteteDroite || !!miseEnPage.reference || miseEnPage.afficherDate;
  const avecPied = miseEnPage.numerotation !== "AUCUNE" || !!miseEnPage.piedGauche || !!miseEnPage.piedCentre || !!miseEnPage.piedDroite;
  const cellulePied = (pos: "GAUCHE" | "CENTRE" | "DROITE", texte: string) => {
    const page = miseEnPage.numerotation !== "AUCUNE" && miseEnPage.numerotationPosition === pos ? libellePage(miseEnPage.numerotation, 1, 1) : "";
    return [texte, page].filter(Boolean).join(" · ");
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-64 flex-1 flex-col gap-1">
          <Label htmlFor="titre-document">Titre du document</Label>
          <Input
            id="titre-document"
            value={titre}
            maxLength={150}
            disabled={!peutModifier}
            onChange={(e) => {
              setTitre(e.target.value);
              derniereVersion.current += 1;
              setEtat("modifie");
            }}
          />
        </div>
        <span role="status" className={`pb-2 text-xs ${etat === "erreur" ? "text-destructive" : "text-muted-foreground"}`}>
          {libelleEtat}
        </span>
        <div className="flex flex-wrap gap-2">
          {peutModifier ? (
            <Button type="button" variant="outline" disabled={!!occupe || etat === "enregistrement"} onClick={() => void enregistrer()}>
              <Save data-icon="inline-start" aria-hidden /> Enregistrer
            </Button>
          ) : null}
          <Button type="button" variant="outline" disabled={!!occupe} onClick={() => void ouvrirApercu()}>
            {occupe === "apercu" ? <Spinner /> : <FileText data-icon="inline-start" aria-hidden />} Aperçu PDF
          </Button>
          <Button type="button" disabled={!!occupe} onClick={() => void telecharger("pdf")}>
            {occupe === "pdf" ? <Spinner /> : <FileDown data-icon="inline-start" aria-hidden />} PDF
          </Button>
          <Button type="button" disabled={!!occupe} onClick={() => void telecharger("docx")}>
            {occupe === "docx" ? <Spinner /> : <FileDown data-icon="inline-start" aria-hidden />} Word
          </Button>
          {peutCreer ? (
            <>
              <Button type="button" variant="secondary" disabled={!!occupe} onClick={() => void versDocuments("pdf")}>
                {occupe === "docs-pdf" ? <Spinner /> : null} Ajouter aux Documents (PDF)
              </Button>
              <Button type="button" variant="secondary" disabled={!!occupe} onClick={() => void versDocuments("docx")}>
                {occupe === "docs-docx" ? <Spinner /> : null} (Word)
              </Button>
            </>
          ) : null}
        </div>
      </div>
      {message ? (
        <p role="status" className="rounded-md border border-border bg-muted/50 px-3 py-2 text-sm">
          {message}
        </p>
      ) : null}

      {peutModifier ? (
        <div className="sticky top-0 z-10 flex flex-wrap items-center gap-0.5 rounded-lg border border-border bg-background/95 p-1.5 shadow-sm backdrop-blur" role="toolbar" aria-label="Mise en forme">
          <Bouton titre="Annuler" onClick={() => editeur.chain().focus().undo().run()} disabled={!editeur.can().undo()}><Undo2 className="size-4" /></Bouton>
          <Bouton titre="Rétablir" onClick={() => editeur.chain().focus().redo().run()} disabled={!editeur.can().redo()}><Redo2 className="size-4" /></Bouton>
          <span className="mx-1 h-5 w-px bg-border" />
          <Select
            aria-label="Style de paragraphe"
            value={niveau}
            className="h-8 w-36"
            onChange={(e) => {
              const v = e.target.value;
              if (v === "0") editeur.chain().focus().setParagraph().run();
              else editeur.chain().focus().toggleHeading({ level: Number(v) as 1 | 2 | 3 }).run();
            }}
          >
            <option value="0">Paragraphe</option>
            <option value="1">Titre 1</option>
            <option value="2">Titre 2</option>
            <option value="3">Titre 3</option>
          </Select>
          <span className="mx-1 h-5 w-px bg-border" />
          <Bouton titre="Gras" actif={editeur.isActive("bold")} onClick={() => editeur.chain().focus().toggleBold().run()}><Bold className="size-4" /></Bouton>
          <Bouton titre="Italique" actif={editeur.isActive("italic")} onClick={() => editeur.chain().focus().toggleItalic().run()}><Italic className="size-4" /></Bouton>
          <Bouton titre="Souligné" actif={editeur.isActive("underline")} onClick={() => editeur.chain().focus().toggleUnderline().run()}><IconeSouligne className="size-4" /></Bouton>
          <Bouton titre="Barré" actif={editeur.isActive("strike")} onClick={() => editeur.chain().focus().toggleStrike().run()}><Strikethrough className="size-4" /></Bouton>
          <span className="mx-1 h-5 w-px bg-border" />
          <Bouton titre="Aligner à gauche" actif={editeur.isActive({ textAlign: "left" })} onClick={() => editeur.chain().focus().setTextAlign("left").run()}><AlignLeft className="size-4" /></Bouton>
          <Bouton titre="Centrer" actif={editeur.isActive({ textAlign: "center" })} onClick={() => editeur.chain().focus().setTextAlign("center").run()}><AlignCenter className="size-4" /></Bouton>
          <Bouton titre="Aligner à droite" actif={editeur.isActive({ textAlign: "right" })} onClick={() => editeur.chain().focus().setTextAlign("right").run()}><AlignRight className="size-4" /></Bouton>
          <Bouton titre="Justifier" actif={editeur.isActive({ textAlign: "justify" })} onClick={() => editeur.chain().focus().setTextAlign("justify").run()}><AlignJustify className="size-4" /></Bouton>
          <span className="mx-1 h-5 w-px bg-border" />
          <Bouton titre="Liste à puces" actif={editeur.isActive("bulletList")} onClick={() => editeur.chain().focus().toggleBulletList().run()}><List className="size-4" /></Bouton>
          <Bouton titre="Liste numérotée" actif={editeur.isActive("orderedList")} onClick={() => editeur.chain().focus().toggleOrderedList().run()}><ListOrdered className="size-4" /></Bouton>
          <Bouton titre="Citation" actif={editeur.isActive("blockquote")} onClick={() => editeur.chain().focus().toggleBlockquote().run()}><Quote className="size-4" /></Bouton>
          <Bouton titre="Ligne de séparation" onClick={() => editeur.chain().focus().setHorizontalRule().run()}><Minus className="size-4" /></Bouton>
          <span className="mx-1 h-5 w-px bg-border" />
          <Bouton titre="Insérer un tableau (3 × 3)" onClick={() => editeur.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}><Table2 className="size-4" /></Bouton>
          <Bouton titre="Insérer une image" onClick={() => refFichier.current?.click()}><ImagePlus className="size-4" /></Bouton>
          <Bouton titre="Saut de page" onClick={() => editeur.chain().focus().insertContent({ type: "pageBreak" }).run()}><Scissors className="size-4" /></Bouton>
          {dansTableau ? (
            <>
              <span className="mx-1 h-5 w-px bg-border" />
              <Button type="button" variant="ghost" size="xs" onClick={() => editeur.chain().focus().addRowAfter().run()}>+ ligne</Button>
              <Button type="button" variant="ghost" size="xs" onClick={() => editeur.chain().focus().addColumnAfter().run()}>+ colonne</Button>
              <Button type="button" variant="ghost" size="xs" onClick={() => editeur.chain().focus().deleteRow().run()}>− ligne</Button>
              <Button type="button" variant="ghost" size="xs" onClick={() => editeur.chain().focus().deleteColumn().run()}>− colonne</Button>
              <Button type="button" variant="ghost" size="xs" onClick={() => editeur.chain().focus().mergeOrSplit().run()}>Fusionner</Button>
              <Button type="button" variant="ghost" size="xs" onClick={() => editeur.chain().focus().deleteTable().run()}>Supprimer le tableau</Button>
            </>
          ) : null}
          {editeur.isActive("image") ? (
            <>
              <span className="mx-1 h-5 w-px bg-border" />
              <Label htmlFor="largeur-image" className="px-1 text-xs">Largeur</Label>
              <Select
                id="largeur-image"
                className="h-8 w-24"
                value={String(editeur.getAttributes("image").largeur ?? 60)}
                onChange={(e) => editeur.chain().focus().updateAttributes("image", { largeur: Number(e.target.value) }).run()}
              >
                {[20, 30, 40, 60, 80, 100].map((p) => (
                  <option key={p} value={p}>{p} %</option>
                ))}
              </Select>
            </>
          ) : null}
          <input ref={refFichier} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={(e) => void choisirImage(e.target.files?.[0])} />
        </div>
      ) : null}

      <div className="grid items-start gap-4 xl:grid-cols-[1fr_20rem]">
        {/* La « feuille » : en-tête et pied de page simulés autour du contenu ; l'aperçu PDF donne la mise en page exacte. */}
        <div className="mx-auto w-full max-w-[794px] overflow-hidden rounded-md border border-border bg-white text-black shadow-md">
          {avecEntete ? (
            <div className="flex items-start justify-between gap-4 border-b-2 px-10 pt-8 pb-3" style={{ borderColor: identite.couleur }}>
              <div className="min-w-0">
                {miseEnPage.enteteEntreprise ? (
                  <>
                    <p className="text-base font-bold" style={{ color: identite.couleur }}>{identite.nom}</p>
                    {identite.groupeNom ? <p className="text-[11px]" style={{ color: identite.couleur }}>Une entreprise du groupe {identite.groupeNom}</p> : null}
                    {coordonnees ? <p className="text-[11px] text-stone-500">{coordonnees}</p> : null}
                    {identite.niu || identite.rccm ? <p className="text-[11px] text-stone-500">{[identite.niu ? `NIU ${identite.niu}` : null, identite.rccm ? `RCCM ${identite.rccm}` : null].filter(Boolean).join(" · ")}</p> : null}
                    {identite.aLogo ? <p className="text-[10px] text-stone-400">(le logo apparaît dans le PDF et le Word)</p> : null}
                  </>
                ) : null}
                {miseEnPage.enteteGauche ? <p className="text-xs">{miseEnPage.enteteGauche}</p> : null}
              </div>
              <div className="text-right text-[11px] text-stone-500">
                {miseEnPage.reference ? <p className="font-bold text-black">{miseEnPage.reference}</p> : null}
                {miseEnPage.afficherDate ? <p>{dateJour}</p> : null}
                {miseEnPage.enteteDroite ? <p>{miseEnPage.enteteDroite}</p> : null}
              </div>
            </div>
          ) : null}
          <div className="min-h-[560px] px-10 py-6">
            <EditorContent editor={editeur} />
          </div>
          {avecPied ? (
            <div className="grid grid-cols-3 gap-2 border-t-2 px-10 py-3 text-[11px] text-stone-500" style={{ borderColor: identite.couleur }}>
              <p>{cellulePied("GAUCHE", miseEnPage.piedGauche)}</p>
              <p className="text-center">{cellulePied("CENTRE", miseEnPage.piedCentre)}</p>
              <p className="text-right">{cellulePied("DROITE", miseEnPage.piedDroite)}</p>
            </div>
          ) : null}
        </div>

        <aside className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 text-sm" aria-label="Mise en page">
          <h2 className="font-semibold">En-tête et pied de page</h2>
          <label className="flex items-center gap-2">
            <input type="checkbox" disabled={!peutModifier} checked={miseEnPage.enteteEntreprise} onChange={(e) => majMiseEnPage("enteteEntreprise", e.target.checked)} />
            Identité de l&apos;entreprise (logo, nom, coordonnées)
          </label>
          <div className="flex flex-col gap-1">
            <Label htmlFor="pages-entete">En-tête sur</Label>
            <Select id="pages-entete" disabled={!peutModifier} value={miseEnPage.pagesEntete} onChange={(e) => majMiseEnPage("pagesEntete", e.target.value as MiseEnPage["pagesEntete"])}>
              <option value="TOUTES">Toutes les pages</option>
              <option value="PREMIERE">La première page seulement</option>
              <option value="SUIVANTES">Les pages suivantes (compact, sans logo)</option>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="reference">Référence du document</Label>
            <Input id="reference" disabled={!peutModifier} maxLength={60} value={miseEnPage.reference} placeholder="ex. CT-2026-014" onChange={(e) => majMiseEnPage("reference", e.target.value)} />
          </div>
          <label className="flex items-center gap-2">
            <input type="checkbox" disabled={!peutModifier} checked={miseEnPage.afficherDate} onChange={(e) => majMiseEnPage("afficherDate", e.target.checked)} />
            Afficher la date du jour
          </label>
          <div className="flex flex-col gap-1">
            <Label htmlFor="entete-gauche">Texte d&apos;en-tête (gauche)</Label>
            <Input id="entete-gauche" disabled={!peutModifier} maxLength={120} value={miseEnPage.enteteGauche} onChange={(e) => majMiseEnPage("enteteGauche", e.target.value)} />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="entete-droite">Texte d&apos;en-tête (droite)</Label>
            <Input id="entete-droite" disabled={!peutModifier} maxLength={120} value={miseEnPage.enteteDroite} placeholder="ex. Confidentiel" onChange={(e) => majMiseEnPage("enteteDroite", e.target.value)} />
          </div>
          <hr className="border-border" />
          <div className="flex flex-col gap-1">
            <Label htmlFor="numerotation">Numérotation des pages</Label>
            <Select id="numerotation" disabled={!peutModifier} value={miseEnPage.numerotation} onChange={(e) => majMiseEnPage("numerotation", e.target.value as MiseEnPage["numerotation"])}>
              <option value="PAGE_SUR_TOTAL">Page 2 / 5</option>
              <option value="PAGE">Page 2</option>
              <option value="AUCUNE">Aucune</option>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="numerotation-position">Position du numéro</Label>
            <Select id="numerotation-position" disabled={!peutModifier} value={miseEnPage.numerotationPosition} onChange={(e) => majMiseEnPage("numerotationPosition", e.target.value as MiseEnPage["numerotationPosition"])}>
              <option value="GAUCHE">Pied de page, à gauche</option>
              <option value="CENTRE">Pied de page, au centre</option>
              <option value="DROITE">Pied de page, à droite</option>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="pied-gauche">Pied de page (gauche)</Label>
            <Input id="pied-gauche" disabled={!peutModifier} maxLength={200} value={miseEnPage.piedGauche} onChange={(e) => majMiseEnPage("piedGauche", e.target.value)} />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="pied-centre">Pied de page (centre)</Label>
            <Input id="pied-centre" disabled={!peutModifier} maxLength={200} value={miseEnPage.piedCentre} onChange={(e) => majMiseEnPage("piedCentre", e.target.value)} />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="pied-droite">Pied de page (droite)</Label>
            <Input id="pied-droite" disabled={!peutModifier} maxLength={200} value={miseEnPage.piedDroite} onChange={(e) => majMiseEnPage("piedDroite", e.target.value)} />
          </div>
          <hr className="border-border" />
          <div className="flex flex-col gap-1">
            <Label htmlFor="marges">Marges</Label>
            <Select id="marges" disabled={!peutModifier} value={miseEnPage.marges} onChange={(e) => majMiseEnPage("marges", e.target.value as MiseEnPage["marges"])}>
              <option value="ETROITES">Étroites (15 mm)</option>
              <option value="NORMALES">Normales (20 mm)</option>
              <option value="LARGES">Larges (28 mm)</option>
            </Select>
          </div>
          <p className="text-xs text-muted-foreground">Le logo, la couleur et les coordonnées viennent des paramètres de l&apos;entreprise. La feuille ci-contre est une approximation : « Aperçu PDF » montre le rendu exact.</p>
        </aside>
      </div>

      {apercu ? (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/60 p-4" role="dialog" aria-modal="true" aria-label="Aperçu PDF">
          <div className="mb-2 flex justify-end">
            <Button type="button" variant="secondary" onClick={() => setApercu(null)}>
              <X data-icon="inline-start" aria-hidden /> Fermer l&apos;aperçu
            </Button>
          </div>
          <iframe src={apercu} title="Aperçu du PDF" className="min-h-0 flex-1 rounded-md bg-white" />
        </div>
      ) : null}
    </div>
  );
}
