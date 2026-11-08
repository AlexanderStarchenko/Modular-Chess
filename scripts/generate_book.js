const ChessLogic = require('../js/logic.js');
const fs = require('fs');
const path = require('path');

const rawLines = [
    // ==========================================
    // --- 1. RUY LOPEZ (SPANISH OPENING) ---
    // ==========================================
    ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1b5', 'a7a6', 'b5a4', 'g8f6', 'e1g1', 'f8e7'], // Closed Spanish
    ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1b5', 'a7a6', 'b5a4', 'g8f6', 'e1g1', 'f8e7', 'f1e1', 'b7b5', 'a4b3', 'd7d6', 'c2c3', 'e8g8', 'h2h3'], // Main
    ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1b5', 'a7a6', 'b5a4', 'g8f6', 'e1g1', 'f8e7', 'f1e1', 'b7b5', 'a4b3', 'e8g8', 'c2c3', 'd7d5', 'e4d5', 'f6d5', 'f3e5', 'c6e5', 'e1e5', 'c7c6', 'd2d4', 'e7d6', 'e5e1', 'd8h4', 'g2g3', 'h4h3'], // Marshall Attack
    ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1b5', 'a7a6', 'b5a4', 'g8f6', 'e1g1', 'f8e7', 'f1e1', 'b7b5', 'a4b3', 'd7d6', 'c2c3', 'e8g8', 'h2h3', 'c6b8', 'd2d4', 'b8d7'], // Breyer
    ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1b5', 'a7a6', 'b5a4', 'g8f6', 'e1g1', 'f8e7', 'f1e1', 'b7b5', 'a4b3', 'd7d6', 'c2c3', 'e8g8', 'h2h3', 'c6a5', 'b3c2', 'c7c5', 'd2d4', 'd8c7', 'b1d2'], // Chigorin
    ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1b5', 'a7a6', 'b5a4', 'g8f6', 'e1g1', 'f8e7', 'f1e1', 'b7b5', 'a4b3', 'd7d6', 'c2c3', 'e8g8', 'h2h3', 'c8b7', 'd2d4', 'f8e8'], // Zaitsev
    ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1b5', 'a7a6', 'b5a4', 'g8f6', 'e1g1', 'f6e4', 'd2d4', 'b7b5', 'a4b3', 'd7d5', 'd4e5', 'c8e6', 'c2c3', 'f8e7', 'b1d2', 'e8g8'], // Open Spanish
    ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1b5', 'a7a6', 'b5c6', 'd7c6', 'd2d4', 'e5d4', 'd1d4', 'd8d4', 'f3d4', 'c8d7', 'b1c3', 'e8c8', 'c1e3'], // Exchange
    ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1b5', 'g8f6', 'e1g1', 'f6e4', 'd2d4', 'f8e7', 'd1e2', 'e4d6', 'b5c6', 'b7c6', 'd4e5', 'd6b7', 'b1c3', 'e8g8'], // Berlin Defense
    ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1b5', 'g8f6', 'd2d3', 'f8c5', 'c2c3', 'e8g8', 'e1g1', 'd7d6', 'b1d2', 'c6e7'], // Berlin 4.d3
    ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1b5', 'd7d6', 'd2d4', 'c8d7', 'b1c3', 'g8f6', 'e1g1', 'f8e7', 'f1e1', 'e5d4', 'f3d4', 'e8g8'], // Steinitz
    ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1b5', 'f7f5', 'b1c3', 'f5e4', 'c3e4', 'd7d5', 'f3e5', 'd5e4', 'e5c6', 'd8g5'], // Schliemann Gambit
    ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1b5', 'a7a6', 'b5a4', 'b7b5', 'a4b3', 'c8b7', 'd2d3', 'f8c5', 'e1g1', 'g8f6'], // Arkhangelsk

    // ==========================================
    // --- 2. ITALIAN GAME & EVANS GAMBIT ---
    // ==========================================
    ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'f8c5', 'c2c3', 'g8f6', 'd2d3', 'd7d6', 'e1g1', 'a7a6', 'c4b3', 'c5a7', 'b1d2', 'e8g8', 'h2h3', 'h7h6'], // Giuoco Pianissimo
    ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'f8c5', 'c2c3', 'g8f6', 'd2d4', 'e5d4', 'c3d4', 'c5b4', 'c1d2', 'b4d2', 'b1d2', 'd7d5', 'e4d5', 'f6d5'], // Main Italian
    ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'f8c5', 'b2b4', 'c5b4', 'c2c3', 'b4a5', 'd2d4', 'e5d4', 'e1g1', 'g8e7', 'c3d4', 'd7d5', 'e4d5', 'e7d5'], // Evans Gambit
    ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'g8f6', 'd2d3', 'f8c5', 'c2c3', 'e8g8', 'e1g1', 'd7d5', 'e4d5', 'f6d5', 'f1e1', 'c8g4'], // Two Knights
    ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'g8f6', 'f3g5', 'd7d5', 'e4d5', 'c6a5', 'c4b5', 'c7c6', 'd5c6', 'b7c6', 'b5e2', 'h7h6', 'g5f3', 'e5e4', 'f3e5', 'f8d6'], // Fried Liver / 4.Ng5
    ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'g8f6', 'f3g5', 'd7d5', 'e4d5', 'c6d4', 'c2c3', 'b7b5', 'c4f1', 'f6d5', 'g5e4', 'd8h4'], // Fritz Variation
    ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'g8f6', 'f3g5', 'f8c5', 'c4f7', 'e8e7', 'f7d5', 'd8e8', 'e1g1', 'd7d6'], // Traxler
    ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'g8f6', 'd2d4', 'e5d4', 'e1g1', 'f6e4', 'f1e1', 'd7d5', 'c4d5', 'd8d5', 'b1c3', 'd5a5', 'c3e4', 'c8e6'], // Max Lange
    ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'f8e7', 'd2d4', 'd7d6', 'c2c3', 'g8f6', 'b1d2', 'e8g8', 'e1g1'], // Hungarian Defense

    // ==========================================
    // --- 3. SCOTCH & FOUR KNIGHTS & PETROV ---
    // ==========================================
    ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'd2d4', 'e5d4', 'f3d4', 'f8c5', 'c1e3', 'd8f6', 'c2c3', 'g8e7', 'f1c4', 'c6e5', 'c4e2', 'f6g6', 'e1g1', 'd7d6'], // Scotch Classical
    ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'd2d4', 'e5d4', 'f3d4', 'g8f6', 'd4c6', 'b7c6', 'e4e5', 'd8e7', 'd1e2', 'f6d5', 'c2c4', 'c8a6', 'b2b3', 'g7g6'], // Scotch Mieses
    ['e2e4', 'e7e5', 'g1f3', 'g8f6', 'f3e5', 'd7d6', 'e5f3', 'f6e4', 'd2d4', 'd6d5', 'f1d3', 'f8e7', 'e1g1', 'b8c6', 'c2c4', 'c6b4', 'd3e2', 'e8g8', 'b1c3', 'c8f5'], // Petrov Classical
    ['e2e4', 'e7e5', 'g1f3', 'g8f6', 'd2d4', 'f6e4', 'f1d3', 'd7d5', 'f3e5', 'b8d7', 'e1g1', 'd7e5', 'd4e5', 'c8f5', 'b1d2', 'f8c5'], // Petrov 3.d4
    ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'b1c3', 'g8f6', 'f1b5', 'f8b4', 'e1g1', 'e8g8', 'd2d3', 'd7d6', 'c1g5', 'b4c3', 'b2c3', 'd8e7', 'f1e1', 'c6d8'], // Four Knights Spanish
    ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'b1c3', 'g8f6', 'd2d4', 'e5d4', 'f3d4', 'f8b4', 'd4c6', 'b7c6', 'f1d3', 'd7d5', 'e4d5', 'c6d5', 'e1g1', 'e8g8'], // Four Knights Scotch

    // ==========================================
    // --- 4. KING'S GAMBIT & VIENNA & PHILIDOR ---
    // ==========================================
    ['e2e4', 'e7e5', 'f2f4', 'e5f4', 'g1f3', 'g7g5', 'h2h4', 'g5g4', 'f3e5', 'g8f6', 'd2d4', 'd7d6', 'e5d3', 'f6e4', 'c1f4', 'f8g7', 'c2c3', 'e8g8'], // King's Gambit Accepted
    ['e2e4', 'e7e5', 'f2f4', 'f8c5', 'g1f3', 'd7d6', 'c2c3', 'g8f6', 'd2d4', 'e5d4', 'c3d4', 'c5b6', 'b1c3', 'e8g8', 'e4e5', 'd6e5', 'f4e5', 'f6d5'], // King's Gambit Declined
    ['e2e4', 'e7e5', 'f2f4', 'd7d5', 'e4d5', 'e5e4', 'd2d3', 'g8f6', 'b1d2', 'e4d3', 'f1d3', 'd8d5', 'g1f3', 'c8g4'], // Falkbeer Countergambit
    ['e2e4', 'e7e5', 'b1c3', 'g8f6', 'f2f4', 'd7d5', 'f4e5', 'f6e4', 'd1f3', 'b8c6', 'f1b5', 'e4c3', 'd2c3', 'f8e7', 'c1f4', 'e8g8'], // Vienna Gambit
    ['e2e4', 'e7e5', 'b1c3', 'b8c6', 'g2g3', 'g7g6', 'f1g2', 'f8g7', 'd2d3', 'd7d6', 'g1e2', 'g8e7', 'e1g1', 'e8g8'], // Vienna Mieses
    ['e2e4', 'e7e5', 'g1f3', 'd7d6', 'd2d4', 'e5d4', 'f3d4', 'g8f6', 'b1c3', 'f8e7', 'f1e2', 'e8g8', 'e1g1', 'f8e8', 'f1e1', 'e7f8'], // Philidor
    ['e2e4', 'e7e5', 'g1f3', 'd7d6', 'd2d4', 'g8f6', 'b1c3', 'b8d7', 'f1c4', 'f8e7', 'e1g1', 'e8g8', 'a2a4', 'c7c6', 'h2h3'], // Philidor Hanham

    // ==========================================
    // --- 5. SICILIAN NAJDORF ---
    // ==========================================
    ['e2e4', 'c7c5', 'g1f3', 'd7d6', 'd2d4', 'c5d4', 'f3d4', 'g8f6', 'b1c3', 'a7a6', 'c1e3', 'e7e5', 'd4b3', 'c8e6', 'f2f3', 'b8d7', 'd1d2', 'b7b5', 'e1c1', 'f8e7', 'g2g4', 'b5b4', 'c3d5', 'e6d5', 'e4d5', 'd7b6'], // Najdorf English Attack
    ['e2e4', 'c7c5', 'g1f3', 'd7d6', 'd2d4', 'c5d4', 'f3d4', 'g8f6', 'b1c3', 'a7a6', 'c1g5', 'e7e6', 'f2f4', 'f8e7', 'd1f3', 'd8c7', 'e1c1', 'b8d7', 'g2g4', 'b7b5', 'g5f6', 'g7f6', 'f4f5', 'd7e5'], // Najdorf 6.Bg5
    ['e2e4', 'c7c5', 'g1f3', 'd7d6', 'd2d4', 'c5d4', 'f3d4', 'g8f6', 'b1c3', 'a7a6', 'c1g5', 'e7e6', 'f2f4', 'd8b6', 'd1d2', 'b6b2', 'a1b1', 'b2a3', 'e4e5', 'd6e5', 'f4e5', 'f6d7'], // Poisoned Pawn
    ['e2e4', 'c7c5', 'g1f3', 'd7d6', 'd2d4', 'c5d4', 'f3d4', 'g8f6', 'b1c3', 'a7a6', 'f1e2', 'e7e5', 'd4b3', 'f8e7', 'e1g1', 'e8g8', 'c1e3', 'c8e6', 'd1d2', 'b8d7', 'a2a4', 'a8c8'], // Najdorf Classical
    ['e2e4', 'c7c5', 'g1f3', 'd7d6', 'd2d4', 'c5d4', 'f3d4', 'g8f6', 'b1c3', 'a7a6', 'f2f4', 'e7e5', 'd4f3', 'b8d7', 'a2a4', 'f8e7', 'f1d3', 'e8g8', 'e1g1'], // Najdorf Amsterdam
    ['e2e4', 'c7c5', 'g1f3', 'd7d6', 'd2d4', 'c5d4', 'f3d4', 'g8f6', 'b1c3', 'a7a6', 'f1c4', 'e7e6', 'c4b3', 'b7b5', 'e1g1', 'f8e7', 'd1f3', 'd8c7', 'f3g3', 'e8g8', 'c1h6', 'f6e8'], // Fischer-Sozin
    ['e2e4', 'c7c5', 'g1f3', 'd7d6', 'd2d4', 'c5d4', 'f3d4', 'g8f6', 'b1c3', 'a7a6', 'h2h3', 'e7e5', 'd4e2', 'h7h5', 'g2g3', 'c8e6', 'f1g2', 'b8d7'], // Adams Attack

    // ==========================================
    // --- 6. SICILIAN DRAGON & SVESHNIKOV ---
    // ==========================================
    ['e2e4', 'c7c5', 'g1f3', 'd7d6', 'd2d4', 'c5d4', 'f3d4', 'g8f6', 'b1c3', 'g7g6', 'c1e3', 'f8g7', 'f2f3', 'e8g8', 'd1d2', 'b8c6', 'f1c4', 'c8d7', 'e1c1', 'a8c8', 'c4b3', 'c6e5', 'h2h4', 'h7h5', 'c1b1'], // Yugoslav Dragon 9.Bc4
    ['e2e4', 'c7c5', 'g1f3', 'd7d6', 'd2d4', 'c5d4', 'f3d4', 'g8f6', 'b1c3', 'g7g6', 'c1e3', 'f8g7', 'f2f3', 'e8g8', 'd1d2', 'b8c6', 'e1c1', 'd6d5', 'e4d5', 'f6d5', 'd4c6', 'b7c6', 'e3d4', 'e7e5'], // Dragon 9.0-0-0 d5
    ['e2e4', 'c7c5', 'g1f3', 'b8c6', 'd2d4', 'c5d4', 'f3d4', 'g7g6', 'c2c4', 'f8g7', 'c1e3', 'g8f6', 'b1c3', 'e8g8', 'f1e2', 'd7d6', 'e1g1', 'c8d7', 'd1d2', 'c6d4', 'e3d4', 'd7c6'], // Accelerated Dragon Maroczy
    ['e2e4', 'c7c5', 'g1f3', 'b8c6', 'd2d4', 'c5d4', 'f3d4', 'g8f6', 'b1c3', 'e7e5', 'd4b5', 'd7d6', 'c1g5', 'a7a6', 'b5a3', 'b7b5', 'c3d5', 'f8e7', 'g5f6', 'e7f6', 'c2c3', 'e8g8', 'a3c2', 'f6g5', 'a2a4', 'b5a4', 'a1a4', 'a6a5'], // Sveshnikov Main
    ['e2e4', 'c7c5', 'g1f3', 'b8c6', 'd2d4', 'c5d4', 'f3d4', 'e7e5', 'd4b5', 'd7d6', 'b1c3', 'a7a6', 'b5a3', 'c8e6', 'a3c4', 'a8c8', 'c1e3', 'g8f6', 'c4b6', 'c8b8'], // Kalashnikov

    // ==========================================
    // --- 7. SICILIAN OTHER (TAIMANOV, KAN, ALAPIN, ROSSOLIMO) ---
    // ==========================================
    ['e2e4', 'c7c5', 'g1f3', 'e7e6', 'd2d4', 'c5d4', 'f3d4', 'b8c6', 'b1c3', 'd8c7', 'c1e3', 'a7a6', 'f1e2', 'g8f6', 'e1g1', 'f8b4', 'c3a4', 'b4e7', 'c2c4', 'f6e4', 'd4c6', 'b7c6'], // Taimanov
    ['e2e4', 'c7c5', 'g1f3', 'e7e6', 'd2d4', 'c5d4', 'f3d4', 'a7a6', 'f1d3', 'f8c5', 'd4b3', 'c5a7', 'd1e2', 'b8c6', 'c1e3', 'd7d6', 'b1d2', 'g8f6', 'e1g1', 'e8g8'], // Kan
    ['e2e4', 'c7c5', 'g1f3', 'b8c6', 'd2d4', 'c5d4', 'f3d4', 'g8f6', 'b1c3', 'd7d6', 'c1g5', 'e7e6', 'd1d2', 'a7a6', 'e1c1', 'c8d7', 'f2f4', 'b7b5', 'g5f6', 'g7f6'], // Richter-Rauzer
    ['e2e4', 'c7c5', 'c2c3', 'd7d5', 'e4d5', 'd8d5', 'd2d4', 'g8f6', 'g1f3', 'e7e6', 'f1d3', 'c5d4', 'c3d4', 'f8e7', 'b1c3', 'd5d6', 'e1g1', 'e8g8', 'a2a3', 'b8c6', 'c1e3', 'b7b6'], // Alapin 2...d5
    ['e2e4', 'c7c5', 'c2c3', 'g8f6', 'e4e5', 'f6d5', 'd2d4', 'c5d4', 'g1f3', 'b8c6', 'f1c4', 'd5b6', 'c4b3', 'd7d5', 'e5d6', 'd8d6', 'e1g1', 'c8e6', 'b1a3', 'e6b3', 'd1b3', 'e7e6'], // Alapin 2...Nf6
    ['e2e4', 'c7c5', 'g1f3', 'b8c6', 'f1b5', 'g7g6', 'e1g1', 'f8g7', 'c2c3', 'g8f6', 'f1e1', 'e8g8', 'd2d4', 'c5d4', 'c3d4', 'd7d5', 'e4e5', 'f6e4', 'b1c3', 'c8f5'], // Rossolimo
    ['e2e4', 'c7c5', 'g1f3', 'd7d6', 'f1b5', 'c8d7', 'b5d7', 'd8d7', 'e1g1', 'g8f6', 'f1e1', 'b8c6', 'c2c3', 'e7e6', 'd2d4', 'c5d4', 'c3d4', 'd6d5', 'e4e5', 'f6e4'], // Moscow
    ['e2e4', 'c7c5', 'b1c3', 'b8c6', 'g2g3', 'g7g6', 'f1g2', 'f8g7', 'd2d3', 'd7d6', 'c1e3', 'e7e5', 'd1d2', 'g8e7', 'g1e2', 'e8g8', 'e1g1', 'c6d4'], // Closed Sicilian
    ['e2e4', 'c7c5', 'd2d4', 'c5d4', 'c2c3', 'd4c3', 'b1c3', 'b8c6', 'g1f3', 'e7e6', 'f1c4', 'a7a6', 'e1g1', 'g8e7', 'c1g5', 'f7f6', 'g5e3', 'b7b5', 'c4b3', 'c8b7'], // Smith-Morra

    // ==========================================
    // --- 8. FRENCH DEFENSE ---
    // ==========================================
    ['e2e4', 'e7e6', 'd2d4', 'd7d5', 'e4e5', 'c7c5', 'c2c3', 'b8c6', 'g1f3', 'd8b6', 'a2a3', 'c5c4', 'b1d2', 'c6a5', 'f1e2', 'c8d7', 'e1g1', 'g8e7', 'a1b1', 'a5b3', 'd2b3', 'd7a4'], // Advance
    ['e2e4', 'e7e6', 'd2d4', 'd7d5', 'b1c3', 'f8b4', 'e4e5', 'c7c5', 'a2a3', 'b4c3', 'b2c3', 'g8e7', 'd1g4', 'c5d4', 'g4g7', 'h8g8', 'g7h7', 'd8c7', 'g1e2', 'b8c6', 'f2f4', 'd4c3'], // Winawer Poisoned Pawn
    ['e2e4', 'e7e6', 'd2d4', 'd7d5', 'b1c3', 'g8f6', 'c1g5', 'f8e7', 'e4e5', 'f6d7', 'g5e7', 'd8e7', 'f2f4', 'e8g8', 'g1f3', 'c7c5', 'd1d2', 'b8c6', 'e1c1', 'a7a6'], // Classical
    ['e2e4', 'e7e6', 'd2d4', 'd7d5', 'b1d2', 'c7c5', 'e4d5', 'e6d5', 'g1f3', 'g8f6', 'f1b5', 'c8d7', 'b5d7', 'b8d7', 'e1g1', 'f8e7', 'd4c5', 'd7c5', 'f3d4', 'd8d7'], // Tarrasch Open
    ['e2e4', 'e7e6', 'd2d4', 'd7d5', 'b1d2', 'g8f6', 'e4e5', 'f6d7', 'f1d3', 'c7c5', 'c2c3', 'b8c6', 'g1e2', 'c5d4', 'c3d4', 'f7f6', 'e5f6', 'd7f6', 'e1g1', 'f8d6', 'd2f3', 'd8c7'], // Tarrasch Closed
    ['e2e4', 'e7e6', 'd2d4', 'd7d5', 'e4d5', 'e6d5', 'f1d3', 'b8c6', 'c2c3', 'f8d6', 'g1f3', 'g8e7', 'e1g1', 'c8g4', 'h2h3', 'g4h5', 'f1e1', 'd8d7', 'b1d2', 'e8c8'], // Exchange

    // ==========================================
    // --- 9. CARO-KANN DEFENSE ---
    // ==========================================
    ['e2e4', 'c7c6', 'd2d4', 'd7d5', 'b1c3', 'd5e4', 'c3e4', 'c8f5', 'e4g3', 'f5g6', 'h2h4', 'h7h6', 'g1f3', 'b8d7', 'h4h5', 'g6h7', 'f1d3', 'h7d3', 'd1d3', 'e7e6', 'c1d2', 'g8f6', 'e1c1', 'f8e7', 'c1b1', 'e8g8'], // Classical Capablanca
    ['e2e4', 'c7c6', 'd2d4', 'd7d5', 'e4e5', 'c8f5', 'g1f3', 'e7e6', 'f1e2', 'c6c5', 'c1e3', 'd8b6', 'b1c3', 'b8c6', 'e1g1', 'b6b2', 'd1e1', 'c5d4', 'e3d4', 'c6d4', 'f3d4', 'f8b4'], // Advance 3...Bf5
    ['e2e4', 'c7c6', 'd2d4', 'd7d5', 'e4e5', 'c8f5', 'h2h4', 'h7h5', 'c2c4', 'e7e6', 'b1c3', 'g8e7', 'c1g5', 'd8b6', 'd1d2', 'b8d7', 'g1f3', 'd5c4', 'f1c4'], // Advance Tal
    ['e2e4', 'c7c6', 'd2d4', 'd7d5', 'e4xd5', 'c6xd5', 'c2c4', 'g8f6', 'b1c3', 'e7e6', 'g1f3', 'f8e7', 'c4d5', 'f6d5', 'f1d3', 'e8g8', 'e1g1', 'b8c6', 'f1e1', 'f8e8', 'a2a3'], // Panov-Botvinnik
    ['e2e4', 'c7c6', 'b1c3', 'd7d5', 'g1f3', 'c8g4', 'h2h3', 'g4f3', 'd1f3', 'e7e6', 'd2d4', 'g8f6', 'f1d3', 'd5e4', 'c3e4', 'f6e4', 'f3e4', 'b8d7', 'c2c3', 'f8e7', 'e1g1'], // Two Knights
    ['e2e4', 'c7c6', 'd2d4', 'd7d5', 'b1c3', 'd5e4', 'c3e4', 'g8f6', 'e4f6', 'e7f6', 'c2c3', 'f8d6', 'f1d3', 'e8g8', 'd1c2', 'f8e8', 'g1e2', 'h7h6', 'c1e3', 'c8e6', 'e1c1'], // Tartakower

    // ==========================================
    // --- 10. SCANDINAVIAN & ALEKHINE & PIRC ---
    // ==========================================
    ['e2e4', 'd7d5', 'e4xd5', 'd8xd5', 'b1c3', 'd5a5', 'd2d4', 'g8f6', 'g1f3', 'c7c6', 'f1c4', 'c8f5', 'c1d2', 'e7e6', 'c3d5', 'a5d8', 'd5f6', 'd8f6', 'd1e2', 'f5g4', 'e1c1', 'f8d6'], // Scandi 3...Qa5
    ['e2e4', 'd7d5', 'e4xd5', 'd8xd5', 'b1c3', 'd5d6', 'd2d4', 'g8f6', 'g1f3', 'a7a6', 'g2g3', 'c8g4', 'f1g2', 'b8c6', 'e1g1', 'e8c8', 'c1e3', 'e7e6'], // Scandi 3...Qd6
    ['e2e4', 'd7d5', 'e4xd5', 'g8f6', 'd2d4', 'f6d5', 'g1f3', 'g7g6', 'f1e2', 'f8g7', 'e1g1', 'e8g8', 'c2c4', 'd5b6', 'b1c3', 'c8g4', 'c4c5', 'b6d5'], // Scandi 2...Nf6
    ['e2e4', 'g8f6', 'e4e5', 'f6d5', 'd2d4', 'd7d6', 'g1f3', 'c8g4', 'f1e2', 'e7e6', 'e1g1', 'f8e7', 'c2c4', 'd5b6', 'b1c3', 'e8g8', 'c1e3', 'd6d5', 'c4c5', 'g4f3', 'e2f3', 'b6c4'], // Alekhine Modern
    ['e2e4', 'g8f6', 'e4e5', 'f6d5', 'd2d4', 'd7d6', 'c2c4', 'd5b6', 'f2f4', 'd6e5', 'f4e5', 'b8c6', 'c1e3', 'c8f5', 'b1c3', 'e7e6', 'g1f3', 'f8e7', 'd4d5', 'e6d5', 'c4d5', 'c6b4'], // Alekhine Four Pawns
    ['e2e4', 'd7d6', 'd2d4', 'g8f6', 'b1c3', 'g7g6', 'g1f3', 'f8g7', 'f1e2', 'e8g8', 'e1g1', 'c7c6', 'a2a4', 'a7a5', 'h2h3', 'b8a6', 'c1e3', 'a6b4', 'd1d2', 'd6d5'], // Pirc Classical
    ['e2e4', 'd7d6', 'd2d4', 'g8f6', 'b1c3', 'g7g6', 'f2f4', 'f8g7', 'g1f3', 'e8g8', 'f1d3', 'b8a6', 'e1g1', 'c7c5', 'd4d5', 'c8g4', 'h2h3', 'g4f3', 'd1f3', 'a6b4'], // Pirc Austrian
    ['e2e4', 'g7g6', 'd2d4', 'f8g7', 'b1c3', 'd7d6', 'g1f3', 'a7a6', 'c1e3', 'b7b5', 'f1d3', 'c8b7', 'e1g1', 'b8d7', 'f1e1', 'e7e6', 'a2a4', 'b5b4', 'c3e2', 'g8f6'], // Modern Defense

    // ==========================================
    // --- 11. QUEEN'S GAMBIT DECLINED ---
    // ==========================================
    ['d2d4', 'd7d5', 'c2c4', 'e7e6', 'b1c3', 'g8f6', 'c1g5', 'f8e7', 'e2e3', 'e8g8', 'g1f3', 'b8d7', 'a1c1', 'c7c6', 'f1d3', 'd5c4', 'd3c4', 'f6d5', 'g5e7', 'd8e7', 'e1g1', 'd5c3', 'c1c3', 'e6e5'], // QGD Main
    ['d2d4', 'd7d5', 'c2c4', 'e7e6', 'b1c3', 'g8f6', 'c1g5', 'f8e7', 'e2e3', 'h7h6', 'g5h4', 'e8g8', 'g1f3', 'b7b6', 'f1d3', 'c8b7', 'e1g1', 'b8d7', 'd1e2', 'c7c5', 'f1d1', 'f6e4', 'h4g3', 'e4g3'], // QGD Tartakower
    ['d2d4', 'd7d5', 'c2c4', 'e7e6', 'b1c3', 'g8f6', 'c1g5', 'f8e7', 'e2e3', 'h7h6', 'g5h4', 'f6e4', 'h4e7', 'd8e7', 'c4d5', 'e4c3', 'b2c3', 'e6d5', 'd1b3', 'c7c6', 'c3c4', 'd5c4', 'f1c4', 'e8g8'], // QGD Lasker
    ['d2d4', 'd7d5', 'c2c4', 'e7e6', 'b1c3', 'g8f6', 'c4d5', 'e6d5', 'c1g5', 'c7c6', 'e2e3', 'f8e7', 'f1d3', 'b8d7', 'd1c2', 'e8g8', 'g1e2', 'f8e8', 'e1g1', 'd7f8', 'a1e1', 'g7g6'], // QGD Exchange Carlsbad
    ['d2d4', 'd7d5', 'c2c4', 'e7e6', 'b1c3', 'g8f6', 'c1g5', 'b8d7', 'e2e3', 'c7c6', 'g1f3', 'd8a5', 'f3d2', 'f8b4', 'd1c2', 'e8g8', 'f1e2', 'e6e5', 'd4e5', 'd5d4', 'e3d4', 'd7e5'], // Cambridge Springs

    // ==========================================
    // --- 12. QUEEN'S GAMBIT ACCEPTED & SLAV ---
    // ==========================================
    ['d2d4', 'd7d5', 'c2c4', 'd5c4', 'g1f3', 'g8f6', 'e2e3', 'e7e6', 'f1c4', 'c7c5', 'e1g1', 'a7a6', 'd1e2', 'b7b5', 'c4b3', 'c8b7', 'f1d1', 'b8d7', 'b1c3', 'd8b8'], // QGA Classical
    ['d2d4', 'd7d5', 'c2c4', 'd5c4', 'e2e4', 'e7e5', 'g1f3', 'e5d4', 'f1c4', 'b8c6', 'e1g1', 'c8e6', 'c4e6', 'f7e6', 'd1b3', 'd8d7', 'b3b7', 'a8b8', 'b7a6', 'g8f6'], // QGA 3.e4
    ['d2d4', 'd7d5', 'c2c4', 'c7c6', 'g1f3', 'g8f6', 'b1c3', 'd5c4', 'a2a4', 'c8f5', 'e2e3', 'e7e6', 'f1c4', 'f8b4', 'e1g1', 'e8g8', 'd1e2', 'b8d7', 'e3e4', 'f5g6', 'c4d3', 'g6h5'], // Slav Classical
    ['d2d4', 'd7d5', 'c2c4', 'c7c6', 'g1f3', 'g8f6', 'b1c3', 'a7a6', 'e2e3', 'b7b5', 'b2b3', 'c8g4', 'f1e2', 'e7e6', 'e1g1', 'b8d7', 'c1b2', 'f8d6', 'h2h3', 'g4h5'], // Slav Chebanenko
    ['d2d4', 'd7d5', 'c2c4', 'c7c6', 'c4d5', 'c6d5', 'b1c3', 'g8f6', 'c1f4', 'b8c6', 'e2e3', 'a7a6', 'f1d3', 'c8g4', 'g1e2', 'e7e6', 'e1g1', 'f8e7', 'a1c1', 'e8g8'], // Slav Exchange
    ['d2d4', 'd7d5', 'c2c4', 'c7c6', 'g1f3', 'g8f6', 'b1c3', 'e7e6', 'e2e3', 'b8d7', 'f1d3', 'd5c4', 'd3c4', 'b7b5', 'c4d3', 'a7a6', 'e3e4', 'c6c5', 'e4e5', 'c5d4', 'c3b5', 'a6b5', 'e5f6', 'g7f6', 'e1g1', 'd8b6'], // Semi-Slav Meran
    ['d2d4', 'd7d5', 'c2c4', 'c7c6', 'g1f3', 'g8f6', 'b1c3', 'e7e6', 'c1g5', 'h7h6', 'g5f6', 'd8f6', 'e2e3', 'b8d7', 'f1d3', 'g7g6', 'e1g1', 'f8g7', 'e3e4', 'd5e4', 'c3e4', 'f6e7', 'c4c5', 'e8g8'], // Semi-Slav Moscow
    ['d2d4', 'd7d5', 'c2c4', 'c7c6', 'g1f3', 'g8f6', 'b1c3', 'e7e6', 'c1g5', 'd5c4', 'e2e4', 'b7b5', 'e4e5', 'h7h6', 'g5h4', 'g7g5', 'f3g5', 'h6g5', 'h4g5', 'b8d7'], // Semi-Slav Botvinnik

    // ==========================================
    // --- 13. KING'S INDIAN & GRUNFELD ---
    // ==========================================
    ['d2d4', 'g8f6', 'c2c4', 'g7g6', 'b1c3', 'f8g7', 'e2e4', 'd7d6', 'g1f3', 'e8g8', 'f1e2', 'e7e5', 'e1g1', 'b8c6', 'd4d5', 'c6e7', 'b2b4', 'a7a5', 'b4a5', 'a8a5', 'a2a4', 'f6d7', 'c1a3', 'b7b6'], // KID Classical Mar del Plata
    ['d2d4', 'g8f6', 'c2c4', 'g7g6', 'b1c3', 'f8g7', 'e2e4', 'd7d6', 'g1f3', 'e8g8', 'f1e2', 'e7e5', 'e1g1', 'b8c6', 'd4d5', 'c6e7', 'f3e1', 'f6d7', 'c1e3', 'f7f5', 'f2f3', 'f5f4', 'e3f2', 'g6g5', 'a2a4', 'e7g6'], // KID 9.Ne1
    ['d2d4', 'g8f6', 'c2c4', 'g7g6', 'b1c3', 'f8g7', 'e2e4', 'd7d6', 'f2f3', 'e8g8', 'c1e3', 'e7e5', 'd4d5', 'c7c6', 'd1d2', 'c6d5', 'c4d5', 'a7a6', 'e1c1', 'b8d7', 'c1b1', 'b7b5'], // KID Samisch
    ['d2d4', 'g8f6', 'c2c4', 'g7g6', 'g2g3', 'f8g7', 'f1g2', 'e8g8', 'g1f3', 'd7d6', 'e1g1', 'b8d7', 'b1c3', 'e7e5', 'e2e4', 'c7c6', 'h2h3', 'd8b6', 'f1e1', 'e5d4', 'f3d4', 'f8e8'], // KID Fianchetto
    ['d2d4', 'g8f6', 'c2c4', 'g7g6', 'b1c3', 'd7d5', 'c4d5', 'f6d5', 'e2e4', 'd5c3', 'b2c3', 'f8g7', 'f1c4', 'c7c5', 'g1e2', 'b8c6', 'c1e3', 'e8g8', 'e1g1', 'c8g4', 'f2f3', 'c6a5', 'c4d3', 'c5d4', 'c3d4', 'g4e6'], // Grunfeld Exchange 7.Bc4
    ['d2d4', 'g8f6', 'c2c4', 'g7g6', 'b1c3', 'd7d5', 'c4d5', 'f6d5', 'e2e4', 'd5c3', 'b2c3', 'f8g7', 'g1f3', 'c7c5', 'a1b1', 'e8g8', 'f1e2', 'c5d4', 'c3d4', 'd8a5', 'c1d2', 'a5a2', 'e1g1', 'c8g4'], // Grunfeld 7.Nf3 8.Rb1
    ['d2d4', 'g8f6', 'c2c4', 'g7g6', 'b1c3', 'd7d5', 'g1f3', 'f8g7', 'd1b3', 'd5c4', 'b3c4', 'e8g8', 'e2e4', 'a7a6', 'f1e2', 'b7b5', 'c4b3', 'c7c5', 'd4c5', 'c8e6', 'b3c2', 'b8d7'], // Grunfeld Russian

    // ==========================================
    // --- 14. NIMZO-INDIAN, QUEEN'S & CATALAN ---
    // ==========================================
    ['d2d4', 'g8f6', 'c2c4', 'e7e6', 'b1c3', 'f8b4', 'e2e3', 'e8g8', 'f1d3', 'd7d5', 'g1f3', 'c7c5', 'e1g1', 'b8c6', 'a2a3', 'b4c3', 'b2c3', 'd5c4', 'd3c4', 'd8c7', 'f1e1', 'e6e5', 'h2h3', 'c8f5'], // Nimzo Rubinstein
    ['d2d4', 'g8f6', 'c2c4', 'e7e6', 'b1c3', 'f8b4', 'd1c2', 'e8g8', 'a2a3', 'b4c3', 'c2c3', 'b7b6', 'c1g5', 'c8b7', 'f2f3', 'h7h6', 'g5h4', 'd7d5', 'e2e3', 'b8d7', 'c4d5', 'f6d5', 'h4d8', 'd5c3', 'd8e7'], // Nimzo Classical
    ['d2d4', 'g8f6', 'c2c4', 'e7e6', 'g1f3', 'b7b6', 'g2g3', 'c8a6', 'b2b3', 'f8b4', 'c1d2', 'b4e7', 'f1g2', 'c7c6', 'd2c3', 'd7d5', 'f3e5', 'f6d7', 'e5d7', 'b8d7', 'b1d2', 'e8g8', 'e1g1', 'a8c8'], // QID Classical
    ['d2d4', 'g8f6', 'c2c4', 'e7e6', 'g1f3', 'f8b4', 'c1d2', 'd8e7', 'g2g3', 'b8c6', 'b1c3', 'b4c3', 'd2c3', 'f6e4', 'a1c1', 'e8g8', 'f1g2', 'd7d6', 'd4d5', 'e4c3', 'c1c3', 'c6b8'], // Bogo-Indian
    ['d2d4', 'g8f6', 'c2c4', 'e7e6', 'g2g3', 'd7d5', 'f1g2', 'd5c4', 'g1f3', 'f8e7', 'e1g1', 'e8g8', 'd1c2', 'a7a6', 'c2c4', 'b7b5', 'c4c2', 'c8b7', 'c1d2', 'b7e4', 'c2c1', 'c7c6', 'd2e3', 'b8d7'], // Catalan Open
    ['d2d4', 'g8f6', 'c2c4', 'e7e6', 'g2g3', 'd7d5', 'f1g2', 'f8e7', 'g1f3', 'e8g8', 'e1g1', 'b8d7', 'd1c2', 'c7c6', 'b1d2', 'b7b6', 'e2e4', 'c8b7', 'e4e5', 'f6e8', 'c4d5', 'c6d5', 'f1e1', 'a8c8'], // Catalan Closed

    // ==========================================
    // --- 15. BENONI, BENKO, DUTCH & BUDAPEST ---
    // ==========================================
    ['d2d4', 'g8f6', 'c2c4', 'c7c5', 'd4d5', 'e7e6', 'b1c3', 'e6d5', 'c4d5', 'd7d6', 'e2e4', 'g7g6', 'f2f4', 'f8g7', 'f1b5', 'f6d7', 'a2a4', 'e8g8', 'g1f3', 'b8a6', 'e1g1', 'a6b4'], // Modern Benoni f4
    ['d2d4', 'g8f6', 'c2c4', 'c7c5', 'd4d5', 'e7e6', 'b1c3', 'e6d5', 'c4d5', 'd7d6', 'e2e4', 'g7g6', 'g1f3', 'f8g7', 'f1e2', 'e8g8', 'e1g1', 'f8e8', 'f3d2', 'b8d7', 'a2a4', 'd7e5'], // Modern Benoni Classical
    ['d2d4', 'g8f6', 'c2c4', 'c7c5', 'd4d5', 'b7b5', 'c4b5', 'a7a6', 'b5a6', 'c8a6', 'b1c3', 'd7d6', 'e2e4', 'a6f1', 'e1f1', 'g7g6', 'g1f3', 'f8g7', 'g2g3', 'e8g8', 'f1g2', 'b8d7', 'h2h3', 'd8a5'], // Benko Gambit Accepted
    ['d2d4', 'g8f6', 'c2c4', 'c7c5', 'd4d5', 'b7b5', 'c4b5', 'a7a6', 'b5b6', 'd8b6', 'b1c3', 'd7d6', 'e2e4', 'g7g6', 'g1f3', 'f8g7', 'f1e2', 'e8g8', 'e1g1', 'c8g4'], // Benko Declined 5.b6
    ['d2d4', 'f7f5', 'g2g3', 'g8f6', 'f1g2', 'g7g6', 'g1f3', 'f8g7', 'e1g1', 'e8g8', 'c2c4', 'd7d6', 'b1c3', 'd8e8', 'd4d5', 'a7a5', 'a1b1', 'b8a6', 'b2b3', 'c8d7', 'c1b2', 'a6c5'], // Dutch Leningrad
    ['d2d4', 'f7f5', 'g2g3', 'e7e6', 'f1g2', 'g8f6', 'g1f3', 'd7d5', 'e1g1', 'f8d6', 'c2c4', 'c7c6', 'b2b3', 'd8e7', 'c1b2', 'e8g8', 'd1c1', 'b7b6', 'b2a3', 'c8b7', 'a3d6', 'e7d6'], // Dutch Stonewall
    ['d2d4', 'g8f6', 'c2c4', 'e7e5', 'd4e5', 'f6g4', 'c1f4', 'b8c6', 'g1f3', 'f8b4', 'b1d2', 'd8e7', 'e2e3', 'g4e5', 'f3e5', 'c6e5', 'f1e2', 'e8g8', 'e1g1', 'b4d2', 'd1d2', 'd7d6'], // Budapest Gambit

    // ==========================================
    // --- 16. LONDON SYSTEM, TROMPOWSKY, TORRE ---
    // ==========================================
    ['d2d4', 'd7d5', 'c1f4', 'g8f6', 'e2e3', 'c7c5', 'c2c3', 'b8c6', 'b1d2', 'e7e6', 'g1f3', 'f8d6', 'f4g3', 'e8g8', 'f1d3', 'd8e7', 'f3e5', 'f6d7', 'f2f4', 'f7f5'], // London Main
    ['d2d4', 'd7d5', 'c1f4', 'c7c5', 'e2e3', 'b8c6', 'c2c3', 'g8f6', 'b1d2', 'd8b6', 'd1b3', 'c5c4', 'b3c2', 'g7g6', 'e3e4', 'f6e4', 'd2e4', 'c8f5', 'f2f3', 'd5e4', 'f3e4'], // London vs c5/Qb6
    ['d2d4', 'g8f6', 'c1f4', 'g7g6', 'e2e3', 'f8g7', 'g1f3', 'e8g8', 'f1e2', 'd7d6', 'h2h3', 'c7c5', 'c2c3', 'b7b6', 'e1g1', 'c8b7', 'b1d2', 'b8d7', 'a2a4', 'a7a6'], // London vs KID
    ['d2d4', 'd7d5', 'b1c3', 'g8f6', 'c1f4', 'c7c5', 'e2e3', 'c5d4', 'e3d4', 'a7a6', 'g1f3', 'c8g4', 'h2h3', 'g4f3', 'd1f3', 'e7e6', 'f1d3', 'b8c6', 'c3e2', 'f8d6'], // Jobava London
    ['d2d4', 'g8f6', 'c1g5', 'd7d5', 'e2e3', 'c7c5', 'g5f6', 'g7f6', 'd4c5', 'e7e6', 'b1c3', 'f8c5', 'd1h5', 'b8c6', 'e1c1', 'c8d7', 'g1f3', 'd8e7'], // Trompowsky
    ['d2d4', 'g8f6', 'c1g5', 'e7e6', 'e2e4', 'h7h6', 'g5f6', 'd8f6', 'g1f3', 'd7d6', 'b1c3', 'c7c6', 'f1d3', 'e6e5', 'd4d5', 'f8e7', 'd1e2', 'e8g8'], // Trompowsky 2...e6

    // ==========================================
    // --- 17. ENGLISH OPENING ---
    // ==========================================
    ['c2c4', 'e7e5', 'b1c3', 'g8f6', 'g1f3', 'b8c6', 'g2g3', 'f8b4', 'f1g2', 'e8g8', 'e1g1', 'e5e4', 'f3g5', 'b4c3', 'b2c3', 'f8e8', 'f2f3', 'e4f3', 'g5f3', 'd7d5', 'c4d5', 'd8d5'], // English Four Knights
    ['c2c4', 'e7e5', 'b1c3', 'g8f6', 'g1f3', 'b8c6', 'e2e3', 'f8b4', 'd1c2', 'b4c3', 'c2c3', 'd8e7', 'a2a3', 'a7a5', 'b2b3', 'd7d6', 'c1b2', 'e8g8', 'd2d3', 'f8e8', 'f1e2'], // English 2.Nc3
    ['c2c4', 'c7c5', 'b1c3', 'b8c6', 'g2g3', 'g7g6', 'f1g2', 'f8g7', 'g1f3', 'g8f6', 'e1g1', 'e8g8', 'd2d4', 'c5d4', 'f3d4', 'd7d6', 'd4c2', 'c8e6', 'b2b3', 'd8d7'], // Symmetrical English
    ['c2c4', 'c7c5', 'g1f3', 'g8f6', 'd2d4', 'c5d4', 'f3d4', 'b7b6', 'b1c3', 'c8b7', 'f2f3', 'e7e6', 'e2e4', 'd7d6', 'c1e3', 'a7a6', 'f1e2', 'f8e7', 'e1g1', 'e8g8'], // English Hedgehog
    ['c2c4', 'g8f6', 'b1c3', 'e7e6', 'e2e4', 'd7d5', 'e4e5', 'd5d4', 'e5f6', 'd4c3', 'b2c3', 'd8f6', 'd2d4', 'b7b6', 'g1f3', 'c8b7', 'c1g5', 'f6f5', 'f1d3', 'f5a5'], // Mikenas Attack

    // ==========================================
    // --- 18. RETI & KING'S INDIAN ATTACK ---
    // ==========================================
    ['g1f3', 'd7d5', 'c2c4', 'c7c6', 'b2b3', 'g8f6', 'g2g3', 'c8f5', 'f1g2', 'e7e6', 'c1b2', 'f8e7', 'e1g1', 'h7h6', 'd2d3', 'e8g8', 'b1d2', 'b8d7', 'a1c1', 'a7a5', 'a2a3', 'f5h7'], // Reti Main
    ['g1f3', 'd7d5', 'g2g3', 'g8f6', 'f1g2', 'c7c6', 'e1g1', 'c8g4', 'd2d3', 'b8d7', 'b1d2', 'e7e5', 'e2e4', 'd5e4', 'd3e4', 'f8c5', 'h2h3', 'g4h5', 'd1e2', 'e8g8', 'f1d1'], // Reti vs c6/Bg4
    ['g1f3', 'd7d5', 'g2g3', 'g8f6', 'f1g2', 'e7e6', 'e1g1', 'f8e7', 'd2d3', 'e8g8', 'b1d2', 'c7c5', 'e2e4', 'b8c6', 'f1e1', 'b7b5', 'e4e5', 'f6d7', 'd2f1', 'a7a5', 'h2h4', 'b5b4', 'f1h2', 'a5a4'], // King's Indian Attack
    ['g1f3', 'g8f6', 'g2g3', 'g7g6', 'b2b3', 'f8g7', 'c1b2', 'e8g8', 'f1g2', 'd7d6', 'd2d4', 'b8d7', 'e1g1', 'e7e5', 'd4e5', 'f6g4', 'd1d2', 'g4e5', 'f3e5', 'd6e5'], // Reti vs KID

    // ==========================================
    // --- 19. EXTENDED GRANDMASTER REPERTOIRE ---
    // ==========================================
    ["e2e4","c7c5","g1f3","e7e6","d2d4","c5d4","f3d4","g8f6","b1c3","f8b4","e4e5","f6d5","c1d2","d5c3","b2c3","b4e7","d1g4","e8g8","f1d3","d7d6"],
    ["e2e4","c7c5","g1f3","a7a6","c2c3","d7d5","e4d5","d8d5","d2d4","g8f6","f1e2","c8g4","e1g1","e7e6","h2h3","g4h5","c1e3","c5d4","c3d4"],
    ["e2e4","c7c5","g1f3","g8f6","e4e5","f6d5","b1c3","e7e6","c3d5","e6d5","d2d4","b8c6","d4c5","f8c5","d1d5","d8b6","f1c4","c5f2","e1e2","e8g8"],
    ["e2e4","c7c5","b1c3","b8c6","f2f4","g7g6","g1f3","f8g7","f1c4","e7e6","f4f5","g8e7","f5e6","d7e6","d2d3","e8g8","e1g1","c6a5","c1e3","b7b6"],
    ["e2e4","e7e5","g1f3","b8c6","f1b5","a7a6","b5c6","d7c6","e1g1","d8d6","d2d4","e5d4","f3d4","c8d7","c1e3","e8c8","b1d2","d6g6","d1f3","f8d6"],
    ["e2e4","e7e5","g1f3","b8c6","f1b5","g8e7","c2c3","d7d5","e4d5","d8d5","d1e2","c8d7","e1g1","e8c8","f1e1","f7f6","d2d4","e5d4","c3d4"],
    ["e2e4","e7e5","g1f3","b8c6","f1b5","c6d4","f3d4","e5d4","e1g1","f8c5","d2d3","c7c6","b5c4","d7d5","e4d5","c6d5","c4b5","c8d7","f1e1","g8e7"],
    ["e2e4","e7e5","g1f3","b8c6","f1c4","f8c5","b2b4","c5b6","a2a4","a7a6","b1c3","g8f6","c3d5","f6d5","e4d5","c6d4","a4a5","b6a7","d2d3","d7d6"],
    ["e2e4","e7e5","g1f3","b8c6","f1c4","g8f6","d2d3","f8e7","e1g1","d7d6","f1e1","e8g8","c2c3","c6a5","c4b5","a7a6","b5a4","b7b5","a4c2","c7c5"],
    ["e2e4","e7e6","d2d4","d7d5","b1c3","g8f6","c1g5","d5e4","c3e4","f8e7","g5f6","e7f6","g1f3","e8g8","d1d2","b8d7","e1c1","f6e7","f1d3","b7b6"],
    ["e2e4","c7c6","d2d4","d7d5","e4e5","c8f5","g1f3","e7e6","f1e2","b8d7","e1g1","h7h6","b1d2","g8e7","d2b3","g7g5","c1d2","f8g7","c2c4","e8g8"],
    ["e2e4","c7c6","d2d4","d7d5","f2f3","d5e4","f3e4","e7e5","g1f3","c8g4","f1c4","b8d7","c2c3","g8f6","d1b3","d8e7","e1g1","b7b5","c4d3"],
    ["d2d4","d7d5","c2c4","e7e5","d4e5","d5d4","g1f3","b8c6","a2a3","c8g4","b1d2","d8e7","h2h3","g4f3","d2f3","e8c8","c1f4","f7f6","e5f6","g8f6"],
    ["d2d4","d7d5","c2c4","b8c6","g1f3","c8g4","c4d5","g4f3","g2f3","d8d5","e2e3","e7e5","b1c3","f8b4","c1d2","b4c3","b2c3","e5d4","c3d4","g8e7"],
    ["d2d4","d7d5","c2c4","e7e6","b1c3","g8f6","c1g5","f8e7","e2e3","e8g8","g1f3","b8d7","a1c1","c7c6","f1d3","d5c4","d3c4","f6d5","g5e7","d8e7","e1g1","d5c3","c1c3","e6e5","d1c2","e5d4","e3d4","d7f6","f1e1","e7d6"],
    ["d2d4","d7d5","c2c4","c7c6","g1f3","g8f6","b1c3","e7e6","c1g5","h7h6","g5h4","d5c4","e2e4","g7g5","h4g3","b7b5","f1e2","c8b7","e1g1","b8d7","f3e5","f8g7"],
    ["d2d4","g8f6","c2c4","g7g6","b1c3","f8g7","e2e4","d7d6","f2f4","e8g8","g1f3","c7c5","d4d5","e7e6","f1e2","e6d5","c4d5","f8e8","e4e5","d6e5","f4e5","f6g4","c1g5","d8b6"],
    ["d2d4","g8f6","c2c4","g7g6","b1c3","f8g7","e2e4","d7d6","f1e2","e8g8","c1g5","c7c5","d4d5","h7h6","g5f4","e7e6","d1d2","e6d5","e4d5","g8h7","g1f3"],
    ["d2d4","g8f6","c2c4","g7g6","b1c3","d7d5","c1f4","f8g7","e2e3","e8g8","a1c1","c7c5","d4c5","d8a5","c4d5","f8d8","f1c4","a5c5","c4b3"],
    ["d2d4","g8f6","c2c4","g7g6","b1c3","d7d5","c1g5","f6e4","g5h4","e4c3","b2c3","d5c4","e2e3","c8e6","a1b1","b7b6","g1e2","f8g7","e2f4"],
    ["d2d4","g8f6","c2c4","e7e6","b1c3","f8b4","f2f3","d7d5","a2a3","b4c3","b2c3","c7c5","c4d5","f6d5","d4c5","f7f5","e2e3","e8g8","f1c4","d5c3"],
    ["d2d4","d7d5","g1f3","g8f6","e2e3","e7e6","f1d3","c7c5","b2b3","b8c6","e1g1","f8d6","c1b2","e8g8","b1d2","d8e7","f3e5","c5d4","e3d4","d6a3"],
    ["d2d4","g8f6","g1f3","e7e6","c1g5","c7c5","e2e3","f8e7","b1d2","b7b6","c2c3","c8b7","f1d3","c5d4","e3d4","d7d6","e1g1","b8d7","f1e1","e8g8"],
    ["d2d4","d7d5","e2e4","d5e4","b1c3","g8f6","f2f3","e4f3","g1f3","e7e6","c1g5","f8e7","f1d3","e8g8","e1g1","b8d7","d1e1","f8e8","a1d1"],
    ["c2c4","e7e5","b1c3","b8c6","g2g3","g7g6","f1g2","f8g7","d2d3","d7d6","e2e4","f7f5","g1e2","g8f6","e1g1","e8g8","c3d5","c8e6","c1g5","d8d7"],
    ["c2c4","f7f5","b1c3","g8f6","g2g3","g7g6","f1g2","f8g7","d2d3","d7d6","e2e4","e7e5","g1e2","e8g8","e1g1","c7c6","f2f4","d8b6","g1h1"],
    ["e2e4","e7e5","d2d4","e5d4","c2c3","d4c3","f1c4","c3b2","c1b2","d7d5","c4d5","g8f6","d5f7","e8f7","d1d8","f8b4","d8d2","b4d2","b1d2","h8e8"],
    ["e2e4","e7e5","d2d4","e5d4","d1d4","b8c6","d4e3","g8f6","b1c3","f8b4","c1d2","e8g8","e1c1","f8e8","e3g3","e8e4","a2a3","b4d6","f2f4","e4e8"],
    ["e2e4","e7e5","g1f3","b8c6","c2c3","d7d5","d1a4","f7f6","f1b5","g8e7","e4d5","d8d5","e1g1","c8d7","d2d4","e5d4","c3d4","e8c8","b1c3","d5h5"],
    ["e2e4","e7e5","f1c4","g8f6","d2d3","c7c6","g1f3","d7d5","c4b3","f8d6","b1c3","d5e4","d3e4","e8g8","e1g1","b8a6","c1g5","h7h6","g5h4"]
];

// UCI Move parser
function parseUci(uci) {
    const fC = uci.charCodeAt(0) - 97;
    const fR = 8 - parseInt(uci[1], 10);
    const tC = uci.charCodeAt(2) - 97;
    const tR = 8 - parseInt(uci[3], 10);
    return { fR, fC, tR, tC };
}

console.log(`Starting Grandmaster opening book generation from ${rawLines.length} master theoretical lines...`);

const book = {};
let validMoves = 0;
let lineFailures = 0;

rawLines.forEach((line, index) => {
    ChessLogic.initBoard();
    let currentLineValid = true;

    for (let step = 0; step < line.length; step++) {
        const raw = line[step];
        const uci = raw.replace('x', '').replace('+', '').replace('#', '');
        const fen = ChessLogic.getFen();
        const parts = fen.split(/\s+/);
        const key = parts.slice(0, 4).join(' ');

        if (!book[key]) book[key] = [];
        if (!book[key].includes(uci)) book[key].push(uci);

        const m = parseUci(uci);
        const ok = ChessLogic.movePiece(m.fR, m.fC, m.tR, m.tC);
        if (!ok) {
            console.error(`[Error] Line ${index + 1} step ${step + 1} FAILED MOVE: "${uci}" (FEN: ${fen})`);
            currentLineValid = false;
            lineFailures++;
            break;
        }
        validMoves++;
    }
});

const uniquePositions = Object.keys(book).length;
console.log('----------------------------------------------------');
console.log(`Successfully processed ${validMoves} valid moves across ${rawLines.length} grandmaster opening lines.`);
if (lineFailures > 0) {
    console.warn(`WARNING: ${lineFailures} lines encountered invalid moves.`);
}
console.log(`Total unique verified opening positions: ${uniquePositions}`);
console.log('----------------------------------------------------');

const jsonPath = path.join(__dirname, 'generated_book.json');
fs.writeFileSync(jsonPath, JSON.stringify(book, null, 2), 'utf-8');
console.log(`Saved JSON book to ${jsonPath} (${(fs.statSync(jsonPath).size / 1024).toFixed(1)} KB)`);
