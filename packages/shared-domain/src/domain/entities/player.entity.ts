import { PieceColor } from '../value-objects/fen.vo.js';

export interface PlayerProps {
  id: string;
  name: string;
  color: PieceColor;
  remainingTimeMs: number | null;
  isAi: boolean;
}

/**
 * Entidad: jugador, color asignado y tiempo restante.
 */
export class Player {
  public readonly id: string;
  public readonly name: string;
  public readonly color: PieceColor;
  public readonly isAi: boolean;
  private _remainingTimeMs: number | null;

  constructor(props: PlayerProps) {
    if (props.color !== 'w' && props.color !== 'b') {
      throw new Error(`Invalid player color: "${String(props.color)}"`);
    }
    if (
      props.remainingTimeMs !== null &&
      (typeof props.remainingTimeMs !== 'number' ||
        !Number.isFinite(props.remainingTimeMs) ||
        props.remainingTimeMs < 0)
    ) {
      throw new Error(`Invalid remaining time: ${String(props.remainingTimeMs)}`);
    }

    this.id = props.id;
    this.name = props.name;
    this.color = props.color;
    this.isAi = props.isAi;
    this._remainingTimeMs = props.remainingTimeMs;
  }

  public static create(props: PlayerProps): Player {
    return new Player(props);
  }

  public get remainingTimeMs(): number | null {
    return this._remainingTimeMs;
  }

  public deductTime(elapsedMs: number): void {
    if (this._remainingTimeMs === null || !Number.isFinite(elapsedMs) || elapsedMs <= 0) {
      return;
    }
    this._remainingTimeMs = Math.max(0, this._remainingTimeMs - elapsedMs);
  }

  public addIncrement(incrementMs: number): void {
    if (this._remainingTimeMs === null || !Number.isFinite(incrementMs) || incrementMs <= 0) {
      return;
    }
    this._remainingTimeMs += incrementMs;
  }

  public hasTimedOut(): boolean {
    return this._remainingTimeMs !== null && this._remainingTimeMs <= 0;
  }
}
