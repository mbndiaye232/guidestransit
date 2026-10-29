// Construit une NOUVELLE collection Firestore pour l'assistant (mise à jour 2026-10), sans jamais supprimer ni modifier l'existante.
//   - pages d'octobre : rag_2026_chunks.json (voir construire_chunks_2026.py), vectorisées ici ;
//   - pages de juin conservées + segments vidéo : recopiés depuis la sauvegarde (vecteurs inclus, aucun recalcul).
// Usage : node prep_rag_2026.js <nouvelle-collection> <fichier-de-sauvegarde.json> [--dry-run]
// Refuse d'écrire dans une collection qui contient déjà des documents.
import fs from 'fs';
import { Firestore, FieldValue } from '@google-cloud/firestore';
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';

dotenv.config();
const [cible, fichierSauvegarde] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const aBlanc = process.argv.includes('--dry-run');
if (!cible || !fichierSauvegarde) { console.error('Usage : node prep_rag_2026.js <nouvelle-collection> <sauvegarde.json> [--dry-run]'); process.exit(1); }
if (cible === (process.env.FIRESTORE_COLLECTION || 'rag_chunks')) { console.error('Refus : la collection cible est la collection de production.'); process.exit(1); }
if (!process.env.GEMINI_API_KEY) { console.error('GEMINI_API_KEY manquant dans .env'); process.exit(1); }

const sauvegarde = JSON.parse(fs.readFileSync(fichierSauvegarde, 'utf8'));
const { nouveaux, conserves_juin } = JSON.parse(fs.readFileSync('rag_2026_chunks.json', 'utf8'));
const juinGardees = new Set(Object.keys(conserves_juin).map(Number));

const recopies = sauvegarde.docs.filter((d) => d.source === 'video' || (d.source === 'pdf' && juinGardees.has(d.pageNumber)));
console.log(`À écrire dans « ${cible} » : ${nouveaux.length} pages d'octobre (vectorisation) + ${recopies.length} documents recopiés ` +
  `(${recopies.filter((d) => d.source === 'pdf').length} pages de juin, ${recopies.filter((d) => d.source === 'video').length} vidéo)`);
const manquantes = [...juinGardees].filter((p) => !recopies.some((d) => d.source === 'pdf' && d.pageNumber === p));
if (manquantes.length) console.warn('⚠ pages de juin absentes de la sauvegarde :', manquantes.join(', '));
if (aBlanc) { console.log('--dry-run : rien n\'est écrit.'); process.exit(0); }

const db = new Firestore({ databaseId: process.env.FIRESTORE_DATABASE_ID || '(default)' });
const ref = db.collection(cible);
if (!(await ref.limit(1).get()).empty) { console.error(`Refus : « ${cible} » contient déjà des documents.`); process.exit(1); }

const modele = new GoogleGenerativeAI(process.env.GEMINI_API_KEY).getGenerativeModel({ model: 'gemini-embedding-001' });
const vecteur = async (texte) => {
  for (let essai = 1; ; essai++) {
    try { return (await modele.embedContent({ content: { parts: [{ text: texte }] }, outputDimensionality: 768 })).embedding.values; }
    catch (e) { if (essai >= 4) throw e; await new Promise((r) => setTimeout(r, 2000 * essai)); }
  }
};

// 1. Recopie (vecteurs existants)
let lot = db.batch(), n = 0;
for (const d of recopies) {
  const { id, embedding, vector_distance, ...champs } = d;
  lot.set(ref.doc(id), { ...champs, embedding: FieldValue.vector(embedding) });
  if (++n % 100 === 0) { await lot.commit(); lot = db.batch(); }
}
await lot.commit();
console.log(`✓ ${recopies.length} documents recopiés`);

// 2. Nouvelles pages (vectorisation)
let faits = 0;
for (const c of nouveaux) {
  const v = await vecteur(c.text);
  await ref.doc(c.id).set({ text: c.text, source: c.source, pageNumber: c.pageNumber, screenshotUrl: c.screenshotUrl, title: c.title, embedding: FieldValue.vector(v) });
  if (++faits % 10 === 0) console.log(`  ${faits}/${nouveaux.length}`);
}
console.log(`✓ ${faits} pages d'octobre vectorisées et écrites`);
console.log(`Collection « ${cible} » : ${(await ref.count().get()).data().count} documents`);
