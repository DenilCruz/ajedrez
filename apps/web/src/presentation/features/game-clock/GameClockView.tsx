import type { PieceColor } from '@chess-platform/shared-domain';

export interface GameClockViewProps {
  whiteTimeMs: number | null;
  blackTimeMs: number | null;
  activeTurn: PieceColor;
  isRunning: boolean;
  playerOrientation: 'white' | 'black';
  whiteLabel?: string;
  blackLabel?: string;
}

function formatClockTime(ms: number | null): string {
  if (ms === null) return 'Sin reloj';
  const safeMs = Number.isFinite(ms) ? Math.max(0, ms) : 0;
  if (safeMs === 0) return '00:00.0';

  if (safeMs < 10_000) {
    const totalTenths = Math.min(99, Math.ceil(safeMs / 100));
    const secs = Math.floor(totalTenths / 10);
    const tenths = totalTenths % 10;
    return `00:${String(secs).padStart(2, '0')}.${tenths}`;
  }

  const totalSeconds = Math.ceil(safeMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function GameClockView({
  whiteTimeMs,
  blackTimeMs,
  activeTurn,
  isRunning,
  playerOrientation,
  whiteLabel = 'Blancas',
  blackLabel = 'Negras',
}: GameClockViewProps) {
  const orderedColors: PieceColor[] =
    playerOrientation === 'white' ? ['b', 'w'] : ['w', 'b'];

  return (
    <section
      aria-label="Reloj de partida"
      className="flex shrink-0 flex-col gap-2.5"
    >
      {orderedColors.map((color) => {
        const isWhite = color === 'w';
        const timeMs = isWhite ? whiteTimeMs : blackTimeMs;
        const label = isWhite ? whiteLabel : blackLabel;
        const isActive = activeTurn === color;
        const formatted = formatClockTime(timeMs);

        const isTimedOut = timeMs !== null && timeMs <= 0;
        const isCritical = timeMs !== null && timeMs > 0 && timeMs < 10_000;
        const isWarning =
          timeMs !== null && timeMs >= 10_000 && timeMs < 20_000;

        let cardClass =
          'border border-brand-border bg-brand-surface text-neutral-200 hover:border-neutral-700';
        let timeBoxClass =
          'border-neutral-800 bg-brand-background text-neutral-300';

        if (isTimedOut) {
          cardClass = 'border-2 border-rose-500/80 bg-rose-950/25 text-rose-100';
          timeBoxClass = 'border-rose-500/40 bg-brand-background text-rose-200';
        } else if (isActive && isCritical) {
          cardClass = 'border-2 border-rose-500/80 bg-rose-950/20 text-rose-100';
          timeBoxClass = 'border-rose-500/40 bg-brand-background text-rose-200';
        } else if (isActive && isWarning) {
          cardClass = 'border-2 border-amber-400/80 bg-amber-950/20 text-amber-100';
          timeBoxClass = 'border-amber-400/40 bg-brand-background text-amber-200';
        } else if (isActive) {
          cardClass =
            'border-2 border-brand-gold/80 bg-brand-surface text-white shadow-glow-gold';
          timeBoxClass = 'border-brand-gold/40 bg-brand-background text-white shadow-sm';
        }

        return (
          <div
            key={color}
            data-clock-color={color}
            data-active-turn={isActive ? 'true' : 'false'}
            aria-label={isWhite ? 'Reloj de Blancas' : 'Reloj de Negras'}
            className={`relative flex items-center justify-between overflow-hidden rounded-xl p-3.5 shadow-sm transition-all ${cardClass}`}
          >
            {isActive && !isTimedOut ? (
              <div
                aria-hidden="true"
                className="absolute top-0 bottom-0 left-0 w-1 bg-gradient-to-b from-brand-gold to-[#8c5d35]"
              />
            ) : null}

            <div className={`flex items-center gap-3 ${isActive && !isTimedOut ? 'pl-1.5' : ''}`}>
              <span
                aria-hidden="true"
                className={`flex h-9 w-9 items-center justify-center rounded-lg border ${
                  isActive
                    ? 'border-brand-gold/40 bg-neutral-900'
                    : 'border-neutral-700/60 bg-neutral-900'
                }`}
              >
                {isWhite ? (
                  <span className="h-3.5 w-3.5 rounded-sm bg-white shadow-sm" />
                ) : (
                  <svg
                    className="h-5 w-5 text-neutral-400"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      cx="12"
                      cy="12"
                      fill="none"
                      r="7"
                      stroke="currentColor"
                      strokeWidth="1.5"
                    />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </span>

              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold leading-tight">{label}</span>
                {isTimedOut ? (
                  <span className="inline-flex items-center rounded-full border border-rose-500/40 bg-rose-500/15 px-2 py-0.5 text-[10px] font-medium text-rose-300">
                    Tiempo agotado
                  </span>
                ) : isActive ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-brand-gold/30 bg-amber-400/10 px-2 py-0.5 text-[10px] font-medium tracking-wide text-brand-gold">
                    {isRunning ? (
                      <span
                        aria-hidden="true"
                        className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand-gold"
                      />
                    ) : null}
                    Turno
                  </span>
                ) : null}
              </div>
            </div>

            {timeMs === null ? (
              <span className="rounded-md border border-neutral-800 bg-brand-background px-3 py-1.5 font-mono text-xs font-medium text-neutral-400">
                Sin reloj
              </span>
            ) : (
              <time
                className={`rounded-md border px-3 py-1.5 font-mono text-xl font-bold tracking-tight tabular-nums ${timeBoxClass}`}
              >
                {formatted}
              </time>
            )}
          </div>
        );
      })}
    </section>
  );
}
