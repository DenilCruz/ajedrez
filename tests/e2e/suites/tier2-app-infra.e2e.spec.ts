import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  Fen,
  Move,
  type BoardThemeId,
} from '@chess-platform/shared-domain';
import { PlayLocalMoveUseCase } from '@web/application/use-cases/play-local-move.use-case';
import { PlayOnlineMoveUseCase } from '@web/application/use-cases/play-online-move.use-case';
import { StockfishWorkerAdapter } from '@web/infrastructure/ai/stockfish-worker.adapter';
import { SocketIoAdapter } from '@web/infrastructure/network/socket-io.adapter';
import {
  BOARD_THEME_STORAGE_KEY,
  LocalStorageAdapter,
} from '@web/infrastructure/storage/local-storage.adapter';
import { describe, expect, it, vi } from 'vitest';
import { createTestMatch } from '../helpers/fixtures.ts';
import {
  createScriptableWorkerFactory,
  StubAiEngine,
} from '../helpers/stockfish-shim.ts';
import {
  FaultyStorage,
  InMemoryStorage,
  withMockedLocalStorage,
} from '../helpers/storage-shim.ts';

const suitesDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(suitesDir, '../../..');
const webRoot = path.join(repoRoot, 'apps/web');

describe('Tier 2 — Web Application & Infrastructure Boundaries (F6–F9)', () => {
  describe('F6 Boundaries: PlayLocalMoveUseCase', () => {
    it('T2-F6-01: executeAiTurn resolves null immediately when match has already ended', async () => {
      const stubAi = new StubAiEngine();
      const useCase = new PlayLocalMoveUseCase(stubAi);
      const match = createTestMatch();
      match.resign('w');

      const res = await useCase.executeAiTurn(match, 'medium');
      expect(res).toBeNull();
      expect(stubAi.calls).toEqual([]);
    });

    it('T2-F6-02: race condition where match ends while getBestMove is pending discards AI move', async () => {
      const stubAi = new StubAiEngine({ moveUci: 'e7e5', delayMs: 40 });
      const useCase = new PlayLocalMoveUseCase(stubAi);
      const match = createTestMatch();
      useCase.executePlayerMove(match, Move.create({ from: 'e2', to: 'e4' }));

      const pending = useCase.executeAiTurn(match, 'hard');
      match.resign('w');
      const fenAfterResign = match.getFen();

      const res = await pending;
      expect(res).toBeNull();
      expect(match.getFen()).toBe(fenAfterResign);
      expect(match.getSnapshot().history).toHaveLength(1);
    });

    it('T2-F6-03: executePlayerMove propagates illegal move error without invoking AI', () => {
      const stubAi = new StubAiEngine();
      const useCase = new PlayLocalMoveUseCase(stubAi);
      const match = createTestMatch();

      expect(() =>
        useCase.executePlayerMove(match, Move.create({ from: 'e2', to: 'e5' })),
      ).toThrow();
      expect(stubAi.calls).toEqual([]);
      expect(match.getSnapshot().history).toEqual([]);
    });

    it('T2-F6-04: non-Abort errors from AiEnginePort propagate rather than returning null', async () => {
      const stubAi = new StubAiEngine({
        errorToThrow: new Error('Engine crashed'),
      });
      const useCase = new PlayLocalMoveUseCase(stubAi);
      const match = createTestMatch();
      useCase.executePlayerMove(match, Move.create({ from: 'e2', to: 'e4' }));

      await expect(useCase.executeAiTurn(match, 'medium')).rejects.toThrow(
        'Engine crashed',
      );
      expect(match.getSnapshot().history).toHaveLength(1);
    });

    it('T2-F6-05: illegal move returned by AiEnginePort rejects cleanly without corrupting match', async () => {
      const stubAi = new StubAiEngine({ moveUci: 'a1h8' });
      const useCase = new PlayLocalMoveUseCase(stubAi);
      const match = createTestMatch();
      useCase.executePlayerMove(match, Move.create({ from: 'e2', to: 'e4' }));
      const fenBefore = match.getFen();

      await expect(useCase.executeAiTurn(match, 'easy')).rejects.toThrow();
      expect(match.getFen()).toBe(fenBefore);
      expect(match.getSnapshot().history).toHaveLength(1);
    });
  });

  describe('F7 Boundaries: StockfishWorkerAdapter', () => {
    it('T2-F7-01: rejects clearly when Stockfish returns bestmove (none)', async () => {
      const { factory } = createScriptableWorkerFactory({
        bestMoveQueue: ['(none)'],
      });
      const adapter = new StockfishWorkerAdapter(factory);

      await expect(
        adapter.getBestMove('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1', 'easy'),
      ).rejects.toThrow(/\(none\)|no legal move/i);
      adapter.dispose();
    });

    it('T2-F7-02: ignores noisy info/id lines and rejects malformed bestmove tokens', async () => {
      const { factory } = createScriptableWorkerFactory({
        infoLinesBeforeBestMove: [
          'id name Stockfish 19',
          '',
          'info string NNUE evaluation using nn-foo.nnue',
          'info depth 1 seldepth 1 multipv 1 score cp 20 pv e2e4',
        ],
        bestMoveQueue: ['z9z9'],
      });
      const adapter = new StockfishWorkerAdapter(factory);

      await expect(
        adapter.getBestMove(Fen.INITIAL.toString(), 'easy'),
      ).rejects.toThrow();
      adapter.dispose();
    });

    it('T2-F7-03: worker onerror event rejects active getBestMove without hanging', async () => {
      const { factory, workers } = createScriptableWorkerFactory({
        manualGoControl: true,
      });
      const adapter = new StockfishWorkerAdapter(factory);

      const pending = adapter.getBestMove(Fen.INITIAL.toString(), 'medium');
      await new Promise((r) => setTimeout(r, 15));
      workers[0].triggerError('WASM failed to compile');

      await expect(pending).rejects.toThrow('WASM failed to compile');
      adapter.dispose();
    });

    it('T2-F7-04: pre-aborted AbortSignal rejects immediately with AbortError without starting worker', async () => {
      const { factory, workers } = createScriptableWorkerFactory();
      const adapter = new StockfishWorkerAdapter(factory);
      const controller = new AbortController();
      controller.abort();

      await expect(
        adapter.getBestMove(Fen.INITIAL.toString(), 'easy', controller.signal),
      ).rejects.toMatchObject({ name: 'AbortError' });
      expect(workers).toHaveLength(0);
      adapter.dispose();
    });

    it('T2-F7-05: reuses single initialized worker across sequential searches without duplicate uci init', async () => {
      const { factory, workers } = createScriptableWorkerFactory({
        bestMoveQueue: ['e2e4', 'e7e5'],
      });
      const adapter = new StockfishWorkerAdapter(factory);

      const m1 = await adapter.getBestMove(Fen.INITIAL.toString(), 'easy');
      const m2 = await adapter.getBestMove(
        'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
        'medium',
      );

      expect(m1.toUci()).toBe('e2e4');
      expect(m2.toUci()).toBe('e7e5');
      expect(workers).toHaveLength(1);
      expect(workers[0].sentCommands.filter((c) => c === 'uci')).toHaveLength(1);
      adapter.dispose();
    });
  });

  describe('F8 Boundaries: LocalStorageAdapter', () => {
    it('T2-F8-01: falls back safely to classic for unknown or empty theme values', () => {
      const storage = new InMemoryStorage();
      const adapter = new LocalStorageAdapter(storage);

      for (const bad of ['cyberpunk', '', 'null', 'CLASSIC']) {
        storage.seedRaw(BOARD_THEME_STORAGE_KEY, bad);
        expect(adapter.getTheme()).toBe('classic');
      }
    });

    it('T2-F8-02: falls back safely to classic for malformed JSON or object strings', () => {
      const storage = new InMemoryStorage();
      const adapter = new LocalStorageAdapter(storage);

      for (const bad of ['{bad-json', '{"id":123}', '[]']) {
        storage.seedRaw(BOARD_THEME_STORAGE_KEY, bad);
        expect(adapter.getTheme()).toBe('classic');
      }
    });

    it('T2-F8-03: catches SecurityError on localStorage.getItem and returns classic', () => {
      const faulty = new FaultyStorage({
        throwOnGet: new DOMException('Access denied', 'SecurityError'),
      });
      const adapter = new LocalStorageAdapter(faulty);
      expect(adapter.getTheme()).toBe('classic');
    });

    it('T2-F8-04: handles QuotaExceededError on localStorage.setItem without crashing', () => {
      const faulty = new FaultyStorage({
        throwOnSet: new DOMException('Quota exceeded', 'QuotaExceededError'),
        initialEntries: { [BOARD_THEME_STORAGE_KEY]: 'slate' },
      });
      const adapter = new LocalStorageAdapter(faulty);

      expect(() => adapter.saveTheme('wood')).not.toThrow();
      expect(adapter.getTheme()).toBe('slate');

      // Also guard invalid theme passed via unsafe cast
      const mem = new InMemoryStorage();
      const safeAdapter = new LocalStorageAdapter(mem);
      safeAdapter.saveTheme('invalid-theme' as unknown as BoardThemeId);
      expect(safeAdapter.getTheme()).toBe('classic');
    });

    it('T2-F8-05: works safely when globalThis.localStorage is undefined (SSR/Node)', async () => {
      await withMockedLocalStorage(undefined, () => {
        const adapter = new LocalStorageAdapter();
        expect(() => adapter.saveTheme('ocean')).not.toThrow();
        expect(adapter.getTheme()).toBe('classic');
      });
    });
  });

  describe('F9 Boundaries: Online Stubs', () => {
    it('T2-F9-01: SocketIoAdapter instantiation opens zero sockets or timers', () => {
      const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
      const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');
      try {
        const instance = new SocketIoAdapter();
        expect(instance).toBeDefined();
        expect(setTimeoutSpy).not.toHaveBeenCalled();
        expect(setIntervalSpy).not.toHaveBeenCalled();
      } finally {
        setTimeoutSpy.mockRestore();
        setIntervalSpy.mockRestore();
      }
    });

    it('T2-F9-02: PlayOnlineMoveUseCase instantiation requires zero network state', () => {
      const online = new PlayOnlineMoveUseCase();
      expect(online).toBeInstanceOf(PlayOnlineMoveUseCase);
    });

    it('T2-F9-03: static import graph keeps local modules isolated from online modules', () => {
      const localFiles = [
        'src/application/use-cases/play-local-move.use-case.ts',
        'src/infrastructure/ai/stockfish-worker.adapter.ts',
        'src/infrastructure/storage/local-storage.adapter.ts',
      ];
      for (const rel of localFiles) {
        const content = fs.readFileSync(path.join(webRoot, rel), 'utf8');
        expect(content).not.toMatch(/multiplayer\.port|play-online-move|socket-io|socket\.io-client/);
      }
    });

    it('T2-F9-04: socket.io-client / network sockets are never invoked during a local match lifecycle', async () => {
      const connectSpy = vi.spyOn(net.Socket.prototype, 'connect');
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      try {
        const stubAi = new StubAiEngine({ moveUci: 'e7e5' });
        const useCase = new PlayLocalMoveUseCase(stubAi);
        const match = createTestMatch();
        useCase.executePlayerMove(match, Move.create({ from: 'e2', to: 'e4' }));
        await useCase.executeAiTurn(match, 'easy');
        expect(connectSpy).not.toHaveBeenCalled();
        expect(fetchSpy).not.toHaveBeenCalled();
      } finally {
        connectSpy.mockRestore();
        fetchSpy.mockRestore();
      }
    });

    it('T2-F9-05: online stubs cause zero mutations to globalThis or localStorage', async () => {
      const storage = new InMemoryStorage();
      await withMockedLocalStorage(storage, () => {
        const keysBefore = Object.keys(globalThis).sort();
        new SocketIoAdapter();
        new PlayOnlineMoveUseCase();
        const keysAfter = Object.keys(globalThis).sort();
        expect(keysAfter).toEqual(keysBefore);
        expect(storage.length).toBe(0);
      });
    });
  });
});
