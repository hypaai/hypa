export async function showInputMethodPicker(): Promise<void> {
  throw new Error('Input method picker is only available on Android.');
}

export function isHypaKeyboardEnabled(): boolean {
  return false;
}

export function isHypaKeyboardSelected(): boolean {
  return false;
}

export function hasHypaKeyboardBeenOpened(): boolean {
  return false;
}

export function isHypaKeyboardFullAccessGranted(): boolean {
  return true;
}

export default {
  hasHypaKeyboardBeenOpened,
  isHypaKeyboardFullAccessGranted,
  showInputMethodPicker,
  isHypaKeyboardEnabled,
  isHypaKeyboardSelected,
};
