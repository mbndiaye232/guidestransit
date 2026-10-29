// Ajoute (ou met à jour) les segments des vidéos Soft Transit dans une collection Firestore, sans toucher aux autres documents.
//   - entrées : rag_videos_2026_chunks.json (voir construire_chunks_videos_2026.py), identifiants « yt_… » ;
//   - retour arrière : node ajout_videos_2026.js <collection> --retirer  (supprime uniquement les documents « yt_… »).
// Usage : node ajout_videos_2026.js <collection> [--dry-run | --retirer]
import fs from 'fs';
import { Firestore, FieldValue } from '@google-cloud/firestore';
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';

dotenv.config();
const cible = process.argv.slice(2).find((a) => !a.startsWith('--'));
const aBlanc = process.argv.includes('--dry-run');
const retirer = process.argv.includes('--retirer');
if (!cible) { console.error('Usage : node ajout_videos_2026.js <collection> [--dry-run | --retirer]'); process.exit(1); }

const { chunks } = JSON.parse(fs.readFileSync('rag_videos_2026_chunks.json', 'utf8'));
const db = new Firestore({ databaseId: process.env.FIRESTORE_DATABASE_ID || '(default)' });
const ref = db.collection(cible);

if (retirer) {
  for (const c of chunks) await ref.doc(c.id).delete();
  console.log(`${chunks.length} documents « yt_… » retirés de « ${cible} » : ${(await ref.count().get()).data().count} documents restent`);
  process.exit(0);
}

console.log(`${chunks.length} segments vidéo à écrire dans « ${cible} » (${(await ref.count().get()).data().count} documents actuellement)`);
if (aBlanc) { console.log('--dry-run : rien n\'est écrit.'); process.exit(0); }
if (!process.env.GEMINI_API_KEY) { console.error('GEMINI_API_KEY manquant dans .env'); process.exit(1); }

const modele = new GoogleGenerativeAI(process.env.GEMINI_API_KEY).getGenerativeModel({ model: 'gemini-embedding-001' });
const vecteur = async (texte) => {
  for (let essai = 1; ; essai++) {
    try { return (await modele.embedContent({ content: { parts: [{ text: texte }] }, outputDimensionality: 768 })).embedding.values; }
    catch (e) { if (essai >= 4) throw e; await new Promise((r) => setTimeout(r, 2000 * essai)); }
  }
};

let faits = 0;
for (const c of chunks) {
  const v = await vecteur(c.text);
  await ref.doc(c.id).set({ text: c.text, source: c.source, pageNumber: c.pageNumber, screenshotUrl: c.screenshotUrl, title: c.title, embedding: FieldValue.vector(v) });
  if (++faits % 10 === 0) console.log(`  ${faits}/${chunks.length}`);
}
console.log(`✓ ${faits} segments écrits. « ${cible} » : ${(await ref.count().get()).data().count} documents`);
