const COURSEWARE_CONTAINER_SELECTOR = [
  '#content-page-wrap',
  'section.slides-list',
  '.slides-list',
  '.slide-item',
].join(', ');

const COURSEWARE_IMAGE_SELECTOR = [
  '#content-page-wrap img',
  'section.slides-list img',
  '.slides-list img',
  '.slide-item img',
  'img[alt="cover"]',
].join(', ');

const IMAGE_URL_ATTRIBUTES = [
  'currentSrc',
  'src',
  'data-src',
  'data-original',
  'data-lazy-src',
  'data-url',
];

const RASTER_IMAGE_RE = /\.(?:png|jpe?g|webp|gif|bmp|avif)(?:$|[?#])/i;
const IMAGE_LIKE_PATH_RE = /(?:^|[/_.-])(?:image|images|img|slide|slides|cover|thumbnail)(?:[/_.-]|$)/i;

function safeText(value) {
  return value == null ? '' : String(value).trim();
}

function locationParts(locationLike = {}) {
  if (locationLike && typeof locationLike === 'object') {
    if (locationLike.pathname || locationLike.search || locationLike.hash) {
      return {
        pathname: safeText(locationLike.pathname),
        search: safeText(locationLike.search),
        hash: safeText(locationLike.hash),
      };
    }
    if (locationLike.href) {
      try {
        return locationParts(new URL(locationLike.href));
      } catch {}
    }
  }
  return { pathname: '', search: '', hash: '' };
}

export function isStaticPresentationId(id) {
  return safeText(id).startsWith('static:');
}

export function createStaticPageKey(locationLike = {}) {
  const { pathname, search, hash } = locationParts(locationLike);
  const normalizedPath = (pathname || '/').replace(/\/+$/, '') || '/';
  return `${normalizedPath}${search}${hash}`;
}

function parseUrl(url, baseUrl = '') {
  const raw = safeText(url);
  if (!raw) return null;
  try {
    const fallback = baseUrl || (typeof location !== 'undefined' ? location.href : '');
    return new URL(raw, fallback || undefined);
  } catch {
    return null;
  }
}

export function isCoursewareImageUrl(url, baseUrl = '') {
  const parsed = parseUrl(url, baseUrl);
  if (!parsed || (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')) return false;

  const hostname = parsed.hostname.toLowerCase();
  if (hostname === 'yuketang.cn' || hostname.endsWith('.yuketang.cn')) return true;

  const pathAndQuery = `${parsed.pathname}${parsed.search}`;
  return RASTER_IMAGE_RE.test(pathAndQuery) || IMAGE_LIKE_PATH_RE.test(parsed.pathname);
}

function getAttribute(image, name) {
  try {
    return image?.getAttribute?.(name) || '';
  } catch {
    return '';
  }
}

function getRawImageUrls(image) {
  const values = [];
  if (image?.currentSrc) values.push(image.currentSrc);
  if (image?.src) values.push(image.src);
  for (const attr of IMAGE_URL_ATTRIBUTES) {
    const value = getAttribute(image, attr);
    if (value) values.push(value);
  }
  return values;
}

export function collectCoursewareImageUrls(doc) {
  if (!doc || typeof doc.querySelectorAll !== 'function') return [];

  const baseUrl = safeText(doc.baseURI)
    || safeText(doc.location?.href)
    || (typeof location !== 'undefined' ? location.href : '');
  const urls = [];
  const seen = new Set();

  let images = [];
  try {
    images = Array.from(doc.querySelectorAll(COURSEWARE_IMAGE_SELECTOR));
  } catch {
    return [];
  }

  for (const image of images) {
    for (const rawUrl of getRawImageUrls(image)) {
      const parsed = parseUrl(rawUrl, baseUrl);
      if (!parsed || !isCoursewareImageUrl(parsed.href)) continue;
      if (seen.has(parsed.href)) continue;
      seen.add(parsed.href);
      urls.push(parsed.href);
    }
  }

  return urls;
}

export function isStaticCoursewareDocument(doc) {
  if (!doc || typeof doc.querySelector !== 'function') return false;
  try {
    if (!doc.querySelector(COURSEWARE_CONTAINER_SELECTOR)) return false;
  } catch {
    return false;
  }
  return collectCoursewareImageUrls(doc).length > 0;
}

function presentationEntries(presentations) {
  if (!presentations) return [];
  try {
    if (typeof presentations.entries === 'function') {
      return Array.from(presentations.entries()).map(([id, presentation]) => [
        safeText(id || presentation?.id),
        presentation,
      ]);
    }
    if (Array.isArray(presentations)) {
      return presentations.map((presentation) => [safeText(presentation?.id), presentation]);
    }
    if (typeof presentations === 'object') {
      return Object.entries(presentations).map(([id, presentation]) => [safeText(id), presentation]);
    }
  } catch {}
  return [];
}

function staticPresentationEntries(presentations) {
  return presentationEntries(presentations)
    .filter(([id, presentation]) => isStaticPresentationId(id || presentation?.id))
    .filter(([, presentation]) => presentation && Array.isArray(presentation.slides));
}

export function pickStaticPresentation(presentations, options = {}) {
  const entries = staticPresentationEntries(presentations);
  if (!entries.length) return null;

  const currentId = safeText(options.currentPresentationId);
  if (isStaticPresentationId(currentId)) {
    const current = entries.find(([id]) => id === currentId);
    if (current) return current[1];
  }

  return entries[0][1];
}

export function pickStaticFallbackSlide(presentations, options = {}) {
  const entries = staticPresentationEntries(presentations);
  if (!entries.length) return null;

  const currentSlideId = safeText(options.currentSlideId);
  const currentPresentation = pickStaticPresentation(presentations, options);
  const currentEntry = entries.find(([, presentation]) => presentation === currentPresentation);
  const orderedEntries = currentEntry
    ? [currentEntry, ...entries.filter((entry) => entry !== currentEntry)]
    : entries;

  if (currentSlideId) {
    for (const [, presentation] of orderedEntries) {
      const slide = presentation.slides.find((candidate) => safeText(candidate?.id) === currentSlideId);
      if (slide) return { presentation, slide };
    }
  }

  for (const [, presentation] of orderedEntries) {
    if (presentation.slides.length > 0) {
      return { presentation, slide: presentation.slides[0] };
    }
  }

  return null;
}
