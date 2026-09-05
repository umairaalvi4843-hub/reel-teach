// src/evaluation/reportGenerator.js — Final report with Gemini
import { callGeminiJSON } from "../geminiClient.js";

/**
 * sessionLog: array of { concept, verdict, diagnosedMisconception } from every
 * checkpoint answered during the lesson.
 */
export async function generateReport(topic, sessionLog, language) {
  const systemPrompt = `You are a teacher writing a short, honest end-of-lesson report for a student.
Be specific about what they understood and what they didn't. Do not be generically positive.`;

  const userPrompt = `
Topic: ${topic}
Session log (each checkpoint the student answered during the lesson):
${JSON.stringify(sessionLog, null, 2)}

Respond in ${language}. Return JSON in exactly this shape:
{
  "scorePercent": number,
  "strongConcepts": ["string"],
  "weakConcepts": ["string"],
  "misconceptionsFound": ["string"],
  "recommendation": "string - specific, actionable advice on what to revise",
  "suggestedNextTopic": "string"
}
`;

  return callGeminiJSON(userPrompt, systemPrompt);
}
