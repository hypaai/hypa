import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Platform } from 'react-native';
import { type Frame, useFrameOutput } from 'react-native-vision-camera';
import { createSynchronizable, scheduleOnRN, type Synchronizable } from 'react-native-worklets';
import { type RecognizedLine, useLensOcr } from 'hypa-lens-ocr';

import {
  frameToUprightVector,
  type Point,
  type PreviewBasis,
  uprightToFramePoint,
} from '@/lib/lens/frame-points';
import { type LineColors, type LineWeight, type PixelSource, sampleLineColors } from '@/lib/lens/line-colors';
import type { Size } from '@/lib/lens/overlay-geometry';

const OCR_INTERVAL_MS = 200;
const OCR_TIMEOUT_MS = 4000;
const FALLBACK_COLORS: LineColors = { background: '#ffffff', text: '#111111', weight: 'regular' };
const BASIS: Point[] = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }];
const MAX_FRAME_GAP_MS = 200;

export type FrameLine = { text: string; corners: Point[]; background: string; color: string; weight: LineWeight };
export type FrameLines = { image: Size; lines: FrameLine[]; previewBasis: PreviewBasis };
export type MotionState = Point & { vx: number; vy: number; at: number };
export type LensMotion = Synchronizable<MotionState>;

const ignoreDroppedFrame = () => {};

export function useLensFrames({
  paused,
  onLines,
}: {
  paused: boolean;
  onLines: (result: FrameLines) => void;
}) {
  const ocr = useLensOcr();
  const usesSensorCoordinates = Platform.OS === 'android';
  const motion = useMemo(() => createSynchronizable<MotionState>({ x: 0, y: 0, vx: 0, vy: 0, at: 0 }), []);
  const ocrMotion = useMemo(() => createSynchronizable<Point>({ x: 0, y: 0 }), []);
  const ocrStartedAt = useMemo(() => createSynchronizable(0), []);
  const ocrInFlight = useMemo(() => createSynchronizable(false), []);
  const isPaused = useMemo(() => createSynchronizable(false), []);

  useEffect(() => {
    isPaused.setBlocking(paused);
  }, [isPaused, paused]);

  const onLinesRef = useRef(onLines);
  onLinesRef.current = onLines;
  const deliver = useCallback((result: FrameLines) => onLinesRef.current(result), []);

  const onFrame = useCallback(
    (frame: Frame) => {
      'worklet';
      try {
        const now = Date.now();
        const geometry = {
          width: frame.width,
          height: frame.height,
          orientation: frame.orientation,
          isMirrored: frame.isMirrored,
        };

        const last = motion.getDirty();
        let moved: Point = { x: last.x, y: last.y };
        const step = ocr.trackMotion(frame);
        if (step) {
          const [dx, dy] = step.split(' ').map(Number);
          const shift = frameToUprightVector({ x: dx, y: dy }, geometry);
          if (Number.isFinite(shift.x) && Number.isFinite(shift.y)) {
            moved = { x: last.x + shift.x, y: last.y + shift.y };
            const gap = now - last.at;
            const fresh = gap > 0 && gap < MAX_FRAME_GAP_MS;
            const blend = (previous: number, delta: number) => {
              if (!fresh) return 0;
              const velocity = delta / gap;
              if (previous * velocity <= 0) return velocity;
              return previous + (velocity - previous) * (1 - Math.exp(-gap / 25));
            };
            motion.setBlocking({
              x: moved.x,
              y: moved.y,
              vx: blend(last.vx, shift.x),
              vy: blend(last.vy, shift.y),
              at: now,
            });
          }
        }

        const done = ocr.takeRecognition();
        if (done) {
          ocrInFlight.setBlocking(false);
          const recognized = JSON.parse(done) as RecognizedLine[];
          const at = ocrMotion.getDirty();
          const previewBasis = BASIS.map((point) => {
            const raw = uprightToFramePoint(point, geometry);
            return usesSensorCoordinates
              ? frame.convertFramePointToCameraPoint(raw)
              : { x: raw.x / geometry.width, y: raw.y / geometry.height };
          }) as PreviewBasis;
          const sideways = frame.orientation === 'left' || frame.orientation === 'right';
          const image = sideways
            ? { width: frame.height, height: frame.width }
            : { width: frame.width, height: frame.height };
          const pixels: PixelSource | null =
            !frame.isPlanar && frame.hasPixelBuffer
              ? {
                  data: new Uint8Array(frame.getPixelBuffer()),
                  width: frame.width,
                  height: frame.height,
                  bytesPerRow: frame.bytesPerRow,
                  order: frame.pixelFormat === 'rgb-bgra-8-bit' ? 'bgra' : 'rgba',
                }
              : null;

          const lines = recognized.map((line) => {
            const world = [0, 2, 4, 6].map((index) => ({
              x: line.corners[index] - at.x,
              y: line.corners[index + 1] - at.y,
            }));
            const colors = pixels
              ? sampleLineColors(
                  pixels,
                  world.map((point) =>
                    uprightToFramePoint({ x: point.x + moved.x, y: point.y + moved.y }, geometry)
                  )
                )
              : FALLBACK_COLORS;
            return {
              text: line.text,
              corners: world,
              background: colors.background,
              color: colors.text,
              weight: colors.weight,
            };
          });
          scheduleOnRN(deliver, { image, lines, previewBasis });
        }

        const busy = ocrInFlight.getDirty() && now - ocrStartedAt.getDirty() < OCR_TIMEOUT_MS;
        if (!busy && !isPaused.getDirty() && now - ocrStartedAt.getDirty() >= OCR_INTERVAL_MS) {
          if (ocr.startRecognition(frame)) {
            ocrMotion.setBlocking(moved);
            ocrStartedAt.setBlocking(now);
            ocrInFlight.setBlocking(true);
          }
        }
      } catch {
      } finally {
        frame.dispose();
      }
    },
    [deliver, isPaused, motion, ocr, ocrInFlight, ocrMotion, ocrStartedAt, usesSensorCoordinates]
  );

  const frameOutput = useFrameOutput({
    pixelFormat: 'rgb',
    onFrame,
    onFrameDropped: ignoreDroppedFrame,
  });

  return { frameOutput, motion };
}
