import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  BOARD_THEME_RGB,
  FIFTY_MOVE_104_PLY_MOVES,
  FOOLS_MATE_MOVES,
  PROMOTION_8_PLY_SETUP,
  PROMOTION_TRIGGER_MOVE,
  SAM_LOYD_STALEMATE_MOVES,
  SCHOLARS_MATE_MOVES,
  THREEFOLD_REPETITION_MOVES,
} from '../helpers/fixtures.ts';
import { PreviewBrowserHarness } from '../helpers/preview-server.ts';

describe('Tier 4 — Real-World Full-Game Chromium Scenarios (8 scenarios)', () => {
  let harness: PreviewBrowserHarness;

  beforeAll(async () => {
    harness = await PreviewBrowserHarness.start();
  });

  afterAll(async () => {
    await harness?.close();
  });

  it('E2E-T4-01: Complete Fool Mate (2-move checkmate, king check highlight, SAN, board lock)', async () => {
    await harness.withPage({}, async () => {
      await harness.startMatchViaModal({ mode: '2 Jugadores', timePreset: 'Sin reloj' });
      await harness.playMoves(FOOLS_MATE_MOVES);

      await harness.waitForPiece('h4', 'bQ');
      const kingStyle = await harness.getSquareHighlightStyle('e1');
      expect(kingStyle?.innerBoxShadow).not.toBe('none');

      const history = await harness.getMoveHistoryText();
      expect(history.items).toHaveLength(2);
      expect(history.items[0]).toContain('f3');
      expect(history.items[0]).toContain('e5');
      expect(history.items[1]).toContain('g4');
      expect(history.items[1]).toContain('Qh4#');

      const status = await harness.getStatusBanner();
      expect(status.gameOverText).toMatch(/jaque mate/i);
      expect(status.gameOverText).toMatch(/negras/i);

      await harness.clickSquare('e2');
      await harness.clickSquare('e4');
      expect(await harness.getPiece('e2')).toBe('wP');
      expect(await harness.getPiece('e4')).toBeNull();
    });
  });

  it('E2E-T4-02: Complete Scholar Mate (4-move checkmate, capture, check highlight, board lock)', async () => {
    await harness.withPage({}, async () => {
      await harness.startMatchViaModal({ mode: '2 Jugadores', timePreset: 'Sin reloj' });
      await harness.playMoves(SCHOLARS_MATE_MOVES);

      await harness.waitForPiece('f7', 'wQ');
      const kingStyle = await harness.getSquareHighlightStyle('e8');
      expect(kingStyle?.innerBoxShadow).not.toBe('none');

      const history = await harness.getMoveHistoryText();
      expect(history.items).toHaveLength(4);
      expect(history.text).toContain('Qxf7#');

      const status = await harness.getStatusBanner();
      expect(status.gameOverText).toMatch(/jaque mate/i);
      expect(status.gameOverText).toMatch(/blancas/i);

      await harness.clickSquare('a7');
      await harness.clickSquare('a6');
      expect(await harness.getPiece('a7')).toBe('bP');
    });
  });

  it('E2E-T4-03: Stalemate Endgame (Sam Loyd 19-ply sequence, draw banner, clocks freeze, board lock)', async () => {
    await harness.withPage({ installClock: true }, async () => {
      await harness.startMatchViaModal({ mode: '2 Jugadores', timePreset: '3+2 Blitz' });
      await harness.playMoves(SAM_LOYD_STALEMATE_MOVES);

      const status = await harness.getStatusBanner();
      expect(status.gameOverText).toMatch(/ahogado/i);

      const frozenClocks = await harness.getClocks();
      await harness.clockFastForward(30_000);
      const laterClocks = await harness.getClocks();
      expect(laterClocks.white?.timeText).toBe(frozenClocks.white?.timeText);
      expect(laterClocks.black?.timeText).toBe(frozenClocks.black?.timeText);

      await harness.clickSquare('g6');
      await harness.clickSquare('h6');
      expect(await harness.getPiece('g6')).toBe('bK');
    });
  });

  it('E2E-T4-04: 50-Move Rule Endgame Draw (104-ply non-repeating non-capture sequence)', async () => {
    await harness.withPage({}, async () => {
      await harness.startMatchViaModal({ mode: '2 Jugadores', timePreset: 'Sin reloj' });
      await harness.playMoves(FIFTY_MOVE_104_PLY_MOVES);

      const history = await harness.getMoveHistoryText();
      expect(history.items).toHaveLength(52);
      expect(history.items[51]).toContain('52.');

      const status = await harness.getStatusBanner();
      expect(status.gameOverText).toMatch(/50 jugadas/i);

      await harness.clickSquare('e1');
      await harness.clickSquare('e2');
      expect(await harness.getPiece('e1')).toBe('wK');
    });
  });

  it('E2E-T4-05: Threefold Repetition Endgame Draw (8-ply knight cycle, draw banner, board lock)', async () => {
    await harness.withPage({}, async () => {
      await harness.startMatchViaModal({ mode: '2 Jugadores', timePreset: 'Sin reloj' });
      await harness.playMoves(THREEFOLD_REPETITION_MOVES);

      const history = await harness.getMoveHistoryText();
      expect(history.items).toHaveLength(4);

      const status = await harness.getStatusBanner();
      expect(status.gameOverText).toMatch(/triple repetición/i);

      await harness.clickSquare('e2');
      await harness.clickSquare('e4');
      expect(await harness.getPiece('e2')).toBe('wP');
    });
  });

  it('E2E-T4-06: Timeout Defeat under 3+2 Blitz (low-time warning -> 00:00.0 -> White wins)', async () => {
    await harness.withPage({ installClock: true }, async () => {
      await harness.startMatchViaModal({ mode: '2 Jugadores', timePreset: '3+2 Blitz' });
      await harness.playMoves([{ from: 'e2', to: 'e4' }]);

      // 250ms from playMoves + 171_750ms = 172_000ms elapsed -> 8s left
      await harness.clockFastForward(171_750);
      const lowClocks = await harness.getClocks();
      expect(lowClocks.black?.timeText).toMatch(/^00:08\.\d$/);
      expect(lowClocks.black?.lowTime).toBe(true);

      await harness.clockFastForward(10_000);
      const timedOut = await harness.getClocks();
      expect(timedOut.black?.timeText).toBe('00:00.0');
      expect(timedOut.white?.timeText).toBe('03:00');

      const status = await harness.getStatusBanner();
      expect(status.gameOverText).toMatch(/tiempo agotado/i);
      expect(status.gameOverText).toMatch(/blancas/i);

      await harness.clickSquare('e7');
      await harness.clickSquare('e5');
      expect(await harness.getPiece('e7')).toBe('bP');
    });
  });

  it('E2E-T4-07: Mid-Game Restart During AI Thinking + Setup Modal Mode/Difficulty/Color/Time Switching', async () => {
    await harness.withPage({}, async () => {
      await harness.startMatchViaModal({
        mode: 'vs IA',
        difficulty: 'Difícil',
        color: 'Blancas',
        timePreset: '3+2 Blitz',
      });

      await harness.clickSquare('e2');
      await harness.clickSquare('e4');
      await harness.waitForPiece('e4', 'wP');

      await harness.clickButton('^Reiniciar$');
      await harness.waitMs(2000);
      expect((await harness.getMoveHistoryText()).items).toEqual([]);
      expect((await harness.getBoardSnapshot()).pieces.e2).toBe('wP');

      // Switch to vs IA Fácil as Negras with 10+0 Rápida
      await harness.startMatchViaModal({
        mode: 'vs IA',
        difficulty: 'Fácil',
        color: 'Negras',
        timePreset: '10+0 Rápida',
      });
      expect((await harness.getBoardGeometry()).a1!.y).toBeLessThan(
        (await harness.getBoardGeometry()).a8!.y,
      );
      expect((await harness.getClocks()).white?.timeText).toBe('10:00');

      await harness.waitForAiTurnComplete(12_000);
      expect((await harness.getMoveHistoryText()).items).toHaveLength(1);

      // Play legal Black reply
      await harness.clickSquare('e7');
      await harness.clickSquare('e5');
      if ((await harness.getPiece('e5')) !== 'bP') {
        await harness.clickSquare('d7');
        await harness.clickSquare('d5');
      }
      await harness.waitForAiTurnComplete(12_000);

      // Switch to 2 Jugadores Sin reloj
      await harness.startMatchViaModal({
        mode: '2 Jugadores',
        timePreset: 'Sin reloj',
      });
      await harness.playMoves([{ from: 'e2', to: 'e4' }]);
      await harness.waitMs(800);
      expect((await harness.getMoveHistoryText()).items).toHaveLength(1);
      expect((await harness.getClocks()).white?.timeText).toBe('Sin reloj');
    });
  });

  it('E2E-T4-08: Theme Persistence Across Match Lifecycle & Reload + Queen and Knight Promotion', async () => {
    await harness.withPage({}, async () => {
      await harness.selectTheme('Pizarra');
      await harness.startMatchViaModal({ mode: '2 Jugadores', timePreset: 'Sin reloj' });

      await harness.playMoves([
        ...PROMOTION_8_PLY_SETUP,
        { ...PROMOTION_TRIGGER_MOVE, promotion: 'q' },
      ]);
      await harness.waitForPiece('a8', 'wQ');
      expect((await harness.getMoveHistoryText()).text).toContain('bxa8=Q');

      await harness.reload();
      expect((await harness.getThemeState()).activeButtons).toEqual(['Pizarra']);
      const colors = await harness.getSquareColors(['a2', 'a1']);
      expect(colors.a2).toBe(BOARD_THEME_RGB.slate.lightRgb);
      expect(colors.a1).toBe(BOARD_THEME_RGB.slate.darkRgb);

      await harness.startMatchViaModal({ mode: '2 Jugadores', timePreset: 'Sin reloj' });
      await harness.playMoves([
        ...PROMOTION_8_PLY_SETUP,
        { ...PROMOTION_TRIGGER_MOVE, promotion: 'n' },
      ]);
      await harness.waitForPiece('a8', 'wN');
      expect((await harness.getMoveHistoryText()).text).toContain('bxa8=N');
    });
  });
});
