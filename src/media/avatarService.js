// src/media/avatarService.js
import axios from 'axios';

const HEYGEN_API_KEY = process.env.HEYGEN_API_KEY;

export async function generateAvatarVideo(script, audioUrl, avatarId = 'default') {
    const response = await axios.post('https://api.heygen.com/v2/video/generate', {
        avatar_id: avatarId,
        audio_url: audioUrl,
        text: script,
        // ... other settings
    }, {
        headers: { 'X-Api-Key': HEYGEN_API_KEY }
    });
    return response.data.data.video_url;
}