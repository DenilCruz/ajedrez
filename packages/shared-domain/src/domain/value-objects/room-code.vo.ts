const ROOM_CODE_REGEX = /^[A-Z0-9]{4,8}$/;

/**
 * Value Object: código único de sala multijugador (ej. "A84F").
 */
export class RoomCode {
  private readonly value: string;

  private constructor(value: string) {
    this.value = value;
  }

  public static create(raw: string): RoomCode {
    const normalized = raw.trim().toUpperCase();
    if (!ROOM_CODE_REGEX.test(normalized)) {
      throw new Error(`Invalid room code: "${raw}"`);
    }
    return new RoomCode(normalized);
  }

  public toString(): string {
    return this.value;
  }

  public equals(other: RoomCode): boolean {
    return this.value === other.value;
  }
}
