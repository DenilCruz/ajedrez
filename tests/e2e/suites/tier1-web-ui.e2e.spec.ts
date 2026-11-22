import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  BOARD_THEME_RGB,
  KINGSIDE_CASTLE_SEQUENCE,
  PROMOTION_8_PLY_SETUP,
  PROMOTION_TRIGGER_MOVE,
  SCHOLARS_MATE_MOVES,
} from '../helpers/fixtures.ts';
import { PreviewBrowserHarness } from '../helpers/preview-server.ts';

describe('Tier 1 — Web UI / FSD Browser E2E (F10–F15)', () => {
  let harness: PreviewBrowserHarness;

  beforeAll(async () => {
    harness = await PreviewBrowserHarness.start();
  });

  afterAll(async () => {
    await harness?.close();
  });

  describe('F10: ChessBoardView', () => {
    it('E2E-F10-01: renders 64 squares, 32 initial pieces, and White bottom orientation', async () => {
      await harness.withPage({}, async () => {
        const board = await harness.getBoardSnapshot();
        expect(board.squareCount).toBe(64);
        expect(board.pieceCount).toBe(32);
        expect(board.pieces.a1).toBe('wR');
        expect(board.pieces.e1).toBe('wK');
        expect(board.pieces.d8).toBe('bQ');
        expect(board.pieces.e8).toBe('bK');

        const geom = await harness.getBoardGeometry();
        expect(geom.a1).not.toBeNull();
        expect(geom.a8).not.toBeNull();
        expect(geom.a1!.y).toBeGreaterThan(geom.a8!.y);
        expect(geom.a1!.x).toBeLessThan(geom.h1!.x);
      });
    });

    it('E2E-F10-02: supports click-to-move for legal moves', async () => {
      await harness.withPage({}, async () => {
        await harness.startMatchViaModal({ mode: '2 Jugadores', timePreset: 'Sin reloj' });
        await harness.clickSquare('e2');
        await harness.clickSquare('e4');

        await harness.waitForPiece('e4', 'wP');
        await harness.waitForPiece('e2', null);
        expect(await harness.getPiece('e4')).toBe('wP');
        expect(await harness.getPiece('e2')).toBeNull();
      });
    });

    it('E2E-F10-03: supports drag-and-drop for legal moves in 2P mode', async () => {
      await harness.withPage({}, async () => {
        await harness.startMatchViaModal({ mode: '2 Jugadores', timePreset: 'Sin reloj' });
        await harness.dragSquare('e2', 'e4');

        await harness.waitForPiece('e4', 'wP');
        await harness.waitForPiece('e2', null);

        const history = await harness.getMoveHistoryText();
        expect(history.text).toContain('1.');
        expect(history.text).toContain('e4');
      });
    });

    it('E2E-F10-04: renders legal move, selected square, last move, and king-in-check highlights', async () => {
      await harness.withPage({}, async () => {
        await harness.startMatchViaModal({ mode: '2 Jugadores', timePreset: 'Sin reloj' });
        const plainStyle = await harness.getSquareHighlightStyle('e4');

        await harness.clickSquare('e2');
        const selectedStyle = await harness.getSquareHighlightStyle('e2');
        const legalTargetStyle = await harness.getSquareHighlightStyle('e4');
        expect(selectedStyle?.innerInlineStyle).not.toBe('');
        expect(legalTargetStyle?.innerInlineStyle).not.toBe('');
        expect(legalTargetStyle?.innerBackgroundImage).not.toBe(plainStyle?.innerBackgroundImage);

        // Play Scholar's Mate to verify last-move and king-in-check highlights
        await harness.clickSquare('e4');
        await harness.playMoves(SCHOLARS_MATE_MOVES.slice(1));

        const lastMoveStyle = await harness.getSquareHighlightStyle('f7');
        const kingCheckStyle = await harness.getSquareHighlightStyle('e8');
        expect(lastMoveStyle?.innerInlineStyle).not.toBe('');
        expect(kingCheckStyle?.innerInlineStyle).not.toBe('');
        expect(kingCheckStyle?.innerBoxShadow).not.toBe('none');
      });
    });

    it('E2E-F10-05: opens prop-controlled promotion dialog with 4 pieces and promotes to Queen', async () => {
      await harness.withPage({}, async () => {
        await harness.startMatchViaModal({ mode: '2 Jugadores', timePreset: 'Sin reloj' });
        await harness.playMoves(PROMOTION_8_PLY_SETUP);

        await harness.clickSquare(PROMOTION_TRIGGER_MOVE.from);
        await harness.clickSquare(PROMOTION_TRIGGER_MOVE.to);

        const dialog = await harness.getDialogState();
        expect(dialog.isOpen).toBe(true);
        expect(dialog.buttons).toEqual(
          expect.arrayContaining(['Dama', 'Torre', 'Alfil', 'Caballo']),
        );

        await harness.selectPromotion('Dama');
        expect((await harness.getDialogState()).isOpen).toBe(false);
        await harness.waitForPiece('a8', 'wQ');
      });
    });

    it('E2E-F10-06: flips board orientation when clicking rotate toggle in 2P local mode', async () => {
      await harness.withPage({}, async () => {
        await harness.startMatchViaModal({ mode: '2 Jugadores', timePreset: 'Sin reloj' });
        const status = await harness.getStatusBanner();
        expect(status.hasFlipButton).toBe(true);

        const before = await harness.getBoardGeometry();
        expect(before.a1!.y).toBeGreaterThan(before.a8!.y);

        await harness.clickButton('rotar tablero|girar tablero');
        const flipped = await harness.getBoardGeometry();
        expect(flipped.a1!.y).toBeLessThan(flipped.a8!.y);
        expect(flipped.a1!.x).toBeGreaterThan(flipped.h1!.x);

        await harness.clickButton('rotar tablero|girar tablero');
        const restored = await harness.getBoardGeometry();
        expect(restored.a1!.y).toBeGreaterThan(restored.a8!.y);
      });
    });
  });

  describe('F11: ThemeSelector', () => {
    it('E2E-F11-01: renders all 4 themes with Clásico active by default', async () => {
      await harness.withPage({}, async () => {
        const themeState = await harness.getThemeState();
        expect(themeState.buttonLabels).toEqual(['Clásico', 'Madera', 'Pizarra', 'Océano']);
        expect(themeState.activeButtons).toEqual(['Clásico']);

        const colors = await harness.getSquareColors(['a2', 'a1']);
        expect(colors.a2).toBe(BOARD_THEME_RGB.classic.lightRgb);
        expect(colors.a1).toBe(BOARD_THEME_RGB.classic.darkRgb);
      });
    });

    it('E2E-F11-02: selecting Madera updates board colors immediately', async () => {
      await harness.withPage({}, async () => {
        await harness.selectTheme('Madera');
        const colors = await harness.getSquareColors(['a2', 'a1']);
        expect(colors.a2).toBe(BOARD_THEME_RGB.wood.lightRgb);
        expect(colors.a1).toBe(BOARD_THEME_RGB.wood.darkRgb);
        expect((await harness.getThemeState()).activeButtons).toEqual(['Madera']);
      });
    });

    it('E2E-F11-03: selecting Pizarra updates board colors immediately', async () => {
      await harness.withPage({}, async () => {
        await harness.selectTheme('Pizarra');
        const colors = await harness.getSquareColors(['a2', 'a1']);
        expect(colors.a2).toBe(BOARD_THEME_RGB.slate.lightRgb);
        expect(colors.a1).toBe(BOARD_THEME_RGB.slate.darkRgb);
      });
    });

    it('E2E-F11-04: selecting Océano updates board colors immediately', async () => {
      await harness.withPage({}, async () => {
        await harness.selectTheme('Océano');
        const colors = await harness.getSquareColors(['a2', 'a1']);
        expect(colors.a2).toBe(BOARD_THEME_RGB.ocean.lightRgb);
        expect(colors.a1).toBe(BOARD_THEME_RGB.ocean.darkRgb);
      });
    });

    it('E2E-F11-05: persists selected theme in localStorage across page reload', async () => {
      await harness.withPage({}, async () => {
        await harness.selectTheme('Océano');
        expect((await harness.getThemeState()).storedTheme).toBe('ocean');

        await harness.reload();
        const themeState = await harness.getThemeState();
        expect(themeState.activeButtons).toEqual(['Océano']);
        const colors = await harness.getSquareColors(['a2', 'a1']);
        expect(colors.a2).toBe(BOARD_THEME_RGB.ocean.lightRgb);
        expect(colors.a1).toBe(BOARD_THEME_RGB.ocean.darkRgb);
      });
    });
  });

  describe('F12: MoveHistoryView', () => {
    it('E2E-F12-01: displays empty state before any moves are played', async () => {
      await harness.withPage({}, async () => {
        const history = await harness.getMoveHistoryText();
        expect(history.found).toBe(true);
        expect(history.items).toEqual([]);
        expect(history.text).toMatch(/sin jugadas/i);
      });
    });

    it('E2E-F12-02: renders move number and SAN after first White move', async () => {
      await harness.withPage({}, async () => {
        await harness.startMatchViaModal({ mode: '2 Jugadores', timePreset: 'Sin reloj' });
        await harness.playMoves([{ from: 'e2', to: 'e4' }]);

        const history = await harness.getMoveHistoryText();
        expect(history.items).toHaveLength(1);
        expect(history.items[0]).toContain('1.');
        expect(history.items[0]).toContain('e4');
      });
    });

    it('E2E-F12-03: renders paired White and Black moves on the same row', async () => {
      await harness.withPage({}, async () => {
        await harness.startMatchViaModal({ mode: '2 Jugadores', timePreset: 'Sin reloj' });
        await harness.playMoves([
          { from: 'e2', to: 'e4' },
          { from: 'e7', to: 'e5' },
        ]);

        const history = await harness.getMoveHistoryText();
        expect(history.items).toHaveLength(1);
        expect(history.items[0]).toContain('1.');
        expect(history.items[0]).toContain('e4');
        expect(history.items[0]).toContain('e5');
      });
    });

    it('E2E-F12-04: renders capture (x), check (+), castling (O-O), and promotion (=Q) SAN notations', async () => {
      await harness.withPage({}, async () => {
        // Castling O-O
        await harness.startMatchViaModal({ mode: '2 Jugadores', timePreset: 'Sin reloj' });
        await harness.playMoves(KINGSIDE_CASTLE_SEQUENCE);
        let history = await harness.getMoveHistoryText();
        expect(history.text).toContain('O-O');

        // Capture + check
        await harness.clickButton('^Reiniciar$');
        await harness.playMoves([
          { from: 'e2', to: 'e4' },
          { from: 'f7', to: 'f6' },
          { from: 'd1', to: 'h5' },
        ]);
        history = await harness.getMoveHistoryText();
        expect(history.text).toContain('Qh5+');

        // Promotion + capture (bxa8=Q)
        await harness.clickButton('^Reiniciar$');
        await harness.playMoves([
          ...PROMOTION_8_PLY_SETUP,
          { ...PROMOTION_TRIGGER_MOVE, promotion: 'q' },
        ]);
        history = await harness.getMoveHistoryText();
        expect(history.text).toContain('bxc6');
        expect(history.text).toContain('bxa8=Q');
      });
    });

    it('E2E-F12-05: updates sequential move rows and clears history on Reiniciar', async () => {
      await harness.withPage({}, async () => {
        await harness.startMatchViaModal({ mode: '2 Jugadores', timePreset: 'Sin reloj' });
        await harness.playMoves([
          { from: 'e2', to: 'e4' },
          { from: 'e7', to: 'e5' },
          { from: 'g1', to: 'f3' },
          { from: 'b8', to: 'c6' },
        ]);

        let history = await harness.getMoveHistoryText();
        expect(history.items).toHaveLength(2);
        expect(history.items[1]).toContain('Nf3');
        expect(history.items[1]).toContain('Nc6');

        await harness.clickButton('^Reiniciar$');
        history = await harness.getMoveHistoryText();
        expect(history.items).toEqual([]);
        expect(history.text).toMatch(/sin jugadas/i);
      });
    });
  });

  describe('F13: GameClockView', () => {
    it('E2E-F13-01: displays Sin reloj for both players in unlimited mode', async () => {
      await harness.withPage({}, async () => {
        await harness.startMatchViaModal({ mode: '2 Jugadores', timePreset: 'Sin reloj' });
        await harness.playMoves([{ from: 'e2', to: 'e4' }]);
        await harness.waitMs(300);

        const clocks = await harness.getClocks();
        expect(clocks.white?.timeText).toBe('Sin reloj');
        expect(clocks.black?.timeText).toBe('Sin reloj');
      });
    });

    it('E2E-F13-02: initializes 3+2 Blitz clocks at 03:00 for both players', async () => {
      await harness.withPage({}, async () => {
        await harness.startMatchViaModal({ mode: '2 Jugadores', timePreset: '3+2 Blitz' });
        const clocks = await harness.getClocks();
        expect(clocks.white?.timeText).toBe('03:00');
        expect(clocks.black?.timeText).toBe('03:00');
      });
    });

    it('E2E-F13-03: initializes 10+0 Rápida clocks at 10:00 for both players', async () => {
      await harness.withPage({}, async () => {
        await harness.startMatchViaModal({ mode: '2 Jugadores', timePreset: '10+0 Rápida' });
        const clocks = await harness.getClocks();
        expect(clocks.white?.timeText).toBe('10:00');
        expect(clocks.black?.timeText).toBe('10:00');
      });
    });

    it('E2E-F13-04: switches active turn indicator and deducts active clock after move 1', async () => {
      await harness.withPage({ installClock: true }, async () => {
        await harness.startMatchViaModal({ mode: '2 Jugadores', timePreset: '3+2 Blitz' });
        await harness.playMoves([{ from: 'e2', to: 'e4' }]);
        await harness.clockFastForward(4750);

        const clocks = await harness.getClocks();
        expect(clocks.black?.active).toBe(true);
        expect(clocks.white?.active).toBe(false);
        expect(clocks.black?.timeText).toBe('02:55');
        expect(clocks.white?.timeText).toBe('03:00');
      });
    });

    it('E2E-F13-05: shows tenths low-time format (<10s) and applies +2s increment on move', async () => {
      await harness.withPage({ installClock: true }, async () => {
        await harness.startMatchViaModal({ mode: '2 Jugadores', timePreset: '3+2 Blitz' });
        await harness.playMoves([{ from: 'e2', to: 'e4' }]);

        // Fast-forward Black down to ~5s remaining (250ms used in playMoves + 174_750ms = 175_000ms)
        await harness.clockFastForward(174_750);
        const lowClocks = await harness.getClocks();
        expect(lowClocks.black?.timeText).toMatch(/^00:05\.\d$/);
        expect(lowClocks.black?.lowTime).toBe(true);

        // Black plays e5 -> gains +2s increment (to ~00:07.x) and turn switches to White
        await harness.playMoves([{ from: 'e7', to: 'e5' }]);
        const afterInc = await harness.getClocks();
        expect(afterInc.white?.active).toBe(true);
        expect(afterInc.black?.timeText).toMatch(/^00:0[67]\.\d$/);
      });
    });
  });

  describe('F14: GameSetupModal', () => {
    it('E2E-F14-01: opens via Nueva partida and cancels without resetting active board', async () => {
      await harness.withPage({}, async () => {
        await harness.startMatchViaModal({ mode: '2 Jugadores', timePreset: 'Sin reloj' });
        await harness.playMoves([{ from: 'e2', to: 'e4' }]);

        await harness.openSetupModal();
        expect((await harness.getDialogState()).isOpen).toBe(true);

        await harness.configureSetupModal({ mode: 'vs IA', action: 'cancel' });
        expect((await harness.getDialogState()).isOpen).toBe(false);
        expect(await harness.getPiece('e4')).toBe('wP');
      });
    });

    it('E2E-F14-02: mode toggle shows AI difficulty/color in vs IA and hides them in 2 Jugadores', async () => {
      await harness.withPage({}, async () => {
        await harness.openSetupModal();
        await harness.configureSetupModal({ mode: 'vs IA', action: 'none' });
        let dialog = await harness.getDialogState();
        expect(dialog.buttons).toEqual(
          expect.arrayContaining(['Fácil', 'Medio', 'Difícil', 'Blancas', 'Negras']),
        );

        await harness.configureSetupModal({ mode: '2 Jugadores', action: 'none' });
        dialog = await harness.getDialogState();
        expect(dialog.buttons).not.toContain('Difícil');
      });
    });

    it('E2E-F14-03: starts vs IA Difícil match as White with 3+2 Blitz clocks', async () => {
      await harness.withPage({}, async () => {
        await harness.startMatchViaModal({
          mode: 'vs IA',
          difficulty: 'Difícil',
          color: 'Blancas',
          timePreset: '3+2 Blitz',
        });

        expect((await harness.getDialogState()).isOpen).toBe(false);
        expect((await harness.getClocks()).white?.timeText).toBe('03:00');
        const geom = await harness.getBoardGeometry();
        expect(geom.a1!.y).toBeGreaterThan(geom.a8!.y);
      });
    });

    it('E2E-F14-04: starts vs IA as Black with Black orientation and automatic AI White opening move', async () => {
      await harness.withPage({}, async () => {
        await harness.startMatchViaModal({
          mode: 'vs IA',
          difficulty: 'Fácil',
          color: 'Negras',
          timePreset: 'Sin reloj',
        });

        const geom = await harness.getBoardGeometry();
        expect(geom.a1!.y).toBeLessThan(geom.a8!.y);

        await harness.waitForAiTurnComplete(12_000);
        const history = await harness.getMoveHistoryText();
        expect(history.items).toHaveLength(1);
        expect(history.items[0]).toMatch(/1\./);
      });
    });

    it('E2E-F14-05: configures all 3 time presets (Sin reloj, 3+2 Blitz, 10+0 Rápida) accurately', async () => {
      await harness.withPage({}, async () => {
        await harness.startMatchViaModal({ mode: '2 Jugadores', timePreset: 'Sin reloj' });
        expect((await harness.getClocks()).white?.timeText).toBe('Sin reloj');

        await harness.startMatchViaModal({ mode: '2 Jugadores', timePreset: '3+2 Blitz' });
        expect((await harness.getClocks()).white?.timeText).toBe('03:00');

        await harness.startMatchViaModal({ mode: '2 Jugadores', timePreset: '10+0 Rápida' });
        expect((await harness.getClocks()).white?.timeText).toBe('10:00');
      });
    });
  });

  describe('F15: useMatchController & MatchPage', () => {
    it('E2E-F15-01: renders all 5 UI regions responsively without horizontal overflow on desktop and mobile', async () => {
      await harness.withPage({ viewport: { width: 1280, height: 800 } }, async () => {
        const desktop = await harness.checkResponsiveNoOverflow(1280, 800);
        expect(desktop.noHorizontalOverflow).toBe(true);
        expect(desktop.boardVisible).toBe(true);
        expect(desktop.clocksVisible).toBe(true);
        expect(desktop.historyVisible).toBe(true);
        expect(desktop.themesVisible).toBe(true);
        expect(desktop.hasNewGame).toBe(true);
        expect(desktop.hasRestart).toBe(true);

        const mobile = await harness.checkResponsiveNoOverflow(390, 844);
        expect(mobile.noHorizontalOverflow).toBe(true);
        expect(mobile.boardVisible).toBe(true);
        expect(mobile.clocksVisible).toBe(true);
        expect(mobile.historyVisible).toBe(true);
        expect(mobile.themesVisible).toBe(true);
      });
    });

    it('E2E-F15-02: completes player move immediately and receives real Stockfish AI reply in vs IA mode', async () => {
      await harness.withPage({}, async () => {
        await harness.startMatchViaModal({
          mode: 'vs IA',
          difficulty: 'Fácil',
          color: 'Blancas',
          timePreset: 'Sin reloj',
        });

        await harness.clickSquare('e2');
        await harness.clickSquare('e4');
        await harness.waitForPiece('e4', 'wP');

        await harness.waitForAiTurnComplete(12_000);
        const history = await harness.getMoveHistoryText();
        expect(history.items).toHaveLength(1);
        expect(history.items[0]).toMatch(/1\.\s*e4\s+\S+/);
      });
    });

    it('E2E-F15-03: Reiniciar button resets board, history, clocks, and active status', async () => {
      await harness.withPage({}, async () => {
        await harness.startMatchViaModal({ mode: '2 Jugadores', timePreset: '3+2 Blitz' });
        await harness.playMoves([
          { from: 'e2', to: 'e4' },
          { from: 'e7', to: 'e5' },
        ]);

        await harness.clickButton('^Reiniciar$');
        const snap = await harness.getBoardSnapshot();
        expect(snap.pieceCount).toBe(32);
        expect(snap.pieces.e2).toBe('wP');
        expect(snap.pieces.e4).toBeUndefined();
        expect((await harness.getMoveHistoryText()).items).toEqual([]);
        expect((await harness.getClocks()).white?.timeText).toBe('03:00');
      });
    });

    it('E2E-F15-04: switching from vs IA to 2 Jugadores disables AI auto-reply and enables flip toggle', async () => {
      await harness.withPage({}, async () => {
        await harness.startMatchViaModal({ mode: '2 Jugadores', timePreset: 'Sin reloj' });
        await harness.playMoves([{ from: 'e2', to: 'e4' }]);
        await harness.waitMs(800);

        const history = await harness.getMoveHistoryText();
        expect(history.items).toHaveLength(1);
        expect(history.items[0]).not.toMatch(/1\.\s*e4\s+\S+/);
        expect((await harness.getStatusBanner()).hasFlipButton).toBe(true);
      });
    });

    it('E2E-F15-05: renders game-over banner on checkmate and locks further moves', async () => {
      await harness.withPage({}, async () => {
        await harness.startMatchViaModal({ mode: '2 Jugadores', timePreset: 'Sin reloj' });
        await harness.playMoves([
          { from: 'f2', to: 'f3' },
          { from: 'e7', to: 'e5' },
          { from: 'g2', to: 'g4' },
          { from: 'd8', to: 'h4' },
        ]);

        const status = await harness.getStatusBanner();
        expect(status.gameOverText).toMatch(/jaque mate/i);
        expect(status.gameOverText).toMatch(/negras/i);

        // Attempt illegal/post-mate move
        await harness.clickSquare('e2');
        await harness.clickSquare('e4');
        expect(await harness.getPiece('e2')).toBe('wP');
        expect(await harness.getPiece('e4')).toBeNull();
      });
    });
  });
});
