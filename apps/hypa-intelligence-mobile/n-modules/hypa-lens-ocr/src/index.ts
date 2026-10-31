import { useMemo } from 'react';
import { NitroModules } from 'react-native-nitro-modules';
import type { LensOcr, LensOcrFactory } from './specs/LensOcr.nitro';

export type { LensOcr } from './specs/LensOcr.nitro';

export interface RecognizedLine {
  text: string;
  corners: number[];
}

const factory = NitroModules.createHybridObject<LensOcrFactory>('LensOcrFactory');

export function createLensOcr(): LensOcr {
  return factory.createLensOcr();
}

export function useLensOcr(): LensOcr {
  return useMemo(() => createLensOcr(), []);
}
