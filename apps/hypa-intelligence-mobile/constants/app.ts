import Constants from 'expo-constants';
import { PRODUCT_MODEL_OPTIONS_BY_CAPABILITY as modelsConfig } from "@hypa/config/models";
import {
  DEFAULT_MODEL_PROVIDER,
  resolveDefaultModelNameFromProviderMap,
} from '@hypa/config/settings-resolvers';
import { KeyboardThemeColors } from '@/n-modules/hypa-keyboard-storage';

export const KEYBOARD_AUTH_REDIRECT_URL = 'hypaintelligence://auth/callback';

export const APP_ID = 'intelligence-app';

export const REFERRAL_APP_LINK = 'https://hypaintelligence.com/refer';

const ANDROID_PACKAGE = 'com.hypaintelligence.hypaintelligence';

const IOS_APP_STORE_ID = '6776767582';

export const PLAY_STORE_URL = `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}`;
export const APP_STORE_URL = IOS_APP_STORE_ID
  ? `https://apps.apple.com/app/id${IOS_APP_STORE_ID}`
  : 'https://hypaintelligence.com';

export function buildPlayStoreReferralUrl(code: string): string {
  const referrer = new URLSearchParams({ ref: code, app: APP_ID }).toString();
  return `${PLAY_STORE_URL}&referrer=${encodeURIComponent(referrer)}`;
}

export const REFERRAL_POINTS_REWARD = 10;

export const buildReferralRewardSummary = (pointsReward: number): string =>
  `Invite friends to Hypa. Each friend who signs up with your code earns you ${pointsReward} Hypa points.`;

type ExpoApplicationModule = {
  nativeApplicationVersion?: string | null;
  nativeBuildVersion?: string | null;
};

function getExpoApplication(): ExpoApplicationModule | null {
  try {
    return require('expo-application') as ExpoApplicationModule;
  } catch {
    return null;
  }
}

const expoApplication = getExpoApplication();
const appVersion =
  expoApplication?.nativeApplicationVersion ?? Constants.expoConfig?.version ?? '0.0.1';
const buildVersion = expoApplication?.nativeBuildVersion ?? '1';

export const VERSION_BUILD = `${
  Constants.expoConfig?.name ?? 'Hypa Intelligence'
} v${appVersion} (Build ${buildVersion})`;

export type LanguagePreset = {
  id: string;
  name: string;
  nativeName: string;
};

const modelsAny = modelsConfig as any;

export { DEFAULT_MODEL_PROVIDER };

export const DEFAULT_TRANSLATION_MODEL = resolveDefaultModelNameFromProviderMap(
  modelsAny.MT,
  DEFAULT_MODEL_PROVIDER
);

export const DEFAULT_DICTIONARY_MODEL = resolveDefaultModelNameFromProviderMap(
  modelsAny.AC,
  DEFAULT_MODEL_PROVIDER
);

export const DEFAULT_TTS_MODEL = resolveDefaultModelNameFromProviderMap(
  modelsAny.TTS,
  DEFAULT_MODEL_PROVIDER
);

export const DEFAULT_STT_MODEL = resolveDefaultModelNameFromProviderMap(
  modelsAny.ASR,
  DEFAULT_MODEL_PROVIDER
);

type ModelEntry = { name: string; displayName: string; default?: boolean };
type ProviderMap = Record<string, ModelEntry[]>;

export function modelsForProviderOrDefault(
  providerMap: ProviderMap,
  provider: string
): ModelEntry[] {
  const selectedModels = providerMap[provider] ?? [];
  return selectedModels.length > 0 ? selectedModels : (providerMap[DEFAULT_MODEL_PROVIDER] ?? []);
}

const allProviderNames = Array.from(
  new Set([
    ...Object.keys(modelsConfig.AC ?? {}),
    ...Object.keys(modelsConfig.MT ?? {}),
    ...Object.keys(modelsConfig.TTS ?? {}),
    ...Object.keys(modelsConfig.ASR ?? {}),
  ])
);

const PROVIDER_DISPLAY: Record<string, string> = {
  hypaai: 'Hypa AI',
  openai: 'OpenAI',
  google: 'Google',
  yarnGPT: 'YarnGPT',
  mansa: 'Mansa',
};

export const PROVIDERS = allProviderNames.map((name) => ({
  name,
  displayName: PROVIDER_DISPLAY[name] ?? name,
}));

export const ALL_LLM_MODELS: ProviderMap = Object.fromEntries(
  Object.entries(modelsConfig.MT ?? {}).map(([provider, models]) => [
    provider,
    (models as any[]).map((m) => ({
      name: m.name,
      displayName: m.displayName,
      default: m.default,
    })),
  ])
);

export const ALL_DICTIONARY_MODELS: ProviderMap = Object.fromEntries(
  Object.entries(modelsConfig.AC ?? {}).map(([provider, models]) => [
    provider,
    (models as any[]).map((m) => ({
      name: m.name,
      displayName: m.displayName,
      default: m.default,
    })),
  ])
);

export const ALL_TTS_MODELS: ProviderMap = Object.fromEntries(
  Object.entries(modelsConfig.TTS ?? {}).map(([provider, models]) => [
    provider,
    (models as any[]).map((m) => ({
      name: m.name,
      displayName: m.displayName,
      default: m.default,
    })),
  ])
);

export const ALL_STT_MODELS: ProviderMap = Object.fromEntries(
  Object.entries(modelsConfig.ASR ?? {}).map(([provider, models]) => [
    provider,
    (models as any[]).map((m) => ({
      name: m.name,
      displayName: m.displayName,
      default: m.default,
    })),
  ])
);

export const APPEARANCES = ['system', 'light', 'dark'] as const;
export type Appearance = (typeof APPEARANCES)[number];

type ThemePreset = {
  id: string;
  name: string;
  appearance: Appearance;
  dark: KeyboardThemeColors;
  light: KeyboardThemeColors;
};

const THEME_PALETTES: Record<string, { dark: KeyboardThemeColors; light: KeyboardThemeColors }> = {
  default: {
    dark: {
      surface: '#1A1A1A',
      toolbar: '#515151',
      key: '#515151',
      keyPressed: '#444444',
      label: '#FFFFFF',
      accent: '#515151',
      pill: '#FFFFFF',
      pillLabel: '#111111',
    },
    light: {
      surface: '#D1D5DB',
      toolbar: '#FFFFFF',
      key: '#FFFFFF',
      keyPressed: '#E5E7EB',
      label: '#111111',
      accent: '#6B7280',
      pill: '#111111',
      pillLabel: '#FFFFFF',
    },
  },
  midnight: {
    dark: {
      surface: '#121214',
      toolbar: '#18181B',
      key: '#2C2C31',
      keyPressed: '#38383E',
      label: '#EAEAEE',
      accent: '#3B82F6',
      pill: '#F4F4F5',
      pillLabel: '#09090B',
    },
    light: {
      surface: '#E4E6EC',
      toolbar: '#FFFFFF',
      key: '#FFFFFF',
      keyPressed: '#E1E4EA',
      label: '#09090B',
      accent: '#3B82F6',
      pill: '#18181B',
      pillLabel: '#FAFAFA',
    },
  },
  forest: {
    dark: {
      surface: '#14281D',
      toolbar: '#1F3B2D',
      key: '#274635',
      keyPressed: '#335743',
      label: '#F5F5F4',
      accent: '#84CC16',
      pill: '#E7F5D1',
      pillLabel: '#1F2937',
    },
    light: {
      surface: '#DDE7DF',
      toolbar: '#FFFFFF',
      key: '#F4F8F3',
      keyPressed: '#DCE7DC',
      label: '#14281D',
      accent: '#4D7C0F',
      pill: '#1F3B2D',
      pillLabel: '#E7F5D1',
    },
  },
  sunset: {
    dark: {
      surface: '#241623',
      toolbar: '#372036',
      key: '#4A2C49',
      keyPressed: '#61385F',
      label: '#FFF7ED',
      accent: '#F97316',
      pill: '#FED7AA',
      pillLabel: '#7C2D12',
    },
    light: {
      surface: '#F0E2EC',
      toolbar: '#FFFFFF',
      key: '#FDF6F8',
      keyPressed: '#EFE0E9',
      label: '#241623',
      accent: '#EA580C',
      pill: '#7C2D12',
      pillLabel: '#FED7AA',
    },
  },
};

export const THEME_PRESETS: ThemePreset[] = [
  { id: 'system', name: 'System', appearance: 'system', ...THEME_PALETTES.default },
  { id: 'default', name: 'Default', appearance: 'dark', ...THEME_PALETTES.default },
  {
    id: 'default-light',
    name: 'Default Light',
    appearance: 'light',
    ...THEME_PALETTES.default,
  },
  { id: 'midnight', name: 'Midnight', appearance: 'dark', ...THEME_PALETTES.midnight },
  {
    id: 'midnight-light',
    name: 'Midnight Light',
    appearance: 'light',
    ...THEME_PALETTES.midnight,
  },
  { id: 'forest', name: 'Forest', appearance: 'dark', ...THEME_PALETTES.forest },
  {
    id: 'forest-light',
    name: 'Forest Light',
    appearance: 'light',
    ...THEME_PALETTES.forest,
  },
  { id: 'sunset', name: 'Sunset', appearance: 'dark', ...THEME_PALETTES.sunset },
  {
    id: 'sunset-light',
    name: 'Sunset Light',
    appearance: 'light',
    ...THEME_PALETTES.sunset,
  },
];
