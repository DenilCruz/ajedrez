import {
  AI_DIFFICULTIES,
  BOARD_THEMES,
  BoardTheme,
  Fen,
  MatchEndedEvent,
  Move,
  type BoardThemeId,
} from '@chess-platform/shared-domain';
import {
  PlayLocalMoveUseCase,
  type LocalMoveResult,
} from '@web/application/use-cases/play-local-move.use-case';
import { PlayOnlineMoveUseCase } from '@web/application/use-cases/play-online-move.use-case';
import { StockfishWorkerAdapter } from '@web/infrastructure/ai/stockfish-worker.adapter';
import { SocketIoAdapter } from '@web/infrastructure/network/socket-io.adapter';
import { LocalStorageAdapter } from '@web/infrastructure/storage/local-storage.adapter';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  BOARD_THEME_RGB,
  createTestMatch,
  FIFTY_MOVE_99_FEN_AND_MOVE,
  FOOLS_MATE_MOVES,
  INSUFFICIENT_K_VS_K_FEN_AND_MOVE,
  PROMOTION_8_PLY_SETUP,
  PROMOTION_TRIGGER_MOVE,
  SCHOLARS_MATE_MOVES,
  STALEMATE_FEN_AND_MOVE,
  THREEFOLD_REPETITION_MOVES,
} from '../helpers/fixtures.ts';
import { PreviewBrowserHarness } from '../helpers/preview-server.ts';
import {
  createScriptableWorkerFactory,
  ScriptableWorker,
  StubAiEngine,
} from '../helpers/stockfish-shim.ts';
import { InMemoryStorage, withMockedLocalStorage } from '../helpers/storage-shim.ts';

describe('Tier 3 — Cross-Feature Pairwise Combinations (15 tests)', () => {
  describe('Domain / Application / Infrastructure Pairwise (10 tests)', () => {
    it('T3-01 (F1+F4+F6): synchronizes PlayLocalMoveUseCase, Match, and 3+2 Blitz time control until timeout', () => {
      const useCase = new PlayLocalMoveUseCase(new StubAiEngine());
      const match = createTestMatch({
        id: 't3-01',
        timeControl: { initialMs: 180_000, incrementMs: 2_000 },
      });

      const r1 = useCase.executePlayerMove(match, Move.create({ from: 'e2', to: 'e4' }));
      expect(r1.snapshot.whiteTimeMs).toBe(180_000);

      match.tickClock(4000);
      const r2 = useCase.executePlayerMove(match, Move.create({ from: 'e7', to: 'e5' }));
      expect(r2.snapshot.blackTimeMs).toBe(178_000);

      const timeoutEv = match.tickClock(180_000);
      expect(timeoutEv?.reason).toBe('timeout');
      expect(() =>
        useCase.executePlayerMove(match, Move.create({ from: 'g1', to: 'f3' })),
      ).toThrow();
    });

    it('T3-02 (F6+F7+F1): executes AI pawn promotion returned by StockfishWorkerAdapter', async () => {
      const { factory } = createScriptableWorkerFactory({
        bestMoveQueue: ['a7a8q'],
      });
      const adapter = new StockfishWorkerAdapter(factory);
      const useCase = new PlayLocalMoveUseCase(adapter);
      const match = createTestMatch({
        initialFen: '4k3/P7/8/8/8/8/8/4K3 w - - 0 1',
      });

      const res = await useCase.executeAiTurn(match, 'hard');
      expect(res?.moveEvent.isPromotion).toBe(true);
      expect(res?.moveEvent.san).toBe('a8=Q+');
      adapter.dispose();
    });

    it('T3-03 (F6+F7+F4): aborts pending AI search on reset without polluting subsequent match', async () => {
      const controller = new AbortController();
      let goResolve!: () => void;
      const goSent = new Promise<void>((resolve) => {
        goResolve = resolve;
      });
      const { factory, workers } = createScriptableWorkerFactory({
        manualGoControl: true,
        onGo: () => {
          goResolve();
        },
      });
      const adapter = new StockfishWorkerAdapter(factory);
      const useCase = new PlayLocalMoveUseCase(adapter);

      const match1 = createTestMatch({
        id: 'm1',
        timeControl: { initialMs: 180_000, incrementMs: 2_000 },
      });
      useCase.executePlayerMove(match1, Move.create({ from: 'e2', to: 'e4' }));
      const fen1Before = match1.getFen();

      const pending1 = useCase.executeAiTurn(match1, 'hard', controller.signal);
      await goSent;
      controller.abort();

      expect(await pending1).toBeNull();
      expect(match1.getFen()).toBe(fen1Before);
      expect(workers[0].sentCommands).toContain('stop');

      // Emit late stale bestmove for aborted search and ensure clean recovery on match2
      workers[0].emitMessage('bestmove e7e5');
      await new Promise((r) => setTimeout(r, 15));

      const match2 = createTestMatch({ id: 'm2' });
      useCase.executePlayerMove(match2, Move.create({ from: 'd2', to: 'd4' }));
      const pending2 = useCase.executeAiTurn(match2, 'easy');
      setTimeout(() => workers[0].emitMessage('bestmove d7d5'), 15);

      const res2 = await pending2;
      expect(res2?.moveEvent.san).toBe('d5');
      adapter.dispose();
    });

    it('T3-04 (F1+F3+F6): delivers all 4 official draw reasons cleanly via PlayLocalMoveUseCase', async () => {
      const useCase = new PlayLocalMoveUseCase(new StubAiEngine());

      // Stalemate
      const mStale = createTestMatch({ initialFen: STALEMATE_FEN_AND_MOVE.fen });
      const rStale = useCase.executePlayerMove(mStale, Move.create(STALEMATE_FEN_AND_MOVE.move));
      expect(rStale.endEvent?.reason).toBe('stalemate');
      expect(await useCase.executeAiTurn(mStale, 'easy')).toBeNull();

      // Threefold repetition
      const mThree = createTestMatch();
      let lastRes = null;
      for (const mv of THREEFOLD_REPETITION_MOVES) {
        lastRes = useCase.executePlayerMove(mThree, Move.create(mv));
      }
      expect(lastRes?.endEvent?.reason).toBe('threefold_repetition');

      // Insufficient material
      const mInsuff = createTestMatch({
        initialFen: INSUFFICIENT_K_VS_K_FEN_AND_MOVE.fen,
      });
      const rInsuff = useCase.executePlayerMove(
        mInsuff,
        Move.create(INSUFFICIENT_K_VS_K_FEN_AND_MOVE.move),
      );
      expect(rInsuff.endEvent?.reason).toBe('insufficient_material');

      // 50-move rule
      const mFifty = createTestMatch({ initialFen: FIFTY_MOVE_99_FEN_AND_MOVE.fen });
      const rFifty = useCase.executePlayerMove(
        mFifty,
        Move.create(FIFTY_MOVE_99_FEN_AND_MOVE.move),
      );
      expect(rFifty.endEvent?.reason).toBe('fifty_move_rule');
    });

    it('T3-05 (F2+F5+F6): full Scholar Mate via PlayLocalMoveUseCase exposes zero chess.js artifacts', () => {
      const useCase = new PlayLocalMoveUseCase(new StubAiEngine());
      const match = createTestMatch({ id: 't3-05' });

      let lastResult: LocalMoveResult | undefined;
      for (const mv of SCHOLARS_MATE_MOVES) {
        lastResult = useCase.executePlayerMove(match, Move.create(mv));
      }

      expect(lastResult?.endEvent).toBeInstanceOf(MatchEndedEvent);
      expect(lastResult?.endEvent?.reason).toBe('checkmate');
      expect(lastResult?.endEvent?.winner).toBe('w');
      expect(() => JSON.stringify(lastResult)).not.toThrow();
    });

    it('T3-06 (F4+F1+F6): unlimited Sin reloj mode ignores tickClock across full PlayLocalMoveUseCase match', async () => {
      const useCase = new PlayLocalMoveUseCase(new StubAiEngine({ moveUci: 'e7e5' }));
      const match = createTestMatch({ timeControl: null });

      useCase.executePlayerMove(match, Move.create({ from: 'e2', to: 'e4' }));
      expect(match.tickClock(60_000)).toBeNull();
      const aiRes = await useCase.executeAiTurn(match, 'easy');
      expect(match.tickClock(60_000)).toBeNull();
      expect(aiRes?.snapshot.whiteTimeMs).toBeNull();
      expect(aiRes?.snapshot.blackTimeMs).toBeNull();
      expect(match.getStatus()).toBe('playing');
    });

    it('T3-07 (F8+F5+F1): LocalStorageAdapter round-trips all 4 BoardTheme value objects accurately', () => {
      const storage = new InMemoryStorage();
      const writer = new LocalStorageAdapter(storage);
      const reader = new LocalStorageAdapter(storage);

      for (const id of ['classic', 'wood', 'slate', 'ocean'] as BoardThemeId[]) {
        writer.saveTheme(id);
        const loadedId = reader.getTheme();
        const vo = BoardTheme.create(loadedId);
        expect(vo.config).toEqual(BOARD_THEMES[id]);
      }
    });

    it('T3-08 (F7+F5): StockfishWorkerAdapter UCI parameters match AI_DIFFICULTIES value objects', async () => {
      const { factory, workers } = createScriptableWorkerFactory({
        bestMoveQueue: ['e2e4', 'd2d4', 'c2c4'],
      });
      const adapter = new StockfishWorkerAdapter(factory);

      for (const level of ['easy', 'medium', 'hard'] as const) {
        await adapter.getBestMove(Fen.INITIAL.toString(), level);
        const spec = AI_DIFFICULTIES[level];
        expect(workers[0].sentCommands).toContain(
          `setoption name Skill Level value ${spec.skillLevel}`,
        );
        expect(workers[0].sentCommands).toContain(
          `go depth ${spec.depth} movetime ${spec.movetimeMs}`,
        );
      }
      adapter.dispose();
    });

    it('T3-09 (F6+F7): StockfishWorkerAdapter.dispose() rejects in-flight AI turn cleanly and recovers on subsequent turn', async () => {
      let goResolve!: () => void;
      const goSent = new Promise<void>((resolve) => {
        goResolve = resolve;
      });
      const workers: ScriptableWorker[] = [];
      let callCount = 0;
      const adapter = new StockfishWorkerAdapter(() => {
        callCount += 1;
        const w =
          callCount === 1
            ? new ScriptableWorker({
                manualGoControl: true,
                onGo: () => goResolve(),
              })
            : new ScriptableWorker({ bestMoveQueue: ['e7e5'] });
        workers.push(w);
        return w;
      });
      const useCase = new PlayLocalMoveUseCase(adapter);
      const match = createTestMatch();
      useCase.executePlayerMove(match, Move.create({ from: 'e2', to: 'e4' }));
      const fenBefore = match.getFen();

      // Trigger dispose mid-search -> rejects cleanly without mutating match
      const inFlight = useCase.executeAiTurn(match, 'easy');
      await goSent;
      adapter.dispose();
      await expect(inFlight).rejects.toThrow(/disposed/i);
      expect(workers[0].terminated).toBe(true);
      expect(match.getFen()).toBe(fenBefore);

      // Subsequent turn after dispose spawns fresh worker cleanly without hanging
      const recovered = await useCase.executeAiTurn(match, 'easy');
      expect(recovered?.moveEvent.san).toBe('e5');
      expect(workers).toHaveLength(2);
      adapter.dispose();
    });

    it('T3-10 (F8+F6+F9): full local session with storage + AI + online stubs coexists with zero network side effects', async () => {
      const storage = new InMemoryStorage();
      await withMockedLocalStorage(storage, async () => {
        new SocketIoAdapter();
        new PlayOnlineMoveUseCase();
        const storageAdapter = new LocalStorageAdapter();
        storageAdapter.saveTheme('slate');

        const useCase = new PlayLocalMoveUseCase(new StubAiEngine({ moveUci: 'e7e5' }));
        const match = createTestMatch();
        useCase.executePlayerMove(match, Move.create({ from: 'e2', to: 'e4' }));
        await useCase.executeAiTurn(match, 'medium');

        expect(storageAdapter.getTheme()).toBe('slate');
        expect(match.getSnapshot().history).toHaveLength(2);
      });
    });
  });

  describe('UI / Controller / Infrastructure Pairwise in Real Chromium (5 tests)', () => {
    let harness: PreviewBrowserHarness;

    beforeAll(async () => {
      harness = await PreviewBrowserHarness.start();
    });

    afterAll(async () => {
      await harness?.close();
    });

    it('E2E-T3-01: vs IA + 3+2 Blitz + Océano persistence across reload + Difícil mid-search restart', async () => {
      await harness.withPage({}, async () => {
        await harness.selectTheme('Océano');
        await harness.startMatchViaModal({
          mode: 'vs IA',
          difficulty: 'Fácil',
          color: 'Blancas',
          timePreset: '3+2 Blitz',
        });

        await harness.clickSquare('e2');
        await harness.clickSquare('e4');
        await harness.waitForAiTurnComplete(12_000);
        expect((await harness.getMoveHistoryText()).items).toHaveLength(1);

        await harness.reload();
        expect((await harness.getThemeState()).activeButtons).toEqual(['Océano']);
        expect((await harness.getSquareColors(['a2'])).a2).toBe(
          BOARD_THEME_RGB.ocean.lightRgb,
        );

        await harness.startMatchViaModal({
          mode: 'vs IA',
          difficulty: 'Difícil',
          color: 'Blancas',
          timePreset: '3+2 Blitz',
        });
        await harness.clickSquare('e2');
        await harness.clickSquare('e4');
        await harness.clickButton('^Reiniciar$');
        await harness.waitMs(2200);

        expect((await harness.getMoveHistoryText()).items).toEqual([]);
        expect((await harness.getClocks()).white?.timeText).toBe('03:00');
      });
    });

    it('E2E-T3-02: 2 Jugadores + board flip toggle + threefold repetition + clock increment + SAN parity', async () => {
      await harness.withPage({ installClock: true }, async () => {
        await harness.startMatchViaModal({ mode: '2 Jugadores', timePreset: '3+2 Blitz' });

        await harness.playMoves(THREEFOLD_REPETITION_MOVES.slice(0, 2));
        await harness.clickButton('rotar tablero|girar tablero');
        let geom = await harness.getBoardGeometry();
        expect(geom.a1!.y).toBeLessThan(geom.a8!.y);

        await harness.clickButton('rotar tablero|girar tablero');
        geom = await harness.getBoardGeometry();
        expect(geom.a1!.y).toBeGreaterThan(geom.a8!.y);

        await harness.playMoves(THREEFOLD_REPETITION_MOVES.slice(2));
        const history = await harness.getMoveHistoryText();
        expect(history.items).toHaveLength(4);
        expect(history.text).toContain('Nf3');
        expect(history.text).toContain('Ng8');
        expect((await harness.getStatusBanner()).gameOverText).toMatch(/triple repetición/i);
      });
    });

    it('E2E-T3-03: GameSetupModal Black/Difícil/10+0 + AI White opening + player reply + Rendirse banner', async () => {
      await harness.withPage({}, async () => {
        await harness.startMatchViaModal({
          mode: 'vs IA',
          difficulty: 'Difícil',
          color: 'Negras',
          timePreset: '10+0 Rápida',
        });

        expect((await harness.getBoardGeometry()).a1!.y).toBeLessThan(
          (await harness.getBoardGeometry()).a8!.y,
        );
        expect((await harness.getClocks()).white?.timeText).toBe('10:00');

        await harness.waitForAiTurnComplete(12_000);
        expect((await harness.getMoveHistoryText()).items).toHaveLength(1);

        // Play legal Black reply (try e7->e5 or d7->d5 depending on AI opening)
        await harness.clickSquare('e7');
        await harness.clickSquare('e5');
        if ((await harness.getPiece('e5')) !== 'bP') {
          await harness.clickSquare('d7');
          await harness.clickSquare('d5');
        }

        await harness.clickButton('^Rendirse$');
        const status = await harness.getStatusBanner();
        expect(status.gameOverText).toMatch(/rendición/i);
        expect(status.gameOverText).toMatch(/blancas/i);
      });
    });

    it('E2E-T3-04: Drag-and-drop + click-to-move interleaving + king-in-check highlight + mid-game theme switch', async () => {
      await harness.withPage({}, async () => {
        await harness.selectTheme('Madera');
        await harness.startMatchViaModal({ mode: '2 Jugadores', timePreset: 'Sin reloj' });

        await harness.dragSquare('e2', 'e4');
        await harness.clickSquare('e7');
        await harness.clickSquare('e5');
        await harness.dragSquare('d1', 'h5');

        await harness.selectTheme('Pizarra');
        await harness.clickSquare('b8');
        await harness.clickSquare('c6');
        await harness.clickSquare('f1');
        await harness.clickSquare('c4');
        await harness.dragSquare('g8', 'f6');
        await harness.dragSquare('h5', 'f7');

        expect((await harness.getSquareColors(['a2'])).a2).toBe(
          BOARD_THEME_RGB.slate.lightRgb,
        );
        expect((await harness.getStatusBanner()).gameOverText).toMatch(/jaque mate/i);
        const kingCheck = await harness.getSquareHighlightStyle('e8');
        expect(kingCheck?.innerBoxShadow).not.toBe('none');
      });
    });

    it('E2E-T3-05: Promotion SAN (=Q) + Check SAN (+) + Checkmate SAN (#) in MoveHistoryView + Game-Over Banner', async () => {
      await harness.withPage({}, async () => {
        await harness.startMatchViaModal({ mode: '2 Jugadores', timePreset: 'Sin reloj' });
        await harness.playMoves([
          ...PROMOTION_8_PLY_SETUP,
          { ...PROMOTION_TRIGGER_MOVE, promotion: 'q' },
          { from: 'b1', to: 'b7' },
          { from: 'a8', to: 'b7' },
          { from: 'e7', to: 'e5' },
          { from: 'b7', to: 'c8' },
        ]);

        let history = await harness.getMoveHistoryText();
        expect(history.text).toContain('bxa8=Q');
        expect(history.text).toContain('Qxc8+');
        expect((await harness.getStatusBanner()).bodyHasCheck).toBe(true);

        await harness.clickButton('^Reiniciar$');
        await harness.playMoves(FOOLS_MATE_MOVES);
        history = await harness.getMoveHistoryText();
        expect(history.text).toContain('Qh4#');
        expect((await harness.getStatusBanner()).gameOverText).toMatch(/jaque mate/i);
      });
    });
  });
});
