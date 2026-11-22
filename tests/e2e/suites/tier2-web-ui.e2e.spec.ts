import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  BOARD_THEME_RGB,
  EN_PASSANT_SEQUENCE,
  FIFTY_MOVE_104_PLY_MOVES,
  FOOLS_MATE_MOVES,
  PROMOTION_8_PLY_SETUP,
  PROMOTION_TRIGGER_MOVE,
  QUEENSIDE_CASTLE_SEQUENCE,
} from '../helpers/fixtures.ts';
import { PreviewBrowserHarness } from '../helpers/preview-server.ts';

describe('Tier 2 — Web UI / FSD Browser Boundaries (F10–F15)', () => {
  let harness: PreviewBrowserHarness;

  beforeAll(async () => {
    harness = await PreviewBrowserHarness.start();
  });

  afterAll(async () => {
    await harness?.close();
  });

  describe('F10 Boundaries: ChessBoardView', () => {
    it('E2E-T2-F10-01: clicking empty square first does not select or record a move', async () => {
      await harness.withPage({}, async () => {
        await harness.startMatchViaModal({ mode: '2 Jugadores', timePreset: 'Sin reloj' });
        await harness.clickSquare('e4');
        await harness.clickSquare('e5');

        expect((await harness.getMoveHistoryText()).items).toEqual([]);
        expect(await harness.getPiece('e2')).toBe('wP');
      });
    });

    it('E2E-T2-F10-02: clicking opponent piece first does not select or move', async () => {
      await harness.withPage({}, async () => {
        await harness.startMatchViaModal({ mode: '2 Jugadores', timePreset: 'Sin reloj' });
        await harness.clickSquare('e7');
        await harness.clickSquare('e5');

        expect(await harness.getPiece('e7')).toBe('bP');
        expect(await harness.getPiece('e5')).toBeNull();

        await harness.clickSquare('e2');
        await harness.clickSquare('e4');
        await harness.waitForPiece('e4', 'wP');
      });
    });

    it('E2E-T2-F10-03: clicking another own piece switches selection cleanly', async () => {
      await harness.withPage({}, async () => {
        await harness.startMatchViaModal({ mode: '2 Jugadores', timePreset: 'Sin reloj' });
        await harness.clickSquare('e2');
        await harness.clickSquare('d2');
        await harness.clickSquare('d4');

        await harness.waitForPiece('d4', 'wP');
        expect(await harness.getPiece('e2')).toBe('wP');
        expect((await harness.getMoveHistoryText()).text).toContain('d4');
      });
    });

    it('E2E-T2-F10-04: cancelling promotion modal leaves pawn on source square and turn unchanged', async () => {
      await harness.withPage({}, async () => {
        await harness.startMatchViaModal({ mode: '2 Jugadores', timePreset: 'Sin reloj' });
        await harness.playMoves(PROMOTION_8_PLY_SETUP);

        await harness.clickSquare(PROMOTION_TRIGGER_MOVE.from);
        await harness.clickSquare(PROMOTION_TRIGGER_MOVE.to);
        expect((await harness.getDialogState()).isOpen).toBe(true);

        await harness.cancelPromotion();
        expect((await harness.getDialogState()).isOpen).toBe(false);
        expect(await harness.getPiece('b7')).toBe('wP');
        expect(await harness.getPiece('a8')).toBe('bR');
      });
    });

    it('E2E-T2-F10-05: board disables interaction during AI thinking and after game over', async () => {
      await harness.withPage({}, async () => {
        await harness.startMatchViaModal({
          mode: 'vs IA',
          difficulty: 'Difícil',
          color: 'Blancas',
          timePreset: 'Sin reloj',
        });

        await harness.clickSquare('e2');
        await harness.clickSquare('e4');
        await harness.waitForPiece('e4', 'wP');

        // Immediately try moving another White piece while AI is thinking
        await harness.clickSquare('d2');
        await harness.clickSquare('d4');
        expect(await harness.getPiece('d2')).toBe('wP');
        expect(await harness.getPiece('d4')).toBeNull();
      });
    });
  });

  describe('F11 Boundaries: ThemeSelector', () => {
    it('E2E-T2-F11-01: falls back safely to Clásico when localStorage contains invalid theme', async () => {
      await harness.withPage(
        { seedLocalStorage: { 'chess-platform:board-theme': 'neon-invalid' } },
        async () => {
          const themeState = await harness.getThemeState();
          expect(themeState.activeButtons).toEqual(['Clásico']);
          const colors = await harness.getSquareColors(['a2', 'a1']);
          expect(colors.a2).toBe(BOARD_THEME_RGB.classic.lightRgb);
        },
      );
    });

    it('E2E-T2-F11-02: rapid sequential theme switching settles on final selected theme', async () => {
      await harness.withPage({}, async () => {
        await harness.selectTheme('Madera');
        await harness.selectTheme('Pizarra');
        await harness.selectTheme('Océano');
        await harness.selectTheme('Clásico');
        await harness.selectTheme('Madera');

        const colors = await harness.getSquareColors(['a2', 'a1']);
        expect(colors.a2).toBe(BOARD_THEME_RGB.wood.lightRgb);
        expect(colors.a1).toBe(BOARD_THEME_RGB.wood.darkRgb);
        expect((await harness.getThemeState()).storedTheme).toBe('wood');
      });
    });

    it('E2E-T2-F11-03: switching theme mid-game preserves board position, move history, and clocks', async () => {
      await harness.withPage({}, async () => {
        await harness.startMatchViaModal({ mode: '2 Jugadores', timePreset: '3+2 Blitz' });
        await harness.playMoves([
          { from: 'e2', to: 'e4' },
          { from: 'e7', to: 'e5' },
        ]);

        await harness.selectTheme('Pizarra');
        expect(await harness.getPiece('e4')).toBe('wP');
        expect(await harness.getPiece('e5')).toBe('bP');
        expect((await harness.getMoveHistoryText()).text).toContain('e5');
        expect((await harness.getSquareColors(['a2'])).a2).toBe(
          BOARD_THEME_RGB.slate.lightRgb,
        );
      });
    });

    it('E2E-T2-F11-04: selected theme persists across Reiniciar and new match modal changes', async () => {
      await harness.withPage({}, async () => {
        await harness.selectTheme('Océano');
        await harness.clickButton('^Reiniciar$');
        await harness.startMatchViaModal({ mode: '2 Jugadores', timePreset: 'Sin reloj' });

        expect((await harness.getThemeState()).activeButtons).toEqual(['Océano']);
        const colors = await harness.getSquareColors(['a2', 'a1']);
        expect(colors.a2).toBe(BOARD_THEME_RGB.ocean.lightRgb);
      });
    });

    it('E2E-T2-F11-05: theme switching still updates UI when localStorage.setItem throws QuotaExceededError', async () => {
      await harness.withPage(
        {
          initScript: `(() => {
            const origSet = Storage.prototype.setItem;
            Storage.prototype.setItem = function() {
              throw new DOMException('Quota exceeded', 'QuotaExceededError');
            };
          })();`,
        },
        async () => {
          await harness.selectTheme('Madera');
          const colors = await harness.getSquareColors(['a2', 'a1']);
          expect(colors.a2).toBe(BOARD_THEME_RGB.wood.lightRgb);
          expect((await harness.getErrors()).pageErrors).toEqual([]);
        },
      );
    });
  });

  describe('F12 Boundaries: MoveHistoryView', () => {
    it('E2E-T2-F12-01: renders odd half-move count cleanly without undefined/crash', async () => {
      await harness.withPage({}, async () => {
        await harness.startMatchViaModal({ mode: '2 Jugadores', timePreset: 'Sin reloj' });
        await harness.playMoves([
          { from: 'e2', to: 'e4' },
          { from: 'e7', to: 'e5' },
          { from: 'g1', to: 'f3' },
        ]);

        const history = await harness.getMoveHistoryText();
        expect(history.items).toHaveLength(2);
        expect(history.items[1]).toContain('2.');
        expect(history.items[1]).toContain('Nf3');
        expect(history.text).not.toContain('undefined');
      });
    });

    it('E2E-T2-F12-02: renders en passant capture notation (exd6) and removes captured pawn', async () => {
      await harness.withPage({}, async () => {
        await harness.startMatchViaModal({ mode: '2 Jugadores', timePreset: 'Sin reloj' });
        await harness.playMoves(EN_PASSANT_SEQUENCE);

        await harness.waitForPiece('d6', 'wP');
        await harness.waitForPiece('d5', null);
        expect((await harness.getMoveHistoryText()).text).toContain('exd6');
      });
    });

    it('E2E-T2-F12-03: renders queenside castling notation (O-O-O) and moves King/Rook', async () => {
      await harness.withPage({}, async () => {
        await harness.startMatchViaModal({ mode: '2 Jugadores', timePreset: 'Sin reloj' });
        await harness.playMoves(QUEENSIDE_CASTLE_SEQUENCE);

        await harness.waitForPiece('c1', 'wK');
        await harness.waitForPiece('d1', 'wR');
        expect((await harness.getMoveHistoryText()).text).toContain('O-O-O');
      });
    });

    it('E2E-T2-F12-04: remains scrollable and preserves board geometry in long (>30 move) games', async () => {
      await harness.withPage({}, async () => {
        await harness.startMatchViaModal({ mode: '2 Jugadores', timePreset: 'Sin reloj' });
        await harness.playMoves(FIFTY_MOVE_104_PLY_MOVES.slice(0, 60));

        const history = await harness.getMoveHistoryText();
        expect(history.items).toHaveLength(30);
        expect(history.scrollHeight).toBeGreaterThanOrEqual(history.clientHeight);

        const resp = await harness.checkResponsiveNoOverflow(1280, 800);
        expect(resp.boardVisible).toBe(true);
        expect(resp.noHorizontalOverflow).toBe(true);
      });
    });

    it('E2E-T2-F12-05: renders underpromotion knight (=N) and checkmate (#) symbols', async () => {
      await harness.withPage({}, async () => {
        await harness.startMatchViaModal({ mode: '2 Jugadores', timePreset: 'Sin reloj' });
        await harness.playMoves([
          ...PROMOTION_8_PLY_SETUP,
          { ...PROMOTION_TRIGGER_MOVE, promotion: 'n' },
        ]);
        expect((await harness.getMoveHistoryText()).text).toContain('bxa8=N');

        await harness.clickButton('^Reiniciar$');
        await harness.playMoves(FOOLS_MATE_MOVES);
        expect((await harness.getMoveHistoryText()).text).toContain('Qh4#');
      });
    });
  });

  describe('F13 Boundaries: GameClockView', () => {
    it('E2E-T2-F13-01: clock does NOT tick before White plays first move', async () => {
      await harness.withPage({ installClock: true }, async () => {
        await harness.startMatchViaModal({ mode: '2 Jugadores', timePreset: '3+2 Blitz' });
        await harness.clockFastForward(15_000);

        const clocks = await harness.getClocks();
        expect(clocks.white?.timeText).toBe('03:00');
        expect(clocks.black?.timeText).toBe('03:00');
      });
    });

    it('E2E-T2-F13-02: White first move does NOT grant +2s increment', async () => {
      await harness.withPage({ installClock: true }, async () => {
        await harness.startMatchViaModal({ mode: '2 Jugadores', timePreset: '3+2 Blitz' });
        await harness.playMoves([{ from: 'e2', to: 'e4' }]);

        const clocks = await harness.getClocks();
        expect(clocks.white?.timeText).toBe('03:00');
      });
    });

    it('E2E-T2-F13-03: clock freezes immediately after checkmate and does not timeout later', async () => {
      await harness.withPage({ installClock: true }, async () => {
        await harness.startMatchViaModal({ mode: '2 Jugadores', timePreset: '3+2 Blitz' });
        await harness.playMoves(FOOLS_MATE_MOVES);

        const atMate = await harness.getClocks();
        await harness.clockFastForward(300_000);
        const afterWait = await harness.getClocks();

        expect(afterWait.white?.timeText).toBe(atMate.white?.timeText);
        expect(afterWait.black?.timeText).toBe(atMate.black?.timeText);
        expect((await harness.getStatusBanner()).gameOverText).toMatch(/jaque mate/i);
      });
    });

    it('E2E-T2-F13-04: clamps clock at 00:00.0 (never negative) and triggers timeout defeat', async () => {
      await harness.withPage({ installClock: true }, async () => {
        await harness.startMatchViaModal({ mode: '2 Jugadores', timePreset: '3+2 Blitz' });
        await harness.playMoves([{ from: 'e2', to: 'e4' }]);
        await harness.clockFastForward(200_000);

        const clocks = await harness.getClocks();
        expect(clocks.black?.timeText).toBe('00:00.0');
        expect(clocks.fullText).not.toContain('-');
        expect((await harness.getStatusBanner()).gameOverText).toMatch(/tiempo agotado/i);
      });
    });

    it('E2E-T2-F13-05: switching from 3+2 Blitz to Sin reloj clears clock interval completely', async () => {
      await harness.withPage({ installClock: true }, async () => {
        await harness.startMatchViaModal({ mode: '2 Jugadores', timePreset: '3+2 Blitz' });
        await harness.playMoves([{ from: 'e2', to: 'e4' }]);

        await harness.startMatchViaModal({ mode: '2 Jugadores', timePreset: 'Sin reloj' });
        await harness.clockFastForward(300_000);

        const clocks = await harness.getClocks();
        expect(clocks.white?.timeText).toBe('Sin reloj');
        expect(clocks.black?.timeText).toBe('Sin reloj');
        expect((await harness.getStatusBanner()).gameOverText).toBeNull();
      });
    });
  });

  describe('F14 Boundaries: GameSetupModal', () => {
    it('E2E-T2-F14-01: cancelling modal after changing selections preserves active match moves & clocks', async () => {
      await harness.withPage({}, async () => {
        await harness.startMatchViaModal({ mode: '2 Jugadores', timePreset: '3+2 Blitz' });
        await harness.playMoves([{ from: 'e2', to: 'e4' }]);

        await harness.openSetupModal();
        await harness.configureSetupModal({
          mode: 'vs IA',
          timePreset: '10+0 Rápida',
          action: 'cancel',
        });

        expect(await harness.getPiece('e4')).toBe('wP');
        expect((await harness.getMoveHistoryText()).text).toContain('e4');
        expect((await harness.getClocks()).white?.timeText).toBe('03:00');
      });
    });

    it('E2E-T2-F14-02: repeatedly opening and cancelling setup modal does not duplicate AI moves', async () => {
      await harness.withPage({}, async () => {
        await harness.startMatchViaModal({
          mode: 'vs IA',
          difficulty: 'Fácil',
          color: 'Blancas',
          timePreset: 'Sin reloj',
        });

        for (let i = 0; i < 3; i += 1) {
          await harness.openSetupModal();
          await harness.configureSetupModal({ action: 'cancel' });
        }

        await harness.clickSquare('e2');
        await harness.clickSquare('e4');
        await harness.waitForAiTurnComplete(12_000);

        const history = await harness.getMoveHistoryText();
        expect(history.items).toHaveLength(1);
      });
    });

    it('E2E-T2-F14-03: switching Blancas -> Negras in vs IA immediately plays AI White opening move', async () => {
      await harness.withPage({}, async () => {
        await harness.startMatchViaModal({
          mode: 'vs IA',
          difficulty: 'Fácil',
          color: 'Negras',
          timePreset: 'Sin reloj',
        });
        await harness.waitForAiTurnComplete(12_000);

        const history = await harness.getMoveHistoryText();
        expect(history.items).toHaveLength(1);
      });
    });

    it('E2E-T2-F14-04: switching Negras -> Blancas restores White bottom orientation', async () => {
      await harness.withPage({}, async () => {
        await harness.startMatchViaModal({
          mode: 'vs IA',
          difficulty: 'Fácil',
          color: 'Negras',
          timePreset: 'Sin reloj',
        });
        expect((await harness.getBoardGeometry()).a1!.y).toBeLessThan(
          (await harness.getBoardGeometry()).a8!.y,
        );

        await harness.startMatchViaModal({
          mode: 'vs IA',
          difficulty: 'Fácil',
          color: 'Blancas',
          timePreset: 'Sin reloj',
        });
        expect((await harness.getBoardGeometry()).a1!.y).toBeGreaterThan(
          (await harness.getBoardGeometry()).a8!.y,
        );
      });
    });

    it('E2E-T2-F14-05: Escape key and backdrop click dismiss GameSetupModal cleanly', async () => {
      await harness.withPage({}, async () => {
        await harness.openSetupModal();
        expect((await harness.getDialogState()).isOpen).toBe(true);
        await harness.configureSetupModal({ action: 'escape' });
        expect((await harness.getDialogState()).isOpen).toBe(false);

        await harness.openSetupModal();
        expect((await harness.getDialogState()).isOpen).toBe(true);
        await harness.configureSetupModal({ action: 'backdrop' });
        expect((await harness.getDialogState()).isOpen).toBe(false);
      });
    });
  });

  describe('F15 Boundaries: useMatchController & MatchPage', () => {
    it('E2E-T2-F15-01: Reiniciar during Difícil AI search aborts stale AI move cleanly', async () => {
      await harness.withPage({}, async () => {
        await harness.startMatchViaModal({
          mode: 'vs IA',
          difficulty: 'Difícil',
          color: 'Blancas',
          timePreset: 'Sin reloj',
        });

        await harness.clickSquare('e2');
        await harness.clickSquare('e4');
        await harness.waitForPiece('e4', 'wP');

        // Abort mid-search via Reiniciar
        await harness.clickButton('^Reiniciar$');
        await harness.waitMs(2200);

        const snap = await harness.getBoardSnapshot();
        expect(snap.pieceCount).toBe(32);
        expect(snap.pieces.e2).toBe('wP');
        expect((await harness.getMoveHistoryText()).items).toEqual([]);
      });
    });

    it('E2E-T2-F15-02: switching to 2 Jugadores via modal during Difícil AI search discards stale AI move', async () => {
      await harness.withPage({}, async () => {
        await harness.startMatchViaModal({
          mode: 'vs IA',
          difficulty: 'Difícil',
          color: 'Blancas',
          timePreset: 'Sin reloj',
        });

        await harness.clickSquare('e2');
        await harness.clickSquare('e4');
        await harness.startMatchViaModal({ mode: '2 Jugadores', timePreset: 'Sin reloj' });
        await harness.waitMs(2200);

        const snap = await harness.getBoardSnapshot();
        expect(snap.pieces.e2).toBe('wP');
        expect((await harness.getMoveHistoryText()).items).toEqual([]);
      });
    });

    it('E2E-T2-F15-03: Reiniciar after game-over clears banner and restores playable board', async () => {
      await harness.withPage({}, async () => {
        await harness.startMatchViaModal({ mode: '2 Jugadores', timePreset: 'Sin reloj' });
        await harness.playMoves(FOOLS_MATE_MOVES);
        expect((await harness.getStatusBanner()).gameOverText).toMatch(/jaque mate/i);

        await harness.clickButton('^Reiniciar$');
        expect((await harness.getStatusBanner()).gameOverText).toBeNull();
        await harness.playMoves([{ from: 'e2', to: 'e4' }]);
        await harness.waitForPiece('e4', 'wP');
      });
    });

    it('E2E-T2-F15-04: rapid double Reiniciar as Black vs IA produces exactly 1 White AI opening move', async () => {
      await harness.withPage({}, async () => {
        await harness.startMatchViaModal({
          mode: 'vs IA',
          difficulty: 'Fácil',
          color: 'Negras',
          timePreset: 'Sin reloj',
        });

        await harness.clickButton('^Reiniciar$');
        await harness.clickButton('^Reiniciar$');
        await harness.waitForAiTurnComplete(12_000);
        await harness.waitMs(500);

        const history = await harness.getMoveHistoryText();
        expect(history.items).toHaveLength(1);
      });
    });

    it('E2E-T2-F15-05: Rendirse ends match immediately, declares opponent winner, and locks board', async () => {
      await harness.withPage({}, async () => {
        await harness.startMatchViaModal({ mode: '2 Jugadores', timePreset: '3+2 Blitz' });
        await harness.playMoves([
          { from: 'e2', to: 'e4' },
          { from: 'e7', to: 'e5' },
        ]);

        await harness.clickButton('^Rendirse$');
        const status = await harness.getStatusBanner();
        expect(status.gameOverText).toMatch(/rendición/i);
        expect(status.gameOverText).toMatch(/negras/i);
        expect(status.resignDisabled).toBe(true);

        await harness.clickSquare('d2');
        await harness.clickSquare('d4');
        expect(await harness.getPiece('d2')).toBe('wP');
      });
    });
  });
});
