import { afterEach, describe, expect, it, vi } from 'vitest';
import { Move } from '@chess-platform/shared-domain';
import type { AiDifficultyLevel } from '@chess-platform/shared-domain';
import { StockfishWorkerAdapter } from '../../src/infrastructure/ai/stockfish-worker.adapter';

class MockWorker {
  public onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  public onerror: ((event: ErrorEvent) => void) | null = null;
  public onmessageerror: ((event: MessageEvent<unknown>) => void) | null = null;
  public readonly postedMessages: string[] = [];
  public terminateCalls = 0;

  public postMessage(message: unknown): void {
    this.postedMessages.push(String(message));
  }

  public terminate(): void {
    this.terminateCalls += 1;
  }

  public emitMessage(data: string): void {
    this.onmessage?.({ data } as MessageEvent<unknown>);
  }

  public emitError(message = 'Worker crashed'): void {
    this.onerror?.({ message } as ErrorEvent);
  }

  public emitMessageError(): void {
    this.onmessageerror?.({} as MessageEvent<unknown>);
  }
}

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe('StockfishWorkerAdapter', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('lazily initializes the worker once and reuses it across sequential searches', async () => {
    const workers: MockWorker[] = [];
    const factory = vi.fn(() => {
      const worker = new MockWorker();
      workers.push(worker);
      return worker as unknown as Worker;
    });

    const adapter = new StockfishWorkerAdapter(factory);
    expect(factory).not.toHaveBeenCalled();

    const firstSearch = adapter.getBestMove(START_FEN, 'easy');
    await flushMicrotasks();

    expect(factory).toHaveBeenCalledTimes(1);
    const worker = workers[0];
    expect(worker.postedMessages).toEqual(['uci']);

    worker.emitMessage('id name Stockfish 19\nuciok');
    expect(worker.postedMessages).toEqual(['uci', 'isready']);

    worker.emitMessage('readyok');
    await flushMicrotasks();

    expect(worker.postedMessages).toEqual([
      'uci',
      'isready',
      'setoption name Skill Level value 2',
      `position fen ${START_FEN}`,
      'go depth 4 movetime 250',
    ]);

    worker.emitMessage('info depth 4 score cp 24\nbestmove e2e4 ponder e7e5');
    const firstMove = await firstSearch;
    expect(firstMove.equals(Move.fromUci('e2e4'))).toBe(true);

    const secondSearch = adapter.getBestMove(START_FEN, 'medium');
    await flushMicrotasks();

    expect(factory).toHaveBeenCalledTimes(1);
    expect(worker.postedMessages.slice(5)).toEqual([
      'setoption name Skill Level value 10',
      `position fen ${START_FEN}`,
      'go depth 10 movetime 650',
    ]);

    worker.emitMessage('bestmove d2d4');
    const secondMove = await secondSearch;
    expect(secondMove.equals(Move.fromUci('d2d4'))).toBe(true);
  });

  it('maps easy, medium, and hard difficulties to exact UCI Skill Level, depth, and movetime', async () => {
    const worker = new MockWorker();
    const adapter = new StockfishWorkerAdapter(() => worker as unknown as Worker);

    const p1 = adapter.getBestMove(START_FEN, 'easy');
    await flushMicrotasks();
    worker.emitMessage('uciok');
    worker.emitMessage('readyok');
    await flushMicrotasks();
    worker.emitMessage('bestmove e2e4');
    await p1;

    const p2 = adapter.getBestMove(START_FEN, 'medium');
    await flushMicrotasks();
    worker.emitMessage('bestmove d2d4');
    await p2;

    const p3 = adapter.getBestMove(START_FEN, 'hard');
    await flushMicrotasks();
    worker.emitMessage('bestmove g1f3');
    await p3;

    expect(worker.postedMessages).toEqual([
      'uci',
      'isready',
      'setoption name Skill Level value 2',
      `position fen ${START_FEN}`,
      'go depth 4 movetime 250',
      'setoption name Skill Level value 10',
      `position fen ${START_FEN}`,
      'go depth 10 movetime 650',
      'setoption name Skill Level value 20',
      `position fen ${START_FEN}`,
      'go depth 16 movetime 1400',
    ]);
  });

  it('parses promotion UCI moves and ignores info lines', async () => {
    const worker = new MockWorker();
    const adapter = new StockfishWorkerAdapter(() => worker as unknown as Worker);

    const search = adapter.getBestMove('4k3/P7/8/8/8/8/8/4K3 w - - 0 1', 'hard');
    await flushMicrotasks();
    worker.emitMessage('uciok');
    worker.emitMessage('readyok');
    await flushMicrotasks();

    worker.emitMessage('info string bestmove a1a2 should not match');
    worker.emitMessage('info depth 12 pv a7a8q');
    worker.emitMessage('bestmove a7a8q ponder e8f7');

    const move = await search;
    expect(move.from).toBe('a7');
    expect(move.to).toBe('a8');
    expect(move.promotion).toBe('q');
  });

  it('rejects cleanly when Stockfish returns bestmove (none)', async () => {
    const worker = new MockWorker();
    const adapter = new StockfishWorkerAdapter(() => worker as unknown as Worker);

    const search = adapter.getBestMove('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1', 'easy');
    await flushMicrotasks();
    worker.emitMessage('uciok');
    worker.emitMessage('readyok');
    await flushMicrotasks();
    worker.emitMessage('info depth 0 score cp 0\nbestmove (none)');

    await expect(search).rejects.toThrow('bestmove (none)');
  });

  it('serializes concurrent getBestMove calls without overlapping UCI go commands', async () => {
    const worker = new MockWorker();
    const adapter = new StockfishWorkerAdapter(() => worker as unknown as Worker);

    const p1 = adapter.getBestMove(START_FEN, 'easy');
    const p2 = adapter.getBestMove(START_FEN, 'hard');
    await flushMicrotasks();

    worker.emitMessage('uciok');
    worker.emitMessage('readyok');
    await flushMicrotasks();

    expect(worker.postedMessages).toEqual([
      'uci',
      'isready',
      'setoption name Skill Level value 2',
      `position fen ${START_FEN}`,
      'go depth 4 movetime 250',
    ]);

    worker.emitMessage('bestmove e2e4');
    await expect(p1).resolves.toEqual(Move.fromUci('e2e4'));
    await flushMicrotasks();

    expect(worker.postedMessages).toEqual([
      'uci',
      'isready',
      'setoption name Skill Level value 2',
      `position fen ${START_FEN}`,
      'go depth 4 movetime 250',
      'setoption name Skill Level value 20',
      `position fen ${START_FEN}`,
      'go depth 16 movetime 1400',
    ]);

    worker.emitMessage('bestmove c2c4');
    await expect(p2).resolves.toEqual(Move.fromUci('c2c4'));
  });

  it('rejects immediately on a pre-aborted AbortSignal without spawning a worker', async () => {
    const factory = vi.fn(() => new MockWorker() as unknown as Worker);
    const adapter = new StockfishWorkerAdapter(factory);
    const controller = new AbortController();
    controller.abort();

    await expect(
      adapter.getBestMove(START_FEN, 'easy', controller.signal),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(factory).not.toHaveBeenCalled();
  });

  it('rejects a queued search immediately on abort without blocking subsequent searches', async () => {
    const worker = new MockWorker();
    const adapter = new StockfishWorkerAdapter(() => worker as unknown as Worker);

    const c2 = new AbortController();
    const p1 = adapter.getBestMove(START_FEN, 'easy');
    const p2 = adapter.getBestMove(START_FEN, 'medium', c2.signal);
    const p3 = adapter.getBestMove(START_FEN, 'hard');
    await flushMicrotasks();

    worker.emitMessage('uciok');
    worker.emitMessage('readyok');
    await flushMicrotasks();

    c2.abort();
    await expect(p2).rejects.toMatchObject({ name: 'AbortError' });

    // Search 1 is still active; search 3 must not start yet
    expect(worker.postedMessages.filter((m) => m.startsWith('go '))).toHaveLength(1);

    worker.emitMessage('bestmove e2e4');
    await expect(p1).resolves.toEqual(Move.fromUci('e2e4'));
    await flushMicrotasks();

    // Search 2 was skipped; search 3 is now active
    expect(worker.postedMessages.filter((m) => m.startsWith('go '))).toEqual([
      'go depth 4 movetime 250',
      'go depth 16 movetime 1400',
    ]);

    worker.emitMessage('bestmove g1f3');
    await expect(p3).resolves.toEqual(Move.fromUci('g1f3'));
  });

  it('rejects immediately when aborted during UCI handshake while keeping worker usable for later calls', async () => {
    const worker = new MockWorker();
    const adapter = new StockfishWorkerAdapter(() => worker as unknown as Worker);

    const c1 = new AbortController();
    const p1 = adapter.getBestMove(START_FEN, 'easy', c1.signal);
    await flushMicrotasks();

    c1.abort();
    await expect(p1).rejects.toMatchObject({ name: 'AbortError' });

    const p2 = adapter.getBestMove(START_FEN, 'medium');
    await flushMicrotasks();

    worker.emitMessage('uciok');
    worker.emitMessage('readyok');
    await flushMicrotasks();

    worker.emitMessage('bestmove d2d4');
    await expect(p2).resolves.toEqual(Move.fromUci('d2d4'));
  });

  it('sends stop, rejects caller immediately, and drains stale bestmove before starting next search', async () => {
    const worker = new MockWorker();
    const adapter = new StockfishWorkerAdapter(() => worker as unknown as Worker);

    const c1 = new AbortController();
    const p1 = adapter.getBestMove(START_FEN, 'hard', c1.signal);
    await flushMicrotasks();
    worker.emitMessage('uciok');
    worker.emitMessage('readyok');
    await flushMicrotasks();

    c1.abort();
    await expect(p1).rejects.toMatchObject({ name: 'AbortError' });
    expect(worker.postedMessages.at(-1)).toBe('stop');

    const p2 = adapter.getBestMove(START_FEN, 'easy');
    await flushMicrotasks();

    // Second search MUST wait for stale bestmove from aborted search 1
    expect(worker.postedMessages.filter((m) => m.startsWith('go '))).toHaveLength(1);

    // Stockfish emits stale bestmove from aborted search 1 -> discarded
    worker.emitMessage('bestmove a2a3');
    await flushMicrotasks();

    // Now second search posts its commands
    expect(worker.postedMessages.filter((m) => m.startsWith('go '))).toEqual([
      'go depth 16 movetime 1400',
      'go depth 4 movetime 250',
    ]);

    worker.emitMessage('bestmove e7e5');
    await expect(p2).resolves.toEqual(Move.fromUci('e7e5'));
  });

  it('recovers after worker.onerror and worker.onmessageerror by spawning a new worker', async () => {
    const workers: MockWorker[] = [];
    const adapter = new StockfishWorkerAdapter(() => {
      const worker = new MockWorker();
      workers.push(worker);
      return worker as unknown as Worker;
    });

    const p1 = adapter.getBestMove(START_FEN, 'easy');
    await flushMicrotasks();
    workers[0].emitError('WASM failed');
    await expect(p1).rejects.toThrow('WASM failed');
    expect(workers[0].terminateCalls).toBe(1);

    const p2 = adapter.getBestMove(START_FEN, 'easy');
    await flushMicrotasks();
    workers[1].emitMessage('uciok');
    workers[1].emitMessage('readyok');
    await flushMicrotasks();
    workers[1].emitMessageError();
    await expect(p2).rejects.toThrow('Stockfish worker message error');
    expect(workers[1].terminateCalls).toBe(1);

    const p3 = adapter.getBestMove(START_FEN, 'medium');
    await flushMicrotasks();
    workers[2].emitMessage('uciok');
    workers[2].emitMessage('readyok');
    await flushMicrotasks();
    workers[2].emitMessage('bestmove e2e4');
    await expect(p3).resolves.toEqual(Move.fromUci('e2e4'));
  });

  it('disposes idempotently with quit + terminate and allows fresh post-dispose searches', async () => {
    const workers: MockWorker[] = [];
    const adapter = new StockfishWorkerAdapter(() => {
      const worker = new MockWorker();
      workers.push(worker);
      return worker as unknown as Worker;
    });

    // Idempotent before initialization
    adapter.dispose();

    const p1 = adapter.getBestMove(START_FEN, 'easy');
    const p2 = adapter.getBestMove(START_FEN, 'hard');
    await flushMicrotasks();
    workers[0].emitMessage('uciok');
    workers[0].emitMessage('readyok');
    await flushMicrotasks();

    adapter.dispose();
    adapter.dispose();

    await expect(p1).rejects.toThrow('Stockfish worker disposed');
    await expect(p2).rejects.toThrow('Stockfish worker disposed');
    expect(workers[0].postedMessages).toContain('quit');
    expect(workers[0].terminateCalls).toBe(1);

    const p3 = adapter.getBestMove(START_FEN, 'easy');
    await flushMicrotasks();
    expect(workers).toHaveLength(2);
    workers[1].emitMessage('uciok');
    workers[1].emitMessage('readyok');
    await flushMicrotasks();
    workers[1].emitMessage('bestmove c2c4');
    await expect(p3).resolves.toEqual(Move.fromUci('c2c4'));
  });

  it('defaults to creating a classic Worker pointing to /stockfish/stockfish-19-lite-single.js', async () => {
    const mockWorker = new MockWorker();
    const workerCtor = vi.fn(function () {
      return mockWorker;
    });
    vi.stubGlobal('Worker', workerCtor);

    const adapter = new StockfishWorkerAdapter();
    const search = adapter.getBestMove(START_FEN, 'easy');
    await flushMicrotasks();

    expect(workerCtor).toHaveBeenCalledTimes(1);
    expect(workerCtor).toHaveBeenCalledWith('/stockfish/stockfish-19-lite-single.js');

    mockWorker.emitMessage('uciok');
    mockWorker.emitMessage('readyok');
    await flushMicrotasks();
    mockWorker.emitMessage('bestmove e2e4');

    await expect(search).resolves.toEqual(Move.fromUci('e2e4'));
  });

  it('rejects invalid AiDifficultyLevel without spawning a worker', async () => {
    const factory = vi.fn(() => new MockWorker() as unknown as Worker);
    const adapter = new StockfishWorkerAdapter(factory);

    await expect(
      adapter.getBestMove(START_FEN, 'invalid' as AiDifficultyLevel),
    ).rejects.toThrow('Invalid AI difficulty level');
    await expect(
      adapter.getBestMove(START_FEN, 'toString' as AiDifficultyLevel),
    ).rejects.toThrow('Invalid AI difficulty level');
    expect(factory).not.toHaveBeenCalled();
  });

  it('rejects in-flight and queued calls when disposed during UCI handshake and recovers cleanly', async () => {
    const workers: MockWorker[] = [];
    const adapter = new StockfishWorkerAdapter(() => {
      const worker = new MockWorker();
      workers.push(worker);
      return worker as unknown as Worker;
    });

    const p1 = adapter.getBestMove(START_FEN, 'easy');
    const p2 = adapter.getBestMove(START_FEN, 'medium');
    await flushMicrotasks();

    expect(workers).toHaveLength(1);
    expect(workers[0].postedMessages).toEqual(['uci']);

    adapter.dispose();

    await expect(p1).rejects.toThrow('Stockfish worker disposed');
    await expect(p2).rejects.toThrow('Stockfish worker disposed');
    expect(workers[0].postedMessages).toEqual(['uci', 'quit']);
    expect(workers[0].terminateCalls).toBe(1);

    const p3 = adapter.getBestMove(START_FEN, 'hard');
    await flushMicrotasks();
    expect(workers).toHaveLength(2);
    workers[1].emitMessage('uciok');
    workers[1].emitMessage('readyok');
    await flushMicrotasks();
    workers[1].emitMessage('bestmove e2e4');
    await expect(p3).resolves.toEqual(Move.fromUci('e2e4'));
  });
});
