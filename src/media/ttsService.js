// src/media/ttsService.js — ElevenLabs Text-to-Speech
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_API_URL = 'https://api.elevenlabs.io/v1';

// Voice options
const VOICE_IDS = {
  // Free voices available in ElevenLabs
  'Rachel': '21m00Tcm4TlvDq8ikWAM',     // Female, warm
  'Adam': 'pNInz6obpgDQGcFmaJgB',       // Male, deep
  'Bella': 'EXAVITQu4L4Kx6VpL',         // Female, sweet
  'Josh': 'TxGEqnHWrfWFTfGW9XjX',       // Male, clear
  'Emily': 'Lcfc7NnG7Lv9Aqz6sXr4',      // Female, friendly
  'Default': '21m00Tcm4TlvDq8ikWAM',    // Rachel (default)
};

const DEFAULT_VOICE = 'Default';

/**
 * Convert text to speech using ElevenLabs
 * @param {string} text - Text to convert to speech
 * @param {string} voiceId - Voice ID to use (from VOICE_IDS)
 * @param {string} outputPath - Where to save the audio file
 * @returns {Promise<string>} - Path to the generated audio file
 */
export async function textToSpeech(text, voiceId = DEFAULT_VOICE, outputPath = null) {
  try {
    if (!ELEVENLABS_API_KEY) {
      throw new Error('ELEVENLABS_API_KEY is not set in .env file');
    }

    // Use the voice ID from our mapping, or fallback to default
    const voice = VOICE_IDS[voiceId] || VOICE_IDS[DEFAULT_VOICE];

    // Prepare the request
    const url = `${ELEVENLABS_API_URL}/text-to-speech/${voice}`;
    
    const requestData = {
      text: text,
      model_id: 'eleven_monolingual_v1',
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
      },
    };

    console.log(`🎤 Generating speech for ${text.length} characters...`);

    // Make the API call
    const response = await axios({
      method: 'POST',
      url: url,
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': ELEVENLABS_API_KEY,
      },
      data: requestData,
      responseType: 'arraybuffer',
    });

    // Determine output path
    if (!outputPath) {
      const audioDir = path.join(__dirname, '../../public/audio');
      if (!fs.existsSync(audioDir)) {
        fs.mkdirSync(audioDir, { recursive: true });
      }
      const timestamp = Date.now();
      outputPath = path.join(audioDir, `speech_${timestamp}.mp3`);
    }

    // Save the audio file
    fs.writeFileSync(outputPath, Buffer.from(response.data));
    console.log(`✅ Audio saved to ${outputPath}`);

    // Return the relative path for the frontend
    const relativePath = path.relative(path.join(__dirname, '../../public'), outputPath);
    return `/${relativePath.replace(/\\/g, '/')}`;
  } catch (error) {
    console.error('ElevenLabs TTS Error:', error.response?.data || error.message);
    throw new Error(`TTS failed: ${error.response?.data?.detail?.message || error.message}`);
  }
}

/**
 * Generate audio for multiple sections of a lesson
 * @param {Object} lessonPlan - The lesson plan object
 * @param {string} voiceId - Voice ID to use
 * @returns {Promise<Array>} - Array of audio file paths
 */
export async function generateLessonAudio(lessonPlan, voiceId = DEFAULT_VOICE) {
  const audioFiles = [];
  
  for (const section of lessonPlan.sections) {
    // Combine explanation and analogy for a natural teaching voice
    let text = section.explanation || '';
    if (section.analogy) {
      text += `\n\nHere's a way to think about it: ${section.analogy}`;
    }
    if (section.example) {
      text += `\n\nFor example: ${section.example}`;
    }
    
    const audioPath = await textToSpeech(text, voiceId);
    audioFiles.push({
      sectionId: section.id,
      audioPath: audioPath,
      text: text,
    });
  }
  
  return audioFiles;
}

/**
 * Get a list of available voices (for UI)
 */
export async function getAvailableVoices() {
  try {
    if (!ELEVENLABS_API_KEY) {
      throw new Error('ELEVENLABS_API_KEY is not set');
    }

    const response = await axios({
      method: 'GET',
      url: `${ELEVENLABS_API_URL}/voices`,
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY,
      },
    });

    return response.data.voices.map(voice => ({
      id: voice.voice_id,
      name: voice.name,
      category: voice.category,
    }));
  } catch (error) {
    console.error('Error fetching voices:', error.message);
    // Return our default voices as fallback
    return Object.entries(VOICE_IDS).map(([name, id]) => ({
      id,
      name,
      category: 'default',
    }));
  }
}

export default { textToSpeech, generateLessonAudio, getAvailableVoices, VOICE_IDS };