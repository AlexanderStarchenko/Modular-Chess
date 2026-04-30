importScripts('logic.js', 'ai_shared.js', 'ai_easy.js', 'ai_medium.js', 'ai_hard.js', 'ai_very_hard.js');

onmessage = function(e) {
    const { state, difficulty } = e.data;
    
    ChessLogic.loadState(state);
    
    let bestMove = null;
    const turn = state.turn;
    
    if (difficulty === '1') {
        bestMove = ChessAIEasy.getBestMove(turn);
    } else if (difficulty === '2') {
        bestMove = ChessAIMedium.getBestMove(turn);
    } else if (difficulty === '3') {
        bestMove = ChessAIHard.getBestMove(turn);
    } else if (difficulty === '4') {
        bestMove = ChessAIVeryHard.getBestMove(turn);
    }
    
    postMessage({ bestMove });
};
