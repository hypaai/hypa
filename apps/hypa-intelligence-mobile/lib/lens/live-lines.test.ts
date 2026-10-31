import assert from 'node:assert/strict';
import test from 'node:test';

import { keepsNumbers, LiveLines, normalizeLine } from './live-lines';

const frame = ['OPEN', 'Fresh bread daily'];

test('a line is sent only after it has been on screen for 250 ms', () => {
  const lines = new LiveLines();
  assert.deepEqual(lines.observe(frame, 'French', 0), []);
  assert.deepEqual(lines.observe(frame, 'French', 150), []);
  assert.deepEqual(lines.observe(frame, 'French', 250), frame);
});

test('a line that flickers out restarts its wait', () => {
  const lines = new LiveLines();
  lines.observe(['OPEN'], 'French', 0);
  lines.observe([], 'French', 200);
  assert.deepEqual(lines.observe(['OPEN'], 'French', 300), []);
  assert.deepEqual(lines.observe(['OPEN'], 'French', 550), ['OPEN']);
});

test('a still scene makes one request in 30 seconds', () => {
  const lines = new LiveLines();
  let sent = 0;
  for (let now = 0; now <= 30_000; now += 200) {
    const due = lines.observe(frame, 'French', now);
    sent += due.length;
    if (due.length) {
      lines.resolve('French', due.map((line) => ({ line, translation: `fr:${line}` })));
    }
  }
  assert.equal(sent, frame.length);
  assert.equal(lines.lookup('OPEN', 'French'), 'fr:OPEN');
});

test('only the new or changed line is sent', () => {
  const lines = new LiveLines(0);
  lines.resolve('French', lines.observe(frame, 'French', 0).map((line) => ({ line, translation: line })));
  assert.deepEqual(lines.observe(['OPEN', 'Fresh bread today'], 'French', 100), ['Fresh bread today']);
});

test('a line in flight is not sent again', () => {
  const lines = new LiveLines(0);
  assert.deepEqual(lines.observe(['OPEN'], 'French', 0), ['OPEN']);
  assert.deepEqual(lines.observe(['OPEN'], 'French', 200), []);
});

test('OCR noise in spacing and Unicode form hits the same cache entry', () => {
  const lines = new LiveLines(0);
  lines.resolve('Yoruba', lines.observe(['Ẹ káàbọ̀'], 'Yoruba', 0).map((line) => ({ line, translation: 'Welcome' })));
  assert.deepEqual(lines.observe(['  Ẹ káàbọ̀ '], 'Yoruba', 100), []);
  assert.equal(normalizeLine('a \n b'), 'a b');
});

test('changing the target language translates again, and keeps the old cache', () => {
  const lines = new LiveLines(0);
  lines.resolve('French', lines.observe(['OPEN'], 'French', 0).map((line) => ({ line, translation: 'OUVERT' })));
  assert.deepEqual(lines.observe(['OPEN'], 'Hausa', 100), ['OPEN']);
  assert.deepEqual(lines.observe(['OPEN'], 'French', 200), []);
});

test('a late answer for the previous language does not show under the new one', () => {
  const lines = new LiveLines(0);
  lines.observe(['OPEN'], 'French', 0);
  lines.observe(['OPEN'], 'Hausa', 100);
  lines.resolve('French', [{ line: 'OPEN', translation: 'OUVERT' }]);
  assert.equal(lines.lookup('OPEN', 'Hausa'), undefined);
  assert.equal(lines.lookup('OPEN', 'French'), 'OUVERT');
});

test('a failed request keeps the original and waits before retrying', () => {
  const lines = new LiveLines(0, 5000);
  lines.reject('French', lines.observe(['OPEN'], 'French', 0), 0);
  assert.equal(lines.lookup('OPEN', 'French'), undefined);
  assert.deepEqual(lines.observe(['OPEN'], 'French', 4000), []);
  assert.deepEqual(lines.observe(['OPEN'], 'French', 5000), ['OPEN']);
});

test('a limit sends the rest on later frames without restarting their wait', () => {
  const lines = new LiveLines(500);
  const sign = ['ONE', 'TWO', 'THREE'];
  lines.observe(sign, 'French', 0);
  assert.deepEqual(lines.observe(sign, 'French', 500, 2), ['ONE', 'TWO']);
  assert.deepEqual(lines.observe(sign, 'French', 600, 2), ['THREE']);
  assert.deepEqual(lines.observe(sign, 'French', 700, 2), []);
});

test('lines with no words are never sent', () => {
  const lines = new LiveLines(0);
  assert.deepEqual(lines.observe(['₦2,500', '12/10/2026', '', 'Total ₦2,500'], 'French', 0), ['Total ₦2,500']);
});

test('a translation that changes a number shows the original', () => {
  const lines = new LiveLines(0);
  lines.observe(['Total 2500', 'Closes at 9'], 'French', 0);
  lines.resolve('French', [
    { line: 'Total 2500', translation: 'Total 25000' },
    { line: 'Closes at 9', translation: 'Ferme à 9 h' },
  ]);
  assert.equal(lines.lookup('Total 2500', 'French'), 'Total 2500');
  assert.equal(lines.lookup('Closes at 9', 'French'), 'Ferme à 9 h');
  assert.equal(keepsNumbers('Open 10/31', 'Ouvert 31/10'), true);
});

test('thousands grouping may change between languages, the number may not', () => {
  assert.equal(keepsNumbers('Total 2500', 'Total 2 500'), true);
  assert.equal(keepsNumbers('Total 2,500', 'Total 2 500'), true);
  assert.equal(keepsNumbers('₦1,000,000', '₦1 000 000'), true);
  assert.equal(keepsNumbers('Opens 9:30', 'Ouvre à 9 h 30'), true);
  assert.equal(keepsNumbers('₦12.50', '₦12,50'), true);
  assert.equal(keepsNumbers('₦1.50', '1 naira 50 kobo'), true);
  assert.equal(keepsNumbers('₦1.50', '₦150'), false);
  assert.equal(keepsNumbers('2,500', '25 000'), false);
});

test('a dot is always a decimal point, never a thousands separator', () => {
  assert.equal(keepsNumbers('1.500 kg', '1,5 kg'), false);
  assert.equal(keepsNumbers('1.500 kg', '1 500 kg'), false);
  assert.equal(keepsNumbers('1.500 kg', '1,500 kg'), false);
  assert.equal(keepsNumbers('Take 2.5 ml', 'Prenez 2,5 ml'), true);
  assert.equal(keepsNumbers('₦1.000.000', '₦1 000 000'), false);
});

test('an OCR misread of a translated line reuses its translation without a new request', () => {
  const lines = new LiveLines(0);
  lines.observe(['SUNDAY, 20TH SEPTEMBER, 2026'], 'Yoruba', 0);
  lines.resolve('Yoruba', [{ line: 'SUNDAY, 20TH SEPTEMBER, 2026', translation: 'ỌJỌ́ ÀÌKÚ, 20 SẸ́PTẸ́MBÀ, 2026' }]);
  assert.deepEqual(lines.observe(['SUNDAY, 20TH SEPTEMBEF, 2026'], 'Yoruba', 200), []);
  assert.equal(lines.lookup('SUNDAY, 20TH SEPTEMBEF, 2026', 'Yoruba'), 'ỌJỌ́ ÀÌKÚ, 20 SẸ́PTẸ́MBÀ, 2026');
  assert.equal(lines.lookup('SUNDAY, 20TH SEPTEMBER, 2026', 'French'), undefined);
});

test('a misread of a line still in flight waits for that request', () => {
  const lines = new LiveLines(0);
  assert.deepEqual(lines.observe(['Fresh bread daily'], 'French', 0), ['Fresh bread daily']);
  assert.deepEqual(lines.observe(['Fresh bread dally'], 'French', 200), []);
});

test('a genuinely different line is still sent', () => {
  const lines = new LiveLines(0);
  lines.observe(['OPEN'], 'French', 0);
  assert.deepEqual(lines.observe(['CLOSED'], 'French', 200), ['CLOSED']);
});

test('a captured line shows as loading until its translation arrives', () => {
  const lines = new LiveLines(250);
  assert.equal(lines.isLoading('OPEN', 'French'), true);
  lines.observe(['OPEN'], 'French', 0);
  lines.observe(['OPEN'], 'French', 250);
  assert.equal(lines.isLoading('OPEN', 'French'), true);
  lines.resolve('French', [{ line: 'OPEN', translation: 'OUVERT' }]);
  assert.equal(lines.isLoading('OPEN', 'French'), false);
  assert.equal(lines.isLoading('2026', 'French'), false);
});

test('a failed line stops loading until it is retried', () => {
  const lines = new LiveLines(0);
  lines.observe(['OPEN'], 'French', 0);
  lines.reject('French', ['OPEN'], 0);
  assert.equal(lines.isLoading('OPEN', 'French'), false);
});
