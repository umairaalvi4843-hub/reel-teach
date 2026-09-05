# 🎬 ReelTeach

**Your AI Teacher, One Reel at a Time**

ReelTeach is an AI-powered virtual teacher that transforms any educational content — books, PDFs, notes, or simply a topic — into a personalized, interactive, video-based learning experience. It combines large language models, voice synthesis, and an animated avatar to deliver lessons that feel like a real teacher.

Built for the **AI Innovation Hackathon 2026**.

---

## 📌 Overview

ReelTeach is not a chatbot. It's a complete AI teaching assistant that:

- **Understands** uploaded educational material (PDF, DOCX, PPTX, TXT)
- **Plans** structured, progressive lessons based on your topic
- **Explains** concepts with analogies and examples
- **Questions** you at key moments to check understanding
- **Adapts** when you get something wrong — with a fresh analogy
- **Tracks** your progress and recommends what to study next

---

## 🚀 Key Features

### Core Teaching Engine

| Feature | Description |
|---------|-------------|
| **Document Processing** | Upload PDF, TXT, DOCX, PPTX — text is extracted and used as knowledge context |
| **Topic-Based Teaching** | Enter any topic and get a structured lesson plan |
| **Lesson Planning** | AI generates progressive, example-driven lessons |
| **Personalization** | Adjust level (beginner/intermediate/advanced), time (5/20/60 mins), language (English/Hindi/Hinglish) |
| **Teacher Personalities** | Choose between Friendly, Strict Professor, or Storyteller styles |

### Interactive Learning

| Feature | Description |
|---------|-------------|
| **Misconception Detection** | When wrong, the AI diagnoses your misunderstanding and re-explains with a different analogy |
| **Checkpoint Questions** | Each section includes a question to test understanding |
| **Adaptive Teaching** | If struggling, the AI simplifies and tries new approaches |
| **Follow-up Questions** | Additional practice on difficult concepts |

### Video & Voice Experience

| Feature | Description |
|---------|-------------|
| **Animated Avatar** | Human-like avatar with mouth movement in sync with speech |
| **Natural Voice** | ElevenLabs integration + browser TTS fallback |
| **Voice Selection** | Choose from multiple voices |
| **Play Controls** | Play individual sections or entire lessons continuously |

### Advanced Features

| Feature | Description |
|---------|-------------|
| **Flashcards** | Auto-generated flashcards from lesson content |
| **Learning Analytics** | Track accuracy, performance, and common misconceptions |
| **Revision Mode** | Focus only on concepts you struggled with |
| **Progress Tracking** | Sidebar timeline with visual markers |

---

## 🛠️ Technology Stack

| Component | Technology |
|-----------|------------|
| **Backend** | Node.js, Express |
| **AI/LLM** | Google Gemini 3.5 Flash Lite |
| **Vector Search** | Keyword-based retrieval with RAG |
| **Voice** | ElevenLabs API + Browser Speech Synthesis |
| **Frontend** | Vanilla JS, HTML5, CSS3 |
| **Avatar** | SVG + CSS animations |
| **File Parsing** | pdf-parse, mammoth, adm-zip |

---

## 🧠 Misconception Detection — The Differentiator

Unlike basic chatbots, ReelTeach doesn't just mark answers right or wrong:

1. **Analyzes** the misunderstanding behind a wrong answer
2. **Provides** a fresh explanation using a different analogy
3. **Asks** a follow-up question to confirm understanding
4. **Updates** the sidebar with a visual rust dot showing where you struggled

This mirrors how a real teacher responds to student mistakes.

---

## 📦 Installation

### Prerequisites

- Node.js (v18+)
- npm or yarn

### Setup

```bash
# Clone the repository
git clone https://github.com/yourusername/reel-teach.git
cd reel-teach

# Install dependencies
npm install

# Create .env file
cp .env.example .env

# Add your API keys to .env
# GEMINI_API_KEY=your_gemini_key
# ELEVENLABS_API_KEY=your_elevenlabs_key

# Start the server
npm start
```

Open `http://localhost:3000` in your browser.

---

## 🔑 API Keys Required

| Service | Purpose | Get It From |
|---------|---------|-------------|
| **Gemini API** | Lesson planning, evaluation, report generation | [Google AI Studio](https://aistudio.google.com/) |
| **ElevenLabs API** | High-quality voice synthesis (optional) | [ElevenLabs](https://elevenlabs.io/) |

---

## 📁 Project Structure

```
reel-teach/
├── public/
│   ├── index.html          # Main HTML
│   ├── style.css           # Complete styling
│   └── app.js              # Frontend logic
├── src/
│   ├── geminiClient.js     # Gemini API integration
│   ├── evaluation/
│   │   ├── answerEvaluator.js    # Misconception detection
│   │   └── reportGenerator.js    # Learning reports
│   ├── ingestion/
│   │   ├── documentParser.js     # PDF/TXT/DOCX/PPTX parsing
│   │   └── chunker.js            # Text chunking
│   ├── planner/
│   │   └── lessonPlanner.js      # Lesson plan generation
│   └── rag/
│       └── retriever.js          # RAG retrieval
├── server.js               # Express server
├── package.json
└── .env                    # API keys
```

---

## 🧪 Testing

### Test Voice
```bash
# In browser console
testSound()
```

### Test API Endpoints
```bash
# Generate lesson
curl -X POST http://localhost:3000/api/lesson \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"test","topic":"Ohms Law","level":"beginner","timeMinutes":20,"language":"English"}'

# Evaluate answer
curl -X POST http://localhost:3000/api/answer \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"test","sectionId":"section_1","studentAnswer":"Current decreases"}'

# Generate report
curl -X POST http://localhost:3000/api/report \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"test"}'
```

---

## 🎓 Hackathon Submission

### Evaluation Criteria

| Criteria | Weight |
|----------|--------|
| Human-Like Teaching & Adaptation | 20% |
| AI/ML & LLM Implementation | 15% |
| RAG & Knowledge Grounding | 15% |
| AI Teaching Video Generation | 15% |
| Multilingual Capability | 10% |
| Voice & AI Avatar | 10% |
| Innovation & Originality | 5% |
| User Experience & Interface | 5% |
| Documentation & Technical Presentation | 5% |

### Mandatory Requirements (All Met)

- Learning from uploaded material
- Topic-based teaching
- AI-generated lesson structure
- Personalized teaching
- Human-like teaching interaction
- Video-based AI Teacher presentation
- AI voice
- Human-like AI avatar
- Multilingual capability
- Student questioning and assessment
- Adaptive response to student performance
- Working application/prototype

---

## 📝 License

MIT

---

## 🙏 Acknowledgments

- Google Gemini API for AI capabilities
- ElevenLabs for voice synthesis
- Built for the AI Innovation Hackathon 2026

---

**Made with ❤️ by Umaira Alvi**
