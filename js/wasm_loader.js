/**
 * WebAssembly Loader for Chess Core
 */

const glob = typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : this));

glob.ChessWASM = (() => {
    let instance = null;
    let memView = null;

    async function init() {
        try {
            let wasmBuffer;
            
            // Check if we are in Electron/Node environment safely
            const isElectron = typeof process !== 'undefined' && process.versions && process.versions.electron;
            
            if (isElectron && typeof require !== 'undefined') {
                try {
                    const fs = require('fs');
                    const path = require('path');
                    
                    // In a Web Worker, __dirname is not available, so we fallback
                    const baseDir = typeof __dirname !== 'undefined' ? __dirname : process.cwd();
                    const wasmPath = path.join(baseDir, 'build', 'release.wasm');
                    const buffer = fs.readFileSync(wasmPath);
                    wasmBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
                } catch (e) {
                    console.warn('[WASM] Electron direct load failed, falling back to fetch', e);
                    wasmBuffer = await loadViaFetch();
                }
            } else {
                wasmBuffer = await loadViaFetch();
            }

            const wasm = await WebAssembly.instantiate(wasmBuffer, {
                env: {
                    abort: () => console.log("WASM Abort!")
                }
            });
            instance = wasm.instance.exports;
            memView = new Uint8Array(instance.memory.buffer);
            console.log('[WASM] Chess Core Loaded Successfully');
            return true;
        } catch (e) {
            console.error('[WASM] Failed to load chess core:', e);
            return false;
        }
    }

    async function loadViaFetch() {
        let wasmUrl = './build/release.wasm';
        // In Web Worker inside /js/ folder, adjust relative URL to go up one folder
        if (typeof self !== 'undefined' && self.location && self.location.pathname.includes('/js/')) {
            wasmUrl = '../build/release.wasm';
        }
        const response = await fetch(wasmUrl);
        return await response.arrayBuffer();
    }

    function getMemView() {
        if (!instance) return null;
        // Safely recreate view if memory grew
        if (!memView || memView.buffer !== instance.memory.buffer) {
            memView = new Uint8Array(instance.memory.buffer);
        }
        return memView;
    }

    function getSafePtr(size) {
        if (!instance) return 0;
        const base = 32768; // Safe heap base determined by tests
        
        // Ensure memory is large enough
        const required = base + size;
        if (instance.memory.buffer.byteLength < required) {
            const pagesNeeded = Math.ceil((required - instance.memory.buffer.byteLength) / 65536);
            instance.memory.grow(pagesNeeded);
        }
        return base;
    }

    function writeBoardToWASM(board, ptr) {
        const mem = getMemView();
        if (!mem) return;
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const piece = board[r][c];
                mem[ptr + (r << 3) + c] = piece ? piece.charCodeAt(0) : 0;
            }
        }
    }

    function evaluateMaterial(board) {
        if (!instance) return 0;
        const ptr = getSafePtr(64);
        writeBoardToWASM(board, ptr);
        return instance.evaluateMaterial(ptr);
    }

    function isSquareAttacked(row, col, attackerColor, board) {
        if (!instance) return false;
        const ptr = getSafePtr(64);
        writeBoardToWASM(board, ptr);
        const colorCode = attackerColor === 'w' ? 0 : 128;
        return instance.isSquareAttacked(row, col, colorCode, ptr) === 1;
    }

    return {
        init,
        evaluateMaterial,
        isSquareAttacked,
        isLoaded: () => !!instance
    };
})();
