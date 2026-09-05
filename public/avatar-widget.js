// avatar-widget.js — Free, no API key, no external service.
// Two modes:
//   1. TRUE lip-sync: AvatarWidget.startWithAudioElement(audioEl) — analyzes
//      real audio amplitude from an <audio> element (e.g. your ElevenLabs
//      mp3 blob) via the Web Audio API, and drives the mouth shape off it.
//   2. Fallback animation: AvatarWidget.startFallback() — a lively randomized
//      mouth-shape cycle for cases with no accessible audio buffer (the
//      browser's built-in speechSynthesis doesn't expose one).
//
// Usage:
//   AvatarWidget.mount(document.getElementById('lessonContent'));
//   // when ElevenLabs audio starts playing:
//   AvatarWidget.startWithAudioElement(audioEl);
//   audioEl.onended = () => AvatarWidget.stop();
//   // when browser TTS starts speaking (no audio element available):
//   AvatarWidget.startFallback();
//   // ...and on utterance end/error:
//   AvatarWidget.stop();

const AvatarWidget = (() => {
    let mouthPath, eyeLeft, eyeRight;
    let rafId = null;
    let fallbackInterval = null;
    let blinkTimer = null;
    let audioCtx = null, analyser = null, dataArray = null;
    let connectedAudioEl = null; // Web Audio can only wrap a given <audio> element once

    const MOUTH = {
        closed: 'M 70 130 Q 100 128 130 130',
        small:  'M 70 128 Q 100 148 130 128 Q 100 138 70 128 Z',
        wide:   'M 62 122 Q 100 165 138 122 Q 100 148 62 122 Z'
    };

    function injectMarkup() {
        let container = document.getElementById('avatarWidgetContainer');
        if (container) return container;

        container = document.createElement('div');
        container.id = 'avatarWidgetContainer';
        container.style.cssText = 'display:flex; justify-content:center; margin-bottom:20px;';
        container.innerHTML = `
            <div id="avatarBob" style="width:180px; height:180px;">
                <svg viewBox="0 0 200 200" width="180" height="180">
                    <ellipse cx="100" cy="108" rx="68" ry="78" fill="#f2c9a0"/>
                    <path d="M 35 92 Q 28 18 100 14 Q 172 18 165 92 Q 165 48 100 44 Q 35 48 35 92 Z" fill="#3a2a1a"/>
                    <circle id="avatarEyeL" cx="75" cy="100" r="8" fill="#1e1a2b"/>
                    <circle id="avatarEyeR" cx="125" cy="100" r="8" fill="#1e1a2b"/>
                    <path d="M 62 85 Q 75 78 88 85" stroke="#3a2a1a" stroke-width="3" fill="none" stroke-linecap="round"/>
                    <path d="M 112 85 Q 125 78 138 85" stroke="#3a2a1a" stroke-width="3" fill="none" stroke-linecap="round"/>
                    <ellipse cx="72" cy="118" rx="10" ry="6" fill="#e8a97a" opacity="0.5"/>
                    <ellipse cx="128" cy="118" rx="10" ry="6" fill="#e8a97a" opacity="0.5"/>
                    <path id="avatarMouth" d="${MOUTH.closed}" fill="#7a2e2e" stroke="#5a1e1e" stroke-width="2"/>
                </svg>
            </div>
        `;

        if (!document.getElementById('avatarWidgetStyles')) {
            const style = document.createElement('style');
            style.id = 'avatarWidgetStyles';
            style.textContent = `
                #avatarBob { animation: avatarSway 3.2s ease-in-out infinite; transform-origin: center bottom; }
                @keyframes avatarSway {
                    0%, 100% { transform: translateY(0) rotate(0deg); }
                    50% { transform: translateY(-3px) rotate(0.6deg); }
                }
                .avatar-blink { animation: avatarBlink 0.16s ease-in-out; }
                @keyframes avatarBlink {
                    0%, 100% { transform: scaleY(1); }
                    50% { transform: scaleY(0.1); }
                }
            `;
            document.head.appendChild(style);
        }

        return container;
    }

    function mount(targetEl) {
        const container = injectMarkup();
        if (targetEl && !targetEl.contains(container)) {
            targetEl.prepend(container);
        }
        mouthPath = document.getElementById('avatarMouth');
        eyeLeft = document.getElementById('avatarEyeL');
        eyeRight = document.getElementById('avatarEyeR');
        if (!blinkTimer) startBlinking();
    }

    function startBlinking() {
        const scheduleNext = () => {
            blinkTimer = setTimeout(() => {
                if (eyeLeft && eyeRight) {
                    eyeLeft.classList.add('avatar-blink');
                    eyeRight.classList.add('avatar-blink');
                    setTimeout(() => {
                        eyeLeft.classList.remove('avatar-blink');
                        eyeRight.classList.remove('avatar-blink');
                    }, 160);
                }
                scheduleNext();
            }, 3200 + Math.random() * 2200);
        };
        scheduleNext();
    }

    function setMouthLevel(level) {
        if (!mouthPath) return;
        if (level < 0.12) mouthPath.setAttribute('d', MOUTH.closed);
        else if (level < 0.45) mouthPath.setAttribute('d', MOUTH.small);
        else mouthPath.setAttribute('d', MOUTH.wide);
    }

    // TRUE lip-sync driven by real audio amplitude — use this whenever you
    // have an actual <audio> element playing (e.g. an ElevenLabs mp3 blob).
    function startWithAudioElement(audioEl) {
        stop();

        try {
            audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
            if (audioCtx.state === 'suspended') audioCtx.resume();

            // createMediaElementSource can only be called ONCE per element
            // for the element's lifetime — reuse the analyser if we've
            // already wrapped this exact element.
            if (connectedAudioEl !== audioEl) {
                const sourceNode = audioCtx.createMediaElementSource(audioEl);
                analyser = audioCtx.createAnalyser();
                analyser.fftSize = 256;
                sourceNode.connect(analyser);
                analyser.connect(audioCtx.destination);
                dataArray = new Uint8Array(analyser.frequencyBinCount);
                connectedAudioEl = audioEl;
            }
        } catch (e) {
            console.warn('Avatar lip-sync: falling back to pseudo-random mouth animation', e);
            startFallback();
            return;
        }

        const tick = () => {
            analyser.getByteTimeDomainData(dataArray);
            let sumSquares = 0;
            for (let i = 0; i < dataArray.length; i++) {
                const v = (dataArray[i] - 128) / 128;
                sumSquares += v * v;
            }
            const rms = Math.sqrt(sumSquares / dataArray.length);
            setMouthLevel(rms * 3.5); // RMS values are small — scale up for visible movement
            rafId = requestAnimationFrame(tick);
        };
        tick();
    }

    // Fallback for browser speechSynthesis, which gives no accessible audio
    // buffer to analyze. Just cycles mouth shapes convincingly while speaking.
    function startFallback() {
        stop();
        const cycle = [0, 0.3, 0.8, 0.3, 0.6, 0.2];
        let i = 0;
        fallbackInterval = setInterval(() => {
            setMouthLevel(cycle[i % cycle.length]);
            i++;
        }, 130);
    }

    function stop() {
        if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
        if (fallbackInterval) { clearInterval(fallbackInterval); fallbackInterval = null; }
        setMouthLevel(0);
    }

    return { mount, startWithAudioElement, startFallback, stop };
})();