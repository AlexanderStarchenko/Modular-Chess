/**
 * Chess Audio Player
 * Plays standard MP3 sound assets for chess moves, captures, draws, low time warning, and checkmate.
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
                draw: new Audio('sounds/draw.mp3'),
                lowTime: new Audio('sounds/low_time.mp3'),
                checkmate: new Audio('sounds/checkmate.mp3')
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
        draw() {
            playSound('draw');
        },
        lowTime() {
            playSound('lowTime');
        },
        checkmate() {
            playSound('checkmate');
        }
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = API;
    }
    return API;
})();
