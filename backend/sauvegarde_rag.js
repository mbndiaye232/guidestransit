// Sauvegarde (LECTURE SEULE) d'une collection Firestore de l'assistant dans un fichier JSON, vecteurs inclus (restauration possible).
// Usage : node sauvegarde_rag.js [collection]      (par défaut : FIRESTORE_COLLECTION du .env)
// Sortie : backups/<collection>-<date>.json — aucune écriture dans Firestore.
import fs from 'fs';
import path from 'path';
import { Firestore } from '@google-cloud/firestore';
import dotenv from 'dotenv';

dotenv.config();
const collection = process.argv[2] || process.env.FIRESTORE_COLLECTION || 'rag_chunks';
const db = new Firestore({ databaseId: process.env.FIRESTORE_DATABASE_ID || '(default)' });

const snap = await db.collection(collection).get();
const docs = snap.docs.map((d) => {
  const data = d.data();
  const embedding = data.embedding && typeof data.embedding.toArray === 'function' ? data.embedding.toArray() : null;
  return { id: d.id, ...data, embedding };
});

fs.mkdirSync('backups', { recursive: true });
const fichier = path.join('backups', `${collection}-${new Date().toISOString().slice(0, 10)}.json`);
fs.writeFileSync(fichier, JSON.stringify({ collection, databaseId: process.env.FIRESTORE_DATABASE_ID || '(default)', exporte_le: new Date().toISOString(), docs }, null, 1));

const parSource = {};
docs.forEach((d) => { parSource[d.source || '?'] = (parSource[d.source || '?'] || 0) + 1; });
console.log(`Collection « ${collection} » : ${docs.length} documents sauvegardés dans ${fichier}`);
console.log('Répartition par source :', JSON.stringify(parSource));
console.log('Documents avec vecteur :', docs.filter((d) => d.embedding && d.embedding.length).length);
