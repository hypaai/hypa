import assert from 'node:assert/strict';
import test from 'node:test';
import { holdSize, PALETTE_SWITCH_FRAMES, scenePalette, StickyOverlay } from './sticky-overlay';

const paper = { background: '#f0ece0', color: '#222222', weight: 'regular' as const };
const inverted = { background: '#5a4a30', color: '#f2eee2', weight: 'regular' as const };
const dark = { background: '#202020', color: '#f5f5f5', weight: 'bold' as const };
const size = (length: number, thickness = 20) => ({ length, thickness });
const at = (id: number, look = paper) => ({ ...look, id });

test('every line on a page shares one palette, even one sampled inverted', () => {
  const sticky = new StickyOverlay();
  sticky.begin('Yoruba', [at(1), at(2), at(3, inverted)]);
  const odd = sticky.place(3, inverted, size(100));
  assert.equal(odd.background, sticky.place(1, paper, size(100)).background);
  assert.ok(Number.parseInt(odd.background.slice(1, 3), 16) > 200);
});

test('the palette holds while the phone moves and switches only for a new page', () => {
  const sticky = new StickyOverlay();
  sticky.begin('Yoruba', [at(1)]);
  const first = sticky.place(1, paper, size(100)).background;
  sticky.begin('Yoruba', [at(1, dark)]);
  assert.equal(sticky.place(1, dark, size(100)).background, first);
  for (let i = 1; i < PALETTE_SWITCH_FRAMES; i++) sticky.begin('Yoruba', [at(1, dark)]);
  assert.equal(sticky.place(1, dark, size(100)).background, '#202020');
});

test('the translation changes only when a new one arrives', () => {
  const sticky = new StickyOverlay();
  sticky.begin('French', [at(1)]);
  sticky.place(1, paper, size(100), 'Bonjour');
  assert.equal(sticky.place(1, paper, size(100)).text, 'Bonjour');
  assert.equal(sticky.place(1, paper, size(100), 'Salut').text, 'Salut');
});

test('patches grow at once and ignore small shrinks', () => {
  assert.equal(holdSize(100, 110), 110);
  assert.equal(holdSize(100, 90), 100);
  assert.equal(holdSize(100, 70), 70);
  assert.equal(holdSize(undefined, 90), 90);
});

test('low-contrast text gets readable ink', () => {
  assert.equal(scenePalette([{ background: '#e0e0e0', color: '#c8c8c8', weight: 'regular' }])?.color, '#111111');
});

test('clear, a dropped line or a new language starts fresh', () => {
  const sticky = new StickyOverlay();
  sticky.begin('French', [at(1)]);
  sticky.place(1, paper, size(100), 'Bonjour');
  sticky.begin('French', []);
  assert.equal(sticky.place(1, paper, size(100)).text, undefined);
  sticky.place(1, paper, size(100), 'Bonjour');
  sticky.begin('Spanish', [at(1)]);
  assert.equal(sticky.place(1, paper, size(100)).text, undefined);
  sticky.clear();
  sticky.begin('Spanish', [at(1, dark)]);
  assert.equal(sticky.place(1, dark, size(100)).background, '#202020');
});
