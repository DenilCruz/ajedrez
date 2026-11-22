import { describe, it, expect } from 'vitest';
import { Player } from '../src/domain/entities/player.entity';
import { PieceColor } from '../src/domain/value-objects/fen.vo';

describe('Player Entity', () => {
  it('supports both Player.create() and new Player()', () => {
    const p1 = Player.create({
      id: 'p1',
      name: 'Blancas',
      color: 'w',
      remainingTimeMs: 180_000,
      isAi: false,
    });
    const p2 = new Player({
      id: 'p2',
      name: 'Negras',
      color: 'b',
      remainingTimeMs: null,
      isAi: true,
    });

    expect(p1.id).toBe('p1');
    expect(p1.color).toBe('w');
    expect(p1.remainingTimeMs).toBe(180_000);
    expect(p1.isAi).toBe(false);
    expect(p2.remainingTimeMs).toBeNull();
    expect(p2.isAi).toBe(true);
  });

  it('rejects invalid color and invalid remainingTimeMs on construction', () => {
    expect(() =>
      Player.create({
        id: 'bad',
        name: 'Bad',
        color: 'x' as PieceColor,
        remainingTimeMs: 1000,
        isAi: false,
      }),
    ).toThrow();

    for (const invalidTime of [-1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(() =>
        Player.create({
          id: 'bad',
          name: 'Bad',
          color: 'w',
          remainingTimeMs: invalidTime,
          isAi: false,
        }),
      ).toThrow();
    }
  });

  it('deducts time, clamps at 0, and ignores <= 0, NaN, and Infinity', () => {
    const player = Player.create({
      id: 'w',
      name: 'White',
      color: 'w',
      remainingTimeMs: 5_000,
      isAi: false,
    });

    player.deductTime(1_500);
    expect(player.remainingTimeMs).toBe(3_500);
    expect(player.hasTimedOut()).toBe(false);

    player.deductTime(0);
    player.deductTime(-500);
    player.deductTime(Number.NaN);
    player.deductTime(Number.POSITIVE_INFINITY);
    player.deductTime(Number.NEGATIVE_INFINITY);
    expect(player.remainingTimeMs).toBe(3_500);

    player.deductTime(10_000);
    expect(player.remainingTimeMs).toBe(0);
    expect(player.hasTimedOut()).toBe(true);
  });

  it('adds increment and ignores <= 0, NaN, and Infinity', () => {
    const player = Player.create({
      id: 'w',
      name: 'White',
      color: 'w',
      remainingTimeMs: 10_000,
      isAi: false,
    });

    player.addIncrement(2_000);
    expect(player.remainingTimeMs).toBe(12_000);

    player.addIncrement(0);
    player.addIncrement(-1_000);
    player.addIncrement(Number.NaN);
    player.addIncrement(Number.POSITIVE_INFINITY);
    player.addIncrement(Number.NEGATIVE_INFINITY);
    expect(player.remainingTimeMs).toBe(12_000);
  });

  it('keeps null remainingTimeMs untouched and never times out in unlimited mode', () => {
    const player = Player.create({
      id: 'w',
      name: 'Unlimited',
      color: 'w',
      remainingTimeMs: null,
      isAi: false,
    });

    player.deductTime(999_999);
    player.addIncrement(2_000);
    expect(player.remainingTimeMs).toBeNull();
    expect(player.hasTimedOut()).toBe(false);
  });
});
