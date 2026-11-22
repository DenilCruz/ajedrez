import { Chess } from 'chess.js';
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
import {
  createNodeStockfishWorker,
  createScriptableWorkerFactory,
} from '../helpers/stockfish-shim.ts';
import {
  FaultyStorage,
  InMemoryStorage,
  withMockedLocalStorage,
} from '../helpers/storage-shim.ts';

function replayWithChessJs(moves: ReadonlyArray<{ from: string; to: string; promotion?: string }>): Chess {
  const chess = new Chess();
  for (const mv of moves) {
    const applied = chess.move(mv);
    expect(applied).toBeTruthy();
  }
  return chess;
}

describe('E2E Harness Sanity', () => {
  let harness: PreviewBrowserHarness;

  beforeAll(async () => {
    harness = await PreviewBrowserHarness.start();
  });

  afterAll(async () => {
    await harness?.close();
  });

  it('verifies all E2E move fixtures against chess.js oracle', () => {
    const fools = replayWithChessJs(FOOLS_MATE_MOVES);
    expect(fools.isCheckmate()).toBe(true);
    expect(fools.turn()).toBe('w');

    const scholars = replayWithChessJs(SCHOLARS_MATE_MOVES);
    expect(scholars.isCheckmate()).toBe(true);
    expect(scholars.turn()).toBe('b');

    const stalemate = replayWithChessJs(SAM_LOYD_STALEMATE_MOVES);
    expect(stalemate.isStalemate()).toBe(true);
    expect(stalemate.isGameOver()).toBe(true);

    const threefold = replayWithChessJs(THREEFOLD_REPETITION_MOVES);
    expect(threefold.isThreefoldRepetition()).toBe(true);

    const fifty = replayWithChessJs(FIFTY_MOVE_104_PLY_MOVES);
    expect(fifty.isDrawByFiftyMoves()).toBe(true);
    expect(fifty.isThreefoldRepetition()).toBe(false);

    const promo = replayWithChessJs([
      ...PROMOTION_8_PLY_SETUP,
      { ...PROMOTION_TRIGGER_MOVE, promotion: 'q' },
    ]);
    expect(promo.get('a8')).toEqual({ type: 'q', color: 'w' });

    expect(Object.keys(BOARD_THEME_RGB)).toEqual(['classic', 'wood', 'slate', 'ocean']);
  });

  it('verifies InMemoryStorage, FaultyStorage, and withMockedLocalStorage shims', async () => {
    const mem = new InMemoryStorage();
    mem.setItem('k1', 'v1');
    expect(mem.getItem('k1')).toBe('v1');
    expect(mem.length).toBe(1);
    mem.removeItem('k1');
    expect(mem.getItem('k1')).toBeNull();

    const faulty = new FaultyStorage({
      throwOnGet: new Error('SecurityError'),
      throwOnSet: new Error('QuotaExceededError'),
    });
    expect(() => faulty.getItem('x')).toThrow('SecurityError');
    expect(() => faulty.setItem('x', 'y')).toThrow('QuotaExceededError');

    await withMockedLocalStorage(mem, () => {
      globalThis.localStorage.setItem('theme', 'ocean');
      expect(globalThis.localStorage.getItem('theme')).toBe('ocean');
    });

    await withMockedLocalStorage(undefined, () => {
      expect(globalThis.localStorage).toBeUndefined();
    });
  });

  it('verifies ScriptableWorker UCI responder and real Node Stockfish 19 UCI handshake/bestmove', async () => {
    const { factory, workers } = createScriptableWorkerFactory({
      bestMoveQueue: ['e2e4'],
      bestMoveDelayMs: 2,
    });
    const fakeWorker = factory();
    const received: string[] = [];
    await new Promise<void>((resolve) => {
      fakeWorker.onmessage = (ev) => {
        const line = String(ev.data);
        received.push(line);
        if (line === 'uciok') fakeWorker.postMessage('isready');
        if (line === 'readyok') fakeWorker.postMessage('go depth 4 movetime 250');
        if (line.startsWith('bestmove ')) resolve();
      };
      fakeWorker.postMessage('uci');
    });
    expect(received).toContain('uciok');
    expect(received).toContain('readyok');
    expect(received.at(-1)).toBe('bestmove e2e4');
    fakeWorker.terminate();
    expect(workers[0].terminated).toBe(true);

    // Real Node Stockfish 19 lite-single verification
    const realWorker = createNodeStockfishWorker();
    try {
      const realLines: string[] = [];
      const bestMove = await new Promise<string>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Stockfish Node UCI timeout')), 15_000);
        realWorker.onerror = (ev) => {
          clearTimeout(timer);
          reject(new Error(ev.message));
        };
        realWorker.onmessage = (ev) => {
          const line = String(ev.data);
          realLines.push(line);
          if (line === 'uciok') {
            realWorker.postMessage('isready');
          } else if (line === 'readyok') {
            realWorker.postMessage('position startpos');
            realWorker.postMessage('go depth 2 movetime 150');
          } else if (line.startsWith('bestmove ')) {
            clearTimeout(timer);
            resolve(line);
          }
        };
        realWorker.postMessage('uci');
      });
      expect(realLines).toContain('uciok');
      expect(realLines).toContain('readyok');
      expect(bestMove).toMatch(/^bestmove [a-h][1-8][a-h][1-8]/);
    } finally {
      realWorker.terminate();
    }
  });

  it('verifies programmatic Vite preview() HTTP 200 and Python Playwright headless Chromium', async () => {
    const resp = await fetch(harness.baseUrl);
    expect(resp.status).toBe(200);
    const html = await resp.text();
    expect(html).toContain('<div id="root"></div>');

    await harness.withPage({ waitForBoard: false }, async () => {
      const evalSum = await harness.evaluate<number>('2 + 3');
      expect(evalSum).toBe(5);
      const docTitle = await harness.evaluate<string>('document.title');
      expect(docTitle.length).toBeGreaterThan(0);
    });
  });
});
