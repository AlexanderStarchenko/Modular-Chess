const ChessLogic = require('../js/logic.js');
const fs = require('fs');

const rawLines = [
    // --- RUY LOPEZ (SPANISH) ---
    ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1b5', 'a7a6', 'b5a4', 'g8f6', 'e1g1', 'f8e7'],
    ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1b5', 'a7a6', 'b5a4', 'g8f6', 'e1g1', 'f8e7', 'f1e1', 'b7b5', 'a4b3', 'd7d6', 'c2c3', 'e8g8', 'h2h3'],
    ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1b5', 'a7a6', 'b5a4', 'g8f6', 'e1g1', 'f8e7', 'f1e1', 'b7b5', 'a4b3', 'e8g8', 'c2c3', 'd7d5', 'e4d5', 'f6d5'], // Marshall
    ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1b5', 'a7a6', 'b5a4', 'g8f6', 'e1g1', 'f6e4', 'd2d4', 'b7b5', 'a4b3', 'd7d5', 'd4e5', 'c8e6'], // Open
    ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1b5', 'a7a6', 'b5c6', 'd7c6', 'd2d4', 'e5d4', 'd1d4', 'd8d4', 'f3d4', 'c8d7'], // Exchange
    ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1b5', 'g8f6', 'e1g1', 'f6e4', 'd2d4', 'f8e7', 'd1e2', 'e4d6', 'b5c6', 'b7c6', 'd4e5'], // Berlin
    ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1b5', 'd7d6', 'd2d4', 'c8d7', 'b1c3', 'g8f6', 'e1g1', 'f8e7', 'f1e1'], // Steinitz

    // --- ITALIAN GAME & EVANS GAMBIT ---
    ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'f8c5', 'c2c3', 'g8f6', 'd2d3', 'd7d6', 'e1g1', 'a7a6', 'c4b3', 'c5a7'], // Giuoco Piano
    ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'f8c5', 'c2c3', 'g8f6', 'd2d4', 'e5d4', 'c3d4', 'c5b4', 'c1d2', 'b4d2', 'b1d2'], // Main Italian
    ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'f8c5', 'b2b4', 'c5b4', 'c2c3', 'b4a5', 'd2d4', 'e5d4', 'e1g1', 'g8e7', 'c3d4', 'd7d5'], // Evans Gambit
    ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'g8f6', 'd2d3', 'f8c5', 'c2c3', 'e8g8', 'e1g1', 'd7d5', 'e4d5', 'f6d5'], // Two Knights
    ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'g8f6', 'd2d4', 'e5d4', 'e1g1', 'f6e4', 'f1e1', 'd7d5', 'c4d5', 'd8d5', 'b1c3'], // Max Lange

    // --- SCOTCH GAME ---
    ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'd2d4', 'e5d4', 'f3d4', 'f8c5', 'c1e3', 'd8f6', 'c2c3', 'g8e7', 'f1c4', 'c6e5', 'c4e2'],
    ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'd2d4', 'e5d4', 'f3d4', 'g8f6', 'd4c6', 'b7c6', 'e4e5', 'd8e7', 'd1e2', 'f6d5', 'c2c4', 'c8a6'],

    // --- PETROV DEFENSE ---
    ['e2e4', 'e7e5', 'g1f3', 'g8f6', 'f3e5', 'd7d6', 'e5f3', 'f6e4', 'd2d4', 'd6d5', 'f1d3', 'f8e7', 'e1g1', 'b8c6'],
    ['e2e4', 'e7e5', 'g1f3', 'g8f6', 'd2d4', 'f6e4', 'f1d3', 'd7d5', 'f3e5', 'b8d7', 'e1g1', 'd7e5', 'd4e5'],

    // --- FOUR KNIGHTS & VIENNA & PHILIDOR ---
    ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'b1c3', 'g8f6', 'f1b5', 'f8b4', 'e1g1', 'e8g8', 'd2d3', 'd7d6', 'c1g5', 'b4c3', 'b2c3'],
    ['e2e4', 'e7e5', 'b1c3', 'g8f6', 'f2f4', 'd7d5', 'f4e5', 'f6e4', 'd1f3', 'b8c6', 'f1b5', 'e4c3', 'd2c3', 'f8e7'], // Vienna
    ['e2e4', 'e7e5', 'g1f3', 'd7d6', 'd2d4', 'e5d4', 'f3d4', 'g8f6', 'b1c3', 'f8e7', 'f1e2', 'e8g8', 'e1g1'], // Philidor

    // --- KING\'S GAMBIT ---
    ['e2e4', 'e7e5', 'f2f4', 'e5f4', 'g1f3', 'g7g5', 'h2h4', 'g5g4', 'f3e5', 'g8f6', 'd2d4', 'd7d6', 'e5d3'],
    ['e2e4', 'e7e5', 'f2f4', 'f8c5', 'g1f3', 'd7d6', 'c2c3', 'g8f6', 'd2d4', 'e5d4', 'c3d4', 'c5b6'], // Declined

    // --- SICILIAN NAJDORF ---
    ['e2e4', 'c7c5', 'g1f3', 'd7d6', 'd2d4', 'c5d4', 'f3d4', 'g8f6', 'b1c3', 'a7a6', 'c1e3', 'e7e5', 'd4b3', 'c8e6', 'f2f3', 'b8d7', 'd1d2', 'b7b5'],
    ['e2e4', 'c7c5', 'g1f3', 'd7d6', 'd2d4', 'c5d4', 'f3d4', 'g8f6', 'b1c3', 'a7a6', 'c1g5', 'e7e6', 'f2f4', 'f8e7', 'd1f3', 'd8c7', 'e1c1', 'b8d7'],
    ['e2e4', 'c7c5', 'g1f3', 'd7d6', 'd2d4', 'c5d4', 'f3d4', 'g8f6', 'b1c3', 'a7a6', 'f1e2', 'e7e5', 'd4b3', 'f8e7', 'e1g1', 'e8g8', 'c1e3', 'c8e6'],

    // --- SICILIAN DRAGON & ACCELERATED ---
    ['e2e4', 'c7c5', 'g1f3', 'd7d6', 'd2d4', 'c5d4', 'f3d4', 'g8f6', 'b1c3', 'g7g6', 'c1e3', 'f8g7', 'f2f3', 'e8g8', 'd1d2', 'b8c6', 'f1c4', 'c8d7', 'e1c1'],
    ['e2e4', 'c7c5', 'g1f3', 'b8c6', 'd2d4', 'c5d4', 'f3d4', 'g7g6', 'b1c3', 'f8g7', 'c1e3', 'g8f6', 'f1c4', 'e8g8', 'c4b3', 'd7d6', 'f2f3'],

    // --- SICILIAN SVESHNIKOV & KALASHNIKOV ---
    ['e2e4', 'c7c5', 'g1f3', 'b8c6', 'd2d4', 'c5d4', 'f3d4', 'g8f6', 'b1c3', 'e7e5', 'd4b5', 'd7d6', 'c1g5', 'a7a6', 'b5a3', 'b7b5', 'c3d5', 'f8e7', 'g5f6', 'e7f6', 'c2c3'],
    ['e2e4', 'c7c5', 'g1f3', 'b8c6', 'd2d4', 'c5d4', 'f3d4', 'e7e5', 'd4b5', 'd7d6', 'b1c3', 'a7a6', 'b5a3', 'c8e6', 'a3c4', 'a8c8'],

    // --- SICILIAN TAIMANOV & KAN ---
    ['e2e4', 'c7c5', 'g1f3', 'e7e6', 'd2d4', 'c5d4', 'f3d4', 'b8c6', 'b1c3', 'd8c7', 'c1e3', 'a7a6', 'f1e2', 'g8f6', 'e1g1', 'f8b4', 'c3a4', 'b4e7'],
    ['e2e4', 'c7c5', 'g1f3', 'e7e6', 'd2d4', 'c5d4', 'f3d4', 'a7a6', 'f1d3', 'f8c5', 'd4b3', 'c5a7', 'd1e2', 'b8c6', 'c1e3', 'd7d6'],

    // --- SICILIAN CLASSICAL & SCHEVENINGEN ---
    ['e2e4', 'c7c5', 'g1f3', 'd7d6', 'd2d4', 'c5d4', 'f3d4', 'g8f6', 'b1c3', 'e7e6', 'f1e2', 'f8e7', 'e1g1', 'e8g8', 'c1e3', 'b8c6', 'f2f4'],
    ['e2e4', 'c7c5', 'g1f3', 'b8c6', 'd2d4', 'c5d4', 'f3d4', 'g8f6', 'b1c3', 'd7d6', 'c1g5', 'e7e6', 'd1d2', 'a7a6', 'e1c1', 'c8d7'],

    // --- SICILIAN ALAPIN & CLOSED & MORRA & ROSSOLIMO ---
    ['e2e4', 'c7c5', 'c2c3', 'd7d5', 'e4d5', 'd8d5', 'd2d4', 'g8f6', 'g1f3', 'e7e6', 'f1d3', 'c5d4', 'c3d4', 'f8e7', 'b1c3', 'd5d6'],
    ['e2e4', 'c7c5', 'c2c3', 'g8f6', 'e4e5', 'f6d5', 'd2d4', 'c5d4', 'g1f3', 'b8c6', 'f1c4', 'd5b6', 'c4b3', 'd7d5', 'e5d6', 'd8d6'],
    ['e2e4', 'c7c5', 'b1c3', 'b8c6', 'g2g3', 'g7g6', 'f1g2', 'f8g7', 'd2d3', 'd7d6', 'c1e3', 'e7e5', 'd1d2', 'g8e7'],
    ['e2e4', 'c7c5', 'b1c3', 'b8c6', 'f2f4', 'g7g6', 'g1f3', 'f8g7', 'f1c4', 'e7e6', 'f4f5', 'g8e7', 'f5e6', 'f7e6', 'd2d3', 'd7d5'],
    ['e2e4', 'c7c5', 'g1f3', 'b8c6', 'f1b5', 'g7g6', 'e1g1', 'f8g7', 'c2c3', 'g8f6', 'f1e1', 'e8g8', 'd2d4', 'c5d4', 'c3d4', 'd7d5'],
    ['e2e4', 'c7c5', 'g1f3', 'd7d6', 'f1b5', 'c8d7', 'b5d7', 'd8d7', 'e1g1', 'g8f6', 'f1e1', 'b8c6', 'c2c3', 'e7e6', 'd2d4', 'c5d4'],
    ['e2e4', 'c7c5', 'd2d4', 'c5d4', 'c2c3', 'd4c3', 'b1c3', 'b8c6', 'g1f3', 'e7e6', 'f1c4', 'a7a6', 'e1g1', 'g8e7'],

    // --- FRENCH DEFENSE ---
    ['e2e4', 'e7e6', 'd2d4', 'd7d5', 'e4e5', 'c7c5', 'c2c3', 'b8c6', 'g1f3', 'd8b6', 'a2a3', 'c5c4', 'b1d2', 'c6a5'], // Advance
    ['e2e4', 'e7e6', 'd2d4', 'd7d5', 'b1c3', 'f8b4', 'e4e5', 'c7c5', 'a2a3', 'b4c3', 'b2c3', 'g8e7', 'd1g4', 'c5d4', 'g4g7', 'h8g8', 'g7h7'], // Winawer
    ['e2e4', 'e7e6', 'd2d4', 'd7d5', 'b1c3', 'g8f6', 'c1g5', 'f8e7', 'e4e5', 'f6d7', 'g5e7', 'd8e7', 'f2f4', 'e8g8', 'g1f3', 'c7c5'], // Classical
    ['e2e4', 'e7e6', 'd2d4', 'd7d5', 'b1d2', 'c7c5', 'e4d5', 'e6d5', 'g1f3', 'g8f6', 'f1b5', 'c8d7', 'b5d7', 'b8d7', 'e1g1', 'f8e7'], // Tarrasch
    ['e2e4', 'e7e6', 'd2d4', 'd7d5', 'b1d2', 'g8f6', 'e4e5', 'f6d7', 'f1d3', 'c7c5', 'c2c3', 'b8c6', 'g1e2', 'c5d4', 'c3d4'], // Tarrasch closed
    ['e2e4', 'e7e6', 'd2d4', 'd7d5', 'e4d5', 'e6d5', 'f1d3', 'b8c6', 'c2c3', 'f8d6', 'g1f3', 'g8e7', 'e1g1', 'c8g4'], // Exchange

    // --- CARO-KANN DEFENSE ---
    ['e2e4', 'c7c6', 'd2d4', 'd7d5', 'b1c3', 'd5e4', 'c3e4', 'c8f5', 'e4g3', 'f5g6', 'h2h4', 'h7h6', 'g1f3', 'b8d7', 'h4h5', 'g6h7', 'f1d3', 'h7d3', 'd1d3'], // Classical
    ['e2e4', 'c7c6', 'd2d4', 'd7d5', 'e4e5', 'c8f5', 'g1f3', 'e7e6', 'f1e2', 'c6c5', 'c1e3', 'd8b6', 'b1c3', 'b8c6', 'e1g1'], // Advance
    ['e2e4', 'c7c6', 'd2d4', 'd7d5', 'e4xd5', 'c6xd5', 'c2c4', 'g8f6', 'b1c3', 'e7e6', 'g1f3', 'f8e7', 'c4d5', 'f6d5', 'f1d3'], // Panov
    ['e2e4', 'c7c6', 'b1c3', 'd7d5', 'g1f3', 'c8g4', 'h2h3', 'g4f3', 'd1f3', 'e7e6', 'd2d4', 'g8f6', 'c1d2', 'd5e4', 'c3e4', 'b8d7'], // Two Knights
    ['e2e4', 'c7c6', 'd2d4', 'd7d5', 'b1c3', 'd5e4', 'c3e4', 'g8f6', 'e4f6', 'e7f6', 'c2c3', 'f8d6', 'f1d3', 'e8g8', 'g1e2', 'f8e8'], // Tartakower

    // --- SCANDINAVIAN & ALEKHINE & PIRC & MODERN ---
    ['e2e4', 'd7d5', 'e4xd5', 'd8xd5', 'b1c3', 'd5a5', 'd2d4', 'g8f6', 'g1f3', 'c7c6', 'f1c4', 'c8f5', 'c1d2', 'e7e6', 'c3d5', 'a5d8'],
    ['e2e4', 'd7d5', 'e4xd5', 'g8f6', 'd2d4', 'f6d5', 'g1f3', 'g7g6', 'f1e2', 'f8g7', 'e1g1', 'e8g8', 'c2c4', 'd5b6', 'b1c3'],
    ['e2e4', 'g8f6', 'e4e5', 'f6d5', 'd2d4', 'd7d6', 'g1f3', 'c8g4', 'f1e2', 'e7e6', 'e1g1', 'f8e7', 'c2c4', 'd5b6', 'b1c3', 'e8g8'], // Alekhine
    ['e2e4', 'd7d6', 'd2d4', 'g8f6', 'b1c3', 'g7g6', 'g1f3', 'f8g7', 'f1e2', 'e8g8', 'e1g1', 'c7c6', 'a2a4', 'a7a5', 'h2h3', 'b8a6'], // Pirc
    ['e2e4', 'g7g6', 'd2d4', 'f8g7', 'b1c3', 'd7d6', 'g1f3', 'a7a6', 'c1e3', 'b7b5', 'f1d3', 'c8b7', 'e1g1', 'b8d7'], // Modern

    // --- QUEEN\'S GAMBIT DECLINED ---
    ['d2d4', 'd7d5', 'c2c4', 'e7e6', 'b1c3', 'g8f6', 'c1g5', 'f8e7', 'e2e3', 'e8g8', 'g1f3', 'b8d7', 'a1c1', 'c7c6', 'f1d3', 'd5c4', 'd3c4'],
    ['d2d4', 'd7d5', 'c2c4', 'e7e6', 'b1c3', 'g8f6', 'c1g5', 'f8e7', 'e2e3', 'h7h6', 'g5h4', 'e8g8', 'g1f3', 'b7b6', 'f1d3', 'c8b7', 'e1g1'], // Tartakower
    ['d2d4', 'd7d5', 'c2c4', 'e7e6', 'b1c3', 'g8f6', 'c4d5', 'e6d5', 'c1g5', 'c7c6', 'e2e3', 'f8e7', 'f1d3', 'b8d7', 'd1c2', 'e8g8', 'g1e2'], // Exchange

    // --- QUEEN\'S GAMBIT ACCEPTED ---
    ['d2d4', 'd7d5', 'c2c4', 'd5c4', 'g1f3', 'g8f6', 'e2e3', 'e7e6', 'f1c4', 'c7c5', 'e1g1', 'a7a6', 'd1e2', 'b7b5', 'c4b3', 'c8b7'],

    // --- SLAV & SEMI-SLAV DEFENSE ---
    ['d2d4', 'd7d5', 'c2c4', 'c7c6', 'g1f3', 'g8f6', 'b1c3', 'd5c4', 'a2a4', 'c8f5', 'e2e3', 'e7e6', 'f1c4', 'f8b4', 'e1g1', 'e8g8'],
    ['d2d4', 'd7d5', 'c2c4', 'c7c6', 'g1f3', 'g8f6', 'b1c3', 'a7a6', 'e2e3', 'b7b5', 'b2b3', 'c8g4', 'f1e2', 'e7e6', 'e1g1'], // Chebanenko
    ['d2d4', 'd7d5', 'c2c4', 'c7c6', 'g1f3', 'g8f6', 'b1c3', 'e7e6', 'e2e3', 'b8d7', 'f1d3', 'd5c4', 'd3c4', 'b7b5', 'c4d3', 'a7a6', 'e3e4', 'c6c5'], // Meran
    ['d2d4', 'd7d5', 'c2c4', 'c7c6', 'g1f3', 'g8f6', 'b1c3', 'e7e6', 'c1g5', 'h7h6', 'g5f6', 'd8f6', 'e2e3', 'b8d7', 'f1d3', 'g7g6'], // Moscow

    // --- KING\'S INDIAN DEFENSE ---
    ['d2d4', 'g8f6', 'c2c4', 'g7g6', 'b1c3', 'f8g7', 'e2e4', 'd7d6', 'g1f3', 'e8g8', 'f1e2', 'e7e5', 'e1g1', 'b8c6', 'd4d5', 'c6e7', 'b2b4', 'a7a5'],
    ['d2d4', 'g8f6', 'c2c4', 'g7g6', 'b1c3', 'f8g7', 'e2e4', 'd7d6', 'f2f3', 'e8g8', 'c1e3', 'e7e5', 'd4d5', 'c7c6', 'd1d2', 'c6d5', 'c4d5', 'a7a6'], // Samisch
    ['d2d4', 'g8f6', 'c2c4', 'g7g6', 'g2g3', 'f8g7', 'f1g2', 'e8g8', 'g1f3', 'd7d6', 'e1g1', 'b8d7', 'b1c3', 'e7e5', 'e2e4', 'c7c6', 'h2h3'], // Fianchetto

    // --- GRUNFELD DEFENSE ---
    ['d2d4', 'g8f6', 'c2c4', 'g7g6', 'b1c3', 'd7d5', 'c4d5', 'f6d5', 'e2e4', 'd5c3', 'b2xc3', 'f8g7', 'f1c4', 'c7c5', 'g1e2', 'b8c6', 'c1e3', 'e8g8', 'e1g1'],
    ['d2d4', 'g8f6', 'c2c4', 'g7g6', 'b1c3', 'd7d5', 'g1f3', 'f8g7', 'd1b3', 'd5c4', 'b3c4', 'e8g8', 'e2e4', 'a7a6', 'f1e2', 'b7b5', 'c4b3'], // Russian

    // --- NIMZO-INDIAN & QUEEN\'S INDIAN & BOGO-INDIAN ---
    ['d2d4', 'g8f6', 'c2c4', 'e7e6', 'b1c3', 'f8b4', 'e2e3', 'e8g8', 'f1d3', 'd7d5', 'g1f3', 'c7c5', 'e1g1', 'b8c6', 'a2a3', 'b4c3', 'b2c3'],
    ['d2d4', 'g8f6', 'c2c4', 'e7e6', 'b1c3', 'f8b4', 'd1c2', 'e8g8', 'a2a3', 'b4c3', 'c2c3', 'b7b6', 'c1g5', 'c8b7', 'f2f3', 'h7h6', 'g5h4', 'd7d5'],
    ['d2d4', 'g8f6', 'c2c4', 'e7e6', 'g1f3', 'b7b6', 'g2g3', 'c8a6', 'b2b3', 'f8b4', 'c1d2', 'b4e7', 'f1g2', 'c7c6', 'd2c3', 'd7d5', 'f3e5', 'f6d7'],
    ['d2d4', 'g8f6', 'c2c4', 'e7e6', 'g1f3', 'f8b4', 'c1d2', 'd8e7', 'g2g3', 'b8c6', 'b1c3', 'b4c3', 'd2c3', 'f6e4', 'a1c1', 'e8g8', 'f1g2'],

    // --- CATALAN OPENING ---
    ['d2d4', 'g8f6', 'c2c4', 'e7e6', 'g2g3', 'd7d5', 'f1g2', 'd5c4', 'g1f3', 'f8e7', 'e1g1', 'e8g8', 'd1c2', 'a7a6', 'c2c4', 'b7b5', 'c4c2', 'c8b7'],
    ['d2d4', 'g8f6', 'c2c4', 'e7e6', 'g2g3', 'd7d5', 'f1g2', 'f8e7', 'g1f3', 'e8g8', 'e1g1', 'b8d7', 'd1c2', 'c7c6', 'b1d2', 'b7b6'],

    // --- BENONI & BENKO GAMBIT ---
    ['d2d4', 'g8f6', 'c2c4', 'c7c5', 'd4d5', 'e7e6', 'b1c3', 'e6d5', 'c4d5', 'd7d6', 'e2e4', 'g7g6', 'f2f4', 'f8g7', 'f1b5', 'f6d7', 'a2a4', 'e8g8', 'g1f3'],
    ['d2d4', 'g8f6', 'c2c4', 'c7c5', 'd4d5', 'b7b5', 'c4b5', 'a7a6', 'b5a6', 'c8a6', 'b1c3', 'd7d6', 'e2e4', 'a6f1', 'e1f1', 'g7g6', 'g1f3', 'f8g7', 'g2g3', 'e8g8'],

    // --- LONDON SYSTEM & JOBAVA & TROMPOWSKY ---
    ['d2d4', 'd7d5', 'c1f4', 'g8f6', 'e2e3', 'c7c5', 'c2c3', 'b8c6', 'b1d2', 'e7e6', 'g1f3', 'f8d6', 'f4g3', 'e8g8', 'f1d3', 'd8e7'],
    ['d2d4', 'g8f6', 'c1f4', 'd7d5', 'e2e3', 'c7c5', 'c2c3', 'b8c6', 'b1d2', 'e7e6', 'g1f3', 'f8d6', 'f4g3', 'e8g8'],
    ['d2d4', 'd7d5', 'b1c3', 'g8f6', 'c1f4', 'c7c5', 'e2e3', 'c5d4', 'e3d4', 'a7a6', 'g1f3', 'c8g4', 'h2h3', 'g4f3', 'd1f3', 'e7e6'], // Jobava
    ['d2d4', 'g8f6', 'c1g5', 'd7d5', 'e2e3', 'c7c5', 'g5f6', 'g7f6', 'd4c5', 'e7e6', 'b1c3', 'f8c5', 'd1h5'], // Trompowsky

    // --- DUTCH DEFENSE ---
    ['d2d4', 'f7f5', 'g2g3', 'g8f6', 'f1g2', 'e7e6', 'g1f3', 'd7d5', 'e1g1', 'f8d6', 'c2c4', 'c7c6', 'b2b3', 'd8e7', 'c1b2', 'e8g8'], // Stonewall
    ['d2d4', 'f7f5', 'g2g3', 'g8f6', 'f1g2', 'g7g6', 'g1f3', 'f8g7', 'e1g1', 'e8g8', 'c2c4', 'd7d6', 'b1c3', 'd8e8', 'd4d5', 'a7a5'], // Leningrad

    // --- ENGLISH OPENING ---
    ['c2c4', 'e7e5', 'b1c3', 'g8f6', 'g1f3', 'b8c6', 'g2g3', 'f8b4', 'f1g2', 'e8g8', 'e1g1', 'e5e4', 'f3g5', 'b4c3', 'b2c3', 'f8e8'],
    ['c2c4', 'c7c5', 'b1c3', 'b8c6', 'g2g3', 'g7g6', 'f1g2', 'f8g7', 'g1f3', 'g8f6', 'e1g1', 'e8g8', 'd2d4', 'c5d4', 'f3d4', 'd7d6'],
    ['c2c4', 'e7e5', 'b1c3', 'g8f6', 'g1f3', 'b8c6', 'e2e3', 'f8b4', 'd1c2', 'b4c3', 'c2c3', 'd8e7', 'a2a3', 'a7a5', 'b2b3', 'd7d6'],

    // --- RETI OPENING & KING\'S INDIAN ATTACK ---
    ['g1f3', 'd7d5', 'c2c4', 'c7c6', 'b2b3', 'g8f6', 'g2g3', 'c8f5', 'f1g2', 'e7e6', 'c1b2', 'f8e7', 'e1g1', 'h7h6', 'd2d3', 'e8g8', 'b1d2', 'b8d7'],
    ['g1f3', 'd7d5', 'g2g3', 'g8f6', 'f1g2', 'c7c6', 'e1g1', 'c8g4', 'd2d3', 'b8d7', 'b1d2', 'e7e5', 'e2e4', 'd5e4', 'd3e4', 'f8c5']
];

const book = {};

function parseUci(uci) {
    const fC = uci.charCodeAt(0) - 97;
    const fR = 8 - parseInt(uci[1], 10);
    const tC = uci.charCodeAt(2) - 97;
    const tR = 8 - parseInt(uci[3], 10);
    return { fR, fC, tR, tC };
}

let validCount = 0;
let lineIndex = 0;
for (const line of rawLines) {
    lineIndex++;
    ChessLogic.initBoard();
    for (const rawUci of line) {
        const uci = rawUci.replace('x', '');
        const fen = ChessLogic.getFen();
        const parts = fen.split(' ');
        const key = parts.slice(0, 4).join(' ');
        if (!book[key]) book[key] = [];
        if (!book[key].includes(uci)) book[key].push(uci);
        
        const m = parseUci(uci);
        const ok = ChessLogic.movePiece(m.fR, m.fC, m.tR, m.tC);
        if (!ok) {
            console.error(`Line ${lineIndex} FAILED MOVE: ${uci} in FEN: ${fen}`);
            break;
        }
        validCount++;
    }
}

console.log(`Processed ${validCount} valid moves across ${rawLines.length} grandmaster opening lines.`);
console.log('Total unique opening positions generated:', Object.keys(book).length);
fs.writeFileSync('scripts/generated_book.json', JSON.stringify(book, null, 2));
