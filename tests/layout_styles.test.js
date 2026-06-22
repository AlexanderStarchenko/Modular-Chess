const fs = require('fs');
const path = require('path');

describe('Layout and Style Integrity Tests', () => {
    test('index.html should have md:h-screen on body tag', () => {
        const htmlPath = path.join(__dirname, '../index.html');
        const content = fs.readFileSync(htmlPath, 'utf8');
        // Match <body ... class="... md:h-screen ...">
        const bodyMatch = content.match(/<body[^>]*class="([^"]*)"/);
        expect(bodyMatch).not.toBeNull();
        const classes = bodyMatch[1].split(/\s+/);
        expect(classes).toContain('md:h-screen');
    });

    test('index.html should have min-h-0 on right panel glass-panel and Tab Content Area', () => {
        const htmlPath = path.join(__dirname, '../index.html');
        const content = fs.readFileSync(htmlPath, 'utf8');
        
        // Find Right: Control Panel section
        const rightPanelIndex = content.indexOf('Right: Control Panel (Analysis & History)');
        expect(rightPanelIndex).not.toBe(-1);
        
        const rightPanelContent = content.substring(rightPanelIndex);
        
        // Check glass-panel has min-h-0
        const glassPanelMatch = rightPanelContent.match(/class="[^"]*glass-panel[^"]*min-h-0[^"]*"/);
        expect(glassPanelMatch).not.toBeNull();
        
        // Check Tab Content Area has min-h-0
        const tabContentAreaMatch = rightPanelContent.match(/class="[^"]*flex-1\s+overflow-y-auto\s+p-4\s+flex\s+flex-col\s+min-h-0[^"]*"/);
        expect(tabContentAreaMatch).not.toBeNull();
    });

    test('index.html should have min-h-0 on all four tab content containers', () => {
        const htmlPath = path.join(__dirname, '../index.html');
        const content = fs.readFileSync(htmlPath, 'utf8');
        
        const tabs = [
            'tab-content-notation',
            'tab-content-stats',
            'tab-content-analysis',
            'tab-content-chat'
        ];
        
        tabs.forEach(tabId => {
            const regex = new RegExp(`id="${tabId}"[^>]*class="[^"]*min-h-0[^"]*"`);
            expect(content).toMatch(regex);
        });
    });

    test('css/style.css should have media query for body height 100vh', () => {
        const stylePath = path.join(__dirname, '../css/style.css');
        const content = fs.readFileSync(stylePath, 'utf8');
        
        // Match @media (min-width: 768px) { body { height: 100vh; } } or similar
        // Normalize spaces and match
        const normalized = content.replace(/\s+/g, ' ');
        expect(normalized).toContain('@media (min-width: 768px) { body { height: 100vh; } }');
    });

    test('css/input.css should have font @import, but css/style.css should not', () => {
        const inputPath = path.join(__dirname, '../css/input.css');
        const stylePath = path.join(__dirname, '../css/style.css');
        
        const inputContent = fs.readFileSync(inputPath, 'utf8');
        const styleContent = fs.readFileSync(stylePath, 'utf8');
        
        expect(inputContent).toContain('fonts.googleapis.com');
        expect(styleContent).not.toContain('fonts.googleapis.com');
    });
});
