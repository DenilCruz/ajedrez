export type PieceColor = 'w' | 'b';

const INITIAL_FEN_STRING =
  'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

/**
 * Value Object: valida formato e integridad básica del string FEN.
 */
export class Fen {
  public static readonly INITIAL = new Fen(INITIAL_FEN_STRING);

  private readonly value: string;

  private constructor(value: string) {
    this.value = value;
  }

  public static create(raw: string): Fen {
    const normalized = raw.trim().replace(/\s+/g, ' ');
    if (!Fen.isValidFormat(normalized)) {
      throw new Error(`Invalid FEN string: "${raw}"`);
    }
    return new Fen(normalized);
  }

  public static isValidFormat(raw: string): boolean {
    const parts = raw.trim().split(/\s+/);
    if (parts.length !== 6) return false;

    const [placement, turn, castling, enPassant, halfmove, fullmove] = parts;
    const ranks = placement.split('/');
    if (ranks.length !== 8) return false;

    for (const rank of ranks) {
      let count = 0;
      for (const ch of rank) {
        if (/[1-8]/.test(ch)) {
          count += Number(ch);
        } else if (/[pnbrqkPNBRQK]/.test(ch)) {
          count += 1;
        } else {
          return false;
        }
      }
      if (count !== 8) return false;
    }

    if (turn !== 'w' && turn !== 'b') return false;
    if (!/^(KQ?k?q?|Qk?q?|kq?|q|-)$/.test(castling)) return false;
    if (!/^([a-h][36]|-)$/.test(enPassant)) return false;
    if (!/^\d+$/.test(halfmove) || Number(halfmove) < 0) return false;
    if (!/^\d+$/.test(fullmove) || Number(fullmove) < 1) return false;

    return true;
  }

  public getTurn(): PieceColor {
    return this.value.split(' ')[1] as PieceColor;
  }

  public equals(other: Fen): boolean {
    return this.value === other.value;
  }

  public toString(): string {
    return this.value;
  }
}
