/**
 * Chess Audio Synthesizer
 * Generates sound effects using Web Audio API oscillators.
 */

const ChessAudio = (() => {
    let context = null;
    let isSoundMuted = false;
    let soundVolume = 1.0;

    function getContext() {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return null;
        if (!context) context = new AudioCtx();
        if (context.state === 'suspended') context.resume().catch(() => {});
        return context;
    }

    function playTone({ type, startFreq, endFreq, duration, volume, delay = 0 }) {
        if (isSoundMuted) return;
        const ctx = getContext();
        if (!ctx) return;

        const startAt = ctx.currentTime + delay;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = type;
        osc.frequency.setValueAtTime(startFreq, startAt);
        if (endFreq && endFreq !== startFreq) {
            osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), startAt + duration);
        }

        const targetVolume = volume * soundVolume;
        gain.gain.setValueAtTime(0.0001, startAt);
        gain.gain.exponentialRampToValueAtTime(targetVolume, startAt + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(startAt);
        osc.stop(startAt + duration + 0.03);
    }

    const API = {
        getContext,
        setMuted(muted) {
            isSoundMuted = !!muted;
        },
        setVolume(vol) {
            soundVolume = parseFloat(vol);
        },
        move() {
            playTone({ type: 'sine', startFreq: 240, endFreq: 180, duration: 0.09, volume: 0.45 });
        },
        capture() {
            playTone({ type: 'triangle', startFreq: 170, endFreq: 115, duration: 0.07, volume: 0.65 });
            playTone({ type: 'square', startFreq: 96, endFreq: 72, duration: 0.12, volume: 0.20, delay: 0.04 });
        },
        check() {
            playTone({ type: 'sawtooth', startFreq: 400, endFreq: 600, duration: 0.12, volume: 0.3 });
            playTone({ type: 'sine', startFreq: 800, endFreq: 700, duration: 0.15, volume: 0.2, delay: 0.05 });
        }
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = API;
    }
    return API;
})();
