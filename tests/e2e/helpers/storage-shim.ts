export class InMemoryStorage implements Storage {
  private readonly store = new Map<string, string>();

  public get length(): number {
    return this.store.size;
  }

  public clear(): void {
    this.store.clear();
  }

  public getItem(key: string): string | null {
    return this.store.has(key) ? (this.store.get(key) ?? null) : null;
  }

  public key(index: number): string | null {
    const keys = Array.from(this.store.keys());
    return index >= 0 && index < keys.length ? keys[index] : null;
  }

  public removeItem(key: string): void {
    this.store.delete(key);
  }

  public setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }

  public seedRaw(key: string, rawValue: string): void {
    this.store.set(key, rawValue);
  }
}

export interface FaultyStorageOptions {
  throwOnGet?: Error;
  throwOnSet?: Error;
  initialEntries?: Record<string, string>;
}

export class FaultyStorage implements Storage {
  private readonly inner = new InMemoryStorage();
  private readonly throwOnGet?: Error;
  private readonly throwOnSet?: Error;

  constructor(options: FaultyStorageOptions = {}) {
    this.throwOnGet = options.throwOnGet;
    this.throwOnSet = options.throwOnSet;
    if (options.initialEntries) {
      for (const [k, v] of Object.entries(options.initialEntries)) {
        this.inner.setItem(k, v);
      }
    }
  }

  public get length(): number {
    return this.inner.length;
  }

  public clear(): void {
    this.inner.clear();
  }

  public getItem(key: string): string | null {
    if (this.throwOnGet) {
      throw this.throwOnGet;
    }
    return this.inner.getItem(key);
  }

  public key(index: number): string | null {
    return this.inner.key(index);
  }

  public removeItem(key: string): void {
    this.inner.removeItem(key);
  }

  public setItem(key: string, value: string): void {
    if (this.throwOnSet) {
      throw this.throwOnSet;
    }
    this.inner.setItem(key, value);
  }
}

export async function withMockedLocalStorage<T>(
  mockStorage: Storage | undefined,
  fn: () => T | Promise<T>,
): Promise<T> {
  const g = globalThis as Record<string, unknown>;
  const hadOwn = Object.prototype.hasOwnProperty.call(g, 'localStorage');
  const previousDescriptor = Object.getOwnPropertyDescriptor(g, 'localStorage');

  if (mockStorage === undefined) {
    Object.defineProperty(g, 'localStorage', {
      configurable: true,
      writable: true,
      value: undefined,
    });
  } else {
    Object.defineProperty(g, 'localStorage', {
      configurable: true,
      writable: true,
      value: mockStorage,
    });
  }

  try {
    return await fn();
  } finally {
    if (!hadOwn) {
      delete g.localStorage;
    } else if (previousDescriptor) {
      Object.defineProperty(g, 'localStorage', previousDescriptor);
    }
  }
}
