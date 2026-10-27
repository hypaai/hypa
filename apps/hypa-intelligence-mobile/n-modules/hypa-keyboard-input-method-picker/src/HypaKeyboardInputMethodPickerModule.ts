import { requireNativeModule } from 'expo';
import { Platform } from 'react-native';

type HypaKeyboardInputMethodPickerNative = {
  showInputMethodPicker(): Promise<void>;
  isHypaKeyboardEnabled(): boolean;
  isHypaKeyboardSelected(): boolean;
  hasHypaKeyboardBeenOpened?(): boolean;
  isHypaKeyboardFullAccessGranted?(): boolean;
};

const native = requireNativeModule<HypaKeyboardInputMethodPickerNative>(
  'HypaKeyboardInputMethodPicker'
);

function logIosDebug(message: string, payload?: unknown) {
  if (__DEV__ && Platform.OS === 'ios') {
    console.log(`[HypaKeyboardInputMethodPicker] ${message}`, payload ?? '');
  }
}

export async function showInputMethodPicker(): Promise<void> {
  if (typeof native?.showInputMethodPicker !== 'function') {
    logIosDebug('showInputMethodPicker unavailable');
    return;
  }
  logIosDebug('showInputMethodPicker');
  await native.showInputMethodPicker();
}

export function isHypaKeyboardEnabled(): boolean {
  const fn = (native as Partial<HypaKeyboardInputMethodPickerNative>)
    .isHypaKeyboardEnabled;
  if (typeof fn !== 'function') {
    logIosDebug('isHypaKeyboardEnabled unavailable');
    return false;
  }
  const enabled = fn();
  logIosDebug('isHypaKeyboardEnabled', { enabled });
  return enabled;
}

export function isHypaKeyboardSelected(): boolean {
  const fn = (native as Partial<HypaKeyboardInputMethodPickerNative>)
    .isHypaKeyboardSelected;
  if (typeof fn !== 'function') {
    logIosDebug('isHypaKeyboardSelected unavailable');
    return false;
  }
  const selected = fn();
  logIosDebug('isHypaKeyboardSelected', { selected });
  return selected;
}

export function hasHypaKeyboardBeenOpened(): boolean {
  const fn = (native as Partial<HypaKeyboardInputMethodPickerNative>)
    .hasHypaKeyboardBeenOpened;
  if (typeof fn !== 'function') {
    const opened = isHypaKeyboardSelected();
    logIosDebug('hasHypaKeyboardBeenOpened fallback', { opened });
    return opened;
  }
  const opened = fn();
  logIosDebug('hasHypaKeyboardBeenOpened', { opened });
  return opened;
}

export function isHypaKeyboardFullAccessGranted(): boolean {
  const fn = (native as Partial<HypaKeyboardInputMethodPickerNative>)
    .isHypaKeyboardFullAccessGranted;
  if (typeof fn !== 'function') {
    const fullAccess = Platform.OS === 'ios' ? false : true;
    logIosDebug('isHypaKeyboardFullAccessGranted fallback', { fullAccess });
    return fullAccess;
  }
  const fullAccess = fn();
  logIosDebug('isHypaKeyboardFullAccessGranted', { fullAccess });
  return fullAccess;
}

export default native;
