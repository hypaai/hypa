import { spawn } from 'child_process';

const MAX_AUDIO_BYTES = 32 * 1024 * 1024;
const MAX_AUDIO_SECONDS = 10 * 60;
const FFMPEG_TIMEOUT_MS = 60_000;

export class AudioLimitError extends Error {}

export function pcm16DurationSeconds(wav: Buffer): number {
  if (wav.length < 44 || wav.toString('ascii', 0, 4) !== 'RIFF') return 0;
  let offset = 12;
  while (offset + 8 <= wav.length) {
    const id = wav.toString('ascii', offset, offset + 4);
    const size = wav.readUInt32LE(offset + 4);
    if (id === 'data')
      return Math.min(size, wav.length - offset - 8) / (16_000 * 2);
    offset += 8 + size + (size % 2);
  }
  return 0;
}

export function convertAudioToPcmWav(input: Buffer): Promise<Buffer> {
  if (input.length > MAX_AUDIO_BYTES) {
    return Promise.reject(new AudioLimitError('Audio is larger than 32 MB'));
  }
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn('ffmpeg', [
      '-hide_banner',
      '-loglevel',
      'error',
      '-protocol_whitelist',
      'pipe',
      '-i',
      'pipe:0',
      '-ac',
      '1',
      '-ar',
      '16000',
      '-f',
      'wav',
      '-acodec',
      'pcm_s16le',
      'pipe:1',
    ]);
    const chunks: Buffer[] = [];
    const errors: Buffer[] = [];
    const timer = setTimeout(() => {
      ffmpeg.kill('SIGKILL');
      reject(new Error('ffmpeg timed out'));
    }, FFMPEG_TIMEOUT_MS);
    const maxOutputBytes = MAX_AUDIO_SECONDS * 32_000 + 1024;
    let outputBytes = 0;
    ffmpeg.stdout.on('data', (chunk: Buffer) => {
      outputBytes += chunk.length;
      if (outputBytes > maxOutputBytes) {
        ffmpeg.kill('SIGKILL');
        reject(new AudioLimitError('Audio is longer than 10 minutes'));
        return;
      }
      chunks.push(chunk);
    });
    ffmpeg.stderr.on('data', (chunk: Buffer) => errors.push(chunk));
    ffmpeg.stdin.on('error', reject);
    ffmpeg.on('error', (error) => {
      clearTimeout(timer);
      reject(new Error(`ffmpeg failed to start: ${error.message}`));
    });
    ffmpeg.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(
          new Error(
            Buffer.concat(errors).toString() || `ffmpeg exited ${code}`,
          ),
        );
        return;
      }
      const wav = Buffer.concat(chunks);
      if (wav.length >= 12 && wav.toString('ascii', 0, 4) === 'RIFF') {
        wav.writeUInt32LE(wav.length - 8, 4);
        let offset = 12;
        while (offset + 8 <= wav.length) {
          const size = wav.readUInt32LE(offset + 4);
          if (wav.toString('ascii', offset, offset + 4) === 'data') {
            wav.writeUInt32LE(wav.length - offset - 8, offset + 4);
            break;
          }
          offset += 8 + size + (size % 2);
        }
      }
      if (wav.length > MAX_AUDIO_BYTES) {
        reject(new AudioLimitError('Audio is larger than 32 MB'));
        return;
      }
      if (pcm16DurationSeconds(wav) > MAX_AUDIO_SECONDS) {
        reject(new AudioLimitError('Audio is longer than 10 minutes'));
        return;
      }
      resolve(wav);
    });
    ffmpeg.stdin.end(input);
  });
}
