console.log('[Worker] Script starting...');

try {
    console.log('[Worker] Importing scripts...');
    importScripts('wasm_loader.js', 'logic.js', 'ai_shared.js', 'ai_easy.js', 'ai_medium.js', 'ai_hard.js', 'ai_very_hard.js');
    console.log('[Worker] Scripts imported successfully');

    // Asynchronously initialize WASM inside the Worker
    if (typeof ChessWASM !== 'undefined') {
        ChessWASM.init().then(success => {
            console.log('[Worker] ChessWASM initialized inside worker:', success);
        }).catch(err => {
            console.error('[Worker] ChessWASM init failed inside worker:', err);
        });
    }
} catch (e) {
    console.error('[Worker] importScripts failed:', e);
}

onmessage = function(e) {
    const { state, difficulty } = e.data;
    console.log('[Worker] Received task:', difficulty, state.turn);
    
    try {
        if (typeof ChessLogic === 'undefined') {
            console.error('[Worker] ChessLogic is undefined! Global keys:', Object.keys(self).filter(k => k.includes('Chess')));
            throw new Error('ChessLogic is not defined in worker');
        }
        
        ChessLogic.loadState(state);
        
        let bestMove = null;
        const turn = state.turn;
        
        // Try opening book first!
        if (typeof ChessLogic.getFen === 'function' && typeof ChessAIShared !== 'undefined' && typeof ChessAIShared.getOpeningBookMove === 'function') {
            const currentFen = ChessLogic.getFen();
            bestMove = ChessAIShared.getOpeningBookMove(currentFen);
        }
        
        if (bestMove) {
            console.log('[Worker] Opening book move found:', bestMove);
            postMessage({ bestMove });
            return;
        }
        
        console.log('[Worker] Starting search for difficulty:', difficulty);

        if (difficulty === '1') {
            bestMove = ChessAIEasy.getBestMove(turn);
        } else if (difficulty === '2') {
            bestMove = ChessAIMedium.getBestMove(turn);
        } else if (difficulty === '3') {
            bestMove = ChessAIHard.getBestMove(turn);
        } else if (difficulty === '4') {
            bestMove = ChessAIVeryHard.getBestMove(turn);
        }
        
        console.log('[Worker] Best move found:', bestMove);
        postMessage({ bestMove });
    } catch (err) {
        console.error('[Worker] Runtime Error:', err);
        postMessage({ error: err.message });
    }
};
