const ChessLogic = require('../js/logic.js');
const fs = require('fs');
const path = require('path');

const additionalLines = [
    // --- Additional Sicilian Lines ---
    ['e2e4', 'c7c5', 'g1f3', 'e7e6', 'd2d4', 'c5d4', 'f3d4', 'g8f6', 'b1c3', 'f8b4', 'e4e5', 'f6d5', 'c1d2', 'd5c3', 'b2c3', 'b4e7', 'd1g4', 'e8g8', 'f1d3', 'd7d6'], // Sicilian Pin
    ['e2e4', 'c7c5', 'g1f3', 'a7a6', 'c2c3', 'd7d5', 'e4d5', 'd8d5', 'd2d4', 'g8f6', 'f1e2', 'c8g4', 'e1g1', 'e7e6', 'h2h3', 'g4h5', 'c1e3', 'c5d4', 'c3d4'], // Sicilian O'Kelly
    ['e2e4', 'c7c5', 'g1f3', 'g8f6', 'e4e5', 'f6d5', 'b1c3', 'e7e6', 'c3d5', 'e6d5', 'd2d4', 'b8c6', 'd4c5', 'f8c5', 'd1d5', 'd8b6', 'f1c4', 'c5f2', 'e1e2', 'e8g8'], // Sicilian Nimzowitsch
    ['e2e4', 'c7c5', 'b1c3', 'b8c6', 'f2f4', 'g7g6', 'g1f3', 'f8g7', 'f1c4', 'e7e6', 'f4f5', 'g8e7', 'f5e6', 'd7e6', 'd2d3', 'e8g8', 'e1g1', 'c6a5', 'c1e3', 'b7b6'], // Grand Prix Attack

    // --- Additional Ruy Lopez & Italian Lines ---
    ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1b5', 'a7a6', 'b5c6', 'd7c6', 'e1g1', 'd8d6', 'd2d4', 'e5d4', 'f3d4', 'c8d7', 'c1e3', 'e8c8', 'b1d2', 'd6g6', 'd1f3', 'f8d6'], // Ruy Lopez Gligoric
    ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1b5', 'g8e7', 'c2c3', 'd7d5', 'e4d5', 'd8d5', 'd1e2', 'c8d7', 'e1g1', 'e8c8', 'f1e1', 'f7f6', 'd2d4', 'e5d4', 'c3d4'], // Ruy Lopez Cozio
    ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1b5', 'c6d4', 'f3d4', 'e5d4', 'e1g1', 'f8c5', 'd2d3', 'c7c6', 'b5c4', 'd7d5', 'e4d5', 'c6d5', 'c4b5', 'c8d7', 'f1e1', 'g8e7'], // Ruy Lopez Bird
    ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'f8c5', 'b2b4', 'c5b6', 'a2a4', 'a7a6', 'b1c3', 'g8f6', 'c3d5', 'f6d5', 'e4d5', 'c6d4', 'a4a5', 'b6a7', 'd2d3', 'd7d6'], // Evans Declined
    ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'g8f6', 'd2d3', 'f8e7', 'e1g1', 'd7d6', 'f1e1', 'e8g8', 'c2c3', 'c6a5', 'c4b5', 'a7a6', 'b5a4', 'b7b5', 'a4c2', 'c7c5'], // Italian 4.d3 Be7

    // --- Additional French & Caro-Kann Lines ---
    ['e2e4', 'e7e6', 'd2d4', 'd7d5', 'b1c3', 'g8f6', 'c1g5', 'f8b4', 'e4e5', 'h7h6', 'c1d2', 'b4c3', 'b2c3', 'f6e4', 'd1g4', 'g7g6', 'f1d3', 'e4d2', 'e1d2', 'c7c5'], // French McCutcheon
    ['e2e4', 'e7e6', 'd2d4', 'd7d5', 'b1c3', 'g8f6', 'c1g5', 'd5e4', 'c3e4', 'f8e7', 'g5f6', 'e7f6', 'g1f3', 'e8g8', 'd1d2', 'b8d7', 'e1c1', 'f6e7', 'f1d3', 'b7b6'], // French Burn
    ['e2e4', 'c7c6', 'd2d4', 'd7d5', 'e4e5', 'c8f5', 'g1f3', 'e7e6', 'f1e2', 'b8d7', 'e1g1', 'h7h6', 'b1d2', 'g8e7', 'd2b3', 'g7g5', 'c1d2', 'f8g7', 'c2c4', 'e8g8'], // Caro-Kann Advance Short
    ['e2e4', 'c7c6', 'd2d4', 'd7d5', 'f2f3', 'd5e4', 'f3e4', 'e7e5', 'g1f3', 'c8g4', 'f1c4', 'b8d7', 'c2c3', 'g8f6', 'd1b3', 'd8e7', 'e1g1', 'b7b5', 'c4d3'], // Caro-Kann Fantasy

    // --- Queen's Gambit & Indian Defenses Additional ---
    ['d2d4', 'd7d5', 'c2c4', 'e7e5', 'd4e5', 'd5d4', 'g1f3', 'b8c6', 'a2a3', 'c8g4', 'b1d2', 'd8e7', 'h2h3', 'g4f3', 'd2f3', 'e8c8', 'c1f4', 'f7f6', 'e5f6', 'g8f6'], // Albin Countergambit
    ['d2d4', 'd7d5', 'c2c4', 'b8c6', 'g1f3', 'c8g4', 'c4d5', 'g4f3', 'g2f3', 'd8d5', 'e2e3', 'e7e5', 'b1c3', 'f8b4', 'c1d2', 'b4c3', 'b2c3', 'e5d4', 'c3d4', 'g8e7'], // Chigorin Defense
    ['d2d4', 'd7d5', 'c2c4', 'e7e6', 'b1c3', 'g8f6', 'c1g5', 'f8e7', 'e2e3', 'e8g8', 'g1f3', 'b8d7', 'a1c1', 'c7c6', 'f1d3', 'd5c4', 'd3c4', 'f6d5', 'g5e7', 'd8e7', 'e1g1', 'd5c3', 'c1c3', 'e6e5', 'd1c2', 'e5d4', 'e3d4', 'd7f6', 'f1e1', 'e7d6'], // QGD Orthodox
    ['d2d4', 'd7d5', 'c2c4', 'c7c6', 'g1f3', 'g8f6', 'b1c3', 'e7e6', 'c1g5', 'h7h6', 'g5h4', 'd5c4', 'e2e4', 'g7g5', 'h4g3', 'b7b5', 'f1e2', 'c8b7', 'e1g1', 'b8d7', 'f3e5', 'f8g7'], // Semi-Slav Anti-Moscow
    ['d2d4', 'g8f6', 'c2c4', 'g7g6', 'b1c3', 'f8g7', 'e2e4', 'd7d6', 'f2f4', 'e8g8', 'g1f3', 'c7c5', 'd4d5', 'e7e6', 'f1e2', 'e6d5', 'c4d5', 'f8e8', 'e4e5', 'd6e5', 'f4e5', 'f6g4', 'c1g5', 'd8b6'], // KID Four Pawns
    ['d2d4', 'g8f6', 'c2c4', 'g7g6', 'b1c3', 'f8g7', 'e2e4', 'd7d6', 'f1e2', 'e8g8', 'c1g5', 'c7c5', 'd4d5', 'h7h6', 'g5f4', 'e7e6', 'd1d2', 'e6d5', 'e4d5', 'g8h7', 'g1f3'], // KID Averbakh
    ['d2d4', 'g8f6', 'c2c4', 'g7g6', 'b1c3', 'd7d5', 'c1f4', 'f8g7', 'e2e3', 'e8g8', 'a1c1', 'c7c5', 'd4c5', 'd8a5', 'c4d5', 'f8d8', 'f1c4', 'a5c5', 'c4b3'], // Grunfeld 4.Bf4
    ['d2d4', 'g8f6', 'c2c4', 'g7g6', 'b1c3', 'd7d5', 'c1g5', 'f6e4', 'g5h4', 'e4c3', 'b2c3', 'd5c4', 'e2e3', 'c8e6', 'a1b1', 'b7b6', 'g1e2', 'f8g7', 'e2f4'], // Grunfeld 4.Bg5
    ['d2d4', 'g8f6', 'c2c4', 'e7e6', 'b1c3', 'f8b4', 'f2f3', 'd7d5', 'a2a3', 'b4c3', 'b2c3', 'c7c5', 'c4d5', 'f6d5', 'd4c5', 'f7f5', 'e2e3', 'e8g8', 'f1c4', 'd5c3'], // Nimzo 4.f3
    ['d2d4', 'd7d5', 'g1f3', 'g8f6', 'e2e3', 'e7e6', 'f1d3', 'c7c5', 'b2b3', 'b8c6', 'e1g1', 'f8d6', 'c1b2', 'e8g8', 'b1d2', 'd8e7', 'f3e5', 'c5d4', 'e3d4', 'd6a3'], // Colle-Zukertort
    ['d2d4', 'g8f6', 'g1f3', 'e7e6', 'c1g5', 'c7c5', 'e2e3', 'f8e7', 'b1d2', 'b7b6', 'c2c3', 'c8b7', 'f1d3', 'c5d4', 'e3d4', 'd7d6', 'e1g1', 'b8d7', 'f1e1', 'e8g8'], // Torre Attack Classical
    ['d2d4', 'd7d5', 'e2e4', 'd5e4', 'b1c3', 'g8f6', 'f2f3', 'e4f3', 'g1f3', 'e7e6', 'c1g5', 'f8e7', 'f1d3', 'e8g8', 'e1g1', 'b8d7', 'd1e1', 'f8e8', 'a1d1'], // Blackmar-Diemer

    // --- Flank & Classical Openings Additional ---
    ['c2c4', 'e7e5', 'b1c3', 'b8c6', 'g2g3', 'g7g6', 'f1g2', 'f8g7', 'd2d3', 'd7d6', 'e2e4', 'f7f5', 'g1e2', 'g8f6', 'e1g1', 'e8g8', 'c3d5', 'c8e6', 'c1g5', 'd8d7'], // English Botvinnik
    ['c2c4', 'f7f5', 'b1c3', 'g8f6', 'g2g3', 'g7g6', 'f1g2', 'f8g7', 'd2d3', 'd7d6', 'e2e4', 'e7e5', 'g1e2', 'e8g8', 'e1g1', 'c7c6', 'f2f4', 'd8b6', 'g1h1'], // Anglo-Dutch
    ['e2e4', 'e7e5', 'd2d4', 'e5d4', 'c2c3', 'd4c3', 'f1c4', 'c3b2', 'c1b2', 'd7d5', 'c4d5', 'g8f6', 'd5f7', 'e8f7', 'd1d8', 'f8b4', 'd8d2', 'b4d2', 'b1d2', 'h8e8'], // Danish Gambit
    ['e2e4', 'e7e5', 'd2d4', 'e5d4', 'd1d4', 'b8c6', 'd4e3', 'g8f6', 'b1c3', 'f8b4', 'c1d2', 'e8g8', 'e1c1', 'f8e8', 'e3g3', 'e8e4', 'a2a3', 'b4d6', 'f2f4', 'e4e8'], // Center Game
    ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'c2c3', 'd7d5', 'd1a4', 'f7f6', 'f1b5', 'g8e7', 'e4d5', 'd8d5', 'e1g1', 'c8d7', 'd2d4', 'e5d4', 'c3d4', 'e8c8', 'b1c3', 'd5h5'], // Ponziani
    ['e2e4', 'e7e5', 'f1c4', 'g8f6', 'd2d3', 'c7c6', 'g1f3', 'd7d5', 'c4b3', 'f8d6', 'b1c3', 'd5e4', 'd3e4', 'e8g8', 'e1g1', 'b8a6', 'c1g5', 'h7h6', 'g5h4']  // Bishop's Opening
];

function parseUci(uci) {
    const fC = uci.charCodeAt(0) - 97;
    const fR = 8 - parseInt(uci[1], 10);
    const tC = uci.charCodeAt(2) - 97;
    const tR = 8 - parseInt(uci[3], 10);
    return { fR, fC, tR, tC };
}

console.log(`Validating and appending ${additionalLines.length} extra theoretical opening lines...`);

const validAdditional = [];
additionalLines.forEach((line, idx) => {
    ChessLogic.initBoard();
    let lineOk = true;

    for (let step = 0; step < line.length; step++) {
        const uci = line[step];
        const m = parseUci(uci);
        const ok = ChessLogic.movePiece(m.fR, m.fC, m.tR, m.tC);
        if (!ok) {
            console.error(`Additional Line ${idx + 1} step ${step + 1} FAILED: "${uci}"`);
            lineOk = false;
            break;
        }
    }
    if (lineOk) {
        validAdditional.push(line);
    }
});

console.log(`Successfully verified ${validAdditional.length} / ${additionalLines.length} additional lines.`);

// Read generate_book.js
const genBookPath = path.join(__dirname, 'generate_book.js');
let genBookCode = fs.readFileSync(genBookPath, 'utf-8');

// Insert new lines before the closing bracket of rawLines
const closingBracketIdx = genBookCode.lastIndexOf('];');
if (closingBracketIdx === -1) {
    console.error('Could not find rawLines closing bracket in generate_book.js');
    process.exit(1);
}

const formattedLines = validAdditional.map(l => '    ' + JSON.stringify(l) + ',').join('\n');
const updatedCode = genBookCode.slice(0, closingBracketIdx) + ',\n    // --- EXTENDED MASTER REPERTOIRE ---\n' + formattedLines + '\n' + genBookCode.slice(closingBracketIdx);

fs.writeFileSync(genBookPath, updatedCode, 'utf-8');
console.log('Updated scripts/generate_book.js with new lines.');
