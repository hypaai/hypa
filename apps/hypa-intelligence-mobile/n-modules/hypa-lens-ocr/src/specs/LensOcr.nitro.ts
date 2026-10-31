import type { HybridObject } from 'react-native-nitro-modules';
import type { Frame } from 'react-native-vision-camera';

export interface LensOcr extends HybridObject<{ ios: 'swift'; android: 'kotlin' }> {
  startRecognition(frame: Frame): boolean;
  takeRecognition(): string;
  trackMotion(frame: Frame): string;
}

export interface LensOcrFactory extends HybridObject<{ ios: 'swift'; android: 'kotlin' }> {
  createLensOcr(): LensOcr;
}
