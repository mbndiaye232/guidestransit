import { Firestore } from '@google-cloud/firestore';
import dotenv from 'dotenv';

dotenv.config();

async function viewVectors() {
  const collectionName = process.env.FIRESTORE_COLLECTION || 'rag_chunks';

  try {
    console.log(`Connexion à Firestore...`);
    const db = new Firestore({ databaseId: process.env.FIRESTORE_DATABASE_ID || '(default)' });
    const collectionRef = db.collection(collectionName);
    
    // 1. Compter le nombre de documents
    console.log(`Description de la collection "${collectionName}"...`);
    const snapshot = await collectionRef.get();
    const count = snapshot.size;
    console.log("\n=== Statistiques de la Collection Firestore ===");
    console.log(`Nom de la collection : ${collectionName}`);
    console.log(`Nombre total de documents : ${count}`);
    
    if (count === 0) {
      console.log("\nLa collection est vide. Veuillez exécuter 'npm run prep' d'abord.");
      return;
    }

    // 2. Récupérer un échantillon de 10 documents
    console.log(`\nRécupération d'un échantillon de documents...`);
    const sampleSnapshot = await collectionRef.limit(10).get();

    console.log("\n=== Échantillon des 10 premiers documents indexés ===");
    let idx = 1;
    sampleSnapshot.forEach(doc => {
      const data = doc.data();
      console.log(`\n[${idx++}] ID du Document : "${doc.id}"`);
      console.log(`    - Source : ${data.source || 'N/A'}`);
      console.log(`    - Titre : ${data.title || 'N/A'}`);
      if (data.pageNumber) {
        console.log(`    - Numéro de Page : ${data.pageNumber}`);
        console.log(`    - Capture d'écran : ${data.screenshotUrl || 'N/A'}`);
      }
      const textPreview = data.text ? data.text.substring(0, 150).replace(/\n/g, ' ') + '...' : 'N/A';
      console.log(`    - Contenu Texte : "${textPreview}"`);
      if (data.embedding) {
        const dims = Array.isArray(data.embedding) ? data.embedding.length : (data.embedding.values ? data.embedding.values.length : 'Vector Object');
        console.log(`    - Dimension Vectorielle : ${dims}`);
      }
    });

  } catch (error) {
    console.error("Erreur lors de la lecture de la base vectorielle Firestore :", error);
  }
}

viewVectors();
