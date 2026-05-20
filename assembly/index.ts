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

/**
 * Performs positional & material evaluation using the identical chess heuristic.
 */
export function evaluateMaterial(boardPtr: usize): i32 {
  let score: i32 = 0;
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
      } else if (lower === 110) { // 'n'
        val = 320 + (isWhite ? pstKnight[idx] : pstKnight[((7 - r) << 3) + c]);
      } else if (lower === 98) { // 'b'
        val = 330 + (isWhite ? pstBishop[idx] : pstBishop[((7 - r) << 3) + c]);
      } else if (lower === 114) { // 'r'
        val = 500 + (isWhite ? pstRook[idx] : pstRook[((7 - r) << 3) + c]);
      } else if (lower === 113) { // 'q'
        val = 900 + (isWhite ? pstQueen[idx] : pstQueen[((7 - r) << 3) + c]);
      } else if (lower === 107) { // 'k'
        val = 20000 + (isWhite ? pstKing[idx] : pstKing[((7 - r) << 3) + c]);
      }
      
      if (isWhite) {
        score += val;
      } else {
        score -= val;
      }
    }
  }
  return score;
}

export function getHeapBase(): usize {
  return __heap_base;
}
