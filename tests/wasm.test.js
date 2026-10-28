/**
 * Comprehensive WebAssembly Chess Core Tests
 */
const fs = require('fs');
const path = require('path');

describe('WebAssembly Chess Core - Safety & Logic', () => {
    let wasmInstance;
    let boardPtr;
    let mem;

    beforeAll(async () => {
        const wasmPath = path.join(__dirname, '../build/release.wasm');
        if (!fs.existsSync(wasmPath)) {
            throw new Error('release.wasm not found. Please run "npm run build" first.');
        }
        const buffer = fs.readFileSync(wasmPath);
        const wasm = await WebAssembly.instantiate(buffer, {
            env: { abort: () => console.error('WASM Abort') }
        });
        
        wasmInstance = wasm.instance.exports;
        
        // Dynamically determine the safe memory address starting point from exported function
        boardPtr = (typeof wasmInstance.getBoardPtr === 'function')
            ? wasmInstance.getBoardPtr()
            : 32768;
        
        // Ensure memory is large enough to hold our board data (at least boardPtr + 64 bytes)
        const requiredBytes = boardPtr + 64;
        if (wasmInstance.memory.buffer.byteLength < requiredBytes) {
            const pagesNeeded = Math.ceil((requiredBytes - wasmInstance.memory.buffer.byteLength) / 65536);
            wasmInstance.memory.grow(pagesNeeded);
        }

        mem = new Uint8Array(wasmInstance.memory.buffer);
    });

    const clearBoard = () => mem.fill(0, boardPtr, boardPtr + 64);
    const setPiece = (r, c, char) => {
        mem[boardPtr + (r << 3) + c] = char.charCodeAt(0);
    };

    test('Material Evaluation: Base Accuracy', () => {
        clearBoard();
        setPiece(0, 0, 'Q'); // +900 (White Queen at A8, PST: -20 = 880)
        setPiece(7, 7, 'r'); // -500 (Black Rook at H1, PST: 0 = -500)
        setPiece(1, 1, 'P'); // +100 (White Pawn at B7, PST: +50 = 150)
        
        const score = wasmInstance.evaluateMaterial(boardPtr);
        expect(score).toBe(570); // 880 - 500 + 150 = 530, + 40 (passed pawn +80, isolated pawn -15, open rook file -25) = 570
    });

    test('Attack Detection: Knight Leaps', () => {
        clearBoard();
        setPiece(4, 4, 'N'); // White Knight at E4
        
        // Check L-shape squares
        expect(wasmInstance.isSquareAttacked(2, 3, 0, boardPtr)).toBe(1);
        expect(wasmInstance.isSquareAttacked(2, 5, 0, boardPtr)).toBe(1);
        expect(wasmInstance.isSquareAttacked(6, 3, 0, boardPtr)).toBe(1);
        // Check non-attacked square
        expect(wasmInstance.isSquareAttacked(4, 5, 0, boardPtr)).toBe(0);
    });

    test('Attack Detection: Pawn Directional Logic', () => {
        clearBoard();
        setPiece(4, 4, 'P'); // White Pawn at E4 attacks D5, F5
        setPiece(4, 6, 'p'); // Black Pawn at G4 attacks F3, H3
        
        expect(wasmInstance.isSquareAttacked(3, 3, 0, boardPtr)).toBe(1); // White attacks D5
        expect(wasmInstance.isSquareAttacked(5, 5, 1, boardPtr)).toBe(1); // Black attacks F3
        
        expect(wasmInstance.isSquareAttacked(5, 5, 0, boardPtr)).toBe(0); // White doesn't attack behind
    });

    test('Sliding Pieces: Ray Casting & Obstacles', () => {
        clearBoard();
        setPiece(0, 0, 'R'); // White Rook at A8
        
        // Path is clear to A1
        expect(wasmInstance.isSquareAttacked(7, 0, 0, boardPtr)).toBe(1);
        
        // Put obstacle at A4
        setPiece(4, 0, 'p'); 
        
        // Rook should still attack A4, but NOT A1 anymore
        expect(wasmInstance.isSquareAttacked(4, 0, 0, boardPtr)).toBe(1);
        expect(wasmInstance.isSquareAttacked(7, 0, 0, boardPtr)).toBe(0);
    });

    test('Sliding Pieces: Bishop Diagonals', () => {
        clearBoard();
        setPiece(4, 4, 'B'); // White Bishop at E4
        
        expect(wasmInstance.isSquareAttacked(2, 2, 0, boardPtr)).toBe(1); // C6
        expect(wasmInstance.isSquareAttacked(6, 6, 0, boardPtr)).toBe(1); // G2
        
        setPiece(3, 3, 'N'); // White Knight blocking the diagonal
        expect(wasmInstance.isSquareAttacked(2, 2, 0, boardPtr)).toBe(0); // C6 blocked
    });

    test('Zobrist Hashing & TT Initialization', () => {
        expect(() => wasmInstance.ensureZobristInitialized()).not.toThrow();
    });

    test('WASM Minimax Search: Simple Mate in 1', () => {
        clearBoard();
        // White King on F7 (row 1, col 5), White Queen on G6 (row 2, col 6), Black King on H8 (row 0, col 7).
        // Qg7# is checkmate.
        setPiece(1, 5, 'K'); 
        setPiece(2, 6, 'Q'); 
        setPiece(0, 7, 'k'); 
        
        wasmInstance.setGameState(0, 0, -1, 0);
        const bestMoveVal = wasmInstance.searchWASM(1, 1, -1000000, 1000000);
        
        const from = bestMoveVal & 0x3F;
        const to = (bestMoveVal >> 6) & 0x3F;
        const score = wasmInstance.getSearchScore();
        
        expect(from).toBe(22); // G6
        expect([14, 31, 6]).toContain(to);
        expect(score).toBeGreaterThan(90000); 
    });
});
