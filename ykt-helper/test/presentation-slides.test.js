import assert from 'node:assert/strict';
import test from 'node:test';

import { getVisibleSlides } from '../src/ui/presentation-slides.js';

const slides = [
  { id: '68', index: 68 },
  { id: 69, index: 69, problem: { problemId: 'p-69' } },
  { id: '70', index: 70 },
  { id: '71', index: 71, problem: { problemId: 'p-71' } },
];

test('falls back to all slides when no slide contains a problem', () => {
  const plainSlides = slides.filter(slide => !slide.problem);
  assert.deepEqual(getVisibleSlides(plainSlides), plainSlides);
});

test('shows only problem slides in problem mode', () => {
  assert.deepEqual(
    getVisibleSlides(slides).map(slide => slide.id),
    [69, '71'],
  );
});

test('keeps a selected non-problem slide visible and preserves order', () => {
  assert.deepEqual(
    getVisibleSlides(slides, { currentSlideId: '70' }).map(slide => slide.id),
    [69, '70', '71'],
  );
});

test('matches numeric and string slide ids', () => {
  assert.deepEqual(
    getVisibleSlides(slides, { currentSlideId: 70 }).map(slide => slide.id),
    [69, '70', '71'],
  );
});

test('showAllSlides returns every slide regardless of problem state', () => {
  assert.equal(
    getVisibleSlides(slides, { showAllSlides: true, currentSlideId: '70' }).length,
    slides.length,
  );
});

test('returns an empty list when there are no slides', () => {
  assert.deepEqual(getVisibleSlides([]), []);
  assert.deepEqual(getVisibleSlides(null), []);
});

