import { BOARD_THEMES, BoardTheme } from '@chess-platform/shared-domain';
import type { BoardThemeId } from '@chess-platform/shared-domain';
import type { StoragePort } from '../../domain/ports/storage.port';

export const BOARD_THEME_STORAGE_KEY = 'chess-platform:board-theme';

/**
 * Implementa StoragePort con localStorage y fallback seguro a 'classic'.
 */
export class LocalStorageAdapter implements StoragePort {
  private readonly storageOverride: Storage | undefined;
  private readonly storageKey: string;

  constructor(storage?: Storage, storageKey = BOARD_THEME_STORAGE_KEY) {
    this.storageOverride = storage;
    this.storageKey = storageKey;
  }

  private resolveStorage(): Storage | null {
    if (this.storageOverride !== undefined) {
      return this.storageOverride;
    }

    try {
      if (
        typeof globalThis !== 'undefined' &&
        'localStorage' in globalThis &&
        globalThis.localStorage
      ) {
        return globalThis.localStorage;
      }
      if (typeof window !== 'undefined' && window.localStorage) {
        return window.localStorage;
      }
    } catch {
      return null;
    }

    return null;
  }

  public saveTheme(theme: BoardThemeId): void {
    const safeTheme: BoardThemeId =
      typeof theme === 'string' && Object.hasOwn(BOARD_THEMES, theme)
        ? BoardTheme.fromString(theme).id
        : 'classic';

    try {
      this.resolveStorage()?.setItem(this.storageKey, safeTheme);
    } catch {
      // Ignore storage quota or security errors
    }
  }

  public getTheme(): BoardThemeId {
    try {
      const raw = this.resolveStorage()?.getItem(this.storageKey);
      if (typeof raw === 'string' && Object.hasOwn(BOARD_THEMES, raw)) {
        return BoardTheme.fromString(raw).id;
      }
      return 'classic';
    } catch {
      return 'classic';
    }
  }
}
