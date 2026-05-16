/**
 * WebAssembly Loader for Chess Core
 */

window.ChessWASM = (() => {
    let instance = null;

    async function init() {
        try {
            let wasmBuffer;
            
            // Check if we are in Electron/Node environment safely
            const isElectron = typeof process !== 'undefined' && process.versions && process.versions.electron;
            
            if (isElectron && typeof require !== 'undefined') {
                try {
                    const fs = require('fs');
                    const path = require('path');
                    // In Electron __dirname is available
                    const wasmPath = path.join(__dirname, 'build', 'release.wasm');
                    const buffer = fs.readFileSync(wasmPath);
                    wasmBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
                } catch (e) {
                    console.warn('[WASM] Electron direct load failed, falling back to fetch', e);
                    const response = await fetch('./build/release.wasm');
                    wasmBuffer = await response.arrayBuffer();
                }
            } else {
                // Standard web fetch
                const response = await fetch('./build/release.wasm');
                wasmBuffer = await response.arrayBuffer();
            }

            const wasm = await WebAssembly.instantiate(wasmBuffer, {
                env: {
                    abort: () => console.log("WASM Abort!")
                }
            });
            instance = wasm.instance.exports;
            console.log('[WASM] Chess Core Loaded Successfully');
            return true;
        } catch (e) {
            console.error('[WASM] Failed to load chess core:', e);
            return false;
        }
    }

    /**
     * Fast material evaluation using WASM
     * @param {Array} board 2D array
     */
    function getSafePtr(size) {
        if (!instance) return 0;
        // The user suggested 32768 is safe. 
        // We will use it as the default base to ensure maximum compatibility.
        const base = 32768;
        
        // Ensure memory is large enough
        const required = base + size;
            if (instance.memory.buffer.byteLength < required) {
                const pagesNeeded = Math.ceil((required - instance.memory.buffer.byteLength) / 65536);
                instance.memory.grow(pagesNeeded);
            }
            return base;
    }

    function evaluateMaterial(board) {
        if (!instance) return 0;
        const flatBoard = flattenBoard(board);
        const ptr = getSafePtr(64);
        const mem = new Uint8Array(instance.memory.buffer);
        mem.set(flatBoard, ptr);
        return instance.evaluateMaterial(ptr);
    }

    function isSquareAttacked(row, col, attackerColor, board) {
        if (!instance) return false;
        const flatBoard = flattenBoard(board);
        const ptr = getSafePtr(64);
        const mem = new Uint8Array(instance.memory.buffer);
        mem.set(flatBoard, ptr);
        const colorCode = attackerColor === 'w' ? 0 : 128;
        return instance.isSquareAttacked(row, col, colorCode, ptr) === 1;
    }

    function flattenBoard(board) {
        const flat = new Uint8Array(64);
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const piece = board[r][c];
                flat[r * 8 + c] = piece ? piece.charCodeAt(0) : 0;
            }
        }
        return flat;
    }

    return {
        init,
        evaluateMaterial,
        isSquareAttacked,
        isLoaded: () => !!instance
    };
})();
