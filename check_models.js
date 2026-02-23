import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({
  apiKey: "AIzaSyDM_HiCH6Pd3gfyTiDAG-WOAK9476SFRVs",
});

async function findLiveModel() {
  try {
    const list = await ai.models.list();
    console.log("Found Models:");
    for (const model of list) {
      console.log(`- ${model.name}`);
    }
  } catch (err) {
    console.error("Error listing models:", err.message || err);
  }
}

findLiveModel();
