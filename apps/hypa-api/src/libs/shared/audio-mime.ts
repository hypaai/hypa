export function detectAudioMime(bytes: Buffer): string | undefined {
  if (bytes.length < 12) return undefined;
  const header = bytes.toString('ascii', 0, 12);
  if (header.startsWith('RIFF') && header.includes('WAVE')) return 'audio/wav';
  if (header.startsWith('OggS')) return 'audio/ogg';
  if (header.startsWith('fLaC')) return 'audio/flac';
  if (bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) return 'audio/webm';
  if (header.startsWith('ID3')) return 'audio/mpeg';
  const [first, second] = bytes;
  if (first === 0xff && (second & 0xe0) === 0xe0) return 'audio/mpeg';
  if (header.slice(4, 8) === 'ftyp') return 'audio/mp4';
  return undefined;
}

export function detectImageMime(bytes: Buffer): string | undefined {
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png';
  if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';
  if (bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return undefined;
}
