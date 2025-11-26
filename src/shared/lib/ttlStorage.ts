"use client";

// Generic storage interface structurally compatible with atomWithStorage
type CompatibleStorage<T> = {
  getItem: (key: string, initialValue: T) => T;
  setItem: (key: string, newValue: T) => void;
  removeItem: (key: string) => void;
};

type WrappedValue<T> = {
  value: T;
  expiresAt: number;
};

export function createTTLStorage<T>(ttlMs: number): CompatibleStorage<T> {
  const storage: CompatibleStorage<T> = {
    getItem: (key: string, initialValue: T) => {
      try {
        if (typeof window === "undefined") return initialValue;
        const raw = window.localStorage.getItem(key);
        if (!raw) return initialValue;
        const parsed = JSON.parse(raw) as unknown;
        // Accept only wrapped values; treat legacy/plain values as expired
        if (
          parsed &&
          typeof parsed === "object" &&
          Object.prototype.hasOwnProperty.call(parsed, "value") &&
          Object.prototype.hasOwnProperty.call(parsed, "expiresAt")
        ) {
          const w = parsed as WrappedValue<T>;
          if (typeof w.expiresAt === "number" && Date.now() < w.expiresAt) {
            return w.value;
          }
          // expired -> clean up
          window.localStorage.removeItem(key);
          return initialValue;
        }
        // legacy data without TTL -> ignore to enforce new policy
        return initialValue;
      } catch {
        return initialValue;
      }
    },
    setItem: (key: string, newValue: T) => {
      try {
        if (typeof window === "undefined") return;
        const wrapped: WrappedValue<T> = {
          value: newValue,
          expiresAt: Date.now() + ttlMs,
        };
        window.localStorage.setItem(key, JSON.stringify(wrapped));
      } catch {}
    },
    removeItem: (key: string) => {
      try {
        if (typeof window === "undefined") return;
        window.localStorage.removeItem(key);
      } catch {}
    },
  };

  return storage;
}


