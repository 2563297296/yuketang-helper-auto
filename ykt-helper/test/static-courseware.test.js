import assert from 'node:assert/strict';
import test from 'node:test';

import {
  collectCoursewareImageUrls,
  createStaticPageKey,
  isCoursewareImageUrl,
  isStaticCoursewareDocument,
  pickStaticFallbackSlide,
  pickStaticPresentation,
} from '../src/ui/static-courseware.js';

function makeImage({ src = '', currentSrc = '', attrs = {} } = {}) {
  return {
    src,
    currentSrc,
    getAttribute(name) {
      return attrs[name] || '';
    },
  };
}

function makeDocument({ url, hasContainer = true, images = [] }) {
  const location = new URL(url);
  return {
    baseURI: location.href,
    location,
    querySelector() {
      return hasContainer ? {} : null;
    },
    querySelectorAll() {
      return images;
    },
  };
}

const coursewareImage = makeImage({
  src: 'https://thu-private-qn.yuketang.cn/image/cover12_960_540.jpg',
});

test('normalizes report URLs with and without a trailing slash to one page key', () => {
  const withSlash = createStaticPageKey(new URL('https://www.yuketang.cn/v2/web/student-lesson-report/abc/'));
  const withoutSlash = createStaticPageKey(new URL('https://www.yuketang.cn/v2/web/student-lesson-report/abc'));
  assert.equal(withSlash, '/v2/web/student-lesson-report/abc');
  assert.equal(withSlash, withoutSlash);
});

test('keeps static slide ID prefixes unique across different course pages', () => {
  const report = createStaticPageKey(new URL('https://www.yuketang.cn/v2/web/student-lesson-report/abc'));
  const replay = createStaticPageKey(new URL('https://www.yuketang.cn/v2/web/student-lesson-replay/def'));
  const ended = createStaticPageKey(new URL('https://www.yuketang.cn/v2/web/student-lesson-detail/ghi'));

  const ids = [report, replay, ended].map(pageKey => `static:${pageKey}:1`);
  assert.equal(new Set(ids).size, ids.length);
});

test('recognizes courseware on report, replay, and ended-course pages', () => {
  const pages = [
    'https://www.yuketang.cn/v2/web/student-lesson-report/abc/',
    'https://www.yuketang.cn/v2/web/student-lesson-report/abc',
    'https://www.yuketang.cn/v2/web/student-lesson-replay/def',
    'https://www.yuketang.cn/v2/web/student-lesson-detail/ghi',
    'https://www.yuketang.cn/lesson/fullscreen/v3/123456',
  ];

  for (const url of pages) {
    const doc = makeDocument({ url, images: [coursewareImage] });
    assert.equal(isStaticCoursewareDocument(doc), true, url);
    assert.deepEqual(collectCoursewareImageUrls(doc), [
      'https://thu-private-qn.yuketang.cn/image/cover12_960_540.jpg',
    ]);
  }
});

test('does not treat an ordinary page without a courseware container as static courseware', () => {
  const doc = makeDocument({
    url: 'https://www.yuketang.cn/v2/web/student-index',
    hasContainer: false,
    images: [coursewareImage],
  });
  assert.equal(isStaticCoursewareDocument(doc), false);
});

test('does not treat an empty courseware container as static courseware', () => {
  const doc = makeDocument({
    url: 'https://www.yuketang.cn/v2/web/student-index',
    images: [],
  });
  assert.equal(isStaticCoursewareDocument(doc), false);
});

test('collects relative lazy-loaded Yuketang courseware images', () => {
  const doc = makeDocument({
    url: 'https://www.yuketang.cn/v2/web/student-lesson-replay/def',
    images: [
      makeImage({ src: '/image/cover1.png' }),
      makeImage({ attrs: { 'data-src': '/image/cover2.webp' } }),
      makeImage({ src: '/image/cover1.png' }),
    ],
  });

  assert.deepEqual(collectCoursewareImageUrls(doc), [
    'https://www.yuketang.cn/image/cover1.png',
    'https://www.yuketang.cn/image/cover2.webp',
  ]);
  assert.equal(isCoursewareImageUrl('https://cdn.example.com/live/cover2.webp'), true);
  assert.equal(isCoursewareImageUrl('javascript:alert(1)'), false);
});

test('prefers the currently selected static presentation', () => {
  const presentations = new Map([
    ['static:/report/a', { id: 'static:/report/a', slides: [{ id: 'static:/report/a:1' }] }],
    ['static:/replay/b', {
      id: 'static:/replay/b',
      slides: [
        { id: 'static:/replay/b:1' },
        { id: 'static:/replay/b:2' },
      ],
    }],
  ]);

  const picked = pickStaticPresentation(presentations, {
    currentPresentationId: 'static:/replay/b',
  });
  assert.equal(picked.id, 'static:/replay/b');
});

test('falls back to the current slide, then the first static courseware page', () => {
  const first = { id: 'static:/report/a', slides: [{ id: 'static:/report/a:1' }] };
  const second = {
    id: 'static:/replay/b',
    slides: [{ id: 'static:/replay/b:1' }, { id: 'static:/replay/b:2' }],
  };
  const presentations = new Map([[first.id, first], ['live-1', { id: 'live-1', slides: [] }], [second.id, second]]);

  assert.equal(pickStaticFallbackSlide(presentations, {
    currentPresentationId: second.id,
    currentSlideId: 'static:/replay/b:2',
  }).slide.id, 'static:/replay/b:2');

  assert.equal(pickStaticFallbackSlide(presentations, {
    currentPresentationId: 'live-1',
  }).slide.id, 'static:/report/a:1');
});

test('returns null when no static courseware is available', () => {
  assert.equal(pickStaticFallbackSlide(new Map(), {}), null);
  assert.equal(pickStaticFallbackSlide(new Map([
    ['live-1', { id: 'live-1', slides: [{ id: 'live-1:1' }] }],
  ]), {}), null);
});