// src/geminiClient.js — Loads .env itself
import axios from 'axios';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Get the directory name
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from the project root
dotenv.config({ path: path.join(__dirname, '..', '.env') });

// Get key from .env
const API_KEY = process.env.GEMINI_API_KEY?.trim();
const MODEL_NAME = 'gemini-3.5-flash-lite';
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${API_KEY}`;

console.log('🔑 geminiClient loaded key?', API_KEY ? '✅ Yes' : '❌ No');
console.log('📝 First 10 chars:', API_KEY?.substring(0, 10));

export async function callGemini(prompt, systemPrompt = '') {
  try {
    const fullPrompt = systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt;
    
    const response = await axios.post(API_URL, {
      contents: [{
        parts: [{ text: fullPrompt }]
      }],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 2048,
        topK: 40,
        topP: 0.95,
      }
    });

    return response.data.candidates[0].content.parts[0].text;
  } catch (error) {
    console.error('Gemini API Error:', error.response?.data || error.message);
    throw new Error(`Gemini API failed: ${error.response?.data?.error?.message || error.message}`);
  }
}

export async function callGeminiJSON(prompt, systemPrompt = '') {
  const response = await callGemini(
    `${prompt}\n\nRespond with valid JSON only. No markdown, no explanations.`,
    systemPrompt
  );
  
  const cleaned = response.replace(/```json/g, '').replace(/```/g, '').trim();
  return JSON.parse(cleaned);
}