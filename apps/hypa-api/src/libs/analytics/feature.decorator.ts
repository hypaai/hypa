import { SetMetadata } from '@nestjs/common';
import { ANALYTICS } from '@hypa/config/analytics';

export const FEATURE_META = 'analytics_feature';

export interface FeatureMeta {
  feature: string;
  capability?: string;
}

export const Feature = (feature: string, capability?: string) => {
  if (!ANALYTICS.features.includes(feature)) {
    throw new Error(`@Feature("${feature}") is not in analytics.json`);
  }
  if (capability && !ANALYTICS.capabilities.includes(capability)) {
    throw new Error(
      `@Feature capability "${capability}" is not in analytics.json`,
    );
  }

  return SetMetadata(FEATURE_META, {
    feature,
    capability,
  } satisfies FeatureMeta);
};
