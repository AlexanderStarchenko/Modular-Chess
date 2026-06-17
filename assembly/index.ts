// WebAssembly Chess Core (AssemblyScript)

// Piece-Square Tables (PST) matching the JavaScript engine exactly
const pstPawn: i32[] = [
    0,  0,  0,  0,  0,  0,  0,  0,
    50, 50, 50, 50, 50, 50, 50, 50,
    10, 10, 20, 30, 30, 20, 10, 10,
    5,  5, 10, 25, 25, 10,  5,  5,
    0,  0,  0, 20, 20,  0,  0,  0,
    5, -5,-10,  0,  0,-10, -5,  5,
    5, 10, 10,-20,-20, 10, 10,  5,
    0,  0,  0,  0,  0,  0,  0,  0
];

const pstKnight: i32[] = [
    -50,-40,-30,-30,-30,-30,-40,-50,
    -40,-20,  0,  0,  0,  0,-20,-40,
    -30,  0, 10, 15, 15, 10,  0,-30,
    -30,  5, 15, 20, 20, 15,  5,-30,
    -30,  0, 15, 20, 20, 15,  0,-30,
    -30,  5, 10, 15, 15, 10,  5,-30,
    -40,-20,  0,  5,  5,  0,-20,-40,
    -50,-40,-30,-30,-30,-30,-40,-50
];

const pstBishop: i32[] = [
    -20,-10,-10,-10,-10,-10,-10,-20,
    -10,  0,  0,  0,  0,  0,  0,-10,
    -10,  0,  5, 10, 10,  5,  0,-10,
    -10,  5,  5, 10, 10,  5,  5,-10,
    -10,  0, 10, 10, 10, 10,  0,-10,
    -10, 10, 10, 10, 10, 10, 10,-10,
    -10,  5,  0,  0,  0,  0,  5,-10,
    -20,-10,-10,-10,-10,-10,-10,-20
];

const pstRook: i32[] = [
    0,  0,  0,  0,  0,  0,  0,  0,
    5, 10, 10, 10, 10, 10, 10,  5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    0,  0,  0,  5,  5,  0,  0,  0
];

const pstQueen: i32[] = [
    -20,-10,-10, -5, -5,-10,-10,-20,
    -10,  0,  0,  0,  0,  0,  0,-10,
    -10,  0,  5,  5,  5,  5,  0,-10,
    -5,  0,  5,  5,  5,  5,  0, -5,
    0,  0,  5,  5,  5,  5,  0, -5,
    -10,  5,  5,  5,  5,  5,  0,-10,
    -10,  0,  5,  0,  0,  0,  0,-10,
    -20,-10,-10, -5, -5,-10,-10,-20
];

const pstKing: i32[] = [
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -20,-30,-30,-40,-40,-30,-30,-20,
    -10,-20,-20,-20,-20,-20,-20,-10,
    20, 20,  0,  0,  0,  0, 20, 20,
    20, 30, 10,  0,  0, 10, 30, 20
];

/**
 * Checks if a square is attacked by a certain color.
 */
export function isSquareAttacked(
  targetR: i32, 
  targetC: i32, 
  attackerColor: i32, 
  boardPtr: usize
): i32 {
  const isWhiteAttacker = attackerColor === 0;
  
  for (let r: i32 = 0; r < 8; r++) {
    for (let c: i32 = 0; c < 8; c++) {
      const piece = load<u8>(boardPtr + (r << 3) + c);
      if (piece === 0) continue;

      const isWhitePiece = piece >= 65 && piece <= 90;
      if (isWhitePiece !== isWhiteAttacker) continue;

      const type = isWhitePiece ? piece : piece - 32; // Normalize to uppercase
      
      // Manual ABS for safety in WASM
      const dr = r > targetR ? r - targetR : targetR - r;
      const dc = c > targetC ? c - targetC : targetC - c;

      // 1. Pawn
      if (type === 80) { // 'P'
        if (isWhiteAttacker) {
          if (r === targetR + 1 && dc === 1) return 1;
        } else {
          if (r === targetR - 1 && dc === 1) return 1;
        }
      }
      // 2. Knight
      else if (type === 78) { // 'N'
        if ((dr === 2 && dc === 1) || (dr === 1 && dc === 2)) return 1;
      }
      // 3. King
      else if (type === 75) { // 'K'
        if (dr <= 1 && dc <= 1) return 1;
      }
      // 4. Sliding: Bishop / Queen (Diagonals)
      else if (type === 66 || type === 81) { // 'B' or 'Q'
        if (dr === dc && dr > 0) {
          if (isPathClear(r, c, targetR, targetC, boardPtr)) return 1;
        }
      }
      
      // 5. Sliding: Rook / Queen (Files/Rows)
      if (type === 82 || type === 81) { // 'R' or 'Q'
        if (r === targetR || c === targetC) {
          if (dr + dc > 0 && isPathClear(r, c, targetR, targetC, boardPtr)) return 1;
        }
      }
    }
  }
  return 0;
}

/**
 * Checks if path between two squares is clear of obstacles.
 */
function isPathClear(r1: i32, c1: i32, r2: i32, c2: i32, boardPtr: usize): bool {
  const stepR = r1 === r2 ? 0 : (r2 > r1 ? 1 : -1);
  const stepC = c1 === c2 ? 0 : (c2 > c1 ? 1 : -1);
  
  let currR = r1 + stepR;
  let currC = c1 + stepC;
  
  while (currR !== r2 || currC !== c2) {
    if (currR < 0 || currR >= 8 || currC < 0 || currC >= 8) return false;
    if (load<u8>(boardPtr + (currR << 3) + currC) !== 0) return false;
    currR += stepR;
    currC += stepC;
  }
  return true;
}

// Pre-allocated static buffers for evaluation to avoid GC heap allocation overhead in search loops
const wPawnsInCol = new Int32Array(8);
const bPawnsInCol = new Int32Array(8);
const wRooksInCol = new Int32Array(8);
const bRooksInCol = new Int32Array(8);

/**
 * Performs positional & material evaluation using the identical chess heuristic.
 */
export function evaluateMaterial(boardPtr: usize): i32 {
  let score: i32 = 0;
  
  // Clear buffers
  for (let i = 0; i < 8; i++) {
    wPawnsInCol[i] = 0;
    bPawnsInCol[i] = 0;
    wRooksInCol[i] = 0;
    bRooksInCol[i] = 0;
  }
  
  let wBishops = 0;
  let bBishops = 0;
  
  let wKingR: i32 = -1;
  let wKingC: i32 = -1;
  let bKingR: i32 = -1;
  let bKingC: i32 = -1;

  for (let r: i32 = 0; r < 8; r++) {
    for (let c: i32 = 0; c < 8; c++) {
      const idx = (r << 3) + c;
      const piece = load<u8>(boardPtr + idx);
      if (piece === 0) continue;
      
      const isWhite = piece >= 65 && piece <= 90;
      const lower = piece | 32;
      
      let val: i32 = 0;
      if (lower === 112) { // 'p'
        val = 100 + (isWhite ? pstPawn[idx] : pstPawn[((7 - r) << 3) + c]);
        if (isWhite) {
          wPawnsInCol[c]++;
        } else {
          bPawnsInCol[c]++;
        }
      } else if (lower === 110) { // 'n'
        val = 320 + (isWhite ? pstKnight[idx] : pstKnight[((7 - r) << 3) + c]);
      } else if (lower === 98) { // 'b'
        val = 330 + (isWhite ? pstBishop[idx] : pstBishop[((7 - r) << 3) + c]);
        if (isWhite) wBishops++; else bBishops++;
      } else if (lower === 114) { // 'r'
        val = 500 + (isWhite ? pstRook[idx] : pstRook[((7 - r) << 3) + c]);
        if (isWhite) {
          wRooksInCol[c]++;
        } else {
          bRooksInCol[c]++;
        }
      } else if (lower === 113) { // 'q'
        val = 900 + (isWhite ? pstQueen[idx] : pstQueen[((7 - r) << 3) + c]);
      } else if (lower === 107) { // 'k'
        val = 20000 + (isWhite ? pstKing[idx] : pstKing[((7 - r) << 3) + c]);
        if (isWhite) {
          wKingR = r; wKingC = c;
        } else {
          bKingR = r; bKingC = c;
        }
      }
      
      if (isWhite) {
        score += val;
      } else {
        score -= val;
      }
    }
  }

  let structureEval: i32 = 0;

  // 1. Bishop Pair
  if (wBishops >= 2) structureEval += 50;
  if (bBishops >= 2) structureEval -= 50;

  // 2. King Safety
  if (wKingR !== -1) {
    let shieldPawns = 0;
    const frontR = wKingR - 1;
    if (frontR >= 0) {
      for (let dc: i32 = -1; dc <= 1; dc++) {
        const fc = wKingC + dc;
        if (fc >= 0 && fc < 8) {
          if (load<u8>(boardPtr + (frontR << 3) + fc) === 80) { // 'P'
            shieldPawns++;
          }
        }
      }
    }
    structureEval += shieldPawns * 15;
    if (wKingR >= 6 && shieldPawns === 0) {
      structureEval -= 35;
    }
  }

  if (bKingR !== -1) {
    let shieldPawns = 0;
    const frontR = bKingR + 1;
    if (frontR < 8) {
      for (let dc: i32 = -1; dc <= 1; dc++) {
        const fc = bKingC + dc;
        if (fc >= 0 && fc < 8) {
          if (load<u8>(boardPtr + (frontR << 3) + fc) === 112) { // 'p'
            shieldPawns++;
          }
        }
      }
    }
    structureEval -= shieldPawns * 15;
    if (bKingR <= 1 && shieldPawns === 0) {
      structureEval += 35;
    }
  }

  // 3. Doubled and Isolated Pawns, and Open Files
  for (let c: i32 = 0; c < 8; c++) {
    // Doubled pawns
    if (wPawnsInCol[c] > 1) structureEval -= (wPawnsInCol[c] - 1) * 15;
    if (bPawnsInCol[c] > 1) structureEval += (bPawnsInCol[c] - 1) * 15;

    // Isolated pawns
    const hasLeftNeighborW = (c > 0) && (wPawnsInCol[c - 1] > 0);
    const hasRightNeighborW = (c < 7) && (wPawnsInCol[c + 1] > 0);
    if (wPawnsInCol[c] > 0 && !hasLeftNeighborW && !hasRightNeighborW) {
      structureEval -= wPawnsInCol[c] * 15;
    }

    const hasLeftNeighborB = (c > 0) && (bPawnsInCol[c - 1] > 0);
    const hasRightNeighborB = (c < 7) && (bPawnsInCol[c + 1] > 0);
    if (bPawnsInCol[c] > 0 && !hasLeftNeighborB && !hasRightNeighborB) {
      structureEval += bPawnsInCol[c] * 15;
    }

    // Rook Open / Semi-open files
    if (wRooksInCol[c] > 0) {
      if (wPawnsInCol[c] === 0) {
        if (bPawnsInCol[c] === 0) {
          structureEval += 25; // Open file
        } else {
          structureEval += 15; // Semi-open file
        }
      }
    }

    if (bRooksInCol[c] > 0) {
      if (bPawnsInCol[c] === 0) {
        if (wPawnsInCol[c] === 0) {
          structureEval -= 25; // Open file
        } else {
          structureEval -= 15; // Semi-open file
        }
      }
    }
  }

  // 4. Passed Pawns
  for (let r: i32 = 0; r < 8; r++) {
    for (let c: i32 = 0; c < 8; c++) {
      const piece = load<u8>(boardPtr + (r << 3) + c);
      if (piece === 80) { // 'P'
        let isPassed = true;
        for (let checkR = 0; checkR < r; checkR++) {
          for (let dc = -1; dc <= 1; dc++) {
            const checkC = c + dc;
            if (checkC >= 0 && checkC < 8) {
              if (load<u8>(boardPtr + (checkR << 3) + checkC) === 112) { // 'p'
                isPassed = false;
                break;
              }
            }
          }
          if (!isPassed) break;
        }
        if (isPassed) {
          const rankBonus = (7 - r) * 10;
          structureEval += 20 + rankBonus;
        }
      }
      else if (piece === 112) { // 'p'
        let isPassed = true;
        for (let checkR = r + 1; checkR < 8; checkR++) {
          for (let dc = -1; dc <= 1; dc++) {
            const checkC = c + dc;
            if (checkC >= 0 && checkC < 8) {
              if (load<u8>(boardPtr + (checkR << 3) + checkC) === 80) { // 'P'
                isPassed = false;
                break;
              }
            }
          }
          if (!isPassed) break;
        }
        if (isPassed) {
          const rankBonus = r * 10;
          structureEval -= (20 + rankBonus);
        }
      }
    }
  }

  return score + structureEval;
}

export function getHeapBase(): usize {
  return __heap_base;
}

// -------------------------------------------------------------
// NEW WEBASSEMBLY CHESS SEARCH AND MOVE GENERATOR CORE
// -------------------------------------------------------------

const boardPtr: usize = 32768; // Safe pointer base

// Game state variables
let turn: u8 = 0;              // 0 = white, 1 = black
let castlingRights: u8 = 0;    // bitmask: 1 = K, 2 = Q, 4 = k, 8 = q
let enPassantSquare: i8 = -1;  // -1 or 0-63 square index
let halfMoveClock: u32 = 0;
let currentHash: u64 = 0;

// Deterministic 64-bit random number generator for Zobrist hashing
let randomState: u64 = 1802375819741029;
function random64(): u64 {
  randomState ^= randomState >> 12;
  randomState ^= randomState << 25;
  randomState ^= randomState >> 27;
  return randomState * 0x2545F4914F6CDD1D;
}

const zobristPieces = new Uint64Array(12 * 64);
let zobristBlackToMove: u64 = 0;
const zobristCastling = new Uint64Array(16);
const zobristEnPassant = new Uint64Array(8);
let zobristInitialized = false;

function initZobrist(): void {
  for (let i = 0; i < 12 * 64; i++) {
    zobristPieces[i] = random64();
  }
  zobristBlackToMove = random64();
  for (let i = 0; i < 16; i++) {
    zobristCastling[i] = random64();
  }
  for (let i = 0; i < 8; i++) {
    zobristEnPassant[i] = random64();
  }
}

export function ensureZobristInitialized(): void {
  if (!zobristInitialized) {
    initZobrist();
    zobristInitialized = true;
  }
}

function getPieceIndex(piece: u8): i32 {
  if (piece === 80) return 0;
  if (piece === 78) return 1;
  if (piece === 66) return 2;
  if (piece === 82) return 3;
  if (piece === 81) return 4;
  if (piece === 75) return 5;
  if (piece === 112) return 6;
  if (piece === 110) return 7;
  if (piece === 98) return 8;
  if (piece === 114) return 9;
  if (piece === 113) return 10;
  if (piece === 107) return 11;
  return 0;
}

function computeZobristHash(): u64 {
  let h: u64 = 0;
  for (let sq: u32 = 0; sq < 64; sq++) {
    const piece = load<u8>(boardPtr + sq);
    if (piece !== 0) {
      const pieceIdx = getPieceIndex(piece);
      h ^= zobristPieces[pieceIdx * 64 + sq];
    }
  }
  if (turn === 1) h ^= zobristBlackToMove;
  h ^= zobristCastling[castlingRights];
  if (enPassantSquare !== -1) {
    const epCol = enPassantSquare & 7;
    h ^= zobristEnPassant[epCol];
  }
  return h;
}

// Global Move Buffer to prevent memory allocation during recursive search
const MAX_SEARCH_DEPTH = 32;
const moveBuffer = new Uint32Array(128 * MAX_SEARCH_DEPTH);

function getPieceScoreVal(piece: u8): i32 {
  const p = piece >= 97 ? piece - 32 : piece; // Normalize to uppercase
  if (p === 80) return 1;  // Pawn
  if (p === 78) return 3;  // Knight
  if (p === 66) return 3;  // Bishop
  if (p === 82) return 5;  // Rook
  if (p === 81) return 9;  // Queen
  if (p === 75) return 20; // King
  return 0;
}

function addMove(depth: i32, count: i32, from: u8, to: u8, type: u8, captured: u8, piece: u8): i32 {
  let score: u32 = 0;
  if (captured !== 0) {
    const valTarget = getPieceScoreVal(captured);
    const valAttacker = getPieceScoreVal(piece);
    score = 100 + (valTarget * 10 - valAttacker);
  }
  if (type === 5) { // Promotion to Queen
    score += 50;
  }
  
  const moveVal = (<u32>from) | ((<u32>to) << 6) | ((<u32>type) << 12) | ((<u32>captured) << 16) | (score << 24);
  moveBuffer[depth * 128 + count] = moveVal;
  return count + 1;
}

@inline
function inBounds(r: i32, c: i32): boolean {
  return r >= 0 && r < 8 && c >= 0 && c < 8;
}

function isSquareAttackedWASM(r: i32, c: i32, attackerColor: u8): boolean {
  return isSquareAttacked(r, c, attackerColor === 0 ? 0 : 128, boardPtr) === 1;
}

function isKingInCheck(color: u8): boolean {
  const kingChar = color === 0 ? 75 : 107; // 'K' or 'k'
  for (let r: i32 = 0; r < 8; r++) {
    for (let c: i32 = 0; c < 8; c++) {
      if (load<u8>(boardPtr + (r << 3) + c) === kingChar) {
        return isSquareAttackedWASM(r, c, 1 - color);
      }
    }
  }
  return false;
}

function generateMovesAtDepth(depth: i32, color: u8): i32 {
  let count = 0;
  const isWhite = color === 0;
  
  for (let r: i32 = 0; r < 8; r++) {
    for (let c: i32 = 0; c < 8; c++) {
      const sq = (r << 3) + c;
      const piece = load<u8>(boardPtr + sq);
      if (piece === 0) continue;
      
      const isPieceWhite = piece >= 65 && piece <= 90;
      if (isPieceWhite !== isWhite) continue;
      
      const type = isPieceWhite ? piece : piece - 32; // Normalize to uppercase
      
      // PAWN MOVES
      if (type === 80) { // 'P'
        const dir = isWhite ? -1 : 1;
        const startR = isWhite ? 6 : 1;
        const promoR = isWhite ? 0 : 7;
        
        // 1. One step forward
        const nextR = r + dir;
        if (inBounds(nextR, c) && load<u8>(boardPtr + (nextR << 3) + c) === 0) {
          if (nextR === promoR) {
            count = addMove(depth, count, <u8>sq, <u8>((nextR << 3) + c), 5, 0, piece);
          } else {
            count = addMove(depth, count, <u8>sq, <u8>((nextR << 3) + c), 0, 0, piece);
            // 2. Double step forward
            const doubleR = r + 2 * dir;
            if (r === startR && load<u8>(boardPtr + (doubleR << 3) + c) === 0) {
              count = addMove(depth, count, <u8>sq, <u8>((doubleR << 3) + c), 1, 0, piece);
            }
          }
        }
        
        // 3. Captures
        const captureCols = [c - 1, c + 1];
        for (let i = 0; i < 2; i++) {
          const capC = captureCols[i];
          if (inBounds(nextR, capC)) {
            const targetSq = (nextR << 3) + capC;
            const targetPiece = load<u8>(boardPtr + targetSq);
            if (targetPiece !== 0) {
              const isTargetWhite = targetPiece >= 65 && targetPiece <= 90;
              if (isTargetWhite !== isWhite) {
                if (nextR === promoR) {
                  count = addMove(depth, count, <u8>sq, <u8>targetSq, 5, targetPiece, piece);
                } else {
                  count = addMove(depth, count, <u8>sq, <u8>targetSq, 0, targetPiece, piece);
                }
              }
            }
            
            // 4. En Passant Capture
            if (enPassantSquare !== -1 && nextR === (enPassantSquare >> 3) && capC === (enPassantSquare & 7)) {
              const epCapSq = (r << 3) + capC;
              const epPiece = load<u8>(boardPtr + epCapSq);
              count = addMove(depth, count, <u8>sq, <u8>targetSq, 4, epPiece, piece);
            }
          }
        }
      }
      
      // KNIGHT MOVES
      else if (type === 78) { // 'N'
        const drs = [-2, -2, -1, -1, 1, 1, 2, 2];
        const dcs = [-1, 1, -2, 2, -2, 2, -1, 1];
        for (let i = 0; i < 8; i++) {
          const nr = r + drs[i];
          const nc = c + dcs[i];
          if (inBounds(nr, nc)) {
            const targetSq = (nr << 3) + nc;
            const targetPiece = load<u8>(boardPtr + targetSq);
            if (targetPiece === 0) {
              count = addMove(depth, count, <u8>sq, <u8>targetSq, 0, 0, piece);
            } else {
              const isTargetWhite = targetPiece >= 65 && targetPiece <= 90;
              if (isTargetWhite !== isWhite) {
                count = addMove(depth, count, <u8>sq, <u8>targetSq, 0, targetPiece, piece);
              }
            }
          }
        }
      }
      
      // SLIDING PIECES (B, R, Q)
      else if (type === 66 || type === 82 || type === 81) {
        const isBishop = type === 66 || type === 81;
        const isRook = type === 82 || type === 81;
        
        const dirsR = isBishop ? (isRook ? [-1, -1, 1, 1, -1, 1, 0, 0] : [-1, -1, 1, 1]) : [-1, 1, 0, 0];
        const dirsC = isBishop ? (isRook ? [-1, 1, -1, 1, 0, 0, -1, 1] : [-1, 1, -1, 1]) : [0, 0, -1, 1];
        
        const numDirs = dirsR.length;
        for (let d = 0; d < numDirs; d++) {
          const stepR = dirsR[d];
          const stepC = dirsC[d];
          let nr = r + stepR;
          let nc = c + stepC;
          while (inBounds(nr, nc)) {
            const targetSq = (nr << 3) + nc;
            const targetPiece = load<u8>(boardPtr + targetSq);
            if (targetPiece === 0) {
              count = addMove(depth, count, <u8>sq, <u8>targetSq, 0, 0, piece);
            } else {
              const isTargetWhite = targetPiece >= 65 && targetPiece <= 90;
              if (isTargetWhite !== isWhite) {
                count = addMove(depth, count, <u8>sq, <u8>targetSq, 0, targetPiece, piece);
              }
              break;
            }
            nr += stepR;
            nc += stepC;
          }
        }
      }
      
      // KING MOVES
      else if (type === 75) { // 'K'
        const dirsR = [-1, -1, -1, 0, 0, 1, 1, 1];
        const dirsC = [-1, 0, 1, -1, 1, -1, 0, 1];
        for (let i = 0; i < 8; i++) {
          const nr = r + dirsR[i];
          const nc = c + dirsC[i];
          if (inBounds(nr, nc)) {
            const targetSq = (nr << 3) + nc;
            const targetPiece = load<u8>(boardPtr + targetSq);
            if (targetPiece === 0) {
              count = addMove(depth, count, <u8>sq, <u8>targetSq, 0, 0, piece);
            } else {
              const isTargetWhite = targetPiece >= 65 && targetPiece <= 90;
              if (isTargetWhite !== isWhite) {
                count = addMove(depth, count, <u8>sq, <u8>targetSq, 0, targetPiece, piece);
              }
            }
          }
        }
        
        // Castling White
        if (isWhite) {
          // Kingside (K)
          if ((castlingRights & 1) !== 0) {
            if (load<u8>(boardPtr + 61) === 0 && load<u8>(boardPtr + 62) === 0) {
              if (load<u8>(boardPtr + 63) === 82) {
                if (!isSquareAttackedWASM(7, 4, 1) && !isSquareAttackedWASM(7, 5, 1) && !isSquareAttackedWASM(7, 6, 1)) {
                  count = addMove(depth, count, 60, 62, 2, 0, piece);
                }
              }
            }
          }
          // Queenside (Q)
          if ((castlingRights & 2) !== 0) {
            if (load<u8>(boardPtr + 59) === 0 && load<u8>(boardPtr + 58) === 0 && load<u8>(boardPtr + 57) === 0) {
              if (load<u8>(boardPtr + 56) === 82) {
                if (!isSquareAttackedWASM(7, 4, 1) && !isSquareAttackedWASM(7, 3, 1) && !isSquareAttackedWASM(7, 2, 1)) {
                  count = addMove(depth, count, 60, 58, 3, 0, piece);
                }
              }
            }
          }
        }
        // Castling Black
        else {
          // Kingside (k)
          if ((castlingRights & 4) !== 0) {
            if (load<u8>(boardPtr + 5) === 0 && load<u8>(boardPtr + 6) === 0) {
              if (load<u8>(boardPtr + 7) === 114) {
                if (!isSquareAttackedWASM(0, 4, 0) && !isSquareAttackedWASM(0, 5, 0) && !isSquareAttackedWASM(0, 6, 0)) {
                  count = addMove(depth, count, 4, 6, 2, 0, piece);
                }
              }
            }
          }
          // Queenside (q)
          if ((castlingRights & 8) !== 0) {
            if (load<u8>(boardPtr + 3) === 0 && load<u8>(boardPtr + 2) === 0 && load<u8>(boardPtr + 1) === 0) {
              if (load<u8>(boardPtr + 0) === 114) {
                if (!isSquareAttackedWASM(0, 4, 0) && !isSquareAttackedWASM(0, 3, 0) && !isSquareAttackedWASM(0, 2, 0)) {
                  count = addMove(depth, count, 4, 2, 3, 0, piece);
                }
              }
            }
          }
        }
      }
    }
  }
  
  return count;
}

// Undo Stack Parallel Arrays (pre-allocated up to search depth 32)
const undoOrig = new Uint8Array(MAX_SEARCH_DEPTH);
const undoTarget = new Uint8Array(MAX_SEARCH_DEPTH);
const undoEpCaptured = new Uint8Array(MAX_SEARCH_DEPTH);
const undoEpSq = new Int8Array(MAX_SEARCH_DEPTH);
const undoRookFromSq = new Int8Array(MAX_SEARCH_DEPTH);
const undoRookToSq = new Int8Array(MAX_SEARCH_DEPTH);
const undoCastlingRights = new Uint8Array(MAX_SEARCH_DEPTH);
const undoEnPassantSquare = new Int8Array(MAX_SEARCH_DEPTH);
const undoHalfMoveClock = new Uint32Array(MAX_SEARCH_DEPTH);
const undoHash = new Uint64Array(MAX_SEARCH_DEPTH);

function applyMoveWASM(move: u32, depth: i32): boolean {
  const from = <i32>(move & 0x3F);
  const to = <i32>((move >> 6) & 0x3F);
  const type = <i32>((move >> 12) & 0x0F);
  const captured = <u8>((move >> 16) & 0xFF);
  
  const piece = load<u8>(boardPtr + from);
  
  // Save undo properties
  undoOrig[depth] = piece;
  undoTarget[depth] = captured;
  undoEpCaptured[depth] = 0;
  undoEpSq[depth] = -1;
  undoRookFromSq[depth] = -1;
  undoRookToSq[depth] = -1;
  undoCastlingRights[depth] = castlingRights;
  undoEnPassantSquare[depth] = <i8>enPassantSquare;
  undoHalfMoveClock[depth] = halfMoveClock;
  undoHash[depth] = currentHash;
  
  // Clocks
  const isPawn = piece === 80 || piece === 112;
  if (isPawn || captured !== 0) {
    halfMoveClock = 0;
  } else {
    halfMoveClock++;
  }
  
  // Update castling rights
  if (from === 60) castlingRights &= ~3;
  if (from === 4) castlingRights &= ~12;
  if (from === 63 || to === 63) castlingRights &= ~1;
  if (from === 56 || to === 56) castlingRights &= ~2;
  if (from === 7 || to === 7) castlingRights &= ~4;
  if (from === 0 || to === 0) castlingRights &= ~8;
  
  store<u8>(boardPtr + from, 0);
  enPassantSquare = -1;
  
  if (type === 0) {
    store<u8>(boardPtr + to, piece);
  }
  else if (type === 1) {
    store<u8>(boardPtr + to, piece);
    enPassantSquare = <i8>((from + to) >> 1);
  }
  else if (type === 2) {
    store<u8>(boardPtr + to, piece);
    const rFrom = from + 3;
    const rTo = from + 1;
    const rook = load<u8>(boardPtr + rFrom);
    store<u8>(boardPtr + rFrom, 0);
    store<u8>(boardPtr + rTo, rook);
    undoRookFromSq[depth] = <i8>rFrom;
    undoRookToSq[depth] = <i8>rTo;
  }
  else if (type === 3) {
    store<u8>(boardPtr + to, piece);
    const rFrom = from - 4;
    const rTo = from - 1;
    const rook = load<u8>(boardPtr + rFrom);
    store<u8>(boardPtr + rFrom, 0);
    store<u8>(boardPtr + rTo, rook);
    undoRookFromSq[depth] = <i8>rFrom;
    undoRookToSq[depth] = <i8>rTo;
  }
  else if (type === 4) {
    store<u8>(boardPtr + to, piece);
    const epCapSq = to + (piece === 80 ? 8 : -8);
    undoEpCaptured[depth] = load<u8>(boardPtr + epCapSq);
    undoEpSq[depth] = <i8>epCapSq;
    store<u8>(boardPtr + epCapSq, 0);
  }
  else if (type === 5) {
    const promoPiece = piece === 80 ? 81 : 113;
    store<u8>(boardPtr + to, promoPiece);
  }
  
  // Incremental Zobrist Hash Update (O(1))
  let newHash = currentHash;
  
  // 1. Piece leaves 'from'
  newHash ^= zobristPieces[getPieceIndex(piece) * 64 + from];
  
  // 2. Captured piece leaves destination
  if (captured !== 0) {
    const capIdx = getPieceIndex(captured);
    if (type === 4) { // En Passant
      const epCapSq = to + (piece === 80 ? 8 : -8);
      newHash ^= zobristPieces[capIdx * 64 + epCapSq];
    } else { // Normal capture
      newHash ^= zobristPieces[capIdx * 64 + to];
    }
  }
  
  // 3. Piece arrives at 'to'
  if (type === 5) { // Promotion
    const promoPiece: u8 = piece === 80 ? 81 : 113; // 'Q' or 'q'
    newHash ^= zobristPieces[getPieceIndex(promoPiece) * 64 + to];
  } else {
    newHash ^= zobristPieces[getPieceIndex(piece) * 64 + to];
  }
  
  // 4. Castling rook moves
  if (type === 2) {
    const rFrom = from + 3;
    const rTo = from + 1;
    const rook = load<u8>(boardPtr + rTo);
    const rookIdx = getPieceIndex(rook);
    newHash ^= zobristPieces[rookIdx * 64 + rFrom];
    newHash ^= zobristPieces[rookIdx * 64 + rTo];
  } else if (type === 3) {
    const rFrom = from - 4;
    const rTo = from - 1;
    const rook = load<u8>(boardPtr + rTo);
    const rookIdx = getPieceIndex(rook);
    newHash ^= zobristPieces[rookIdx * 64 + rFrom];
    newHash ^= zobristPieces[rookIdx * 64 + rTo];
  }
  
  // 5. Toggle turn
  newHash ^= zobristBlackToMove;
  
  // 6. Castling rights change
  newHash ^= zobristCastling[undoCastlingRights[depth]];
  newHash ^= zobristCastling[castlingRights];
  
  // 7. En Passant square change
  if (undoEnPassantSquare[depth] !== -1) {
    newHash ^= zobristEnPassant[undoEnPassantSquare[depth] & 7];
  }
  if (enPassantSquare !== -1) {
    newHash ^= zobristEnPassant[enPassantSquare & 7];
  }
  
  currentHash = newHash;
  
  turn = 1 - turn;
  
  const moverColor: u8 = <u8>(1 - turn);
  if (isKingInCheck(moverColor)) {
    undoMoveWASM(move, depth);
    return false;
  }
  
  return true;
}

function undoMoveWASM(move: u32, depth: i32): void {
  const from = <i32>(move & 0x3F);
  const to = <i32>((move >> 6) & 0x3F);
  
  store<u8>(boardPtr + from, undoOrig[depth]);
  store<u8>(boardPtr + to, undoTarget[depth]);
  
  if (undoEpSq[depth] !== -1) {
    store<u8>(boardPtr + <usize>undoEpSq[depth], undoEpCaptured[depth]);
  }
  
  if (undoRookFromSq[depth] !== -1) {
    const rook = load<u8>(boardPtr + <usize>undoRookToSq[depth]);
    store<u8>(boardPtr + <usize>undoRookFromSq[depth], rook);
    store<u8>(boardPtr + <usize>undoRookToSq[depth], 0);
  }
  
  castlingRights = undoCastlingRights[depth];
  enPassantSquare = undoEnPassantSquare[depth];
  halfMoveClock = undoHalfMoveClock[depth];
  currentHash = undoHash[depth];
  turn = 1 - turn;
}

// Transposition Table arrays (TT_SIZE must be power of two)
const TT_SIZE: u32 = 262144;
const tt_hash = new Uint64Array(TT_SIZE);
const tt_depth = new Int32Array(TT_SIZE);
const tt_score = new Int32Array(TT_SIZE);
const tt_flag = new Uint8Array(TT_SIZE);
const tt_move = new Uint32Array(TT_SIZE);

function storeTT(depth: i32, score: i32, flag: u8, bestMove: u32): void {
  const index = <u32>(currentHash & <u64>(TT_SIZE - 1));
  if (tt_hash[index] !== currentHash || depth >= tt_depth[index]) {
    tt_hash[index] = currentHash;
    tt_depth[index] = depth;
    tt_score[index] = score;
    tt_flag[index] = flag;
    tt_move[index] = bestMove;
  }
}

function orderMovesWASM(searchDepth: i32, count: i32, ttMove: u32): void {
  const startIdx = searchDepth * 128;
  
  for (let i = 0; i < count; i++) {
    const idx = startIdx + i;
    let move = moveBuffer[idx];
    const rawMove = move & 0xFFFFFF;
    const isTT = (ttMove !== 0) && (rawMove === (ttMove & 0xFFFFFF));
    
    if (isTT) {
      move = rawMove | (255 << 24);
      moveBuffer[idx] = move;
    }
  }
  
  // Insertion Sort
  for (let i = 1; i < count; i++) {
    const key = moveBuffer[startIdx + i];
    const keyScore = key >> 24;
    let j = i - 1;
    while (j >= 0 && (moveBuffer[startIdx + j] >> 24) < keyScore) {
      moveBuffer[startIdx + j + 1] = moveBuffer[startIdx + j];
      j--;
    }
    moveBuffer[startIdx + j + 1] = key;
  }
}

function quiesceWASM(alpha: i32, beta: i32, isMaximizing: boolean, searchDepth: i32): i32 {
  const standPat = evaluateMaterial(boardPtr);
  if (searchDepth >= MAX_SEARCH_DEPTH - 1) {
    return standPat;
  }
  
  if (isMaximizing) {
    if (standPat >= beta) return beta;
    // alpha = score > alpha ? score : alpha
    alpha = standPat > alpha ? standPat : alpha;
    
    const moveStartIdx = searchDepth * 128;
    const count = generateMovesAtDepth(searchDepth, 0); // White
    orderMovesWASM(searchDepth, count, 0);
    
    for (let i = 0; i < count; i++) {
      const move = moveBuffer[moveStartIdx + i];
      const captured = <u8>((move >> 16) & 0xFF);
      const type = <u8>((move >> 12) & 0x0F);
      
      if (captured === 0 && type !== 4) continue; // Only captures
      
      if (!applyMoveWASM(move, searchDepth)) continue;
      
      const score = quiesceWASM(alpha, beta, false, searchDepth + 1);
      undoMoveWASM(move, searchDepth);
      
      if (score >= beta) return beta;
      alpha = score > alpha ? score : alpha;
    }
    return alpha;
  } else {
    if (standPat <= alpha) return alpha;
    beta = standPat < beta ? standPat : beta;
    
    const moveStartIdx = searchDepth * 128;
    const count = generateMovesAtDepth(searchDepth, 1); // Black
    orderMovesWASM(searchDepth, count, 0);
    
    for (let i = 0; i < count; i++) {
      const move = moveBuffer[moveStartIdx + i];
      const captured = <u8>((move >> 16) & 0xFF);
      const type = <u8>((move >> 12) & 0x0F);
      
      if (captured === 0 && type !== 4) continue; // Only captures
      
      if (!applyMoveWASM(move, searchDepth)) continue;
      
      const score = quiesceWASM(alpha, beta, true, searchDepth + 1);
      undoMoveWASM(move, searchDepth);
      
      if (score <= alpha) return alpha;
      beta = score < beta ? score : beta;
    }
    return beta;
  }
}

let bestMoveRoot: u32 = 0;

function minimaxInternal(depth: i32, isMaximizing: boolean, alpha: i32, beta: i32, searchDepth: i32): i32 {
  if (searchDepth >= MAX_SEARCH_DEPTH - 1) {
    return evaluateMaterial(boardPtr);
  }
  const color: u8 = isMaximizing ? 0 : 1;
  
  // Transposition Table lookup
  let ttMove: u32 = 0;
  const index = <u32>(currentHash & <u64>(TT_SIZE - 1));
  if (tt_hash[index] === currentHash) {
    ttMove = tt_move[index];
    if (tt_depth[index] >= depth) {
      const score = tt_score[index];
      const flag = tt_flag[index];
      if (flag === 0) return score;
      if (flag === 1 && score <= alpha) return alpha;
      if (flag === 2 && score >= beta) return beta;
    }
  }
  
  // Generate moves
  const moveStartIdx = searchDepth * 128;
  const count = generateMovesAtDepth(searchDepth, color);
  
  let hasLegalMove = false;
  for (let i = 0; i < count; i++) {
    const move = moveBuffer[moveStartIdx + i];
    if (applyMoveWASM(move, searchDepth)) {
      undoMoveWASM(move, searchDepth);
      hasLegalMove = true;
      break;
    }
  }
  
  if (!hasLegalMove) {
    if (isKingInCheck(color)) {
      return isMaximizing ? -100000 + searchDepth : 100000 - searchDepth;
    }
    return 0; // Stalemate
  }
  
  if (depth === 0) {
    return quiesceWASM(alpha, beta, isMaximizing, searchDepth);
  }
  
  orderMovesWASM(searchDepth, count, ttMove);
  
  let bestVal = isMaximizing ? -2000000 : 2000000;
  let bestM: u32 = 0;
  
  for (let i = 0; i < count; i++) {
    const move = moveBuffer[moveStartIdx + i];
    
    if (!applyMoveWASM(move, searchDepth)) {
      continue;
    }
    
    const score = minimaxInternal(depth - 1, !isMaximizing, alpha, beta, searchDepth + 1);
    
    undoMoveWASM(move, searchDepth);
    
    if (isMaximizing) {
      if (score > bestVal) {
        bestVal = score;
        bestM = move;
      }
      alpha = score > alpha ? score : alpha;
    } else {
      if (score < bestVal) {
        bestVal = score;
        bestM = move;
      }
      beta = score < beta ? score : beta;
    }
    
    if (beta <= alpha) {
      break; // Alpha-beta cutoff
    }
  }
  
  let flag: u8 = 0;
  if (bestVal <= alpha) flag = 1;
  else if (bestVal >= beta) flag = 2;
  storeTT(depth, bestVal, flag, bestM);
  
  if (searchDepth === 0) {
    bestMoveRoot = bestM;
  }
  
  return bestVal;
}

export function setGameState(pTurn: u8, pCastling: u8, pEpSquare: i8, pHalfMove: u32): void {
  turn = pTurn;
  castlingRights = pCastling;
  enPassantSquare = pEpSquare;
  halfMoveClock = pHalfMove;
}

let searchScoreRoot: i32 = 0;

export function searchWASM(depth: i32, isMaximizing: i32, alpha: i32, beta: i32): u32 {
  bestMoveRoot = 0;
  ensureZobristInitialized();
  currentHash = computeZobristHash();
  
  searchScoreRoot = minimaxInternal(depth, isMaximizing === 1, alpha, beta, 0);
  return bestMoveRoot;
}

export function getSearchScore(): i32 {
  return searchScoreRoot;
}

export function getMoveWASM(depth: i32, idx: i32): u32 {
  return moveBuffer[depth * 128 + idx];
}

export function getMoveCountWASM(depth: i32, color: u8): i32 {
  return generateMovesAtDepth(depth, color);
}
