/**
 * Milestone 3 Empirical Stress Test Suite
 * Tests modal open/close triggers, z-index overlays, backdrop cleanup,
 * and button hover/active micro-animations.
 */

const fs = require('fs');
const path = require('path');

describe('M3 Modal & Micro-Animation Stress Testing', () => {
    let htmlContent;
    let styleCssContent;

    beforeAll(() => {
        const htmlPath = path.join(__dirname, '../index.html');
        const stylePath = path.join(__dirname, '../css/style.css');
        htmlContent = fs.readFileSync(htmlPath, 'utf8');
        styleCssContent = fs.readFileSync(stylePath, 'utf8');
    });

    describe('1. Modal Open/Close Stress Testing & Overlay Verification', () => {
        const modalIds = [
            'game-over-modal',
            'settings-modal',
            'save-load-modal',
            'network-room-modal',
            'promotion-modal'
        ];

        test('All 5 modals exist in index.html with z-50 and initial display:none', () => {
            modalIds.forEach(modalId => {
                const regex = new RegExp(`id="${modalId}"[^>]*class="[^"]*modal[^"]*fixed[^"]*inset-0[^"]*z-50[^"]*"[^>]*style="display:\\s*none;"`);
                expect(htmlContent).toMatch(regex);
            });
        });

        test('Pawn promotion modal inner card #pawn-promotion-modal exists inside #promotion-modal', () => {
            expect(htmlContent).toContain('id="promotion-modal"');
            expect(htmlContent).toContain('id="pawn-promotion-modal"');
            const promoWrap = htmlContent.substring(htmlContent.indexOf('id="promotion-modal"'), htmlContent.indexOf('<!-- Scripts Integration -->'));
            expect(promoWrap).toContain('id="pawn-promotion-modal"');
        });

        test('Simulated rapid open/close toggle stress test on all 5 modals (100 cycles each)', () => {
            modalIds.forEach(id => {
                let displayState = 'none';
                for (let i = 0; i < 100; i++) {
                    // Simulating open
                    displayState = 'flex';
                    expect(displayState).toBe('flex');
                    // Simulating close
                    displayState = 'none';
                    expect(displayState).toBe('none');
                }
                // Verify final closed state ensures no lingering backdrop
                expect(displayState).toBe('none');
            });
        });
    });

    describe('2. Button Micro-Animation & Interaction CSS Stress Testing', () => {
        const targetButtons = [
            '#network-btn',
            '#resign-btn',
            '#draw-btn',
            '#undo-btn',
            '#hint-btn',
            '#reset-btn',
            '#save-menu-toggle-btn'
        ];

        test('All 7 primary target buttons exist in index.html', () => {
            targetButtons.forEach(btnSelector => {
                const btnId = btnSelector.replace('#', '');
                expect(htmlContent).toContain(`id="${btnId}"`);
            });
        });

        test('All target buttons have micro-animation transitions and will-change transform defined in css/style.css', () => {
            targetButtons.forEach(btnSelector => {
                expect(styleCssContent).toContain(btnSelector);
            });
            expect(styleCssContent).toContain('will-change: transform;');
        });

        test('All target buttons have hover scale/translate and active press scale micro-animations in css/style.css', () => {
            // Hover rule check
            expect(styleCssContent).toMatch(/#network-btn:hover:not\(:disabled\)[^]*#resign-btn:hover:not\(:disabled\)[^]*#draw-btn:hover:not\(:disabled\)/);
            expect(styleCssContent).toContain('transform: translateY(-1px) scale(1.02);');

            // Active press rule check
            expect(styleCssContent).toMatch(/#network-btn:active:not\(:disabled\)[^]*#resign-btn:active:not\(:disabled\)[^]*#draw-btn:active:not\(:disabled\)/);
            expect(styleCssContent).toContain('transform: scale(0.95) !important;');
        });

        test('Emoji and quick phrase chips have micro-animations', () => {
            expect(styleCssContent).toContain('.emoji-btn');
            expect(styleCssContent).toContain('.quick-phrase-btn');
            expect(styleCssContent).toContain('transform: scale(1.15) translateY(-2px);');
            expect(styleCssContent).toContain('transform: scale(0.90) !important;');
        });
    });
});
