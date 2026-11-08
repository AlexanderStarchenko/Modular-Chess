const ChessLogic = require('../js/logic.js');
const fs = require('path');

// Helper to convert UCI string (e.g. 'e2e4' or 'a7a8q') into coordinates
function parseUci(uci) {
    const fC = uci.charCodeAt(0) - 97;
    const fR = 8 - parseInt(uci[1], 10);
    const tC = uci.charCodeAt(2) - 97;
    const tR = 8 - parseInt(uci[3], 10);
    const promo = uci.length > 4 ? uci[4].toLowerCase() : null;
    return { fR, fC, tR, tC, promo };
}

function validateAndBuild(rawLines) {
    const book = {};
    let validCount = 0;
    let failedLines = 0;

    rawLines.forEach((line, idx) => {
        ChessLogic.initBoard();
        let lineOk = true;

        for (let step = 0; step < line.length; step++) {
            const rawUci = line[step];
            const uci = rawUci.replace('x', '').replace('+', '').replace('#', '');
            const fen = ChessLogic.getFen();
            const parts = fen.split(' ');
            const key = parts.slice(0, 4).join(' ');

            if (!book[key]) book[key] = [];
            if (!book[key].includes(uci)) book[key].push(uci);

            const m = parseUci(uci);
            const ok = ChessLogic.movePiece(m.fR, m.fC, m.tR, m.tC);
            if (!ok) {
                console.error(`Line ${idx + 1} step ${step + 1} FAILED MOVE: "${uci}" (raw: "${rawUci}") in FEN: ${fen}`);
                lineOk = false;
                failedLines++;
                break;
            }
            validCount++;
        }
    });

    return { book, validCount, failedLines };
}

module.exports = { validateAndBuild, parseUci };
