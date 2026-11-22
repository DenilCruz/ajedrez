import { useEffect, useRef } from 'react';
import type { MoveHistoryEntry } from '@chess-platform/shared-domain';

export interface MoveHistoryViewProps {
  history: MoveHistoryEntry[];
}

interface MovePairRow {
  moveNumber: number;
  white?: MoveHistoryEntry;
  black?: MoveHistoryEntry;
}

function pairMoves(history: MoveHistoryEntry[]): MovePairRow[] {
  const rows: MovePairRow[] = [];
  for (const entry of history) {
    const last = rows[rows.length - 1];
    if (entry.color === 'w') {
      rows.push({ moveNumber: entry.moveNumber, white: entry });
    } else if (last && last.moveNumber === entry.moveNumber && !last.black) {
      last.black = entry;
    } else {
      rows.push({ moveNumber: entry.moveNumber, black: entry });
    }
  }
  return rows;
}

function getMoveToneClass(entry: MoveHistoryEntry, isLatest: boolean): string {
  if (isLatest) {
    return 'bg-brand-gold/20 text-brand-goldLight font-semibold ring-1 ring-brand-gold/40';
  }
  if (entry.isCheckmate) {
    return 'text-rose-400 font-bold';
  }
  if (entry.isCheck) {
    return 'text-brand-gold font-semibold';
  }
  if (entry.isCapture) {
    return 'text-neutral-100 font-semibold';
  }
  return 'text-neutral-300';
}

export function MoveHistoryView({ history }: MoveHistoryViewProps) {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const rows = pairMoves(history);
  const latestEntry = history.length > 0 ? history[history.length - 1] : null;

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }, [history.length]);

  return (
    <section
      aria-label="Historial de jugadas"
      className="flex flex-col overflow-hidden rounded-xl border border-brand-border bg-brand-surface lg:min-h-0 lg:flex-1"
    >
      <div className="flex shrink-0 items-center justify-between border-b border-brand-borderSubtle bg-brand-surfaceElevated/50 px-4 py-3">
        <div className="flex items-center gap-2">
          <svg
            aria-hidden="true"
            className="h-4 w-4 text-brand-gold"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
            />
          </svg>
          <h2 className="text-xs font-semibold tracking-widest text-neutral-300 uppercase">
            Historial
          </h2>
        </div>
        <span className="flex h-5 min-w-5 items-center justify-center rounded-full border border-brand-border bg-brand-surfaceElevated px-1.5 font-mono text-[11px] text-neutral-400 tabular-nums">
          {history.length}
        </span>
      </div>

      <div
        ref={scrollContainerRef}
        data-testid="move-history-scroll"
        className="max-h-60 min-h-32 overflow-y-auto p-3 lg:max-h-none lg:min-h-0 lg:flex-1"
      >
        {rows.length === 0 ? (
          <div className="flex h-36 flex-col items-center justify-center px-4 text-center lg:h-full lg:min-h-28">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full border border-neutral-800 bg-neutral-900/90 text-neutral-500">
              <svg
                aria-hidden="true"
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="1.5"
                />
              </svg>
            </div>
            <p className="max-w-[210px] text-xs leading-relaxed text-neutral-400">
              Sin jugadas aún. Mueve una pieza para comenzar.
            </p>
          </div>
        ) : (
          <ol className="space-y-1 font-mono text-sm tabular-nums">
            {rows.map((row) => {
              const whiteIsLatest = Boolean(row.white && row.white === latestEntry);
              const blackIsLatest = Boolean(row.black && row.black === latestEntry);

              return (
                <li
                  key={`${row.moveNumber}-${row.white?.san ?? ''}-${row.black?.san ?? ''}`}
                  className="grid grid-cols-[2.75rem_1fr_1fr] items-center gap-1 rounded-md px-2 py-1 odd:bg-brand-surfaceElevated/40"
                >
                  <span className="text-xs text-neutral-500">{row.moveNumber}.</span>

                  <div>
                    {row.white ? (
                      <span
                        data-latest-move={whiteIsLatest ? 'true' : undefined}
                        className={`inline-block rounded px-1.5 py-0.5 ${getMoveToneClass(
                          row.white,
                          whiteIsLatest,
                        )}`}
                      >
                        {row.white.san}
                      </span>
                    ) : (
                      <span className="px-1.5 text-slate-500">...</span>
                    )}
                  </div>

                  <div>
                    {row.black ? (
                      <span
                        data-latest-move={blackIsLatest ? 'true' : undefined}
                        className={`inline-block rounded px-1.5 py-0.5 ${getMoveToneClass(
                          row.black,
                          blackIsLatest,
                        )}`}
                      >
                        {row.black.san}
                      </span>
                    ) : (
                      <span />
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </section>
  );
}
