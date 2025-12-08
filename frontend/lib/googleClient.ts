import { GoogleGenAI } from "@google/genai";
import { geminiConfig } from "./config";

if (!geminiConfig.apiKey) {
  throw new Error("GEMINI_API_KEY is not set");
}

export const ai = new GoogleGenAI({
  apiKey: geminiConfig.apiKey,
});








