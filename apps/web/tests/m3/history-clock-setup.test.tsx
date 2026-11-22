import './react-singleton';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { MoveHistoryEntry } from '@chess-platform/shared-domain';
import { MoveHistoryView } from '../../src/presentation/features/move-history/MoveHistoryView';
import { GameClockView } from '../../src/presentation/features/game-clock/GameClockView';
import { GameSetupModal } from '../../src/presentation/features/lobby/GameSetupModal';

const noop = () => {};

describe('MoveHistoryView', () => {
  it('renders empty state when history is empty', () => {
    const html = renderToStaticMarkup(<MoveHistoryView history={[]} />);

    expect(html).toContain('Historial');
    expect(html).toContain('Sin jugadas aún. Mueve una pieza para comenzar.');
    expect(html).toContain('>0<');
  });

  it('pairs white and black moves, preserves SAN verbatim, and highlights only latest ply', () => {
    const history: MoveHistoryEntry[] = [
      {
        moveNumber: 1,
        color: 'w',
        san: 'e4',
        from: 'e2',
        to: 'e4',
        fenAfter: 'fen1',
        isCapture: false,
        isCheck: false,
        isCheckmate: false,
      },
      {
        moveNumber: 1,
        color: 'b',
        san: 'e5',
        from: 'e7',
        to: 'e5',
        fenAfter: 'fen2',
        isCapture: false,
        isCheck: false,
        isCheckmate: false,
      },
      {
        moveNumber: 2,
        color: 'w',
        san: 'Qh5+',
        from: 'd1',
        to: 'h5',
        fenAfter: 'fen3',
        isCapture: false,
        isCheck: true,
        isCheckmate: false,
      },
    ];

    const html = renderToStaticMarkup(<MoveHistoryView history={history} />);

    expect(html).toContain('1.');
    expect(html).toContain('2.');
    expect(html).toContain('>e4<');
    expect(html).toContain('>e5<');
    expect(html).toContain('>Qh5+<');
    expect(html).not.toContain('Qh5++');
    expect(html).toContain('>3<');
    expect((html.match(/data-latest-move="true"/g) ?? []).length).toBe(1);
  });
});

describe('GameClockView', () => {
  it('displays Sin reloj when times are null', () => {
    const html = renderToStaticMarkup(
      <GameClockView
        whiteTimeMs={null}
        blackTimeMs={null}
        activeTurn="w"
        isRunning={false}
        playerOrientation="white"
      />,
    );

    expect((html.match(/Sin reloj/g) ?? []).length).toBe(2);
  });

  it('formats mm:ss, tenths under 10s, and timeout 00:00.0', () => {
    const html = renderToStaticMarkup(
      <GameClockView
        whiteTimeMs={180_000}
        blackTimeMs={9_450}
        activeTurn="b"
        isRunning={true}
        playerOrientation="white"
      />,
    );

    expect(html).toContain('03:00');
    expect(html).toContain('00:09.5');
    // Black clock rendered before White clock when playerOrientation is white
    expect(html.indexOf('data-clock-color="b"')).toBeLessThan(
      html.indexOf('data-clock-color="w"'),
    );

    const timeoutHtml = renderToStaticMarkup(
      <GameClockView
        whiteTimeMs={0}
        blackTimeMs={600_000}
        activeTurn="w"
        isRunning={false}
        playerOrientation="black"
      />,
    );

    expect(timeoutHtml).toContain('00:00.0');
    expect(timeoutHtml).toContain('Tiempo agotado');
    expect(timeoutHtml).toContain('10:00');
    // White clock rendered before Black clock when playerOrientation is black
    expect(timeoutHtml.indexOf('data-clock-color="w"')).toBeLessThan(
      timeoutHtml.indexOf('data-clock-color="b"'),
    );
  });
});

describe('GameSetupModal', () => {
  it('renders nothing when closed', () => {
    const html = renderToStaticMarkup(
      <GameSetupModal
        isOpen={false}
        initialConfig={{
          mode: 'vs-ai',
          difficulty: 'medium',
          playerColor: 'w',
          timeControl: null,
        }}
        onClose={noop}
        onStartMatch={noop}
      />,
    );
    expect(html).toBe('');
  });

  it('renders vs-ai options, difficulty, player color, and time presets when open', () => {
    const html = renderToStaticMarkup(
      <GameSetupModal
        isOpen={true}
        initialConfig={{
          mode: 'vs-ai',
          difficulty: 'hard',
          playerColor: 'b',
          timeControl: { initialMs: 180_000, incrementMs: 2_000 },
        }}
        onClose={noop}
        onStartMatch={noop}
      />,
    );

    expect(html).toContain('role="dialog"');
    expect(html).toContain('vs IA');
    expect(html).toContain('2 Jugadores');
    expect(html).toContain('Fácil');
    expect(html).toContain('Medio');
    expect(html).toContain('Difícil');
    expect(html).toContain('Blancas');
    expect(html).toContain('Negras');
    expect(html).toContain('Sin reloj');
    expect(html).toContain('3+2 Blitz');
    expect(html).toContain('10+0 Rápida');
    expect(html).toContain('Personalizado');
    expect(html).toContain('data-difficulty="hard" aria-pressed="true"');
    expect(html).toContain('data-player-color="b" aria-pressed="true"');
    expect(html).toContain('data-time-preset="blitz-3-2" aria-pressed="true"');
  });

  it('renders local-2p mode without AI difficulty/color selectors and custom time inputs when custom', () => {
    const html = renderToStaticMarkup(
      <GameSetupModal
        isOpen={true}
        initialConfig={{
          mode: 'local-2p',
          difficulty: 'easy',
          playerColor: 'w',
          timeControl: { initialMs: 300_000, incrementMs: 3_000 },
        }}
        onClose={noop}
        onStartMatch={noop}
      />,
    );

    expect(html).not.toContain('Dificultad de la IA');
    expect(html).not.toContain('Tu color');
    expect(html).toContain('Minutos (1–180)');
    expect(html).toContain('value="5"');
    expect(html).toContain('value="3"');
  });
});
