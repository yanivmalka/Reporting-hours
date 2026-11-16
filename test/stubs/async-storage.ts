/** AsyncStorage בזיכרון — לבדיקות. */
const store = new Map<string, string>();
const AsyncStorage = {
  getItem: async (k: string) => store.get(k) ?? null,
  setItem: async (k: string, v: string) => void store.set(k, v),
  removeItem: async (k: string) => void store.delete(k),
  getAllKeys: async () => [...store.keys()],
  multiGet: async (ks: readonly string[]) => ks.map((k) => [k, store.get(k) ?? null] as [string, string | null]),
  multiSet: async (pairs: readonly (readonly [string, string])[]) => pairs.forEach(([k, v]) => store.set(k, v)),
  multiRemove: async (ks: readonly string[]) => ks.forEach((k) => store.delete(k)),
  clear: async () => store.clear(),
};
export default AsyncStorage;
