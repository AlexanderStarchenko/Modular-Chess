const ChessAIShared = require('../js/ai_shared.js');
const ChessLogic = require('../js/logic.js');

console.log('Testing opening book from starting position:');
ChessLogic.initBoard();
const fen = ChessLogic.getFen();
const bookMove = ChessAIShared.getOpeningBookMove(fen);
console.log('Book move:', bookMove);

console.log('Testing board evaluation after e2e4:');
const board = ChessLogic.getBoard().map(r => r.slice());
board[4][4] = board[6][4];
board[6][4] = null;
const evalCp = ChessAIShared.evaluateBoard(board);
console.log('Centipawns after e4:', evalCp, 'Tanh:', Math.tanh(evalCp / 400.0).toFixed(3));
