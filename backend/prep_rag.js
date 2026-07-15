import fs from 'fs';
import path from 'path';
import pdf from 'pdf-parse';
import { execSync } from 'child_process';
import { Firestore, FieldValue } from '@google-cloud/firestore';
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';

dotenv.config();

const PDF_PATH = '../SOFT_TRANSIT_WEB_GUIDE_UTILISATION.pdf';
const SCREENSHOTS_DIR = './public/screenshots';
const COLLECTION_NAME = process.env.FIRESTORE_COLLECTION || 'rag_chunks';

// Vérifier les clés API
if (!process.env.GEMINI_API_KEY) {
  console.error("Erreur: GEMINI_API_KEY n'est pas configuré dans le fichier .env");
  process.exit(1);
}

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const embeddingModel = genAI.getGenerativeModel({ model: "gemini-embedding-001" });

// 1. Extraire le texte du PDF page par page
async function extractTextFromPdf(pdfPath) {
  console.log(`Lecture du PDF : ${pdfPath}...`);
  const dataBuffer = fs.readFileSync(pdfPath);
  const pages = [];
  
  let currentPage = 1;
  const options = {
    pagerender: function(pageData) {
      return pageData.getTextContent().then(function(textContent) {
        let lastY, text = '';
        for (let item of textContent.items) {
          if (lastY == item.transform[5] || !lastY) {
            text += item.str + ' ';
          } else {
            text += '\n' + item.str + ' ';
          }
          lastY = item.transform[5];
        }
        pages.push({
          pageNumber: currentPage++,
          text: text.trim()
        });
        return text;
      });
    }
  };

  await pdf(dataBuffer, options);
  console.log(`Texte extrait de ${pages.length} pages.`);
  return pages;
}

// 2. Découper le texte en chunks logiques
function chunkText(pages) {
  console.log("Découpage du texte en chunks...");
  const chunks = [];
  
  for (const page of pages) {
    const text = page.text;
    if (!text || text.length < 50) continue; // Ignorer les pages quasi vides
    
    // Pour les pages d'un guide d'utilisation, chaque page est un bon chunk de contexte.
    // Ici, nous indexons par page pour lier facilement chaque réponse à la capture d'écran correspondante.
    chunks.push({
      id: `page_${page.pageNumber}`,
      text: `[Page ${page.pageNumber}] ${text}`,
      metadata: {
        source: 'pdf',
        pageNumber: page.pageNumber,
        screenshotUrl: `/screenshots/page_${page.pageNumber}.png`,
        title: `Guide d'utilisation - Page ${page.pageNumber}`
      }
    });
  }
  
  // Ajouter des informations additionnelles sur la vidéo YouTube guide
  chunks.push({
    id: 'video_guide_overview',
    text: `[Vidéo Guide] Soft Transit Web est un logiciel de gestion du transit et de la douane. 
La vidéo guide d'utilisation (https://youtu.be/Fg-CR3Fr9kg) montre les étapes de connexion, 
la configuration des agents, la création des dossiers de transit, le suivi des factures débours douane, 
le calcul des taxes avec les notes de détail, l'enregistrement des règlements et le suivi des sommiers. 
Le guide vidéo présente une démonstration complète en conditions réelles de l'application.`,
    metadata: {
      source: 'video',
      pageNumber: 0,
      screenshotUrl: '', // Pas d'image spécifique pour la vue globale
      title: 'Présentation Générale - Guide Vidéo'
    }
  });

  console.log(`Génération de ${chunks.length} chunks.`);
  return chunks;
}

// 3. Convertir le PDF en images (captures d'écran) via Python
async function convertPdfToScreenshots() {
  console.log("Conversion du PDF en images PNG (via le script python convert_pdf.py)...");
  try {
    const pythonPath = "C:\\Users\\hp\\AppData\\Local\\Python\\pythoncore-3.14-64\\python.exe";
    execSync(`"${pythonPath}" convert_pdf.py`, { stdio: 'inherit' });
  } catch (error) {
    console.warn("⚠️ Impossible de lancer convert_pdf.py avec le chemin par défaut. Tentative avec 'python'...");
    try {
      execSync("python convert_pdf.py", { stdio: 'inherit' });
    } catch (err) {
      console.error("❌ Échec de la conversion automatique. Veuillez exécuter manuellement : python convert_pdf.py");
    }
  }
}

// 4. Indexer dans Firestore
async function indexToFirestore(chunks) {
  console.log("Connexion à Firestore...");
  const db = new Firestore({
    databaseId: process.env.FIRESTORE_DATABASE_ID || '(default)'
  });
  const collectionRef = db.collection(COLLECTION_NAME);

  // Supprimer les anciens documents de la collection pour éviter les doublons
  console.log("Nettoyage de l'ancienne collection Firestore...");
  const snapshot = await collectionRef.get();
  if (snapshot.size > 0) {
    const batch = db.batch();
    snapshot.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });
    await batch.commit();
    console.log(`✓ ${snapshot.size} anciens documents supprimés.`);
  }

  console.log("Indexation des chunks...");

  // Traiter par lots (batchs) de 10 pour éviter de surcharger l'API Gemini
  const batchSize = 10;
  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize);
    console.log(`Traitement du lot ${Math.floor(i / batchSize) + 1}/${Math.ceil(chunks.length / batchSize)}...`);
    
    const dbBatch = db.batch();
    let batchCount = 0;
    
    for (const chunk of batch) {
      try {
        // Générer l'embedding (768 dimensions max pour Firestore)
        const embedResult = await embeddingModel.embedContent({
          content: { parts: [{ text: chunk.text }] },
          outputDimensionality: 768
        });
        const values = embedResult.embedding.values;
        
        const docRef = collectionRef.doc(chunk.id);
        dbBatch.set(docRef, {
          text: chunk.text,
          source: chunk.metadata.source,
          pageNumber: chunk.metadata.pageNumber,
          screenshotUrl: chunk.metadata.screenshotUrl,
          title: chunk.metadata.title,
          embedding: FieldValue.vector(values)
        });
        batchCount++;
      } catch (err) {
        console.error(`Erreur d'embedding pour le chunk ${chunk.id}:`, err);
      }
    }
    
    if (batchCount > 0) {
      await dbBatch.commit();
      console.log(`✓ Lot de ${batchCount} vecteurs insérés dans Firestore.`);
    }
  }

  console.log("Félicitations! L'indexation dans Firestore est terminée.");
}

// Lancement du processus
async function run() {
  try {
    console.log("=== Démarrage de la préparation RAG ===");
    
    // Étape 1 : Convertir le PDF en captures d'écran via Python
    await convertPdfToScreenshots();
    
    // Étape 2 : Extraire le texte du PDF
    const pages = await extractTextFromPdf(PDF_PATH);
    
    // Étape 3 : Découper le texte en chunks
    const chunks = chunkText(pages);
    
    // Étape 4 : Générer les embeddings et insérer dans Firestore
    await indexToFirestore(chunks);
    
    console.log("=== Préparation RAG terminée avec succès ===");
  } catch (error) {
    console.error("Erreur globale lors de la préparation RAG :", error);
  }
}

run();
