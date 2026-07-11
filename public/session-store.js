export function createSessionStore(storage = window.localStorage) {
  return {
    getJson(key, fallback) {
      try {
        const raw = storage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
      } catch {
        return fallback;
      }
    },
    setJson(key, value) {
      storage.setItem(key, JSON.stringify(value));
    },
    remove(key) {
      storage.removeItem(key);
    },
    getOrCreateId(key, createId) {
      try {
        const existing = storage.getItem(key);
        if (existing) return existing;
        const next = createId();
        storage.setItem(key, next);
        return next;
      } catch {
        return createId();
      }
    },
  };
}
