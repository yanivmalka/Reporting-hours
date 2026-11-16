/** תחליף מינימלי ל־react-native בבדיקות (רק מה ש־lib/ נוגע בו). */
export const Platform = { OS: 'web', select: <T,>(o: { web?: T; default?: T }) => o.web ?? o.default };
export const AppState = { addEventListener: () => ({ remove() {} }), currentState: 'active' };
export const I18nManager = { isRTL: true, allowRTL() {}, forceRTL() {} };
export const Dimensions = { get: () => ({ width: 400, height: 800 }) };
