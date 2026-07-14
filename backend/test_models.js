
import dotenv from 'dotenv';

dotenv.config();

async function listModels() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("Error: GEMINI_API_KEY is not defined in .env");
    return;
  }

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.error) {
      console.error("API Error:", data.error);
      return;
    }
    
    console.log("=== List of Available Models ===");
    const embeddingModels = [];
    const otherModels = [];
    
    data.models.forEach(model => {
      const name = model.name.replace('models/', '');
      const methods = model.supportedGenerationMethods || [];
      
      if (methods.includes('embedContent') || methods.includes('batchEmbedContents')) {
        embeddingModels.push({ name, description: model.description, methods });
      } else {
        otherModels.push({ name, description: model.description });
      }
    });
    
    console.log("\nEmbedding Models:");
    console.log(JSON.stringify(embeddingModels, null, 2));
    
    console.log("\nOther Models (all):");
    console.log(JSON.stringify(otherModels, null, 2));
    
  } catch (error) {
    console.error("Error calling API:", error);
  }
}

listModels();
