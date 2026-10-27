import { router } from 'expo-router';

export const withReturnTo = (returnTo: string) => ({ returnTo });

export const goBackOrReturnTo = (
  returnTo?: string | string[],
  fallback: string = '/home'
) => {
  const target = Array.isArray(returnTo) ? returnTo[0] : returnTo;

  if (target) {
    router.replace(target as any);
    return;
  }

  if (router.canGoBack()) {
    router.back();
    return;
  }

  router.replace(fallback as any);
};
