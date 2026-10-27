import { useCallback } from 'react';
import { Alert } from 'react-native';

type UseAiConsentOptions = {
  hasConsent: boolean;
  updateBehavior: (value: { aiDataSharingConsent: boolean }) => void;
};

export const useAiConsent = ({ hasConsent, updateBehavior }: UseAiConsentOptions) => {
  const requestAiConsent = useCallback(
    (afterConfirm: () => void) => {
      Alert.alert(
        'Allow AI Data Processing',
        'To translate text and speech, Hypa Intelligence sends request data to Hypa cloud endpoints and model providers used by your selected model.',
        [
          { text: 'Not now', style: 'cancel' },
          {
            text: 'Allow',
            onPress: () => {
              updateBehavior({ aiDataSharingConsent: true });
              setTimeout(afterConfirm, 0);
            },
          },
        ]
      );
    },
    [updateBehavior]
  );

  return useCallback(
    (action: () => void) => {
      if (!hasConsent) {
        requestAiConsent(action);
        return;
      }
      action();
    },
    [hasConsent, requestAiConsent]
  );
};
