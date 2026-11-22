import { AiDifficulty, Move } from '@chess-platform/shared-domain';
import type { AiDifficultyLevel } from '@chess-platform/shared-domain';
import type { AiEnginePort } from '../../domain/ports/ai-engine.port';

const STOCKFISH_WORKER_URL = '/stockfish/stockfish-19-lite-single.js';
const BESTMOVE_REGEX = /^bestmove\s+(\S+)/;

interface PendingSearch {
  aborted: boolean;
  resolveBestMove: (uci: string) => void;
  rejectCaller: (error: Error) => void;
  resolveEngineIdle: () => void;
  cleanupAbort: () => void;
}

function createAbortError(): DOMException {
  return new DOMException('AI search aborted', 'AbortError');
}

function raceWithAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) {
    return promise;
  }
  if (signal.aborted) {
    return Promise.reject(createAbortError());
  }

  return new Promise<T>((resolve, reject) => {
    const onAbort = (): void => {
      reject(createAbortError());
    };

    signal.addEventListener('abort', onAbort, { once: true });

    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (err: unknown) => {
        signal.removeEventListener('abort', onAbort);
        reject(err);
      },
    );
  });
}

/**
 * Ejecuta Stockfish en un Web Worker clásico usando el protocolo UCI.
 */
export class StockfishWorkerAdapter implements AiEnginePort {
  private readonly workerFactory: () => Worker;
  private worker: Worker | null = null;
  private initPromise: Promise<void> | null = null;
  private initStage: 'idle' | 'uci' | 'ready' | 'done' = 'idle';
  private initResolve: (() => void) | null = null;
  private initReject: ((error: Error) => void) | null = null;
  private activeSearch: PendingSearch | null = null;
  private queue: Promise<void> = Promise.resolve();
  private generation = 0;

  constructor(
    workerFactory: () => Worker = () => new Worker(STOCKFISH_WORKER_URL),
  ) {
    this.workerFactory = workerFactory;
  }

  public async getBestMove(
    fen: string,
    difficulty: AiDifficultyLevel,
    signal?: AbortSignal,
  ): Promise<Move> {
    const { skillLevel, depth, movetimeMs } = AiDifficulty.create(difficulty).config;

    if (signal?.aborted) {
      throw createAbortError();
    }

    const callGen = this.generation;

    const uciToken = await new Promise<string>((resolveCaller, rejectCaller) => {
      let callerSettled = false;
      const safeResolveCaller = (token: string): void => {
        if (!callerSettled) {
          callerSettled = true;
          resolveCaller(token);
        }
      };
      const safeRejectCaller = (error: Error): void => {
        if (!callerSettled) {
          callerSettled = true;
          rejectCaller(error);
        }
      };

      const onPreSearchAbort = (): void => {
        safeRejectCaller(createAbortError());
      };

      if (signal) {
        signal.addEventListener('abort', onPreSearchAbort, { once: true });
      }

      const previousQueue = this.queue;
      let releaseQueue!: () => void;
      this.queue = new Promise<void>((resolve) => {
        releaseQueue = resolve;
      });

      void (async () => {
        try {
          await previousQueue;

          if (callGen !== this.generation) {
            safeRejectCaller(new Error('Stockfish worker disposed'));
            return;
          }
          if (signal?.aborted) {
            safeRejectCaller(createAbortError());
            return;
          }

          await raceWithAbort(this.ensureReady(), signal);

          if (callGen !== this.generation) {
            safeRejectCaller(new Error('Stockfish worker disposed'));
            return;
          }
          if (signal?.aborted) {
            safeRejectCaller(createAbortError());
            return;
          }

          const worker = this.worker;
          if (!worker) {
            safeRejectCaller(new Error('Stockfish worker is not available'));
            return;
          }

          if (signal) {
            signal.removeEventListener('abort', onPreSearchAbort);
          }

          let resolveEngineIdle!: () => void;
          const engineIdlePromise = new Promise<void>((resolve) => {
            resolveEngineIdle = resolve;
          });

          const search: PendingSearch = {
            aborted: false,
            resolveBestMove: safeResolveCaller,
            rejectCaller: safeRejectCaller,
            resolveEngineIdle,
            cleanupAbort: () => {},
          };

          if (signal) {
            const onActiveAbort = (): void => {
              if (search.aborted) {
                return;
              }
              search.aborted = true;
              try {
                this.worker?.postMessage('stop');
              } catch {
                // Ignore postMessage failures when worker is already terminated
              }
              search.rejectCaller(createAbortError());
            };
            signal.addEventListener('abort', onActiveAbort, { once: true });
            search.cleanupAbort = () => {
              signal.removeEventListener('abort', onActiveAbort);
            };
          }

          this.activeSearch = search;

          try {
            worker.postMessage(`setoption name Skill Level value ${skillLevel}`);
            worker.postMessage(`position fen ${fen}`);
            worker.postMessage(`go depth ${depth} movetime ${movetimeMs}`);
          } catch (err: unknown) {
            if (this.activeSearch === search) {
              this.activeSearch = null;
            }
            search.cleanupAbort();
            const error = err instanceof Error ? err : new Error(String(err));
            search.rejectCaller(error);
            search.resolveEngineIdle();
          }

          await engineIdlePromise;
        } catch (err: unknown) {
          const error = err instanceof Error ? err : new Error(String(err));
          safeRejectCaller(error);
        } finally {
          if (signal) {
            signal.removeEventListener('abort', onPreSearchAbort);
          }
          releaseQueue();
        }
      })();
    });

    if (uciToken === '(none)') {
      throw new Error('Stockfish returned no legal move (bestmove (none))');
    }

    return Move.fromUci(uciToken);
  }

  public dispose(): void {
    this.generation += 1;

    const disposedError = new Error('Stockfish worker disposed');

    if (this.initReject) {
      const rejectInit = this.initReject;
      this.initResolve = null;
      this.initReject = null;
      rejectInit(disposedError);
    }

    if (this.activeSearch) {
      const search = this.activeSearch;
      this.activeSearch = null;
      search.cleanupAbort();
      if (!search.aborted) {
        search.rejectCaller(disposedError);
      }
      search.resolveEngineIdle();
    }

    if (this.worker) {
      const worker = this.worker;
      this.worker = null;
      worker.onmessage = null;
      worker.onerror = null;
      worker.onmessageerror = null;
      try {
        worker.postMessage('quit');
      } catch {
        // Ignore postMessage failures during disposal
      }
      try {
        worker.terminate();
      } catch {
        // Ignore terminate failures during disposal
      }
    }

    this.initPromise = null;
    this.initStage = 'idle';
  }

  private ensureReady(): Promise<void> {
    if (this.worker && this.initPromise) {
      return this.initPromise;
    }

    const worker = this.workerFactory();
    this.worker = worker;
    this.initStage = 'uci';

    const initPromise = new Promise<void>((resolve, reject) => {
      this.initResolve = resolve;
      this.initReject = reject;
    });
    initPromise.catch(() => {
      // Prevent unhandled rejection when init fails after caller aborted
    });
    this.initPromise = initPromise;

    worker.onmessage = (event: MessageEvent<unknown>) => {
      this.handleMessage(event.data);
    };
    worker.onerror = (event: ErrorEvent) => {
      const message = event?.message || 'Stockfish worker error';
      this.failWorker(new Error(message));
    };
    worker.onmessageerror = () => {
      this.failWorker(new Error('Stockfish worker message error'));
    };

    try {
      worker.postMessage('uci');
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.failWorker(error);
    }

    return initPromise;
  }

  private handleMessage(data: unknown): void {
    const lines = String(data).split(/\r?\n/);

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) {
        continue;
      }

      if (this.initStage === 'uci' && line === 'uciok') {
        this.initStage = 'ready';
        try {
          this.worker?.postMessage('isready');
        } catch (err: unknown) {
          const error = err instanceof Error ? err : new Error(String(err));
          this.failWorker(error);
          return;
        }
        continue;
      }

      if (this.initStage === 'ready' && line === 'readyok') {
        this.initStage = 'done';
        const resolveInit = this.initResolve;
        this.initResolve = null;
        this.initReject = null;
        resolveInit?.();
        continue;
      }

      const bestMoveMatch = BESTMOVE_REGEX.exec(line);
      if (bestMoveMatch && this.activeSearch) {
        const search = this.activeSearch;
        this.activeSearch = null;
        search.cleanupAbort();
        if (!search.aborted) {
          search.resolveBestMove(bestMoveMatch[1]);
        }
        search.resolveEngineIdle();
      }
    }
  }

  private failWorker(error: Error): void {
    const worker = this.worker;
    this.worker = null;
    this.initPromise = null;
    this.initStage = 'idle';

    if (worker) {
      worker.onmessage = null;
      worker.onerror = null;
      worker.onmessageerror = null;
      try {
        worker.terminate();
      } catch {
        // Ignore terminate failures after worker error
      }
    }

    if (this.initReject) {
      const rejectInit = this.initReject;
      this.initResolve = null;
      this.initReject = null;
      rejectInit(error);
    }

    if (this.activeSearch) {
      const search = this.activeSearch;
      this.activeSearch = null;
      search.cleanupAbort();
      if (!search.aborted) {
        search.rejectCaller(error);
      }
      search.resolveEngineIdle();
    }
  }
}
