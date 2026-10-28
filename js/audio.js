/**
 * Chess Audio Player
 * Plays standard MP3 sound assets with zero-latency Web Audio API pre-decoded buffers.
 */

const ChessAudio = (() => {
    let isSoundMuted = false;
    let soundVolume = 1.0;
    let audioCtx = null;
    let initialized = false;
    const audioBuffers = {};
    const htmlAudioFallback = {};

    const soundFiles = {
        move: 'sounds/move.mp3',
        capture: 'sounds/capture.mp3',
        lowTime: 'sounds/low_time.mp3'
    };

    function getAudioContext() {
        if (!audioCtx && typeof window !== 'undefined') {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            if (AudioContextClass) {
                try {
                    audioCtx = new AudioContextClass();
                } catch (e) {
                    audioCtx = null;
                }
            }
        }
        return audioCtx;
    }

    function preloadSound(name, url) {
        const ctx = getAudioContext();
        if (ctx && typeof fetch !== 'undefined' && typeof ArrayBuffer !== 'undefined') {
            fetch(url)
                .then(response => response.arrayBuffer())
                .then(arrayBuffer => ctx.decodeAudioData(arrayBuffer))
                .then(decodedBuffer => {
                    audioBuffers[name] = decodedBuffer;
                })
                .catch(() => {
                    if (typeof Audio !== 'undefined') {
                        try { htmlAudioFallback[name] = new Audio(url); } catch (e) {}
                    }
                });
        } else if (typeof Audio !== 'undefined') {
            try { htmlAudioFallback[name] = new Audio(url); } catch (e) {}
        }
    }

    function initSounds() {
        if (initialized) return;
        initialized = true;
        for (const [name, url] of Object.entries(soundFiles)) {
            preloadSound(name, url);
        }
    }

    function playSound(name) {
        if (isSoundMuted) return;
        initSounds();
        const ctx = getAudioContext();

        if (ctx && audioBuffers[name]) {
            if (ctx.state === 'suspended') {
                ctx.resume().catch(() => {});
            }
            try {
                const source = ctx.createBufferSource();
                source.buffer = audioBuffers[name];
                const gainNode = ctx.createGain();
                gainNode.gain.value = soundVolume;
                source.connect(gainNode);
                gainNode.connect(ctx.destination);
                source.onended = () => {
                    try {
                        source.disconnect();
                        gainNode.disconnect();
                    } catch (e) {}
                };
                source.start(0);
                return;
            } catch (err) {
                // Fall back
            }
        }

        const audio = htmlAudioFallback[name];
        if (audio && typeof audio.play === 'function') {
            audio.volume = soundVolume;
            audio.currentTime = 0;
            audio.play().catch(() => {});
        }
    }

    const API = {
        getContext() {
            return getAudioContext();
        },
        setMuted(muted) {
            isSoundMuted = !!muted;
        },
        setVolume(vol) {
            soundVolume = parseFloat(vol);
        },
        move() {
            playSound('move');
        },
        capture() {
            playSound('capture');
        },
        lowTime() {
            playSound('lowTime');
        }
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = API;
    }
    return API;
})();
