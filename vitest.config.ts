/**
 * בדיקות יחידה ל־lib/ (חישובים טהורים) — רצות ב־Node, בלי אמולטור.
 * react-native ו־AsyncStorage מוחלפים בתחליפים קטנים (test/stubs), כדי שקוד
 * שמייבא אותם (בעקיפין, דרך lib/storage.ts) ייטען.
 */
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const stub = (f: string) => fileURLToPath(new URL(`./test/stubs/${f}`, import.meta.url));

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },
  resolve: {
    alias: [
      { find: /^react-native$/, replacement: stub('react-native.ts') },
      { find: /^@react-native-async-storage\/async-storage$/, replacement: stub('async-storage.ts') },
      { find: /^@react-native-google-signin\/google-signin$/, replacement: stub('google-signin.ts') },
    ],
  },
});
