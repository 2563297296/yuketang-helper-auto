import { repo } from '../state/repo.js';
import { harvestProblemsFromPayload } from '../state/problem-harvest.js';

const HISTORICAL_REPORT_PATH_RE = /^\/api\/v3\/classroom-report\/(?:lesson\/basic-info|student\/(?:lesson-info|detail|review|ppt)|replay)\/?$/;

(function interceptFetch() {
  if (window.__YKT_FETCH_PATCHED__) return;
  window.__YKT_FETCH_PATCHED__ = true;

  const rawFetch = window.fetch;
  window.fetch = async function (...args) {
    const [input, init] = args;
    const url = typeof input === 'string' ? input : input?.url || '';

    // === (1) 打印调试日志，可观察哪些接口走 fetch ===
    if (url.includes('lesson') || url.includes('slide') || url.includes('problem')) {
      console.log('[雨课堂助手][INFO][fetch-interceptor] 捕获请求:', url);
    }

    const resp = await rawFetch.apply(this, args);

    let pathname = '';
    try {
      pathname = new URL(url, location.href).pathname;
    } catch {}
    const isHistoricalReport = HISTORICAL_REPORT_PATH_RE.test(pathname);
    const isRelevantResponse = isHistoricalReport || (
      url.includes('/lesson') ||
      url.includes('/presentation') ||
      url.includes('/slides') ||
      url.includes('/problem')
    );

    if (!resp.ok || !isRelevantResponse) return resp;

    try {
      const cloned = resp.clone();
      const text = await cloned.text();
      // Do not consume the original response stream.
      const json = JSON.parse(text);

      if (isHistoricalReport) {
        harvestProblemsFromPayload(json, repo);
      }

      // Keep the existing live-course slide cache behavior.
      if (json && json.data && Array.isArray(json.data.slides)) {
        const slides = json.data.slides;
        let filled = 0;
        for (const s of slides) {
          const sid = String(s.id);
          if (!repo.slides.has(sid)) {
            repo.slides.set(sid, s);
            filled++;
          }
        }
        console.log(`雨课堂助手][INFO][fetch-interceptor] 已填充 slides ${filled}/${slides.length}`);
      }
    } catch {}

    return resp; // 一定要返回原始 Response
  };

  console.log('[雨课堂助手][INFO][fetch-interceptor] fetch() 已被拦截');
})();
