/* eslint-disable @typescript-eslint/no-require-imports */
/* Outil ponctuel d'internationalisation : enveloppe les textes français visibles dans t(), insère `const t = …` dans chaque
 * composant qui en a besoin et liste ce qui reste à traiter à la main. Usage :
 *   node scripts/i18n-codemod.cjs [--ecrire] fichier1.tsx dossier/ …
 * Sans --ecrire : simulation (rapport seulement). Les clés extraites sont écrites dans scripts/.i18n-cles.json. */
const ts = require("typescript");
const fs = require("fs");
const path = require("path");

const ecrire = process.argv.includes("--ecrire");
const cibles = process.argv.slice(2).filter((a) => !a.startsWith("--"));

function lister(cible) {
  const st = fs.statSync(cible);
  if (st.isFile()) return [cible];
  return fs.readdirSync(cible).flatMap((n) => lister(path.join(cible, n)));
}
const fichiers = cibles.flatMap(lister).filter((f) => /\.tsx?$/.test(f) && !/\.d\.ts$/.test(f));

const ATTRIBUTS_TEXTE = new Set(["placeholder", "title", "aria-label", "alt", "label", "description", "aria-description"]);
const APPELS_TEXTE = new Set(["setErreur", "setErreurLocale", "setMessage", "setInfo", "alert", "confirm", "toast"]);
const PROPRIETES_TEXTE = new Set(["erreur", "message", "libelle", "label", "titre", "description", "placeholder"]);

const decoder = { "&apos;": "'", "&quot;": '"', "&amp;": "&", "&nbsp;": " ", "&rsquo;": "’", "&lsquo;": "‘", "&laquo;": "«", "&raquo;": "»", "&lt;": "<", "&gt;": ">", "&hellip;": "…", "&mdash;": "—", "&ndash;": "–", "&eacute;": "é", "&agrave;": "à", "&egrave;": "è" };
const decoder2 = (s) => s.replace(/&[a-z]+;|&#\d+;/gi, (e) => decoder[e] ?? (e.startsWith("&#") ? String.fromCharCode(Number(e.slice(2, -1))) : e));

function estProse(s, jsx = false) {
  const t = s.trim();
  if (!/[A-Za-zÀ-ÿ]{2,}/.test(t)) return false;
  if (/^(https?:|\/|#|\.|@)/.test(t)) return false;
  if (t.includes("${")) return false;
  if (!jsx && /^[a-z0-9_.:\-\/]+$/.test(t) && !/[À-ÿ]/.test(t)) return false; // identifiant, classe, chemin (jamais du texte JSX)
  if (/^[A-Z0-9_]+$/.test(t)) return false; // constante (ADMIN, ACTIF)
  if (/^(Vertex One|Vertex Technology|Deal|Deals|Lead|Leads|One [A-Z][a-z]+|WhatsApp|Mobile Money|Orange Money|MTN MoMo|FCFA|Email|CSV|PDF)$/.test(t)) return false; // marques et termes identiques dans les deux langues
  return true;
}
const litteral = (s) => JSON.stringify(s);

const rapportCles = {};
const manuel = [];
let totalFichiers = 0;

for (const fichier of fichiers) {
  const source = fs.readFileSync(fichier, "utf8");
  const sf = ts.createSourceFile(fichier, source, ts.ScriptTarget.Latest, true, fichier.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const client = /^\s*["']use client["']/.test(source);
  const serveur = /^\s*["']use server["']/.test(source);
  const edits = []; // { debut, fin, texte }
  const cles = new Set();
  const utilisent = new Set(); // fonctions de plus haut niveau qui utilisent t
  let zod = false;
  const rel = (n) => `${fichier}:${sf.getLineAndCharacterOfPosition(n.getStart()).line + 1}`;

  const hautNiveau = (node) => {
    let cur = node;
    let derniere = null;
    while (cur && cur.parent) {
      if (ts.isFunctionLike(cur)) derniere = cur;
      if (cur.parent.kind === ts.SyntaxKind.SourceFile) break;
      cur = cur.parent;
    }
    // On remonte jusqu'à la fonction dont le parent est le niveau module (ou une déclaration de variable de niveau module).
    let f = null;
    cur = node;
    while (cur) {
      if (ts.isFunctionLike(cur)) f = cur;
      cur = cur.parent;
    }
    return f;
  };
  const auNiveauModule = (node) => hautNiveau(node) === null;
  const marquer = (node) => {
    const f = hautNiveau(node);
    if (f) utilisent.add(f);
    return !!f;
  };

  const envelopper = (node, texte) => {
    cles.add(texte);
    const enFonction = marquer(node);
    return enFonction ? `t(${litteral(texte)})` : `m(${litteral(texte)})`;
  };

  const enPositionValeur = (node) => {
    let p = node.parent;
    while (p && ts.isParenthesizedExpression(p)) {
      node = p;
      p = p.parent;
    }
    if (!p) return false;
    if (ts.isJsxExpression(p)) return true;
    if (ts.isPropertyAssignment(p)) return p.initializer === node && PROPRIETES_TEXTE.has(p.name.getText());
    if (ts.isConditionalExpression(p)) return p.whenTrue === node || p.whenFalse === node ? enPositionValeur(p) : false;
    if (ts.isBinaryExpression(p)) {
      const op = p.operatorToken.kind;
      if (op === ts.SyntaxKind.AmpersandAmpersandToken) return p.right === node && enPositionValeur(p);
      if (op === ts.SyntaxKind.BarBarToken || op === ts.SyntaxKind.QuestionQuestionToken) return enPositionValeur(p);
    }
    return false;
  };

  const visite = (node) => {
    if (ts.isJsxText(node)) {
      const brut = node.getText();
      const decode = decoder2(brut);
      if (/[A-Za-zÀ-ÿ]/.test(decode) && estProse(decode, true)) {
        const parent = node.parent;
        const freres = parent && parent.children ? parent.children : [];
        const contientJsx = (n) => { let trouve = false; (function v(x) { if (ts.isJsxElement(x) || ts.isJsxSelfClosingElement(x) || ts.isJsxFragment(x)) trouve = true; else ts.forEachChild(x, v); })(n); return trouve; };
        // Une expression voisine qui n'affiche pas de JSX (un nombre, un nom : {n}, {fiche.nom}) fait partie de la phrase.
        const voisinExpr = freres.some((c) => c !== node && ts.isJsxExpression(c) && c.expression && !contientJsx(c.expression));
        // Texte mêlé à des expressions ({nom}, {n}) : la phrase doit être une seule clé avec {paramètres} — traité à la main.
        if (voisinExpr) {
          manuel.push(`FRAGMENT ${rel(node)} : ${decode.trim().slice(0, 70)}`);
        } else {
          const lead = brut.match(/^\s*/)[0];
          const trail = brut.match(/\s*$/)[0];
          const cle = decode.replace(/\s+/g, " ").trim();
          edits.push({ debut: node.getStart(), fin: node.getEnd(), texte: `${lead}{${envelopper(node, cle)}}${trail}` });
        }
      }
    } else if (ts.isJsxAttribute(node) && node.initializer && ts.isStringLiteral(node.initializer) && ATTRIBUTS_TEXTE.has(node.name.getText()) && estProse(node.initializer.text)) {
      edits.push({ debut: node.initializer.getStart(), fin: node.initializer.getEnd(), texte: `{${envelopper(node, decoder2(node.initializer.text))}}` });
    } else if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      const p = node.parent;
      const texte = node.text;
      if (estProse(texte)) {
        if (p && ts.isJsxAttribute(p)) {
          // déjà traité ci-dessus (ou attribut non textuel comme className)
        } else if (p && ts.isJsxExpression(p) && p.parent && ts.isJsxAttribute(p.parent)) {
          if (ATTRIBUTS_TEXTE.has(p.parent.name.getText())) edits.push({ debut: node.getStart(), fin: node.getEnd(), texte: envelopper(node, texte) });
        } else if (enPositionValeur(node) && !enAttributNonTexte(node)) {
          edits.push({ debut: node.getStart(), fin: node.getEnd(), texte: envelopper(node, texte) });
        } else if (p && ts.isCallExpression(p) && p.arguments[0] === node && APPELS_TEXTE.has(p.expression.getText().replace(/^window\./, ""))) {
          edits.push({ debut: node.getStart(), fin: node.getEnd(), texte: envelopper(node, texte) });
        } else if (p && ts.isCallExpression(p) && p.arguments.includes(node) && ts.isPropertyAccessExpression(p.expression) && /^(min|max|email|regex|length|nonnegative|int|positive|refine|superRefine|nonempty|url|uuid)$/.test(p.expression.name.getText()) && /\bz\b/.test(p.expression.getText())) {
          // message de validation zod : évalué au chargement du module, donc marqué m() et traduit là où il est renvoyé
          cles.add(texte);
          edits.push({ debut: node.getStart(), fin: node.getEnd(), texte: `m(${litteral(texte)})` });
          zod = true;
        } else if (p && ts.isPropertyAssignment(p) && p.initializer === node && PROPRIETES_TEXTE.has(p.name.getText())) {
          edits.push({ debut: node.getStart(), fin: node.getEnd(), texte: envelopper(node, texte) });
        }
      }
    }
    ts.forEachChild(node, visite);
  };
  function enAttributNonTexte(node) {
    let cur = node.parent;
    while (cur) {
      if (ts.isJsxAttribute(cur)) return !ATTRIBUTS_TEXTE.has(cur.name.getText());
      if (ts.isJsxElement(cur) || ts.isJsxSelfClosingElement(cur) || ts.isJsxFragment(cur)) return false;
      cur = cur.parent;
    }
    return false;
  }
  visite(sf);

  if (edits.length === 0) continue;

  // Chaque fonction de haut niveau qui utilise t reçoit sa déclaration.
  let besoinAsync = false;
  for (const f of utilisent) {
    const corps = f.body;
    if (!corps) continue;
    const decl = client ? "const t = useT();" : "const t = await getT();";
    if (/const t = (useT\(\)|await getT\(\));/.test(corps.getText())) continue; // déjà déclarée
    if (!client && !(f.modifiers && f.modifiers.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword))) {
      manuel.push(`NON-ASYNC ${rel(f)} : ${f.name ? f.name.getText() : "(anonyme)"} utilise t() dans un composant serveur non async`);
      continue;
    }
    if (ts.isBlock(corps)) {
      edits.push({ debut: corps.getStart() + 1, fin: corps.getStart() + 1, texte: `\n  ${decl}` });
    } else {
      // Corps d'expression : => (<jsx/>) devient => { const t…; return (<jsx/>); }
      edits.push({ debut: corps.getStart(), fin: corps.getEnd(), texte: `{\n  ${decl}\n  return ${corps.getText()};\n}` });
    }
  }

  // Import(s) après le dernier import existant.
  const imports = sf.statements.filter(ts.isImportDeclaration);
  const dernier = imports[imports.length - 1];
  const utiliseM = edits.some((e) => /\bm\(/.test(e.texte));
  const lignesImport = [];
  if (client && !/import \{[^}]*\buseT\b/.test(source)) lignesImport.push('import { useT } from "@/lib/i18n/contexte";');
  else if (!client && !/import \{[^}]*\bgetT\b/.test(source)) lignesImport.push('import { getT } from "@/lib/i18n/langue";');
  if (utiliseM && !/import \{[^}]*\bm\b[^}]*\} from "@\/lib\/i18n\/catalogue"/.test(source)) lignesImport.push('import { m } from "@/lib/i18n/catalogue";');
  const pos = dernier ? dernier.getEnd() : 0;
  edits.push({ debut: pos, fin: pos, texte: `\n${lignesImport.join("\n")}` });

  // Application des modifications de la fin vers le début.
  edits.sort((a, b) => b.debut - a.debut || b.fin - a.fin);
  let sortie = source;
  for (const e of edits) sortie = sortie.slice(0, e.debut) + e.texte + sortie.slice(e.fin);

  rapportCles[fichier] = [...cles];
  totalFichiers++;
  if (ecrire) fs.writeFileSync(fichier, sortie);
}

fs.writeFileSync("scripts/.i18n-cles.json", JSON.stringify(rapportCles, null, 1));
const toutes = new Set(Object.values(rapportCles).flat());
console.log(`${ecrire ? "ÉCRIT" : "SIMULATION"} : ${totalFichiers} fichier(s), ${toutes.size} texte(s) distinct(s).`);
if (manuel.length) console.log("À traiter à la main :\n" + manuel.join("\n"));
