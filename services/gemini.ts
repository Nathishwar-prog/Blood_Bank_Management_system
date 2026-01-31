
import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

/**
 * AI Assistant (BloodBot) using Gemini 3 Pro
 */
export async function getBloodBotResponse(message: string, history: { role: 'user' | 'model', parts: { text: string }[] }[]) {
  const chat = ai.chats.create({
    model: 'gemini-3-pro-preview',
    config: {
      systemInstruction: `You are LifeLink AI, a specialized medical assistant for a blood bank system. 
      Your goals:
      1. Calmly help users find blood centers.
      2. Explain donor eligibility (weight, age, health status).
      3. Provide information on blood types and compatibility.
      4. DO NOT provide definitive medical diagnoses. Always advise consulting a doctor.
      Keep responses professional, empathetic, and concise.`,
    },
  });

  const response = await chat.sendMessage({ message });
  return response.text;
}

/**
 * Health Search Grounding using Gemini 3 Flash
 */
export async function searchBloodShortages(region: string) {
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `Are there any critical blood shortages or donation drives currently reported in ${region}? Summarize findings.`,
    config: {
      tools: [{ googleSearch: {} }],
    },
  });
  
  return {
    text: response.text,
    sources: response.candidates?.[0]?.groundingMetadata?.groundingChunks || []
  };
}

/**
 * Maps Grounding using Gemini 2.5 Flash
 */
export async function findPublicBloodCenters(location: string) {
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: `Find reputable government blood banks or public hospitals with blood donation centers near ${location}.`,
    config: {
      tools: [{ googleMaps: {} }],
    },
  });

  return {
    text: response.text,
    sources: response.candidates?.[0]?.groundingMetadata?.groundingChunks || []
  };
}
