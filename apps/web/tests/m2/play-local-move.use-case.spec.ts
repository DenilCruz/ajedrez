import { describe, expect, it, vi } from 'vitest';
import {
  ChessJsAdapter,
  Match,
  MatchEndedEvent,
  Move,
  Player,
} from '@chess-platform/shared-domain';
import type { AiDifficultyLevel } from '@chess-platform/shared-domain';
import { PlayLocalMoveUseCase } from '../../src/application/use-cases/play-local-move.use-case';
import type { AiEnginePort } from '../../src/domain/ports/ai-engine.port';

function createMatch(initialFen?: string, withClock = false): Match {
  const timeControl = withClock ? { initialMs: 180_000, incrementMs: 2_000 } : null;
  return Match.create({
    id: 'match-test-1',
    rules: new ChessJsAdapter(),
    whitePlayer: new Player({
      id: 'white',
      name: 'Player',
      color: 'w',
      remainingTimeMs: timeControl ? timeControl.initialMs : null,
      isAi: false,
    }),
    blackPlayer: new Player({
      id: 'black',
      name: 'Stockfish',
      color: 'b',
      remainingTimeMs: timeControl ? timeControl.initialMs : null,
      isAi: true,
    }),
    timeControl,
    initialFen,
  });
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('PlayLocalMoveUseCase', () => {
  it('executes a normal player move synchronously and drains domain events', () => {
    const aiEngine: AiEnginePort = {
      getBestMove: vi.fn(),
      dispose: vi.fn(),
    };
    const useCase = new PlayLocalMoveUseCase(aiEngine);
    const match = createMatch();

    const result = useCase.executePlayerMove(match, Move.fromUci('e2e4'));

    expect(result.moveEvent.san).toBe('e4');
    expect(result.endEvent).toBeNull();
    expect(result.snapshot.turn).toBe('b');
    expect(result.snapshot.status).toBe('playing');
    expect(result.snapshot.history).toHaveLength(1);
    expect(match.pullDomainEvents()).toEqual([]);
  });

  it('handles pawn promotion moves cleanly', () => {
    const aiEngine: AiEnginePort = {
      getBestMove: vi.fn(),
      dispose: vi.fn(),
    };
    const useCase = new PlayLocalMoveUseCase(aiEngine);
    const match = createMatch('4k3/P7/8/8/8/8/8/4K3 w - - 0 1');

    const result = useCase.executePlayerMove(match, Move.fromUci('a7a8q'));

    expect(result.moveEvent.isPromotion).toBe(true);
    expect(result.moveEvent.san).toBe('a8=Q+');
    expect(result.moveEvent.move.promotion).toBe('q');
    expect(result.endEvent).toBeNull();
  });

  it('returns MatchEndedEvent on checkmate', () => {
    const aiEngine: AiEnginePort = {
      getBestMove: vi.fn(),
      dispose: vi.fn(),
    };
    const useCase = new PlayLocalMoveUseCase(aiEngine);
    const match = createMatch();

    useCase.executePlayerMove(match, Move.fromUci('f2f3'));
    useCase.executePlayerMove(match, Move.fromUci('e7e5'));
    useCase.executePlayerMove(match, Move.fromUci('g2g4'));
    const mateResult = useCase.executePlayerMove(match, Move.fromUci('d8h4'));

    expect(mateResult.snapshot.status).toBe('ended');
    expect(mateResult.snapshot.endReason).toBe('checkmate');
    expect(mateResult.snapshot.winner).toBe('b');
    expect(mateResult.endEvent).toBeInstanceOf(MatchEndedEvent);
    expect(mateResult.endEvent?.reason).toBe('checkmate');
    expect(mateResult.endEvent?.winner).toBe('b');
  });

  it('returns MatchEndedEvent on stalemate and insufficient material draws', () => {
    const aiEngine: AiEnginePort = {
      getBestMove: vi.fn(),
      dispose: vi.fn(),
    };
    const useCase = new PlayLocalMoveUseCase(aiEngine);

    const stalemateMatch = createMatch('7k/5Q2/5K2/8/8/8/8/8 w - - 0 1');
    const stalemateResult = useCase.executePlayerMove(stalemateMatch, Move.fromUci('f7g6'));
    expect(stalemateResult.snapshot.status).toBe('ended');
    expect(stalemateResult.endEvent?.reason).toBe('stalemate');
    expect(stalemateResult.endEvent?.winner).toBeNull();

    const insufficientMatch = createMatch('4k3/8/8/8/8/8/4r3/4K3 w - - 0 1');
    const insufficientResult = useCase.executePlayerMove(
      insufficientMatch,
      Move.fromUci('e1e2'),
    );
    expect(insufficientResult.snapshot.status).toBe('ended');
    expect(insufficientResult.endEvent?.reason).toBe('insufficient_material');
    expect(insufficientResult.endEvent?.winner).toBeNull();
  });

  it('throws on illegal moves or already-ended matches without mutating state', () => {
    const aiEngine: AiEnginePort = {
      getBestMove: vi.fn(),
      dispose: vi.fn(),
    };
    const useCase = new PlayLocalMoveUseCase(aiEngine);
    const match = createMatch();
    const initialFen = match.getFen();

    expect(() => useCase.executePlayerMove(match, Move.fromUci('e2e5'))).toThrow();
    expect(match.getFen()).toBe(initialFen);

    match.resign('w');
    expect(() => useCase.executePlayerMove(match, Move.fromUci('e2e4'))).toThrow();
    expect(match.getStatus()).toBe('ended');
  });

  it('returns the current MoveMadeEvent even if prior domain events were not drained', () => {
    const aiEngine: AiEnginePort = {
      getBestMove: vi.fn(),
      dispose: vi.fn(),
    };
    const useCase = new PlayLocalMoveUseCase(aiEngine);
    const match = createMatch();

    match.playMove(Move.fromUci('e2e4'));
    const result = useCase.executePlayerMove(match, Move.fromUci('e7e5'));

    expect(result.moveEvent.san).toBe('e5');
    expect(result.endEvent).toBeNull();
    expect(match.pullDomainEvents()).toEqual([]);
  });

  it('executes AI turn via AiEnginePort and applies the returned move', async () => {
    const getBestMove = vi.fn<AiEnginePort['getBestMove']>(async () => Move.fromUci('e7e5'));
    const aiEngine: AiEnginePort = {
      getBestMove,
      dispose: vi.fn(),
    };
    const useCase = new PlayLocalMoveUseCase(aiEngine);
    const match = createMatch();
    useCase.executePlayerMove(match, Move.fromUci('e2e4'));

    const fenBeforeAi = match.getFen();
    const controller = new AbortController();
    const difficulty: AiDifficultyLevel = 'medium';

    const result = await useCase.executeAiTurn(match, difficulty, controller.signal);

    expect(getBestMove).toHaveBeenCalledTimes(1);
    expect(getBestMove).toHaveBeenCalledWith(fenBeforeAi, 'medium', controller.signal);
    expect(result?.moveEvent.san).toBe('e5');
    expect(result?.snapshot.turn).toBe('w');
    expect(result?.endEvent).toBeNull();
  });

  it('returns null immediately without calling AI when signal is already aborted', async () => {
    const getBestMove = vi.fn<AiEnginePort['getBestMove']>();
    const aiEngine: AiEnginePort = {
      getBestMove,
      dispose: vi.fn(),
    };
    const useCase = new PlayLocalMoveUseCase(aiEngine);
    const match = createMatch();
    const controller = new AbortController();
    controller.abort();

    const result = await useCase.executeAiTurn(match, 'easy', controller.signal);

    expect(result).toBeNull();
    expect(getBestMove).not.toHaveBeenCalled();
  });

  it('returns null immediately without calling AI when match is already ended', async () => {
    const getBestMove = vi.fn<AiEnginePort['getBestMove']>();
    const aiEngine: AiEnginePort = {
      getBestMove,
      dispose: vi.fn(),
    };
    const useCase = new PlayLocalMoveUseCase(aiEngine);
    const match = createMatch();
    match.resign('w');

    const result = await useCase.executeAiTurn(match, 'hard');

    expect(result).toBeNull();
    expect(getBestMove).not.toHaveBeenCalled();
  });

  it('discards AI move if signal is aborted while AI search is in-flight', async () => {
    const deferred = createDeferred<Move>();
    const aiEngine: AiEnginePort = {
      getBestMove: vi.fn(() => deferred.promise),
      dispose: vi.fn(),
    };
    const useCase = new PlayLocalMoveUseCase(aiEngine);
    const match = createMatch();
    useCase.executePlayerMove(match, Move.fromUci('e2e4'));
    const fenBeforeAi = match.getFen();

    const controller = new AbortController();
    const turnPromise = useCase.executeAiTurn(match, 'hard', controller.signal);

    controller.abort();
    deferred.resolve(Move.fromUci('e7e5'));

    const result = await turnPromise;

    expect(result).toBeNull();
    expect(match.getFen()).toBe(fenBeforeAi);
    expect(match.getTurn()).toBe('b');
    expect(match.getSnapshot().history).toHaveLength(1);
  });

  it('discards AI move if match ends (resign or timeout) while AI search is in-flight', async () => {
    const deferred = createDeferred<Move>();
    const aiEngine: AiEnginePort = {
      getBestMove: vi.fn(() => deferred.promise),
      dispose: vi.fn(),
    };
    const useCase = new PlayLocalMoveUseCase(aiEngine);
    const match = createMatch(undefined, true);
    useCase.executePlayerMove(match, Move.fromUci('e2e4'));

    const turnPromise = useCase.executeAiTurn(match, 'medium');
    match.tickClock(185_000);
    expect(match.getStatus()).toBe('ended');
    expect(match.getSnapshot().endReason).toBe('timeout');

    deferred.resolve(Move.fromUci('e7e5'));
    const result = await turnPromise;

    expect(result).toBeNull();
    expect(match.getSnapshot().endReason).toBe('timeout');
    expect(match.getSnapshot().history).toHaveLength(1);
  });

  it('discards AI move if match position changes while AI search is in-flight without aborting signal', async () => {
    const deferred = createDeferred<Move>();
    const aiEngine: AiEnginePort = {
      getBestMove: vi.fn(() => deferred.promise),
      dispose: vi.fn(),
    };
    const useCase = new PlayLocalMoveUseCase(aiEngine);
    const match = createMatch();
    useCase.executePlayerMove(match, Move.fromUci('e2e4'));

    const turnPromise = useCase.executeAiTurn(match, 'medium');

    // Another move advances the match without aborting the AI signal
    useCase.executePlayerMove(match, Move.fromUci('c7c5'));
    const fenAfterExternalMove = match.getFen();

    deferred.resolve(Move.fromUci('e7e5'));
    const result = await turnPromise;

    expect(result).toBeNull();
    expect(match.getFen()).toBe(fenAfterExternalMove);
    expect(match.getTurn()).toBe('w');
    expect(match.getSnapshot().history).toHaveLength(2);
  });

  it('returns null when AI rejects with AbortError', async () => {
    const domAbort = new DOMException('Aborted', 'AbortError');
    const errAbort = Object.assign(new Error('Aborted'), { name: 'AbortError' });

    const aiEngine1: AiEnginePort = {
      getBestMove: vi.fn(async () => {
        throw domAbort;
      }),
      dispose: vi.fn(),
    };
    const aiEngine2: AiEnginePort = {
      getBestMove: vi.fn(async () => {
        throw errAbort;
      }),
      dispose: vi.fn(),
    };

    const match = createMatch();
    const initialFen = match.getFen();

    const controller1 = new AbortController();
    controller1.abort();
    await expect(
      new PlayLocalMoveUseCase(aiEngine1).executeAiTurn(match, 'easy', controller1.signal),
    ).resolves.toBeNull();

    await expect(
      new PlayLocalMoveUseCase(aiEngine2).executeAiTurn(match, 'easy'),
    ).resolves.toBeNull();

    expect(match.getFen()).toBe(initialFen);
  });

  it('rethrows non-abort engine errors', async () => {
    const aiEngine: AiEnginePort = {
      getBestMove: vi.fn(async () => {
        throw new Error('Engine crashed');
      }),
      dispose: vi.fn(),
    };
    const useCase = new PlayLocalMoveUseCase(aiEngine);
    const match = createMatch();

    await expect(useCase.executeAiTurn(match, 'hard')).rejects.toThrow('Engine crashed');
  });
});
