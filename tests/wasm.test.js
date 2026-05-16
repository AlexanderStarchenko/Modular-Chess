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
        boardPtr = 32768;
        
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
        setPiece(0, 0, 'Q'); // +90
        setPiece(7, 7, 'r'); // -50
        setPiece(1, 1, 'P'); // +10
        
        const score = wasmInstance.evaluateMaterial(boardPtr);
        expect(score).toBe(50); // 90 - 50 + 10
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
});
