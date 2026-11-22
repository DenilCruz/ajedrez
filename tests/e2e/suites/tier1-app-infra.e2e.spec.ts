import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import {
  Fen,
  MatchEndedEvent,
  Move,
  MoveMadeEvent,
} from '@chess-platform/shared-domain';
import { PlayLocalMoveUseCase } from '@web/application/use-cases/play-local-move.use-case';
import { PlayOnlineMoveUseCase } from '@web/application/use-cases/play-online-move.use-case';
import type { MultiplayerPort } from '@web/domain/ports/multiplayer.port';
import { StockfishWorkerAdapter } from '@web/infrastructure/ai/stockfish-worker.adapter';
import { SocketIoAdapter } from '@web/infrastructure/network/socket-io.adapter';
import {
  BOARD_THEME_STORAGE_KEY,
  LocalStorageAdapter,
} from '@web/infrastructure/storage/local-storage.adapter';
import { describe, expect, it } from 'vitest';
import { createTestMatch, MATE_IN_1_WHITE_FEN } from '../helpers/fixtures.ts';
import {
  createNodeStockfishWorker,
  createScriptableWorkerFactory,
  StubAiEngine,
} from '../helpers/stockfish-shim.ts';
import { InMemoryStorage, withMockedLocalStorage } from '../helpers/storage-shim.ts';

const execFileAsync = promisify(execFile);
const suitesDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(suitesDir, '../../..');
const webRoot = path.join(repoRoot, 'apps/web');

describe('Tier 1 — Web Application & Infrastructure (F6–F9)', () => {
  describe('F6: PlayLocalMoveUseCase', () => {
    it('T1-F6-01: executePlayerMove executes synchronously without calling AiEnginePort', () => {
      const stubAi = new StubAiEngine({ moveUci: 'e7e5' });
      const useCase = new PlayLocalMoveUseCase(stubAi);
      const match = createTestMatch({ id: 't1-f6-01' });

      const result = useCase.executePlayerMove(
        match,
        Move.create({ from: 'e2', to: 'e4' }),
      );

      expect(result).not.toBeInstanceOf(Promise);
      expect(result.moveEvent).toBeInstanceOf(MoveMadeEvent);
      expect(result.moveEvent.san).toBe('e4');
      expect(result.endEvent).toBeNull();
      expect(result.snapshot.history.map((h) => h.san)).toEqual(['e4']);
      expect(result.snapshot.turn).toBe('b');
      expect(stubAi.calls).toEqual([]);
    });

    it('T1-F6-02: executePlayerMove populates endEvent on terminal checkmate move', () => {
      const stubAi = new StubAiEngine();
      const useCase = new PlayLocalMoveUseCase(stubAi);
      const match = createTestMatch({ initialFen: MATE_IN_1_WHITE_FEN });

      const result = useCase.executePlayerMove(
        match,
        Move.create({ from: 'd1', to: 'd8' }),
      );

      expect(result.endEvent).toBeInstanceOf(MatchEndedEvent);
      expect(result.endEvent?.reason).toBe('checkmate');
      expect(result.endEvent?.winner).toBe('w');
      expect(result.snapshot.status).toBe('ended');
    });

    it('T1-F6-03: executeAiTurn queries AiEnginePort asynchronously and applies returned move', async () => {
      const stubAi = new StubAiEngine({ moveUci: 'e7e5', delayMs: 5 });
      const useCase = new PlayLocalMoveUseCase(stubAi);
      const match = createTestMatch({ id: 't1-f6-03' });

      useCase.executePlayerMove(match, Move.create({ from: 'e2', to: 'e4' }));
      const expectedFen = match.getFen();

      const aiResult = await useCase.executeAiTurn(match, 'medium');
      expect(aiResult).not.toBeNull();
      expect(stubAi.calls).toHaveLength(1);
      expect(stubAi.calls[0]).toMatchObject({
        fen: expectedFen,
        difficulty: 'medium',
        abortedAtCall: false,
      });
      expect(aiResult?.moveEvent.san).toBe('e5');
      expect(aiResult?.snapshot.turn).toBe('w');
      expect(aiResult?.snapshot.history).toHaveLength(2);
    });

    it('T1-F6-04: pre-aborted AbortSignal short-circuits executeAiTurn without mutating match', async () => {
      const stubAi = new StubAiEngine({ moveUci: 'e7e5' });
      const useCase = new PlayLocalMoveUseCase(stubAi);
      const match = createTestMatch({ id: 't1-f6-04' });
      useCase.executePlayerMove(match, Move.create({ from: 'e2', to: 'e4' }));
      const fenBefore = match.getFen();

      const controller = new AbortController();
      controller.abort();

      const result = await useCase.executeAiTurn(match, 'easy', controller.signal);
      expect(result).toBeNull();
      expect(stubAi.calls).toEqual([]);
      expect(match.getFen()).toBe(fenBefore);
      expect(match.getSnapshot().history).toHaveLength(1);
    });

    it('T1-F6-05: mid-flight AbortSignal discards AI result without mutating match', async () => {
      const stubAi = new StubAiEngine({ moveUci: 'e7e5', delayMs: 60 });
      const useCase = new PlayLocalMoveUseCase(stubAi);
      const match = createTestMatch({ id: 't1-f6-05' });
      useCase.executePlayerMove(match, Move.create({ from: 'e2', to: 'e4' }));
      const fenBefore = match.getFen();

      const controller = new AbortController();
      const pending = useCase.executeAiTurn(match, 'hard', controller.signal);
      setTimeout(() => controller.abort(), 10);

      const result = await pending;
      expect(result).toBeNull();
      expect(match.getFen()).toBe(fenBefore);
      expect(match.getSnapshot().history).toHaveLength(1);
    });
  });

  describe('F7: StockfishWorkerAdapter & Local Assets', () => {
    it('T1-F7-01: apps/web/public/stockfish/ contains local JS and WASM engine files', () => {
      const stockfishDir = path.join(webRoot, 'public/stockfish');
      const jsPath = path.join(stockfishDir, 'stockfish-19-lite-single.js');
      const wasmPath = path.join(stockfishDir, 'stockfish-19-lite-single.wasm');

      expect(fs.existsSync(jsPath)).toBe(true);
      expect(fs.existsSync(wasmPath)).toBe(true);
      expect(fs.statSync(jsPath).size).toBeGreaterThan(10_000);
      expect(fs.statSync(wasmPath).size).toBeGreaterThan(1_000_000);
    });

    it('T1-F7-02: default worker path targets local stockfish asset and executes UCI handshake', async () => {
      const adapterSrc = fs.readFileSync(
        path.join(webRoot, 'src/infrastructure/ai/stockfish-worker.adapter.ts'),
        'utf8',
      );
      expect(adapterSrc).toContain('/stockfish/stockfish-19-lite-single.js');

      const { factory, workers } = createScriptableWorkerFactory({
        bestMoveQueue: ['e2e4'],
      });
      const adapter = new StockfishWorkerAdapter(factory);

      const move = await adapter.getBestMove(Fen.INITIAL.toString(), 'easy');
      expect(move.toUci()).toBe('e2e4');

      const cmds = workers[0].sentCommands;
      expect(cmds.indexOf('uci')).toBe(0);
      expect(cmds.indexOf('isready')).toBe(1);
      expect(cmds.findIndex((c) => c.startsWith('setoption'))).toBeGreaterThan(1);
      adapter.dispose();
    });

    it('T1-F7-03: maps easy/medium/hard to UCI Skill Level, depth, and movetime', async () => {
      const { factory, workers } = createScriptableWorkerFactory({
        bestMoveQueue: ['e2e4', 'e7e5', 'g1f3'],
      });
      const adapter = new StockfishWorkerAdapter(factory);
      const fen = Fen.INITIAL.toString();

      await adapter.getBestMove(fen, 'easy');
      await adapter.getBestMove(fen, 'medium');
      await adapter.getBestMove(fen, 'hard');

      const cmds = workers[0].sentCommands;
      expect(cmds).toContain('setoption name Skill Level value 2');
      expect(cmds).toContain('go depth 4 movetime 250');
      expect(cmds).toContain('setoption name Skill Level value 10');
      expect(cmds).toContain('go depth 10 movetime 650');
      expect(cmds).toContain('setoption name Skill Level value 20');
      expect(cmds).toContain('go depth 16 movetime 1400');
      expect(cmds.filter((c) => c === `position fen ${fen}`)).toHaveLength(3);

      adapter.dispose();
    });

    it('T1-F7-04: parses standard and promotion bestmove lines and works with real Node Stockfish 19', async () => {
      const { factory } = createScriptableWorkerFactory({
        infoLinesBeforeBestMove: ['info depth 4 score cp 35 pv e7e8q'],
        bestMoveQueue: ['e7e8q ponder a7a6', 'g1f3'],
      });
      const adapter = new StockfishWorkerAdapter(factory);

      const promoMove = await adapter.getBestMove(
        '4k3/4P3/8/8/8/8/8/4K3 w - - 0 1',
        'hard',
      );
      expect(promoMove.from).toBe('e7');
      expect(promoMove.to).toBe('e8');
      expect(promoMove.promotion).toBe('q');

      const normalMove = await adapter.getBestMove(Fen.INITIAL.toString(), 'easy');
      expect(normalMove.from).toBe('g1');
      expect(normalMove.to).toBe('f3');
      expect(normalMove.promotion).toBeUndefined();
      adapter.dispose();

      // Genuine end-to-end check driving real Stockfish 19 lite-single
      const realAdapter = new StockfishWorkerAdapter(() => createNodeStockfishWorker());
      try {
        const realMove = await realAdapter.getBestMove(Fen.INITIAL.toString(), 'easy');
        expect(realMove.toUci()).toMatch(/^[a-h][1-8][a-h][1-8][qrbn]?$/);
      } finally {
        realAdapter.dispose();
      }
    });

    it('T1-F7-05: AbortSignal sends UCI stop and rejects with AbortError', async () => {
      const { factory, workers } = createScriptableWorkerFactory({
        manualGoControl: true,
      });
      const adapter = new StockfishWorkerAdapter(factory);
      const controller = new AbortController();

      const promise = adapter.getBestMove(Fen.INITIAL.toString(), 'hard', controller.signal);
      setTimeout(() => controller.abort(), 15);

      await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
      expect(workers[0].sentCommands).toContain('stop');
      adapter.dispose();
    });

    it('T1-F7-06: dispose() terminates worker and rejects pending search cleanly', async () => {
      const { factory, workers } = createScriptableWorkerFactory({
        manualGoControl: true,
      });
      const adapter = new StockfishWorkerAdapter(factory);

      const pending = adapter.getBestMove(Fen.INITIAL.toString(), 'medium');
      await new Promise((r) => setTimeout(r, 15));
      adapter.dispose();

      await expect(pending).rejects.toThrow(/disposed/i);
      expect(workers[0].terminated).toBe(true);
    });
  });

  describe('F8: LocalStorageAdapter', () => {
    it('T1-F8-01: defaults to classic when storage is empty', () => {
      const storage = new InMemoryStorage();
      const adapter = new LocalStorageAdapter(storage);
      expect(adapter.getTheme()).toBe('classic');
    });

    it('T1-F8-02: saves and retrieves classic and wood themes', () => {
      const storage = new InMemoryStorage();
      const adapter = new LocalStorageAdapter(storage);

      adapter.saveTheme('wood');
      expect(adapter.getTheme()).toBe('wood');

      adapter.saveTheme('classic');
      expect(adapter.getTheme()).toBe('classic');
    });

    it('T1-F8-03: saves and retrieves slate and ocean themes', () => {
      const storage = new InMemoryStorage();
      const adapter = new LocalStorageAdapter(storage);

      adapter.saveTheme('slate');
      expect(adapter.getTheme()).toBe('slate');

      adapter.saveTheme('ocean');
      expect(adapter.getTheme()).toBe('ocean');
    });

    it('T1-F8-04: persists theme across distinct LocalStorageAdapter instances', async () => {
      const storage = new InMemoryStorage();
      await withMockedLocalStorage(storage, () => {
        const writer = new LocalStorageAdapter();
        writer.saveTheme('ocean');

        const reader = new LocalStorageAdapter();
        expect(reader.getTheme()).toBe('ocean');
        expect(storage.getItem(BOARD_THEME_STORAGE_KEY)).toBe('ocean');
      });
    });

    it('T1-F8-05: overwriting theme replaces previous stored value cleanly', () => {
      const storage = new InMemoryStorage();
      const adapter = new LocalStorageAdapter(storage);

      for (const theme of ['wood', 'slate', 'ocean', 'classic'] as const) {
        adapter.saveTheme(theme);
        expect(adapter.getTheme()).toBe(theme);
      }
      expect(storage.length).toBe(1);
    });
  });

  describe('F9: Online Multiplayer Stubs Preserved', () => {
    it('T1-F9-01: online stub files exist at expected Clean Architecture paths', () => {
      const stubPaths = [
        'src/domain/ports/multiplayer.port.ts',
        'src/application/use-cases/play-online-move.use-case.ts',
        'src/infrastructure/network/socket-io.adapter.ts',
      ];
      for (const rel of stubPaths) {
        expect(fs.existsSync(path.join(webRoot, rel))).toBe(true);
      }
    });

    it('T1-F9-02: online stubs are importable and instantiable without network side effects', () => {
      const socketAdapter: MultiplayerPort = new SocketIoAdapter();
      const onlineUseCase = new PlayOnlineMoveUseCase();
      expect(socketAdapter).toBeInstanceOf(SocketIoAdapter);
      expect(onlineUseCase).toBeInstanceOf(PlayOnlineMoveUseCase);
    });

    it('T1-F9-03: online stubs remain unimplemented without active WebSocket calls', () => {
      const socketSrc = fs.readFileSync(
        path.join(webRoot, 'src/infrastructure/network/socket-io.adapter.ts'),
        'utf8',
      );
      const onlineUseCaseSrc = fs.readFileSync(
        path.join(webRoot, 'src/application/use-cases/play-online-move.use-case.ts'),
        'utf8',
      );
      expect(socketSrc).not.toMatch(/\bio\s*\(/);
      expect(onlineUseCaseSrc).not.toMatch(/socket\.io-client/);
    });

    it('T1-F9-04: PlayLocalMoveUseCase runs full local play without referencing online stubs', () => {
      const localSrc = fs.readFileSync(
        path.join(webRoot, 'src/application/use-cases/play-local-move.use-case.ts'),
        'utf8',
      );
      expect(localSrc).not.toContain('multiplayer.port');
      expect(localSrc).not.toContain('play-online-move');
      expect(localSrc).not.toContain('socket-io');

      const useCase = new PlayLocalMoveUseCase(new StubAiEngine());
      const match = createTestMatch();
      const res = useCase.executePlayerMove(match, Move.create({ from: 'e2', to: 'e4' }));
      expect(res.moveEvent.san).toBe('e4');
    });

    it('T1-F9-05: apps/web TypeScript build (tsc -b) passes cleanly with online stubs present', async () => {
      const tscBin = path.join(webRoot, 'node_modules/typescript/bin/tsc');
      const { stderr } = await execFileAsync(process.execPath, [tscBin, '-b'], {
        cwd: webRoot,
      });
      expect(stderr).toBe('');
    });
  });
});
