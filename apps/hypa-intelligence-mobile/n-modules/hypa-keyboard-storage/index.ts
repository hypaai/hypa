export { default } from './src/HypaKeyboardStorageModule';
export {
  addDebugLogListener,
  addSettingsChangedListener,
  addSharedStoreChangedListener,
  drainDebugEvents,
  getSettingsJson,
  getSharedStoreJson,
  setSettingsJson,
  setSharedStoreJson,
  startKeyboardStorageDebugLogging,
} from './src/HypaKeyboardStorageModule';
export type {
  HypaKeyboardStorageModuleEvents,
  KeyboardLanguageId,
  KeyboardSettings,
  KeyboardThemeColors,
  KeyboardTranslationHistoryItem,
  KeyboardUsageStats,
  SharedLexiconEntry,
  SharedStore,
} from './src/HypaKeyboardStorage.types';
