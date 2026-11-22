import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { AI_DIFFICULTIES } from '@chess-platform/shared-domain';
import type {
  AiDifficultyLevel,
  PieceColor,
  TimeControlConfig,
} from '@chess-platform/shared-domain';

export type GameMode = 'vs-ai' | 'local-2p';

export interface GameSetupConfig {
  mode: GameMode;
  difficulty: AiDifficultyLevel;
  playerColor: PieceColor;
  timeControl: TimeControlConfig | null;
}

export interface GameSetupModalProps {
  isOpen: boolean;
  initialConfig: GameSetupConfig;
  onClose: () => void;
  onStartMatch: (config: GameSetupConfig) => void;
}

type TimePresetId = 'none' | 'blitz-3-2' | 'rapid-10-0' | 'custom';

interface TimePresetOption {
  id: TimePresetId;
  label: string;
  description: string;
  config: TimeControlConfig | null;
}

const TIME_PRESETS: ReadonlyArray<TimePresetOption> = [
  {
    id: 'none',
    label: 'Sin reloj',
    description: 'Partida sin límite de tiempo',
    config: null,
  },
  {
    id: 'blitz-3-2',
    label: '3+2 Blitz',
    description: '3 min + 2 s por jugada',
    config: { initialMs: 180_000, incrementMs: 2_000 },
  },
  {
    id: 'rapid-10-0',
    label: '10+0 Rápida',
    description: '10 min sin incremento',
    config: { initialMs: 600_000, incrementMs: 0 },
  },
  {
    id: 'custom',
    label: 'Personalizado',
    description: 'Configura minutos e incremento',
    config: { initialMs: 300_000, incrementMs: 0 },
  },
];

const DIFFICULTY_ORDER: ReadonlyArray<AiDifficultyLevel> = [
  'easy',
  'medium',
  'hard',
];

function clampInt(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function resolvePresetFromConfig(tc: TimeControlConfig | null): {
  preset: TimePresetId;
  customMinutes: number;
  customIncrementSec: number;
} {
  if (tc === null) {
    return { preset: 'none', customMinutes: 5, customIncrementSec: 0 };
  }
  if (tc.initialMs === 180_000 && tc.incrementMs === 2_000) {
    return { preset: 'blitz-3-2', customMinutes: 3, customIncrementSec: 2 };
  }
  if (tc.initialMs === 600_000 && tc.incrementMs === 0) {
    return { preset: 'rapid-10-0', customMinutes: 10, customIncrementSec: 0 };
  }
  return {
    preset: 'custom',
    customMinutes: clampInt(tc.initialMs / 60_000, 1, 180, 5),
    customIncrementSec: clampInt(tc.incrementMs / 1_000, 0, 60, 0),
  };
}

interface GameSetupDialogProps {
  initialConfig: GameSetupConfig;
  onClose: () => void;
  onStartMatch: (config: GameSetupConfig) => void;
}

function GameSetupDialog({
  initialConfig,
  onClose,
  onStartMatch,
}: GameSetupDialogProps) {
  const initialTimeState = resolvePresetFromConfig(initialConfig.timeControl);

  const [mode, setMode] = useState<GameMode>(initialConfig.mode);
  const [difficulty, setDifficulty] = useState<AiDifficultyLevel>(
    initialConfig.difficulty,
  );
  const [playerColor, setPlayerColor] = useState<PieceColor>(
    initialConfig.playerColor,
  );
  const [timePreset, setTimePreset] = useState<TimePresetId>(
    initialTimeState.preset,
  );
  const [customMinutesInput, setCustomMinutesInput] = useState<string>(
    String(initialTimeState.customMinutes),
  );
  const [customIncrementInput, setCustomIncrementInput] = useState<string>(
    String(initialTimeState.customIncrementSec),
  );

  const adjustMinutes = (delta: number) => {
    const current = clampInt(Number(customMinutesInput), 1, 180, 5);
    setCustomMinutesInput(String(clampInt(current + delta, 1, 180, 5)));
  };

  const adjustIncrement = (delta: number) => {
    const current = clampInt(Number(customIncrementInput), 0, 60, 0);
    setCustomIncrementInput(String(clampInt(current + delta, 0, 60, 0)));
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    let resolvedTimeControl: TimeControlConfig | null = null;
    if (timePreset === 'blitz-3-2') {
      resolvedTimeControl = { initialMs: 180_000, incrementMs: 2_000 };
    } else if (timePreset === 'rapid-10-0') {
      resolvedTimeControl = { initialMs: 600_000, incrementMs: 0 };
    } else if (timePreset === 'custom') {
      const parsedMinutes =
        customMinutesInput.trim() === '' ? 5 : Number(customMinutesInput);
      const parsedIncrement =
        customIncrementInput.trim() === '' ? 0 : Number(customIncrementInput);
      const safeMinutes = clampInt(parsedMinutes, 1, 180, 5);
      const safeIncrement = clampInt(parsedIncrement, 0, 60, 0);
      resolvedTimeControl = {
        initialMs: safeMinutes * 60_000,
        incrementMs: safeIncrement * 1_000,
      };
    }

    onStartMatch({
      mode,
      difficulty,
      playerColor,
      timeControl: resolvedTimeControl,
    });
  };

  const selectedCardClass =
    'border-transparent bg-gradient-to-b from-[#2a1d15]/90 to-[#19120d]/80 text-white ring-1 ring-[#b58863]/20 hover:from-[#322319]/90';
  const inactiveCardClass =
    'border-transparent bg-zinc-900/50 text-zinc-200 hover:bg-zinc-800/60 hover:text-white';

  return (
    <div
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/65 p-4 backdrop-blur-md sm:p-6"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="game-setup-title"
        className="relative my-auto w-full max-w-[620px] rounded-2xl border border-zinc-800/80 bg-[#121317]/95 p-5 text-zinc-200 shadow-2xl backdrop-blur-xl transition-all duration-300 sm:p-6"
      >
        <div className="mb-4 flex items-start justify-between border-b border-zinc-800/50 pb-3">
          <div>
            <div className="mb-1 flex items-center gap-2">
              <span className="font-mono text-[10px] tracking-[0.25em] text-zinc-400 uppercase">
                GAMBIT • Configuración
              </span>
            </div>
            <h2
              id="game-setup-title"
              className="font-editorial flex items-center gap-2.5 text-2xl font-medium tracking-tight text-white"
            >
              Nueva partida
            </h2>
            <p className="mt-0.5 text-xs text-zinc-400 sm:text-sm">
              Configura el modo de juego y el control de tiempo
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar configuración"
            className="group rounded-xl border border-zinc-800/80 bg-zinc-900/60 p-2 text-zinc-400 transition duration-200 hover:bg-zinc-800/80 hover:text-white"
          >
            <svg
              aria-hidden="true"
              className="h-5 w-5 transition-transform duration-200 group-hover:rotate-90"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.75}
              viewBox="0 0 24 24"
            >
              <path
                d="M6 18L18 6M6 6l12 12"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <span className="mb-2 block font-mono text-[11px] font-medium tracking-[0.16em] text-zinc-400 uppercase">
              Modo de juego
            </span>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <button
                type="button"
                data-mode="vs-ai"
                aria-pressed={mode === 'vs-ai'}
                onClick={() => setMode('vs-ai')}
                className={`group relative flex flex-col rounded-xl border p-3 text-left transition-all duration-200 ${
                  mode === 'vs-ai' ? selectedCardClass : inactiveCardClass
                }`}
              >
                <span className="mb-0.5 block text-sm font-semibold tracking-wide sm:text-base">
                  vs IA
                </span>
                <span
                  className={`text-xs font-normal ${
                    mode === 'vs-ai' ? 'text-[#d8b897]' : 'text-zinc-400'
                  }`}
                >
                  Juega contra Stockfish
                </span>
              </button>

              <button
                type="button"
                data-mode="local-2p"
                aria-pressed={mode === 'local-2p'}
                onClick={() => setMode('local-2p')}
                className={`group relative flex flex-col rounded-xl border p-3 text-left transition-all duration-200 ${
                  mode === 'local-2p' ? selectedCardClass : inactiveCardClass
                }`}
              >
                <span className="mb-0.5 block text-sm font-semibold tracking-wide sm:text-base">
                  2 Jugadores
                </span>
                <span
                  className={`text-xs font-normal ${
                    mode === 'local-2p' ? 'text-[#d8b897]' : 'text-zinc-400'
                  }`}
                >
                  Mismo dispositivo
                </span>
              </button>
            </div>
          </div>

          {mode === 'vs-ai' ? (
            <>
              <div>
                <span className="mb-2 block font-mono text-[11px] font-medium tracking-[0.16em] text-zinc-400 uppercase">
                  Dificultad de la IA
                </span>
                <div className="grid grid-cols-3 gap-2.5">
                  {DIFFICULTY_ORDER.map((level) => {
                    const diffConfig = AI_DIFFICULTIES[level];
                    const isSelected = difficulty === level;
                    return (
                      <button
                        key={level}
                        type="button"
                        data-difficulty={level}
                        aria-pressed={isSelected}
                        onClick={() => setDifficulty(level)}
                        className={`rounded-xl border px-3 py-2 text-center text-sm transition-all duration-200 ${
                          isSelected
                            ? `${selectedCardClass} font-semibold`
                            : `${inactiveCardClass} font-medium text-zinc-300`
                        }`}
                      >
                        {diffConfig.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <span className="mb-2 block font-mono text-[11px] font-medium tracking-[0.16em] text-zinc-400 uppercase">
                  Tu color
                </span>
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    data-player-color="w"
                    aria-pressed={playerColor === 'w'}
                    onClick={() => setPlayerColor('w')}
                    className={`flex items-center justify-center gap-2.5 rounded-xl border px-4 py-2.5 text-sm font-medium tracking-wide transition-all duration-200 ${
                      playerColor === 'w' ? selectedCardClass : inactiveCardClass
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className="inline-block h-4 w-4 rounded-sm border border-white bg-white shadow-sm"
                    />
                    Blancas
                  </button>

                  <button
                    type="button"
                    data-player-color="b"
                    aria-pressed={playerColor === 'b'}
                    onClick={() => setPlayerColor('b')}
                    className={`group flex items-center justify-center gap-2.5 rounded-xl border px-4 py-2.5 text-sm font-medium tracking-wide transition-all duration-200 ${
                      playerColor === 'b' ? selectedCardClass : inactiveCardClass
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className="inline-block h-4 w-4 rounded-sm border border-zinc-600 bg-zinc-900 transition-colors group-hover:border-zinc-400"
                    />
                    Negras
                  </button>
                </div>
              </div>
            </>
          ) : (
            <p className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-3 text-xs text-zinc-300">
              Las Blancas realizan la primera jugada. Puedes rotar el tablero en
              cualquier momento desde la vista de partida.
            </p>
          )}

          <div>
            <span className="mb-2 block font-mono text-[11px] font-medium tracking-[0.16em] text-zinc-400 uppercase">
              Control de tiempo
            </span>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {TIME_PRESETS.map((option) => {
                const isSelected = timePreset === option.id;
                const isMonoLabel =
                  option.id === 'blitz-3-2' || option.id === 'rapid-10-0';
                return (
                  <button
                    key={option.id}
                    type="button"
                    data-time-preset={option.id}
                    aria-pressed={isSelected}
                    onClick={() => setTimePreset(option.id)}
                    className={`group flex flex-col rounded-xl border p-3 text-left transition-all duration-200 ${
                      isSelected ? selectedCardClass : inactiveCardClass
                    }`}
                  >
                    <span
                      className={`block text-sm font-semibold ${
                        isMonoLabel ? 'font-mono' : ''
                      }`}
                    >
                      {option.label}
                    </span>
                    <span
                      className={`mt-0.5 block text-xs font-normal ${
                        isSelected ? 'text-[#d8b897]' : 'text-zinc-400'
                      }`}
                    >
                      {option.description}
                    </span>
                  </button>
                );
              })}
            </div>

            {timePreset === 'custom' ? (
              <div className="mt-2.5 grid grid-cols-2 gap-3 rounded-xl border border-zinc-800 bg-zinc-900/50 p-3">
                <div className="flex flex-col gap-1.5 text-xs text-zinc-300">
                  <label htmlFor="custom-minutes-input">Minutos (1–180)</label>
                  <div className="flex items-center overflow-hidden rounded-lg border border-zinc-700/90 bg-zinc-950 focus-within:border-[#b58863]">
                    <button
                      type="button"
                      aria-label="Disminuir minutos"
                      onClick={() => adjustMinutes(-1)}
                      className="flex h-9 w-9 shrink-0 items-center justify-center text-sm font-medium text-zinc-400 transition hover:bg-zinc-800 hover:text-white active:bg-zinc-700"
                    >
                      −
                    </button>
                    <input
                      id="custom-minutes-input"
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={customMinutesInput}
                      onChange={(event) => {
                        const digitsOnly = event.target.value.replace(/\D/g, '');
                        setCustomMinutesInput(digitsOnly);
                      }}
                      onBlur={() => {
                        const parsed =
                          customMinutesInput.trim() === ''
                            ? 5
                            : Number(customMinutesInput);
                        setCustomMinutesInput(
                          String(clampInt(parsed, 1, 180, 5)),
                        );
                      }}
                      className="w-full min-w-0 bg-transparent px-2 py-1.5 text-center font-mono text-sm text-white focus:outline-none"
                    />
                    <button
                      type="button"
                      aria-label="Aumentar minutos"
                      onClick={() => adjustMinutes(1)}
                      className="flex h-9 w-9 shrink-0 items-center justify-center text-sm font-medium text-zinc-400 transition hover:bg-zinc-800 hover:text-white active:bg-zinc-700"
                    >
                      +
                    </button>
                  </div>
                </div>

                <div className="flex flex-col gap-1.5 text-xs text-zinc-300">
                  <label htmlFor="custom-increment-input">
                    Incremento (s, 0–60)
                  </label>
                  <div className="flex items-center overflow-hidden rounded-lg border border-zinc-700/90 bg-zinc-950 focus-within:border-[#b58863]">
                    <button
                      type="button"
                      aria-label="Disminuir incremento"
                      onClick={() => adjustIncrement(-1)}
                      className="flex h-9 w-9 shrink-0 items-center justify-center text-sm font-medium text-zinc-400 transition hover:bg-zinc-800 hover:text-white active:bg-zinc-700"
                    >
                      −
                    </button>
                    <input
                      id="custom-increment-input"
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={customIncrementInput}
                      onChange={(event) => {
                        const digitsOnly = event.target.value.replace(/\D/g, '');
                        setCustomIncrementInput(digitsOnly);
                      }}
                      onBlur={() => {
                        const parsed =
                          customIncrementInput.trim() === ''
                            ? 0
                            : Number(customIncrementInput);
                        setCustomIncrementInput(
                          String(clampInt(parsed, 0, 60, 0)),
                        );
                      }}
                      className="w-full min-w-0 bg-transparent px-2 py-1.5 text-center font-mono text-sm text-white focus:outline-none"
                    />
                    <button
                      type="button"
                      aria-label="Aumentar incremento"
                      onClick={() => adjustIncrement(1)}
                      className="flex h-9 w-9 shrink-0 items-center justify-center text-sm font-medium text-zinc-400 transition hover:bg-zinc-800 hover:text-white active:bg-zinc-700"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          <div className="mt-4 flex items-center justify-end gap-3 border-t border-zinc-800/60 pt-3.5">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-zinc-800/80 bg-zinc-900/80 px-5 py-2.5 text-sm font-medium text-zinc-300 transition-all duration-150 hover:bg-zinc-800 hover:text-white active:scale-[0.98]"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="flex items-center gap-1.5 rounded-xl border border-[#d8b897]/50 bg-[#b58863] px-6 py-2.5 text-sm font-semibold text-[#1e130b] transition-all duration-150 hover:bg-[#c99a6b] active:scale-[0.98] active:bg-[#a67752] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b58863]"
            >
              <span>Iniciar partida</span>
              <svg
                aria-hidden="true"
                className="ml-0.5 h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.2}
                viewBox="0 0 24 24"
              >
                <path
                  d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function GameSetupModal({
  isOpen,
  initialConfig,
  onClose,
  onStartMatch,
}: GameSetupModalProps) {
  if (!isOpen) {
    return null;
  }

  return (
    <GameSetupDialog
      initialConfig={initialConfig}
      onClose={onClose}
      onStartMatch={onStartMatch}
    />
  );
}
