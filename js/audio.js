/**
 * Chess Audio Synthesizer / Player
 * Plays standard MP3 sound assets for chess moves, captures, checks, game end conditions, and notifications.
 */

const ChessAudio = (() => {
    let isSoundMuted = false;
    let soundVolume = 1.0;
    let sounds = null;

    function initSounds() {
        if (sounds) return;
        if (typeof Audio !== 'undefined') {
            sounds = {
                move: new Audio('sounds/move.mp3'),
                capture: new Audio('sounds/capture.mp3'),
                check: new Audio('sounds/check.mp3'),
                victory: new Audio('sounds/victory.mp3'),
                defeat: new Audio('sounds/defeat.mp3'),
                draw: new Audio('sounds/draw.mp3'),
                generic: new Audio('sounds/generic.mp3'),
                lowTime: new Audio('sounds/low_time.mp3')
            };
        } else {
            sounds = {};
        }
    }

    function playSound(name) {
        initSounds();
        if (isSoundMuted) return;
        const audio = sounds[name];
        if (audio) {
            audio.volume = soundVolume;
            audio.currentTime = 0;
            audio.play().catch(() => {});
        }
    }

    const API = {
        getContext() {
            // Return null as we are using HTML5 Audio element playbacks
            return null;
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
        check() {
            playSound('check');
        },
        victory() {
            playSound('victory');
        },
        defeat() {
            playSound('defeat');
        },
        draw() {
            playSound('draw');
        },
        genericNotify() {
            playSound('generic');
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
