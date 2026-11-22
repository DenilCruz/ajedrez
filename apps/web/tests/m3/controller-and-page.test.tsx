import './react-singleton';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ChessboardOptions } from 'react-chessboard';

vi.mock('react-chessboard', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-chessboard')>();
  return {
    ...actual,
    Chessboard: ({ options }: { options?: ChessboardOptions }) => (
      <div
        data-testid="mock-chessboard"
        data-position={typeof options?.position === 'string' ? options.position : ''}
      />
    ),
  };
});

import {
  DEFAULT_MATCH_CONFIG,
  createMatchFromConfig,
} from '../../src/presentation/hooks/useMatchController';
import { MatchPage } from '../../src/presentation/pages/MatchPage';

describe('useMatchController helpers', () => {
  it('creates a vs-ai match with White as human and Black as Stockfish', () => {
    const match = createMatchFromConfig(DEFAULT_MATCH_CONFIG);
    const snap = match.getSnapshot();

    expect(snap.status).toBe('playing');
    expect(snap.turn).toBe('w');
    expect(snap.whiteTimeMs).toBe(600_000);
    expect(snap.blackTimeMs).toBe(600_000);
    expect(snap.history).toHaveLength(0);
  });

  it('creates a local-2p match without clock when timeControl is null', () => {
    const match = createMatchFromConfig({
      mode: 'local-2p',
      difficulty: 'easy',
      playerColor: 'b',
      timeControl: null,
    });
    const snap = match.getSnapshot();

    expect(snap.whiteTimeMs).toBeNull();
    expect(snap.blackTimeMs).toBeNull();
    expect(snap.status).toBe('playing');
  });
});

describe('MatchPage SSR smoke check', () => {
  it('renders full page shell with board, clocks, move history, theme selector, and action buttons', () => {
    const html = renderToStaticMarkup(<MatchPage />);

    expect(html).toContain('Ajedrez');
    expect(html).toContain('Nueva partida');
    expect(html).toContain('Reiniciar');
    expect(html).toContain('Rendirse');
    expect(html).toContain('vs IA · Medio');
    expect(html).toContain('10:00');
    expect(html).toContain('Sin jugadas aún.');
    expect(html).toContain('Clásico');
    expect(html).toContain('Madera');
    expect(html).toContain('Pizarra');
    expect(html).toContain('Océano');
  });
});
