// public/app.js — FINAL VERSION: all features preserved + audio reliability fixes
let sessionId = null;
let lessonPlan = null;
let currentSectionIndex = 0;
let answers = [];
let isAnswering = false;
let isSpeaking = false;
let stopRequested = false;
let currentUtterance = null; // Safari GC fix: keep a strong reference alive
let keepAliveTimer = null;   // Chrome 15s-silence bug fix
let audioUnlocked = false;

const API_BASE = '';

// DOM Elements
const setupScreen = document.getElementById('setupScreen');
const lessonScreen = document.getElementById('lessonScreen');
const loadingOverlay = document.getElementById('loadingOverlay');
const loadingMessage = document.getElementById('loadingMessage');

const topicInput = document.getElementById('topicInput');
const fileInput = document.getElementById('fileInput');
const fileName = document.getElementById('fileName');
const levelInput = document.getElementById('levelInput');
const timeInput = document.getElementById('timeInput');
const languageInput = document.getElementById('languageInput');
const personalityInput = document.getElementById('personalityInput');
const startBtn = document.getElementById('startBtn');

const lessonTitle = document.getElementById('lessonTitle');
const lessonProgressText = document.getElementById('lessonProgressText');
const lessonStatus = document.getElementById('lessonStatus');
const lessonContent = document.getElementById('lessonContent');
const reportContainer = document.getElementById('reportContainer');

// ============================================================
// AUDIO UNLOCK — fixes "silent on both Chrome and Safari"
// Both browsers can require a direct user tap to register with
// their audio-permission system before speechSynthesis will ever
// produce sound, even though no error is thrown. This one-time
// banner guarantees that tap happens before anything else runs.
// ============================================================

function injectAudioUnlockBanner() {
    if (document.getElementById('audioUnlockBanner')) return;
    if (!window.speechSynthesis) return;

    const banner = document.createElement('div');
    banner.id = 'audioUnlockBanner';
    banner.style.cssText = `
        position: fixed; inset: 0; z-index: 5000;
        background: rgba(30,26,43,0.85); backdrop-filter: blur(4px);
        display: flex; align-items: center; justify-content: center;
        font-family: 'Inter', sans-serif;
    `;
    banner.innerHTML = `
        <div style="background:white; border-radius:20px; padding:40px; max-width:360px; text-align:center; box-shadow:0 8px 40px rgba(0,0,0,0.3);">
            <div style="font-size:2.5rem; margin-bottom:12px;">🔊</div>
            <h2 style="font-family:'Fraunces',serif; font-size:1.3rem; margin-bottom:10px; color:#1e1a2b;">Enable Voice</h2>
            <p style="color:#6a6578; font-size:0.9rem; margin-bottom:20px;">
                Tap below once to allow ReelTeach to speak lessons aloud in this browser.
            </p>
            <button id="unlockAudioBtn" style="width:100%; padding:14px; border:none; border-radius:50px; background:#1e1a2b; color:#f7f2eb; font-weight:600; font-size:1rem; cursor:pointer;">
                Enable Audio
            </button>
        </div>
    `;
    document.body.appendChild(banner);

    document.getElementById('unlockAudioBtn').addEventListener('click', () => {
        unlockAudio();
        banner.remove();
    });
}

function unlockAudio() {
    if (!window.speechSynthesis || audioUnlocked) return;
    try {
        // A near-silent, near-instant utterance spoken directly inside a
        // real click handler. This is what actually "unlocks" the audio
        // permission in both Chrome and Safari for all future calls,
        // including ones triggered later from timers/promises.
        const unlock = new SpeechSynthesisUtterance(' ');
        unlock.volume = 1;
        unlock.rate = 10;
        window.speechSynthesis.speak(unlock);
        audioUnlocked = true;
        console.log('✅ Audio unlocked via user gesture');
    } catch (e) {
        console.warn('Audio unlock attempt failed:', e);
    }
}

// ============================================================
// SIMPLE AVATAR CONTROLS
// ============================================================

const MOUTH = {
    closed: 'M 82 138 Q 100 136 118 138',
    small: 'M 80 135 Q 100 148 120 135 Q 100 142 80 135 Z',
    wide: 'M 72 130 Q 100 160 128 130 Q 100 148 72 130 Z'
};

let avatarMouth = null;
let avatarMouthInterval = null;
let avatarBlinkTimer = null;

function getAvatarMouth() {
    if (!avatarMouth) {
        avatarMouth = document.getElementById('avatarMouth');
    }
    return avatarMouth;
}

function setMouthLevel(level) {
    const mouth = getAvatarMouth();
    if (!mouth) return;
    if (level < 0.12) mouth.setAttribute('d', MOUTH.closed);
    else if (level < 0.45) mouth.setAttribute('d', MOUTH.small);
    else mouth.setAttribute('d', MOUTH.wide);
}

function startAvatarSpeaking() {
    const avatar = document.getElementById('fixedAvatar');
    if (!avatar) return;
    if (avatarMouthInterval) clearInterval(avatarMouthInterval);
    const cycle = [0, 0.3, 0.8, 0.3, 0.6, 0.2];
    let i = 0;
    avatarMouthInterval = setInterval(() => {
        setMouthLevel(cycle[i % cycle.length]);
        i++;
    }, 130);
    avatar.classList.add('speaking');
    const status = document.getElementById('avatarStatus');
    if (status) status.textContent = '🔊 Speaking';
}

function stopAvatarSpeaking() {
    if (avatarMouthInterval) {
        clearInterval(avatarMouthInterval);
        avatarMouthInterval = null;
    }
    setMouthLevel(0);
    const avatar = document.getElementById('fixedAvatar');
    if (avatar) avatar.classList.remove('speaking');
    const status = document.getElementById('avatarStatus');
    if (status) status.textContent = 'Ready';
}

function startAvatarBlinking() {
    const eyeL = document.getElementById('eyeL');
    const eyeR = document.getElementById('eyeR');
    if (!eyeL || !eyeR) return;
    const blink = () => {
        eyeL.style.transform = 'scaleY(0.1)';
        eyeR.style.transform = 'scaleY(0.1)';
        setTimeout(() => {
            eyeL.style.transform = 'scaleY(1)';
            eyeR.style.transform = 'scaleY(1)';
        }, 120);
        avatarBlinkTimer = setTimeout(blink, 3000 + Math.random() * 2000);
    };
    blink();
}

// ============================================================
// VOICE POPULATE DROPDOWN
// ============================================================

function getVoices() {
    if (!window.speechSynthesis) return [];
    return window.speechSynthesis.getVoices() || [];
}

function populateVoiceDropdown() {
    const select = document.getElementById('voiceSelect');
    if (!select) return;
    const voices = getVoices();
    if (voices.length === 0) {
        setTimeout(populateVoiceDropdown, 500);
        return;
    }
    const englishVoices = voices.filter(v => v.lang && v.lang.startsWith('en'));
    const voiceList = englishVoices.length > 0 ? englishVoices : voices;
    select.innerHTML = '';
    voiceList.forEach(voice => {
        const option = document.createElement('option');
        option.value = voice.name;
        option.textContent = `${voice.name} (${voice.lang})`;
        select.appendChild(option);
    });
    if (voiceList.length > 0) {
        select.value = voiceList[0].name;
    }
    console.log('✅ Voices loaded:', voiceList.length);
}

// ============================================================
// KEEP-ALIVE — Chrome silently kills long TTS after ~15s
// ============================================================

function startKeepAlive() {
    stopKeepAlive();
    keepAliveTimer = setInterval(() => {
        if (!window.speechSynthesis) return;
        if (window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
            window.speechSynthesis.pause();
            window.speechSynthesis.resume();
        }
    }, 10000);
}

function stopKeepAlive() {
    if (keepAliveTimer) {
        clearInterval(keepAliveTimer);
        keepAliveTimer = null;
    }
}

// ============================================================
// SPEECH — combined Safari GC fix + Chrome keep-alive fix
// ============================================================

function speakText(text) {
    return new Promise((resolve) => {
        if (!window.speechSynthesis) {
            console.warn('Speech not supported');
            updateVoiceStatus('❌ Not supported');
            resolve();
            return;
        }
        if (!text || !text.trim()) {
            console.warn('⚠️ Empty text');
            resolve();
            return;
        }

        console.log('🔊 Speaking:', text.substring(0, 50) + '...');

        const synth = window.speechSynthesis;

        // Strong module-level reference so Safari/WebKit doesn't GC mid-speech
        currentUtterance = new SpeechSynthesisUtterance(text);
        currentUtterance.lang = 'en-US';
        currentUtterance.rate = 0.9;
        currentUtterance.pitch = 1;
        currentUtterance.volume = 1; // explicit — some browsers default lower on certain profiles

        const select = document.getElementById('voiceSelect');
        if (select && select.value) {
            const voices = synth.getVoices();
            const selected = voices.find(v => v.name === select.value);
            if (selected) {
                currentUtterance.voice = selected;
                console.log('🔊 Using voice:', selected.name);
            }
        }

        updateVoiceStatus('🔊 Speaking...');
        startAvatarSpeaking();
        startKeepAlive();

        currentUtterance.onstart = () => {
            console.log('🔊 Speech started');
            isSpeaking = true;
        };

        currentUtterance.onend = () => {
            console.log('✅ Speech ended');
            isSpeaking = false;
            stopAvatarSpeaking();
            stopKeepAlive();
            updateVoiceStatus('✅ Done');
            currentUtterance = null;
            resolve();
        };

        currentUtterance.onerror = (e) => {
            console.error('❌ Speech error:', e.error || e);
            isSpeaking = false;
            stopAvatarSpeaking();
            stopKeepAlive();
            updateVoiceStatus('❌ Error: ' + (e.error || 'unknown'));
            currentUtterance = null;
            resolve();
        };

        // Cancel any stuck queue, then speak on the next tick — Chrome can
        // silently drop speak() if it fires in the exact same tick as cancel().
        synth.cancel();
        setTimeout(() => {
            synth.speak(currentUtterance);
        }, 50);
    });
}

function stopAllAudio() {
    if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
    }
    currentUtterance = null;
    isSpeaking = false;
    stopKeepAlive();
    stopAvatarSpeaking();
    setPlayingUI(false);
    updateVoiceStatus('⏹ Stopped');
}

function setPlayingUI(isPlayingNow) {
    const playAllBtn = document.getElementById('playAllBtn');
    const stopBtn = document.getElementById('stopAudioBtn');
    if (playAllBtn) playAllBtn.textContent = isPlayingNow ? '⏸ Playing...' : '▶ Play All';
    if (stopBtn) stopBtn.style.display = isPlayingNow ? 'inline-block' : 'none';
}

function updateVoiceStatus(message) {
    const statusEl = document.getElementById('voiceStatus');
    if (statusEl) statusEl.textContent = message;
}

function generateVoiceText(section) {
    let text = section.explanation || '';
    if (section.analogy) text += ` Here's a way to think about it: ${section.analogy}`;
    if (section.example) text += ` For example: ${section.example}`;
    return text;
}

// ============================================================
// PLAY FUNCTIONS
// ============================================================

function playSectionAudio(sectionId) {
    const section = lessonPlan?.sections?.find(s => s.id === sectionId);
    if (!section) {
        console.warn('Section not found:', sectionId);
        return;
    }
    stopRequested = false;
    setPlayingUI(true);
    const text = generateVoiceText(section);
    speakText(text).then(() => {
        if (!stopRequested) {
            setPlayingUI(false);
        }
    });
}

function playAllSections() {
    if (!lessonPlan?.sections?.length) {
        updateVoiceStatus('❌ No lesson loaded');
        return;
    }
    if (!window.speechSynthesis) {
        updateVoiceStatus('❌ Not supported');
        return;
    }

    stopRequested = false;
    setPlayingUI(true);

    let index = 0;
    function playNext() {
        if (index >= lessonPlan.sections.length || stopRequested) {
            setPlayingUI(false);
            updateVoiceStatus(stopRequested ? '⏹ Stopped' : '✅ All sections played');
            stopRequested = false;
            return;
        }

        const section = lessonPlan.sections[index];
        const text = generateVoiceText(section);
        updateVoiceStatus(`🔊 Section ${index + 1}/${lessonPlan.sections.length}`);

        speakText(text).then(() => {
            index++;
            setTimeout(playNext, 300);
        });
    }

    playNext();
}

// ============================================================
// ADVANCED FEATURES
// ============================================================

async function generateFlashcards() {
    if (!sessionId) return;
    updateVoiceStatus('📝 Generating flashcards...');
    try {
        const response = await fetch(`${API_BASE}/api/flashcards`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId })
        });
        const data = await response.json();
        displayFlashcards(data.flashcards);
        updateVoiceStatus('✅ Flashcards ready');
    } catch (error) {
        console.error('Flashcard error:', error);
        updateVoiceStatus('❌ Failed');
    }
}

function displayFlashcards(flashcards) {
    const existing = document.getElementById('flashcardContainer');
    if (existing) existing.remove();
    if (!flashcards || flashcards.length === 0) {
        updateVoiceStatus('⚠️ No flashcards');
        return;
    }
    const container = document.createElement('div');
    container.id = 'flashcardContainer';
    container.style.cssText = 'background:white; border-radius:16px; padding:24px; margin-bottom:20px; box-shadow:0 2px 12px rgba(0,0,0,0.04);';
    container.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
            <h3 style="font-family:'Fraunces',serif;">📇 Flashcards</h3>
            <button onclick="this.closest('#flashcardContainer').remove()" style="background:none; border:none; font-size:1.2rem; cursor:pointer; color:#6a6578;">✕</button>
        </div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
            ${flashcards.map(f => `
                <div style="background:#fcfaf8; border-radius:10px; padding:16px; border:1px solid #e5dfd8; cursor:pointer;" 
                     onclick="this.querySelector('.flash-definition').style.display = this.querySelector('.flash-definition').style.display === 'none' ? 'block' : 'none'">
                    <strong style="color:#1e1a2b;">${f.term}</strong>
                    <div class="flash-definition" style="display:none; margin-top:8px; color:#6a6578; font-size:0.9rem; border-top:1px solid #e5dfd8; padding-top:8px;">${f.definition}</div>
                    <div style="margin-top:6px; font-size:0.65rem; color:#b5afb8;">Click to reveal</div>
                </div>
            `).join('')}
        </div>
    `;
    const header = document.getElementById('lessonHeader');
    if (header) header.after(container);
}

async function showAnalytics() {
    if (!sessionId) return;
    try {
        const response = await fetch(`${API_BASE}/api/analytics/${sessionId}`);
        const data = await response.json();
        const container = document.createElement('div');
        container.id = 'analyticsContainer';
        container.style.cssText = 'background:white; border-radius:16px; padding:24px; margin-bottom:20px; box-shadow:0 2px 12px rgba(0,0,0,0.04);';
        container.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
                <h3 style="font-family:'Fraunces',serif;">📊 Learning Analytics</h3>
                <button onclick="this.closest('#analyticsContainer').remove()" style="background:none; border:none; font-size:1.2rem; cursor:pointer; color:#6a6578;">✕</button>
            </div>
            <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:12px; margin-bottom:16px;">
                <div style="background:#fcfaf8; border-radius:10px; padding:16px; text-align:center;">
                    <div style="font-size:2rem; font-weight:700; color:#3a7a5e;">${data.accuracy}%</div>
                    <div style="color:#6a6578; font-size:0.8rem;">Accuracy</div>
                </div>
                <div style="background:#fcfaf8; border-radius:10px; padding:16px; text-align:center;">
                    <div style="font-size:2rem; font-weight:700; color:#c89b3c;">${data.totalQuestions}</div>
                    <div style="color:#6a6578; font-size:0.8rem;">Questions</div>
                </div>
                <div style="background:#fcfaf8; border-radius:10px; padding:16px; text-align:center;">
                    <div style="font-size:2rem; font-weight:700; color:#b5502e;">${data.commonMistakes.length}</div>
                    <div style="color:#6a6578; font-size:0.8rem;">Mistakes</div>
                </div>
            </div>
            ${data.commonMistakes.length > 0 ? `
                <div style="background:rgba(181,80,46,0.06); border-radius:10px; padding:16px;">
                    <strong style="color:#b5502e;">🧠 Common Misconceptions:</strong>
                    ${data.commonMistakes.map(m => `<div style="margin-top:4px; color:#4a4558;">• ${m.mistake} (${m.count}x)</div>`).join('')}
                </div>
            ` : '<div style="color:#6a6578;">No misconceptions detected!</div>'}
        `;
        const existing = document.getElementById('analyticsContainer');
        if (existing) existing.remove();
        const header = document.getElementById('lessonHeader');
        if (header) header.after(container);
    } catch (error) {
        console.error('Analytics error:', error);
        updateVoiceStatus('❌ Analytics failed');
    }
}

async function generateRevision() {
    if (!sessionId) return;
    updateVoiceStatus('📚 Generating revision...');
    try {
        const response = await fetch(`${API_BASE}/api/revision`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId })
        });
        const data = await response.json();
        if (data.message) {
            updateVoiceStatus(data.message);
            return;
        }
        displayRevision(data);
        updateVoiceStatus('✅ Revision ready');
    } catch (error) {
        console.error('Revision error:', error);
        updateVoiceStatus('❌ Revision failed');
    }
}

function displayRevision(revision) {
    const existing = document.getElementById('revisionContainer');
    if (existing) existing.remove();
    const container = document.createElement('div');
    container.id = 'revisionContainer';
    container.style.cssText = 'background:white; border-radius:16px; padding:24px; margin-bottom:20px; box-shadow:0 2px 12px rgba(0,0,0,0.04); border-left:4px solid #b5502e;';
    container.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
            <h3 style="font-family:'Fraunces',serif;">🔄 Revision</h3>
            <button onclick="this.closest('#revisionContainer').remove()" style="background:none; border:none; font-size:1.2rem; cursor:pointer; color:#6a6578;">✕</button>
        </div>
        <div style="font-size:1.1rem; font-weight:600; margin-bottom:12px;">${revision.title}</div>
        ${revision.sections.map(s => `
            <div style="background:#fcfaf8; border-radius:10px; padding:16px; margin-bottom:12px; border-left:3px solid #c89b3c;">
                <strong style="color:#1e1a2b;">${s.concept}</strong>
                <div style="margin-top:6px; color:#4a4558;">${s.explanation}</div>
                ${s.analogy ? `<div style="margin-top:6px; font-style:italic; color:#6a6578;">💡 ${s.analogy}</div>` : ''}
                ${s.practiceQuestion ? `<div style="margin-top:8px; background:white; padding:12px; border-radius:8px; border:1px solid #e5dfd8;"><strong>✏️ Practice:</strong> ${s.practiceQuestion}</div>` : ''}
            </div>
        `).join('')}
    `;
    const header = document.getElementById('lessonHeader');
    if (header) header.after(container);
}

// ============================================================
// EVENT LISTENERS
// ============================================================

startBtn.addEventListener('click', () => {
    unlockAudio(); // guarantee unlock even if the banner was somehow skipped
    startLesson();
});

fileInput.addEventListener('change', (e) => {
    fileName.textContent = e.target.files.length > 0 ? `📎 ${e.target.files[0].name}` : '';
});

topicInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') startBtn.click();
});

document.querySelectorAll('.pill').forEach(pill => {
    pill.addEventListener('click', () => {
        topicInput.value = pill.dataset.topic;
        topicInput.focus();
    });
});

const uploadZone = document.getElementById('uploadZone');
if (uploadZone) {
    ['dragenter', 'dragover'].forEach(event => {
        uploadZone.addEventListener(event, (e) => {
            e.preventDefault();
            uploadZone.classList.add('dragover');
        });
    });
    ['dragleave', 'drop'].forEach(event => {
        uploadZone.addEventListener(event, (e) => {
            e.preventDefault();
            uploadZone.classList.remove('dragover');
        });
    });
    uploadZone.addEventListener('drop', (e) => {
        e.preventDefault();
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            fileInput.files = files;
            fileName.textContent = `📎 ${files[0].name}`;
        }
    });
}

document.getElementById('resetBtn')?.addEventListener('click', () => {
    if (confirm('Reset this lesson and start over?')) {
        lessonPlan = null;
        currentSectionIndex = 0;
        answers = [];
        sessionId = null;
        reportContainer.style.display = 'none';
        lessonScreen.classList.remove('active');
        setupScreen.classList.add('active');
        const avatar = document.getElementById('fixedAvatar');
        if (avatar) avatar.classList.remove('visible');
        lessonContent.innerHTML = '';
        stopAllAudio();
        document.getElementById('lessonProgress').innerHTML = `
            <div class="empty-state">
                <span class="empty-icon">📖</span>
                <p>Start a lesson —<br />your progress appears here</p>
            </div>
        `;
        updateStats(0, 0);
    }
});

// ============================================================
// MAIN FUNCTIONS
// ============================================================

async function startLesson() {
    const topic = topicInput.value.trim();
    const file = fileInput.files[0];
    const level = levelInput.value;
    const time = parseInt(timeInput.value);
    const language = languageInput.value;
    const personality = personalityInput ? personalityInput.value : 'friendly';

    if (!topic && !file) {
        alert('Please enter a topic or upload a file.');
        return;
    }

    showLoading('Analyzing your request...');

    try {
        let response;

        if (file) {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('level', level);
            formData.append('timeMinutes', time);
            formData.append('language', language);
            formData.append('personality', personality);

            showLoading('Reading your document...');
            const uploadRes = await fetch(`${API_BASE}/api/upload`, { method: 'POST', body: formData });
            const uploadData = await uploadRes.json();
            sessionId = uploadData.sessionId;

            showLoading('Creating your personalized lesson...');
            response = await fetch(`${API_BASE}/api/lesson`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sessionId,
                    topic: topic || file.name.replace(/\.[^.]+$/, ''),
                    level,
                    timeMinutes: time,
                    language,
                    personality
                })
            });
        } else {
            const sessionRes = await fetch(`${API_BASE}/api/upload`, { method: 'POST', body: new FormData() });
            const sessionData = await sessionRes.json();
            sessionId = sessionData.sessionId;

            showLoading('Creating your personalized lesson...');
            response = await fetch(`${API_BASE}/api/lesson`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sessionId,
                    topic,
                    level,
                    timeMinutes: time,
                    language,
                    personality
                })
            });
        }

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to generate lesson');
        }

        lessonPlan = await response.json();
        currentSectionIndex = 0;
        answers = [];

        hideLoading();
        renderLesson(lessonPlan);
        setTimeout(startAvatarBlinking, 500);
        setTimeout(populateVoiceDropdown, 300);
        setTimeout(populateVoiceDropdown, 1000);

    } catch (error) {
        hideLoading();
        console.error('Error:', error);
        alert(`Something went wrong: ${error.message}`);
    }
}

// ============================================================
// RENDER FUNCTIONS
// ============================================================

function renderLesson(plan) {
    setupScreen.classList.remove('active');
    lessonScreen.classList.add('active');
    const avatar = document.getElementById('fixedAvatar');
    if (avatar) avatar.classList.add('visible');

    lessonTitle.textContent = plan.title || 'Lesson';
    const totalSections = plan.sections?.length || 0;
    lessonProgressText.textContent = `0 / ${totalSections} sections`;
    lessonStatus.textContent = 'In Progress';
    lessonStatus.className = 'badge in-progress';

    renderSidebar(plan);
    renderSections(plan);
    showSection(0);
}

function renderSidebar(plan) {
    const container = document.getElementById('lessonProgress');
    if (!plan.sections || plan.sections.length === 0) {
        container.innerHTML = '<div class="empty-state"><span class="empty-icon">📖</span><p>No sections to display</p></div>';
        return;
    }
    let html = '<div class="timeline">';
    plan.sections.forEach((section, index) => {
        const status = index === 0 ? 'active' : 'upcoming';
        const title = section.title || section.concept || `Section ${index + 1}`;
        html += `
            <div class="timeline-item ${status}" data-index="${index}" id="timeline-${index}">
                <span class="idx">${String(index + 1).padStart(2, '0')}</span>
                <div class="info">
                    <div class="title">${title}</div>
                    <div class="sub">${section.concept || ''}</div>
                </div>
                <span class="dot ${status}"></span>
            </div>
        `;
    });
    html += '</div>';
    container.innerHTML = html;
}

function renderSections(plan) {
    const container = lessonContent;
    container.innerHTML = '';

    const voiceControls = document.createElement('div');
    voiceControls.className = 'voice-controls';
    voiceControls.style.cssText = 'display:flex; align-items:center; gap:12px; padding:12px 16px; background:#fcfaf8; border-radius:12px; margin-bottom:20px; flex-wrap:wrap;';
    voiceControls.innerHTML = `
        <span style="font-size:0.85rem; color:#6a6578;">🔊 Voice:</span>
        <select id="voiceSelect" style="padding:6px 12px; border:1px solid #e5dfd8; border-radius:8px; font-family:'Inter',sans-serif; font-size:0.85rem; background:white; min-width:200px;">
            <option value="">Loading voices...</option>
        </select>
        <button id="testVoiceBtn" style="padding:6px 12px; background:#3a7a5e; color:white; border:none; border-radius:8px; cursor:pointer; font-family:'Inter',sans-serif; font-size:0.8rem; font-weight:500;">
            🔈 Test
        </button>
        <button id="playAllBtn" style="padding:6px 16px; background:#1e1a2b; color:#f7f2eb; border:none; border-radius:8px; cursor:pointer; font-family:'Inter',sans-serif; font-size:0.8rem; font-weight:500;">
            ▶ Play All
        </button>
        <button id="stopAudioBtn" style="padding:6px 16px; background:#b5502e; color:white; border:none; border-radius:8px; cursor:pointer; font-family:'Inter',sans-serif; font-size:0.8rem; font-weight:500; display:none;">
            ⏹ Stop
        </button>
        <button id="flashcardBtn" style="padding:6px 12px; background:#8a6e4b; color:white; border:none; border-radius:8px; cursor:pointer; font-family:'Inter',sans-serif; font-size:0.8rem; font-weight:500;">
            📇 Flashcards
        </button>
        <button id="analyticsBtn" style="padding:6px 12px; background:#3a7a5e; color:white; border:none; border-radius:8px; cursor:pointer; font-family:'Inter',sans-serif; font-size:0.8rem; font-weight:500;">
            📊 Analytics
        </button>
        <button id="revisionBtn" style="padding:6px 12px; background:#b5502e; color:white; border:none; border-radius:8px; cursor:pointer; font-family:'Inter',sans-serif; font-size:0.8rem; font-weight:500;">
            🔄 Revision
        </button>
        <span id="voiceStatus" style="font-size:0.75rem; color:#6a6578; margin-left:auto;">Ready</span>
    `;
    container.appendChild(voiceControls);

    document.getElementById('playAllBtn')?.addEventListener('click', playAllSections);
    document.getElementById('stopAudioBtn')?.addEventListener('click', stopAllAudio);
    document.getElementById('testVoiceBtn')?.addEventListener('click', () => {
        speakText('This is a test of the selected voice.');
    });
    document.getElementById('voiceSelect')?.addEventListener('change', (e) => {
        console.log('🔊 Voice changed to:', e.target.value);
        speakText(`This is ${e.target.value}.`);
    });
    document.getElementById('flashcardBtn')?.addEventListener('click', generateFlashcards);
    document.getElementById('analyticsBtn')?.addEventListener('click', showAnalytics);
    document.getElementById('revisionBtn')?.addEventListener('click', generateRevision);

    setTimeout(populateVoiceDropdown, 100);
    setTimeout(populateVoiceDropdown, 500);

    plan.sections.forEach((section, index) => {
        const card = document.createElement('div');
        card.className = 'section-card';
        card.id = `section-${index}`;
        card.style.display = 'none';

        const sectionTitle = section.title || section.concept || `Section ${index + 1}`;
        const conceptLabel = section.concept || sectionTitle;

        let html = `
            <div class="section-number">Section ${String(index + 1).padStart(2, '0')}</div>
            <h3>${sectionTitle}</h3>
            <div class="concept-tag">${conceptLabel}</div>
            <div class="explanation">${section.explanation || ''}</div>
        `;
        if (section.analogy) html += `<div class="analogy">💡 ${section.analogy}</div>`;
        if (section.example) html += `<div class="example">📝 ${section.example}</div>`;

        html += `
            <button class="play-section-btn" data-section-id="${section.id}" style="padding:6px 14px; background:#c89b3c; color:white; border:none; border-radius:8px; cursor:pointer; font-family:'Inter',sans-serif; font-size:0.8rem; font-weight:500; margin-top:12px;">
                ▶ Play This Section
            </button>
        `;

        if (section.checkpointQuestion) {
            const q = section.checkpointQuestion;
            html += `
                <div class="checkpoint" id="checkpoint-${index}">
                    <div class="question">${q.question}</div>
                    <div id="checkpoint-input-${index}">
            `;
            if (q.options && q.options.length > 0) {
                html += `<div class="checkpoint-options">`;
                q.options.forEach((opt, oi) => {
                    html += `<button onclick="answerMCQ(${index}, ${oi})">${opt}</button>`;
                });
                html += `</div>`;
            } else {
                html += `
                    <div class="checkpoint-input">
                        <input type="text" id="answer-input-${index}" placeholder="Type your answer..." onkeydown="if(event.key==='Enter') answerOpenEnded(${index})">
                        <button onclick="answerOpenEnded(${index})">Submit</button>
                    </div>
                `;
            }
            html += `
                    </div>
                    <div id="feedback-${index}"></div>
                </div>
            `;
        }

        card.innerHTML = html;
        container.appendChild(card);

        const playBtn = card.querySelector('.play-section-btn');
        if (playBtn) {
            playBtn.addEventListener('click', () => playSectionAudio(playBtn.dataset.sectionId));
        }
    });

    const reportBtn = document.createElement('button');
    reportBtn.textContent = '📊 Get Final Report';
    reportBtn.className = 'report-btn';
    reportBtn.id = 'reportBtn';
    reportBtn.style.cssText = `
        width: 100%; background: #1e1a2b; color: #f7f2eb; padding: 16px;
        border-radius: 12px; font-size: 1rem; margin-top: 16px; display: none;
        font-family: 'Inter', sans-serif; font-weight: 600; cursor: pointer; border: none;
    `;
    reportBtn.onclick = generateReport;
    container.appendChild(reportBtn);
}

function showSection(index) {
    const sections = document.querySelectorAll('.section-card');
    const timelineItems = document.querySelectorAll('.timeline-item');
    stopAllAudio();
    sections.forEach((el) => { el.style.display = 'none'; el.className = 'section-card'; });
    timelineItems.forEach((el, i) => {
        el.className = 'timeline-item';
        const dot = el.querySelector('.dot');
        if (i < index) { el.classList.add('completed'); dot.className = 'dot correct'; }
        else if (i === index) { el.classList.add('active'); dot.className = 'dot active'; }
        else { dot.className = 'dot upcoming'; }
    });
    if (sections[index]) {
        sections[index].style.display = 'block';
        sections[index].classList.add('active-section');
        currentSectionIndex = index;
        const total = lessonPlan?.sections?.length || 0;
        lessonProgressText.textContent = `${index + 1} / ${total} sections`;
        updateStats(index + 1, total);
    }
    const reportBtn = document.getElementById('reportBtn');
    if (reportBtn && lessonPlan) {
        const allAnswered = lessonPlan.sections.every((s, i) => answers.some(a => a.sectionIndex === i));
        reportBtn.style.display = allAnswered ? 'block' : 'none';
    }
}

// ============================================================
// ANSWER FUNCTIONS
// ============================================================

async function answerMCQ(sectionIndex, optionIndex) {
    if (isAnswering) return;
    isAnswering = true;
    const section = lessonPlan.sections[sectionIndex];
    const q = section.checkpointQuestion;
    await submitAnswer(sectionIndex, q.options[optionIndex]);
}

async function answerOpenEnded(sectionIndex) {
    if (isAnswering) return;
    const input = document.getElementById(`answer-input-${sectionIndex}`);
    if (!input) return;
    const answer = input.value.trim();
    if (!answer) return;
    isAnswering = true;
    await submitAnswer(sectionIndex, answer);
}

async function submitAnswer(sectionIndex, studentAnswer) {
    const section = lessonPlan.sections[sectionIndex];
    const feedbackDiv = document.getElementById(`feedback-${sectionIndex}`);
    const inputDiv = document.getElementById(`checkpoint-input-${sectionIndex}`);

    try {
        if (inputDiv) {
            inputDiv.querySelectorAll('button').forEach(b => b.disabled = true);
            inputDiv.querySelectorAll('input').forEach(inp => inp.disabled = true);
        }

        const response = await fetch(`${API_BASE}/api/answer`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId, sectionId: section.id, studentAnswer })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to evaluate answer');
        }

        const result = await response.json();

        answers.push({
            sectionIndex, sectionId: section.id, concept: section.concept,
            answer: studentAnswer, verdict: result.verdict,
            diagnosedMisconception: result.diagnosedMisconception
        });

        let feedbackHtml = `
            <div class="verdict-badge ${result.verdict === 'correct' ? 'correct' : result.verdict === 'partial' ? 'partial' : 'incorrect'}">
                ${result.verdict === 'correct' ? '✅ Correct!' : result.verdict === 'partial' ? '⚠️ Partially correct' : '❌ Not quite'}
                <span class="detail">${result.encouragement || ''}</span>
            </div>
        `;

        if (result.whatTheyGotRight && result.whatTheyGotRight !== 'nothing') {
            feedbackHtml += `
                <div style="margin-top:8px; padding:12px; background:rgba(58,122,94,0.08); border-radius:8px;">
                    <strong style="color:#3a7a5e;">✅ You got right:</strong>
                    <span style="color:#3a3a5a;">${result.whatTheyGotRight}</span>
                </div>
            `;
        }

        if (result.diagnosedMisconception && result.diagnosedMisconception !== 'none') {
            feedbackHtml += `
                <div style="margin-top:8px; padding:12px; background:rgba(181,80,46,0.08); border-radius:8px;">
                    <strong style="color:#b5502e;">🧠 Misconception detected:</strong>
                    <span style="color:#3a3a5a;">${result.diagnosedMisconception}</span>
                </div>
            `;
            const timelineItem = document.getElementById(`timeline-${sectionIndex}`);
            const dot = timelineItem?.querySelector('.dot');
            if (dot) dot.className = 'dot struggled';
        } else if (result.verdict === 'correct') {
            const timelineItem = document.getElementById(`timeline-${sectionIndex}`);
            const dot = timelineItem?.querySelector('.dot');
            if (dot) dot.className = 'dot correct';
        }

        if (result.reExplanation) {
            feedbackHtml += `
                <div style="margin-top:8px; padding:12px; background:rgba(200,155,60,0.08); border-radius:8px; border-left:3px solid #c89b3c;">
                    <strong style="color:#c89b3c;">🔄 Different perspective:</strong>
                    <span style="color:#3a3a5a;">${result.reExplanation}</span>
                </div>
            `;
        }

        if (result.followUpQuestion) {
            const followUpId = `followup-${sectionIndex}`;
            feedbackHtml += `
                <div class="follow-up" style="margin-top:12px; padding-top:12px; border-top:1px solid #e5dfd8;">
                    <p style="font-weight:600; margin-bottom:8px;">❓ ${result.followUpQuestion}</p>
                    <div class="checkpoint-input">
                        <input type="text" id="${followUpId}" placeholder="Type your answer..." onkeydown="if(event.key==='Enter') answerFollowUp('${followUpId}', ${sectionIndex})">
                        <button onclick="answerFollowUp('${followUpId}', ${sectionIndex})">Submit</button>
                    </div>
                    <div id="followup-feedback-${sectionIndex}"></div>
                </div>
            `;
        }

        feedbackDiv.innerHTML = feedbackHtml;

        if (result.verdict === 'correct') {
            const sections = document.querySelectorAll('.section-card');
            if (sectionIndex < sections.length - 1) {
                setTimeout(() => showSection(sectionIndex + 1), 1500);
            } else {
                lessonStatus.textContent = 'Complete';
                lessonStatus.className = 'badge complete';
                const reportBtn = document.getElementById('reportBtn');
                if (reportBtn) reportBtn.style.display = 'block';
                updateStats(answers.length, sections.length);
            }
        }

    } catch (error) {
        console.error('Answer error:', error);
        feedbackDiv.innerHTML = `
            <div class="verdict-badge incorrect">
                ❌ Error
                <span class="detail">${error.message}</span>
            </div>
        `;
    }

    isAnswering = false;
}

async function answerFollowUp(inputId, sectionIndex) {
    const input = document.getElementById(inputId);
    if (!input) return;
    const answer = input.value.trim();
    if (!answer) return;
    await submitAnswer(sectionIndex, answer);
}

// ============================================================
// REPORT FUNCTIONS
// ============================================================

async function generateReport() {
    showLoading('Generating your learning report...');
    try {
        const response = await fetch(`${API_BASE}/api/report`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId })
        });
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to generate report');
        }
        const report = await response.json();
        hideLoading();
        displayReport(report);
    } catch (error) {
        hideLoading();
        console.error('Report error:', error);
        alert(`Failed to generate report: ${error.message}`);
    }
}

function displayReport(report) {
    reportContainer.style.display = 'block';
    const misconceptionsHtml = report.misconceptionsFound && report.misconceptionsFound.length > 0
        ? `
            <div style="margin:16px 0; padding:16px; background:rgba(181,80,46,0.08); border-radius:12px;">
                <h4 style="color:#b5502e; font-family:'Fraunces',serif; margin-bottom:8px;">🧠 Misconceptions Found</h4>
                <ul style="list-style:none; padding:0;">
                    ${report.misconceptionsFound.map(m => `<li style="padding:4px 0;">${m}</li>`).join('')}
                </ul>
            </div>
        `
        : '';

    reportContainer.innerHTML = `
        <div style="background:white; border-radius:20px; padding:40px; box-shadow:0 4px 24px rgba(30,26,43,0.04);">
            <h2 style="font-family:'Fraunces',serif; font-weight:600; font-size:1.6rem; color:#1e1a2b; margin-bottom:16px;">📊 Learning Report</h2>
            <div style="font-family:'Fraunces',serif; font-size:3.4rem; font-weight:700; color:#c89b3c;">${report.scorePercent || 0}%</div>
            <div style="color:#6a6578; margin-bottom:16px;">Overall Score</div>

            <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px; margin:16px 0;">
                <div>
                    <h4 style="color:#3a7a5e; font-family:'Fraunces',serif;">✅ Strong Concepts</h4>
                    <ul style="list-style:none; padding:0;">
                        ${(report.strongConcepts || ['None identified']).map(c => `<li style="padding:4px 0;">${c}</li>`).join('')}
                    </ul>
                </div>
                <div>
                    <h4 style="color:#b5502e; font-family:'Fraunces',serif;">📝 Areas to Improve</h4>
                    <ul style="list-style:none; padding:0;">
                        ${(report.weakConcepts || ['None identified']).map(c => `<li style="padding:4px 0;">${c}</li>`).join('')}
                    </ul>
                </div>
            </div>

            ${misconceptionsHtml}

            <div style="margin-top:16px; padding:16px; background:#fcfaf8; border-radius:12px;">
                <h4 style="color:#1e1a2b; font-family:'Fraunces',serif;">📌 Recommendation</h4>
                <p style="color:#3a3a5a;">${report.recommendation || 'Continue practicing the concepts you found challenging.'}</p>
            </div>

            ${report.suggestedNextTopic ? `
                <div style="margin-top:12px; padding:12px; background:rgba(200,155,60,0.08); border-radius:8px; border-left:3px solid #c89b3c;">
                    <strong style="color:#c89b3c;">➡️ Suggested Next Topic:</strong>
                    <span style="color:#3a3a5a;">${report.suggestedNextTopic}</span>
                </div>
            ` : ''}
        </div>
    `;
    reportContainer.scrollIntoView({ behavior: 'smooth' });
}

// ============================================================
// LOADING HELPERS
// ============================================================

function showLoading(message) {
    loadingOverlay.style.display = 'flex';
    loadingMessage.textContent = message || 'Generating your lesson...';
    document.querySelectorAll('.loading-steps .step').forEach((step, index) => {
        step.className = 'step';
        if (index === 0) step.classList.add('active');
    });
    let step = 0;
    if (window._loadingInterval) clearInterval(window._loadingInterval);
    window._loadingInterval = setInterval(() => {
        step++;
        if (step > 3) {
            clearInterval(window._loadingInterval);
            window._loadingInterval = null;
            return;
        }
        const steps = document.querySelectorAll('.loading-steps .step');
        steps.forEach((s, i) => {
            s.className = 'step';
            if (i < step) s.classList.add('done');
            if (i === step) s.classList.add('active');
        });
    }, 1200);
}

function hideLoading() {
    if (window._loadingInterval) {
        clearInterval(window._loadingInterval);
        window._loadingInterval = null;
    }
    loadingOverlay.style.display = 'none';
}

function updateStats(answered, total) {
    const progress = total > 0 ? Math.round((answered / total) * 100) : 0;
    document.getElementById('statProgress').textContent = `${progress}%`;
    document.getElementById('statConcepts').textContent = total;
}

// ============================================================
// INIT
// ============================================================

if (!window.speechSynthesis) {
    console.warn('⚠️ Speech synthesis not supported.');
} else {
    // Show the unlock banner immediately on page load, before any lesson exists
    injectAudioUnlockBanner();
}

setTimeout(populateVoiceDropdown, 100);
setTimeout(populateVoiceDropdown, 500);
setTimeout(populateVoiceDropdown, 1000);

if (window.speechSynthesis) {
    window.speechSynthesis.onvoiceschanged = function() {
        console.log('🔊 Voices changed, reloading...');
        populateVoiceDropdown();
    };
}

console.log('🎬 ReelTeach loaded!');
console.log('🔊 Speech synthesis available:', !!window.speechSynthesis);