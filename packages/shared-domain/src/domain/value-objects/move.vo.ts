export type PromotionPiece = 'q' | 'r' | 'b' | 'n';

const SQUARE_REGEX = /^[a-h][1-8]$/;
const PROMOTION_REGEX = /^[qrbn]$/;

export interface MoveProps {
  from: string;
  to: string;
  promotion?: PromotionPiece;
}

/**
 * Value Object: movimiento inmutable { from, to, promotion }.
 */
export class Move {
  public readonly from: string;
  public readonly to: string;
  public readonly promotion?: PromotionPiece;

  private constructor(props: MoveProps) {
    this.from = props.from;
    this.to = props.to;
    this.promotion = props.promotion;
  }

  public static create(props: MoveProps): Move {
    const from = props.from.trim().toLowerCase();
    const to = props.to.trim().toLowerCase();

    if (!SQUARE_REGEX.test(from)) {
      throw new Error(`Invalid origin square: "${props.from}"`);
    }
    if (!SQUARE_REGEX.test(to)) {
      throw new Error(`Invalid destination square: "${props.to}"`);
    }
    if (from === to) {
      throw new Error(`Origin and destination squares cannot be equal: "${from}"`);
    }
    if (props.promotion !== undefined && !PROMOTION_REGEX.test(props.promotion)) {
      throw new Error(`Invalid promotion piece: "${props.promotion}"`);
    }

    return new Move({ from, to, promotion: props.promotion });
  }

  public static fromUci(uci: string): Move {
    const trimmed = uci.trim().toLowerCase();
    if (trimmed.length < 4 || trimmed.length > 5) {
      throw new Error(`Invalid UCI move: "${uci}"`);
    }
    const from = trimmed.slice(0, 2);
    const to = trimmed.slice(2, 4);
    const promotion =
      trimmed.length === 5 ? (trimmed[4] as PromotionPiece) : undefined;

    return Move.create({ from, to, promotion });
  }

  public toUci(): string {
    return `${this.from}${this.to}${this.promotion ?? ''}`;
  }

  public equals(other: Move): boolean {
    return (
      this.from === other.from &&
      this.to === other.to &&
      this.promotion === other.promotion
    );
  }
}
