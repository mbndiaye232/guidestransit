import { Pinecone } from '@pinecone-database/pinecone';
import dotenv from 'dotenv';

dotenv.config();

async function viewVectors() {
  const apiKey = process.env.PINECONE_API_KEY;
  const indexName = process.env.PINECONE_INDEX_NAME || 'clef-guide-soft-transit';

  if (!apiKey) {
    console.error("Erreur: PINECONE_API_KEY n'est pas défini dans le fichier .env");
    return;
  }

  try {
    console.log(`Connexion à Pinecone...`);
    const pc = new Pinecone({ apiKey });
    
    // 1. Décrire l'index pour voir les statistiques globales
    console.log(`Description de l'index "${indexName}"...`);
    const indexStats = await pc.Index(indexName).describeIndexStats();
    console.log("\n=== Statistiques de l'Index Pinecone ===");
    console.log(`Nom de l'index : ${indexName}`);
    console.log(`Dimension : ${indexStats.dimension}`);
    console.log(`Nombre total de vecteurs : ${indexStats.totalRecordCount}`);
    console.log(`Nombre de namespaces : ${Object.keys(indexStats.namespaces || {}).length}`);
    
    if (indexStats.totalRecordCount === 0) {
      console.log("\nL'index est vide. Veuillez exécuter 'npm run prep' d'abord.");
      return;
    }

    // 2. Récupérer un échantillon de vecteurs
    console.log(`\nRécupération d'un échantillon de vecteurs...`);
    const index = pc.Index(indexName);
    
    // Pour lister les IDs de vecteurs dans Pinecone, on peut interroger avec un vecteur neutre (rempli de zéros)
    const dummyVector = new Array(indexStats.dimension).fill(0);
    dummyVector[0] = 1.0; // Mettre une valeur non nulle pour éviter l'erreur de magnitude nulle en similarité cosinus (cos(0, x) est indéfini)
    const queryResponse = await index.query({
      vector: dummyVector,
      topK: 10, // Récupérer 10 échantillons
      includeMetadata: true
    });

    console.log("\n=== Échantillon des 10 premiers vecteurs indexés ===");
    const matches = queryResponse.matches || [];
    
    matches.forEach((match, idx) => {
      const meta = match.metadata || {};
      console.log(`\n[${idx + 1}] ID du Vecteur : "${match.id}"`);
      console.log(`    - Source : ${meta.source || 'N/A'}`);
      console.log(`    - Titre : ${meta.title || 'N/A'}`);
      if (meta.pageNumber) {
        console.log(`    - Numéro de Page : ${meta.pageNumber}`);
        console.log(`    - Capture d'écran : ${meta.screenshotUrl || 'N/A'}`);
      }
      const textPreview = meta.text ? meta.text.substring(0, 150).replace(/\n/g, ' ') + '...' : 'N/A';
      console.log(`    - Contenu Texte : "${textPreview}"`);
    });

    console.log("\nPour explorer l'intégralité de vos données de RAG et faire des recherches de vecteurs, vous pouvez vous connecter à la console web : https://app.pinecone.io");

  } catch (error) {
    console.error("Erreur lors de la lecture de la base vectorielle Pinecone :", error);
  }
}

viewVectors();
