console.log('[Worker] Script starting...');

try {
    console.log('[Worker] Importing scripts...');
    importScripts('logic.js', 'ai_shared.js', 'ai_easy.js', 'ai_medium.js', 'ai_hard.js', 'ai_very_hard.js');
    console.log('[Worker] Scripts imported successfully');
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
