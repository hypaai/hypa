import { useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';

import {
  hasHypaKeyboardBeenOpened,
  isHypaKeyboardEnabled,
  isHypaKeyboardFullAccessGranted,
  isHypaKeyboardSelected,
} from 'hypa-keyboard-input-method-picker';

type HypaKeyboardStatus = {
  enabled: boolean;
  fullAccess: boolean;
  opened: boolean;
  selected: boolean;
};

function logIosDebug(message: string, payload?: unknown) {
  if (__DEV__ && Platform.OS === 'ios') {
    console.log(`[HypaKeyboardStatus] ${message}`, payload ?? '');
  }
}

function readHypaKeyboardStatus(): HypaKeyboardStatus {
  try {
    const selected = Platform.OS === 'ios' ? false : isHypaKeyboardSelected();
    const nextStatus = {
      enabled: isHypaKeyboardEnabled(),
      fullAccess: isHypaKeyboardFullAccessGranted(),
      opened: Platform.OS === 'ios' ? hasHypaKeyboardBeenOpened() : selected,
      selected,
    };
    logIosDebug('read', nextStatus);
    return nextStatus;
  } catch (error) {
    logIosDebug('read failed', error);
    return { enabled: false, fullAccess: false, opened: false, selected: false };
  }
}

export function useHypaKeyboardStatus() {
  const [status, setStatus] = useState<HypaKeyboardStatus>(() => readHypaKeyboardStatus());

  const refresh = () => {
    const nextStatus = readHypaKeyboardStatus();
    logIosDebug('refresh', nextStatus);
    setStatus(nextStatus);
  };

  useEffect(() => {
    refresh();

    const subscription = AppState.addEventListener('change', (nextState) => {
      logIosDebug('appState', nextState);
      if (nextState === 'active') {
        refresh();
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);

  return {
    ...status,
    refresh,
  };
}
