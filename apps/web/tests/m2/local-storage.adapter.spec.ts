import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BoardThemeId } from '@chess-platform/shared-domain';
import {
  BOARD_THEME_STORAGE_KEY,
  LocalStorageAdapter,
} from '../../src/infrastructure/storage/local-storage.adapter';

function createMemoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.has(key) ? (store.get(key) ?? null) : null;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
  };
}

describe('LocalStorageAdapter', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    Reflect.deleteProperty(globalThis, 'localStorage');
  });

  it('saves and retrieves all 4 official BoardThemeId values via injected storage', () => {
    const storage = createMemoryStorage();
    const adapter = new LocalStorageAdapter(storage);
    const themes: BoardThemeId[] = ['classic', 'wood', 'slate', 'ocean'];

    for (const theme of themes) {
      adapter.saveTheme(theme);
      expect(storage.getItem(BOARD_THEME_STORAGE_KEY)).toBe(theme);
      expect(adapter.getTheme()).toBe(theme);
    }
  });

  it('uses globalThis.localStorage when constructed with zero arguments', () => {
    const memoryStorage = createMemoryStorage();
    vi.stubGlobal('localStorage', memoryStorage);

    const adapter = new LocalStorageAdapter();
    adapter.saveTheme('ocean');

    expect(adapter.getTheme()).toBe('ocean');
    expect(memoryStorage.getItem(BOARD_THEME_STORAGE_KEY)).toBe('ocean');
  });

  it('defaults to classic when storage is empty', () => {
    const adapter = new LocalStorageAdapter(createMemoryStorage());
    expect(adapter.getTheme()).toBe('classic');
  });

  it('falls back to classic on corrupt values and prototype-chain keys', () => {
    const storage = createMemoryStorage();
    const adapter = new LocalStorageAdapter(storage);
    const invalidValues = [
      '',
      'neon',
      'null',
      'undefined',
      '{"id":"wood"}',
      'toString',
      'constructor',
      'hasOwnProperty',
      '__proto__',
    ];

    for (const value of invalidValues) {
      storage.setItem(BOARD_THEME_STORAGE_KEY, value);
      expect(adapter.getTheme()).toBe('classic');
    }
  });

  it('handles Node / SSR environments without localStorage or window gracefully', () => {
    const adapter = new LocalStorageAdapter();

    expect(() => adapter.saveTheme('wood')).not.toThrow();
    expect(adapter.getTheme()).toBe('classic');
  });

  it('handles SecurityError when accessing localStorage getter in restricted environments', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new DOMException('Access denied', 'SecurityError');
      },
    });

    const adapter = new LocalStorageAdapter();

    expect(() => adapter.saveTheme('slate')).not.toThrow();
    expect(adapter.getTheme()).toBe('classic');
  });

  it('handles storage getItem and setItem errors gracefully', () => {
    const failingStorage: Storage = {
      ...createMemoryStorage(),
      getItem() {
        throw new Error('Read failed');
      },
      setItem() {
        throw new DOMException('Quota exceeded', 'QuotaExceededError');
      },
    };

    const adapter = new LocalStorageAdapter(failingStorage);

    expect(() => adapter.saveTheme('ocean')).not.toThrow();
    expect(adapter.getTheme()).toBe('classic');
  });
});
