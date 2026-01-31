
import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

/**
 * AI Assistant (BloodBot) using Gemini 3 Pro
 * Correctly uses the history parameter to maintain conversational context.
 */
export async function getBloodBotResponse(message: string, history: { role: 'user' | 'model', parts: { text: string }[] }[]) {
  const chat = ai.chats.create({
    model: 'gemini-3-pro-preview',
    // Inject conversation history for context-aware responses
    history: history,
    config: {
      systemInstruction: `You are LifeLink AI Medical Assistant. 
      Your expertise includes:
      1. Blood donation eligibility and post-donation recovery.
      2. Nutritional advice for maintaining healthy iron and hemoglobin levels.
      3. General information on blood conditions (Anemia, Blood types, Hemophilia) for educational purposes.
      4. Emergency blood search coordination.

      CRITICAL SAFETY RULE: 
      Every response regarding health or medical conditions MUST begin or end with a prominent disclaimer: 
      "MEDICAL DISCLAIMER: This information is for educational purposes only and does not substitute professional medical advice. Always consult a physician for diagnoses or treatment."
      
      Keep responses professional, empathetic, and concise.`,
    },
  });

  const response = await chat.sendMessage({ message });
  return response.text;
}

/**
 * Structured Health Insights using Gemini 3 Flash
 */
export async function getHealthInsight(topic: string) {
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `Provide structured medical information about: ${topic}. Focus on blood health.`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          category: { 
            type: Type.STRING, 
            enum: ['Post-Donation', 'Nutrition', 'Conditions', 'General'] 
          },
          content: { type: Type.STRING },
          tips: { 
            type: Type.ARRAY, 
            items: { type: Type.STRING } 
          },
          disclaimer: { type: Type.STRING }
        },
        required: ["title", "category", "content", "tips", "disclaimer"]
      }
    }
  });

  try {
    return JSON.parse(response.text || '{}');
  } catch (e) {
    console.error("Failed to parse health insight", e);
    return null;
  }
}

/**
 * Health Search Grounding using Gemini 3 Flash
 */
export async function searchBloodShortages(region: string) {
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `Are there any critical blood shortages, emergency drives, or public health alerts related to blood donation currently reported in ${region}?`,
    config: {
      tools: [{ googleSearch: {} }],
    },
  });
  
  return {
    text: response.text,
    sources: response.candidates?.[0]?.groundingMetadata?.groundingChunks || []
  };
}
