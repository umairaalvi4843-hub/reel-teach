// server.js — Load .env FIRST, before ANY imports
import dotenv from 'dotenv';
dotenv.config();

// NOW import everything else (after .env is loaded)
import express from "express";
import cors from "cors";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";
import fs from "fs";

import { parseDocument } from "./src/ingestion/documentParser.js";
import { chunkText } from "./src/ingestion/chunker.js";
import { retrieveRelevantChunks } from "./src/rag/retriever.js";
import { generateLessonPlan } from "./src/planner/lessonPlanner.js";
import { evaluateAnswer } from "./src/evaluation/answerEvaluator.js";
import { generateReport } from "./src/evaluation/reportGenerator.js";
import { callGeminiJSON } from "./src/geminiClient.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

// ===== Multer Configuration =====
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'application/pdf',
      'text/plain',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // DOCX
      'application/vnd.openxmlformats-officedocument.presentationml.presentation' // PPTX
    ];
    const ext = path.extname(file.originalname).toLowerCase();
    const allowedExts = ['.pdf', '.txt', '.docx', '.pptx'];
    
    if (allowedTypes.includes(file.mimetype) || allowedExts.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${ext}. Please upload PDF, TXT, DOCX, or PPTX.`));
    }
  }
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ===== In-Memory Session Store =====
const sessions = {};

// ===== D-ID Configuration =====
const DID_API_KEY = process.env.DID_API_KEY;
const DID_BASE_URL = 'https://api.d-id.com';

// Helper: Get D-ID auth header
function getDidAuthHeader() {
    if (!DID_API_KEY) {
        throw new Error('DID_API_KEY is not set in the environment');
    }
    const encoded = Buffer.from(DID_API_KEY).toString('base64');
    return `Basic ${encoded}`;
}

// ===== API Routes =====

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'ReelTeach is running!' });
});

// Upload endpoint
app.post("/api/upload", upload.single("file"), async (req, res) => {
  try {
    let chunks = [];
    let filename = '';
    
    if (req.file) {
      filename = req.file.originalname;
      const text = await parseDocument(req.file.path, req.file.originalname);
      chunks = chunkText(text);
      
      // Clean up uploaded file after parsing
      fs.unlinkSync(req.file.path);
    }

    const sessionId = randomUUID();
    sessions[sessionId] = { 
      chunks, 
      log: [],
      filename: filename,
      createdAt: Date.now()
    };

    res.json({ 
      sessionId, 
      chunkCount: chunks.length,
      filename: filename
    });
  } catch (err) {
    console.error('Upload error:', err);
    // Clean up file if it exists
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ error: err.message });
  }
});

// Generate lesson plan
app.post("/api/lesson", async (req, res) => {
  try {
    const { sessionId, topic, level, timeMinutes, language, personality } = req.body;
    
    if (!sessionId) {
      return res.status(400).json({ error: "sessionId is required" });
    }
    
    if (!topic) {
      return res.status(400).json({ error: "topic is required" });
    }

    const session = sessions[sessionId] || { chunks: [], log: [] };
    if (!sessions[sessionId]) sessions[sessionId] = session;

    let groundingText = "";
    if (session.chunks && session.chunks.length > 0) {
      const relevant = retrieveRelevantChunks(session.chunks, topic, 5);
      groundingText = relevant.map((c) => c.content).join("\n\n");
    }

    const plan = await generateLessonPlan(groundingText, {
      level: level || 'intermediate',
      timeMinutes: timeMinutes || 20,
      language: language || 'English',
      topic,
      personality: personality || 'friendly'
    });

    session.plan = plan;
    session.topic = topic;
    session.language = language || 'English';

    res.json(plan);
  } catch (err) {
    console.error('Lesson generation error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Evaluate answer — Enhanced with misconception detection and attempt tracking
app.post("/api/answer", async (req, res) => {
  try {
    const { sessionId, sectionId, studentAnswer } = req.body;
    const session = sessions[sessionId];
    
    if (!session || !session.plan) {
      return res.status(400).json({ error: "No active lesson for this session." });
    }

    const section = session.plan.sections.find((s) => s.id === sectionId);
    if (!section) {
      return res.status(400).json({ error: "Unknown section id." });
    }

    // Get previous attempts for this concept
    const previousAttempts = session.log
      .filter(entry => entry.concept === section.concept)
      .map(entry => ({
        studentAnswer: entry.studentAnswer,
        verdict: entry.verdict,
        analogyUsed: entry.analogyUsed || section.analogy,
      }));

    // Get the last analogy used for this concept (if any)
    const lastLogEntry = session.log
      .filter(entry => entry.concept === section.concept)
      .slice(-1)[0];
    const previousAnalogy = lastLogEntry?.newAnalogy || section.analogy;

    const evaluation = await evaluateAnswer({
      concept: section.concept,
      question: section.checkpointQuestion.question,
      expectedAnswer: section.checkpointQuestion.expectedAnswer,
      commonMisconception: section.checkpointQuestion.commonMisconception,
      studentAnswer,
      language: session.language || 'English',
      previousAnalogy: previousAnalogy,
      previousAttempts: previousAttempts,
    });

    // Store the attempt with full context
    const logEntry = {
      sectionId: sectionId,
      concept: section.concept,
      studentAnswer: studentAnswer,
      verdict: evaluation.verdict,
      diagnosedMisconception: evaluation.diagnosedMisconception,
      analogyUsed: section.analogy,
      newAnalogy: evaluation.reExplanation || null,
      encouragement: evaluation.encouragement || null,
      whatTheyGotRight: evaluation.whatTheyGotRight || null,
      timestamp: Date.now(),
    };
    session.log.push(logEntry);

    res.json(evaluation);
  } catch (err) {
    console.error('Answer evaluation error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Generate report
app.post("/api/report", async (req, res) => {
  try {
    const { sessionId } = req.body;
    const session = sessions[sessionId];
    
    if (!session) {
      return res.status(400).json({ error: "Unknown session." });
    }
    
    if (!session.log || session.log.length === 0) {
      return res.status(400).json({ error: "No answers recorded for this session." });
    }

    const report = await generateReport(
      session.topic || 'Lesson', 
      session.log, 
      session.language || 'English'
    );
    
    res.json(report);
  } catch (err) {
    console.error('Report generation error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// ADVANCED FEATURES — FLASHCARDS, ANALYTICS, REVISION
// ============================================================

// Generate flashcards from lesson content
app.post('/api/flashcards', async (req, res) => {
    try {
        const { sessionId } = req.body;
        const session = sessions[sessionId];
        
        if (!session || !session.plan) {
            return res.status(400).json({ error: 'No active lesson' });
        }

        // Extract all explanations from sections
        const content = session.plan.sections
            .map(s => s.explanation || '')
            .join('\n\n');

        const prompt = `Extract 5-8 key terms or concepts from this text and create flashcards. For each, provide:
1. The term/concept
2. A clear, simple definition

Return JSON in this exact format:
{
  "flashcards": [
    { "term": "string", "definition": "string" }
  ]
}

Text: ${content}`;

        const result = await callGeminiJSON(prompt);
        res.json(result);
    } catch (err) {
        console.error('Flashcard error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Get learning analytics for a session
app.get('/api/analytics/:sessionId', (req, res) => {
    const session = sessions[req.params.sessionId];
    if (!session) {
        return res.status(404).json({ error: 'Session not found' });
    }
    
    const log = session.log || [];
    const total = log.length;
    const correct = log.filter(e => e.verdict === 'correct').length;
    const incorrect = log.filter(e => e.verdict === 'incorrect').length;
    const partial = log.filter(e => e.verdict === 'partial').length;
    
    // Find common mistakes
    const mistakes = {};
    log.forEach(e => {
        if (e.diagnosedMisconception && e.diagnosedMisconception !== 'none') {
            const key = e.diagnosedMisconception;
            mistakes[key] = (mistakes[key] || 0) + 1;
        }
    });
    
    const commonMistakes = Object.entries(mistakes)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([mistake, count]) => ({ mistake, count }));
    
    res.json({
        totalQuestions: total,
        correct,
        incorrect,
        partial,
        accuracy: total > 0 ? Math.round((correct / total) * 100) : 0,
        commonMistakes,
        sections: session.plan?.sections?.map(s => ({
            title: s.title,
            concept: s.concept,
            answered: log.some(e => e.concept === s.concept),
            correct: log.some(e => e.concept === s.concept && e.verdict === 'correct')
        })) || []
    });
});

// Generate revision lesson focusing on weak areas
app.post('/api/revision', async (req, res) => {
    try {
        const { sessionId } = req.body;
        const session = sessions[sessionId];
        
        if (!session || !session.plan) {
            return res.status(400).json({ error: 'No active lesson' });
        }
        
        // Find weak concepts (where student got it wrong)
        const weakConcepts = session.log
            .filter(e => e.verdict === 'incorrect' || e.verdict === 'partial')
            .map(e => e.concept);
        
        if (weakConcepts.length === 0) {
            return res.json({ message: 'No weak concepts found. Great job!' });
        }
        
        // Generate revision content for weak concepts
        const prompt = `Create a brief revision lesson for these concepts: ${weakConcepts.join(', ')}
        Focus on:
        1. A fresh explanation (different from the original)
        2. A new analogy
        3. A practice question
        
        Return JSON:
        {
          "title": "Revision: ${weakConcepts.join(', ')}",
          "sections": [
            {
              "concept": "string",
              "explanation": "string (fresh perspective)",
              "analogy": "string (different analogy)",
              "practiceQuestion": "string"
            }
          ]
        }`;
        
        const revision = await callGeminiJSON(prompt);
        res.json(revision);
    } catch (err) {
        console.error('Revision error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ============================================================
// VOICE ROUTES (ElevenLabs)
// ============================================================

// Generate voice audio for a section
app.post('/api/voice/generate', async (req, res) => {
    try {
        const { text, voiceId, sectionId } = req.body;
        
        if (!text) {
            return res.status(400).json({ error: 'text is required' });
        }

        // For now, return a mock response since we're using browser TTS
        // If you have ElevenLabs set up, replace this with actual TTS
        res.json({ 
            success: true, 
            audioPath: null,
            message: 'Using browser TTS',
            sectionId: sectionId || null
        });
    } catch (err) {
        console.error('Voice generation error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Generate voice for full lesson
app.post('/api/voice/generate-lesson', async (req, res) => {
    try {
        const { sessionId, voiceId } = req.body;
        const session = sessions[sessionId];
        
        if (!session || !session.plan) {
            return res.status(400).json({ error: 'No active lesson' });
        }

        // Return mock audio files
        const audioFiles = session.plan.sections.map(section => ({
            sectionId: section.id,
            audioPath: null,
            text: section.explanation || ''
        }));
        
        res.json({ 
            success: true, 
            audioFiles: audioFiles,
            count: audioFiles.length,
            message: 'Using browser TTS'
        });
    } catch (err) {
        console.error('Lesson voice generation error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Get available voices
app.get('/api/voice/voices', async (req, res) => {
    res.json({ voices: [
        { id: 'Rachel', name: 'Rachel', category: 'default' },
        { id: 'Adam', name: 'Adam', category: 'default' },
        { id: 'Bella', name: 'Bella', category: 'default' },
        { id: 'Josh', name: 'Josh', category: 'default' },
        { id: 'Emily', name: 'Emily', category: 'default' }
    ] });
});

// ============================================================
// D-ID AVATAR ROUTES (Optional)
// ============================================================

app.post('/api/generate-video', async (req, res) => {
    res.json({ 
        success: true, 
        talkId: 'mock-talk-id',
        message: 'Avatar video generation not configured'
    });
});

app.get('/api/video-status/:talkId', async (req, res) => {
    res.json({ 
        status: 'done', 
        resultUrl: null,
        message: 'Avatar video not configured'
    });
});

// ============================================================
// UTILITY ROUTES
// ============================================================

// Get session stats
app.get("/api/session/:sessionId", (req, res) => {
  const session = sessions[req.params.sessionId];
  if (!session) {
    return res.status(404).json({ error: "Session not found" });
  }
  
  const totalSections = session.plan?.sections?.length || 0;
  const answeredSections = session.log.length;
  const score = answeredSections > 0 
    ? Math.round((session.log.filter(e => e.verdict === 'correct').length / answeredSections) * 100)
    : 0;
  
  const misconceptions = session.log
    .filter(e => e.diagnosedMisconception && e.diagnosedMisconception !== 'none')
    .map(e => e.diagnosedMisconception);
  
  res.json({
    topic: session.topic,
    totalSections,
    answeredSections,
    score,
    misconceptions: misconceptions,
    log: session.log || [],
    hasPlan: session.plan ? true : false,
    filename: session.filename || null
  });
});

// Get all sessions (for debugging)
app.get("/api/sessions", (req, res) => {
  const sessionList = Object.keys(sessions).map(id => ({
    id,
    topic: sessions[id].topic || 'untitled',
    answered: sessions[id].log?.length || 0,
    createdAt: sessions[id].createdAt || Date.now()
  }));
  res.json(sessionList);
});

// Debug endpoint
app.get("/api/debug/session/:sessionId", (req, res) => {
  const session = sessions[req.params.sessionId];
  if (!session) {
    return res.status(404).json({ error: "Session not found" });
  }
  
  const sections = session.plan?.sections?.map(s => ({
    id: s.id,
    title: s.title,
    concept: s.concept
  })) || [];
  
  res.json({
    sessionId: req.params.sessionId,
    topic: session.topic,
    sections: sections,
    log: session.log || [],
    totalLogs: session.log?.length || 0
  });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🎬 ReelTeach running at http://localhost:${PORT}`);
  console.log(`🤖 Using Gemini 3.5 Flash Lite`);
  console.log(`📁 Uploads folder: ${uploadsDir}`);
  console.log(`📊 Server ready for requests`);
});