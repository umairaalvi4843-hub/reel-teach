// src/media/didAvatarService.js — D-ID Avatar Service (Free Credits)
import axios from 'axios';

const DID_API_KEY = process.env.DID_API_KEY;
const DID_API_URL = 'https://api.d-id.com';

/**
 * Generate an avatar video with D-ID
 * @param {string} script - The text the avatar should say
 * @param {string} avatarId - Avatar ID (default: 'default')
 * @param {string} voiceId - Voice ID (default: 'en-US-female-1')
 * @returns {Promise<string>} - Video URL
 */
export async function generateAvatarVideo(script, avatarId = 'default', voiceId = 'en-US-female-1') {
    try {
        if (!DID_API_KEY) {
            throw new Error('DID_API_KEY is not set in .env file');
        }

        const payload = {
            script: {
                type: 'text',
                input: script,
            },
            config: {
                fluent: false,
                stitch: true,
            },
            source_url: 'https://d-id-public-bucket.s3.us-west-2.amazonaws.com/avatar/default.jpg',
            voice: {
                type: 'text',
                voice_id: voiceId,
                input_text: script,
            },
        };

        console.log('🎬 Generating D-ID avatar video...');

        const response = await axios.post(
            `${DID_API_URL}/talks`,
            payload,
            {
                headers: {
                    'Authorization': `Basic ${Buffer.from(DID_API_KEY).toString('base64')}`,
                    'Content-Type': 'application/json',
                },
            }
        );

        const talkId = response.data.id;
        console.log(`✅ Video generation started. Talk ID: ${talkId}`);

        // Poll for completion
        const videoUrl = await pollDIDStatus(talkId);
        return videoUrl;
    } catch (error) {
        console.error('D-ID Avatar Error:', error.response?.data || error.message);
        throw new Error(`D-ID avatar generation failed: ${error.response?.data?.message || error.message}`);
    }
}

/**
 * Poll D-ID for video completion
 */
async function pollDIDStatus(talkId, maxAttempts = 60, interval = 5000) {
    for (let i = 0; i < maxAttempts; i++) {
        const response = await axios.get(
            `${DID_API_URL}/talks/${talkId}`,
            {
                headers: {
                    'Authorization': `Basic ${Buffer.from(DID_API_KEY).toString('base64')}`,
                },
            }
        );

        const status = response.data.status;
        console.log(`⏳ D-ID status: ${status} (attempt ${i + 1}/${maxAttempts})`);

        if (status === 'done') {
            return response.data.result_url;
        }

        if (status === 'error') {
            throw new Error(`D-ID generation failed: ${response.data.error || 'Unknown error'}`);
        }

        await new Promise(resolve => setTimeout(resolve, interval));
    }

    throw new Error('D-ID video generation timed out');
}

/**
 * Get available avatars (D-ID free avatars)
 */
export function getAvailableAvatars() {
    return [
        { id: 'default', name: 'Default Avatar', url: 'https://d-id-public-bucket.s3.us-west-2.amazonaws.com/avatar/default.jpg' },
        { id: 'female-1', name: 'Female Avatar 1', url: 'https://d-id-public-bucket.s3.us-west-2.amazonaws.com/avatar/female-1.jpg' },
        { id: 'male-1', name: 'Male Avatar 1', url: 'https://d-id-public-bucket.s3.us-west-2.amazonaws.com/avatar/male-1.jpg' },
    ];
}

/**
 * Get available voices (D-ID free voices)
 */
export function getAvailableVoices() {
    return [
        { id: 'en-US-female-1', name: 'US Female 1' },
        { id: 'en-US-female-2', name: 'US Female 2' },
        { id: 'en-US-male-1', name: 'US Male 1' },
        { id: 'en-US-male-2', name: 'US Male 2' },
        { id: 'en-UK-female-1', name: 'UK Female 1' },
        { id: 'en-UK-male-1', name: 'UK Male 1' },
    ];
}

/**
 * Generate videos for a full lesson
 */
export async function generateLessonVideos(lessonPlan) {
    const videoResults = [];

    for (const section of lessonPlan.sections) {
        let script = section.explanation || '';
        if (section.analogy) {
            script += ` Here's a way to think about it: ${section.analogy}`;
        }
        if (section.example) {
            script += ` For example: ${section.example}`;
        }

        try {
            const videoUrl = await generateAvatarVideo(script);
            videoResults.push({
                sectionId: section.id,
                title: section.title,
                script: script,
                videoUrl: videoUrl,
            });
            console.log(`✅ D-ID video generated for section: ${section.title}`);
        } catch (error) {
            console.error(`❌ Failed for section ${section.title}:`, error.message);
            videoResults.push({
                sectionId: section.id,
                title: section.title,
                script: script,
                videoUrl: null,
                error: error.message,
            });
        }

        // Small delay between videos
        await new Promise(resolve => setTimeout(resolve, 3000));
    }

    return videoResults;
}

export default {
    generateAvatarVideo,
    getAvailableAvatars,
    getAvailableVoices,
    generateLessonVideos,
};