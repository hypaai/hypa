import type { EventSubscription } from 'react-native';
import { Platform } from 'react-native';
import { NativeModule, requireNativeModule } from 'expo';

import type { HypaKeyboardStorageModuleEvents } from './HypaKeyboardStorage.types';

declare class HypaKeyboardStorageNative extends NativeModule<HypaKeyboardStorageModuleEvents> {
  getSettingsJson(): string;
  setSettingsJson(json: string): Promise<void>;
  getSharedStoreJson(): string;
  setSharedStoreJson(json: string): Promise<void>;
  drainDebugEvents?: () => Array<{
    message: string;
    groupId: string;
    source: string;
    timestamp: number;
  }>;
  addListener<EventName extends keyof HypaKeyboardStorageModuleEvents>(
    eventName: EventName,
    listener: HypaKeyboardStorageModuleEvents[EventName],
  ): EventSubscription;
}

const native = requireNativeModule<HypaKeyboardStorageNative>('HypaKeyboardStorage');

type RemovableSubscription = {
  remove(): void;
};

function logIosDebug(message: string, payload?: unknown) {
  if (__DEV__ && Platform.OS === 'ios') {
    console.log(`[HypaKeyboardStorage] ${message}`, payload ?? '');
  }
}

export function getSettingsJson(): string {
  const json = native.getSettingsJson();
  logIosDebug('getSettingsJson', json);
  return json;
}

export async function setSettingsJson(json: string): Promise<void> {
  logIosDebug('setSettingsJson', json);
  await native.setSettingsJson(json);
}

export function getSharedStoreJson(): string {
  return native.getSharedStoreJson();
}

export async function setSharedStoreJson(json: string): Promise<void> {
  await native.setSharedStoreJson(json);
}

export function addSharedStoreChangedListener(
  listener: HypaKeyboardStorageModuleEvents['sharedStoreChanged'],
): EventSubscription {
  return native.addListener('sharedStoreChanged', listener);
}

export function addSettingsChangedListener(
  listener: HypaKeyboardStorageModuleEvents['settingsChanged'],
): EventSubscription {
  logIosDebug('addSettingsChangedListener');
  return native.addListener('settingsChanged', listener);
}

export function addDebugLogListener(
  listener: HypaKeyboardStorageModuleEvents['debugLog'],
): EventSubscription {
  logIosDebug('addDebugLogListener');
  if (typeof native.addListener !== 'function') {
    return { remove() {} } as EventSubscription;
  }
  return native.addListener('debugLog', listener);
}

export function drainDebugEvents(): NonNullable<
  ReturnType<NonNullable<HypaKeyboardStorageNative['drainDebugEvents']>>
> {
  if (typeof native.drainDebugEvents !== 'function') {
    return [];
  }
  const events = native.drainDebugEvents();
  events.forEach((event) => logIosDebug(event.message, event));
  return events;
}

export function startKeyboardStorageDebugLogging(intervalMs = 1000): RemovableSubscription {
  if (Platform.OS !== 'ios') {
    return { remove() {} };
  }

  const nativeSubscription = addDebugLogListener((event) => {
    logIosDebug(event.message, event);
  });
  const timer = setInterval(() => {
    drainDebugEvents();
  }, intervalMs);

  return {
    remove() {
      clearInterval(timer);
      nativeSubscription.remove();
    },
  };
}

export default native;
