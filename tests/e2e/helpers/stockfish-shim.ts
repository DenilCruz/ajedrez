import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Move, type AiDifficultyLevel } from '@chess-platform/shared-domain';
import type { AiEnginePort } from '@web/domain/ports/ai-engine.port';

export interface ScriptableWorkerOptions {
  bestMoveQueue?: string[];
  bestMoveDelayMs?: number;
  infoLinesBeforeBestMove?: string[];
  manualGoControl?: boolean;
  autoHandshake?: boolean;
  onGo?: (command: string, worker: ScriptableWorker) => void;
}

export class ScriptableWorker implements Worker {
  public readonly sentCommands: string[] = [];
  public terminated = false;
  public onmessage: ((this: Worker, ev: MessageEvent) => unknown) | null = null;
  public onmessageerror: ((this: Worker, ev: MessageEvent) => unknown) | null = null;
  public onerror: ((this: AbstractWorker, ev: ErrorEvent) => unknown) | null = null;

  private readonly bestMoveQueue: string[];
  private readonly bestMoveDelayMs: number;
  private readonly infoLinesBeforeBestMove: string[];
  private readonly manualGoControl: boolean;
  private readonly autoHandshake: boolean;
  private readonly onGo?: (command: string, worker: ScriptableWorker) => void;
  private readonly listeners = new Map<string, Set<EventListenerOrEventListenerObject>>();
  private readonly timers = new Set<ReturnType<typeof setTimeout>>();

  constructor(options: ScriptableWorkerOptions = {}) {
    this.bestMoveQueue = [...(options.bestMoveQueue ?? ['e7e5'])];
    this.bestMoveDelayMs = options.bestMoveDelayMs ?? 5;
    this.infoLinesBeforeBestMove = [...(options.infoLinesBeforeBestMove ?? [])];
    this.manualGoControl = options.manualGoControl ?? false;
    this.autoHandshake = options.autoHandshake ?? true;
    this.onGo = options.onGo;
  }

  public postMessage(message: unknown): void {
    if (this.terminated) {
      throw new Error('Cannot postMessage to terminated worker');
    }
    const cmd = String(message);
    this.sentCommands.push(cmd);

    if (this.autoHandshake && cmd === 'uci') {
      this.schedule(() => {
        this.emitMessage('id name Stockfish 19 E2E');
        this.emitMessage('uciok');
      }, 1);
      return;
    }

    if (this.autoHandshake && cmd === 'isready') {
      this.schedule(() => {
        this.emitMessage('readyok');
      }, 1);
      return;
    }

    if (cmd.startsWith('go ')) {
      this.onGo?.(cmd, this);
      if (this.manualGoControl) {
        return;
      }
      const nextBestMove = this.bestMoveQueue.shift() ?? 'e7e5';
      this.schedule(() => {
        for (const info of this.infoLinesBeforeBestMove) {
          this.emitMessage(info);
        }
        this.emitMessage(`bestmove ${nextBestMove}`);
      }, this.bestMoveDelayMs);
    }
  }

  public emitMessage(line: string): void {
    if (this.terminated) {
      return;
    }
    const event = { data: line } as MessageEvent<string>;
    this.onmessage?.call(this, event);
    const set = this.listeners.get('message');
    if (set) {
      for (const listener of set) {
        if (typeof listener === 'function') {
          listener.call(this, event as unknown as Event);
        } else {
          listener.handleEvent(event as unknown as Event);
        }
      }
    }
  }

  public triggerError(message = 'Simulated worker failure'): void {
    const event = { message } as ErrorEvent;
    this.onerror?.call(this, event);
    const set = this.listeners.get('error');
    if (set) {
      for (const listener of set) {
        if (typeof listener === 'function') {
          listener.call(this, event as unknown as Event);
        } else {
          listener.handleEvent(event as unknown as Event);
        }
      }
    }
  }

  public terminate(): void {
    this.terminated = true;
    for (const timer of this.timers) {
      clearTimeout(timer);
    }
    this.timers.clear();
  }

  public addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject | null,
  ): void {
    if (!listener) return;
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(listener);
  }

  public removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject | null,
  ): void {
    if (!listener) return;
    this.listeners.get(type)?.delete(listener);
  }

  public dispatchEvent(): boolean {
    return true;
  }

  private schedule(fn: () => void, ms: number): void {
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      fn();
    }, ms);
    this.timers.add(timer);
  }
}

export function createScriptableWorkerFactory(options: ScriptableWorkerOptions = {}): {
  factory: () => Worker;
  workers: ScriptableWorker[];
} {
  const workers: ScriptableWorker[] = [];
  const factory = (): Worker => {
    const worker = new ScriptableWorker(options);
    workers.push(worker);
    return worker;
  };
  return { factory, workers };
}

export interface StubAiCall {
  fen: string;
  difficulty: AiDifficultyLevel;
  abortedAtCall: boolean;
}

export interface StubAiEngineOptions {
  moveUci?: string;
  delayMs?: number;
  errorToThrow?: Error;
}

export class StubAiEngine implements AiEnginePort {
  public readonly calls: StubAiCall[] = [];
  public disposed = false;

  private readonly moveUci: string;
  private readonly delayMs: number;
  private readonly errorToThrow?: Error;

  constructor(options: StubAiEngineOptions = {}) {
    this.moveUci = options.moveUci ?? 'e7e5';
    this.delayMs = options.delayMs ?? 0;
    this.errorToThrow = options.errorToThrow;
  }

  public async getBestMove(
    fen: string,
    difficulty: AiDifficultyLevel,
    signal?: AbortSignal,
  ): Promise<Move> {
    this.calls.push({
      fen,
      difficulty,
      abortedAtCall: Boolean(signal?.aborted),
    });

    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }

    if (this.delayMs > 0) {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          signal?.removeEventListener('abort', onAbort);
          resolve();
        }, this.delayMs);

        const onAbort = (): void => {
          clearTimeout(timer);
          reject(new DOMException('Aborted', 'AbortError'));
        };

        signal?.addEventListener('abort', onAbort, { once: true });
      });
    }

    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }

    if (this.errorToThrow) {
      throw this.errorToThrow;
    }

    return Move.fromUci(this.moveUci);
  }

  public dispose(): void {
    this.disposed = true;
  }
}

/**
 * Node-side Worker bridge wrapping the real installed `node_modules/stockfish`
 * engine (`findEngine('lite-single')`) over child_process stdio for genuine UCI E2E checks.
 */
export function createNodeStockfishWorker(): Worker & {
  sentCommands: string[];
  terminated: boolean;
} {
  const helperDir = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(helperDir, '../../..');
  const require = createRequire(path.join(repoRoot, 'package.json'));
  const stockfishPkg = require('stockfish') as {
    findEngine: (flavor: string) => string;
  };
  const enginePath = stockfishPkg.findEngine('lite-single');
  const child = spawn(process.execPath, [enginePath], {
    cwd: repoRoot,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  const sentCommands: string[] = [];
  let terminated = false;
  let stdoutBuffer = '';

  const worker = {
    sentCommands,
    get terminated() {
      return terminated;
    },
    onmessage: null as ((this: Worker, ev: MessageEvent) => unknown) | null,
    onmessageerror: null as ((this: Worker, ev: MessageEvent) => unknown) | null,
    onerror: null as ((this: AbstractWorker, ev: ErrorEvent) => unknown) | null,
    postMessage(message: unknown): void {
      if (terminated) return;
      const line = String(message);
      sentCommands.push(line);
      child.stdin.write(`${line}\n`);
    },
    terminate(): void {
      if (terminated) return;
      terminated = true;
      try {
        child.kill();
      } catch {
        // ignore kill error if already exited
      }
    },
    addEventListener(): void {},
    removeEventListener(): void {},
    dispatchEvent(): boolean {
      return true;
    },
  };

  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk: string) => {
    stdoutBuffer += chunk;
    const lines = stdoutBuffer.split(/\r?\n/);
    stdoutBuffer = lines.pop() ?? '';
    for (const rawLine of lines) {
      const trimmed = rawLine.trim();
      if (trimmed) {
        worker.onmessage?.call(
          worker as unknown as Worker,
          { data: trimmed } as MessageEvent<string>,
        );
      }
    }
  });

  child.on('error', (err) => {
    worker.onerror?.call(
      worker as unknown as Worker,
      { message: err.message } as ErrorEvent,
    );
  });

  return worker as unknown as Worker & {
    sentCommands: string[];
    terminated: boolean;
  };
}
