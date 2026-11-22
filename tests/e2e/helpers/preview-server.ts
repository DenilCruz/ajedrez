import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { preview, type PreviewServer } from 'vite';
import type { CoordMove } from './fixtures.ts';

const helpersDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(helpersDir, '../../..');
const webRoot = path.join(repoRoot, 'apps/web');
const driverScriptPath = path.join(helpersDir, 'browser_driver.py');

export interface PreviewContextOptions {
  viewport?: { width: number; height: number };
  installClock?: boolean;
  initScript?: string;
  seedLocalStorage?: Record<string, string>;
  waitForBoard?: boolean;
  timeoutMs?: number;
}

export interface BrowserBoardGeometry {
  a1: { x: number; y: number; width: number; height: number } | null;
  a8: { x: number; y: number; width: number; height: number } | null;
  h1: { x: number; y: number; width: number; height: number } | null;
  h8: { x: number; y: number; width: number; height: number } | null;
  board: { x: number; y: number; width: number; height: number } | null;
}

export interface BrowserClockSide {
  text: string;
  timeText: string;
  active: boolean;
  lowTime: boolean;
}

export interface BrowserClocksState {
  found: boolean;
  white?: BrowserClockSide | null;
  black?: BrowserClockSide | null;
  fullText?: string;
}

export interface BrowserMoveHistoryState {
  found: boolean;
  text: string;
  items: string[];
  scrollHeight: number;
  clientHeight: number;
}

export interface BrowserStatusBannerState {
  statusTexts: string[];
  isAiThinking: boolean;
  gameOverText: string | null;
  hasFlipButton: boolean;
  resignDisabled: boolean | null;
  bodyHasCheck: boolean;
}

export interface BrowserResponsiveCheck {
  innerWidth: number;
  scrollWidth: number;
  noHorizontalOverflow: boolean;
  boardVisible: boolean;
  clocksVisible: boolean;
  historyVisible: boolean;
  themesVisible: boolean;
  hasNewGame: boolean;
  hasRestart: boolean;
}

export interface SetupModalConfigInput {
  mode?: 'vs IA' | '2 Jugadores';
  difficulty?: 'Fácil' | 'Medio' | 'Difícil';
  color?: 'Blancas' | 'Negras';
  timePreset?: 'Sin reloj' | '3+2 Blitz' | '10+0 Rápida' | 'Personalizado';
  action?: 'start' | 'cancel' | 'close' | 'escape' | 'backdrop' | 'none';
}

export class PreviewBrowserHarness {
  public readonly baseUrl: string;
  private readonly server: PreviewServer;
  private readonly pyProc: ChildProcessWithoutNullStreams;
  private readonly rl: readline.Interface;
  private readonly pending = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (reason: Error) => void }
  >();
  private readonly stderrChunks: string[] = [];
  private nextId = 1;
  private closed = false;

  private constructor(
    server: PreviewServer,
    baseUrl: string,
    pyProc: ChildProcessWithoutNullStreams,
  ) {
    this.server = server;
    this.baseUrl = baseUrl;
    this.pyProc = pyProc;
    this.rl = readline.createInterface({ input: pyProc.stdout });

    this.rl.on('line', (line) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      let msg: { id?: number; ok?: boolean; result?: unknown; error?: string };
      try {
        msg = JSON.parse(trimmed) as {
          id?: number;
          ok?: boolean;
          result?: unknown;
          error?: string;
        };
      } catch {
        return;
      }
      const id = msg.id;
      if (typeof id !== 'number') return;
      const waiter = this.pending.get(id);
      if (!waiter) return;
      this.pending.delete(id);
      if (msg.ok) {
        waiter.resolve(msg.result);
      } else {
        waiter.reject(new Error(msg.error ?? 'Unknown browser_driver.py error'));
      }
    });

    pyProc.stderr.setEncoding('utf8');
    pyProc.stderr.on('data', (chunk: string) => {
      this.stderrChunks.push(chunk);
    });

    pyProc.on('exit', (code, signal) => {
      const errMsg = `browser_driver.py exited unexpectedly (code=${String(code)}, signal=${String(signal)}). Stderr: ${this.stderrChunks.join('')}`;
      for (const [, waiter] of this.pending) {
        waiter.reject(new Error(errMsg));
      }
      this.pending.clear();
    });
  }

  public static async start(): Promise<PreviewBrowserHarness> {
    const server = await preview({
      configFile: path.join(webRoot, 'vite.config.ts'),
      root: webRoot,
      preview: {
        host: '127.0.0.1',
        port: 0,
        strictPort: false,
      },
    });

    const resolvedUrl = server.resolvedUrls?.local[0];
    const address = server.httpServer.address();
    const baseUrl =
      resolvedUrl ??
      (address && typeof address === 'object'
        ? `http://127.0.0.1:${address.port}/`
        : 'http://127.0.0.1:4173/');

    const pythonExe = process.env.PYTHON_EXE || 'python';
    const pyProc = spawn(pythonExe, ['-u', driverScriptPath], {
      cwd: repoRoot,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const harness = new PreviewBrowserHarness(server, baseUrl, pyProc);
    try {
      await harness.send('ping', {});
    } catch (err) {
      await harness.close();
      throw err;
    }
    return harness;
  }

  public async send<T = Record<string, unknown>>(
    cmd: string,
    params: Record<string, unknown> = {},
  ): Promise<T> {
    if (this.closed) {
      throw new Error('PreviewBrowserHarness is already closed');
    }
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
      });
      this.pyProc.stdin.write(`${JSON.stringify({ id, cmd, params })}\n`);
    });
  }

  public async newContext(options: PreviewContextOptions = {}): Promise<{
    ok: boolean;
    status?: number;
    title?: string;
    pageErrors: string[];
    consoleErrors: string[];
  }> {
    return this.send('new_context', {
      url: this.baseUrl,
      viewport: options.viewport,
      install_clock: options.installClock ?? false,
      init_script: options.initScript,
      seed_local_storage: options.seedLocalStorage,
      wait_for_board: options.waitForBoard ?? true,
      timeout_ms: options.timeoutMs ?? 4000,
    });
  }

  public async closeContext(): Promise<void> {
    if (!this.closed) {
      await this.send('close_context', {});
    }
  }

  public async withPage<T>(
    options: PreviewContextOptions,
    fn: () => Promise<T>,
  ): Promise<T> {
    await this.newContext(options);
    try {
      return await fn();
    } finally {
      await this.closeContext();
    }
  }

  public async reload(waitForBoard = true): Promise<{
    title: string;
    pageErrors: string[];
    consoleErrors: string[];
  }> {
    return this.send('reload', { wait_for_board: waitForBoard });
  }

  public async evaluate<T = unknown>(expression: string): Promise<T> {
    const res = await this.send<{ result: T }>('evaluate', { expression });
    return res.result;
  }

  public async getErrors(): Promise<{ pageErrors: string[]; consoleErrors: string[] }> {
    return this.send('get_errors', {});
  }

  public async clickSquare(square: string): Promise<void> {
    await this.send('click_square', { square });
  }

  public async dragSquare(from: string, to: string): Promise<void> {
    await this.send('drag_square', { from, to });
  }

  public async playMoves(
    moves: readonly CoordMove[],
    method: 'click' | 'drag' = 'click',
  ): Promise<void> {
    await this.send('play_moves', { moves, method });
  }

  public async getPiece(square: string): Promise<string | null> {
    const res = await this.send<{ piece: string | null }>('get_piece', { square });
    return res.piece;
  }

  public async waitForPiece(
    square: string,
    piece: string | null,
    timeoutMs = 4000,
  ): Promise<void> {
    await this.send('wait_for_piece', { square, piece, timeout_ms: timeoutMs });
  }

  public async getBoardSnapshot(): Promise<{
    squareCount: number;
    pieceCount: number;
    pieces: Record<string, string>;
  }> {
    return this.send('get_board_snapshot', {});
  }

  public async getBoardGeometry(): Promise<BrowserBoardGeometry> {
    return this.send('get_board_geometry', {});
  }

  public async getSquareColors(
    squares: string[] = ['a1', 'a2'],
  ): Promise<Record<string, string | null>> {
    const res = await this.send<{ colors: Record<string, string | null> }>(
      'get_square_colors',
      { squares },
    );
    return res.colors;
  }

  public async getSquareHighlightStyle(square: string): Promise<{
    outerBackgroundColor: string;
    innerBackgroundColor: string | null;
    innerBackgroundImage: string | null;
    innerBoxShadow: string | null;
    innerInlineStyle: string;
  } | null> {
    const res = await this.send<{
      style: {
        outerBackgroundColor: string;
        innerBackgroundColor: string | null;
        innerBackgroundImage: string | null;
        innerBoxShadow: string | null;
        innerInlineStyle: string;
      } | null;
    }>('get_square_highlight_style', { square });
    return res.style;
  }

  public async clickButton(name: string, inDialog = false): Promise<void> {
    await this.send('click_button', { name, in_dialog: inDialog, first: true });
  }

  public async selectTheme(label: string): Promise<void> {
    await this.send('select_theme', { label });
  }

  public async getThemeState(): Promise<{
    buttonCount: number;
    buttonLabels: string[];
    activeButtons: string[];
    storedTheme: string | null;
  }> {
    return this.send('get_theme_state', {});
  }

  public async openSetupModal(): Promise<void> {
    await this.send('open_setup_modal', {});
  }

  public async configureSetupModal(config: SetupModalConfigInput): Promise<void> {
    await this.send('configure_setup_modal', {
      mode: config.mode,
      difficulty: config.difficulty,
      color: config.color,
      time_preset: config.timePreset,
      action: config.action ?? 'start',
    });
  }

  public async startMatchViaModal(config: Omit<SetupModalConfigInput, 'action'>): Promise<void> {
    await this.openSetupModal();
    await this.configureSetupModal({ ...config, action: 'start' });
  }

  public async getDialogState(): Promise<{
    isOpen: boolean;
    text: string;
    buttons: string[];
  }> {
    return this.send('get_dialog_state', {});
  }

  public async selectPromotion(label: 'Dama' | 'Torre' | 'Alfil' | 'Caballo'): Promise<void> {
    await this.send('select_promotion', { label });
  }

  public async cancelPromotion(): Promise<void> {
    await this.send('cancel_promotion', {});
  }

  public async getMoveHistoryText(): Promise<BrowserMoveHistoryState> {
    return this.send('get_move_history_text', {});
  }

  public async getClocks(): Promise<BrowserClocksState> {
    return this.send('get_clocks', {});
  }

  public async getStatusBanner(): Promise<BrowserStatusBannerState> {
    return this.send('get_status_banner', {});
  }

  public async checkResponsiveNoOverflow(
    width: number,
    height: number,
  ): Promise<BrowserResponsiveCheck> {
    return this.send('check_responsive_no_overflow', { width, height });
  }

  public async evaluateStorage(key: string, value?: string): Promise<string | null> {
    if (value !== undefined) {
      await this.send('evaluate_storage', { key, value });
      return value;
    }
    const res = await this.send<{ value: string | null }>('evaluate_storage', { key });
    return res.value;
  }

  public async waitMs(ms: number): Promise<void> {
    await this.send('wait_ms', { ms });
  }

  public async waitForAiTurnComplete(timeoutMs = 10_000): Promise<void> {
    await this.send('wait_for_ai_turn_complete', { timeout_ms: timeoutMs });
  }

  public async clockFastForward(ms: number): Promise<void> {
    await this.send('clock_fast_forward', { ms });
  }

  public async clockRunFor(ms: number): Promise<void> {
    await this.send('clock_run_for', { ms });
  }

  public async pressKey(key: string): Promise<void> {
    await this.send('press_key', { key });
  }

  public async close(): Promise<void> {
    if (this.closed) return;
    try {
      await this.send('shutdown', {});
    } catch {
      this.pyProc.kill();
    } finally {
      this.closed = true;
      this.rl.close();
      await this.server.close();
    }
  }
}
