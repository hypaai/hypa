import * as React from 'react';

import {
  addSettingsChangedListener,
  loadKeyboardSettings,
  saveKeyboardSettings,
  type KeyboardSettings,
} from '@/lib/keyboard-settings';

export function useKeyboardSettings() {
  const [settings, setSettingsState] = React.useState<KeyboardSettings | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);

  const refreshSettings = React.useCallback(async () => {
    setIsLoading(true);

    try {
      const nextSettings = await loadKeyboardSettings();
      setSettingsState(nextSettings);
      return nextSettings;
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void refreshSettings();

    const subscription = addSettingsChangedListener(() => {
      void refreshSettings();
    });

    return () => {
      subscription.remove();
    };
  }, [refreshSettings]);

  const setSettings = React.useCallback(async (nextSettings: KeyboardSettings) => {
    setSettingsState(nextSettings);
    await saveKeyboardSettings(nextSettings);
    return nextSettings;
  }, []);

  const updateSettings = React.useCallback(
    async (
      updater:
        | Partial<KeyboardSettings>
        | ((current: KeyboardSettings) => KeyboardSettings)
    ) => {
      const currentSettings = settings ?? (await loadKeyboardSettings());
      const nextSettings =
        typeof updater === 'function'
          ? updater(currentSettings)
          : { ...currentSettings, ...updater };

      setSettingsState(nextSettings);
      await saveKeyboardSettings(nextSettings);
      return nextSettings;
    },
    [settings]
  );

  return {
    isLoading,
    refreshSettings,
    setSettings,
    settings,
    updateSettings,
  };
}
