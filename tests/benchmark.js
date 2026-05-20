/**
 * Chess Performance Benchmark
 * Compares pure JS implementations against AssemblyScript WASM implementations.
 * Measures the raw speed and the cost of the JS-WASM boundary tax.
 */

const fs = require('fs');
const path = require('path');

// Load JS modules
const ChessLogic = require('../js/logic');
const ChessAIShared = require('../js/ai_shared');

async function runBenchmark() {
    console.log('==================================================');
    console.log('           CHESS ENGINE BENCHMARK (JS vs WASM)    ');
    console.log('==================================================\n');

    // 1. Load WebAssembly Module
    const wasmPath = path.join(__dirname, '../build/release.wasm');
    if (!fs.existsSync(wasmPath)) {
        console.error('Error: build/release.wasm not found. Run npm run build first.');
        process.exit(1);
    }
    
    console.log('[WASM] Loading release.wasm...');
    const buffer = fs.readFileSync(wasmPath);
    const wasm = await WebAssembly.instantiate(buffer, {
        env: { abort: () => console.error('WASM Abort') }
    });
    const wasmInstance = wasm.instance.exports;
    console.log('[WASM] Loaded successfully!\n');

    const boardPtr = 32768; // Safe heap base
    const requiredBytes = boardPtr + 64;
    if (wasmInstance.memory.buffer.byteLength < requiredBytes) {
        const pagesNeeded = Math.ceil((requiredBytes - wasmInstance.memory.buffer.byteLength) / 65536);
        wasmInstance.memory.grow(pagesNeeded);
    }
    const mem = new Uint8Array(wasmInstance.memory.buffer);

    // Initialize board
    ChessLogic.initBoard();
    const board = ChessLogic.getBoard();

    // 2. Helper to flatten board (similar to wasm_loader.js)
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

    // Benchmark 1: Material Evaluation
    console.log('--- BENCHMARK 1: Material Evaluation (100,000 runs) ---');
    
    // JS Material Eval
    let start = Date.now();
    let jsScoreSum = 0;
    for (let i = 0; i < 100000; i++) {
        jsScoreSum += ChessAIShared.evaluateBoard(board);
    }
    let jsEvalTime = Date.now() - start;
    console.log(`JS evaluateBoard:    ${jsEvalTime} ms`);

    // WASM Material Eval (Direct Memory Write + Call)
    start = Date.now();
    let wasmScoreSumDirect = 0;
    const flatBoard = flattenBoard(board);
    for (let i = 0; i < 100000; i++) {
        mem.set(flatBoard, boardPtr);
        wasmScoreSumDirect += wasmInstance.evaluateMaterial(boardPtr);
    }
    let wasmEvalTimeDirect = Date.now() - start;
    console.log(`WASM evaluateMaterial (Direct Write): ${wasmEvalTimeDirect} ms (Speedup: ${(jsEvalTime / wasmEvalTimeDirect).toFixed(2)}x)`);

    // WASM Material Eval (With Boundary Tax - flattening and re-allocating view every time)
    start = Date.now();
    let wasmScoreSumTaxed = 0;
    for (let i = 0; i < 100000; i++) {
        const flat = flattenBoard(board);
        const view = new Uint8Array(wasmInstance.memory.buffer);
        view.set(flat, boardPtr);
        wasmScoreSumTaxed += wasmInstance.evaluateMaterial(boardPtr);
    }
    let wasmEvalTimeTaxed = Date.now() - start;
    console.log(`WASM evaluateMaterial (Boundary Taxed): ${wasmEvalTimeTaxed} ms (Boundary Tax Overhead: ${((wasmEvalTimeTaxed - wasmEvalTimeDirect) / wasmEvalTimeDirect * 100).toFixed(0)}% slower than direct)\n`);


    // Benchmark 2: Attack Detection (isSquareAttacked vs isKingInCheck)
    console.log('--- BENCHMARK 2: Attack Detection / King Checks (50,000 runs) ---');

    // JS King In Check (performs full board search for King + multiple checks)
    start = Date.now();
    let jsCheckCount = 0;
    for (let i = 0; i < 50000; i++) {
        if (ChessLogic.isKingInCheck('w')) jsCheckCount++;
    }
    let jsCheckTime = Date.now() - start;
    console.log(`JS isKingInCheck (White):   ${jsCheckTime} ms`);

    // WASM isSquareAttacked (White Attacker at specific square)
    // Find white king row/col
    let kR = 7, kC = 4;
    start = Date.now();
    let wasmAttackCount = 0;
    const flatBoard2 = flattenBoard(board);
    for (let i = 0; i < 50000; i++) {
        mem.set(flatBoard2, boardPtr);
        // colorCode: 0 for White
        if (wasmInstance.isSquareAttacked(kR, kC, 0, boardPtr) === 1) wasmAttackCount++;
    }
    let wasmAttackTime = Date.now() - start;
    console.log(`WASM isSquareAttacked:       ${wasmAttackTime} ms (Speedup: ${(jsCheckTime / wasmAttackTime).toFixed(2)}x)`);

    // WASM isSquareAttacked (With Boundary Tax)
    start = Date.now();
    for (let i = 0; i < 50000; i++) {
        const flat = flattenBoard(board);
        const view = new Uint8Array(wasmInstance.memory.buffer);
        view.set(flat, boardPtr);
        wasmInstance.isSquareAttacked(kR, kC, 0, boardPtr);
    }
    let wasmAttackTimeTaxed = Date.now() - start;
    console.log(`WASM isSquareAttacked (Taxed): ${wasmAttackTimeTaxed} ms (Boundary Tax Overhead: ${((wasmAttackTimeTaxed - wasmAttackTime) / wasmAttackTime * 100).toFixed(0)}% slower than direct)\n`);

    console.log('==================================================');
    console.log('               BENCHMARK CONCLUSIONS              ');
    console.log('==================================================');
    console.log(`1. Raw WASM computations are extremely fast.`);
    console.log(`2. The "Boundary Tax" (JS to WASM serialization and view allocations)`);
    console.log(`   adds an overhead of about ${((wasmEvalTimeTaxed - wasmEvalTimeDirect) / wasmEvalTimeDirect * 100).toFixed(0)}% to ${((wasmAttackTimeTaxed - wasmAttackTime) / wasmAttackTime * 100).toFixed(0)}%.`);
    console.log(`3. To maximize performance, the entire search loop (minimax)`);
    console.log(`   and board representation MUST reside in WASM memory.`);
    console.log('==================================================\n');
}

runBenchmark().catch(console.error);
