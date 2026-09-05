// src/planner/lessonPlanner.js — Uses Gemini to generate structured lesson plans
import { callGeminiJSON } from "../geminiClient.js";

const PERSONALITY_PROMPTS = {
    friendly: "Use warm, encouraging language. Praise the student's effort. Use emojis occasionally. Make the student feel comfortable and confident.",
    strict: "Be formal, precise, and demanding. No fluff. Use academic language. Challenge the student to think critically.",
    storyteller: "Teach through stories, analogies, and narratives. Make concepts come alive with vivid examples. Use a conversational, engaging tone."
};

export async function generateLessonPlan(groundingText, options) {
    const { level, timeMinutes, language, topic, personality = 'friendly' } = options;

    const structureGuidance = pickStructureForTime(timeMinutes);
    const personalityPrompt = PERSONALITY_PROMPTS[personality] || PERSONALITY_PROMPTS.friendly;

    const systemPrompt = `You are an expert curriculum designer and teacher.
${personalityPrompt}
You design lesson plans that a human teacher would actually deliver: progressive, example-driven, and checked for understanding along the way.
You NEVER invent facts that are not supported by the provided material when material is given.
If no material is given, teach the topic from general, widely-accepted knowledge for the stated level.

IMPORTANT RULES:
1. Each section MUST have a unique 'id' field. Use format: "section_1", "section_2", etc.
2. Each section MUST have a 'title' field that is a short, descriptive name for that section.
3. The 'concept' field should be the single core idea being taught in that section.
4. The 'explanation' should be 3-6 sentences at the appropriate level.
5. The 'analogy' should be a concrete, real-world comparison.
6. The 'example' should be a worked example or practical demonstration.
7. The checkpoint question should test understanding of that specific section's concept.
`;

    const userPrompt = `
Design a lesson plan with these constraints:
- Topic: ${topic}
- Student level: ${level}
- Available time: ${timeMinutes} minutes
- Teaching language: ${language}
- Teacher personality: ${personality}
- Structural guidance for this time budget: ${structureGuidance}

${groundingText
    ? `Base the lesson ONLY on this source material. Do not add facts beyond it:\n"""${groundingText}"""`
    : "No source material was provided — teach from general knowledge appropriate to the level."
  }

Return JSON in exactly this shape. Use valid JSON only:
{
  "title": "string - the overall lesson title",
  "estimatedMinutes": number,
  "sections": [
    {
      "id": "section_1",
      "title": "string - short descriptive title for this section",
      "concept": "string - the single idea this section teaches",
      "explanation": "string - 3-6 sentences in ${language} at ${level} level",
      "analogy": "string - concrete real-world analogy",
      "example": "string - worked example",
      "visualType": "diagram | graph | code | timeline | none",
      "checkpointQuestion": {
        "question": "string - question testing this section's concept",
        "expectedAnswer": "string - what a correct answer looks like",
        "commonMisconception": "string - the most likely WRONG answer and why students give it"
      }
    }
  ]
}
`;

    return callGeminiJSON(userPrompt, systemPrompt);
}

function pickStructureForTime(minutes) {
    if (minutes <= 5) {
        return "Only 1-2 sections. High-level analogy-first explanation, no deep derivations, one lightweight checkpoint question at most.";
    }
    if (minutes <= 20) {
        return "3-4 sections. Each with one worked example and one checkpoint question.";
    }
    if (minutes <= 60) {
        return "5-7 sections. Deeper explanations, multiple examples per hard concept, a checkpoint question after every section, and a final assessment.";
    }
    return "Break this into a multi-day revision path: list sections as a sequence meant to be studied across several sessions, each with spaced checkpoints.";
}