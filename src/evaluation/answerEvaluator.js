// src/evaluation/answerEvaluator.js — Enhanced Misconception Detection
import { callGeminiJSON } from "../geminiClient.js";

export async function evaluateAnswer({
  concept,
  question,
  expectedAnswer,
  commonMisconception,
  studentAnswer,
  language,
  previousAnalogy,
  previousAttempts = [],
}) {
  // Check for "I don't know" patterns
  const idkPatterns = [
    /don't know/i,
    /dont know/i,
    /not sure/i,
    /unsure/i,
    /no idea/i,
    /pass/i,
    /skip/i,
    /\?/,
  ];
  
  const isIDK = idkPatterns.some(pattern => pattern.test(studentAnswer));
  
  // Check if answer is completely empty or too short
  const isTooShort = studentAnswer.trim().length < 2;
  
  // Count previous attempts for this concept
  const previousAttemptsForConcept = previousAttempts.filter(
    a => a.concept === concept
  );
  const attemptCount = previousAttemptsForConcept.length;
  
  // Build context about previous attempts
  let attemptContext = '';
  if (attemptCount > 0) {
    const lastAttempt = previousAttemptsForConcept[attemptCount - 1];
    attemptContext = `
      This is attempt #${attemptCount + 1} for this concept.
      Previous attempt: "${lastAttempt.studentAnswer}" → ${lastAttempt.verdict}
      Previous analogy used: ${lastAttempt.analogyUsed || 'none'}
    `;
  }
  
  // Handle "I don't know" specially
  if (isIDK) {
    return {
      verdict: "incorrect",
      confidence: "high",
      diagnosedMisconception: "Student expressed uncertainty or lack of knowledge",
      reExplanation: `That's okay! Let me explain this differently. 

${concept} is about ${explainConceptSimply(concept)}.

Think of it this way: ${getSimpleAnalogy(concept)}.

Take your time — I'll ask you a simpler question next.`,
      followUpQuestion: `Let's start with something easier. What do you already know about ${concept}?`,
      encouragement: "It's completely fine to not know something — that's what I'm here for! Let's try a different approach.",
      isIDK: true,
    };
  }
  
  // Handle very short answers
  if (isTooShort) {
    return {
      verdict: "incorrect",
      confidence: "medium",
      diagnosedMisconception: "Answer was too brief to assess understanding",
      reExplanation: `I need a bit more detail to understand what you're thinking. 

Let me rephrase the question: ${rephraseQuestion(question)}.

Try answering in a full sentence — it helps me figure out what you understand.`,
      followUpQuestion: rephraseQuestion(question),
      encouragement: "Don't worry about being perfect — just tell me what you think in your own words.",
      isTooShort: true,
    };
  }
  
  // Build the main prompt with context
  const systemPrompt = `You are a patient, perceptive teacher evaluating a student's answer.
You do not just mark answers right or wrong. When an answer is wrong, you diagnose the
SPECIFIC underlying misunderstanding, and you never simply repeat the same explanation.
If you are not confident in your diagnosis, say so honestly instead of guessing.

IMPORTANT: 
- If the answer is partially correct, mark it as "partially_correct" and explain what they got right.
- If the answer is wrong but close, explain the specific confusion.
- If the student is repeating the same mistake, use a COMPLETELY DIFFERENT analogy.
- Be specific about what the student understood correctly, even if the overall answer is wrong.

${attemptCount > 0 ? 'The student has attempted this before. Use a new approach.' : ''}`;

  const userPrompt = `
Concept being tested: ${concept}
Question asked: ${question}
What a correct answer looks like: ${expectedAnswer}
A commonly seen wrong answer and why students give it: ${commonMisconception}
The analogy already used to teach this concept: ${previousAnalogy || 'none'}
${attemptContext}

Student's actual answer: "${studentAnswer}"

Respond in ${language}. Return JSON in exactly this shape:
{
  "verdict": "correct | partially_correct | incorrect",
  "confidence": "high | medium | low",
  "diagnosedMisconception": "string - the SPECIFIC misunderstanding this answer reveals, or 'none' if correct",
  "reExplanation": "string - if incorrect or partially correct, a fresh explanation using a DIFFERENT analogy than the one already used. Empty string if fully correct.",
  "followUpQuestion": "string - a new, slightly different question to re-check understanding. Empty string if fully correct.",
  "encouragement": "string - one short, honest, non-generic sentence acknowledging what the student got right or attempted",
  "whatTheyGotRight": "string - specific things the student understood correctly, or 'nothing' if completely wrong"
}
`;

  return callGeminiJSON(userPrompt, systemPrompt);
}

// ===== Helper Functions for "I Don't Know" Responses =====

function explainConceptSimply(concept) {
  const simpleExplanations = {
    "Ohm's Law": "the relationship between voltage, current, and resistance in an electrical circuit",
    "Machine Learning": "teaching computers to learn from data without being explicitly programmed",
    "React": "a library for building interactive user interfaces",
    "Photosynthesis": "how plants convert sunlight into energy",
  };
  return simpleExplanations[concept] || `the concept of ${concept}`;
}

function getSimpleAnalogy(concept) {
  const analogies = {
    "Ohm's Law": "Think of it like water flowing through a pipe — voltage is the pressure, current is the flow, and resistance is how narrow the pipe is",
    "Machine Learning": "Like learning to recognize your friend's face after seeing them many times — the AI looks for patterns in data",
    "React": "Like building with LEGO blocks — each component is a building block you can reuse",
    "Photosynthesis": "Like a tiny solar panel in a leaf — it captures sunlight and turns it into food",
  };
  return analogies[concept] || `Think of ${concept} as a simple idea: ${concept} is about understanding how things work together.`;
}

function rephraseQuestion(question) {
  // Simple rephrasing — in production, you could use Gemini for this
  if (question.includes('what')) {
    return question.replace('what', 'Can you describe');
  }
  if (question.includes('how')) {
    return question.replace('how', 'In your own words, can you explain how');
  }
  return `Could you tell me more about ${question.toLowerCase().replace('?', '')}?`;
}