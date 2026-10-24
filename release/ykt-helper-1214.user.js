// ==UserScript==
// @name         AI雨课堂助手（JS版）
// @namespace    https://github.com/ZaytsevZY/yuketang-helper-auto
// @version      1.21.4
// @description  课堂习题提示，AI解答习题
// @license      MIT
// @icon         https://www.google.com/s2/favicons?sz=64&domain=yuketang.cn
// @match        https://www.yuketang.cn/
// @match        https://pro.yuketang.cn/
// @match        https://changjiang.yuketang.cn/
// @match        https://www.yuketang.cn/m/v2*
// @match        https://pro.yuketang.cn/m/v2*
// @match        https://changjiang.yuketang.cn/m/v2*
// @match        https://pro.yuketang.cn/web/*
// @match        https://changjiang.yuketang.cn/web/*
// @match        https://*.yuketang.cn/lesson/fullscreen/v3/*
// @match        https://*.yuketang.cn/v2/web/*
// @match        https://www.yuketang.cn/lesson/fullscreen/v3/*
// @match        https://www.yuketang.cn/v2/web/*
// @match        https://pro.yuketang.cn/lesson/fullscreen/v3/*
// @match        https://pro.yuketang.cn/v2/web/*
// @match        https://pro.yuketang.cn/v2/web/index
// @match        https://pro.yuketang.cn/v2/web/student-lesson-report/*
// @match        https://changjiang.yuketang.cn/lesson/fullscreen/v3/*
// @match        https://changjiang.yuketang.cn/v2/web/*
// @match        https://changjiang.yuketang.cn/v2/web/index
// @match        https://changjiang.yuketang.cn/v2/web/student-lesson-report/*
// @grant        GM_addStyle
// @grant        GM_notification
// @grant        GM_xmlhttpRequest
// @grant        GM_openInTab
// @grant        GM_getTab
// @grant        GM_getTabs
// @grant        GM_saveTab
// @grant        unsafeWindow
// @run-at       document-start
// @require      https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js
// @require      https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-svg.min.js
// ==/UserScript==
(function() {
  "use strict";
  // src/core/env.js
    const gm = {
    notify(opt) {
      if (typeof window.GM_notification === "function") {
        window.GM_notification(opt);
        return;
      }
      // On mobile userscript hosts that do not expose GM_notification, use an
      // already-granted browser notification permission.  Never request it
      // automatically: the user controls that permission in the browser.
            try {
        if (window.Notification?.permission !== "granted") return;
        const notice = new window.Notification(opt?.title || "雨课堂提醒", {
          body: opt?.text || "",
          icon: opt?.image || void 0
        });
        if (opt?.timeout > 0) setTimeout(() => notice.close?.(), opt.timeout);
      } catch {}
    },
    addStyle(css) {
      if (typeof window.GM_addStyle === "function") window.GM_addStyle(css); else {
        const s = document.createElement("style");
        s.textContent = css;
        document.head.appendChild(s);
      }
    },
    xhr(opt) {
      if (typeof window.GM_xmlhttpRequest === "function") return window.GM_xmlhttpRequest(opt);
      throw new Error("GM_xmlhttpRequest is not available");
    },
    uw: window.unsafeWindow || window
  };
  function loadScriptOnce(src) {
    return new Promise((resolve, reject) => {
      if ([ ...document.scripts ].some(s => s.src === src)) return resolve();
      const s = document.createElement("script");
      s.src = src;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error(`Failed to load: ${src}`));
      document.head.appendChild(s);
    });
  }
  async function ensureHtml2Canvas() {
    const w = gm.uw || window;
    if (typeof w.html2canvas === "function") return w.html2canvas;
    await loadScriptOnce("https://html2canvas.hertzen.com/dist/html2canvas.min.js");
    const h2c = w.html2canvas?.default || w.html2canvas;
    if (typeof h2c === "function") return h2c;
    throw new Error("html2canvas 未正确加载");
  }
  async function ensureJsPDF() {
    if (window.jspdf?.jsPDF) return window.jspdf;
    await loadScriptOnce("https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js");
    if (!window.jspdf?.jsPDF) throw new Error("jsPDF 未加载成功");
    return window.jspdf;
  }
  // src/core/reminder-preferences.js
    const EVENT_PREFERENCE_KEYS = {
    "problem-start": "notifyProblemStarts",
    "assessment-publish": "notifyAssessmentPublishes",
    "courseware-publish": "notifyCoursewarePublishes",
    "other-publish": "notifyOtherPublishes",
    "lesson-finished": "notifyLessonFinished",
    "auto-answer-scheduled": "notifyAutoAnswerScheduled",
    "auto-answer-started": "notifyAutoAnswerStarted",
    "auto-answer-succeeded": "notifyAutoAnswerSucceeded",
    "auto-answer-failed": "notifyAutoAnswerFailed"
  };
  const REMINDER_DEFAULTS = {
    // 兼容旧版工具栏铃铛：关闭后静音所有课堂提醒。
    notifyProblems: true,
    // 事件开关
    notifyProblemStarts: true,
    notifyAssessmentPublishes: true,
    notifyCoursewarePublishes: true,
    notifyOtherPublishes: true,
    notifyLessonFinished: true,
    notifyAutoAnswerScheduled: true,
    notifyAutoAnswerStarted: true,
    notifyAutoAnswerSucceeded: true,
    notifyAutoAnswerFailed: true,
    // 提醒方式开关
    notifyNative: true,
    notifyPopup: true,
    notifySound: true
  };
  const REMINDER_EVENT_OPTIONS = [ {
    kind: "problem-start",
    key: "notifyProblemStarts",
    label: "新题 / 答题开始",
    detail: "老师开启一道可作答的习题时提醒。"
  }, {
    kind: "assessment-publish",
    key: "notifyAssessmentPublishes",
    label: "考试 / 测试题组发布",
    detail: "老师发布测试、考试或题组时提醒。"
  }, {
    kind: "courseware-publish",
    key: "notifyCoursewarePublishes",
    label: "新课件发布",
    detail: "只在老师发布新课件时提醒；翻阅旧课件和翻页不会提醒。"
  }, {
    kind: "other-publish",
    key: "notifyOtherPublishes",
    label: "其他课堂发布",
    detail: "服务器发送无法细分的发布事件时提醒。"
  }, {
    kind: "lesson-finished",
    key: "notifyLessonFinished",
    label: "课程结束",
    detail: "老师结束当前课程时提醒。"
  }, {
    kind: "auto-answer-scheduled",
    key: "notifyAutoAnswerScheduled",
    label: "自动作答已排队",
    detail: "脚本已经为新题安排延迟作答时提醒。"
  }, {
    kind: "auto-answer-started",
    key: "notifyAutoAnswerStarted",
    label: "自动作答开始",
    detail: "脚本开始调用本地或 AI 作答流程时提醒。"
  }, {
    kind: "auto-answer-succeeded",
    key: "notifyAutoAnswerSucceeded",
    label: "自动作答成功",
    detail: "答案提交成功时提醒。"
  }, {
    kind: "auto-answer-failed",
    key: "notifyAutoAnswerFailed",
    label: "自动作答失败",
    detail: "截图、AI 分析或提交失败时提醒。"
  } ];
  const REMINDER_CHANNEL_OPTIONS = [ {
    key: "notifyNative",
    label: "系统通知",
    detail: "调用浏览器 / 篡改猴的原生通知。"
  }, {
    key: "notifyPopup",
    label: "页面弹窗",
    detail: "在当前页面右下角显示提醒卡片。"
  }, {
    key: "notifySound",
    label: "提示声音",
    detail: "播放内置或自定义的提示音。"
  } ];
  const REMINDER_SETTING_KEYS = [ "notifyProblems", ...REMINDER_EVENT_OPTIONS.map(item => item.key), ...REMINDER_CHANNEL_OPTIONS.map(item => item.key) ];
  function isReminderEnabled(kind, config = {}) {
    const key = EVENT_PREFERENCE_KEYS[kind];
    if (!key || config.notifyProblems === false) return false;
    return config[key] !== false;
  }
  function getReminderChannels(config = {}) {
    return {
      native: config.notifyNative !== false,
      popup: config.notifyPopup !== false,
      sound: config.notifySound !== false
    };
  }
  /** Keep an explicit 0-volume choice instead of falling back to the default. */  function getReminderVolume(config = {}) {
    const rawValue = config.notifyVolume;
    if (rawValue === "" || rawValue === void 0 || rawValue === null) return .6;
    const value = Number(rawValue);
    if (!Number.isFinite(value)) return .6;
    return Math.max(0, Math.min(1, value));
  }
  // src/core/types.js
    const PROBLEM_TYPE_MAP = {
    1: "单选题",
    2: "多选题",
    3: "投票题",
    4: "填空题",
    5: "主观题"
  };
  const DEFAULT_CONFIG = {
    ...REMINDER_DEFAULTS,
    autoAnswer: false,
    autoAnswerDelay: 3e3,
    autoAnswerRandomDelay: 2e3,
    keepScreenAwake: false,
    iftex: true,
    ai: {
      provider: "kimi",
      kimiApiKey: "",
      apiKey: "",
      endpoint: "https://api.moonshot.cn/v1/chat/completions",
      model: "kimi-k3",
      visionModel: "kimi-k3",
      ocrApi: "",
      ocrApiKey: "",
      translateApi: "",
      translateApiKey: "",
      translateModel: "",
      maxTokens: 1e3
    },
    profiles: [ {
      id: "default",
      name: "Kimi",
      baseUrl: "https://api.moonshot.cn/v1/chat/completions",
      apiKey: "",
      model: "kimi-k3",
      visionModel: "kimi-k3",
      temperature: ""
    } ],
    activeProfileId: "default",
    showAllSlides: false,
    maxPresentations: 5
  };
  // src/core/storage.js
    class StorageManager {
    constructor(prefix) {
      this.prefix = prefix;
    }
    get(key, dv = null) {
      try {
        const v = localStorage.getItem(this.prefix + key);
        return v ? JSON.parse(v) : dv;
      } catch {
        return dv;
      }
    }
    set(key, value) {
      localStorage.setItem(this.prefix + key, JSON.stringify(value));
    }
    remove(key) {
      localStorage.removeItem(this.prefix + key);
    }
    getMap(key) {
      const arr = this.get(key, []);
      try {
        return new Map(arr);
      } catch {
        return new Map;
      }
    }
    setMap(key, map) {
      this.set(key, [ ...map ]);
    }
    alterMap(key, fn) {
      const m = this.getMap(key);
      fn(m);
      this.setMap(key, m);
    }
  }
  const storage = new StorageManager("ykt-helper:");
  // src/state/repo.js
    function problemKey(value) {
    const key = String(value ?? "").trim();
    return key || null;
  }
  function isMeaningfulValue(value) {
    if (value === void 0 || value === null) return false;
    if (typeof value === "string") return value.trim() !== "";
    if (Array.isArray(value)) return value.length > 0;
    if (value instanceof Date) return true;
    if (typeof value === "object") return Object.keys(value).length > 0;
    return true;
  }
  function isPlainObject$1(value) {
    return !!value && typeof value === "object" && !Array.isArray(value);
  }
  function mergeSparseObject(base, patch) {
    const result = isPlainObject$1(base) ? {
      ...base
    } : {};
    if (!isPlainObject$1(patch)) return result;
    for (const [key, value] of Object.entries(patch)) {
      if (!isMeaningfulValue(value)) continue;
      const current = result[key];
      if (key === "status" && isPlainObject$1(current) && isPlainObject$1(value)) {
        const status = {
          ...current
        };
        for (const [statusKey, statusValue] of Object.entries(value)) if (isMeaningfulValue(statusValue)) status[statusKey] = statusValue;
        result[key] = status;
        continue;
      }
      if (isPlainObject$1(current) && isPlainObject$1(value)) result[key] = mergeSparseObject(current, value); else result[key] = value;
    }
    return result;
  }
  const repo = {
    presentations: new Map,
    // id -> presentation
    slides: new Map,
    // slideId -> slide
    problems: new Map,
    // problemId -> problem
    problemStatus: new Map,
    // problemId -> {presentationId, slideId, startTime, endTime, done, autoAnswerTime, answering}
    encounteredProblems: [],
    // [{problemId, ...ref}]
    currentPresentationId: null,
    currentSlideId: null,
    currentLessonId: null,
    currentSelectedUrl: null,
    // 按课程分组存储课件
    setPresentation(id, data) {
      this.presentations.set(id, {
        id: id,
        ...data
      });
      const key = this.currentLessonId ? `presentations-${this.currentLessonId}` : "presentations";
      storage.alterMap(key, m => {
        m.set(id, data);
        // 仍然做容量裁剪
                const max = storage.get("config", {})?.maxPresentations ?? 5;
        const excess = m.size - max;
        if (excess > 0) [ ...m.keys() ].slice(0, excess).forEach(k => m.delete(k));
      });
    },
    upsertSlide(slide) {
      const key = problemKey(slide?.id ?? slide?.slideId);
      if (!key) return false;
      this.slides.set(key, slide);
      return true;
    },
    upsertProblem(prob) {
      const key = problemKey(prob?.problemId ?? prob?.id);
      if (!key) return false;
      const normalized = {
        ...prob,
        problemId: key
      };
      const current = this.problems.get(key);
      this.problems.set(key, current ? mergeSparseObject(current, normalized) : normalized);
      return true;
    },
    getSlide(id) {
      return this.slides.get(problemKey(id));
    },
    hasSlide(id) {
      return this.slides.has(problemKey(id));
    },
    getProblem(id) {
      return this.problems.get(problemKey(id));
    },
    hasProblem(id) {
      return this.problems.has(problemKey(id));
    },
    getProblemStatus(id) {
      return this.problemStatus.get(problemKey(id));
    },
    setProblemStatus(id, status) {
      const key = problemKey(id);
      if (!key) return false;
      this.problemStatus.set(key, status);
      return true;
    },
    pushEncounteredProblem(prob, slide, presentationId) {
      const key = problemKey(prob?.problemId ?? prob?.id);
      if (!key) return false;
      const incoming = {
        problemId: key,
        problemType: prob.problemType,
        body: prob.body,
        options: prob.options,
        blanks: prob.blanks,
        answers: prob.answers,
        slide: slide,
        presentationId: presentationId
      };
      const existing = this.encounteredProblems.find(p => problemKey(p.problemId) === key);
      if (existing) {
        Object.assign(existing, mergeSparseObject(existing, incoming));
        return false;
      }
      this.encounteredProblems.push({
        ...incoming,
        body: incoming.body || `题目ID: ${key}`,
        options: incoming.options || [],
        blanks: incoming.blanks || [],
        answers: incoming.answers || []
      });
      return true;
    },
    // === 自动进入课堂所需的多“线程”（多课堂）状态 ===
    listeningLessons: new Set,
    // lessonId 的集合，表示已经建立WS监听
    lessonTokens: new Map,
    // lessonId -> lessonToken（/lesson/checkin 返回）
    lessonSockets: new Map,
    // lessonId -> WebSocket 实例
    autoJoinRunning: false,
    // 轮询开关
    autoJoinedLessons: new Set,
    // 被“自动进入”的课堂集合（仅标记自动进入建立的连接）
    forceAutoAnswerLessons: new Set,
    // 若需要，可以对某些课强制视为“自动答题开启”
    // 载入本课（按课程分组）在本地存储过的课件
    loadStoredPresentations() {
      if (!this.currentLessonId) return;
      const key = `presentations-${this.currentLessonId}`;
      const stored = storage.getMap(key);
      for (const [id, data] of stored.entries()) this.setPresentation(id, data);
    },
    markLessonConnected(lessonId, ws, token) {
      if (token) this.lessonTokens.set(lessonId, token);
      if (ws) this.lessonSockets.set(lessonId, ws);
      this.listeningLessons.add(lessonId);
    },
    isLessonConnected(lessonId) {
      return this.listeningLessons.has(lessonId) && this.lessonSockets.get(lessonId);
    },
    markLessonAutoJoined(lessonId, enabled = true) {
      if (!lessonId) return;
      if (enabled) this.autoJoinedLessons.add(lessonId); else this.autoJoinedLessons.delete(lessonId);
    }
  };
  // src/ui/toast.js
    function toast(message, duration = 2e3) {
    const el = document.createElement("div");
    el.textContent = message;
    el.style.cssText = `\n    position: fixed; top: 20px; left: 50%; transform: translateX(-50%);\n    background: rgba(0,0,0,.7); color: #fff; padding: 10px 20px;\n    border-radius: 4px; z-index: 10000000; max-width: 80%;\n  `;
    document.body.appendChild(el);
    setTimeout(() => {
      el.style.opacity = "0";
      el.style.transition = "opacity .5s";
      setTimeout(() => el.remove(), 500);
    }, duration);
  }
  var tpl$5 = '<div id="ykt-settings-panel" class="ykt-panel">\r\n  <div class="panel-header">\r\n    <h3>AI雨课堂助手设置</h3>\r\n    <div class="setting-actions">\r\n        <button id="ykt-btn-settings-save">保存设置</button>\r\n        <button id="ykt-btn-settings-reset" color="red">重置为默认</button>\r\n    </div>\r\n    <span class="close-btn" id="ykt-settings-close"><i class="fas fa-times"></i></span>\r\n  </div>\r\n\r\n  <div class="panel-body">\r\n    <div class="settings-content">\r\n      <div class="setting-group">\r\n      <h4>AI配置</h4>\r\n\r\n        \x3c!-- 当前 profile 选择 --\x3e\r\n        <div class="setting-item">\r\n          <label for="ykt-ai-profile-select">当前配置：</label>\r\n          <select id="ykt-ai-profile-select"></select>\r\n          <button id="ykt-ai-profile-add">新增配置</button>\r\n          <button id="ykt-ai-profile-del" color="red">删除当前</button>\r\n        </div>\r\n\r\n        \x3c!-- 具体配置字段：针对当前 profile --\x3e\r\n        <div class="setting-item">\r\n          <label for="ykt-ai-profile-name">名称:</label>\r\n          <input type="text" id="ykt-ai-profile-name" placeholder="例如：Kimi 8k / OpenAI GPT-4o">\r\n        </div>\r\n\r\n        <div class="setting-item">\r\n          <label for="ykt-ai-base-url">URL:</label>\r\n          <input type="text" id="ykt-ai-base-url" placeholder="https://api.moonshot.cn/...">\r\n          <small>兼容 OpenAI 协议的服务端，例如 api.openai.com / api.moonshot.cn / 自建代理。</small>\r\n        </div>\r\n\r\n        <div class="setting-item">\r\n          <label for="kimi-api-key">API Key:</label>\r\n          <input type="password" id="kimi-api-key" placeholder="输入当前配置的 API Key">\r\n        </div>\r\n\r\n        <div class="setting-item">\r\n          <label for="ykt-ai-model">文本模型 ID:</label>\r\n          <input type="text" id="ykt-ai-model" placeholder="例如：moonshot-v1-8k / gpt-4o-mini">\r\n        </div>\r\n\r\n        <div class="setting-item">\r\n          <label for="ykt-ai-vision-model">图像模型 ID:</label>\r\n          <input type="text" id="ykt-ai-vision-model" placeholder="默认不填则与文本模型相同">\r\n        </div>\r\n        <div class="setting-item">\r\n          <label for="ykt-ai-temperature">Temperature:</label>\r\n          <input type="number" id="ykt-ai-temperature" min="0" max="2" step="0.01" placeholder="留空则不传">\r\n          <small>当前 Profile 专用。留空时不发送该参数，由模型决定默认值；部分 Kimi 模型要求留空。</small>\r\n        </div>\r\n        <div class="setting-item">\r\n          <label for="ykt-ai-ocr-api">OCR模型API:</label>\r\n          <input type="text" id="ykt-ai-ocr-api" placeholder="留空则复用当前 AI Profile 的 URL">\r\n          <small>仅用于课件“文字识别”功能；留空时走当前 AI Profile。</small>\r\n        </div>\r\n        <div class="setting-item">\r\n          <label for="ykt-ai-ocr-api-key">OCR API Key:</label>\r\n          <input type="password" id="ykt-ai-ocr-api-key" placeholder="留空则复用当前 AI Profile 的 API Key">\r\n          <small>仅用于课件 OCR；不填时自动回退到当前 AI Profile 的 API Key。</small>\r\n        </div>\r\n        <div class="setting-item">\r\n          <label for="ykt-ai-translate-api">翻译模型API:</label>\r\n          <input type="text" id="ykt-ai-translate-api" placeholder="留空则复用当前 AI Profile 的 URL">\r\n          <small>仅用于 OCR 结果翻译；留空时复用当前 AI Profile 的 URL。</small>\r\n        </div>\r\n        <div class="setting-item">\r\n          <label for="ykt-ai-translate-api-key">翻译 API Key:</label>\r\n          <input type="password" id="ykt-ai-translate-api-key" placeholder="留空则复用当前 AI Profile 的 API Key">\r\n          <small>仅用于 OCR 结果翻译；留空时复用当前 AI Profile 的 API Key。</small>\r\n        </div>\r\n        <div class="setting-item">\r\n          <label for="ykt-ai-translate-model">翻译模型 ID:</label>\r\n          <input type="text" id="ykt-ai-translate-model" placeholder="留空则复用当前 AI Profile 的文本模型">\r\n          <small>建议填写纯文本模型；留空时复用当前 AI Profile 的文本模型。</small>\r\n        </div>\r\n      </div>\r\n\r\n      <div class="setting-group">\r\n        <h4>UI设置</h4>\r\n          <div class="setting-item">\r\n          <label class="checkbox-label">\r\n            <input type="checkbox" id="ykt-ui-tex">\r\n            <span class="checkmark"></span>\r\n            渲染LaTeX格式的公式\r\n          </label>\r\n        </div>\r\n      </div>\r\n\r\n      <div class="setting-group">\r\n        <h4>自动作答设置</h4>\r\n        <div class="setting-item">\r\n          <label class="checkbox-label">\r\n            <input type="checkbox" id="ykt-input-auto-join">\r\n            <span class="checkmark"></span>\r\n            自动进入课堂\r\n          </label>\r\n          <small>默认自动进入“正在上课”的课堂。</small>\r\n        </div>\r\n        <div class="setting-item">\r\n          <label class="checkbox-label">\r\n            <input type="checkbox" id="ykt-input-auto-join-auto-answer">\r\n            <span class="checkmark"></span>\r\n            对于自动进入的课堂，默认使用自动答题\r\n          </label>\r\n          <small>仅对“自动进入”的课堂生效，不会影响手动进入课堂的行为。</small>\r\n        </div>\r\n        <div class="setting-item">\r\n          <label class="checkbox-label">\r\n            <input type="checkbox" id="ykt-input-auto-answer">\r\n            <span class="checkmark"></span>\r\n            启用自动作答\r\n          </label>\r\n        </div>\r\n        <div class="setting-item">\r\n          <label class="checkbox-label">\r\n            <input type="checkbox" id="ykt-input-ai-auto-analyze">\r\n            <span class="checkmark"></span>\r\n            打开 AI 页面时自动分析\r\n          </label>\r\n          <small>开启后，进入“AI 解答”面板即自动向 AI 询问当前题目</small>\r\n        </div>\r\n        <div class="setting-item">\r\n          <label for="ykt-input-answer-delay">作答延迟时间 (秒):</label>\r\n          <input type="number" id="ykt-input-answer-delay" min="1" max="60">\r\n          <small>题目出现后等待多长时间开始作答</small>\r\n        </div>\r\n        <div class="setting-item">\r\n          <label for="ykt-input-random-delay">随机延迟范围 (秒):</label>\r\n          <input type="number" id="ykt-input-random-delay" min="0" max="30">\r\n          <small>在基础延迟基础上随机增加的时间范围</small>\r\n        </div><div class="setting-item">\r\n          <label class="checkbox-label">\r\n            <input type="checkbox" id="ykt-ai-pick-main-first">\r\n            <span class="checkmark"></span>\r\n            主界面优先（未勾选则课件浏览优先）\r\n          </label>\r\n          <small>仅在普通打开 AI 面板（ykt:open-ai）时生效；从“提问当前PPT”跳转保持最高优先。</small>\r\n        </div>\r\n      </div>\r\n\r\n      <div class="setting-group">\r\n        <h4>课堂提醒</h4>\r\n        <div class="setting-item">\r\n          <label class="checkbox-label">\r\n            <input type="checkbox" id="ykt-input-notify-all" />\r\n            <span class="checkmark"></span>\r\n            总提醒开关\r\n          </label>\r\n          <small>关闭后，下面每一种课堂事件都会静音；工具栏铃铛与此开关同步。</small>\r\n        </div>\r\n        <h5>提醒事件</h5>\r\n        <div class="setting-item">\r\n          <label class="checkbox-label">\r\n            <input type="checkbox" id="ykt-input-notify-problem-start" />\r\n            <span class="checkmark"></span>\r\n            新题 / 答题开始\r\n          </label>\r\n          <small>老师开启一道可作答习题时提醒。</small>\r\n        </div>\r\n        <div class="setting-item">\r\n          <label class="checkbox-label">\r\n            <input type="checkbox" id="ykt-input-notify-assessment-publish" />\r\n            <span class="checkmark"></span>\r\n            考试/测试题组发布提醒\r\n          </label>\r\n          <small>老师发布测试、考试或题组时提醒。</small>\r\n        </div>\r\n        <div class="setting-item">\r\n          <label class="checkbox-label">\r\n            <input type="checkbox" id="ykt-input-notify-courseware-publish" />\r\n            <span class="checkmark"></span>\r\n            课件发布提醒\r\n          </label>\r\n          <small>只在发布新课件时提醒；翻阅旧课件和翻页不会提醒。</small>\r\n        </div>\r\n        <div class="setting-item">\r\n          <label class="checkbox-label">\r\n            <input type="checkbox" id="ykt-input-notify-other-publish" />\r\n            <span class="checkmark"></span>\r\n            其他无法分类的发布提醒\r\n          </label>\r\n          <small>用于不同学校服务器的未知发布事件；若提醒过多可单独关闭。</small>\r\n        </div>\r\n        <div class="setting-item">\r\n          <label class="checkbox-label">\r\n            <input type="checkbox" id="ykt-input-notify-lesson-finished" />\r\n            <span class="checkmark"></span>\r\n            课程结束提醒\r\n          </label>\r\n          <small>老师结束当前课程时提醒。</small>\r\n        </div>\r\n        <div class="setting-item">\r\n          <label class="checkbox-label">\r\n            <input type="checkbox" id="ykt-input-notify-auto-answer-scheduled" />\r\n            <span class="checkmark"></span>\r\n            自动作答已排队\r\n          </label>\r\n          <small>脚本为新题安排延迟作答时提醒。</small>\r\n        </div>\r\n        <div class="setting-item">\r\n          <label class="checkbox-label">\r\n            <input type="checkbox" id="ykt-input-notify-auto-answer-started" />\r\n            <span class="checkmark"></span>\r\n            自动作答开始\r\n          </label>\r\n          <small>脚本开始执行本地或 AI 作答流程时提醒。</small>\r\n        </div>\r\n        <div class="setting-item">\r\n          <label class="checkbox-label">\r\n            <input type="checkbox" id="ykt-input-notify-auto-answer-succeeded" />\r\n            <span class="checkmark"></span>\r\n            自动作答成功\r\n          </label>\r\n          <small>答案提交成功时提醒。</small>\r\n        </div>\r\n        <div class="setting-item">\r\n          <label class="checkbox-label">\r\n            <input type="checkbox" id="ykt-input-notify-auto-answer-failed" />\r\n            <span class="checkmark"></span>\r\n            自动作答失败\r\n          </label>\r\n          <small>截图、AI 分析或答案提交失败时提醒。</small>\r\n        </div>\r\n        <h5>提醒方式</h5>\r\n        <div class="setting-item">\r\n          <label class="checkbox-label">\r\n            <input type="checkbox" id="ykt-input-notify-native" />\r\n            <span class="checkmark"></span>\r\n            系统通知\r\n          </label>\r\n          <small>调用浏览器或篡改猴的原生通知。</small>\r\n        </div>\r\n        <div class="setting-item">\r\n          <label class="checkbox-label">\r\n            <input type="checkbox" id="ykt-input-notify-popup" />\r\n            <span class="checkmark"></span>\r\n            页面弹窗\r\n          </label>\r\n          <small>在当前页面右下角显示提醒卡片。</small>\r\n        </div>\r\n        <div class="setting-item">\r\n          <label class="checkbox-label">\r\n            <input type="checkbox" id="ykt-input-notify-sound" />\r\n            <span class="checkmark"></span>\r\n            提示声音\r\n          </label>\r\n          <small>播放内置或自定义提示音。</small>\r\n        </div>\r\n        <div class="setting-item">\r\n          <label for="ykt-input-notify-duration">弹窗持续时间 (秒):</label>\r\n          <input type="number" id="ykt-input-notify-duration" min="2" max="60" />\r\n          <small>习题出现时，弹窗在屏幕上的停留时长</small>\r\n        </div>\r\n        <div class="setting-item">\r\n          <label for="ykt-input-notify-volume">提醒音量 (0-100):</label>\r\n          <input type="number" id="ykt-input-notify-volume" min="0" max="100" />\r\n          <small>用于提示音的音量大小；建议 30~80</small>\r\n        </div>\r\n        <div class="setting-item">\r\n          <label>自定义提示音（其一即可）</label>\r\n          <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">\r\n            <input type="file" id="ykt-input-notify-audio-file" accept="audio/*" />\r\n            <input type="text" id="ykt-input-notify-audio-url" placeholder="或粘贴在线音频 URL（http/https/data:）" style="min-width:260px"/>\r\n            <button id="ykt-btn-apply-audio-url">应用URL</button>\r\n            <button id="ykt-btn-preview-audio">预览</button>\r\n            <button id="ykt-btn-clear-audio">清除自定义音频</button>\r\n          </div>\r\n          <small id="ykt-tip-audio-name" style="display:block;opacity:.8;margin-top:6px"></small>\r\n          <small>说明：文件将本地存储为 data URL（默认上限 2MB）。URL 需支持跨域访问；若被浏览器拦截自动播放，请先点击“预览”以授权音频播放。</small>\r\n        </div>\r\n      </div>\r\n\r\n      <div class="setting-group">\r\n        <h4>课堂运行</h4>\r\n        <div class="setting-item">\r\n          <label class="checkbox-label">\r\n            <input type="checkbox" id="ykt-input-keep-screen-awake" />\r\n            <span class="checkmark"></span>\r\n            课堂保持亮屏（仅防自动熄屏）\r\n          </label>\r\n          <small>仅在课堂页且页面可见时生效。无法阻止手动锁屏、切换到后台后的浏览器冻结；省电模式也可能拒绝该功能。</small>\r\n        </div>\r\n      </div>\r\n    </div>\r\n  </div>\r\n</div>\r\n';
  function defaultNavigator() {
    if (typeof window !== "undefined") return window.navigator;
    return typeof globalThis !== "undefined" ? globalThis.navigator : null;
  }
  function defaultDocument() {
    return typeof document !== "undefined" ? document : null;
  }
  function defaultLocation() {
    return typeof window !== "undefined" ? window.location : null;
  }
  function isClassroomPath(pathname = "") {
    return /\/lesson\/fullscreen\/v3(?:\/|$)|\/v2\/web\/lesson(?:\/|$)|\/m\/v2(?:\/|$)/.test(pathname);
  }
  function createScreenWakeLock({getNavigator: getNavigator = defaultNavigator, getDocument: getDocument = defaultDocument, getLocation: getLocation = defaultLocation, onStatus: onStatus = () => {}} = {}) {
    let enabled = false;
    let sentinel = null;
    let pendingRequest = null;
    let observedDocument = null;
    const report = (active, reason, error) => {
      const status = {
        active: active,
        reason: reason
      };
      if (error) status.error = error;
      try {
        onStatus(status);
      } catch {}
      return status;
    };
    const getPathname = () => getLocation()?.pathname || "";
    const isVisible = () => {
      const doc = getDocument();
      return !!doc && doc.hidden !== true && doc.visibilityState !== "hidden";
    };
    const inactiveReason = () => {
      if (!enabled) return "disabled";
      if (!isClassroomPath(getPathname())) return "not-classroom";
      if (!isVisible()) return "hidden";
      const wakeLock = getNavigator()?.wakeLock;
      if (!wakeLock || typeof wakeLock.request !== "function") return "unsupported";
      return "released";
    };
    const releaseSentinel = async () => {
      const current = sentinel;
      sentinel = null;
      if (!current || typeof current.release !== "function") return;
      try {
        await current.release();
      } catch {}
    };
    const onVisibilityChange = () => {
      void sync();
    };
    const observeVisibility = () => {
      const doc = getDocument();
      if (!doc || doc === observedDocument || typeof doc.addEventListener !== "function") return;
      if (observedDocument && typeof observedDocument.removeEventListener === "function") observedDocument.removeEventListener("visibilitychange", onVisibilityChange);
      observedDocument = doc;
      doc.addEventListener("visibilitychange", onVisibilityChange);
    };
    const attachSentinel = current => {
      if (!current || typeof current.addEventListener !== "function") return;
      current.addEventListener("release", () => {
        if (sentinel === current) {
          sentinel = null;
          report(false, "released");
        }
      });
    };
    async function sync() {
      observeVisibility();
      const reason = inactiveReason();
      if (reason !== "released") {
        await releaseSentinel();
        return report(false, reason);
      }
      if (sentinel && sentinel.released !== true) return report(true, "active");
      sentinel = null;
      if (pendingRequest) return pendingRequest;
      const requestPromise = Promise.resolve().then(async () => {
        try {
          let requested;
          try {
            requested = await getNavigator().wakeLock.request("screen");
          } catch (error) {
            return report(false, "request-failed", error);
          }
          // Settings, route, or visibility may change while the browser shows its
          // permission prompt. Never retain a sentinel that is no longer eligible.
                    const afterRequestReason = inactiveReason();
          if (afterRequestReason !== "released") {
            try {
              await (requested?.release?.());
            } catch {}
            return report(false, afterRequestReason);
          }
          sentinel = requested;
          attachSentinel(requested);
          return report(true, "active");
        } finally {
          // Clear before callers observe completion, so an immediately released
          // sentinel can always be reacquired by the next sync().
          if (pendingRequest === requestPromise) pendingRequest = null;
        }
      });
      pendingRequest = requestPromise;
      return requestPromise;
    }
    async function setEnabled(nextEnabled) {
      enabled = !!nextEnabled;
      return sync();
    }
    async function dispose() {
      enabled = false;
      if (observedDocument && typeof observedDocument.removeEventListener === "function") observedDocument.removeEventListener("visibilitychange", onVisibilityChange);
      observedDocument = null;
      await releaseSentinel();
    }
    return {
      setEnabled: setEnabled,
      sync: sync,
      dispose: dispose,
      getState() {
        return {
          enabled: enabled,
          active: !!sentinel && sentinel.released !== true
        };
      }
    };
  }
  const screenWakeLock = createScreenWakeLock();
  // src/core/settings-form.js
    function text(value) {
    return String(value ?? "").trim();
  }
  /**
   * Validate every value before changing the profile.  This keeps an invalid
   * temperature from partially saving a new API URL, key, or model name.
   */  function applyProfileForm(profile, fields = {}) {
    if (!profile || typeof profile !== "object") return {
      ok: false,
      field: "profile"
    };
    const rawTemperature = text(fields.temperature);
    let temperature = "";
    if (rawTemperature !== "") {
      temperature = Number(rawTemperature);
      if (!Number.isFinite(temperature) || temperature < 0 || temperature > 2) return {
        ok: false,
        field: "temperature"
      };
    }
    const next = {
      name: text(fields.name) || profile.name,
      baseUrl: text(fields.baseUrl) || profile.baseUrl,
      apiKey: text(fields.apiKey),
      model: text(fields.model) || profile.model,
      visionModel: text(fields.visionModel) || profile.visionModel,
      temperature: temperature
    };
    Object.assign(profile, next);
    return {
      ok: true,
      profile: profile
    };
  }
  /** Refresh every reminder input whenever a settings surface becomes visible. */  function syncReminderForm(fields = {}, config = {}) {
    for (const key of REMINDER_SETTING_KEYS) {
      const field = fields[key];
      if (field) field.checked = config[key] !== false;
    }
  }
  function readReminderForm(fields = {}) {
    return Object.fromEntries(REMINDER_SETTING_KEYS.map(key => [ key, !!fields[key]?.checked ]));
  }
  // settings.js (new version)
    let mounted$6 = false;
  let root$5;
  let syncMountedForm = () => {};
  // ---- AI Profile helpers ----
    function ensureAIProfiles(configAI) {
    if (!configAI) return;
    // 只有 kimiApiKey 时创建第一个 profile
        if (!Array.isArray(configAI.profiles) || configAI.profiles.length === 0) {
      const legacyKey = configAI.kimiApiKey || configAI.apiKey || storage.get("kimiApiKey") || "";
      configAI.profiles = [ {
        id: "default",
        name: "Kimi",
        baseUrl: "https://api.moonshot.cn/v1/chat/completions",
        apiKey: legacyKey,
        model: "kimi-k3",
        visionModel: "kimi-k3",
        temperature: ""
      } ];
      configAI.activeProfileId = "default";
    }
    if (!configAI.activeProfileId) configAI.activeProfileId = configAI.profiles[0].id;
  }
  // ------------------------------
    function mountSettingsPanel() {
    if (mounted$6) return root$5;
    // 注入 HTML
        root$5 = document.createElement("div");
    root$5.innerHTML = tpl$5;
    document.body.appendChild(root$5.firstElementChild);
    root$5 = document.getElementById("ykt-settings-panel");
    const aiCfg = ui.config.ai || (ui.config.ai = {});
    ensureAIProfiles(aiCfg);
    // === 获取所有 AI Profile 相关的 DOM ===
        const $profileSelect = root$5.querySelector("#ykt-ai-profile-select");
    const $profileAdd = root$5.querySelector("#ykt-ai-profile-add");
    const $profileDel = root$5.querySelector("#ykt-ai-profile-del");
    const $profileName = root$5.querySelector("#ykt-ai-profile-name");
    const $baseUrl = root$5.querySelector("#ykt-ai-base-url");
    const $api = root$5.querySelector("#kimi-api-key");
    const $model = root$5.querySelector("#ykt-ai-model");
    const $visionModel = root$5.querySelector("#ykt-ai-vision-model");
    const $temperature = root$5.querySelector("#ykt-ai-temperature");
    const $ocrApi = root$5.querySelector("#ykt-ai-ocr-api");
    const $ocrApiKey = root$5.querySelector("#ykt-ai-ocr-api-key");
    const $translateApi = root$5.querySelector("#ykt-ai-translate-api");
    const $translateApiKey = root$5.querySelector("#ykt-ai-translate-api-key");
    const $translateModel = root$5.querySelector("#ykt-ai-translate-model");
    // === 其他 UI 原有字段 ===
        const $auto = root$5.querySelector("#ykt-input-auto-answer");
    const $autoJoin = root$5.querySelector("#ykt-input-auto-join");
    const $autoJoinAutoAnswer = root$5.querySelector("#ykt-input-auto-join-auto-answer");
    const $autoAnalyze = root$5.querySelector("#ykt-input-ai-auto-analyze");
    const $delay = root$5.querySelector("#ykt-input-answer-delay");
    const $rand = root$5.querySelector("#ykt-input-random-delay");
    const $priority = root$5.querySelector("#ykt-ai-pick-main-first");
    const $notifyDur = root$5.querySelector("#ykt-input-notify-duration");
    const $notifyVol = root$5.querySelector("#ykt-input-notify-volume");
    const $notifyAll = root$5.querySelector("#ykt-input-notify-all");
    const $notifyProblemStart = root$5.querySelector("#ykt-input-notify-problem-start");
    const $notifyAssessment = root$5.querySelector("#ykt-input-notify-assessment-publish");
    const $notifyCourseware = root$5.querySelector("#ykt-input-notify-courseware-publish");
    const $notifyOther = root$5.querySelector("#ykt-input-notify-other-publish");
    const $notifyLessonFinished = root$5.querySelector("#ykt-input-notify-lesson-finished");
    const $notifyAutoAnswerScheduled = root$5.querySelector("#ykt-input-notify-auto-answer-scheduled");
    const $notifyAutoAnswerStarted = root$5.querySelector("#ykt-input-notify-auto-answer-started");
    const $notifyAutoAnswerSucceeded = root$5.querySelector("#ykt-input-notify-auto-answer-succeeded");
    const $notifyAutoAnswerFailed = root$5.querySelector("#ykt-input-notify-auto-answer-failed");
    const $notifyNative = root$5.querySelector("#ykt-input-notify-native");
    const $notifyPopup = root$5.querySelector("#ykt-input-notify-popup");
    const $notifySound = root$5.querySelector("#ykt-input-notify-sound");
    const $keepScreenAwake = root$5.querySelector("#ykt-input-keep-screen-awake");
    const $iftex = root$5.querySelector("#ykt-ui-tex");
    const $audioFile = root$5.querySelector("#ykt-input-notify-audio-file");
    const $audioUrl = root$5.querySelector("#ykt-input-notify-audio-url");
    const $applyUrl = root$5.querySelector("#ykt-btn-apply-audio-url");
    const $preview = root$5.querySelector("#ykt-btn-preview-audio");
    const $clear = root$5.querySelector("#ykt-btn-clear-audio");
    const $audioName = root$5.querySelector("#ykt-tip-audio-name");
    const reminderFields = {
      notifyProblems: $notifyAll,
      notifyProblemStarts: $notifyProblemStart,
      notifyAssessmentPublishes: $notifyAssessment,
      notifyCoursewarePublishes: $notifyCourseware,
      notifyOtherPublishes: $notifyOther,
      notifyLessonFinished: $notifyLessonFinished,
      notifyAutoAnswerScheduled: $notifyAutoAnswerScheduled,
      notifyAutoAnswerStarted: $notifyAutoAnswerStarted,
      notifyAutoAnswerSucceeded: $notifyAutoAnswerSucceeded,
      notifyAutoAnswerFailed: $notifyAutoAnswerFailed,
      notifyNative: $notifyNative,
      notifyPopup: $notifyPopup,
      notifySound: $notifySound
    };
    // Profile UI
        function refreshProfileSelect() {
      const ai = ui.config.ai;
      $profileSelect.innerHTML = "";
      ai.profiles.forEach(p => {
        const opt = document.createElement("option");
        opt.value = p.id;
        opt.textContent = p.name || p.id;
        if (p.id === ai.activeProfileId) opt.selected = true;
        $profileSelect.appendChild(opt);
      });
    }
    function loadProfileToForm(profileId) {
      const p = ui.config.ai.profiles.find(x => x.id === profileId);
      if (!p) return;
      ui.config.ai.activeProfileId = p.id;
      $profileName.value = p.name || "";
      $baseUrl.value = p.baseUrl || "";
      $api.value = p.apiKey || "";
      $model.value = p.model || "";
      $visionModel.value = p.visionModel || "";
      $temperature.value = p.temperature ?? "";
      $ocrApi.value = ui.config.ai.ocrApi || "";
      $ocrApiKey.value = ui.config.ai.ocrApiKey || "";
      $translateApi.value = ui.config.ai.translateApi || "";
      $translateApiKey.value = ui.config.ai.translateApiKey || "";
      $translateModel.value = ui.config.ai.translateModel || "";
    }
    // 初始化 Profile 下拉框
        refreshProfileSelect();
    loadProfileToForm(ui.config.ai.activeProfileId);
    // 切换 profile
        $profileSelect.addEventListener("change", () => {
      loadProfileToForm($profileSelect.value);
    });
    // 添加 profile
        $profileAdd.addEventListener("click", () => {
      const id = `p_${Date.now().toString(36)}`;
      const newP = {
        id: id,
        name: "new api key",
        baseUrl: "https://api.openai.com/...",
        apiKey: "",
        model: "gpt-4o-mini",
        visionModel: "",
        temperature: ""
      };
      ui.config.ai.profiles.push(newP);
      ui.config.ai.activeProfileId = id;
      refreshProfileSelect();
      loadProfileToForm(id);
    });
    // 删除 profile
        $profileDel.addEventListener("click", () => {
      const ai = ui.config.ai;
      if (ai.profiles.length <= 1) {
        ui.toast("至少保留一个配置", 2500);
        return;
      }
      const id = ai.activeProfileId;
      ai.profiles = ai.profiles.filter(p => p.id !== id);
      ai.activeProfileId = ai.profiles[0].id;
      refreshProfileSelect();
      loadProfileToForm(ai.activeProfileId);
    });
    function syncFormFromConfig() {
      ensureAIProfiles(ui.config.ai || (ui.config.ai = {}));
      refreshProfileSelect();
      loadProfileToForm(ui.config.ai.activeProfileId);
      $autoJoin.checked = !!ui.config.autoJoinEnabled;
      $autoJoinAutoAnswer.checked = !!ui.config.autoAnswerOnAutoJoin;
      $auto.checked = !!ui.config.autoAnswer;
      $autoAnalyze.checked = !!ui.config.aiAutoAnalyze;
      $iftex.checked = !!ui.config.iftex;
      $delay.value = Math.floor((ui.config.autoAnswerDelay || 3e3) / 1e3);
      $rand.value = Math.floor((ui.config.autoAnswerRandomDelay || 1500) / 1e3);
      $priority.checked = ui.config.aiSlidePickPriority !== false;
      $notifyDur.value = Math.floor((ui.config.notifyPopupDuration || 5e3) / 1e3);
      $notifyVol.value = Math.round(100 * (ui.config.notifyVolume ?? .6));
      syncReminderForm(reminderFields, ui.config);
      $keepScreenAwake.checked = !!ui.config.keepScreenAwake;
      $audioName.textContent = ui.config.customNotifyAudioName ? `当前：${ui.config.customNotifyAudioName}` : "当前：使用内置“叮-咚”提示音";
    }
    syncMountedForm = syncFormFromConfig;
    syncFormFromConfig();
    // 保存设置
        root$5.querySelector("#ykt-btn-settings-save").addEventListener("click", async () => {
      // --- 保存当前 Profile ---
      const ai = ui.config.ai;
      const pid = ai.activeProfileId;
      const p = ai.profiles.find(x => x.id === pid);
      if (!p) {
        ui.toast("当前 AI 配置不存在，请重新选择后保存", 3e3);
        return;
      }
      const profileResult = applyProfileForm(p, {
        name: $profileName.value,
        baseUrl: $baseUrl.value,
        apiKey: $api.value,
        model: $model.value,
        visionModel: $visionModel.value,
        temperature: $temperature.value
      });
      if (!profileResult.ok) {
        ui.toast("Temperature 必须是 0 到 2 之间的数字，或留空", 3e3);
        return;
      }
      ai.ocrApi = $ocrApi.value.trim();
      ai.ocrApiKey = $ocrApiKey.value.trim();
      ai.translateApi = $translateApi.value.trim();
      ai.translateApiKey = $translateApiKey.value.trim();
      ai.translateModel = $translateModel.value.trim();
      const curOpt = $profileSelect.querySelector(`option[value="${p.id}"]`);
      if (curOpt) curOpt.textContent = p.name || p.id;
      ai.kimiApiKey = p.apiKey;
      storage.set("kimiApiKey", p.apiKey);
      ui.config.autoJoinEnabled = !!$autoJoin.checked;
      ui.config.autoAnswerOnAutoJoin = !!$autoJoinAutoAnswer.checked;
      ui.config.autoAnswer = !!$auto.checked;
      ui.config.aiAutoAnalyze = !!$autoAnalyze.checked;
      ui.config.autoAnswerDelay = Math.max(1e3, (+$delay.value || 0) * 1e3);
      ui.config.autoAnswerRandomDelay = Math.max(0, (+$rand.value || 0) * 1e3);
      ui.config.iftex = !!$iftex.checked;
      ui.config.aiSlidePickPriority = !!$priority.checked;
      ui.config.notifyPopupDuration = Math.max(2e3, (+$notifyDur.value || 0) * 1e3);
      ui.config.notifyVolume = Math.max(0, Math.min(1, (+$notifyVol.value || 60) / 100));
      Object.assign(ui.config, readReminderForm(reminderFields));
      ui.config.keepScreenAwake = !!$keepScreenAwake.checked;
      ui.saveConfig();
      document.getElementById("ykt-btn-bell")?.classList.toggle("active", ui.config.notifyProblems);
      ui.updateAutoAnswerBtn();
      const wakeLockStatus = await screenWakeLock.setEnabled(ui.config.keepScreenAwake);
      if (ui.config.keepScreenAwake && wakeLockStatus.reason === "not-classroom") ui.toast("设置已保存；进入课堂页后将尝试保持亮屏", 3e3); else if (ui.config.keepScreenAwake && wakeLockStatus.reason === "unsupported") ui.toast("设置已保存；当前浏览器不支持课堂保持亮屏", 3500); else if (ui.config.keepScreenAwake && wakeLockStatus.reason === "request-failed") ui.toast("设置已保存；系统未允许保持亮屏，请检查省电模式或浏览器权限", 4e3); else ui.toast("设置已保存");
    });
    //--------------------------------------
    //            重置为默认
    //--------------------------------------
        root$5.querySelector("#ykt-btn-settings-reset").addEventListener("click", async () => {
      if (!confirm("确定要重置为默认设置吗？")) return;
      Object.assign(ui.config, JSON.parse(JSON.stringify(DEFAULT_CONFIG)));
      ensureAIProfiles(ui.config.ai);
      ui.config.autoJoinEnabled = false;
      ui.config.autoAnswerOnAutoJoin = true;
      syncFormFromConfig();
      storage.set("kimiApiKey", "");
      ui.saveConfig();
      document.getElementById("ykt-btn-bell")?.classList.toggle("active", ui.config.notifyProblems);
      ui.updateAutoAnswerBtn();
      await screenWakeLock.setEnabled(false);
      ui.toast("设置已重置");
    });
    // 音频设置
        const MAX_SIZE = 2 * 1024 * 1024;
    if ($audioFile) $audioFile.addEventListener("change", e => {
      const f = e.target.files?.[0];
      if (!f) return;
      if (f.size > MAX_SIZE) {
        ui.toast("音频文件过大（>2MB）", 3e3);
        return;
      }
      const reader = new FileReader;
      reader.onload = () => {
        const src = reader.result;
        ui.setCustomNotifyAudio({
          src: src,
          name: f.name
        });
        $audioName.textContent = `当前：${f.name}`;
        ui._playNotifySound(ui.config.notifyVolume);
        ui.toast("已应用自定义提示音");
      };
      reader.readAsDataURL(f);
    });
    if ($applyUrl) $applyUrl.addEventListener("click", () => {
      const url = ($audioUrl.value || "").trim();
      if (!url) return ui.toast("请输入音频URL");
      if (!/^https?:\/\/|^data:audio\//i.test(url)) {
        ui.toast("URL 必须以 http/https 或 data:audio/ 开头");
        return;
      }
      ui.setCustomNotifyAudio({
        src: url,
        name: ""
      });
      $audioName.textContent = "当前：（自定义URL）";
      ui._playNotifySound(ui.config.notifyVolume);
      ui.toast("已应用自定义音频URL");
    });
    if ($preview) $preview.addEventListener("click", () => {
      ui._playNotifySound(ui.config.notifyVolume);
    });
    if ($clear) $clear.addEventListener("click", () => {
      ui.setCustomNotifyAudio({
        src: "",
        name: ""
      });
      $audioName.textContent = "当前：使用内置“叮-咚”提示音";
      ui.toast("已清除自定义音频");
    });
    // 关闭按钮
        root$5.querySelector("#ykt-settings-close").addEventListener("click", () => showSettingsPanel(false));
    mounted$6 = true;
    return root$5;
  }
  function showSettingsPanel(visible = true) {
    mountSettingsPanel();
    const panel = document.getElementById("ykt-settings-panel");
    if (!panel) return;
    if (visible) syncMountedForm();
    panel.classList.toggle("visible", !!visible);
  }
  function toggleSettingsPanel() {
    mountSettingsPanel();
    const panel = document.getElementById("ykt-settings-panel");
    showSettingsPanel(!panel.classList.contains("visible"));
  }
  var tpl$4 = '<div id="ykt-ai-answer-panel" class="ykt-panel">\r\n  <div class="panel-header">\r\n    <h3><i class="fas fa-robot"></i> AI 融合分析</h3>\r\n    <span id="ykt-ai-close" class="close-btn" title="关闭">\r\n      <i class="fas fa-times"></i>\r\n    </span>\r\n  </div>\r\n  <div class="panel-body">\r\n    <div style="margin-bottom: 10px;">\r\n      <strong>当前题目：</strong>\r\n      <div style="font-size: 12px; color: #666; margin: 4px 0;">\r\n        系统将自动识别当前页面的题目\r\n      </div>\r\n      <div id="ykt-ai-text-status" class="text-status warning">\r\n        正在检测题目信息...\r\n      </div>\r\n      <div id="ykt-ai-question-display" class="ykt-question-display">\r\n        提示：系统使用融合模式，同时分析题目文本信息和页面图像，提供最准确的答案。\r\n      </div>\r\n    </div>\r\n    \x3c!-- 当前要提问的PPT预览 --\x3e\r\n    <div id="ykt-ai-selected" style="display:none; margin: 10px 0;">\r\n      <strong>已选PPT预览：</strong>\r\n      <div style="font-size: 12px; color: #666; margin: 4px 0;">\r\n        下方小图为即将用于分析的PPT页面截图\r\n      </div>\r\n      <div style="border: 1px solid var(--ykt-border-strong); padding: 6px; border-radius: 6px; display: inline-block;">\r\n        \x3c!-- 兼容旧单页：仍保留该 img --\x3e\r\n        <img id="ykt-ai-selected-thumb"\r\n             alt="已选PPT预览"\r\n             style="max-width: 180px; max-height: 120px; display:none;" />\r\n\r\n        \x3c!-- 多页预览容器：由 ai.js 动态填充 --\x3e\r\n        <div id="ykt-ai-selected-thumbs"\r\n             style="display:flex; flex-wrap:wrap; gap:6px; max-width: 420px;">\r\n        </div>\r\n      </div>\r\n    </div>\r\n    <div style="margin-bottom: 10px;">\r\n      <strong>自定义提示（可选）：</strong>\r\n      <div style="font-size: 12px; color: #666; margin: 4px 0;">\r\n        提示：此内容将追加到系统生成的prompt后面，可用于补充特殊要求或背景信息。\r\n      </div>\r\n      <textarea \r\n        id="ykt-ai-custom-prompt" \r\n        class="ykt-custom-prompt"\r\n        placeholder="例如：请用中文回答、注重解题思路、考虑XXX知识点等"\r\n      ></textarea>\r\n    </div>\r\n\r\n    <button id="ykt-ai-ask" style="width: 100%; height: 32px; border-radius: 6px; border: 1px solid var(--ykt-border-strong); background: #f7f8fa; cursor: pointer; margin-bottom: 10px;">\r\n      <i class="fas fa-brain"></i> 融合模式分析（文本+图像）\r\n    </button>\r\n\r\n    <div id="ykt-ai-loading" class="ai-loading" style="display: none;">\r\n      <i class="fas fa-spinner fa-spin"></i> AI正在使用融合模式分析...\r\n    </div>\r\n    <div id="ykt-ai-error" class="ai-error" style="display: none;"></div>\r\n    <div>\r\n      <strong>AI 分析结果：</strong>\r\n      <div id="ykt-ai-answer" class="ai-answer"></div>\r\n    </div>\r\n    \x3c!-- 可编辑答案区 --\x3e\r\n    <div id="ykt-ai-edit-section" style="display:none; margin-top:12px;">\r\n      <strong>提交前可编辑答案：</strong>\r\n      <div style="font-size: 12px; color: #666; margin: 4px 0;">\r\n        提示：这里是将要提交的“结构化答案”。可直接编辑。支持：\r\n        <br>• 选择题/投票：填写 <code>["A"]</code> 或 <code>A,B</code>\r\n        <br>• 填空题：填写 <code>[" 1"]</code> 或 直接写 <code> 1</code>（自动包成数组）\r\n        <br>• 主观题：可填 JSON（如 <code>{"content":"略","pics":[]}</code>）或直接输入文本\r\n      </div>\r\n      <textarea id="ykt-ai-answer-edit"\r\n        style="width:100%; min-height:88px; border:1px solid var(--ykt-border-strong); border-radius:6px; padding:6px; font-family:monospace;"></textarea>\r\n      <div id="ykt-ai-validate" style="font-size:12px; color:#666; margin-top:6px;"></div>\r\n      <div style="margin-top:8px; display:flex; gap:8px;">\r\n        <button id="ykt-ai-submit" class="ykt-btn ykt-btn-primary" style="flex:0 0 auto;">\r\n          提交编辑后的答案\r\n        </button>\r\n        <button id="ykt-ai-reset-edit" class="ykt-btn" style="flex:0 0 auto;">重置为 AI 建议</button>\r\n      </div>\r\n    </div>\r\n  </div>\r\n</div>';
  // src/ai/kimi.js
  // 将后端 problemType 数字映射为 Step1/Step2 使用的 question_type 字符串
  // 约定：
  // 1 -> single_choice   （单选）
  // 2 -> multiple_choice （多选）
  // 3 -> single_choice   （投票题按单选处理）
  // 4 -> fill_in         （填空题）
  // 5 -> subjective      （主观题 / 简答题）
    function mapProblemTypeToQuestionType(problemType) {
    if (problemType == null) return null;
    const n = Number(problemType);
    switch (n) {
     case 1:
      return "single_choice";

     case 2:
      return "multiple_choice";

     case 3:
      return "single_choice";

     case 4:
      return "fill_in";

     case 5:
      return "subjective";

     default:
      return null;
    }
  }
  const MOONSHOT_CHAT_HOSTS = new Set([ "api.moonshot.cn", "api.moonshot.ai" ]);
  function getActiveProfile(aiCfg) {
    const cfg = aiCfg || {};
    const profiles = Array.isArray(cfg.profiles) ? cfg.profiles : [];
    if (!profiles.length) {
      const legacyKey = cfg.kimiApiKey;
      if (!legacyKey) return null;
      return {
        id: "legacy",
        name: "Kimi Legacy",
        baseUrl: "https://api.moonshot.cn/v1/chat/completions",
        apiKey: legacyKey,
        model: "kimi-k3",
        visionModel: "kimi-k3"
      };
    }
    const activeId = cfg.activeProfileId;
    let p = profiles.find(p => p.id === activeId);
    if (!p) p = profiles[0];
    if (!p.baseUrl) p.baseUrl = "https://api.moonshot.cn/v1/chat/completions";
    return p;
  }
  function makeChatUrl(profile) {
    const rawUrl = String(profile?.baseUrl || "").trim();
    if (!rawUrl) throw new Error("请先在设置中填写 AI 接口 URL");
    let url;
    try {
      url = new URL(rawUrl);
    } catch {
      throw new Error("AI 接口 URL 格式无效，请填写完整的 http(s) 地址");
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("AI 接口 URL 必须使用 http 或 https");
    // Kimi 的 Chat Completions 接口地址是 /v1/chat/completions。
    // 兼容误填 /v1、/v1/responses，或漏写接口路径的情况。
        if (MOONSHOT_CHAT_HOSTS.has(url.hostname.toLowerCase())) {
      const path = url.pathname.replace(/\/+$/, "") || "/";
      if (path === "/" || path === "/v1" || /^\/v1\/responses?$/i.test(path)) url.pathname = "/v1/chat/completions"; else if (path === "/v1/chat/completions") url.pathname = path;
    }
    return url.toString();
  }
  function assertValidChatPayload(payload) {
    if (!payload || typeof payload !== "object") throw new Error("AI 请求体无效，已阻止发送");
    if (!Array.isArray(payload.messages) || payload.messages.length === 0) throw new Error("AI 请求体 messages 为空，已阻止发送");
    payload.messages.forEach((message, index) => {
      if (!message || typeof message !== "object") throw new Error(`AI 请求体第 ${index + 1} 条消息无效，已阻止发送`);
      if (typeof message.role !== "string" || !message.role.trim()) throw new Error(`AI 请求体第 ${index + 1} 条消息缺少 role，已阻止发送`);
      const hasText = typeof message.content === "string" && message.content.trim();
      const hasParts = Array.isArray(message.content) && message.content.length > 0;
      if (!hasText && !hasParts) throw new Error(`AI 请求体第 ${index + 1} 条消息内容为空，已阻止发送`);
    });
    return payload;
  }
  function withProfileTemperature(profile, payload) {
    const {temperature: _legacyTemperature, ...requestPayload} = payload;
    const rawTemperature = profile?.temperature;
    if (rawTemperature === "" || rawTemperature === void 0 || rawTemperature === null) return requestPayload;
    const temperature = Number(rawTemperature);
    if (!Number.isFinite(temperature) || temperature < 0 || temperature > 2) throw new Error("Temperature 必须是 0 到 2 之间的数字，或留空使用模型默认值");
    return {
      ...requestPayload,
      temperature: temperature
    };
  }
  // -----------------------------------------------
  // Unified Prompt blocks for Text & Vision
  // -----------------------------------------------
    const BASE_SYSTEM_PROMPT = [ "1) 任何时候优先遵循【用户输入（优先级最高）】中的明确要求；", "2) 当输入是课件页面（PPT）图像或题干文本时，必须先判断是否存在完整、明确、可作答的题目；", "3) 若存在明确题目，第一行必须以“答案:”开头，并严格使用以下格式：", "   单选：格式要求：\n答案: [单个字母]\n解释: [选择理由]\n\n注意：只选一个，如A", "   多选：格式要求：\n答案: [多个字母用顿号分开]\n解释: [选择理由]\n\n注意：格式如A、B、C", "   投票：格式要求：\n答案: [单个字母]\n解释: [选择理由]\n\n注意：只选一个选项，如A", "   填空/主观题: 格式要求：答案: [直接给出答案内容]，解释: [补充说明]", "4) 若不存在明确题目，或题干/选项残缺，必须且只能输出以下两行；禁止输出“答案:”或猜测选项：", "STATE: NO_PROMPT", "SUMMARY: <客观介绍页面可见内容及缺失的信息>" ].join("\n");
  // Vision 补充：识别题型与版面元素的步骤说明
    const VISION_GUIDE = [ "【视觉识别要求】", "A. 先判断是否为题目页面（是否有题干/选项/空格/问句等）", "B. 若是题目，尝试提取题干、选项与关键信息；", "C. 否则参考用户输入回答" ].join("\n");
  // 通用 OpenAI 协议聊天请求封装（用于 Vision 两步调用）
    function chatCompletion(profile, payload, debugLabel = "[AI OpenAI]", timeoutMs = 6e4) {
    const url = makeChatUrl(profile);
    const requestPayload = assertValidChatPayload(withProfileTemperature(profile, payload));
    return new Promise((resolve, reject) => {
      gm.xhr({
        method: "POST",
        url: url,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${profile.apiKey}`
        },
        data: JSON.stringify(requestPayload),
        timeout: timeoutMs,
        onload: res => {
          try {
            console.log(`[雨课堂助手]${debugLabel} Status:`, res.status);
            console.log(`[雨课堂助手]${debugLabel} Response:`, res.responseText);
            if (res.status !== 200) {
              let errorMessage = `AI 请求失败: ${res.status}`;
              try {
                const errorData = JSON.parse(res.responseText);
                if (errorData.error?.message) errorMessage += ` - ${errorData.error.message}`;
                if (errorData.error?.code) errorMessage += ` (${errorData.error.code})`;
              } catch {
                errorMessage += ` - ${res.responseText}`;
              }
              reject(new Error(errorMessage));
              return;
            }
            const data = JSON.parse(res.responseText);
            resolve(data);
          } catch (e) {
            console.error(`[雨课堂助手]${debugLabel} 解析响应失败:`, e);
            reject(new Error(`解析API响应失败: ${e.message}`));
          }
        },
        onerror: err => {
          console.error(`[雨课堂助手]${debugLabel} 网络请求失败:`, err);
          reject(new Error("网络请求失败"));
        }
      });
    });
  }
  async function singleStepVisionCall(profile, cleanBase64List, textPrompt, options = {}) {
    const visionModel = profile.visionModel || profile.model;
    const timeoutMs = options.timeout || 6e4;
    const visionTextHeader = [ "【融合模式说明】你将看到一张课件/PPT截图与可选的附加文本。", VISION_GUIDE ].join("\n");
    const imageBlocks = [];
    for (const b64 of cleanBase64List) imageBlocks.push({
      type: "image_url",
      image_url: {
        url: `data:image/png;base64,${b64}`
      }
    });
    const messages = [ {
      role: "system",
      content: BASE_SYSTEM_PROMPT
    }, {
      role: "user",
      content: [ ...imageBlocks, {
        type: "text",
        text: [ visionTextHeader, "【用户输入（优先级最高）】", textPrompt || "（无）" ].join("\n")
      } ]
    } ];
    const data = await chatCompletion(profile, {
      model: visionModel,
      messages: messages
    }, "[AI OpenAI Vision 单步]", timeoutMs);
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error("AI返回内容为空");
    console.log("[AI OpenAI Vision] 成功获取回答(单步)");
    return content;
  }
  /**
   * 通用 OpenAI 协议 Vision 模型（图像+文本）
   */  async function queryAIVision(imageBase64, textPrompt, aiCfg, options = {}) {
    const profile = getActiveProfile(aiCfg);
    if (!profile || !profile.apiKey) throw new Error("请先在设置中配置 AI API Key");
    // ===== 兼容单图 / 多图 =====
        const inputList = Array.isArray(imageBase64) ? imageBase64 : [ imageBase64 ];
    const cleanBase64List = inputList.filter(Boolean).map(x => String(x).replace(/^data:image\/[^;]+;base64,/, "")).filter(x => !!x);
    if (cleanBase64List.length === 0) throw new Error("图像数据格式错误");
    const visionModel = profile.visionModel || profile.model;
    const textModel = profile.model;
    const hasSeparateTextModel = !!textModel && textModel !== visionModel;
    const {disableTwoStep: disableTwoStep = false, twoStepDebug: twoStepDebug = false, timeout: timeoutMs = 6e4, problemType: problemType = null} = options || {};
    // -------- 0. 如果只有 VLM（或者显式关闭两步），回退到单步逻辑 --------
        if (!hasSeparateTextModel || disableTwoStep) {
      if (twoStepDebug) console.log("[雨课堂助手][INFO][vision] use single-step vision", {
        hasSeparateTextModel: hasSeparateTextModel,
        disableTwoStep: disableTwoStep
      });
      return singleStepVisionCall(profile, cleanBase64List, textPrompt, {
        timeout: timeoutMs
      });
    }
    if (twoStepDebug) console.log("[雨课堂助手][INFO][vision] use TWO-STEP pipeline", {
      visionModel: visionModel,
      textModel: textModel
    });
    // ===================== Step 1: Vision 抽结构化题目 =====================
        const STEP1_SYSTEM_PROMPT = `\n你是一个“题目结构化助手”。你将看到课件截图和可选的附加文本，请从中提取出清晰的题目结构，并以 JSON 格式输出。\n\n你不仅要识别文字（类似 OCR），还要理解图片里的内容（例如物体、颜色、形状、数量、相对位置等），并把这些与题目有关的信息转化为题干或补充说明的一部分。\n\n【题型识别优先级】\n1. 如果页面上出现了明确的题型标签文字，如：\n   - "单选题"、"多选题"、"投票题"、"填空题"、"主观题" 等，\n   请优先根据这些标签设置 question_type：\n   - 单选题 / 投票题 -> "single_choice"\n   - 多选题         -> "multiple_choice"\n   - 填空题         -> "fill_in"\n   - 主观题 / 简答题 / 论述题 -> "subjective"\n2. 当没有明显题型标签时，再根据题干语义和版面结构推断题型。\n\n【选项字母规则】\n- 只有在页面上出现了清晰的选项字母（通常为 "A."、"B."、"C."、"D." 等）并跟随选项内容时，才能将 question_type 设为 "single_choice" 或 "multiple_choice"（或投票题对应的 "single_choice"）。\n- 如果没有任何 A/B/C/D 这种选项字母，而问题又需要开放性自由回答，请优先将 question_type 设为 "subjective"。\n\n请尽量识别：\n- question_type: "single_choice" | "multiple_choice" | "fill_in" | "subjective" | "visual_only" | "unknown"\n- stem: 题干文本（如果题干主要依赖图片，请用自然语言描述图片中与题目相关的内容，可保留数学公式信息）\n- options: 一个对象，键为 "A"、"B"、"C"、"D" 等，值为选项内容文字（若不是选择题可为空对象）\n- image_facts: （可选）一个字符串数组，列出与解题有关的关键图像事实，例如 ["图中是一根黄色的香蕉", "背景是白色"]。\n- requires_image_for_solution: 布尔值。如果即使你尽力用文字描述图片，仍然很难仅凭文字保证答对（例如复杂几何图形或高度依赖精确位置关系的题目），请设为 true；如果你的文字描述已经足够让人类或文字模型解题，请设为 false。\n\n输出示例（仅示例，不是固定模板）：\n{\n  "question_type": "single_choice",\n  "stem": "根据图片中的水果，选择它的颜色。",\n  "options": {\n    "A": "红色",\n    "B": "黄色",\n    "C": "蓝色",\n    "D": "绿色"\n  },\n  "image_facts": [\n    "图片中是一根黄色的香蕉，背景为白色"\n  ],\n  "requires_image_for_solution": false\n}\n\n如果无法识别题目或截图并非题目，请尽量给出你能看到的内容，但仍然保持上述 JSON 结构（字段缺省时可以用 null、空对象或空数组）。\n仅输出 JSON，不要任何额外文字。\n`.trim();
    const step1Messages = [ {
      role: "system",
      content: STEP1_SYSTEM_PROMPT
    }, {
      role: "user",
      content: [ ...cleanBase64List.map(b64 => ({
        type: "image_url",
        image_url: {
          url: `data:image/png;base64,${b64}`
        }
      })), textPrompt ? {
        type: "text",
        text: `【辅助文本】\n${textPrompt}`
      } : {
        type: "text",
        text: "【辅助文本】（无额外文本，仅根据截图识别题目）"
      } ]
    } ];
    let structuredQuestion;
    try {
      const data1 = await chatCompletion(profile, {
        model: visionModel,
        messages: step1Messages
      }, "[AI OpenAI Vision Step1]", timeoutMs);
      const content1 = data1.choices?.[0]?.message?.content || "";
      if (twoStepDebug) console.log("[雨课堂助手][DEBUG][vision-step1] raw content:", content1);
      const jsonMatch = content1.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("no JSON found in step1 result");
      structuredQuestion = JSON.parse(jsonMatch[0]);
    } catch (err) {
      console.warn("[雨课堂助手][WARN][vision-step1] failed, fallback to single-step", err);
      return singleStepVisionCall(profile, cleanBase64List, textPrompt, {
        timeout: timeoutMs
      });
    }
    if (!structuredQuestion || !structuredQuestion.stem) {
      console.warn("[雨课堂助手][WARN][vision-step1] invalid structuredQuestion, fallback");
      return singleStepVisionCall(profile, cleanBase64List, textPrompt, {
        timeout: timeoutMs
      });
    }
    if (twoStepDebug) console.log("[雨课堂助手][INFO][vision-step1] structuredQuestion:", structuredQuestion);
    // ========= 题型合并逻辑：后端 problemType 优先，其次 VLM 推断，全部缺失则回退 subjective =========
        const backendQuestionType = mapProblemTypeToQuestionType(problemType);
    const vlmQuestionType = structuredQuestion.question_type || null;
    let finalQuestionType = backendQuestionType || vlmQuestionType || null;
    // 如果 VLM 返回的是 unknown / visual_only 这类不太可用的类型，也当成“缺失”
        if (finalQuestionType === "unknown" || finalQuestionType === "visual_only") finalQuestionType = null;
    // 当后端和 VLM 都没有给出可用题型时，统一回退为主观题
        if (!finalQuestionType) finalQuestionType = "subjective";
    if (twoStepDebug) console.log("[雨课堂助手][INFO][vision-step1] questionType merged:", {
      problemType: problemType,
      backendQuestionType: backendQuestionType,
      vlmQuestionType: vlmQuestionType,
      finalQuestionType: finalQuestionType
    });
    // 如果模型明确表示“必须依赖原始图像才能解题”，则回退到单步 Vision，避免纯文本推理丢失关键信息
        if (structuredQuestion.requires_image_for_solution === true) {
      console.warn("[雨课堂助手][INFO][vision] step1 says image is essential, fallback to single-step");
      return singleStepVisionCall(profile, cleanBase64List, textPrompt, {
        timeout: timeoutMs
      });
    }
    // ===================== Step 2: Text 模型纯文本推理解题 =====================
        const {question_type: question_type, stem: stem, options: sqOptions = {}, image_facts: image_facts = []} = structuredQuestion;
    let solvePrompt = "你是一个严谨的解题助手，请根据下面的题目进行推理解答：\n\n";
    solvePrompt += `【题干】\n${stem}\n\n`;
    const optionKeys = Object.keys(sqOptions);
    if (optionKeys.length > 0) {
      solvePrompt += "【选项】\n";
      for (const key of optionKeys) solvePrompt += `${key}. ${sqOptions[key]}\n`;
      solvePrompt += "\n";
    }
    solvePrompt += "请逐步推理，推理结果按以下格式输出：\n";
    if (finalQuestionType === "single_choice") solvePrompt += "答案: [单个大写字母]\n解释: [简要说明你的推理过程]\n"; else if (finalQuestionType === "multiple_choice") solvePrompt += "答案: [多个大写字母，用顿号分隔，如 A、C、D]\n解释: [简要说明你的推理过程]\n"; else if (finalQuestionType === "fill_in") solvePrompt += "答案: [直接给出需要填入的内容，多个空用逗号分隔]\n解释: [简要说明你的推理过程]\n"; else if (finalQuestionType === "subjective") solvePrompt += "答案: [完整回答]\n解释: [可选的补充说明]\n";
    // 将图像关键信息一并提供给文本模型，用于弥补完全无图像输入的劣势
        if (Array.isArray(image_facts) && image_facts.length > 0) {
      solvePrompt += "【图像关键信息】\n";
      for (const fact of image_facts) if (typeof fact === "string" && fact.trim()) solvePrompt += `- ${fact.trim()}\n`;
      solvePrompt += "\n";
    }
    const step2Messages = [ {
      role: "system",
      content: "你是一个解题助手，请严格按照用户指定的输出格式作答，尽量保证答案正确。"
    }, {
      role: "user",
      content: [ {
        type: "text",
        text: solvePrompt
      } ]
    } ];
    try {
      const data2 = await chatCompletion(profile, {
        model: textModel,
        messages: step2Messages
      }, "[AI OpenAI Vision Step2]", timeoutMs);
      const content2 = data2.choices?.[0]?.message?.content || "";
      if (!content2) throw new Error("AI返回内容为空");
      if (twoStepDebug) console.log("[雨课堂助手][INFO][vision-step2] final content:", content2);
      return content2;
    } catch (err) {
      console.warn("[雨课堂助手][WARN][vision-step2] failed, fallback to single-step", err);
      return singleStepVisionCall(profile, cleanBase64List, textPrompt, {
        timeout: timeoutMs
      });
    }
  }
  async function queryOCRVision(imageBase64, aiCfg) {
    const cfg = aiCfg || {};
    const baseProfile = getActiveProfile(cfg);
    const resolvedApiKey = (cfg.ocrApiKey || "").trim() || baseProfile?.apiKey || "";
    if (!baseProfile || !resolvedApiKey) throw new Error("请先在设置中填写可用的 OCR API Key 或 AI API Key");
    const profile = {
      ...baseProfile,
      baseUrl: (cfg.ocrApi || "").trim() || baseProfile.baseUrl,
      apiKey: resolvedApiKey
    };
    const cleanBase64 = String(imageBase64 || "").replace(/^data:image\/[^;]+;base64,/, "").trim();
    if (!cleanBase64) throw new Error("OCR 图片内容为空");
    const data = await chatCompletion(profile, {
      model: profile.visionModel || profile.model,
      messages: [ {
        role: "system",
        content: [ "你是一个 OCR 助手。", "只提取图片中可见的文字内容，不要解题，不要总结，不要补充说明。", "尽量保留原有段落、标题、列表和换行。", "如果图片里没有可识别文字，只返回“未识别到文字”。" ].join("\n")
      }, {
        role: "user",
        content: [ {
          type: "image_url",
          image_url: {
            url: `data:image/png;base64,${cleanBase64}`
          }
        }, {
          type: "text",
          text: "请直接输出图片中的全部文字，保持结果可复制。"
        } ]
      } ]
    }, "[AI OCR Vision]", 6e4);
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error("OCR 接口未返回文本内容");
    return String(content).trim();
  }
  async function queryTranslationText(text, targetLanguage, aiCfg) {
    const cfg = aiCfg || {};
    const baseProfile = getActiveProfile(cfg);
    const resolvedApiKey = (cfg.translateApiKey || "").trim() || baseProfile?.apiKey || "";
    if (!baseProfile || !resolvedApiKey) throw new Error("请先在设置中填写可用的翻译 API Key 或 AI API Key");
    const resolvedTargetLanguage = String(targetLanguage).trim();
    if (!resolvedTargetLanguage) throw new Error("翻译目标语言不能为空");
    const sourceText = String(text || "").trim();
    if (!sourceText) throw new Error("没有可翻译的文字内容");
    const profile = {
      ...baseProfile,
      baseUrl: (cfg.translateApi || "").trim() || baseProfile.baseUrl,
      apiKey: resolvedApiKey,
      model: (cfg.translateModel || "").trim() || baseProfile.model
    };
    const data = await chatCompletion(profile, {
      model: profile.model,
      messages: [ {
        role: "system",
        content: [ "你是一个专业翻译助手。", "只执行翻译，不要解释，不要总结，不要补充。", "尽量保留原文段落、列表、编号、公式和专有名词格式。", `将用户提供的文本翻译为：${resolvedTargetLanguage}。` ].join("\n")
      }, {
        role: "user",
        content: [ {
          type: "text",
          text: sourceText
        } ]
      } ]
    }, "[AI Translate]", 6e4);
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error("翻译接口未返回文本内容");
    return String(content).trim();
  }
  // src/capture/screenshot.js
    async function captureProblemScreenshot() {
    try {
      const html2canvas = await ensureHtml2Canvas();
      const el = document.querySelector(".ques-title") || document.querySelector(".problem-body") || document.querySelector(".ppt-inner") || document.querySelector(".ppt-courseware-inner") || document.body;
      return await html2canvas(el, {
        useCORS: true,
        allowTaint: false,
        backgroundColor: "#ffffff",
        scale: 1,
        width: Math.min(el.scrollWidth, 1200),
        height: Math.min(el.scrollHeight, 800)
      });
    } catch (e) {
      console.error("[captureProblemScreenshot] failed", e);
      return null;
    }
  }
  /**
   * 获取指定幻灯片的截图
   * @param {string} slideId - 幻灯片ID
   * @returns {Promise<string|null>} base64图片数据
   */  async function captureSlideImage(slideId) {
    try {
      console.log("[captureSlideImage] 获取幻灯片图片:", slideId);
      const slide = repo.slides.get(slideId);
      if (!slide) {
        console.error("[captureSlideImage] 找不到幻灯片:", slideId);
        return null;
      }
      // 使用 cover 或 coverAlt 图片URL
            const imageUrl = slide.coverAlt || slide.cover || slide.image || slide.thumbnail;
      if (!imageUrl) {
        console.error("[captureSlideImage] 幻灯片没有图片URL");
        return null;
      }
      console.log("[captureSlideImage] 图片URL:", imageUrl);
      // 下载图片并转换为base64
            const base64 = await downloadImageAsBase64(imageUrl);
      if (!base64) {
        console.error("[captureSlideImage] 下载图片失败");
        return null;
      }
      console.log("[captureSlideImage] ✅ 成功获取图片, 大小:", Math.round(base64.length / 1024), "KB");
      return base64;
    } catch (e) {
      console.error("[captureSlideImage] 失败:", e);
      return null;
    }
  }
  /**
   * 下载图片并转换为base64
   * @param {string} url - 图片URL
   * @returns {Promise<string|null>}
   */  async function downloadImageAsBase64(url) {
    return new Promise(resolve => {
      try {
        const img = new Image;
        img.crossOrigin = "anonymous";
        img.onload = () => {
          try {
            const canvas = document.createElement("canvas");
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext("2d");
            ctx.drawImage(img, 0, 0);
            const base64 = canvas.toDataURL("image/jpeg", .8).split(",")[1];
            if (base64.length > 1e6) {
              console.log("[雨课堂助手][INFO][downloadImageAsBase64] 图片过大，进行压缩...");
              const compressed = canvas.toDataURL("image/jpeg", .5).split(",")[1];
              console.log("[雨课堂助手][INFO][downloadImageAsBase64] 压缩后大小:", Math.round(compressed.length / 1024), "KB");
              resolve(compressed);
            } else resolve(base64);
          } catch (e) {
            console.error("[雨课堂助手][ERR][downloadImageAsBase64] Canvas处理失败:", e);
            resolve(null);
          }
        };
        img.onerror = e => {
          console.error("[雨课堂助手][ERR][downloadImageAsBase64] 图片加载失败:", e);
          resolve(null);
        };
        img.src = url;
      } catch (e) {
        console.error("[雨课堂助手][ERR][downloadImageAsBase64] 失败:", e);
        resolve(null);
      }
    });
  }
  // 原有的 captureProblemForVision
    async function captureProblemForVision() {
    try {
      console.log("[captureProblemForVision] 开始截图...");
      const canvas = await captureProblemScreenshot();
      if (!canvas) {
        console.error("[captureProblemForVision] 截图失败");
        return null;
      }
      console.log("[captureProblemForVision] 截图成功，转换为base64...");
      const base64 = canvas.toDataURL("image/jpeg", .8).split(",")[1];
      console.log("[captureProblemForVision] base64 长度:", base64.length);
      if (base64.length > 1e6) {
        console.log("[captureProblemForVision] 图片过大，进行压缩...");
        const smallerBase64 = canvas.toDataURL("image/jpeg", .5).split(",")[1];
        console.log("[captureProblemForVision] 压缩后长度:", smallerBase64.length);
        return smallerBase64;
      }
      return base64;
    } catch (e) {
      console.error("[captureProblemForVision] failed", e);
      return null;
    }
  }
  function cleanProblemBody(body, problemType, TYPE_MAP) {
    if (!body) return "";
    const typeLabel = TYPE_MAP[problemType];
    if (!typeLabel) return body;
    // 去除题目开头的类型标识，如 "填空题：" "单选题：" 等
        const pattern = new RegExp(`^${typeLabel}[：:\\s]+`, "i");
    return body.replace(pattern, "").trim();
  }
  // 改进的融合模式 prompt 格式化函数
    function formatProblemForVision(problem, TYPE_MAP, hasTextInfo = false) {
    const problemType = TYPE_MAP[problem.problemType] || "题目";
    let basePrompt = hasTextInfo ? `结合文本信息和图片内容分析${problemType}，按格式回答：` : `观察图片内容，识别${problemType}并按格式回答：`;
    if (hasTextInfo && problem.body) {
      // ✅ 清理题目内容
      const cleanBody = cleanProblemBody(problem.body, problem.problemType, TYPE_MAP);
      basePrompt += `\n\n【文本信息】\n题目：${cleanBody}`;
      if (problem.options?.length) {
        basePrompt += "\n选项：";
        for (const o of problem.options) basePrompt += `\n${o.key}. ${o.value}`;
      }
      basePrompt += "\n\n若图片内容与文本冲突，以图片为准。";
    }
    // 根据题目类型添加具体格式要求
        switch (problem.problemType) {
     case 1:
      // 单选题
      basePrompt += `\n\n格式要求：\n答案: [单个字母]\n解释: [选择理由]\n\n注意：只选一个，如A`;
      break;

     case 2:
      // 多选题
      basePrompt += `\n\n格式要求：\n答案: [多个字母用顿号分开]\n解释: [选择理由]\n\n注意：格式如A、B、C`;
      break;

     case 3:
      // 投票题
      basePrompt += `\n\n格式要求：\n答案: [单个字母]\n解释: [选择理由]\n\n注意：只选一个选项`;
      break;

     case 4:
      // 填空题
      basePrompt += `\n\n这是一道填空题。\n\n重要说明：\n- 题目内容已经处理，不含"填空题"等字样\n- 观察图片和文本，找出需要填入的内容\n- 答案中不要出现任何题目类型标识\n\n格式要求：\n答案: [直接给出填空内容]\n解释: [简要说明]\n\n示例：\n答案: 氧气,葡萄糖\n解释: 光合作用的产物\n\n多个填空用逗号分开`;
      break;

     case 5:
      // 主观题
      basePrompt += `\n\n格式要求：\n答案: [完整回答]\n解释: [补充说明]\n\n注意：直接回答，不要重复题目`;
      break;

     default:
      basePrompt += `\n\n格式要求：\n答案: [你的答案]\n解释: [详细解释]`;
    }
    return basePrompt;
  }
  // 改进的答案解析函数
    function parseAIAnswer(problem, aiAnswer) {
    try {
      const rawAnswer = String(aiAnswer || "");
      if (/^\s*STATE\s*:\s*NO[_\s-]*PROMPT\s*$/im.test(rawAnswer)) {
        console.log("[雨课堂助手][INFO][parseAIAnswer] 模型判定无题目，不生成建议答案");
        return null;
      }
      const lines = rawAnswer.split("\n");
      let answerLine = "";
      let answerIdx = -1;
      // 先定位“答案:”所在行
            for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.includes("答案:") || line.includes("答案：")) {
          answerLine = line.replace(/答案[:：]\s*/, "").trim();
          answerIdx = i;
          break;
        }
      }
      // === 对填空题和主观题，允许多行答案 ===
            if ((problem.problemType === 4 || problem.problemType === 5) && answerIdx >= 0) {
        const block = [];
        // 当前行如果有内容，先收进去
                if (answerLine) block.push(answerLine);
        // 继续向下收集，直到遇到“解释:”或文本结束
                for (let i = answerIdx + 1; i < lines.length; i++) {
          const l = lines[i];
          if (/^\s*解释[:：]/.test(l)) break;
          block.push((l || "").trimEnd());
        }
        const merged = block.join("\n").trim();
        if (merged) answerLine = merged;
      }
      // 如果仍然没有任何答案内容，退回到第一行兜底
            if (!answerLine) {
        const firstLine = (lines[0] || "").trim();
        const isChoice = problem.problemType === 1 || problem.problemType === 2 || problem.problemType === 3;
        if (isChoice && !/^(?:[A-Z]+|[A-Z](?:[、,，\s]+[A-Z])+)$/i.test(firstLine)) {
          console.log("[雨课堂助手][INFO][parseAIAnswer] 选择题缺少明确答案行，拒绝猜测");
          return null;
        }
        answerLine = firstLine;
      }
      console.log("[雨课堂助手][INFO][parseAIAnswer] 题目类型:", problem.problemType, "原始答案行:", answerLine);
      switch (problem.problemType) {
       case 1:
 // 单选题
               case 3:
        {
          // 投票题
          const validOptions = new Set((problem.options || []).map(option => String(option.key || "").toUpperCase()));
          const letters = answerLine.match(/\b[A-Z]\b/g) || [];
          const matched = letters.find(letter => validOptions.size === 0 || validOptions.has(letter));
          if (matched) {
            console.log("[雨课堂助手][INFO][parseAIAnswer] 单选/投票解析结果:", [ matched ]);
            return [ matched ];
          }
          const chineseMatch = answerLine.match(/选择?([ABCDEFGHIJKLMNOPQRSTUVWXYZ])/);
          if (chineseMatch && (validOptions.size === 0 || validOptions.has(chineseMatch[1]))) {
            console.log("[雨课堂助手][INFO][parseAIAnswer] 单选/投票中文解析结果:", [ chineseMatch[1] ]);
            return [ chineseMatch[1] ];
          }
          console.log("[雨课堂助手][INFO][parseAIAnswer] 单选/投票解析失败");
          return null;
        }

       case 2:
        {
          // 多选题
          const validOptions = new Set((problem.options || []).map(option => String(option.key || "").toUpperCase()));
          const validOnly = letters => letters.filter(letter => validOptions.size === 0 || validOptions.has(letter));
          if (answerLine.includes("、")) {
            const options = answerLine.split("、").map(s => s.trim().match(/[ABCDEFGHIJKLMNOPQRSTUVWXYZ]/)).filter(m => m).map(m => m[0]);
            const filtered = validOnly(options);
            if (filtered.length > 0) {
              const result = [ ...new Set(filtered) ].sort();
              console.log("[雨课堂助手][INFO][parseAIAnswer] 多选顿号解析结果:", result);
              return result;
            }
          }
          if (answerLine.includes(",") || answerLine.includes("，")) {
            const options = answerLine.split(/[,，]/).map(s => s.trim().match(/[ABCDEFGHIJKLMNOPQRSTUVWXYZ]/)).filter(m => m).map(m => m[0]);
            const filtered = validOnly(options);
            if (filtered.length > 0) {
              const result = [ ...new Set(filtered) ].sort();
              console.log("[雨课堂助手][INFO][parseAIAnswer] 多选逗号解析结果:", result);
              return result;
            }
          }
          const letters = validOnly(answerLine.match(/[ABCDEFGHIJKLMNOPQRSTUVWXYZ]/g) || []);
          if (letters && letters.length > 1) {
            const result = [ ...new Set(letters) ].sort();
            console.log("[雨课堂助手][INFO][parseAIAnswer] 多选连续解析结果:", result);
            return result;
          }
          if (letters && letters.length === 1) {
            console.log("[雨课堂助手][INFO][parseAIAnswer] 多选单个解析结果:", letters);
            return letters;
          }
          console.log("[雨课堂助手][INFO][parseAIAnswer] 多选解析失败");
          return null;
        }

       case 4:
        {
          // 填空题
          // 更激进的清理策略
          let cleanAnswer = answerLine.replace(/^(填空题|简答题|问答题|题目|答案是?)[:：\s]*/gi, "").trim();
          console.log("[雨课堂助手][INFO][parseAIAnswer] 清理后答案:", cleanAnswer);
          // 如果清理后还包含这些词，继续清理
                    if (/填空题|简答题|问答题|题目/i.test(cleanAnswer)) {
            cleanAnswer = cleanAnswer.replace(/填空题|简答题|问答题|题目/gi, "").trim();
            console.log("[雨课堂助手][INFO][parseAIAnswer] 二次清理后:", cleanAnswer);
          }
          const answerLength = cleanAnswer.length;
          if (answerLength <= 50) {
            cleanAnswer = cleanAnswer.replace(/^[^\w\u4e00-\u9fa5]+/, "").replace(/[^\w\u4e00-\u9fa5]+$/, "");
            const blanks = cleanAnswer.split(/[,，;；\s]+/).filter(Boolean);
            if (blanks.length > 0) {
              console.log("[雨课堂助手][INFO][parseAIAnswer] 填空解析结果:", blanks);
              return blanks;
            }
          }
          if (cleanAnswer) {
            const result = {
              content: cleanAnswer,
              pics: []
            };
            console.log("[雨课堂助手][INFO][parseAIAnswer] 简答题解析结果:", result);
            return result;
          }
          console.log("[雨课堂助手][INFO][parseAIAnswer] 填空/简答解析失败");
          return null;
        }

       case 5:
        {
          // 主观题
          const content = answerLine.replace(/^(主观题|论述题)[:：\s]*/i, "").trim();
          if (content) {
            const result = {
              content: content,
              pics: []
            };
            console.log("[雨课堂助手][INFO][parseAIAnswer] 主观题解析结果:", result);
            return result;
          }
          console.log("[雨课堂助手][INFO][parseAIAnswer] 主观题解析失败");
          return null;
        }

       default:
        console.log("[雨课堂助手][INFO][parseAIAnswer] 未知题目类型:", problem.problemType);
        return null;
      }
    } catch (e) {
      console.error("[雨课堂助手][ERR][parseAIAnswer] 解析失败", e);
      return null;
    }
  }
  const L$3 = (...a) => console.log("[雨课堂助手][DBG][vuex-helper]", ...a);
  const W$3 = (...a) => console.warn("[雨课堂助手][WARN][vuex-helper]", ...a);
  const E = (...a) => console.error("[雨课堂助手][ERR][vuex-helper]", ...a);
  function getVueApp() {
    try {
      const app = document.querySelector("#app")?.__vue__;
      if (!app) W$3("getVueApp: 找不到 #app.__vue__");
      return app || null;
    } catch (e) {
      E("getVueApp 错误:", e);
      return null;
    }
  }
  // 统一返回「字符串」，并打印原始类型
    function getCurrentMainPageSlideId() {
    try {
      const app = getVueApp();
      if (!app || !app.$store) {
        W$3("getCurrentMainPageSlideId: 无 app 或 store");
        return null;
      }
      const currSlide = app.$store.state?.currSlide;
      if (!currSlide) {
        L$3("getCurrentMainPageSlideId: currSlide 为 null/undefined");
        return null;
      }
      const rawSid = currSlide.sid;
      const sidStr = rawSid == null ? null : String(rawSid);
      console.log("[getCurrentMainPageSlideId] 获取到 slideId:", sidStr, "{type:", currSlide.type, ", problemID:", currSlide.problemID, ", index:", currSlide.index, "}", "(raw type:", typeof rawSid, ", raw value:", rawSid, ")");
      return sidStr;
    } catch (e) {
      E("getCurrentMainPageSlideId 错误:", e);
      return null;
    }
  }
  function watchMainPageChange(callback) {
    const app = getVueApp();
    if (!app || !app.$store) {
      E("watchMainPageChange: 无法获取 Vue 实例或 store");
      return () => {};
    }
    const unwatch = app.$store.watch(state => state.currSlide, (ns, os) => {
      const newSid = ns?.sid == null ? null : String(ns.sid);
      const oldSid = os?.sid == null ? null : String(os.sid);
      L$3("主界面页面切换", {
        oldSid: oldSid,
        newSid: newSid,
        newType: ns?.type,
        newProblemID: ns?.problemID,
        newIndex: ns?.index,
        rawNewSidType: typeof ns?.sid
      });
      if (newSid) callback(newSid, ns);
    }, {
      deep: false
    });
    L$3("已启动主界面页面切换监听");
    return unwatch;
  }
  function waitForVueReady() {
    return new Promise(resolve => {
      const t0 = Date.now();
      const check = () => {
        const app = getVueApp();
        if (app && app.$store) {
          L$3("waitForVueReady: ok, elapsed(ms)=", Date.now() - t0);
          resolve(app);
        } else setTimeout(check, 100);
      };
      check();
    });
  }
  const COURSEWARE_CONTAINER_SELECTOR = [ "#content-page-wrap", "section.slides-list", ".slides-list", ".slide-item" ].join(", ");
  const COURSEWARE_IMAGE_SELECTOR = [ "#content-page-wrap img", "section.slides-list img", ".slides-list img", ".slide-item img", 'img[alt="cover"]' ].join(", ");
  const IMAGE_URL_ATTRIBUTES = [ "currentSrc", "src", "data-src", "data-original", "data-lazy-src", "data-url" ];
  const RASTER_IMAGE_RE = /\.(?:png|jpe?g|webp|gif|bmp|avif)(?:$|[?#])/i;
  const IMAGE_LIKE_PATH_RE = /(?:^|[/_.-])(?:image|images|img|slide|slides|cover|thumbnail)(?:[/_.-]|$)/i;
  function safeText(value) {
    return value == null ? "" : String(value).trim();
  }
  function locationParts(locationLike = {}) {
    if (locationLike && typeof locationLike === "object") {
      if (locationLike.pathname || locationLike.search || locationLike.hash) return {
        pathname: safeText(locationLike.pathname),
        search: safeText(locationLike.search),
        hash: safeText(locationLike.hash)
      };
      if (locationLike.href) try {
        return locationParts(new URL(locationLike.href));
      } catch {}
    }
    return {
      pathname: "",
      search: "",
      hash: ""
    };
  }
  function isStaticPresentationId(id) {
    return safeText(id).startsWith("static:");
  }
  function createStaticPageKey(locationLike = {}) {
    const {pathname: pathname, search: search, hash: hash} = locationParts(locationLike);
    const normalizedPath = (pathname || "/").replace(/\/+$/, "") || "/";
    return `${normalizedPath}${search}${hash}`;
  }
  function parseUrl(url, baseUrl = "") {
    const raw = safeText(url);
    if (!raw) return null;
    try {
      const fallback = baseUrl || (typeof location !== "undefined" ? location.href : "");
      return new URL(raw, fallback || void 0);
    } catch {
      return null;
    }
  }
  function isCoursewareImageUrl(url, baseUrl = "") {
    const parsed = parseUrl(url, baseUrl);
    if (!parsed || parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
    const hostname = parsed.hostname.toLowerCase();
    if (hostname === "yuketang.cn" || hostname.endsWith(".yuketang.cn")) return true;
    const pathAndQuery = `${parsed.pathname}${parsed.search}`;
    return RASTER_IMAGE_RE.test(pathAndQuery) || IMAGE_LIKE_PATH_RE.test(parsed.pathname);
  }
  function getAttribute(image, name) {
    try {
      return image?.getAttribute?.(name) || "";
    } catch {
      return "";
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
  function collectCoursewareImageUrls(doc) {
    if (!doc || typeof doc.querySelectorAll !== "function") return [];
    const baseUrl = safeText(doc.baseURI) || safeText(doc.location?.href) || (typeof location !== "undefined" ? location.href : "");
    const urls = [];
    const seen = new Set;
    let images = [];
    try {
      images = Array.from(doc.querySelectorAll(COURSEWARE_IMAGE_SELECTOR));
    } catch {
      return [];
    }
    for (const image of images) for (const rawUrl of getRawImageUrls(image)) {
      const parsed = parseUrl(rawUrl, baseUrl);
      if (!parsed || !isCoursewareImageUrl(parsed.href)) continue;
      if (seen.has(parsed.href)) continue;
      seen.add(parsed.href);
      urls.push(parsed.href);
    }
    return urls;
  }
  function isStaticCoursewareDocument(doc) {
    if (!doc || typeof doc.querySelector !== "function") return false;
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
      if (typeof presentations.entries === "function") return Array.from(presentations.entries()).map(([id, presentation]) => [ safeText(id || presentation?.id), presentation ]);
      if (Array.isArray(presentations)) return presentations.map(presentation => [ safeText(presentation?.id), presentation ]);
      if (typeof presentations === "object") return Object.entries(presentations).map(([id, presentation]) => [ safeText(id), presentation ]);
    } catch {}
    return [];
  }
  function staticPresentationEntries(presentations) {
    return presentationEntries(presentations).filter(([id, presentation]) => isStaticPresentationId(id || presentation?.id)).filter(([, presentation]) => presentation && Array.isArray(presentation.slides));
  }
  function pickStaticPresentation(presentations, options = {}) {
    const entries = staticPresentationEntries(presentations);
    if (!entries.length) return null;
    const currentId = safeText(options.currentPresentationId);
    if (isStaticPresentationId(currentId)) {
      const current = entries.find(([id]) => id === currentId);
      if (current) return current[1];
    }
    return entries[0][1];
  }
  function pickStaticFallbackSlide(presentations, options = {}) {
    const entries = staticPresentationEntries(presentations);
    if (!entries.length) return null;
    const currentSlideId = safeText(options.currentSlideId);
    const currentPresentation = pickStaticPresentation(presentations, options);
    const currentEntry = entries.find(([, presentation]) => presentation === currentPresentation);
    const orderedEntries = currentEntry ? [ currentEntry, ...entries.filter(entry => entry !== currentEntry) ] : entries;
    if (currentSlideId) for (const [, presentation] of orderedEntries) {
      const slide = presentation.slides.find(candidate => safeText(candidate?.id) === currentSlideId);
      if (slide) return {
        presentation: presentation,
        slide: slide
      };
    }
    for (const [, presentation] of orderedEntries) if (presentation.slides.length > 0) return {
      presentation: presentation,
      slide: presentation.slides[0]
    };
    return null;
  }
  const L$2 = (...a) => console.log("[雨课堂助手][DBG][ai]", ...a);
  const W$2 = (...a) => console.warn("[雨课堂助手][WARN][ai]", ...a);
  let mounted$5 = false;
  let root$4;
  let preferredSlideFromPresentation = null;
 // 启用来自presentation的页面
    let preferredSlidesFromPresentation = [];
 // 手动多页（仅用于“提问当前PPT”的多选）
    let manualMultiSlidesArmed = false;
 // 只有手动触发时才允许多图
    function renderSelectedPPTPreview() {
    const box = document.getElementById("ykt-ai-selected");
    const singleImg = document.getElementById("ykt-ai-selected-thumb");
    const thumbs = document.getElementById("ykt-ai-selected-thumbs");
    if (!box || !singleImg || !thumbs) return;
    // 清空多图容器
        thumbs.innerHTML = "";
    // 多页优先显示（来自手动多选）
        if (Array.isArray(preferredSlidesFromPresentation) && preferredSlidesFromPresentation.length > 0) {
      const items = preferredSlidesFromPresentation.map(s => ({
        slideId: asIdStr(s.slideId),
        imageUrl: s.imageUrl || ""
      })).filter(x => !!x.imageUrl);
      if (items.length > 0) {
        singleImg.style.display = "none";
        for (const it of items) {
          const img = document.createElement("img");
          img.src = it.imageUrl;
          img.alt = `PPT ${it.slideId || ""}`;
          img.style.cssText = "max-width:120px; max-height:80px; display:block; border-radius:4px;";
          thumbs.appendChild(img);
        }
        box.style.display = "";
        return;
      }
    }
    // 单页回退
        const url = preferredSlideFromPresentation?.imageUrl || "";
    if (url) {
      singleImg.src = url;
      singleImg.style.display = "";
      box.style.display = "";
    } else {
      singleImg.style.display = "none";
      box.style.display = "none";
    }
  }
  function ensureMathJax() {
    const mj = window.MathJax;
    const ok = !!(mj && mj.typesetPromise);
    if (!ok) console.warn("[雨课堂助手][WARN][ai] MathJax 未就绪（未通过 @require 预置？）");
    return Promise.resolve(ok);
  }
  function typesetTexIn(el) {
    const mj = window.MathJax;
    if (!el || !mj || typeof mj.typesetPromise !== "function") return Promise.resolve(false);
    // 等待 MathJax 自己的启动就绪
        const ready = mj.startup && mj.startup.promise ? mj.startup.promise : Promise.resolve();
    return ready.then(() => mj.typesetPromise([ el ]).then(() => true).catch(() => false));
  }
  function escapeHtml(s = "") {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function safeLink(url = "") {
    try {
      const u = new URL(url, location.origin);
      if (u.protocol === "http:" || u.protocol === "https:") return u.href;
    } catch (_) {}
    return null;
 // 非 http/https 直接丢弃，避免 javascript: 等协议
    }
  function mdToHtml(mdRaw = "") {
    // 先整体转义，确保默认无 HTML 注入
    let md = escapeHtml(mdRaw).replace(/\r\n?/g, "\n");
    // 代码块（fenced）
    // ```lang\ncode\n```
        md = md.replace(/```([a-zA-Z0-9_-]+)?\n([\s\S]*?)```/g, (_, lang, code) => {
      const l = lang ? ` data-lang="${lang}"` : "";
      return `<pre class="ykt-md-code"><code${l}>${code}</code></pre>`;
    });
    // 行内代码 `
        md = md.replace(/`([^`]+?)`/g, (_, code) => `<code class="ykt-md-inline">${code}</code>`);
    // 标题 #, ##, ###, ####, #####, ######
        md = md.replace(/^######\s+(.*)$/gm, "<h6>$1</h6>").replace(/^#####\s+(.*)$/gm, "<h5>$1</h5>").replace(/^####\s+(.*)$/gm, "<h4>$1</h4>").replace(/^###\s+(.*)$/gm, "<h3>$1</h3>").replace(/^##\s+(.*)$/gm, "<h2>$1</h2>").replace(/^#\s+(.*)$/gm, "<h1>$1</h1>");
    // 引用块 >
        md = md.replace(/^(?:&gt;\s?.+(\n(?!\n).+)*)/gm, block => {
      const inner = block.replace(/^&gt;\s?/gm, "");
      return `<blockquote>${inner}</blockquote>`;
    });
    // 无序列表
        md = md.replace(/(^(-|\*|\+)\s+.+(\n(?!\n).+)*)/gm, block => {
      const items = block.split("\n").map(l => l.trim()).filter(l => /^(-|\*|\+)\s+/.test(l)).map(l => `<li>${l.replace(/^(-|\*|\+)\s+/, "")}</li>`).join("");
      return `<ul>${items}</ul>`;
    });
    // 有序列表
        md = md.replace(/(^\d+\.\s+.+(\n(?!\n).+)*)/gm, block => {
      const items = block.split("\n").map(l => l.trim()).filter(l => /^\d+\.\s+/.test(l)).map(l => `<li>${l.replace(/^\d+\.\s+/, "")}</li>`).join("");
      return `<ol>${items}</ol>`;
    });
    // 粗体/斜体
        md = md.replace(/\*\*([^*]+?)\*\*/g, "<strong>$1</strong>");
    md = md.replace(/\*([^*]+?)\*/g, "<em>$1</em>");
    md = md.replace(/__([^_]+?)__/g, "<strong>$1</strong>");
    md = md.replace(/_([^_]+?)_/g, "<em>$1</em>");
    // 水平线
        md = md.replace(/^\s*([-*_]){3,}\s*$/gm, "<hr/>");
    // 链接 [text](url)
        md = md.replace(/\[([^\]]+?)\]\(([^)]+?)\)/g, (_, text, url) => {
      const safe = safeLink(url);
      if (!safe) return text;
 // 不安全则降级为纯文本
            return `<a href="${safe}" target="_blank" rel="noopener noreferrer">${text}</a>`;
    });
    // 段落：把非块级标签之外的连续文字块包成 <p>
        const lines = md.split("\n");
    const out = [];
    let buf = [];
    const flush = () => {
      if (!buf.length) return;
      out.push(`<p>${buf.join("<br/>")}</p>`);
      buf = [];
    };
    const isBlock = s => /^(<h[1-6]|<ul>|<ol>|<pre |<blockquote>|<hr\/>|<p>|<table|<div)/.test(s);
    for (const ln of lines) {
      if (!ln.trim()) {
        flush();
        continue;
      }
      if (isBlock(ln)) {
        flush();
        out.push(ln);
      } else buf.push(ln);
    }
    flush();
    return out.join("\n");
  }
  function findSlideAcrossPresentations$1(idStr) {
    for (const [, pres] of repo.presentations) {
      const arr = pres?.slides || [];
      const hit = arr.find(s => String(s.id) === idStr);
      if (hit) return hit;
    }
    return null;
  }
  // —— 运行时自愈：把 repo.slides 的数字键迁移为字符串键
    function normalizeRepoSlidesKeys$1(tag = "ai.mount") {
    try {
      if (!repo || !repo.slides || !(repo.slides instanceof Map)) {
        W$2("normalizeRepoSlidesKeys: repo.slides 不是 Map");
        return;
      }
      const beforeKeys = Array.from(repo.slides.keys());
      const nums = beforeKeys.filter(k => typeof k === "number");
      let moved = 0;
      for (const k of nums) {
        const v = repo.slides.get(k);
        const ks = String(k);
        if (!repo.slides.has(ks)) {
          repo.slides.set(ks, v);
          moved++;
        }
      }
      const afterSample = Array.from(repo.slides.keys()).slice(0, 8);
      L$2(`[normalizeRepoSlidesKeys@${tag}] 总键=${beforeKeys.length}，数字键=${nums.length}，迁移为字符串=${moved}，sample=`, afterSample);
    } catch (e) {
      W$2("normalizeRepoSlidesKeys error:", e);
    }
  }
  function asIdStr(v) {
    return v == null ? null : String(v);
  }
  function isMainPriority() {
    const v = ui?.config?.aiSlidePickPriority;
    const ret = !(v === "presentation");
    L$2("isMainPriority?", {
      cfg: v,
      result: ret
    });
    return ret;
  }
  function fallbackSlideIdFromRecent() {
    try {
      if (repo.encounteredProblems?.length > 0) {
        const latest = repo.encounteredProblems.at(-1);
        const st = repo.problemStatus.get(latest.problemId);
        const sid = st?.slideId ? String(st.slideId) : null;
        L$2("fallbackSlideIdFromRecent", {
          latestProblemId: latest.problemId,
          sid: sid
        });
        return sid;
      }
    } catch (e) {
      W$2("fallbackSlideIdFromRecent error:", e);
    }
    return null;
  }
  function resolveStaticCoursewareSlide() {
    try {
      ui.updatePresentationList();
    } catch (e) {
      W$2("静态课件扫描失败:", e);
    }
    const picked = pickStaticFallbackSlide(repo.presentations, {
      currentPresentationId: repo.currentPresentationId,
      currentSlideId: repo.currentSlideId
    });
    if (!picked) return null;
    const slideId = asIdStr(picked.slide?.id);
    if (!slideId) return null;
    repo.upsertSlide({
      ...picked.slide,
      id: slideId
    });
    return {
      presentation: picked.presentation,
      slide: repo.getSlide(slideId),
      slideId: slideId
    };
  }
  function $$4(sel) {
    return document.querySelector(sel);
  }
  function getSlideByAny$1(id) {
    const sid = id == null ? null : String(id);
    if (!sid) return {
      slide: null,
      hit: "none"
    };
    if (repo.slides.has(sid)) return {
      slide: repo.slides.get(sid),
      hit: "string"
    };
    const cross = findSlideAcrossPresentations$1(sid);
    if (cross) {
      repo.slides.set(sid, cross);
      return {
        slide: cross,
        hit: "cross-fill"
      };
    }
    const asNum = Number.isNaN(Number(sid)) ? null : Number(sid);
    if (asNum != null && repo.slides.has(asNum)) {
      const v = repo.slides.get(asNum);
      repo.slides.set(sid, v);
      return {
        slide: v,
        hit: "number→string-migrate"
      };
    }
    return {
      slide: null,
      hit: "miss"
    };
  }
  function mountAIPanel() {
    if (mounted$5) return root$4;
    normalizeRepoSlidesKeys$1("ai.mount");
    const host = document.createElement("div");
    host.innerHTML = tpl$4;
    document.body.appendChild(host.firstElementChild);
    root$4 = document.getElementById("ykt-ai-answer-panel");
    $$4("#ykt-ai-close")?.addEventListener("click", () => showAIPanel(false));
    $$4("#ykt-ai-ask")?.addEventListener("click", askAIFusionMode);
    waitForVueReady().then(() => {
      watchMainPageChange((slideId, slideInfo) => {
        L$2("主界面页面切换事件", {
          slideId: slideId,
          slideInfoType: slideInfo?.type,
          problemID: slideInfo?.problemID,
          index: slideInfo?.index
        });
        preferredSlideFromPresentation = null;
        renderQuestion();
      });
    }).catch(e => {
      W$2("Vue 实例初始化失败，将使用备用方案:", e);
    });
    window.addEventListener("ykt:presentation:slide-selected", ev => {
      L$2("收到小窗选页事件", ev?.detail);
      const sid = asIdStr(ev?.detail?.slideId);
      const imageUrl = ev?.detail?.imageUrl || null;
      if (sid) preferredSlideFromPresentation = {
        slideId: sid,
        imageUrl: imageUrl
      };
      // 普通选页不应该保留手动多选
            preferredSlidesFromPresentation = [];
      manualMultiSlidesArmed = false;
      renderQuestion();
    });
    window.addEventListener("ykt:open-ai", () => {
      L$2("收到打开 AI 面板事件");
      showAIPanel(true);
    });
    window.addEventListener("ykt:ask-ai-for-slide", ev => {
      const detail = ev?.detail || {};
      const slideId = asIdStr(detail.slideId);
      const imageUrl = detail.imageUrl || "";
      L$2("收到“提问当前PPT”事件", {
        slideId: slideId,
        imageLen: imageUrl?.length || 0
      });
      if (slideId) {
        preferredSlideFromPresentation = {
          slideId: slideId,
          imageUrl: imageUrl
        };
        // 单页提问不应该触发多选逻辑
                preferredSlidesFromPresentation = [];
        manualMultiSlidesArmed = false;
        const look = getSlideByAny$1(slideId);
        if (look.slide && imageUrl) look.slide.image = imageUrl;
        L$2("提问当前PPT: lookupHit=", look.hit, "hasSlide=", !!look.slide);
      }
      showAIPanel(true);
      renderQuestion();
      renderSelectedPPTPreview();
    });
    // ===== 手动多页提问（来自课件面板多选）=====
        window.addEventListener("ykt:ask-ai-for-slides", ev => {
      const detail = ev?.detail || {};
      const slides = Array.isArray(detail.slides) ? detail.slides : [];
      if (!slides.length) return;
      if (detail.source !== "manual") return;
 // 只允许手动路径进入
            preferredSlidesFromPresentation = slides.map(s => ({
        slideId: asIdStr(s.slideId),
        imageUrl: s.imageUrl || ""
      })).filter(s => !!s.slideId);
      manualMultiSlidesArmed = preferredSlidesFromPresentation.length > 0;
      // 预览仍保持单页逻辑：用第一张作为“已选择页面”的展示（不强制要求改 UI）
            const first = preferredSlidesFromPresentation[0];
      if (first?.slideId) {
        preferredSlideFromPresentation = {
          slideId: first.slideId,
          imageUrl: first.imageUrl || ""
        };
        const look = getSlideByAny$1(first.slideId);
        if (look.slide && first.imageUrl) look.slide.image = first.imageUrl;
      }
      L$2("收到手动多页提问事件", {
        count: preferredSlidesFromPresentation.length,
        armed: manualMultiSlidesArmed
      });
      showAIPanel(true);
      renderQuestion();
      renderSelectedPPTPreview();
    });
    mounted$5 = true;
    L$2("mountAIPanel 完成, cfg.aiSlidePickPriority=", ui?.config?.aiSlidePickPriority);
    return root$4;
  }
  function showAIPanel(v = true) {
    mountAIPanel();
    root$4.classList.toggle("visible", !!v);
    if (v) {
      renderQuestion();
      if (ui.config.aiAutoAnalyze) queueMicrotask(() => {
        askAIFusionMode();
      });
    }
    const aiBtn = document.getElementById("ykt-btn-ai");
    if (aiBtn) aiBtn.classList.toggle("active", !!v);
    L$2("showAIPanel", {
      visible: v
    });
  }
  function setAILoading(v) {
    $$4("#ykt-ai-loading").style.display = v ? "" : "none";
  }
  function setAIError(msg = "") {
    const el = $$4("#ykt-ai-error");
    el.style.display = msg ? "" : "none";
    el.textContent = msg || "";
  }
  function setAIAnswer(content = "") {
    const el = $$4("#ykt-ai-answer");
    if (!el) return;
    if (window.MathJax && window.MathJax.config == null) window.MathJax.config = {};
    window.MathJax = Object.assign(window.MathJax || {}, {
      tex: {
        inlineMath: [ [ "$", "$" ], [ "\\(", "\\)" ] ]
      }
    });
    el.innerHTML = content ? mdToHtml(content) : "";
    try {
      if (ui?.config?.iftex) ensureMathJax().then(ok => {
        if (!ok) {
          console.warn("[雨课堂助手][WARN][ai] MathJax 未就绪，跳过 typeset");
          return;
        }
        el.classList.add("tex-enabled");
        typesetTexIn(el).then(() => console.log("[雨课堂助手][DBG][ai] MathJax typeset 完成"));
      }); else el.classList.remove("tex-enabled");
    } catch (e) {/* 静默降级 */}
  }
  function getCustomPrompt() {
    const el = $$4("#ykt-ai-custom-prompt");
    return el ? el.value.trim() || "" : "";
  }
  function _logMapLookup(where, id) {
    const sid = id == null ? null : String(id);
    const hasS = sid ? repo.slides.has(sid) : false;
    const nid = sid != null && !Number.isNaN(Number(sid)) ? Number(sid) : null;
    const hasN = nid != null ? repo.slides.has(nid) : false;
    const sample = (() => {
      try {
        return Array.from(repo.slides.keys()).slice(0, 8);
      } catch {
        return [];
      }
    })();
    L$2(`${where} -> lookup`, {
      id: sid,
      hasString: hasS,
      hasNumber: hasN,
      sampleKeys: sample
    });
  }
  function renderQuestion() {
    let displayText = "";
    let hasPageSelected = false;
    let selectionSource = "";
    let slide = null;
    if (preferredSlideFromPresentation?.slideId) {
      const sid = asIdStr(preferredSlideFromPresentation.slideId);
      _logMapLookup("renderQuestion(preferred from presentation)", sid);
      const look = getSlideByAny$1(sid);
      slide = look.slide;
      if (slide) {
        displayText = `来自课件面板：${slide.title || `第 ${slide.page || slide.index || ""} 页`}`;
        selectionSource = `课件浏览（传入/${look.hit}键命中）`;
        hasPageSelected = true;
      }
    }
    if (!slide) {
      const prio = isMainPriority();
      if (prio) {
        const mainSid = asIdStr(getCurrentMainPageSlideId());
        _logMapLookup("renderQuestion(main priority)", mainSid);
        const look = getSlideByAny$1(mainSid);
        slide = look.slide;
        if (slide) {
          displayText = `主界面当前页: ${slide.title || `第 ${slide.page || slide.index || ""} 页`}`;
          selectionSource = `主界面检测（${look.hit}键命中）`;
          displayText += slide.problem ? "\n📝 此页面包含题目" : "\n📄 此页面为普通内容页";
          hasPageSelected = true;
        }
      } else {
        const presentationPanel = document.getElementById("ykt-presentation-panel");
        const isOpen = presentationPanel && presentationPanel.classList.contains("visible");
        const curSid = asIdStr(repo.currentSlideId);
        L$2("renderQuestion(presentation priority)", {
          isOpen: isOpen,
          curSid: curSid
        });
        if (isOpen && curSid) {
          _logMapLookup("renderQuestion(pres open, curSid)", curSid);
          const look = getSlideByAny$1(curSid);
          slide = look.slide;
          if (slide) {
            displayText = `课件面板选中: ${slide.title || `第 ${slide.page || slide.index || ""} 页`}`;
            selectionSource = `课件浏览面板（${look.hit}键命中）`;
            displayText += slide.problem ? "\n📝 此页面包含题目" : "\n📄 此页面为普通内容页";
            hasPageSelected = true;
          }
        } else {
          if (!slide && curSid) {
            _logMapLookup("renderQuestion(pres fallback curSid)", curSid);
            const look = getSlideByAny$1(curSid);
            slide = look.slide;
            if (slide) {
              displayText = `课件面板最近选中: ${slide.title || `第 ${slide.page || slide.index || ""} 页`}`;
              selectionSource = `课件浏览（兜底/${look.hit}键命中）`;
              hasPageSelected = true;
            }
          }
          if (!slide) {
            const fb = fallbackSlideIdFromRecent();
            if (fb) {
              _logMapLookup("renderQuestion(fallback recent)", fb);
              const look = getSlideByAny$1(fb);
              slide = look.slide;
              if (slide) {
                displayText = `最近题目关联页: ${slide.title || `第 ${slide.page || slide.index || ""} 页`}`;
                selectionSource = `最近题目（兜底/${look.hit}键命中）`;
                hasPageSelected = true;
              }
            }
          }
          if (!slide) {
            displayText = "未检测到当前页面\n💡 请在主界面或课件面板中选择页面。";
            selectionSource = "无";
          }
        }
      }
    }
    if (!slide) {
      const picked = resolveStaticCoursewareSlide();
      if (picked?.slide) {
        slide = picked.slide;
        displayText = `静态课件：${slide.title || `第 ${slide.page || slide.index || ""} 页`}`;
        selectionSource = "静态课件（兜底）";
        hasPageSelected = true;
      } else if (!displayText) {
        displayText = "未检测到当前页面\n💡 请打开课件页面后再试。";
        selectionSource = "无";
      }
    }
    const el = document.querySelector("#ykt-ai-question-display");
    if (el) el.textContent = displayText;
    const img = document.getElementById("ykt-ai-selected-thumb");
    const box = document.getElementById("ykt-ai-selected");
    if (img && box) renderSelectedPPTPreview();
    const statusEl = document.querySelector("#ykt-ai-text-status");
    if (statusEl) {
      statusEl.textContent = hasPageSelected ? `✓ 已选择页面（来源：${selectionSource}），可进行图像分析` : "⚠ 请选择要分析的页面";
      statusEl.className = hasPageSelected ? "text-status success" : "text-status warning";
    }
  }
  async function askAIFusionMode() {
    setAIError("");
    setAILoading(true);
    setAIAnswer("");
    try {
      if (!hasActiveAIProfile(ui.config.ai)) throw new Error("请先在设置中配置 API Key");
      let currentSlideId = null;
      let slide = null;
      let selectionSource = "";
      let forcedImageUrl = null;
      if (preferredSlideFromPresentation?.slideId) {
        currentSlideId = asIdStr(preferredSlideFromPresentation.slideId);
        const look = getSlideByAny$1(currentSlideId);
        slide = look.slide;
        forcedImageUrl = preferredSlideFromPresentation.imageUrl || null;
        selectionSource = `课件浏览（传入/${look.hit}键命中）`;
        L$2("[ask] 使用presentation传入的页面:", {
          currentSlideId: currentSlideId,
          lookupHit: look.hit,
          hasSlide: !!slide
        });
      }
      if (!slide) {
        const prio = isMainPriority();
        if (prio) {
          const mainSlideId = asIdStr(getCurrentMainPageSlideId());
          if (mainSlideId) {
            currentSlideId = mainSlideId;
            const look = getSlideByAny$1(currentSlideId);
            slide = look.slide;
            selectionSource = `主界面当前页面（${look.hit}键命中）`;
            L$2("[ask] 使用主界面当前页面:", {
              currentSlideId: currentSlideId,
              lookupHit: look.hit,
              hasSlide: !!slide
            });
          }
        } else {
          const presentationPanel = document.getElementById("ykt-presentation-panel");
          const isOpen = presentationPanel && presentationPanel.classList.contains("visible");
          if (isOpen && repo.currentSlideId != null) {
            currentSlideId = asIdStr(repo.currentSlideId);
            const look = getSlideByAny$1(currentSlideId);
            slide = look.slide;
            selectionSource = `课件浏览面板（${look.hit}键命中）`;
            L$2("[ask] 使用课件面板选中的页面:", {
              currentSlideId: currentSlideId,
              lookupHit: look.hit,
              hasSlide: !!slide
            });
          }
        }
      }
      if (!slide && repo.currentSlideId != null) {
        currentSlideId = asIdStr(repo.currentSlideId);
        const look = getSlideByAny$1(currentSlideId);
        slide = look.slide;
        selectionSource = selectionSource || `课件浏览（兜底/${look.hit}键命中）`;
        L$2("[ask] Fallback 使用 repo.currentSlideId:", {
          currentSlideId: currentSlideId,
          lookupHit: look.hit,
          hasSlide: !!slide
        });
      }
      if (!slide) {
        const fb = fallbackSlideIdFromRecent();
        if (fb) {
          currentSlideId = asIdStr(fb);
          const look = getSlideByAny$1(currentSlideId);
          slide = look.slide;
          selectionSource = selectionSource || `最近题目（兜底/${look.hit}键命中）`;
          L$2("[ask] Fallback 使用 最近题目 slideId:", {
            currentSlideId: currentSlideId,
            lookupHit: look.hit,
            hasSlide: !!slide
          });
        }
      }
      if (!currentSlideId || !slide) {
        const picked = resolveStaticCoursewareSlide();
        if (picked?.slide) {
          currentSlideId = picked.slideId;
          slide = picked.slide;
          forcedImageUrl = null;
          selectionSource = "静态课件（兜底）";
          L$2("[ask] 使用静态课件兜底:", {
            currentSlideId: currentSlideId,
            presentationId: picked.presentation?.id
          });
        }
      }
      if (!currentSlideId || !slide) throw new Error("无法确定要分析的页面。请在主界面打开一个页面，或在课件浏览中选择页面。");
      L$2("[ask] 页面选择来源:", selectionSource, "页面ID:", currentSlideId, "页面信息:", slide);
      if (forcedImageUrl) {
        slide.image = forcedImageUrl;
 // 强制指定
                L$2("[ask] 使用传入 imageUrl");
      }
      // ===== 获取图片：仅手动多选时走多图；否则保持单图 =====
            let imageBase64OrList = null;
      if (manualMultiSlidesArmed && Array.isArray(preferredSlidesFromPresentation) && preferredSlidesFromPresentation.length > 0) {
        const ids = preferredSlidesFromPresentation.map(s => asIdStr(s.slideId)).filter(Boolean);
        ui.toast(`正在获取课件多页图片（共 ${ids.length} 页）...`, 2500);
        L$2("[ask] 手动多页截图开始", {
          ids: ids
        });
        const images = [];
        for (const sid of ids) {
          const b64 = await captureSlideImage(sid);
          if (b64) images.push(b64);
        }
        if (images.length === 0) throw new Error("无法获取所选页面图片，请确保页面已加载完成");
        imageBase64OrList = images;
        // 消费一次：避免 aiAutoAnalyze 或后续调用误用多图
                manualMultiSlidesArmed = false;
        preferredSlidesFromPresentation = [];
        L$2("[ask] ✅ 手动多页截图完成", {
          got: images.length
        });
      } else {
        L$2("[ask] 获取页面图片...");
        ui.toast(`正在获取${selectionSource}图片...`, 2e3);
        const imageBase64 = await captureSlideImage(currentSlideId);
        if (!imageBase64) throw new Error("无法获取页面图片，请确保页面已加载完成");
        imageBase64OrList = imageBase64;
        L$2("[ask] ✅ 页面图片获取成功，大小(KB)=", Math.round(imageBase64.length / 1024));
      }
      let textPrompt = `【页面说明】当前页面可能不是题目页；请结合用户提示作答。`;
      const customPrompt = getCustomPrompt();
      if (customPrompt) {
        textPrompt += `\n\n【用户自定义要求】\n${customPrompt}`;
        L$2("[ask] 用户自定义prompt:", customPrompt);
      }
      // ===== 题型 hint：仅当当前页面是题目时提供 =====
            let problemType = null;
      const problem = slide?.problem;
      if (problem && typeof problem.problemType !== "undefined") problemType = problem.problemType;
      L$2("[ask] problemType hint:", problemType);
      ui.toast(`正在分析${selectionSource}内容...`, 3e3);
      L$2("[ask] 调用 Vision API...");
      const aiContent = await queryAIVision(imageBase64OrList, textPrompt, ui.config.ai, {
        problemType: problemType
      });
      setAILoading(false);
      L$2("[ask] Vision API调用成功, 内容长度=", aiContent?.length);
      // 若当前页有题目，尝试解析
            let parsed = null;
      if (problem) {
        parsed = parseAIAnswer(problem, aiContent);
        L$2("[ask] 解析结果:", parsed);
      }
      let displayContent = `${selectionSource}图像分析结果：\n${aiContent}`;
      if (customPrompt) displayContent = `${selectionSource}图像分析结果（包含自定义要求）：\n${aiContent}`;
      if (parsed && problem) setAIAnswer(`${displayContent}\n\nAI 建议答案：${JSON.stringify(parsed)}`); else {
        if (!problem) displayContent += "\n\n💡 当前页面不是题目页面（或未识别到题目）。";
        setAIAnswer(displayContent);
      }
    } catch (e) {
      setAILoading(false);
      W$2("[ask] 页面分析失败:", e);
      setAIError(`页面分析失败: ${e.message}`);
    }
  }
  async function askAIForCurrent() {
    return askAIFusionMode();
  }
  var tpl$3 = '<div id="ykt-presentation-panel" class="ykt-panel">\r\n  <style>\r\n    #ykt-presentation-panel .slide-thumb.selected {\r\n      outline: 2px solid #3b82f6;\r\n      outline-offset: 2px;\r\n    }\r\n  </style>\r\n  <div class="panel-header">\r\n    <h3>课件查看</h3>\r\n    <div class="panel-controls">\r\n      <label>\r\n        <input type="checkbox" id="ykt-show-all-slides"> 切换全部页面/问题页面\r\n      </label>\r\n      <button id="ykt-ask-current">提问当前PPT</button>\r\n      <button id="ykt-ocr-current">文字识别</button>\r\n      <button id="ykt-open-problem-list">题目列表</button>\r\n      <button id="ykt-download-current">截图下载</button>\r\n      <button id="ykt-download-pdf">整册下载(PDF)</button>\r\n      <span class="close-btn" id="ykt-presentation-close"><i class="fas fa-times"></i></span>\r\n    </div>\r\n  </div>\r\n\r\n  <div class="panel-body">\r\n    <div class="panel-left">\r\n      <div id="ykt-presentation-list" class="presentation-list"></div>\r\n    </div>\r\n    <div class="panel-right">\r\n      <div id="ykt-slide-view" class="slide-view">\r\n        <div class="slide-cover">\r\n          <div class="empty-message">选择左侧的幻灯片查看详情</div>\r\n        </div>\r\n        <div id="ykt-problem-view" class="problem-view"></div>\r\n      </div>\r\n      <div id="ykt-ocr-panel" class="ocr-panel">\r\n        <div class="ocr-head">\r\n          <span>文字结果</span>\r\n          <span id="ykt-ocr-status" class="ocr-status">未开始</span>\r\n        </div>\r\n        <div id="ykt-ocr-tip" class="ocr-tip">选择课件页后点击“文字识别”。</div>\r\n        <textarea id="ykt-ocr-result" class="ocr-result" readonly placeholder="识别结果会显示在这里，支持直接复制。"></textarea>\r\n        <div class="ocr-translate-bar">\r\n          <label for="ykt-translate-target">目标语言</label>\r\n          <input type="text" id="ykt-translate-target" class="ocr-target-input" placeholder="默认使用浏览器语言">\r\n          <button id="ykt-translate-toggle">翻译</button>\r\n          <span id="ykt-translate-status" class="ocr-status">未翻译</span>\r\n        </div>\r\n        <div id="ykt-translate-tip" class="ocr-tip">默认翻译到浏览器语言，也可手动修改目标语言。</div>\r\n      </div>\r\n    </div>\r\n  </div>\r\n</div>\r\n';
  function slideIdOf(slide) {
    return slide?.id == null ? null : String(slide.id);
  }
  function getVisibleSlides(slides, {showAllSlides: showAllSlides = false, currentSlideId: currentSlideId = null} = {}) {
    const list = Array.isArray(slides) ? slides.filter(Boolean) : [];
    if (showAllSlides || list.length === 0) return list;
    const problemSlides = list.filter(slide => slide?.problem);
    if (problemSlides.length === 0) return list;
    const currentId = currentSlideId == null ? null : String(currentSlideId);
    if (!currentId) return problemSlides;
    if (problemSlides.some(slide => slideIdOf(slide) === currentId)) return problemSlides;
    const hasCurrentSlide = list.some(slide => slideIdOf(slide) === currentId);
    return hasCurrentSlide ? list.filter(slide => slide?.problem || slideIdOf(slide) === currentId) : problemSlides;
  }
  let mounted$4 = false;
  let host;
  let staticCoursewareObserver = null;
  let staticCoursewareScanTimer = null;
  let staticCoursewareSignature = "";
  const staticObservedDocuments = new WeakSet;
  const selectedSlideIds = new Set;
  const ocrResults = new Map;
  const translationResults = new Map;
  let currentResultMode = "original";
  function findSlideAcrossPresentations(idStr) {
    for (const [, pres] of repo.presentations) {
      const arr = pres?.slides || [];
      const hit = arr.find(s => String(s.id) === idStr);
      if (hit) return hit;
    }
    return null;
  }
  const L$1 = (...a) => console.log("[雨课堂助手][DBG][presentation]", ...a);
  const W$1 = (...a) => console.warn("[雨课堂助手][WARN][presentation]", ...a);
  function $$3(sel) {
    return document.querySelector(sel);
  }
  /** —— 运行时自愈：把 repo.slides 的数字键迁移为字符串键 —— */  function normalizeRepoSlidesKeys(tag = "presentation.mount") {
    try {
      if (!repo || !repo.slides || !(repo.slides instanceof Map)) {
        W$1("normalizeRepoSlidesKeys: repo.slides 不是 Map");
        return;
      }
      const beforeKeys = Array.from(repo.slides.keys());
      const nums = beforeKeys.filter(k => typeof k === "number");
      let moved = 0;
      for (const k of nums) {
        const v = repo.slides.get(k);
        const ks = String(k);
        if (!repo.slides.has(ks)) {
          repo.slides.set(ks, v);
          moved++;
        }
        // 保留旧键以防其他模块还在用数字键；仅打印提示
            }
      const afterSample = Array.from(repo.slides.keys()).slice(0, 8);
      L$1(`[normalizeRepoSlidesKeys@${tag}] 总键=${beforeKeys.length}，数字键=${nums.length}，迁移为字符串=${moved}，sample=`, afterSample);
    } catch (e) {
      W$1("normalizeRepoSlidesKeys error:", e);
    }
  }
  // Map 查找
    function getSlideByAny(id) {
    const sid = id == null ? null : String(id);
    if (!sid) return {
      slide: null,
      hit: "none"
    };
    if (repo.slides.has(sid)) return {
      slide: repo.slides.get(sid),
      hit: "string"
    };
    const cross = findSlideAcrossPresentations(sid);
    if (cross) {
      repo.slides.set(sid, cross);
      return {
        slide: cross,
        hit: "cross-fill"
      };
    }
    return {
      slide: null,
      hit: "miss"
    };
  }
  function getSlideImageUrl(slide) {
    if (!slide) return "";
    // Prefer original image fields, then fallback-compatible fields.
        return slide.coverAlt || slide.cover || slide.image || slide.thumbnail || "";
  }
  function getCurrentSlideId() {
    return repo.currentSlideId != null ? String(repo.currentSlideId) : null;
  }
  function detectBrowserLanguage() {
    const lang = navigator.languages?.[0] || navigator.language || "en";
    return String(lang).trim() || "en";
  }
  function getTranslateTargetInput() {
    return $$3("#ykt-translate-target");
  }
  function getCurrentTargetLanguage() {
    const input = getTranslateTargetInput();
    const value = String(input?.value || "").trim();
    return value || detectBrowserLanguage();
  }
  // fetch静态PPT
    function getActiveOCRState() {
    const currentSlideId = getCurrentSlideId();
    return currentSlideId ? ocrResults.get(currentSlideId) || null : null;
  }
  function getActiveTranslationState() {
    const currentSlideId = getCurrentSlideId();
    return currentSlideId ? translationResults.get(currentSlideId) || null : null;
  }
  function renderSharedResult() {
    const resultEl = $$3("#ykt-ocr-result");
    if (!resultEl) return;
    const ocrState = getActiveOCRState();
    const translationState = getActiveTranslationState();
    const currentTargetLanguage = getCurrentTargetLanguage();
    const canShowTranslation = !!(translationState && !translationState.loading && !translationState.error && translationState.targetLanguage === currentTargetLanguage && translationState.text);
    resultEl.value = currentResultMode === "translated" && canShowTranslation ? translationState.text || "" : ocrState?.text || "";
  }
  function renderOCRState() {
    const currentSlideId = getCurrentSlideId();
    const statusEl = $$3("#ykt-ocr-status");
    const tipEl = $$3("#ykt-ocr-tip");
    if (!statusEl || !tipEl) return;
    if (!currentSlideId) {
      currentResultMode = "original";
      statusEl.textContent = "未选择";
      statusEl.className = "ocr-status";
      tipEl.textContent = "选择课件页后点击“文字识别”。";
      renderSharedResult();
      return;
    }
    const state = ocrResults.get(currentSlideId);
    if (!state) {
      statusEl.textContent = "未开始";
      statusEl.className = "ocr-status";
      tipEl.textContent = "当前页还没有识别结果。";
      renderSharedResult();
      return;
    }
    if (state.loading) {
      statusEl.textContent = "识别中";
      statusEl.className = "ocr-status is-loading";
      tipEl.textContent = "正在调用 OCR 模型识别当前课件页。";
      renderSharedResult();
      return;
    }
    if (state.error) {
      currentResultMode = "original";
      statusEl.textContent = "失败";
      statusEl.className = "ocr-status is-error";
      tipEl.textContent = state.error;
      renderSharedResult();
      return;
    }
    statusEl.textContent = "已完成";
    statusEl.className = "ocr-status is-success";
    tipEl.textContent = currentResultMode === "translated" ? "当前正在显示翻译结果。" : "当前正在显示原文识别结果。";
    renderSharedResult();
  }
  function renderTranslationState() {
    const currentSlideId = getCurrentSlideId();
    const statusEl = $$3("#ykt-translate-status");
    const tipEl = $$3("#ykt-translate-tip");
    const btnEl = $$3("#ykt-translate-toggle");
    if (!statusEl || !tipEl || !btnEl) return;
    if (!currentSlideId) {
      statusEl.textContent = "未翻译";
      statusEl.className = "ocr-status";
      tipEl.textContent = "选择课件页后可翻译 OCR 结果。";
      btnEl.textContent = "翻译";
      renderSharedResult();
      return;
    }
    const currentTargetLanguage = getCurrentTargetLanguage();
    const state = translationResults.get(currentSlideId);
    const hasCurrentTranslation = !!(state && state.targetLanguage === currentTargetLanguage);
    if (!hasCurrentTranslation) {
      if (currentResultMode === "translated") currentResultMode = "original";
      statusEl.textContent = "未翻译";
      statusEl.className = "ocr-status";
      tipEl.textContent = `当前目标语言：${currentTargetLanguage}`;
      btnEl.textContent = "翻译";
      renderSharedResult();
      return;
    }
    if (state.loading) {
      statusEl.textContent = "翻译中";
      statusEl.className = "ocr-status is-loading";
      tipEl.textContent = `正在翻译为 ${state.targetLanguage}`;
      btnEl.textContent = "翻译中...";
      renderSharedResult();
      return;
    }
    if (state.error) {
      if (currentResultMode === "translated") currentResultMode = "original";
      statusEl.textContent = "失败";
      statusEl.className = "ocr-status is-error";
      tipEl.textContent = state.error;
      btnEl.textContent = "翻译";
      renderSharedResult();
      return;
    }
    statusEl.textContent = "已翻译";
    statusEl.className = "ocr-status is-success";
    tipEl.textContent = currentResultMode === "translated" ? `当前显示 ${state.targetLanguage} 翻译结果。` : `已生成 ${state.targetLanguage} 翻译结果。`;
    btnEl.textContent = currentResultMode === "translated" ? "显示原文" : "翻译";
    renderSharedResult();
  }
  async function recognizeCurrentSlideText(options = {}) {
    const {silent: silent = false} = options;
    const slideId = getCurrentSlideId();
    if (!slideId) {
      if (!silent) ui.toast("请先选择要识别的课件页", 2500);
      renderOCRState();
      return "";
    }
    currentResultMode = "original";
    ocrResults.set(slideId, {
      loading: true,
      text: "",
      error: ""
    });
    renderOCRState();
    renderTranslationState();
    try {
      const imageBase64 = await captureSlideImage(slideId);
      if (!imageBase64) throw new Error("当前课件页图片读取失败");
      const text = await queryOCRVision(imageBase64, ui.config.ai);
      ocrResults.set(slideId, {
        loading: false,
        text: text || "未识别到文字",
        error: ""
      });
      renderOCRState();
      renderTranslationState();
      if (!silent) ui.toast("文字识别完成", 2e3);
      return text || "未识别到文字";
    } catch (e) {
      ocrResults.set(slideId, {
        loading: false,
        text: "",
        error: `文字识别失败: ${e.message || e}`
      });
      renderOCRState();
      renderTranslationState();
      if (!silent) ui.toast(`文字识别失败: ${e.message || e}`, 3500);
      return "";
    }
  }
  async function translateCurrentOCRText() {
    const slideId = getCurrentSlideId();
    if (!slideId) {
      ui.toast("请先选择课件页", 2500);
      renderTranslationState();
      return;
    }
    const targetLanguage = getCurrentTargetLanguage();
    const existingState = translationResults.get(slideId);
    if (currentResultMode === "translated" && existingState && !existingState.loading && !existingState.error && existingState.targetLanguage === targetLanguage) {
      currentResultMode = "original";
      renderOCRState();
      renderTranslationState();
      return;
    }
    const ocrState = ocrResults.get(slideId);
    if (ocrState?.loading) {
      ui.toast("文字识别进行中，请稍后再试", 2500);
      return;
    }
    let sourceText = ocrState?.text || "";
    if (!sourceText) sourceText = await recognizeCurrentSlideText({
      silent: true
    });
    if (!sourceText) {
      ui.toast("没有可翻译的 OCR 文本", 2500);
      renderTranslationState();
      return;
    }
    currentResultMode = "original";
    translationResults.set(slideId, {
      loading: true,
      text: "",
      error: "",
      targetLanguage: targetLanguage
    });
    renderTranslationState();
    try {
      const translated = await queryTranslationText(sourceText, targetLanguage, ui.config.ai);
      translationResults.set(slideId, {
        loading: false,
        text: translated || "",
        error: "",
        targetLanguage: targetLanguage
      });
      currentResultMode = "translated";
      renderOCRState();
      renderTranslationState();
      ui.toast(`翻译完成：${targetLanguage}`, 2e3);
    } catch (e) {
      translationResults.set(slideId, {
        loading: false,
        text: "",
        error: `翻译失败: ${e.message || e}`,
        targetLanguage: targetLanguage
      });
      currentResultMode = "original";
      renderOCRState();
      renderTranslationState();
      ui.toast(`翻译失败: ${e.message || e}`, 3500);
    }
  }
  function extractCoverIndex(url) {
    try {
      const m = decodeURIComponent(url).match(/cover(\d+)[_.]/i);
      if (m) return parseInt(m[1], 10);
    } catch {}
    return null;
  }
  function getStaticCoursewareDocument() {
    if (isStaticCoursewareDocument(document)) return document;
    let frames = [];
    try {
      frames = Array.from(window.frames || []);
    } catch {}
    for (const frame of frames) try {
      const frameDocument = frame?.document;
      if (isStaticCoursewareDocument(frameDocument)) return frameDocument;
    } catch {}
    return null;
  }
  function getStaticCoursewareTitle(doc) {
    const selectors = ".lesson-title, .title, h1, .header-title";
    for (const candidate of [ doc, document ]) try {
      const text = candidate?.querySelector(selectors)?.textContent?.trim();
      if (text) return text;
    } catch {}
    return "静态课件";
  }
  function ensureStaticCoursewarePresentation() {
    const doc = getStaticCoursewareDocument();
    if (!doc) return {
      changed: false,
      pid: null,
      urls: []
    };
    const urls = collectCoursewareImageUrls(doc);
    if (urls.length === 0) return {
      changed: false,
      pid: null,
      urls: []
    };
    const pageKey = createStaticPageKey(window.location);
    const pid = `static:${pageKey}`;
    const signature = `${pid}|${urls.join(",")}`;
    if (signature === staticCoursewareSignature && repo.presentations.has(pid)) return {
      changed: false,
      pid: pid,
      urls: urls
    };
    const withIndex = urls.map((url, position) => ({
      url: url,
      position: position,
      index: extractCoverIndex(url) ?? position + 1
    }));
    withIndex.sort((a, b) => a.index - b.index || a.position - b.position);
    const usedIds = new Set;
    const slides = withIndex.map(({url: url, position: position, index: index}, slidePosition) => {
      let idSuffix = String(index);
      if (usedIds.has(idSuffix)) idSuffix = `${index}-${slidePosition + 1}`;
      usedIds.add(idSuffix);
      const id = `static:${pageKey}:${idSuffix}`;
      return {
        id: id,
        index: index,
        title: `第 ${index} 页`,
        thumbnail: url,
        image: url,
        problem: null,
        staticPageKey: pageKey,
        staticPosition: position
      };
    });
    const presentation = {
      id: pid,
      title: getStaticCoursewareTitle(doc),
      slides: slides,
      staticPageKey: pageKey
    };
    const existed = repo.presentations.has(pid);
    repo.presentations.set(pid, presentation);
    for (const slide of slides) repo.upsertSlide(slide);
    const currentPresentationId = repo.currentPresentationId == null ? "" : String(repo.currentPresentationId);
    const currentSlideId = repo.currentSlideId == null ? "" : String(repo.currentSlideId);
    const canReplacePresentation = !currentPresentationId || isStaticPresentationId(currentPresentationId);
    if (canReplacePresentation) repo.currentPresentationId = pid;
    if (canReplacePresentation) {
      const selectedSlideStillExists = slides.some(slide => slide.id === currentSlideId);
      if (!currentSlideId || isStaticPresentationId(currentSlideId) && !selectedSlideStillExists) repo.currentSlideId = slides[0].id;
    }
    staticCoursewareSignature = signature;
    L$1("[static-courseware] 已注入/更新课件", {
      pid: pid,
      title: presentation.title,
      slideCount: slides.length,
      existed: existed
    });
    return {
      changed: true,
      pid: pid,
      urls: urls
    };
  }
  function observeStaticCoursewareDocuments() {
    if (!staticCoursewareObserver) return;
    const documents = [ document ];
    try {
      for (const frame of Array.from(window.frames || [])) try {
        if (frame?.document) documents.push(frame.document);
      } catch {}
    } catch {}
    for (const doc of documents) try {
      if (!doc?.documentElement || staticObservedDocuments.has(doc)) continue;
      staticCoursewareObserver.observe(doc.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: [ "src", "currentSrc", "data-src", "data-original", "data-lazy-src", "data-url" ]
      });
      staticObservedDocuments.add(doc);
    } catch {}
  }
  function scheduleStaticCoursewareScan() {
    observeStaticCoursewareDocuments();
    if (staticCoursewareScanTimer) return;
    staticCoursewareScanTimer = window.setTimeout(() => {
      staticCoursewareScanTimer = null;
      try {
        const result = ensureStaticCoursewarePresentation();
        observeStaticCoursewareDocuments();
        if (result.changed) updatePresentationList();
      } catch (e) {
        W$1("[static-courseware] DOM 扫描失败：", e);
      }
    }, 250);
  }
  function installStaticCoursewareObserver() {
    if (!staticCoursewareObserver && typeof MutationObserver !== "undefined") staticCoursewareObserver = new MutationObserver(() => scheduleStaticCoursewareScan());
    observeStaticCoursewareDocuments();
  }
  function mountPresentationPanel() {
    if (mounted$4) return host;
    normalizeRepoSlidesKeys("presentation.mount");
    const wrapper = document.createElement("div");
    wrapper.innerHTML = tpl$3;
    document.body.appendChild(wrapper.firstElementChild);
    host = document.getElementById("ykt-presentation-panel");
    $$3("#ykt-presentation-close")?.addEventListener("click", () => showPresentationPanel(false));
    $$3("#ykt-open-problem-list")?.addEventListener("click", () => {
      showPresentationPanel(false);
      window.dispatchEvent(new CustomEvent("ykt:open-problem-list"));
    });
    $$3("#ykt-ask-current")?.addEventListener("click", () => {
      if (selectedSlideIds.size > 0) {
        const slides = [];
        for (const sid of selectedSlideIds) {
          const lookup = getSlideByAny(sid);
          const imageUrl = getSlideImageUrl(lookup.slide);
          if (imageUrl) slides.push({
            slideId: sid,
            imageUrl: imageUrl
          });
        }
        L$1("点击“提问当前PPT”(多选)", {
          selectedCount: selectedSlideIds.size,
          slidesCount: slides.length
        });
        if (slides.length === 0) return ui.toast("所选页面无可用图片", 2500);
        window.dispatchEvent(new CustomEvent("ykt:ask-ai-for-slides", {
          detail: {
            slides: slides,
            source: "manual"
          }
        }));
        window.dispatchEvent(new CustomEvent("ykt:open-ai"));
        return;
      }
      // ===== 否则走旧逻辑：单页 =====
            const sid = repo.currentSlideId != null ? String(repo.currentSlideId) : null;
      const lookup = getSlideByAny(sid);
      L$1("点击“提问当前PPT”", {
        currentSlideId: sid,
        lookupHit: lookup.hit,
        hasSlide: !!lookup.slide
      });
      if (!sid) return ui.toast("请先在左侧选择一页PPT", 2500);
      const imageUrl = getSlideImageUrl(lookup.slide);
      window.dispatchEvent(new CustomEvent("ykt:ask-ai-for-slide", {
        detail: {
          slideId: sid,
          imageUrl: imageUrl
        }
      }));
      window.dispatchEvent(new CustomEvent("ykt:open-ai"));
    });
    $$3("#ykt-download-current")?.addEventListener("click", downloadCurrentSlide);
    $$3("#ykt-ocr-current")?.addEventListener("click", recognizeCurrentSlideText);
    $$3("#ykt-translate-toggle")?.addEventListener("click", translateCurrentOCRText);
    $$3("#ykt-download-pdf")?.addEventListener("click", downloadPresentationPDF);
    const translateTargetInput = getTranslateTargetInput();
    if (translateTargetInput && !translateTargetInput.value.trim()) translateTargetInput.value = detectBrowserLanguage();
    translateTargetInput?.addEventListener("change", () => {
      if (currentResultMode === "translated") currentResultMode = "original";
      renderOCRState();
      renderTranslationState();
    });
    const cb = $$3("#ykt-show-all-slides");
    cb.checked = !!ui.config.showAllSlides;
    cb.addEventListener("change", () => {
      ui.config.showAllSlides = !!cb.checked;
      ui.saveConfig();
      L$1("切换 showAllSlides =", ui.config.showAllSlides);
      updatePresentationList();
    });
    mounted$4 = true;
    renderOCRState();
    renderTranslationState();
    L$1("mountPresentationPanel 完成");
    updatePresentationList();
    return host;
  }
  function showPresentationPanel(visible = true) {
    mountPresentationPanel();
    host.classList.toggle("visible", !!visible);
    if (visible) updatePresentationList();
    const presBtn = document.getElementById("ykt-btn-pres");
    if (presBtn) presBtn.classList.toggle("active", !!visible);
    L$1("showPresentationPanel", {
      visible: visible
    });
  }
  function updatePresentationList() {
    mountPresentationPanel();
    installStaticCoursewareObserver();
    try {
      ensureStaticCoursewarePresentation();
    } catch (e) {
      W$1("[static-courseware] 检测/注入失败：", e);
    }
    const listEl = document.getElementById("ykt-presentation-list");
    if (!listEl) {
      W$1("updatePresentationList: 缺少容器");
      return;
    }
    listEl.innerHTML = "";
    if (repo.presentations.size === 0) {
      listEl.innerHTML = '<p class="no-presentations">暂无课件记录</p>';
      W$1("无 presentations");
      return;
    }
    const currentPath = window.location.pathname;
    const m = currentPath.match(/\/lesson\/fullscreen\/v3\/([^/]+)/);
    const currentLessonFromURL = m ? m[1] : null;
    L$1("过滤课件", {
      currentLessonFromURL: currentLessonFromURL,
      repoCurrentLessonId: repo.currentLessonId
    });
    const filtered = new Map;
    for (const [id, p] of repo.presentations) if (currentLessonFromURL && repo.currentLessonId && currentLessonFromURL === repo.currentLessonId) filtered.set(id, p); else if (!currentLessonFromURL) filtered.set(id, p); else if (currentLessonFromURL === repo.currentLessonId) filtered.set(id, p);
    const presentationsToShow = filtered.size > 0 ? filtered : repo.presentations;
    L$1("展示课件数量=", presentationsToShow.size);
    try {
      let filled = 0, total = 0;
      for (const [, pres] of presentationsToShow) {
        const arr = pres?.slides || [];
        total += arr.length;
        for (const s of arr) {
          const sid = String(s.id);
          if (!repo.slides.has(sid)) {
            repo.slides.set(sid, s);
            filled++;
          }
        }
      }
      const sample = Array.from(repo.slides.keys()).slice(0, 8);
      L$1("[hydrate slides → repo.slides]", {
        filled: filled,
        totalVisibleSlides: total,
        sampleKeys: sample
      });
    } catch (e) {
      W$1("hydrate repo.slides 失败：", e);
    }
    for (const [id, presentation] of presentationsToShow) {
      const cont = document.createElement("div");
      cont.className = "presentation-container";
      const titleEl = document.createElement("div");
      titleEl.className = "presentation-title";
      titleEl.innerHTML = `\n      <span>${presentation.title || `课件 ${id}`}</span>\n      <i class="fas fa-download download-btn" title="下载课件"></i>\n    `;
      cont.appendChild(titleEl);
      titleEl.querySelector(".download-btn")?.addEventListener("click", e => {
        e.stopPropagation();
        L$1("点击下载课件", {
          presId: String(presentation.id)
        });
        downloadPresentation(presentation);
      });
      const slidesWrap = document.createElement("div");
      slidesWrap.className = "slide-thumb-list";
      const showAll = !!ui.config.showAllSlides;
      const slides = Array.isArray(presentation.slides) ? presentation.slides : [];
      const problemSlideCount = slides.filter(s => s?.problem).length;
      const slidesToShow = getVisibleSlides(slides, {
        showAllSlides: showAll,
        currentSlideId: repo.currentSlideId
      });
      const currentIdStr = repo.currentSlideId != null ? String(repo.currentSlideId) : null;
      L$1("渲染课件缩略图", {
        presId: String(presentation.id),
        slidesTotal: slides.length,
        problemSlideCount: problemSlideCount,
        slidesShown: slidesToShow.length,
        fellBackToAll: !showAll && slides.length > 0 && problemSlideCount === 0,
        currentSlideId: currentIdStr
      });
      if (slidesToShow.length === 0) {
        const emptyEl = document.createElement("p");
        emptyEl.className = "no-presentations";
        emptyEl.textContent = slides.length === 0 ? "该课件暂无页面数据" : "当前筛选下没有可显示页面";
        slidesWrap.appendChild(emptyEl);
      }
      for (const s of slidesToShow) {
        const presIdStr = String(presentation.id);
        const slideIdStr = String(s.id);
        const thumb = document.createElement("div");
        thumb.className = "slide-thumb";
        thumb.dataset.slideId = slideIdStr;
        if (currentIdStr && slideIdStr === currentIdStr) thumb.classList.add("active");
        if (s.problem) {
          const pid = s.problem.problemId;
          const status = repo.problemStatus.get(pid);
          if (status) thumb.classList.add("unlocked");
          if (s.problem.result) thumb.classList.add("answered");
        }
        thumb.addEventListener("click", ev => {
          // ===== Ctrl/Cmd 多选：不改变 currentSlideId，不触发导航，仅切换 selected =====
          if (ev && (ev.ctrlKey || ev.metaKey)) {
            ev.preventDefault();
            if (selectedSlideIds.has(slideIdStr)) {
              selectedSlideIds.delete(slideIdStr);
              thumb.classList.remove("selected");
            } else {
              selectedSlideIds.add(slideIdStr);
              thumb.classList.add("selected");
            }
            L$1("缩略图多选切换", {
              slideIdStr: slideIdStr,
              selectedCount: selectedSlideIds.size
            });
            return;
          }
          // ===== 普通点击：沿用原逻辑，并清空多选 =====
                    selectedSlideIds.clear();
          slidesWrap.querySelectorAll(".slide-thumb.selected").forEach(el => el.classList.remove("selected"));
          repo.currentPresentationId = presIdStr;
          repo.currentSlideId = slideIdStr;
          slidesWrap.querySelectorAll(".slide-thumb.active").forEach(el => el.classList.remove("active"));
          thumb.classList.add("active");
          const actives = slidesWrap.querySelectorAll(".slide-thumb.active");
          const allIds = Array.from(slidesWrap.querySelectorAll(".slide-thumb")).map(x => x.dataset.slideId);
          L$1("高亮状态", {
            activeCount: actives.length,
            activeId: thumb.dataset.slideId,
            allIdsSample: allIds.slice(0, 10)
          });
          updateSlideView();
          if (!repo.slides.has(slideIdStr)) {
            const cross = findSlideAcrossPresentations(slideIdStr);
            if (cross) {
              repo.slides.set(slideIdStr, cross);
              L$1("click-fill repo.slides <- cross", {
                slideIdStr: slideIdStr
              });
            }
          }
          try {
            const keysSample = Array.from(repo.slides.keys()).slice(0, 8);
            const typeDist = keysSample.reduce((m, k) => (m[typeof k] = (m[typeof k] || 0) + 1,
            m), {});
            L$1("repo.slides keys sample:", keysSample, "typeDist:", typeDist);
          } catch {}
          const detail = {
            slideId: slideIdStr,
            presentationId: presIdStr
          };
          L$1("派发事件 ykt:presentation:slide-selected", detail);
          window.dispatchEvent(new CustomEvent("ykt:presentation:slide-selected", {
            detail: detail
          }));
          L$1("调用 actions.navigateTo ->", {
            presIdStr: presIdStr,
            slideIdStr: slideIdStr
          });
          actions.navigateTo(presIdStr, slideIdStr);
        });
        const imageUrl = getSlideImageUrl(s);
        const pageNumber = s.index ?? s.page ?? "";
        const img = document.createElement("img");
        if (presentation.width && presentation.height) img.style.aspectRatio = `${presentation.width}/${presentation.height}`;
        img.alt = s.title || `第 ${pageNumber} 页`;
        const placeholder = document.createElement("div");
        placeholder.className = "slide-thumb-placeholder";
        const showPlaceholder = message => {
          if (img.parentNode) img.remove();
          placeholder.textContent = message;
          if (!placeholder.parentNode) thumb.appendChild(placeholder);
        };
        if (imageUrl) {
          img.src = imageUrl;
          img.decoding = "async";
          img.onerror = function() {
            W$1("缩略图加载失败，保留占位项", {
              slideIdStr: slideIdStr,
              src: img.src
            });
            showPlaceholder(`第 ${pageNumber || "?"} 页\n缩略图加载失败`);
          };
          thumb.appendChild(img);
        } else {
          W$1("缩略图地址为空，使用占位项", {
            slideIdStr: slideIdStr
          });
          showPlaceholder(`第 ${pageNumber || "?"} 页\n暂无缩略图`);
        }
        const idx = document.createElement("span");
        idx.className = "slide-index";
        idx.textContent = pageNumber;
        thumb.appendChild(idx);
        slidesWrap.appendChild(thumb);
      }
      cont.appendChild(slidesWrap);
      listEl.appendChild(cont);
    }
  }
  function downloadPresentation(presentation) {
    repo.currentPresentationId = String(presentation.id);
    L$1("downloadPresentation -> 设置 currentPresentationId", repo.currentPresentationId);
    downloadPresentationPDF();
  }
  function updateSlideView() {
    mountPresentationPanel();
    const slideView = $$3("#ykt-slide-view");
    const problemView = $$3("#ykt-problem-view");
    slideView.querySelector(".slide-cover")?.classList.add("hidden");
    problemView.innerHTML = "";
    renderOCRState();
    renderTranslationState();
    const curId = getCurrentSlideId();
    const lookup = getSlideByAny(curId);
    L$1("updateSlideView", {
      curId: curId,
      lookupHit: lookup.hit,
      hasInMap: !!lookup.slide
    });
    if (!curId) {
      slideView.querySelector(".slide-cover")?.classList.remove("hidden");
      renderOCRState();
      renderTranslationState();
      return;
    }
    const slide = lookup.slide;
    if (!slide) {
      W$1("updateSlideView: 根据 curId 未取到 slide", {
        curId: curId
      });
      renderTranslationState();
      return;
    }
    const cover = document.createElement("div");
    cover.className = "slide-cover";
    const img = document.createElement("img");
    img.crossOrigin = "anonymous";
    img.src = getSlideImageUrl(slide);
    img.alt = slide.title || "";
    cover.appendChild(img);
    if (slide.problem) {
      const prob = slide.problem;
      const box = document.createElement("div");
      box.className = "problem-box";
      const closeBtn = document.createElement("button");
      closeBtn.type = "button";
      closeBtn.className = "problem-box-close";
      closeBtn.title = "关闭题干浮框";
      closeBtn.setAttribute("aria-label", "关闭题干浮框");
      closeBtn.textContent = "×";
      closeBtn.addEventListener("click", ev => {
        ev.stopPropagation();
        box.remove();
      });
      box.appendChild(closeBtn);
      const head = document.createElement("div");
      head.className = "problem-head";
      head.textContent = prob.body || `题目 ${prob.problemId}`;
      box.appendChild(head);
      if (Array.isArray(prob.options) && prob.options.length) {
        const opts = document.createElement("div");
        opts.className = "problem-options";
        prob.options.forEach(o => {
          const li = document.createElement("div");
          li.className = "problem-option";
          li.textContent = `${o.key}. ${o.value}`;
          opts.appendChild(li);
        });
        box.appendChild(opts);
      }
      problemView.appendChild(box);
    }
    slideView.innerHTML = "";
    slideView.appendChild(cover);
    slideView.appendChild(problemView);
    renderOCRState();
    renderTranslationState();
  }
  async function downloadCurrentSlide() {
    const sid = repo.currentSlideId != null ? String(repo.currentSlideId) : null;
    const lookup = getSlideByAny(sid);
    L$1("downloadCurrentSlide", {
      sid: sid,
      lookupHit: lookup.hit,
      has: !!lookup.slide
    });
    if (!sid) return ui.toast("请先选择一页课件/题目");
    const slide = lookup.slide;
    if (!slide) return;
    try {
      const html2canvas = await ensureHtml2Canvas();
      const el = document.getElementById("ykt-slide-view");
      const canvas = await html2canvas(el, {
        useCORS: true,
        allowTaint: false
      });
      const a = document.createElement("a");
      a.download = `slide-${sid}.png`;
      a.href = canvas.toDataURL("image/png");
      a.click();
    } catch (e) {
      ui.toast(`截图失败: ${e.message}`);
    }
  }
  async function downloadPresentationPDF() {
    const pid = repo.currentPresentationId != null ? String(repo.currentPresentationId) : null;
    L$1("downloadPresentationPDF", {
      pid: pid,
      hasPres: pid ? repo.presentations.has(pid) : false
    });
    if (!pid) return ui.toast("请先在左侧选择一份课件");
    const pres = repo.presentations.get(pid);
    if (!pres || !Array.isArray(pres.slides) || pres.slides.length === 0) return ui.toast("未找到该课件的页面");
    const slides = getVisibleSlides(pres.slides, {
      showAllSlides: !!ui.config.showAllSlides,
      currentSlideId: repo.currentSlideId
    });
    if (slides.length === 0) return ui.toast("当前筛选下没有可导出的页面");
    try {
      await ensureJsPDF();
      const {jsPDF: jsPDF} = window.jspdf || {};
      if (!jsPDF) throw new Error("jsPDF 未加载成功");
      const doc = new jsPDF({
        unit: "pt",
        format: "a4",
        orientation: "portrait"
      });
      const pageW = 595, pageH = 842;
      const margin = 24;
      const maxW = pageW - margin * 2;
      const maxH = pageH - margin * 2;
      const loadImage = src => new Promise((resolve, reject) => {
        const img = new Image;
        img.crossOrigin = "anonymous";
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
      });
      for (let i = 0; i < slides.length; i++) {
        const s = slides[i];
        const url = getSlideImageUrl(s);
        if (!url) {
          if (i > 0) doc.addPage();
          continue;
        }
        const img = await loadImage(url);
        const iw = img.naturalWidth || img.width;
        const ih = img.naturalHeight || img.height;
        const r = Math.min(maxW / iw, maxH / ih);
        const w = Math.floor(iw * r);
        const h = Math.floor(ih * r);
        const x = Math.floor((pageW - w) / 2);
        const y = Math.floor((pageH - h) / 2);
        if (i > 0) doc.addPage();
        doc.addImage(img, "PNG", x, y, w, h);
      }
      const name = (pres.title || `课件-${pid}`).replace(/[\\/:*?"<>|]/g, "_");
      doc.save(`${name}.pdf`);
    } catch (e) {
      ui.toast(`导出 PDF 失败：${e.message || e}`);
    }
  }
  var tpl$2 = '<div id="ykt-problem-list-panel" class="ykt-panel">\r\n  <div class="panel-header">\r\n    <h3>课堂习题列表</h3>\r\n    <span class="close-btn" id="ykt-problem-list-close"><i class="fas fa-times"></i></span>\r\n  </div>\r\n\r\n  <div class="panel-body">\r\n    <div id="ykt-problem-list" class="problem-list">\r\n      \x3c!-- 由 problem-list.js 动态填充：\r\n           .problem-row\r\n             .problem-title\r\n             .problem-meta\r\n             .problem-actions (查看 / AI解答 / 已作答) --\x3e\r\n    </div>\r\n  </div>\r\n</div>\r\n';
  function sleep(ms) {
    return new Promise(r => setTimeout(r, Math.max(0, ms | 0)));
  }
  function calcAutoWaitMs() {
    const base = Math.max(0, ui?.config?.autoAnswerDelay ?? 0);
    const rand = Math.max(0, ui?.config?.autoAnswerRandomDelay ?? 0);
    return base + (rand ? Math.floor(Math.random() * rand) : 0);
  }
  function shouldAutoAnswerForLesson_(lessonId) {
    if (ui?.config?.autoAnswer) return true;
    if (!lessonId) return false;
    if (repo?.autoJoinedLessons?.has(lessonId) && ui?.config?.autoAnswerOnAutoJoin) return true;
    if (repo?.forceAutoAnswerLessons?.has(lessonId)) return true;
    return false;
  }
  const DEFAULT_HEADERS = () => ({
    "Content-Type": "application/json",
    xtbz: "ykt",
    "X-Client": "h5",
    Authorization: "Bearer " + (typeof localStorage !== "undefined" ? localStorage.getItem("Authorization") : "")
  });
  /**
   * Low-level POST helper using XMLHttpRequest to align with site requirements.
   * @param {string} url
   * @param {object} data
   * @param {Record<string,string>} headers
   * @returns {Promise<any>}
   */  function xhrPost(url, data, headers) {
    return new Promise((resolve, reject) => {
      try {
        const xhr = new XMLHttpRequest;
        xhr.open("POST", url);
        for (const [k, v] of Object.entries(headers || {})) xhr.setRequestHeader(k, v);
        xhr.onload = () => {
          try {
            const resp = JSON.parse(xhr.responseText);
            if (resp && typeof resp === "object") resolve(resp); else reject(new Error("解析响应失败"));
          } catch {
            reject(new Error("解析响应失败"));
          }
        };
        xhr.onerror = () => reject(new Error("网络请求失败"));
        xhr.send(JSON.stringify(data));
      } catch (e) {
        reject(e);
      }
    });
  }
  /**
   * POST /api/v3/lesson/problem/answer
   * Mirrors the 1.16.1 logic (no UI). Returns {code, data, msg, ...} on success code===0.
   * @param {{problemId:number, problemType:number}} problem
   * @param {any} result
   * @param {{headers?:Record<string,string>, dt?:number}} [options]
   */  async function answerProblem(problem, result, options = {}) {
    const pid = problem?.problemId ?? problem?.id;
    const url = "/api/v3/lesson/problem/answer";
    const headers = {
      ...DEFAULT_HEADERS(),
      ...options.headers || {}
    };
    const payload = {
      problemId: pid,
      problemType: problem.problemType,
      dt: options.dt ?? Date.now(),
      result: result
    };
    const resp = await xhrPost(url, payload, headers);
    if (resp.code === 0) return resp;
    throw new Error(`${resp.msg} (${resp.code})`);
  }
  /**
   * POST /api/v3/lesson/problem/retry
   * Expects server to echo success ids in data.success (as in v1.16.1).
   * @param {{problemId:number, problemType:number}} problem
   * @param {any} result
   * @param {number} dt - simulated answer time (epoch ms)
   * @param {{headers?:Record<string,string>}} [options]
   */  async function retryAnswer(problem, result, dt, options = {}) {
    const pid = problem?.problemId ?? problem?.id;
    const url = "/api/v3/lesson/problem/retry";
    const headers = {
      ...DEFAULT_HEADERS(),
      ...options.headers || {}
    };
    const payload = {
      problems: [ {
        problemId: pid,
        problemType: problem.problemType,
        dt: dt,
        result: result
      } ]
    };
    const resp = await xhrPost(url, payload, headers);
    if (resp.code !== 0) throw new Error(`${resp.msg} (${resp.code})`);
    const okList = resp?.data?.success || [];
    if (!Array.isArray(okList) || !okList.some(id => String(id) === String(pid))) throw new Error("服务器未返回成功信息");
    return resp;
  }
  /**
   * High-level orchestrator: answer first; if deadline has passed, optionally retry.
   * This is the module adaptation of the 1.16.1 userscript submit flow.
   *
   * @param {{problemId:number, problemType:number}} problem
   * @param {any} result
   * @param {Object} submitOptions
   * @param {number} [submitOptions.startTime] - unlock time (epoch ms). Required for retry path.
   * @param {number|null} [submitOptions.endTime] - deadline (epoch ms); null means unlimited.
   * @param {boolean} [submitOptions.forceRetry=false] - when past deadline, directly use retry without prompting.
   * @param {number} [submitOptions.retryDtOffsetMs=2000] - dt = startTime + offset when retrying.
   * @param {Record<string,string>} [submitOptions.headers] - extra/override headers.
   * @returns {Promise<{'route':'answer'|'retry', resp:any}>}
   * @param {number|string} [submitOptions.lessonId] - 所属课堂；缺省时将使用 repo.currentLessonId
   * @param {boolean} [submitOptions.autoGate=true]  - 是否启用“自动进入课堂/默认自动答题”的判定（向后兼容，默认开启）
   * @param {number} [submitOptions.waitMs]          - 覆盖自动等待时间；未提供时按设置计算
   */  async function submitAnswer(problem, result, submitOptions = {}) {
    const pid = problem?.problemId ?? problem?.id;
    const startTime = submitOptions?.startTime;
    const endTime = submitOptions?.endTime;
    const forceRetry = submitOptions?.forceRetry ?? false;
    const retryDtOffsetMs = submitOptions?.retryDtOffsetMs ?? 2e3;
    const headers = submitOptions?.headers;
    const autoGate = submitOptions?.autoGate ?? true;
    const waitMs = submitOptions?.waitMs;
    const lessonIdFromOpts = submitOptions && "lessonId" in submitOptions ? submitOptions.lessonId : void 0;
    // 统一拿 lessonId
        const lessonId = lessonIdFromOpts ?? repo?.currentLessonId ?? null;
    if (autoGate && shouldAutoAnswerForLesson_(lessonId)) {
      const ms = typeof waitMs === "number" ? Math.max(0, waitMs) : calcAutoWaitMs();
      if (ms > 0) {
        const guard = typeof endTime === "number" ? Math.max(0, endTime - Date.now() - 80) : ms;
        await sleep(Math.min(ms, guard));
      }
    }
    const now = Date.now();
    const pastDeadline = typeof endTime === "number" && now >= endTime;
    if (pastDeadline || forceRetry) {
      console.group("[雨课堂助手][DEBUG][answer] >>> 进入补交分支判断");
      console.log("problemId:", pid);
      console.log("pastDeadline:", pastDeadline, "(now=", now, ", endTime=", endTime, ")");
      console.log("forceRetry:", forceRetry);
      console.log("传入 startTime:", startTime, "传入 endTime:", endTime);
      const ps = repo?.getProblemStatus?.(pid);
      console.log("从 repo.problemStatus 获取:", ps);
      const st = Number.isFinite(startTime) ? startTime : ps?.startTime;
      const et = Number.isFinite(endTime) ? endTime : ps?.endTime;
      console.log("最终用于 retry 的 st=", st, " et=", et);
      // 计算 dt
            const off = Math.max(0, retryDtOffsetMs);
      let dt;
      if (Number.isFinite(st)) {
        dt = st + off;
        console.log("补交 dt = startTime + offset =", dt);
      } else if (Number.isFinite(et)) {
        dt = Math.max(0, et - Math.max(off, 5e3));
        console.log("补交 dt = near endTime window =", dt);
      } else {
        dt = Date.now() - off;
        console.log("补交 dt = fallback =", dt);
      }
      console.log(">>> 即将调用 retryAnswer()");
      console.groupEnd();
      try {
        const resp = await retryAnswer(problem, result, dt, {
          headers: headers
        });
        console.log("[雨课堂助手][INFO][answer] 补交成功 (/retry)", {
          problemId: pid,
          dt: dt,
          pastDeadline: pastDeadline,
          forceRetry: forceRetry
        });
        return {
          route: "retry",
          resp: resp
        };
      } catch (e) {
        console.error("[雨课堂助手][ERR][answer] 补交失败 (/retry)：", e);
        console.error("[雨课堂助手][ERR][answer] 失败参数：", {
          st: st,
          et: et,
          dt: dt,
          pastDeadline: pastDeadline,
          forceRetry: forceRetry
        });
        throw e;
      }
    }
    const resp = await answerProblem(problem, result, {
      headers: headers,
      dt: now
    });
    return {
      route: "answer",
      resp: resp
    };
  }
  const L = (...a) => console.log("[雨课堂助手][DBG][problem-list]", ...a);
  const W = (...a) => console.warn("[雨课堂助手][WARN][problem-list]", ...a);
  function $$2(sel) {
    return document.querySelector(sel);
  }
  function create(tag, cls) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    return n;
  }
  function pretty(obj) {
    try {
      return JSON.stringify(obj, null, 2);
    } catch {
      return String(obj);
    }
  }
  const HEADERS = () => ({
    "Content-Type": "application/json",
    xtbz: "ykt",
    "X-Client": "h5",
    Authorization: "Bearer " + (typeof localStorage !== "undefined" ? localStorage.getItem("Authorization") || "" : "")
  });
  async function httpGet(url) {
    return new Promise((resolve, reject) => {
      try {
        const xhr = new XMLHttpRequest;
        xhr.open("GET", url, true);
        const h = HEADERS();
        for (const k in h) xhr.setRequestHeader(k, h[k]);
        xhr.onload = () => {
          try {
            resolve(JSON.parse(xhr.responseText));
          } catch {
            reject(new Error("解析响应失败"));
          }
        };
        xhr.onerror = () => reject(new Error("网络失败"));
        xhr.send();
      } catch (e) {
        reject(e);
      }
    });
  }
  // 依次尝试多个端点，先成功先用
    async function fetchProblemDetail(problemId) {
    const candidates = [ `/api/v3/lesson/problem/detail?problemId=${problemId}`, `/api/v3/lesson/problem/get?problemId=${problemId}`, `/mooc-api/v1/lms/problem/detail?problem_id=${problemId}` ];
    for (const url of candidates) try {
      const resp = await httpGet(url);
      if (resp && typeof resp === "object" && (resp.code === 0 || resp.success === true)) return resp;
    } catch (_) {/* try next */}
    throw new Error("无法获取题目信息");
  }
  /**
   * 将所有可见课件中的题目页灌入 repo.problems / repo.encounteredProblems
   * 目的：绕过 XHR/fetch 拦截失效，直接从现有内存结构构建题目列表
   */  function hydrateProblemsFromPresentations() {
    try {
      const beforeCnt = repo.problems?.size || 0;
      const encBefore = (repo.encounteredProblems || []).length;
      const seen = new Set((repo.encounteredProblems || []).map(e => e.problemId));
      let foundSlides = 0, filledProblems = 0, addedEvents = 0;
      for (const [, pres] of repo.presentations) {
        const slides = pres?.slides || [];
        if (!slides.length) continue;
        for (const s of slides) {
          if (!s || !s.problem) continue;
          foundSlides++;
          const pid = s.problem.problemId || s.problem.id;
          if (!pid) continue;
          const pidStr = String(pid);
          // 填充 repo.problems
                    if (!repo.problems.has(pidStr)) {
            const normalized = {
              problemId: pidStr,
              problemType: s.problem.problemType || s.problem.type || s.problem.questionType || "unknown",
              body: s.problem.body || s.problem.title || "",
              options: s.problem.options || [],
              result: s.problem.result || null,
              status: s.problem.status || {},
              startTime: s.problem.startTime,
              endTime: s.problem.endTime,
              slideId: String(s.id),
              presentationId: String(pres.id)
            };
            repo.problems.set(pidStr, Object.assign({}, s.problem, normalized));
            filledProblems++;
          }
          // 填充 repo.encounteredProblems
                    if (!seen.has(pidStr)) {
            seen.add(pidStr);
            (repo.encounteredProblems || (repo.encounteredProblems = [])).push({
              problemId: pidStr,
              problemType: s.problem.problemType || s.problem.type || s.problem.questionType || "unknown",
              body: s.problem.body || s.problem.title || "",
              presentationId: String(pres.id),
              slideId: String(s.id),
              slide: s,
              endTime: s.problem.endTime,
              startTime: s.problem.startTime
            });
            addedEvents++;
          }
        }
      }
      // 按 presentationId+slide.index 排序
            if (repo.encounteredProblems && repo.encounteredProblems.length) repo.encounteredProblems.sort((a, b) => {
        if (a.presentationId !== b.presentationId) return String(a.presentationId).localeCompare(String(b.presentationId));
        const ax = a.slide?.index ?? 0, bx = b.slide?.index ?? 0;
        return ax - bx;
      });
      const afterCnt = repo.problems?.size || 0;
      const encAfter = (repo.encounteredProblems || []).length;
      L("[hydrateProblemsFromPresentations]", {
        foundSlides: foundSlides,
        filledProblems: filledProblems,
        addedEvents: addedEvents,
        problemsBefore: beforeCnt,
        problemsAfter: afterCnt,
        encounteredBefore: encBefore,
        encounteredAfter: encAfter,
        sampleProblems: Array.from(repo.problems.keys()).slice(0, 8)
      });
    } catch (e) {
      W("hydrateProblemsFromPresentations error:", e);
    }
  }
  /**
   * 在无法从 repo.problems 命中时，跨 presentations 查找并回写
   */  function crossFindProblem(problemIdStr) {
    for (const [, pres] of repo.presentations) {
      const arr = pres?.slides || [];
      for (const s of arr) {
        const pid = s?.problem?.problemId || s?.problem?.id;
        if (pid && String(pid) === problemIdStr) {
          // 回写
          const normalized = Object.assign({}, s.problem, {
            problemId: problemIdStr,
            problemType: s.problem.problemType || s.problem.type || s.problem.questionType || "unknown",
            body: s.problem.body || s.problem.title || "",
            options: s.problem.options || [],
            result: s.problem.result || null,
            status: s.problem.status || {},
            startTime: s.problem.startTime,
            endTime: s.problem.endTime,
            slideId: String(s.id),
            presentationId: String(pres.id)
          });
          repo.problems.set(problemIdStr, normalized);
          return {
            problem: normalized,
            slide: s,
            presentationId: String(pres.id)
          };
        }
      }
    }
    return null;
  }
  // ========== 行渲染与交互 ==========
    function bindRowActions(row, e, prob) {
    const actionsBar = row.querySelector(".problem-actions");
    // 查看：跳到对应的课件页
        const btnGo = create("button");
    btnGo.textContent = "查看";
    btnGo.onclick = () => {
      const presId = e.presentationId || prob?.presentationId;
      const slideId = e.slide?.id || e.slideId || prob?.slideId;
      L("查看题目 -> navigateTo", {
        presId: presId,
        slideId: slideId
      });
      if (presId && slideId) actions.navigateTo(String(presId), String(slideId)); else ui.toast("缺少跳转信息");
    };
    actionsBar.appendChild(btnGo);
    // AI 解答：打开 AI 面板并优先使用该题所在页（若拿得到）
        const btnAI = create("button");
    btnAI.textContent = "AI解答";
    btnAI.onclick = () => {
      e.presentationId || prob?.presentationId;
      const slideId = e.slide?.id || e.slideId || prob?.slideId;
      if (slideId)
      // 派发“提问当前PPT”以便 AI 面板优先识别该页
      window.dispatchEvent(new CustomEvent("ykt:ask-ai-for-slide", {
        detail: {
          slideId: String(slideId),
          imageUrl: repo.slides.get(String(slideId))?.image || repo.slides.get(String(slideId))?.thumbnail || ""
        }
      }));
      window.dispatchEvent(new CustomEvent("ykt:open-ai", {
        detail: {
          problemId: e.problemId
        }
      }));
    };
    actionsBar.appendChild(btnAI);
    // 修改后刷新题目
        const btnRefresh = create("button");
    btnRefresh.textContent = "刷新题目";
    btnRefresh.onclick = async () => {
      row.classList.add("loading");
      try {
        const resp = await fetchProblemDetail(e.problemId);
        const detail = resp.data?.problem || resp.data || resp.result || {};
        const merged = Object.assign({}, prob || {}, detail, {
          problemId: e.problemId,
          problemType: e.problemType
        });
        repo.problems.set(e.problemId, merged);
        updateRow(row, e, merged);
        ui.toast("已刷新题目");
      } catch (err) {
        ui.toast("刷新失败：" + (err?.message || err));
      } finally {
        row.classList.remove("loading");
      }
    };
    actionsBar.appendChild(btnRefresh);
  }
  function updateRow(row, e, prob) {
    // 标题
    const title = row.querySelector(".problem-title");
    title.textContent = (prob?.body || e.body || prob?.title || `题目 ${e.problemId}`).slice(0, 120);
    // 先拿 status & 时窗
        const status = prob?.status || e.status || {};
    const ps = repo.problemStatus?.get?.(e.problemId);
    const startTime = Number(status?.startTime ?? prob?.startTime ?? e.startTime ?? ps?.startTime ?? 0) || void 0;
    const endTime = Number(status?.endTime ?? prob?.endTime ?? e.endTime ?? ps?.endTime ?? 0) || void 0;
    // 元信息（含截止时间）
        const meta = row.querySelector(".problem-meta");
    const answered = !!(prob?.result || status?.myAnswer || status?.answered);
    meta.textContent = `PID: ${e.problemId} / 类型: ${e.problemType} / 状态: ${answered ? "已作答" : "未作答"} / 截止: ${endTime ? new Date(endTime).toLocaleString() : "未知"}`;
    // 容器
        let detail = row.querySelector(".problem-detail");
    if (!detail) {
      detail = create("div", "problem-detail");
      row.appendChild(detail);
    }
    detail.innerHTML = "";
    // 已作答答案
        const answeredBox = create("div", "answered-box");
    const ansLabel = create("div", "label");
    ansLabel.textContent = "已作答答案";
    const ansPre = create("pre");
    ansPre.textContent = pretty(prob?.result || status?.myAnswer || {});
    answeredBox.appendChild(ansLabel);
    answeredBox.appendChild(ansPre);
    detail.appendChild(answeredBox);
    // 手动答题（含补交）
        const editorBox = create("div", "editor-box");
    const editLabel = create("div", "label");
    editLabel.textContent = "手动答题（JSON）";
    const textarea = create("textarea");
    textarea.rows = 6;
    textarea.placeholder = '{"answers":[...]}';
    textarea.value = pretty(prob?.result || status?.myAnswer || prob?.suggested || {});
    editorBox.appendChild(editLabel);
    editorBox.appendChild(textarea);
    const submitBar = create("div", "submit-bar");
    // 保存（仅本地）
        const btnSaveLocal = create("button");
    btnSaveLocal.textContent = "保存(本地)";
    btnSaveLocal.onclick = () => {
      try {
        const parsed = JSON.parse(textarea.value || '[""]');
        const merged = Object.assign({}, prob || {}, {
          result: parsed
        });
        repo.problems.set(e.problemId, merged);
        ui.toast("已保存到本地列表");
        updateRow(row, e, merged);
      } catch (err) {
        ui.toast("JSON 解析失败：" + (err?.message || err));
      }
    };
    submitBar.appendChild(btnSaveLocal);
    // 正常提交（过期则提示是否补交）
        const btnSubmit = create("button");
    btnSubmit.textContent = "提交";
    btnSubmit.onclick = async () => {
      try {
        const result = JSON.parse(textarea.value || '[""]');
        row.classList.add("loading");
        const {route: route} = await submitAnswer({
          problemId: e.problemId,
          problemType: e.problemType
        }, result, {
          startTime: startTime,
          endTime: endTime
        });
        ui.toast(route === "answer" ? "提交成功" : "补交成功");
        const merged = Object.assign({}, prob || {}, {
          result: result
        }, {
          status: {
            ...prob?.status || {},
            answered: true
          }
        });
        repo.problems.set(e.problemId, merged);
        updateRow(row, e, merged);
      } catch (err) {
        if (err?.name === "DeadlineError") ui.confirm("已过截止，是否执行补交？").then(async ok => {
          if (!ok) return;
          try {
            const result = JSON.parse(textarea.value || "{}");
            row.classList.add("loading");
            await submitAnswer({
              problemId: e.problemId,
              problemType: e.problemType
            }, result, {
              startTime: startTime,
              endTime: endTime,
              forceRetry: true
            });
            ui.toast("补交成功");
            const merged = Object.assign({}, prob || {}, {
              result: result
            }, {
              status: {
                ...prob?.status || {},
                answered: true
              }
            });
            repo.problems.set(e.problemId, merged);
            updateRow(row, e, merged);
          } catch (e2) {
            ui.toast("补交失败：" + (e2?.message || e2));
          } finally {
            row.classList.remove("loading");
          }
        }); else ui.toast("提交失败：" + (err?.message || err));
      } finally {
        row.classList.remove("loading");
      }
    };
    submitBar.appendChild(btnSubmit);
    // 强制补交
        const btnForceRetry = create("button");
    btnForceRetry.textContent = "强制补交";
    btnForceRetry.onclick = async () => {
      try {
        const result = JSON.parse(textarea.value || "{}");
        row.classList.add("loading");
        await submitAnswer({
          problemId: e.problemId,
          problemType: e.problemType
        }, result, {
          startTime: startTime,
          endTime: endTime,
          forceRetry: true
        });
        ui.toast("补交成功");
        const merged = Object.assign({}, prob || {}, {
          result: result
        }, {
          status: {
            ...prob?.status || {},
            answered: true
          }
        });
        repo.problems.set(e.problemId, merged);
        updateRow(row, e, merged);
      } catch (err) {
        ui.toast("补交失败：" + (err?.message || err));
      } finally {
        row.classList.remove("loading");
      }
    };
    submitBar.appendChild(btnForceRetry);
    editorBox.appendChild(submitBar);
    detail.appendChild(editorBox);
  }
  // ========== 面板生命周期 ==========
    let mounted$3 = false;
  let root$3;
  function mountProblemListPanel() {
    if (mounted$3) return root$3;
    const wrap = document.createElement("div");
    wrap.innerHTML = tpl$2;
    document.body.appendChild(wrap.firstElementChild);
    root$3 = document.getElementById("ykt-problem-list-panel");
    $$2("#ykt-problem-list-close")?.addEventListener("click", () => showProblemListPanel(false));
    window.addEventListener("ykt:open-problem-list", () => showProblemListPanel(true));
    window.addEventListener("ykt:problems-updated", () => updateProblemList());
    mounted$3 = true;
    // 首次挂载时就做一次灌入
        hydrateProblemsFromPresentations();
    updateProblemList();
    return root$3;
  }
  function showProblemListPanel(visible = true) {
    mountProblemListPanel();
    root$3.classList.toggle("visible", !!visible);
    if (visible) {
      // 面板打开时再做一次灌入
      hydrateProblemsFromPresentations();
      updateProblemList();
    }
  }
  function updateProblemList() {
    mountProblemListPanel();
    const container = $$2("#ykt-problem-list");
    container.innerHTML = "";
    // 兜底刷新
        if (!repo.encounteredProblems || repo.encounteredProblems.length === 0) hydrateProblemsFromPresentations();
    const list = repo.encounteredProblems || [];
    L("updateProblemList", {
      count: list.length
    });
    if (list.length === 0) {
      const empty = document.createElement("div");
      empty.className = "problem-empty";
      empty.textContent = "暂无题目（可尝试切换章节或刷新页面）";
      container.appendChild(empty);
      return;
    }
    list.forEach(e => {
      let prob = repo.problems.get(e.problemId) || null;
      if (!prob) {
        const cross = crossFindProblem(String(e.problemId));
        if (cross) {
          prob = cross.problem;
          e.presentationId = e.presentationId || cross.presentationId;
          e.slide = e.slide || cross.slide;
          e.slideId = e.slideId || cross.slide?.id;
          L("cross-fill problem", {
            pid: e.problemId,
            pres: e.presentationId,
            slideId: e.slideId
          });
        }
      }
      const row = document.createElement("div");
      row.className = "problem-row";
      const title = document.createElement("div");
      title.className = "problem-title";
      row.appendChild(title);
      const meta = document.createElement("div");
      meta.className = "problem-meta";
      row.appendChild(meta);
      const actionsBar = document.createElement("div");
      actionsBar.className = "problem-actions";
      row.appendChild(actionsBar);
      bindRowActions(row, e, prob || {});
      updateRow(row, e, prob || {});
      container.appendChild(row);
    });
  }
  var tpl$1 = '<div id="ykt-active-problems-panel" class="ykt-active-wrapper">\r\n  <div id="ykt-active-problems" class="active-problems"></div>\r\n</div>\r\n';
  function deadlineFromLimit(startTime, limit) {
    const start = Number(startTime);
    const seconds = Number(limit);
    if (!Number.isFinite(start) || !Number.isFinite(seconds) || seconds <= 0) return null;
    return start + seconds * 1e3;
  }
  function isDeadlineReached(endTime, now = Date.now()) {
    return Number.isFinite(endTime) && now >= endTime;
  }
  function remainingSeconds(endTime, now = Date.now()) {
    return Number.isFinite(endTime) ? Math.max(0, Math.floor((endTime - now) / 1e3)) : null;
  }
  let mounted$2 = false;
  let root$2;
  function $$1(sel) {
    return document.querySelector(sel);
  }
  function mountActiveProblemsPanel() {
    if (mounted$2) return root$2;
    const wrap = document.createElement("div");
    wrap.innerHTML = tpl$1;
    document.body.appendChild(wrap.firstElementChild);
    root$2 = document.getElementById("ykt-active-problems-panel");
    mounted$2 = true;
    setInterval(() => updateActiveProblems(), 1e3);
    return root$2;
  }
  function updateActiveProblems() {
    mountActiveProblemsPanel();
    const box = $$1("#ykt-active-problems");
    box.innerHTML = "";
    const now = Date.now();
    let hasActiveProblems = false;
    repo.problemStatus.forEach((status, pid) => {
      const p = repo.problems.get(pid);
      if (!p || p.result) return;
      const remain = remainingSeconds(status.endTime, now);
      if (remain !== null && remain <= 0) {
        console.log(`[雨课堂助手][INFO][ActiveProblems] 题目 ${pid} 倒计时已结束，移除卡片`);
        return;
      }
      hasActiveProblems = true;
      const card = document.createElement("div");
      card.className = "active-problem-card";
      const title = document.createElement("div");
      title.className = "ap-title";
      title.textContent = (p.body || `题目 ${pid}`).slice(0, 80);
      card.appendChild(title);
      const info = document.createElement("div");
      info.className = "ap-info";
      info.textContent = remain === null ? "不限时" : `剩余 ${remain}s`;
      card.appendChild(info);
      const bar = document.createElement("div");
      bar.className = "ap-actions";
      const go = document.createElement("button");
      go.textContent = "查看";
      go.onclick = () => actions.navigateTo(status.presentationId, status.slideId);
      bar.appendChild(go);
      const ai = document.createElement("button");
      ai.textContent = "AI 解答";
      ai.onclick = () => window.dispatchEvent(new CustomEvent("ykt:open-ai"));
      bar.appendChild(ai);
      card.appendChild(bar);
      box.appendChild(card);
    });
    if (!hasActiveProblems) root$2.style.display = "none"; else root$2.style.display = "";
  }
  var tpl = '<div id="ykt-tutorial-panel" class="ykt-panel">\n  <div class="panel-header">\n    <h3>雨课堂助手使用教程</h3>\n    <span class="close-btn" id="ykt-tutorial-close"><i class="fas fa-times"></i></span>\n  </div>\n\n  <div class="panel-body">\n    <div class="tutorial-content">\n      <h4>工具版本</h4>\n      <p>1.21.4</p>\n\n      <h4>功能介绍</h4>\n      <p>AI雨课堂助手是一个为雨课堂提供辅助功能的工具，可以帮助你更好地参与课堂互动。</p>\n      <p>项目仓库：<a href="https://github.com/ZaytsevZY/yuketang-helper-auto" target="_blank" rel="noopener">GitHub</a></p>\n      <p>脚本安装：<a href="https://greasyfork.org/zh-CN/scripts/531469-ai%E9%9B%A8%E8%AF%BE%E5%A0%82%E5%8A%A9%E6%89%8B-%E6%A8%A1%E5%9D%97%E5%8C%96%E6%9E%84%E5%BB%BA%E7%89%88" target="_blank" rel="noopener">GreasyFork</a></p>\n\n      <h4>工具栏按钮说明</h4>\n      <ul>\n        <li><i class="fas fa-bell"></i> <b>习题提醒</b>：切换是否在新习题出现时显示通知提示（蓝色=开启）。</li>\n        <li><i class="fas fa-file-powerpoint"></i> <b>课件浏览</b>：查看课件与题目页面，提问可见内容。</li>\n        <li><i class="fas fa-robot"></i> <b>AI 解答</b>：向 AI 询问当前题目并显示建议答案。</li>\n        <li><i class="fas fa-magic-wand-sparkles"></i> <b>自动作答</b>：切换自动作答（蓝色=开启）。</li>\n        <li><i class="fas fa-cog"></i> <b>设置</b>：配置 API 密钥与自动作答参数。</li>\n        <li><i class="fas fa-question-circle"></i> <b>使用教程</b>：显示/隐藏当前教程页面。</li>\n      </ul>\n\n      <h4>自动作答</h4>\n      <ul>\n        <li>在设置中开启自动作答并配置延迟/随机延迟。</li>\n        <li>需要配置 LLM API 密钥。</li>\n        <li>答案来自 AI，结果仅供参考。</li>\n      </ul>\n\n      <h4>AI 解答</h4>\n      <ol>\n        <li>点击设置（<i class="fas fa-cog"></i>）填入 API Key。</li>\n        <li>每个 AI Profile 可单独设置 Temperature（0–2）；留空时使用模型默认值，不会发送该参数。</li>\n        <li>点击 AI 解答（<i class="fas fa-robot"></i>）后会对“当前题目/最近遇到的题目”询问并解析。</li>\n      </ol>\n\n      <h4>课堂提醒、手机版与亮屏</h4>\n      <ul>\n        <li>设置中可以分别控制新题、题组发布、课件发布、其他发布、下课以及自动作答的每个阶段；系统通知、页面弹窗和提示音也可单独关闭。</li>\n        <li>打开或翻阅旧课件不会触发课件发布提醒；携带具体题目 ID 的新题发布可进入自动作答队列，题组、考试、测试等发布只提醒。</li>\n        <li>手机进入 <code>/m/v2</code> 时会使用“仅提醒”模式，点击右下角铃铛即可设置提醒和亮屏，不会启动自动作答。</li>\n        <li>系统通知需由浏览器或篡改猴授予权限；脚本不会自动请求或修改系统通知权限。</li>\n        <li>“课堂保持亮屏”仅在可见的课堂页防止自动熄屏，无法阻止手动锁屏、后台冻结或系统省电策略。</li>\n      </ul>\n\n      <h4>注意事项</h4>\n      <p>1) 仅供学习参考，请独立思考；</p>\n      <p>2) 合理使用 API 额度；</p>\n      <p>3) 答案不保证 100% 正确；</p>\n      <p>4) 自动作答有一定风险，谨慎开启。</p>\n\n      <h4>联系方式</h4>\n      <ul>\n        <li>请在<a href="https://github.com/ZaytsevZY/yuketang-helper-auto/issues" target="_blank" rel="noopener">GitHub Issues</a>提出问题</li>\n      </ul>\n    </div>\n  </div>\n</div>\n';
  let mounted$1 = false;
  let root$1;
  function $(sel) {
    return document.querySelector(sel);
  }
  function mountTutorialPanel() {
    if (mounted$1) return root$1;
    const host = document.createElement("div");
    host.innerHTML = tpl;
    document.body.appendChild(host.firstElementChild);
    root$1 = document.getElementById("ykt-tutorial-panel");
    $("#ykt-tutorial-close")?.addEventListener("click", () => showTutorialPanel(false));
    mounted$1 = true;
    return root$1;
  }
  function showTutorialPanel(visible = true) {
    mountTutorialPanel();
    root$1.classList.toggle("visible", !!visible);
  }
  function toggleTutorialPanel() {
    mountTutorialPanel();
    const vis = root$1.classList.contains("visible");
    showTutorialPanel(!vis);
    const helpBtn = document.getElementById("ykt-btn-help");
    if (helpBtn) helpBtn.classList.toggle("active", !vis);
  }
  // src/ui/ui-api.js
    const _config = Object.assign({}, DEFAULT_CONFIG, storage.get("config", {}));
  _config.ai.kimiApiKey = storage.get("kimiApiKey", _config.ai.kimiApiKey);
  _config.TYPE_MAP = _config.TYPE_MAP || PROBLEM_TYPE_MAP;
  if (typeof _config.autoJoinEnabled === "undefined") _config.autoJoinEnabled = false;
  if (typeof _config.autoAnswerOnAutoJoin === "undefined") _config.autoAnswerOnAutoJoin = true;
  if (typeof _config.iftex === "undefined") _config.iftex = true;
  if (typeof _config.ai === "undefined" || !_config.ai) _config.ai = {};
  if (typeof _config.ai.ocrApi === "undefined") _config.ai.ocrApi = "";
  if (typeof _config.ai.ocrApiKey === "undefined") _config.ai.ocrApiKey = "";
  if (typeof _config.ai.translateApi === "undefined") _config.ai.translateApi = "";
  if (typeof _config.ai.translateApiKey === "undefined") _config.ai.translateApiKey = "";
  if (typeof _config.ai.translateModel === "undefined") _config.ai.translateModel = "";
  if (typeof _config.notifyProblems === "undefined") _config.notifyProblems = true;
  if (typeof _config.notifyPopupDuration === "undefined") _config.notifyPopupDuration = 5e3;
  if (typeof _config.notifyVolume === "undefined") _config.notifyVolume = .6;
  if (typeof _config.customNotifyAudioSrc === "undefined") _config.customNotifyAudioSrc = "";
  if (typeof _config.customNotifyAudioName === "undefined") _config.customNotifyAudioName = "";
  _config.autoJoinEnabled = !!_config.autoJoinEnabled;
  _config.autoAnswerOnAutoJoin = !!_config.autoAnswerOnAutoJoin;
  function saveConfig() {
    try {
      storage.set("config", {
        ...this.config,
        autoJoinEnabled: !!this.config.autoJoinEnabled,
        autoAnswerOnAutoJoin: !!this.config.autoAnswerOnAutoJoin
      });
    } catch (e) {
      console.warn("[ui.saveConfig] failed", e);
    }
  }
  // 面板层级管理
    let currentZIndex = 1e7;
  function enableNotifyDrag(wrapper, handle, bringToFront) {
    if (!wrapper || !handle) return;
    let dragging = false;
    let startX = 0;
    let startY = 0;
    let originLeft = 0;
    let originTop = 0;
    const onPointerMove = ev => {
      if (!dragging) return;
      const nextLeft = Math.max(8, originLeft + ev.clientX - startX);
      const nextTop = Math.max(8, originTop + ev.clientY - startY);
      wrapper.style.left = `${nextLeft}px`;
      wrapper.style.top = `${nextTop}px`;
      wrapper.style.right = "auto";
      wrapper.style.bottom = "auto";
    };
    const stopDrag = () => {
      dragging = false;
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", stopDrag);
      window.removeEventListener("pointercancel", stopDrag);
    };
    handle.addEventListener("pointerdown", ev => {
      if (ev.button !== 0) return;
      if (ev.target?.closest?.("button, a, input, textarea, select")) return;
      const rect = wrapper.getBoundingClientRect();
      dragging = true;
      startX = ev.clientX;
      startY = ev.clientY;
      originLeft = rect.left;
      originTop = rect.top;
      wrapper.style.left = `${rect.left}px`;
      wrapper.style.top = `${rect.top}px`;
      wrapper.style.right = "auto";
      wrapper.style.bottom = "auto";
      bringToFront?.(wrapper);
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", stopDrag);
      window.addEventListener("pointercancel", stopDrag);
      ev.preventDefault();
    });
  }
  const ui = {
    get config() {
      return _config;
    },
    saveConfig: saveConfig,
    updatePresentationList: updatePresentationList,
    updateSlideView: updateSlideView,
    askAIForCurrent: askAIForCurrent,
    updateProblemList: updateProblemList,
    updateActiveProblems: updateActiveProblems,
    // 提升面板层级的辅助函数
    _bringToFront(panelElement) {
      if (panelElement && panelElement.classList.contains("visible")) {
        currentZIndex += 1;
        panelElement.style.zIndex = currentZIndex;
      }
    },
    // 修改后的面板显示函数，添加z-index管理
    showPresentationPanel(visible = true) {
      showPresentationPanel(visible);
      if (visible) {
        const panel = document.getElementById("ykt-presentation-panel");
        this._bringToFront(panel);
      }
    },
    showProblemListPanel(visible = true) {
      showProblemListPanel(visible);
      if (visible) {
        const panel = document.getElementById("ykt-problem-list-panel");
        this._bringToFront(panel);
      }
    },
    showAIPanel(visible = true) {
      showAIPanel(visible);
      if (visible) {
        const panel = document.getElementById("ykt-ai-answer-panel");
        this._bringToFront(panel);
      }
    },
    toggleSettingsPanel() {
      toggleSettingsPanel();
      // 检查面板是否变为可见状态
            const panel = document.getElementById("ykt-settings-panel");
      if (panel && panel.classList.contains("visible")) this._bringToFront(panel);
    },
    toggleTutorialPanel() {
      toggleTutorialPanel();
      // 检查面板是否变为可见状态
            const panel = document.getElementById("ykt-tutorial-panel");
      if (panel && panel.classList.contains("visible")) this._bringToFront(panel);
    },
    // 在 index.js 初始化时挂载一次
    _mountAll() {
      mountSettingsPanel();
      mountAIPanel();
      mountPresentationPanel();
      mountProblemListPanel();
      mountActiveProblemsPanel();
      mountTutorialPanel();
      window.addEventListener("ykt:open-ai", () => this.showAIPanel(true));
    },
    // 题目提醒
    notifyProblem(problem, slide, notice = {}) {
      try {
        const titleText = notice.title || "习题已发布";
        const nativeTitle = notice.nativeTitle || "雨课堂习题提示";
        const detailText = notice.detail || this.getProblemDetail(problem);
        const channels = getReminderChannels(this.config);
        const volume = getReminderVolume(this.config);
        // 1) 原生通知（如果可用，备用，不阻碍自定义弹窗）
                if (channels.native) try {
          this.nativeNotify?.({
            title: nativeTitle,
            text: detailText,
            image: slide?.thumbnail || null,
            timeout: Math.max(2e3, +this.config.notifyPopupDuration || 5e3)
          });
        } catch {}
        if (!channels.popup) {
          if (channels.sound) this._playNotifySound(volume);
          return;
        }
        // 2) 自定义悬浮弹窗
                const wrapper = document.createElement("div");
        wrapper.className = "ykt-problem-notify";
        // 内联样式，避免依赖外部CSS
                Object.assign(wrapper.style, {
          position: "fixed",
          right: "20px",
          bottom: "24px",
          maxWidth: "380px",
          background: "rgba(20,20,20,0.92)",
          color: "#fff",
          borderRadius: "12px",
          boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
          padding: "14px 16px",
          display: "flex",
          gap: "12px",
          alignItems: "flex-start",
          zIndex: String(++currentZIndex),
          fontSize: "14px",
          lineHeight: "1.5",
          backdropFilter: "blur(2px)",
          border: "1px solid rgba(255,255,255,0.06)",
          cursor: "default"
        });
        // 缩略图（可选）
                if (slide?.thumbnail) {
          const img = document.createElement("img");
          img.src = slide.thumbnail;
          Object.assign(img.style, {
            width: "56px",
            height: "56px",
            objectFit: "cover",
            borderRadius: "8px",
            flex: "0 0 auto"
          });
          wrapper.appendChild(img);
        }
        const body = document.createElement("div");
        body.style.flex = "1 1 auto";
        const head = document.createElement("div");
        Object.assign(head.style, {
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "8px",
          marginBottom: "6px",
          cursor: "move",
          userSelect: "none",
          touchAction: "none"
        });
        const title = document.createElement("div");
        title.textContent = titleText;
        Object.assign(title.style, {
          fontWeight: "600",
          fontSize: "15px",
          flex: "1 1 auto"
        });
        const closeBtn = document.createElement("button");
        closeBtn.textContent = "x";
        Object.assign(closeBtn.style, {
          border: "none",
          background: "transparent",
          color: "#fff",
          opacity: "0.7",
          fontSize: "18px",
          lineHeight: "18px",
          cursor: "pointer",
          padding: "0 4px",
          marginLeft: "4px",
          flex: "0 0 auto"
        });
        closeBtn.addEventListener("mouseenter", () => closeBtn.style.opacity = "1");
        closeBtn.addEventListener("mouseleave", () => closeBtn.style.opacity = "0.7");
        const detail = document.createElement("pre");
        detail.textContent = detailText;
        Object.assign(detail.style, {
          whiteSpace: "pre-wrap",
          margin: 0,
          fontFamily: "inherit",
          opacity: "0.92",
          maxHeight: "220px",
          overflow: "auto"
        });
        head.appendChild(title);
        head.appendChild(closeBtn);
        body.appendChild(head);
        body.appendChild(detail);
        wrapper.appendChild(body);
        document.body.appendChild(wrapper);
        this._bringToFront(wrapper);
        const timeout = Math.max(2e3, +this.config.notifyPopupDuration || 5e3);
        const timer = setTimeout(() => wrapper.remove(), timeout);
        closeBtn.onclick = () => {
          clearTimeout(timer);
          wrapper.remove();
        };
        enableNotifyDrag(wrapper, head, el => this._bringToFront(el));
        if (channels.sound) this._playNotifySound(volume);
      } catch (e) {
        console.warn("[雨课堂助手][WARN][ui.notifyProblem] failed:", e);
      }
    },
    /**
     * Single embedded reminder interface used by desktop and mobile runtimes.
     * Event selection happens here; delivery selection happens in notifyProblem.
     */
    notifyClassroomEvent(event = {}) {
      if (!isReminderEnabled(event.kind, this.config)) return false;
      const detail = event.detail || "课堂状态发生了变化";
      this.notifyProblem(event.problem || {
        problemId: event.dedupeKey || event.kind || "CLASSROOM_EVENT",
        body: detail,
        options: []
      }, event.slide || null, {
        title: event.title || "雨课堂提醒",
        nativeTitle: event.nativeTitle || event.title || "雨课堂提醒",
        detail: detail
      });
      return true;
    },
    notifyPublish(event) {
      const title = event?.title || "课堂内容已发布";
      const detail = event?.detail || "教师发布了新的课堂内容";
      const kind = {
        assessment: "assessment-publish",
        courseware: "courseware-publish",
        other: "other-publish"
      }[event?.category];
      return this.notifyClassroomEvent({
        kind: kind,
        dedupeKey: event?.dedupeKey || "PUBLISH",
        title: title,
        nativeTitle: title,
        detail: detail
      });
    },
    // 播放自定义提示音
    _playNotifySound(volume = .6) {
      const src = (this.config.customNotifyAudioSrc || "").trim();
      if (src) try {
        if (!this.__notifyAudioEl) {
          this.__notifyAudioEl = new Audio;
          this.__notifyAudioEl.preload = "auto";
        }
        const el = this.__notifyAudioEl;
        el.pause();
        // 若用户更换了音频，或首次设置，更新 src
                if (el.src !== src) el.src = src;
        el.volume = Math.max(0, Math.min(1, volume));
        el.currentTime = 0;
        const p = el.play();
        // 失败时回退
                if (p && typeof p.catch === "function") p.catch(() => this._playNotifyTone(volume));
        return;
      } catch (e) {
        console.warn("[雨课堂助手][WARN] custom audio failed, fallback to tone:", e);
        // 回退到合成音
            }
      this._playNotifyTone(volume);
    },
    // 简易提示音：两个音高的短促“叮-咚”
    _playNotifyTone(volume = .6) {
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext);
        const now = ctx.currentTime;
        const master = ctx.createGain();
        master.gain.value = Math.max(0, Math.min(1, volume));
        master.connect(ctx.destination);
        const tone = (freq, t0, dur = .12) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = "sine";
          osc.frequency.setValueAtTime(freq, t0);
          gain.gain.setValueAtTime(0, t0);
          gain.gain.linearRampToValueAtTime(1, t0 + .01);
          gain.gain.exponentialRampToValueAtTime(.001, t0 + dur);
          osc.connect(gain);
          gain.connect(master);
          osc.start(t0);
          osc.stop(t0 + dur + .02);
        };
        tone(880, now);
 // A5
                tone(1318.51, now + .16);
 // E6
        // 自动关闭
                setTimeout(() => ctx.close(), 500);
      } catch {}
    },
    // 供设置页调用：写入/清除自定义提示音
    setCustomNotifyAudio({src: src, name: name}) {
      this.config.customNotifyAudioSrc = src || "";
      this.config.customNotifyAudioName = name || "";
      this.saveConfig();
    },
    getProblemDetail(problem) {
      if (!problem) return "题目未找到";
      const lines = [ problem.body || "" ];
      if (Array.isArray(problem.options)) lines.push(...problem.options.map(({key: key, value: value}) => `${key}. ${value}`));
      return lines.join("\n");
    },
    toast: toast,
    nativeNotify: gm.notify,
    // Buttons 状态
    updateAutoAnswerBtn() {
      const el = document.getElementById("ykt-btn-auto-answer");
      if (!el) return;
      if (_config.autoAnswer) el.classList.add("active"); else el.classList.remove("active");
    }
  };
  // src/ui/panels/auto-answer-popup.js
  // 简单 HTML 转义
    function esc(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[c]));
  }
  // 显示自动作答成功弹窗
    function showAutoAnswerPopup(problem, aiAnswer, cfg = {}) {
    // 避免重复
    const existed = document.getElementById("ykt-auto-answer-popup");
    if (existed) existed.remove();
    const popup = document.createElement("div");
    popup.id = "ykt-auto-answer-popup";
    popup.className = "auto-answer-popup";
    popup.innerHTML = `\n    <div class="popup-content">\n      <div class="popup-header">\n        <h4><i class="fas fa-robot"></i> AI自动作答成功</h4>\n        <span class="close-btn" title="关闭"><i class="fas fa-times"></i></span>\n      </div>\n      <div class="popup-body">\n        <div class="popup-row popup-answer">\n          <div class="label">AI分析结果：</div>\n          <div class="content">${esc(aiAnswer || "无AI回答").replace(/\n/g, "<br>")}</div>\n        </div>\n      </div>\n    </div>\n  `;
    document.body.appendChild(popup);
    // 关闭按钮
        popup.querySelector(".close-btn")?.addEventListener("click", () => popup.remove());
    // 点击遮罩关闭
        popup.addEventListener("click", e => {
      if (e.target === popup) popup.remove();
    });
    // 自动关闭
        const ac = ui.config?.autoAnswerPopup || {};
    const autoClose = cfg.autoClose ?? ac.autoClose ?? true;
    const autoDelay = cfg.autoCloseDelay ?? ac.autoCloseDelay ?? 4e3;
    if (autoClose) setTimeout(() => {
      if (popup.parentNode) popup.remove();
    }, autoDelay);
    // 入场动画
        requestAnimationFrame(() => popup.classList.add("visible"));
  }
  const PROBLEM_CONTAINER_KEYS = new Set([ "problems", "problem_list", "problemList", "problem-list" ]);
  const TIMELINE_CONTAINER_KEYS = new Set([ "timelineList", "timeline_list", "timeline" ]);
  const PROBLEM_ID_KEYS = [ "problemId", "problem_id", "problemid" ];
  const PROBLEM_TYPE_KEYS = [ "problemType", "problem_type", "ProblemType", "questionType" ];
  const PROBLEM_BODY_KEYS = [ "body", "Body", "title", "content" ];
  const PROBLEM_OPTION_KEYS = [ "options", "Options" ];
  function isMeaningful(value) {
    if (value === void 0 || value === null) return false;
    if (typeof value === "string") return value.trim() !== "";
    if (Array.isArray(value)) return value.length > 0;
    if (value instanceof Date) return true;
    if (typeof value === "object") return Object.keys(value).length > 0;
    return true;
  }
  function firstMeaningful(...values) {
    return values.find(isMeaningful);
  }
  function normalizeId(value) {
    const id = firstMeaningful(value);
    if (id === void 0) return null;
    const text = String(id).trim();
    return text || null;
  }
  function isPlainObject(value) {
    return !!value && typeof value === "object" && !Array.isArray(value);
  }
  function normalizeProblem(raw, context = {}, options = {}) {
    let value = raw;
    if (typeof value === "string" || typeof value === "number") value = {
      problemId: value
    };
    if (!isPlainObject(value)) return null;
    const explicitId = firstMeaningful(...PROBLEM_ID_KEYS.map(key => value[key]));
    const timelineProblemId = options.timelineProblem && (typeof value.problem === "string" || typeof value.problem === "number") ? value.problem : null;
    // A timeline item may wrap a full problem object under `problem`. In that
    // case its own id belongs to the timeline item, not to the problem.
        const bareId = options.allowBareId && !isPlainObject(value.problem) ? value.id : null;
    const problemId = normalizeId(firstMeaningful(explicitId, timelineProblemId, bareId));
    if (!problemId) return null;
    const problem = {
      ...value,
      problemId: problemId
    };
    const problemType = firstMeaningful(...PROBLEM_TYPE_KEYS.map(key => value[key]));
    const body = firstMeaningful(...PROBLEM_BODY_KEYS.map(key => value[key]));
    const optionsValue = firstMeaningful(...PROBLEM_OPTION_KEYS.map(key => value[key]));
    if (!isMeaningful(problem.problemType) && problemType !== void 0) problem.problemType = problemType;
    if (!isMeaningful(problem.body) && body !== void 0) problem.body = body;
    if (!isMeaningful(problem.options) && optionsValue !== void 0) problem.options = optionsValue;
    const contextSlide = isPlainObject(context.slide) ? context.slide : null;
    const embeddedSlide = isPlainObject(value.slide) ? value.slide : null;
    const slideId = firstMeaningful(value.slideId, value.slide_id, value.sid, embeddedSlide?.id, embeddedSlide?.slideId, contextSlide?.id, contextSlide?.slideId);
    let slide = embeddedSlide || contextSlide;
    if (slideId !== void 0) slide = {
      ...slide || {},
      id: slide?.id ?? slideId
    };
    const presentationId = firstMeaningful(context.presentationId, value.presentationId, value.presentation_id, value.presId, slide?.presentationId);
    return {
      problem: problem,
      slide: slide || null,
      presentationId: presentationId === void 0 ? null : String(presentationId)
    };
  }
  /**
   * Extract every problem embedded in a classroom/report payload.
   * This function is intentionally side-effect free: it never notifies, answers,
   * or creates problem status entries.
   */  function extractProblemsFromPayload(payload, context = {}) {
    const found = [];
    const seenIds = new Set;
    const basePresentationId = firstMeaningful(context?.presentationId, context?.presentation?.id);
    function add(raw, localContext = {}, options = {}) {
      const entry = normalizeProblem(raw, {
        presentationId: localContext.presentationId ?? basePresentationId,
        slide: localContext.slide
      }, options);
      if (!entry || seenIds.has(entry.problem.problemId)) return false;
      seenIds.add(entry.problem.problemId);
      found.push(entry);
      return true;
    }
    function isSlideLike(value) {
      return isPlainObject(value) && (isMeaningful(value.cover) || isMeaningful(value.coverAlt) || isMeaningful(value.image) || isMeaningful(value.slideId) || isMeaningful(value.slide_id) || value.type === "slide");
    }
    function visit(value, state = {}) {
      if (Array.isArray(value)) {
        for (const item of value) visit(item, state);
        return;
      }
      if (!isPlainObject(value)) return;
      const mode = state.mode || "nested";
      const localContext = {
        presentationId: firstMeaningful(state.presentationId, value.presentationId, value.presentation_id),
        slide: state.slide
      };
      if (mode === "timeline-list") {
        const timelineProblem = value.type === "problem";
        if (timelineProblem) add(value, localContext, {
          allowBareId: true,
          timelineProblem: true
        });
      } else if (mode === "problem" || mode === "problem-list") add(value, localContext, {
        allowBareId: true
      }); else if (PROBLEM_ID_KEYS.some(key => isMeaningful(value[key]))) add(value, localContext, {
        allowBareId: false
      });
      const childPresentationId = firstMeaningful(localContext.presentationId, value.presentationId, value.presentation_id, Array.isArray(value.slides) || Array.isArray(value.slideList) ? value.id : null);
      for (const [key, child] of Object.entries(value)) {
        if (PROBLEM_CONTAINER_KEYS.has(key)) {
          visit(child, {
            mode: "problem-list",
            presentationId: childPresentationId
          });
          continue;
        }
        if (TIMELINE_CONTAINER_KEYS.has(key)) {
          visit(child, {
            mode: "timeline-list",
            presentationId: childPresentationId
          });
          continue;
        }
        if (key === "problem") {
          if (isPlainObject(child)) visit(child, {
            mode: "problem",
            presentationId: childPresentationId,
            slide: isPlainObject(value.slide) ? value.slide : isSlideLike(value) ? value : state.slide
          }); else if (mode === "timeline-list" && value.type === "problem") add(child, localContext, {
            timelineProblem: true
          });
          continue;
        }
        visit(child, {
          mode: "nested",
          presentationId: childPresentationId,
          slide: isSlideLike(value) ? value : state.slide
        });
      }
    }
    visit(payload);
    return found;
  }
  function dispatchProblemsUpdated() {
    try {
      if (typeof window === "undefined" || typeof window.dispatchEvent !== "function") return;
      const EventCtor = typeof CustomEvent !== "undefined" ? CustomEvent : window.CustomEvent;
      if (typeof EventCtor !== "function") return;
      window.dispatchEvent(new EventCtor("ykt:problems-updated"));
    } catch {}
  }
  /**
   * Persist harvested problems without entering any realtime-only path.
   */  function harvestProblemsFromPayload(payload, repo, context = {}) {
    const entries = extractProblemsFromPayload(payload, context);
    if (!repo || entries.length === 0) return entries;
    for (const entry of entries) {
      repo.upsertProblem(entry.problem);
      repo.pushEncounteredProblem(entry.problem, entry.slide, entry.presentationId);
    }
    dispatchProblemsUpdated();
    return entries;
  }
  // src/net/xhr-interceptor.js
    const HISTORICAL_REPORT_PATH_RE$1 = /^\/api\/v3\/classroom-report\/(?:lesson\/basic-info|student\/(?:lesson-info|detail|review|ppt)|replay)\/?$/;
  function installXHRInterceptor() {
    class MyXHR extends XMLHttpRequest {
      static handlers=[];
      static addHandler(h) {
        this.handlers.push(h);
      }
      open(method, url, async) {
        const parsed = new URL(url, location.href);
        for (const h of this.constructor.handlers) h(this, method, parsed);
        return super.open(method, url, async ?? true);
      }
      intercept(cb) {
        let payload;
        const rawSend = this.send;
        this.send = body => {
          payload = body;
          return rawSend.call(this, body);
        };
        this.addEventListener("load", () => {
          try {
            cb(JSON.parse(this.responseText), payload, {
              xhr: this,
              status: this.status,
              ok: this.status >= 200 && this.status < 300
            });
          } catch {}
        });
      }
    }
    function detectEnvironmentAndAdaptAPI() {
      const hostname = location.hostname;
      if (hostname === "www.yuketang.cn") {
        console.log("[雨课堂助手][INFO] 检测到标准雨课堂环境");
        return "standard";
      }
      if (hostname === "pro.yuketang.cn") {
        console.log("[雨课堂助手][INFO] 检测到荷塘雨课堂环境");
        return "pro";
      }
      if (hostname === "changjiang.yuketang.cn") {
        console.log("[雨课堂助手][INFO] 检测到长江雨课堂环境");
        return "changjiang";
      }
      console.log("[雨课堂助手][ERR] 未知环境:", hostname);
      return "unknown";
    }
    MyXHR.addHandler((xhr, method, url) => {
      detectEnvironmentAndAdaptAPI();
      const pathname = url.pathname || "";
      console.log("[雨课堂助手][INFO] XHR请求:", method, pathname, url.search);
      // Historical report payloads are read-only for the helper: harvest and
      // display problems, but never enter the live notification/answer path.
            if (HISTORICAL_REPORT_PATH_RE$1.test(pathname)) {
        xhr.intercept((resp, _payload, meta) => {
          if (!meta?.ok) return;
          if (resp && (resp.code === 0 || resp.success === true)) harvestProblemsFromPayload(resp, repo);
        });
        return;
      }
      // 课件：精确路径或包含关键字
            if (pathname === "/api/v3/lesson/presentation/fetch" || pathname.includes("presentation") && pathname.includes("fetch")) {
        console.log("[雨课堂助手][INFO] 拦截课件请求");
        xhr.intercept((resp, _payload, meta) => {
          const id = url.searchParams.get("presentation_id");
          console.log("[雨课堂助手][INFO] 课件响应:", resp);
          if (meta?.ok && resp && (resp.code === 0 || resp.success)) actions.onPresentationLoaded(id, resp.data || resp.result);
        });
        return;
      }
      // 答题
            if (pathname === "/api/v3/lesson/problem/answer" || pathname.includes("problem") && pathname.includes("answer")) {
        console.log("[雨课堂助手][INFO] 拦截答题请求");
        xhr.intercept((resp, payload) => {
          try {
            const {problemId: problemId, result: result} = JSON.parse(payload || "{}");
            if (resp && (resp.code === 0 || resp.success)) actions.onAnswerProblem(problemId, result);
          } catch (e) {
            console.error("[雨课堂助手][ERR] 解析答题响应失败:", e);
          }
        });
        return;
      }
      if (url.pathname === "/api/v3/lesson/problem/retry") {
        xhr.intercept((resp, payload) => {
          try {
            // retry 请求体是 { problems: [{ problemId, result, ...}] }
            const body = JSON.parse(payload || "{}");
            const first = Array.isArray(body?.problems) ? body.problems[0] : null;
            if (resp?.code === 0 && first?.problemId) actions.onAnswerProblem(first.problemId, first.result);
          } catch {}
        });
        return;
      }
      if (pathname.includes("/api/")) console.log("[雨课堂助手][WARN] 其他API:", method, pathname);
    });
    gm.uw.XMLHttpRequest = MyXHR;
  }
  // ===== 自动进入课堂所需的最小 API 封装 =====
    async function getOnLesson() {
    const origin = location.origin;
    const same = p => new URL(p, origin).toString();
    const candidates = [ same("/api/v3/classroom/on-lesson"), same("/mooc-api/v1/lms/classroom/on-lesson"), same("/apiv3/classroom/on-lesson") ];
    const tries = [];
    let finalList = [];
    let lastErr = null;
    for (const url of candidates) {
      const item = {
        url: url,
        ok: false,
        status: 0,
        note: ""
      };
      try {
        const r = await fetch(url, {
          credentials: "include"
        });
        item.status = r.status;
        if (!r.ok) {
          item.note = `HTTP ${r.status}`;
          tries.push(item);
          continue;
        }
        const text = await r.text();
        // 打个缩略，避免把整段 JSON 打爆
                item.bodySnippet = text.slice(0, 300);
        let j = {};
        try {
          j = JSON.parse(text);
        } catch (_) {
          item.note = "JSON parse failed";
        }
        const list = j?.data?.onLessonClassrooms || j?.result || j?.data || [];
        item.parsedLength = Array.isArray(list) ? list.length : -1;
        if (Array.isArray(list) && list.length) {
          item.ok = true;
          tries.push(item);
          finalList = list;
          break;
        } else {
          item.note ||= "empty list";
          tries.push(item);
        }
      } catch (e) {
        item.note = e && e.message || "fetch error";
        tries.push(item);
        lastErr = e;
      }
    }
    // 调试信息
        try {
      console.groupCollapsed(`%c[getOnLesson] host=%s  result=%s  candidates=%d`, "color:#09f", location.hostname, finalList.length ? `OK(${finalList.length})` : "EMPTY", candidates.length);
      tries.forEach((t, i) => {
        console.log(`#${i + 1}`, {
          url: t.url,
          ok: t.ok,
          status: t.status,
          note: t.note,
          parsedLength: t.parsedLength,
          bodySnippet: t.bodySnippet
        });
      });
      if (!finalList.length && lastErr) console.warn("[getOnLesson] last error:", lastErr);
      console.groupEnd();
    } catch {}
    return finalList;
  }
  // src/net/xhr-interceptor.js
    async function checkinClass(lessonId, opts = {}) {
    const origin = location.origin;
    const same = p => new URL(p, origin).toString();
    const classroomId = opts?.classroomId;
    const headers = {
      "content-type": "application/json",
      xtbz: "ykt"
    };
    // 针对不同网关，使用各自的 payload 形态
        const candidates = [ {
      url: same("/api/v3/lesson/checkin"),
      payload: {
        lessonId: lessonId,
        ...classroomId ? {
          classroomId: classroomId
        } : {}
      },
      // v3: 驼峰
      name: "v3-same"
    }, {
      url: "https://pro.yuketang.cn/api/v3/lesson/checkin",
      payload: {
        lessonId: lessonId,
        ...classroomId ? {
          classroomId: classroomId
        } : {}
      },
      name: "v3-pro"
    }, {
      url: "https://www.yuketang.cn/api/v3/lesson/checkin",
      payload: {
        lessonId: lessonId,
        ...classroomId ? {
          classroomId: classroomId
        } : {}
      },
      name: "v3-www"
    }, {
      url: same("/mooc-api/v1/lms/lesson/checkin"),
      payload: {
        lesson_id: lessonId,
        ...classroomId ? {
          classroom_id: classroomId
        } : {}
      },
      // 旧网关：蛇形
      name: "mooc-same"
    }, {
      url: same("/apiv3/lesson/checkin"),
      payload: {
        lessonId: lessonId,
        ...classroomId ? {
          classroomId: classroomId
        } : {}
      },
      name: "apiv3-same"
    } ];
    const tries = [];
    let lastErr;
    for (const cand of candidates) {
      const item = {
        url: cand.url,
        name: cand.name,
        status: 0,
        note: ""
      };
      try {
        const resp = await fetch(cand.url, {
          method: "POST",
          credentials: "include",
          headers: headers,
          body: JSON.stringify(cand.payload)
        });
        item.status = resp.status;
        const text = await resp.text().catch(() => "");
        item.bodySnippet = text.slice(0, 300);
        if (!resp.ok) {
          item.note = `HTTP ${resp.status}`;
          // 如果 400/401/403，继续试下一条
                    tries.push(item);
          continue;
        }
        let data = {};
        try {
          data = JSON.parse(text);
        } catch {
          item.note = "JSON parse failed";
        }
        const token = data?.data?.lessonToken || data?.result?.lessonToken || data?.lessonToken;
        const setAuth = resp.headers.get("Set-Auth") || resp.headers.get("set-auth") || null;
        item.note = token ? "OK" : "no token in body";
        tries.push(item);
        if (token) {
          try {
            console.groupCollapsed("%c[checkinClass] OK %s", "color:#0a0", cand.name);
            console.log("payload:", cand.payload);
            console.log("setAuth:", !!setAuth);
            console.groupEnd();
          } catch {}
          return {
            token: token,
            setAuth: setAuth,
            raw: data
          };
        }
      } catch (e) {
        item.note = e.message || "fetch error";
        tries.push(item);
        lastErr = e;
      }
    }
    try {
      console.groupCollapsed("%c[checkinClass] FAILED host=%s", "color:#f33", location.hostname);
      console.log("lessonId:", lessonId, "classroomId:", classroomId);
      tries.forEach((t, i) => console.log(`#${i + 1}`, t));
      if (lastErr) console.warn("lastErr:", lastErr);
      console.groupEnd();
    } catch {}
    // 抛给上层，由上层走“直跳 lesson 页”的兜底逻辑
        throw new Error("checkinClass HTTP 400");
  }
  const ASSESSMENT_MARKERS = [ "problem", "quiz", "exam", "test", "exercise", "paper" ];
  const COURSEWARE_MARKERS = [ "presentation", "courseware", "ppt", "slide" ];
  const PUBLISH_ACTION = /^(send|publish|open|start|release)/;
  const COURSEWARE_PUBLISH_ACTION = /^(send|publish|release)/;
  const ASSESSMENT_PUBLISH_ACTION = /^(send|publish|start|release)/;
  const ENTITY_KEYS = [ "quiz", "exam", "test", "exercise", "paper", "problemGroup", "problem_group", "problem", "presentation", "courseware", "activity" ];
  const NESTED_VALUE_KEYS = [ "problem", "data", "payload", "result", "content" ];
  const ASSESSMENT_GROUP_KEYS = [ "quiz", "exam", "test", "exercise", "paper", "problemGroup", "problem_group", "problemgroup" ];
  const CONCRETE_PROBLEM_ID_KEYS = [ "problemid", "problemId", "problem_id", "prob" ];
  function normalizeOp(message) {
    return String(message?.op || message?.type || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  }
  function includesOneOf(value, markers) {
    return markers.some(marker => value.includes(marker));
  }
  function getEntity(message) {
    const queue = [ message ];
    const visited = new Set;
    let fallback = message && typeof message === "object" ? message : {};
    while (queue.length) {
      const current = queue.shift();
      if (!current || typeof current !== "object" || visited.has(current)) continue;
      visited.add(current);
      for (const key of ENTITY_KEYS) {
        const entity = current[key];
        if (entity && typeof entity === "object") return entity;
      }
      for (const key of NESTED_VALUE_KEYS) {
        const nested = current[key];
        if (nested && typeof nested === "object") {
          fallback = nested;
          if (Array.isArray(nested)) queue.push(...nested); else queue.push(nested);
        }
      }
    }
    return fallback;
  }
  function firstText(source, keys) {
    for (const key of keys) {
      const value = source?.[key];
      if (value === void 0 || value === null || typeof value === "object") continue;
      if (String(value).trim()) return String(value).trim();
    }
    return "";
  }
  function findNestedValue(source, keys) {
    const queue = [ source ];
    const visited = new Set;
    while (queue.length) {
      const current = queue.shift();
      if (!current || typeof current !== "object" || visited.has(current)) continue;
      visited.add(current);
      for (const key of keys) {
        if (!Object.prototype.hasOwnProperty.call(current, key)) continue;
        const value = current[key];
        if (value !== void 0 && value !== null) return value;
      }
      for (const key of NESTED_VALUE_KEYS) {
        const nested = current[key];
        if (Array.isArray(nested)) queue.push(...nested); else if (nested && typeof nested === "object") queue.push(nested);
      }
    }
    return;
  }
  function hasAssessmentGroup(message) {
    const group = findNestedValue(message, ASSESSMENT_GROUP_KEYS);
    return group !== void 0 && group !== null;
  }
  function findProblemValue(message, keys) {
    const problem = findNestedValue(message, [ "problem" ]);
    if (problem && typeof problem === "object") {
      const value = findNestedValue(problem, keys);
      if (value !== void 0) return value;
    }
    return findNestedValue(message, keys);
  }
  function scalarString(value) {
    if (value == null || typeof value === "object") return null;
    const text = String(value).trim();
    return text || null;
  }
  function getConcreteProblemId(message) {
    const problem = findNestedValue(message, [ "problem" ]);
    if (problem && typeof problem === "object") {
      const id = firstText(problem, [ "problemId", "problem_id", "problemid", "id", "uuid" ]);
      if (id) return id;
    }
    const explicitId = findNestedValue(message, CONCRETE_PROBLEM_ID_KEYS);
    if (explicitId !== void 0 && explicitId !== null && typeof explicitId !== "object") {
      const id = String(explicitId).trim();
      if (id) return id;
    }
    if (problem && typeof problem !== "object") {
      const id = String(problem).trim();
      if (id) return id;
    }
    return "";
  }
  function getConcreteProblemMetadata(message, op) {
    if (op.includes("problemgroup")) return null;
    if (op !== "publishproblem" && op !== "sendproblem") return null;
    // A message containing a quiz/exam/test/... entity is a group publication.
    // Even if it also carries a problem id, auto-answer must stay disabled.
        if (hasAssessmentGroup(message)) return null;
    const problem = findNestedValue(message, [ "problem" ]);
    const explicitId = findNestedValue(message, CONCRETE_PROBLEM_ID_KEYS);
    if (problem === void 0 && explicitId === void 0) return null;
    const problemId = getConcreteProblemId(message);
    if (!problemId) return null;
    const slideId = scalarString(findProblemValue(message, [ "sid", "slideId", "slide_id" ]));
    const presentationId = scalarString(findProblemValue(message, [ "pres", "presentationId", "presentation_id" ]));
    const startTime = findProblemValue(message, [ "dt", "startTime", "start_time" ]);
    const limit = findProblemValue(message, [ "limit", "duration" ]);
    const metadata = {
      problemId: problemId,
      autoAnswerCandidate: true
    };
    if (slideId) metadata.slideId = slideId;
    if (presentationId) metadata.presentationId = presentationId;
    if (startTime !== void 0 && startTime !== null && typeof startTime !== "object") metadata.startTime = startTime;
    if (limit !== void 0 && limit !== null && typeof limit !== "object") metadata.limit = limit;
    return metadata;
  }
  const IDENTIFIER_KEYS = [ "id", "uuid", "quizId", "quiz_id", "examId", "exam_id", "testId", "test_id", "exerciseId", "exercise_id", "presentationId", "presentation_id", "problemId", "problem_id", "problemid", "problem", "presentation", "activityId", "activity_id" ];
  function findNestedText(source, keys) {
    const queue = [ source ];
    const visited = new Set;
    while (queue.length) {
      const current = queue.shift();
      if (!current || typeof current !== "object" || visited.has(current)) continue;
      visited.add(current);
      const value = firstText(current, keys);
      if (value) return value;
      for (const key of NESTED_VALUE_KEYS) {
        const nested = current[key];
        if (Array.isArray(nested)) queue.push(...nested); else if (nested && typeof nested === "object") queue.push(nested);
      }
    }
    return "";
  }
  function getIdentifier(message, entity, op) {
    return firstText(entity, IDENTIFIER_KEYS) || findNestedText(message, IDENTIFIER_KEYS) || op;
  }
  function getDetail(message, entity) {
    return firstText(entity, [ "title", "name", "subject", "label", "body" ]) || firstText(message, [ "title", "name", "subject", "label" ]) || "教师发布了新的课堂内容";
  }
  function getCategory(op) {
    if (op === "unlockproblem") return null;
    if (op === "probleminfo") return "assessment";
    // 结果、关闭、展示、更新等操作同样会带 problem，不能当成新题发布。
        if (includesOneOf(op, ASSESSMENT_MARKERS)) return ASSESSMENT_PUBLISH_ACTION.test(op) ? "assessment" : null;
    // 打开旧课件、翻页等操作也会带 presentation/slide，不能误落入通用发布提醒。
        if (includesOneOf(op, COURSEWARE_MARKERS)) return COURSEWARE_PUBLISH_ACTION.test(op) ? "courseware" : null;
    if (PUBLISH_ACTION.test(op)) return "other";
    return null;
  }
  function classifyPublishEvent(message) {
    const op = normalizeOp(message);
    const category = getCategory(op);
    if (!category) return null;
    const entity = getEntity(message);
    const concreteProblem = category === "assessment" ? getConcreteProblemMetadata(message, op) : null;
    const id = concreteProblem?.problemId || getIdentifier(message, entity, op);
    const detail = getDetail(message, entity);
    const title = {
      assessment: concreteProblem ? "新题目已发布" : "考试/测试题组已发布",
      courseware: "课件已发布",
      other: "课堂内容已发布"
    }[category];
    return {
      category: category,
      dedupeKey: `${category}:${id}`,
      title: title,
      detail: detail,
      ...concreteProblem
    };
  }
  function isPublishReminderEnabled(event, config = {}) {
    if (!event?.category) return false;
    const kind = {
      assessment: "assessment-publish",
      courseware: "courseware-publish",
      other: "other-publish"
    }[event.category];
    return kind ? isReminderEnabled(kind, config) : false;
  }
  function getRealtimeEvent(message) {
    const op = normalizeOp(message);
    if (op === "fetchtimeline") return {
      kind: "timeline",
      timeline: message?.timeline
    };
    if (op === "unlockproblem") {
      const rawProblem = message?.problem;
      const problem = rawProblem && typeof rawProblem === "object" ? {
        ...message,
        ...rawProblem
      } : {
        ...message,
        prob: message?.prob ?? rawProblem ?? message?.problemid
      };
      return {
        kind: "unlockproblem",
        problem: problem
      };
    }
    if (op === "lessonfinished") return {
      kind: "lessonfinished"
    };
    const event = classifyPublishEvent(message);
    return event ? {
      kind: "publish",
      event: event
    } : null;
  }
  /**
   * Shares the short de-duplication window used by every realtime reminder.
   * Different event kinds have their own dedupe keys, so a new question cannot
   * suppress a courseware notification (or the other way around).
   */  function createEventReminder({notify: notify, isEnabled: isEnabled = () => true, now: now = () => Date.now(), dedupeMs: dedupeMs = 6e4} = {}) {
    const seenUntil = new Map;
    function prune(time) {
      for (const [key, expiresAt] of seenUntil) if (expiresAt <= time) seenUntil.delete(key);
    }
    return {
      handle(event, config) {
        if (!event || !event.dedupeKey || !isEnabled(event, config)) return false;
        const time = now();
        prune(time);
        if (seenUntil.has(event.dedupeKey)) return false;
        seenUntil.set(event.dedupeKey, time + dedupeMs);
        notify?.(event);
        return true;
      }
    };
  }
  function createPublishReminder(options = {}) {
    return createEventReminder({
      ...options,
      isEnabled: options.isEnabled || isPublishReminderEnabled
    });
  }
  // src/state/actions.js
    let _autoLoopStarted = false;
  let _autoJoinStarted = false;
  let _autoOnLessonClickStarted = false;
  let _autoOnLessonClickInProgress = false;
  let _routerHooked = false;
  const publishReminder = createPublishReminder({
    notify: event => ui.notifyPublish(event)
  });
  const problemStartReminder = createEventReminder({
    notify: event => ui.notifyClassroomEvent(event),
    isEnabled: (_event, config) => isReminderEnabled("problem-start", config)
  });
  const AUTO_ANSWER_EVENT_META = {
    "auto-answer-scheduled": [ "自动作答已排队", "脚本已为这道题安排自动作答。" ],
    "auto-answer-started": [ "自动作答开始", "脚本正在处理这道题。" ],
    "auto-answer-succeeded": [ "自动作答成功", "这道题的答案已提交。" ],
    "auto-answer-failed": [ "自动作答失败", "这道题未能完成自动作答。" ]
  };
  function firstValue(...values) {
    return values.find(value => value !== void 0 && value !== null && String(value).trim() !== "");
  }
  function notifyProblemStart(data, problem, slide) {
    const payload = data && typeof data === "object" ? data : {};
    const problemId = firstValue(problem?.problemId, problem?.id, payload.prob, payload.problemId, payload.problemid, payload.problem?.problemId, payload.problem?.id);
    const detail = problem?.body || payload.body || payload.title || payload.name || "老师已开启一道新题，请打开课堂查看。";
    return problemStartReminder.handle({
      kind: "problem-start",
      dedupeKey: `problem-start:${problemId || payload.sid || payload.dt || "unknown"}`,
      title: "习题已发布",
      nativeTitle: "雨课堂习题提示",
      detail: detail,
      problem: problem,
      slide: slide
    }, ui.config);
  }
  function notifyAutoAnswer(kind, problem, detail) {
    const [title, defaultDetail] = AUTO_ANSWER_EVENT_META[kind] || [ "自动作答提示", "自动作答状态发生变化。" ];
    return ui.notifyClassroomEvent({
      kind: kind,
      dedupeKey: `${kind}:${problem?.problemId ?? problem?.id ?? Date.now()}`,
      title: title,
      detail: detail || defaultDetail,
      problem: problem
    });
  }
  const pendingAutoAnswers = new Map;
  function autoAnswerKey(value) {
    const key = String(value ?? "").trim();
    return key || null;
  }
  function findPublishedProblemSlide(event) {
    const direct = repo.getSlide(event?.slideId);
    const problemId = autoAnswerKey(event?.problemId);
    if (direct) {
      const directProblemId = autoAnswerKey(direct?.problem?.problemId ?? direct?.problem?.id);
      if (!directProblemId || directProblemId === problemId) return direct;
    }
    if (!problemId) return null;
    for (const slide of repo.slides.values()) {
      const slideProblemId = slide?.problem?.problemId ?? slide?.problem?.id;
      if (autoAnswerKey(slideProblemId) === problemId) return slide;
    }
    for (const [presentationId, presentation] of repo.presentations) for (const slide of Array.isArray(presentation?.slides) ? presentation.slides : []) {
      const slideProblemId = slide?.problem?.problemId ?? slide?.problem?.id;
      if (autoAnswerKey(slideProblemId) !== problemId) continue;
      const found = slide.presentationId == null ? {
        ...slide,
        presentationId: presentationId
      } : slide;
      repo.upsertSlide(found);
      repo.upsertProblem(slide.problem);
      return found;
    }
    return null;
  }
  function scheduleAutoAnswer(problem, status) {
    if (!ui.config.autoAnswer || !problem || problem.result || status.done || status.answering || Number.isFinite(status.autoAnswerTime) || isDeadlineReached(status.endTime)) return null;
    const base = Math.max(0, Number(ui.config.autoAnswerDelay) || 0);
    const random = Math.max(0, Number(ui.config.autoAnswerRandomDelay) || 0);
    const delay = base + (random ? Math.floor(Math.random() * (random + 1)) : 0);
    status.autoAnswerTime = Date.now() + delay;
    notifyAutoAnswer("auto-answer-scheduled", problem, `将在约 ${Math.floor(delay / 1e3)} 秒后开始自动作答。`);
    return delay;
  }
  function processPendingAutoAnswers() {
    for (const [problemId, event] of pendingAutoAnswers) {
      const slide = findPublishedProblemSlide(event);
      const candidate = repo.getProblem(problemId) || slide?.problem;
      if (!candidate || !slide) continue;
      repo.upsertSlide(slide);
      repo.upsertProblem(candidate);
      const problem = repo.getProblem(problemId) || {
        ...candidate,
        problemId: problemId
      };
      const status = repo.getProblemStatus(problemId) || {};
      status.presentationId ??= event.presentationId ?? slide.presentationId;
      status.slideId ??= event.slideId ?? slide.id ?? slide.slideId;
      status.startTime ??= event.startTime;
      const deadline = deadlineFromLimit(event.startTime, event.limit);
      if (Number.isFinite(deadline)) status.endTime ??= deadline;
      status.done ??= !!problem.result;
      status.autoAnswerTime ??= null;
      status.answering ??= false;
      repo.setProblemStatus(problemId, status);
      const scheduled = scheduleAutoAnswer(problem, status);
      pendingAutoAnswers.delete(problemId);
      if (scheduled !== null) console.log("[雨课堂助手][INFO][Publish] 新题已加入自动作答队列:", problemId);
    }
  }
  function tickAutoAnswers() {
    processPendingAutoAnswers();
    const now = Date.now();
    for (const [problemId, status] of repo.problemStatus) {
      if (!status || typeof status !== "object") continue;
      const problem = repo.getProblem(problemId);
      if (status.done || problem?.result || isDeadlineReached(status.endTime)) {
        status.autoAnswerTime = null;
        continue;
      }
      if (!Number.isFinite(status.autoAnswerTime) || now < status.autoAnswerTime) continue;
      const slide = repo.getSlide(status.slideId);
      if (!problem || !slide) continue;
      status.autoAnswerTime = null;
      void handleAutoAnswerInternal(problem);
    }
  }
  // 无AI默认答案生成
    function makeDefaultAnswer(problem) {
    switch (problem.problemType) {
     case 1:
 // 单选
           case 2:
 // 多选
           case 3:
      // 投票
      return [ "A" ];

     case 4:
      // 填空
      // 按需求示例返回 [" 1"]（保留前导空格）
      return [ " 1" ];

     case 5:
      // 主观/问答
      return {
        content: "略",
        pics: []
      };

     default:
      // 兜底：按单选处理
      return [ "A" ];
    }
  }
  function hasActiveAIProfile(aiCfg) {
    const cfg = aiCfg || {};
    const profiles = Array.isArray(cfg.profiles) ? cfg.profiles : [];
    if (profiles.length > 0) {
      const activeId = cfg.activeProfileId;
      const p = profiles.find(x => x.id === activeId) || profiles[0];
      return !!(p && p.apiKey);
    }
    // 兼容旧版
        return !!cfg.kimiApiKey;
  }
  // 融合模式自动答题
    async function handleAutoAnswerInternal(problem) {
    const problemId = autoAnswerKey(problem?.problemId ?? problem?.id);
    if (!problemId) return;
    problem = problem?.problemId === problemId ? problem : {
      ...problem,
      problemId: problemId
    };
    const status = repo.getProblemStatus(problemId);
    if (!status || status.answering || problem.result) {
      console.log("[AutoAnswer] 跳过：", {
        hasStatus: !!status,
        answering: status?.answering,
        hasResult: !!problem.result
      });
      return;
    }
    if (isDeadlineReached(status.endTime)) {
      console.log("[雨课堂助手][WARN][AutoAnswer] 跳过：已超时");
      return;
    }
    status.answering = true;
    notifyAutoAnswer("auto-answer-started", problem);
    try {
      console.log("[雨课堂助手][INFO][AutoAnswer] =================================");
      console.log("[雨课堂助手][INFO][AutoAnswer] 开始自动答题");
      console.log("[雨课堂助手][INFO][AutoAnswer] 题目ID:", problem.problemId);
      console.log("[雨课堂助手][INFO][AutoAnswer] 题目类型:", PROBLEM_TYPE_MAP[problem.problemType]);
      console.log("[雨课堂助手][INFO][AutoAnswer] 题目内容:", problem.body?.slice(0, 50) + "...");
      if (!hasActiveAIProfile(ui.config.ai)) {
        // ✅ 无 API Key：使用本地默认答案直接提交，确保流程不中断
        const parsed = makeDefaultAnswer(problem);
        console.log("[雨课堂助手][WARN][AutoAnswer] 无 API Key，使用本地默认答案:", JSON.stringify(parsed));
        // 提交答案（根据时限自动选择 answer/retry 逻辑）
                await submitAnswer(problem, parsed, {
          startTime: status.startTime,
          endTime: status.endTime,
          forceRetry: false,
          lessonId: repo.currentLessonId,
          autoGate: false
        });
        // 更新状态与UI
                actions.onAnswerProblem(problemId, parsed);
        status.done = true;
        status.answering = false;
        notifyAutoAnswer("auto-answer-succeeded", problem, "这道题已使用本地默认答案提交。");
        ui.toast("使用默认答案完成作答（未配置 API Key）", 3e3);
        showAutoAnswerPopup(problem, "（本地默认答案：无 API Key）");
        console.log("[雨课堂助手][INFO][AutoAnswer] 默认答案提交流程结束");
        return;
 // 提前返回，避免继续走图像+AI流程
            }
      const slideId = status.slideId;
      console.log("[雨课堂助手][INFO][AutoAnswer] 题目所在幻灯片:", slideId);
      console.log("[雨课堂助手][INFO][AutoAnswer] =================================");
      console.log("[雨课堂助手][INFO][AutoAnswer] 使用融合模式分析（文本+幻灯片图片）...");
      let imageBase64 = await captureSlideImage(slideId);
      // 如果获取幻灯片图片失败，回退到DOM截图
            if (!imageBase64) {
        console.log("[雨课堂助手][WARN][AutoAnswer] 无法获取幻灯片图片，尝试使用DOM截图...");
        const fallbackImage = await captureProblemForVision();
        if (!fallbackImage) {
          status.answering = false;
          console.error("[雨课堂助手][ERR][AutoAnswer] 所有截图方法都失败");
          notifyAutoAnswer("auto-answer-failed", problem, "无法获取题目图像，已跳过自动作答。");
          return ui.toast("无法获取题目图像，跳过自动作答", 3e3);
        }
        imageBase64 = fallbackImage;
        console.log("[雨课堂助手][INFO][AutoAnswer] DOM截图成功");
      } else console.log("[雨课堂助手][INFO][AutoAnswer] 幻灯片图片获取成功");
      // 构建提示
            const hasTextInfo = problem.body && problem.body.trim();
      const textPrompt = formatProblemForVision(problem, PROBLEM_TYPE_MAP, hasTextInfo);
      // 调用 AI
            ui.toast("AI 正在分析题目...", 2e3);
      const aiAnswer = await queryAIVision(imageBase64, textPrompt, ui.config.ai);
      console.log("[雨课堂助手][INFO][AutoAnswer] AI回答:", aiAnswer);
      // 解析答案
            const parsed = parseAIAnswer(problem, aiAnswer);
      console.log("[雨课堂助手][INFO][AutoAnswer] 解析结果:", parsed);
      if (!parsed) {
        status.answering = false;
        console.error("[雨课堂助手][ERR][AutoAnswer] 解析失败，AI回答格式不正确");
        notifyAutoAnswer("auto-answer-failed", problem, "无法解析 AI 返回的答案，已跳过自动作答。");
        return ui.toast("无法解析AI答案，请检查格式", 3e3);
      }
      console.log("[雨课堂助手][INFO][AutoAnswer] 准备提交答案:", JSON.stringify(parsed));
      // 提交答案
            await submitAnswer(problem, parsed, {
        startTime: status.startTime,
        endTime: status.endTime,
        forceRetry: false,
        lessonId: repo.currentLessonId,
        autoGate: false
      });
      console.log("[雨课堂助手][INFO][AutoAnswer] 提交成功");
      // 更新状态
            actions.onAnswerProblem(problemId, parsed);
      status.done = true;
      status.answering = false;
      notifyAutoAnswer("auto-answer-succeeded", problem);
      ui.toast(`自动作答完成`, 3e3);
      showAutoAnswerPopup(problem, aiAnswer);
    } catch (e) {
      console.error("[雨课堂助手][ERR][AutoAnswer] 失败:", e);
      console.error("[雨课堂助手][ERR][AutoAnswer] 错误堆栈:", e.stack);
      status.answering = false;
      notifyAutoAnswer("auto-answer-failed", problem, `自动作答失败：${e?.message || "未知错误"}`);
      ui.toast(`自动作答失败: ${e.message}`, 4e3);
    }
  }
  function startAutoAnswerLoop() {
    if (_autoLoopStarted) return;
    _autoLoopStarted = true;
    setInterval(tickAutoAnswers, 500);
  }
  const actions = {
    onFetchTimeline(timeline, options = {}) {
      for (const piece of Array.isArray(timeline) ? timeline : []) if (piece?.type === "problem") this.onUnlockProblem(piece, options);
    },
    onPresentationLoaded(id, data) {
      repo.setPresentation(id, data);
      const pres = repo.presentations.get(id);
      const slides = Array.isArray(pres?.slides) ? pres.slides : [];
      for (const slide of slides) {
        repo.upsertSlide(slide);
        if (slide.problem) {
          repo.upsertProblem(slide.problem);
          repo.pushEncounteredProblem(slide.problem, slide, id);
        }
      }
      ui.updatePresentationList();
    },
    onUnlockProblem(data, {notificationOnly: notificationOnly = false} = {}) {
      const payload = data && typeof data === "object" ? data : {};
      const problemId = autoAnswerKey(firstValue(payload.prob, payload.problemId, payload.problemid, payload.problem?.problemId, payload.problem?.id, payload.id));
      const slideId = autoAnswerKey(firstValue(payload.sid, payload.slideId, payload.slide?.id));
      const embeddedProblem = payload.problem && typeof payload.problem === "object" ? payload.problem : null;
      const embeddedSlide = payload.slide && typeof payload.slide === "object" ? payload.slide : null;
      if (embeddedProblem) repo.upsertProblem(embeddedProblem);
      if (embeddedSlide) repo.upsertSlide(embeddedSlide);
      const problem = repo.getProblem(problemId) || embeddedProblem;
      const slide = repo.getSlide(slideId) || embeddedSlide;
      const notified = notifyProblemStart(payload, problem, slide);
      if (!notificationOnly && ui.config.autoAnswer && problemId) {
        pendingAutoAnswers.set(problemId, {
          problemId: problemId,
          slideId: slideId,
          presentationId: autoAnswerKey(firstValue(payload.pres, payload.presentationId, payload.presentation?.id)),
          startTime: firstValue(payload.dt, payload.startTime, payload.start_time),
          limit: firstValue(payload.limit, payload.duration),
          autoAnswerCandidate: true
        });
        processPendingAutoAnswers();
        ui.updateActiveProblems?.();
      }
      return notified;
    },
    onPublishEvent(event, {notificationOnly: notificationOnly = false} = {}) {
      const notified = publishReminder.handle(event, ui.config);
      if (notified) console.log("[雨课堂助手][INFO][Publish] 已提醒发布事件:", event.category, event.dedupeKey);
      const problemId = autoAnswerKey(event?.problemId);
      if (!notificationOnly && ui.config.autoAnswer && event?.autoAnswerCandidate && problemId) {
        pendingAutoAnswers.set(problemId, event);
        processPendingAutoAnswers();
        ui.updateActiveProblems?.();
      }
      return notified;
    },
    onLessonFinished() {
      return ui.notifyClassroomEvent({
        kind: "lesson-finished",
        dedupeKey: `lesson-finished:${repo.currentLessonId || Date.now()}`,
        title: "下课提示",
        detail: "当前课程已结束。"
      });
    },
    onAnswerProblem(problemId, result) {
      const key = autoAnswerKey(problemId);
      const p = repo.getProblem(key);
      if (!p) return;
      p.result = result;
      const i = repo.encounteredProblems.findIndex(entry => autoAnswerKey(entry.problemId) === key);
      if (i !== -1) repo.encounteredProblems[i].result = result;
      ui.updateProblemList();
    },
    async handleAutoAnswer(problem) {
      return handleAutoAnswerInternal(problem);
    },
    tickAutoAnswer() {
      return tickAutoAnswers();
    },
    async submit(problem, content) {
      const result = this.parseManual(problem.problemType, content);
      const pid = problem.problemId ?? problem.id;
      await submitAnswer(problem, result, {
        lessonId: repo.currentLessonId,
        autoGate: false
      });
      this.onAnswerProblem(pid, result);
    },
    parseManual(problemType, content) {
      switch (problemType) {
       case 1:
       case 2:
       case 3:
        return content.split("").sort();

       case 4:
        return content.split("\n").filter(Boolean);

       case 5:
        return {
          content: content,
          pics: []
        };

       default:
        return null;
      }
    },
    navigateTo(presId, slideId) {
      repo.currentPresentationId = presId;
      repo.currentSlideId = slideId;
      ui.updateSlideView();
      ui.showPresentationPanel(true);
    },
    launchLessonHelper() {
      const path = window.location.pathname;
      const m = path.match(/\/lesson\/fullscreen\/v3\/([^/]+)/);
      repo.currentLessonId = m ? m[1] : null;
      if (repo.currentLessonId) console.log(`[雨课堂助手][DBG] 检测到课堂页面 lessonId: ${repo.currentLessonId}`);
      if (typeof window.GM_getTab === "function" && typeof window.GM_saveTab === "function" && repo.currentLessonId) window.GM_getTab(tab => {
        tab.type = "lesson";
        tab.lessonId = repo.currentLessonId;
        window.GM_saveTab(tab);
      });
      repo.loadStoredPresentations();
      this.maybeStartAutoJoin();
      this.installRouterRearm();
      void screenWakeLock.setEnabled(ui.config.keepScreenAwake);
    },
    startAutoAnswerLoop() {
      return startAutoAnswerLoop();
    },
    // 自动进入课堂
    startAutoJoinLoop() {
      if (_autoJoinStarted) return;
      _autoJoinStarted = true;
      repo.autoJoinRunning = true;
      const loop = async () => {
        if (!repo.autoJoinRunning) return;
        try {
          const list = await getOnLesson();
          // 期望结构：每项至少含 { lessonId, status }，其中 status==1 表示正在上课
                    for (const it of list) {
            const lessonId = it.lessonId || it.lesson_id || it.id;
            const status = it.status;
            if (!lessonId || status !== 1) continue;
            if (repo.isLessonConnected(lessonId)) continue;
 // 已有连接
                        console.log("[雨课堂助手][INFO][AutoJoin] 检测到正在上课的课堂，准备进入:", lessonId);
            try {
              const {token: token, setAuth: setAuth} = await checkinClass(lessonId);
              if (!token) {
                console.warn("[雨课堂助手][WARN][AutoJoin] 未获取到 lessonToken，跳过:", lessonId);
                continue;
              }
              connectOrAttachLessonWS({
                lessonId: lessonId,
                auth: token
              });
              // 标记该课堂为“自动进入”
                            repo.markLessonAutoJoined(lessonId, true);
              if (ui.config.autoAnswerOnAutoJoin) repo.forceAutoAnswerLessons.add(lessonId);
            } catch (e) {
              console.error("[雨课堂助手][ERR][AutoJoin] 进入课堂失败:", lessonId, e);
            }
          }
        } catch (e) {
          console.error("[雨课堂助手][ERR][AutoJoin] 拉取正在上课失败:", e);
        } finally {
          setTimeout(loop, 5e3);
        }
      };
      loop();
    },
    stopAutoJoinLoop() {
      repo.autoJoinRunning = false;
    },
    /** 统一判断并启动自动加入链路（可多次调用，内部防重） */
    maybeStartAutoJoin() {
      if (!ui.config.autoJoinEnabled) return;
      this.startAutoJoinLoop();
      this.startAutoClickOnOnLessonBar();
    },
    /** 前端路由变化时，重新检查并挂载自动加入 */
    installRouterRearm() {
      if (_routerHooked) return;
      _routerHooked = true;
      const uw = gm?.uw || window.unsafeWindow || window;
      const rearm = () => {
        // 重置一次“onlesson 点击守卫”的进行中标记，避免被卡住
        _autoOnLessonClickInProgress = false;
        // 每次路由变更都尝试启动（内部有防重，所以安全）
                this.maybeStartAutoJoin();
        void screenWakeLock.sync();
      };
      const wrap = (obj, key) => {
        const orig = obj[key];
        obj[key] = function(...args) {
          const ret = orig.apply(this, args);
          try {
            rearm();
          } catch {}
          return ret;
        };
      };
      wrap(uw.history, "pushState");
      wrap(uw.history, "replaceState");
      uw.addEventListener("popstate", rearm);
      uw.addEventListener("visibilitychange", () => {
        if (!document.hidden) rearm();
      });
    },
    // ===== 自动点击“正在上课”条：无需预先拿 lesson_id，复用官方路由逻辑 =====
    startAutoClickOnOnLessonBar() {
      if (_autoOnLessonClickStarted) return;
      _autoOnLessonClickStarted = true;
      // 仅在非课堂页（首页/课表页等）生效
            if (/\/lesson\//.test(location.pathname)) return;
      const uw = gm?.uw || window.unsafeWindow || window;
      async function tryApiJumpFirst() {
        if (_autoOnLessonClickInProgress) return false;
        _autoOnLessonClickInProgress = true;
        try {
          const list = await getOnLesson();
 // ← 强化后的版本
                    const arr = Array.isArray(list) ? list : [];
          // A) 严格：status===1
                    let on = arr.find(x => x?.status === 1 && (x.lessonId || x.lesson_id || x.id));
          // B) 回退：没有严格匹配，但有 lessonId 就用第一条
                    if (!on) {
            const withId = arr.find(x => x && (x.lessonId || x.lesson_id || x.id));
            if (withId) {
              console.warn("[雨课堂助手][WARN][AutoJoin][API] 没有 status===1，但存在 lessonId，使用回退项：", {
                status: withId.status,
                keys: Object.keys(withId || {}),
                sample: withId
              });
              on = withId;
            }
          }
          if (!on) {
            // 详细日志：环境、主机、列表长度与前 3 项
            try {
              console.warn("[雨课堂助手][ERR][AutoJoin][API] EMPTY on-lesson list", {
                host: location.hostname,
                path: location.pathname,
                length: Array.isArray(list) ? list.length : -1,
                sample: Array.isArray(list) ? list.slice(0, 3) : list
              });
            } catch {}
            _autoOnLessonClickInProgress = false;
            return false;
          }
          const lessonId = on.lessonId || on.lesson_id || on.id;
          let target = null;
          if (lessonId) target = `/lesson/fullscreen/v3/${lessonId}`; else target = `/v2/web/lesson/${lessonId}`;
          if (location.pathname === target) {
            _autoOnLessonClickInProgress = false;
            return true;
          }
          // 为了少日志，先 replace 再 assign（站内有时也会 push /index）
                    history.replaceState(null, "", location.href);
          location.assign(target);
          return true;
        } catch (e) {
          console.warn("[雨课堂助手][ERR][AutoJoin][API] 跳转失败：", e, {
            host: location.hostname,
            path: location.pathname
          });
          _autoOnLessonClickInProgress = false;
          return false;
        }
      }
      function attachGuardAndTrigger(root = uw.document) {
        const bar = root.querySelector(".onlesson .jump_lesson__bar");
        if (!bar || bar.__ykt_guard_bound__) return false;
        if (_autoOnLessonClickInProgress) return false;
        bar.__ykt_guard_bound__ = true;
        console.log("[雨课堂助手][INFO][AutoJoin][DOM] 发现 onlesson 条，接管点击（捕获阶段）");
        const handler = async ev => {
          ev.preventDefault();
          ev.stopImmediatePropagation?.();
          ev.stopPropagation();
          if (_autoOnLessonClickInProgress) return;
          // 延时阶梯：考虑 WS 刚推完 banner 但接口还没更新
                    const delays = [ 0, 250, 600, 1200, 2e3, 3e3 ];
          for (const d of delays) {
            if (d) await new Promise(r => setTimeout(r, d));
            if (await tryApiJumpFirst()) return;
          }
          console.warn("[雨课堂助手][WARN][AutoJoin][DOM] on-lesson 接口仍为空，放弃本次点击");
          try {
            console.group("%c[AutoJoin][DOM] on-lesson 仍为空，放弃本次点击", "color:#f60");
            console.log("env:", {
              host: location.hostname,
              path: location.pathname,
              href: location.href
            });
            console.log("retryDelays(ms):", delays);
            console.log("hint:", "可能是域/路径不匹配、会话未带上、或 WS/接口不同步导致。请展开上方 [getOnLesson] 折叠日志查看每个候选 URL 的状态与响应片段。");
            console.groupEnd();
          } catch {}
        };
        bar.addEventListener("click", handler, {
          capture: true
        });
        // 触发一次我们自己的 click（优先进入捕获处理器）
                try {
          const W = bar.ownerDocument?.defaultView || uw;
          const ClickEvt = W.MouseEvent || uw.MouseEvent;
          bar.dispatchEvent(new ClickEvt("click", {
            bubbles: true,
            cancelable: true,
            view: W
          }));
        } catch (e) {
          // 兜底：部分环境对 MouseEvent 构造器有限制
          try {
            bar.click();
          } catch (_) {}
        }
        return true;
      }
      // A) 首选：直接 API 跳转（若此时就能拿到 on-lesson，就不必等 DOM）
            tryApiJumpFirst().then(ok => {
        if (ok) return;
        // B) DOM 渲染后接管点击
                if (attachGuardAndTrigger()) return;
        const mo = new uw.MutationObserver(() => {
          if (attachGuardAndTrigger()) {
            mo.disconnect();
            return;
          }
        });
        mo.observe(uw.document.documentElement, {
          childList: true,
          subtree: true
        });
        // setTimeout(() => mo.disconnect(), 10000);
            });
    }
  };
  // src/core/realtime-dispatch.js
  /**
   * Converts a raw realtime frame into an action call without coupling the
   * protocol parser to desktop-only behavior.  The same frame can therefore be
   * used by the /m/v2 reminder runtime without enabling auto-answer.
   */  function dispatchRealtimeMessage(message, {getRuntimeMode: getRuntimeMode = () => "desktop", handlers: handlers = {}} = {}) {
    const realtime = getRealtimeEvent(message);
    const notificationOnly = getRuntimeMode() === "mobile-reminder";
    const options = {
      notificationOnly: notificationOnly
    };
    let handled = true;
    switch (realtime?.kind) {
     case "timeline":
      handlers.onFetchTimeline?.(realtime.timeline, options);
      break;

     case "unlockproblem":
      handlers.onUnlockProblem?.(realtime.problem, options);
      break;

     case "publish":
      handlers.onPublishEvent?.(realtime.event, options);
      break;

     case "lessonfinished":
      handlers.onLessonFinished?.(options);
      break;

     default:
      handled = false;
    }
    return {
      realtime: realtime,
      notificationOnly: notificationOnly,
      handled: handled
    };
  }
  // src/net/ws-interceptor.js
    function installWSInterceptor({getRuntimeMode: getRuntimeMode = () => "desktop"} = {}) {
    // 环境识别（标准/荷塘/长江/未知），主要用于日志和后续按需适配
    function detectEnvironmentAndAdaptAPI() {
      const hostname = location.hostname;
      let envType = "unknown";
      if (hostname === "www.yuketang.cn") {
        envType = "standard";
        console.log("[雨课堂助手][INFO] 检测到标准雨课堂环境");
      } else if (hostname === "pro.yuketang.cn") {
        envType = "pro";
        console.log("[雨课堂助手][INFO] 检测到荷塘雨课堂环境");
      } else if (hostname === "changjiang.yuketang.cn") {
        envType = "changjiang";
        console.log("[雨课堂助手][INFO] 检测到长江雨课堂环境");
      } else console.log("[雨课堂助手][INFO] 未知环境:", hostname);
      return envType;
    }
    class MyWebSocket extends WebSocket {
      static handlers=[];
      static addHandler(h) {
        this.handlers.push(h);
      }
      constructor(url, protocols) {
        super(url, protocols);
        const parsed = new URL(url, location.href);
        for (const h of this.constructor.handlers) h(this, parsed);
      }
      intercept(cb) {
        const raw = this.send;
        this.send = data => {
          try {
            cb(JSON.parse(data));
          } catch {}
          return raw.call(this, data);
        };
      }
      listen(cb) {
        this.addEventListener("message", e => {
          try {
            cb(JSON.parse(e.data));
          } catch {}
        });
      }
    }
    MyWebSocket.addHandler((ws, url) => {
      const envType = detectEnvironmentAndAdaptAPI();
      console.log("[雨课堂助手][INFO] 拦截WebSocket通信 - 环境:", envType);
      console.log("[雨课堂助手][INFO] WebSocket连接尝试:", url.href);
      // 更宽松的路径匹配
            const wsPath = url.pathname || "";
      const isRainClassroomWS = wsPath === "/wsapp/" || wsPath.includes("/ws") || wsPath.includes("/websocket") || url.href.includes("websocket");
      if (!isRainClassroomWS) {
        console.log("[雨课堂助手][ERR] 非雨课堂WebSocket:", wsPath);
        return;
      }
      console.log("[雨课堂助手][INFO] 检测到雨课堂WebSocket连接:", wsPath);
      // 发送侧拦截（可用于调试）
            ws.intercept(message => {
        console.log("[雨课堂助手][INFO] WebSocket发送:", message);
      });
      // 接收侧统一分发
            ws.listen(message => {
        try {
          console.log("[雨课堂助手][INFO] WebSocket接收:", message);
          const dispatched = dispatchRealtimeMessage(message, {
            getRuntimeMode: getRuntimeMode,
            handlers: {
              onFetchTimeline(timeline, options) {
                console.log("[雨课堂助手][INFO] 收到时间线:", message.timeline);
                actions.onFetchTimeline(timeline, options);
              },
              onUnlockProblem(problem, options) {
                console.log("[雨课堂助手][INFO] 收到解锁问题:", message.problem);
                actions.onUnlockProblem(problem, options);
              },
              onPublishEvent(event, options) {
                console.log("[雨课堂助手][INFO] 收到课堂发布:", event);
                actions.onPublishEvent(event, options);
              },
              onLessonFinished(options) {
                console.log("[雨课堂助手][INFO] 课程结束");
                actions.onLessonFinished(options);
              }
            }
          });
          if (!dispatched.handled) console.log("[雨课堂助手][WARN] 未知WebSocket操作:", message.op, message);
          // 监听后端传递的url
                    const url = function findUrl(obj) {
            if (!obj || typeof obj !== "object") return null;
            if (typeof obj.url === "string") return obj.url;
            if (Array.isArray(obj)) for (const it of obj) {
              const u = findUrl(it);
              if (u) return u;
            } else for (const k in obj) {
              const v = obj[k];
              if (v && typeof v === "object") {
                const u = findUrl(v);
                if (u) return u;
              }
            }
            return null;
          }(message);
          if (url) {
            window.dispatchEvent(new CustomEvent("ykt:url-change", {
              detail: {
                url: url,
                raw: message
              }
            }));
            // 如需持久化到 repo，请取消下一行注释（确保已在 repo 定义该字段）
                        repo.currentSelectedUrl = url;
            console.debug("[雨课堂助手][INFO] 当前选择 URL:", url);
          }
        } catch (e) {
          console.debug("[雨课堂助手][ERR] 解析WebSocket消息失败", e, message);
        }
      });
    });
    gm.uw.WebSocket = MyWebSocket;
  }
  // ===== 主动为某个课堂建立/复用 WebSocket 连接 =====
    function connectOrAttachLessonWS({lessonId: lessonId, auth: auth}) {
    if (!lessonId || !auth) {
      console.warn("[雨课堂助手][WARN] 缺少 lessonId 或 auth，放弃建链");
      return null;
    }
    if (repo.isLessonConnected(lessonId)) return repo.lessonSockets.get(lessonId);
    // 根据当前域名选择 ws 地址
        const host = "wss://" + location.hostname + "/wsapp/";
    const ws = new WebSocket(host);
    ws.addEventListener("open", () => {
      try {
        const hello = {
          op: "hello",
          // userid 可选：尽力获取，获取不到也不阻断流程
          userid: getUserIdSafe(),
          role: "student",
          auth: auth,
          // 关键：lessonToken
          lessonid: lessonId
        };
        ws.send(JSON.stringify(hello));
        console.log("[雨课堂助手][INFO][AutoJoin] 已发送 hello 握手:", hello);
      } catch (e) {
        console.error("[雨课堂助手][INFO][AutoJoin] 发送 hello 失败:", e);
      }
    });
    ws.addEventListener("close", () => {
      console.log("[雨课堂助手][WARN][AutoJoin] 课堂 WS 关闭:", lessonId);
    });
    ws.addEventListener("error", e => {
      console.error("[雨课堂助手][ERR][AutoJoin] 课堂 WS 错误:", lessonId, e);
    });
    repo.markLessonConnected(lessonId, ws, auth);
    return ws;
  }
  function getUserIdSafe() {
    try {
      // 常见挂载点（不同环境可能不同）
      if (window?.YktUser?.id) return window.YktUser.id;
      if (window?.__INITIAL_STATE__?.user?.userId) return window.__INITIAL_STATE__.user.userId;
      const m = document.cookie.match(/(?:^|;\s*)user_id=(\d+)/);
      if (m) return Number(m[1]);
    } catch {}
    return;
  }
  const HISTORICAL_REPORT_PATH_RE = /^\/api\/v3\/classroom-report\/(?:lesson\/basic-info|student\/(?:lesson-info|detail|review|ppt)|replay)\/?$/;
  (function interceptFetch() {
    if (window.__YKT_FETCH_PATCHED__) return;
    window.__YKT_FETCH_PATCHED__ = true;
    const rawFetch = window.fetch;
    window.fetch = async function(...args) {
      const [input, init] = args;
      const url = typeof input === "string" ? input : input?.url || "";
      // === (1) 打印调试日志，可观察哪些接口走 fetch ===
            if (url.includes("lesson") || url.includes("slide") || url.includes("problem")) console.log("[雨课堂助手][INFO][fetch-interceptor] 捕获请求:", url);
      const resp = await rawFetch.apply(this, args);
      let pathname = "";
      try {
        pathname = new URL(url, location.href).pathname;
      } catch {}
      const isHistoricalReport = HISTORICAL_REPORT_PATH_RE.test(pathname);
      const isRelevantResponse = isHistoricalReport || url.includes("/lesson") || url.includes("/presentation") || url.includes("/slides") || url.includes("/problem");
      if (!resp.ok || !isRelevantResponse) return resp;
      try {
        const cloned = resp.clone();
        const text = await cloned.text();
        // Do not consume the original response stream.
                const json = JSON.parse(text);
        if (isHistoricalReport) harvestProblemsFromPayload(json, repo);
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
      return resp;
 // 一定要返回原始 Response
        };
    console.log("[雨课堂助手][INFO][fetch-interceptor] fetch() 已被拦截");
  })();
  var css = '/* ===== 通用 & 修复 ===== */\r\n#watermark_layer { display: none !important; visibility: hidden !important; }\r\n.hidden { display: none !important; }\r\n\r\n:root{\r\n  --ykt-z: 10000000;\r\n  --ykt-border: #ddd;\r\n  --ykt-border-strong: #ccc;\r\n  --ykt-bg: #fff;\r\n  --ykt-fg: #222;\r\n  --ykt-muted: #607190;\r\n  --ykt-accent: #1d63df;\r\n  --ykt-hover: #1e3050;\r\n  --ykt-shadow: 0 10px 30px rgba(0,0,0,.18);\r\n}\r\n\r\n/* ===== 工具栏 ===== */\r\n#ykt-helper-toolbar{\r\n  position: fixed; z-index: calc(var(--ykt-z) + 1);\r\n  left: 15px; bottom: 15px;\r\n  /* 移除固定宽度，让内容自适应 */\r\n  height: 36px; padding: 5px;\r\n  display: flex; gap: 6px; align-items: center;\r\n  background: var(--ykt-bg);\r\n  border: 1px solid var(--ykt-border-strong);\r\n  border-radius: 4px;\r\n  box-shadow: 0 1px 4px 3px rgba(0,0,0,.1);\r\n}\r\n\r\n#ykt-helper-toolbar .btn{\r\n  display: inline-block; padding: 4px; cursor: pointer;\r\n  color: var(--ykt-muted); line-height: 1;\r\n}\r\n#ykt-helper-toolbar .btn:hover{ color: var(--ykt-hover); }\r\n#ykt-helper-toolbar .btn.active{ color: var(--ykt-accent); }\r\n\r\n/* ===== 面板通用样式 ===== */\r\n.ykt-panel{\r\n  position: fixed; right: 20px; bottom: 60px;\r\n  width: 560px; max-height: 72vh; overflow: auto;\r\n  background: var(--ykt-bg); color: var(--ykt-fg);\r\n  border: 1px solid var(--ykt-border-strong); border-radius: 8px;\r\n  box-shadow: var(--ykt-shadow);\r\n  display: none; \r\n  /* 提高z-index，确保后打开的面板在最上层 */\r\n  z-index: var(--ykt-z);\r\n}\r\n.ykt-panel.visible{ \r\n  display: block; \r\n  /* 动态提升z-index */\r\n  z-index: calc(var(--ykt-z) + 10);\r\n}\r\n\r\n.panel-header{\r\n  display: flex; align-items: center; justify-content: space-between;\r\n  gap: 12px; padding: 10px 12px; border-bottom: 1px solid var(--ykt-border);\r\n}\r\n.panel-header h3{ margin: 0; font-size: 16px; font-weight: 600; }\r\n.panel-body{ padding: 10px 12px; }\r\n.close-btn{ cursor: pointer; color: var(--ykt-muted); }\r\n.close-btn:hover{ color: var(--ykt-hover); }\r\n\r\n/* ===== 设置面板 (#ykt-settings-panel) ===== */\r\n#ykt-settings-panel .settings-content{ display: flex; flex-direction: column; gap: 14px; }\r\n#ykt-settings-panel .setting-group{ border: 1px dashed var(--ykt-border); border-radius: 6px; padding: 10px; }\r\n#ykt-settings-panel .setting-group h4{ margin: 0 0 8px 0; font-size: 14px; }\r\n#ykt-settings-panel .setting-item{ display: flex; align-items: center; gap: 8px; margin: 8px 0; flex-wrap: wrap; }\r\n#ykt-settings-panel label{ font-size: 13px; }\r\n#ykt-settings-panel input[type="text"],\r\n#ykt-settings-panel input[type="number"]{\r\n  height: 30px; border: 1px solid var(--ykt-border-strong);\r\n  border-radius: 4px; padding: 0 8px; min-width: 220px;\r\n}\r\n#ykt-settings-panel small{ color: #666; }\r\n#ykt-settings-panel .setting-actions{ display: flex; gap: 8px; margin-top: 6px; }\r\n#ykt-settings-panel button{\r\n  height: 30px; padding: 0 12px; border-radius: 6px;\r\n  border: 1px solid var(--ykt-border-strong); background: #f7f8fa; cursor: pointer;\r\n}\r\n#ykt-settings-panel button:hover{ background: #eef3ff; border-color: var(--ykt-accent); }\r\n\r\n/* 自定义复选框（与手写脚本一致的视觉语义） */\r\n#ykt-settings-panel .checkbox-label{ position: relative; padding-left: 26px; cursor: pointer; user-select: none; }\r\n#ykt-settings-panel .checkbox-label input{ position: absolute; opacity: 0; cursor: pointer; height: 0; width: 0; }\r\n#ykt-settings-panel .checkbox-label .checkmark{\r\n  position: absolute; left: 0; top: 50%; transform: translateY(-50%);\r\n  height: 16px; width: 16px; border:1px solid var(--ykt-border-strong); border-radius: 3px; background: #fff;\r\n}\r\n#ykt-settings-panel .checkbox-label input:checked ~ .checkmark{\r\n  background: var(--ykt-accent); border-color: var(--ykt-accent);\r\n}\r\n#ykt-settings-panel .checkbox-label .checkmark:after{\r\n  content: ""; position: absolute; display: none;\r\n  left: 5px; top: 1px; width: 4px; height: 8px; border: solid #fff; border-width: 0 2px 2px 0; transform: rotate(45deg);\r\n}\r\n#ykt-settings-panel .checkbox-label input:checked ~ .checkmark:after{ display: block; }\r\n\r\n/* ===== AI 解答面板 (#ykt-ai-answer-panel) ===== */\r\n#ykt-ai-answer-panel .ai-question{\r\n  white-space: pre-wrap; background: #fafafa; border: 1px solid var(--ykt-border);\r\n  padding: 8px; border-radius: 6px; margin-bottom: 8px; max-height: 160px; overflow: auto;\r\n}\r\n#ykt-ai-answer-panel .ai-loading{ color: var(--ykt-accent); margin-bottom: 6px; }\r\n#ykt-ai-answer-panel .ai-error{ color: #b00020; margin-bottom: 6px; }\r\n#ykt-ai-answer-panel .ai-answer{ white-space: pre-wrap; margin-top: 4px; }\r\n#ykt-ai-answer-panel .ai-actions{ margin-top: 10px; }\r\n#ykt-ai-answer-panel .ai-actions button{\r\n  height: 30px; padding: 0 12px; border-radius: 6px;\r\n  border: 1px solid var(--ykt-border-strong); background: #f7f8fa; cursor: pointer;\r\n}\r\n#ykt-ai-answer-panel .ai-actions button:hover{ background: #eef3ff; border-color: var(--ykt-accent); }\r\n\r\n/* ===== 课件浏览面板 (#ykt-presentation-panel) ===== */\r\n#ykt-presentation-panel{ width: 900px; }\r\n#ykt-presentation-panel .panel-controls{ display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }\r\n#ykt-presentation-panel .panel-body{\r\n  display: grid; grid-template-columns: 300px 1fr; gap: 10px;\r\n}\r\n#ykt-presentation-panel .panel-left,\r\n#ykt-presentation-panel .panel-right{\r\n  display: flex;\r\n  flex-direction: column;\r\n}\r\n#ykt-presentation-panel .presentation-list{\r\n  border: 1px solid var(--ykt-border);\r\n  border-radius: 8px;\r\n  background: #fff;\r\n  padding: 10px;\r\n  box-sizing: border-box;\r\n}\r\n#ykt-presentation-panel .presentation-title{\r\n  font-weight: 600; padding: 6px 0; border-bottom: 1px solid var(--ykt-border);\r\n}\r\n#ykt-presentation-panel .slide-thumb-list{ display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 8px; }\r\n#ykt-presentation-panel .slide-thumb{\r\n  position: relative; border: 1px solid var(--ykt-border); border-radius: 6px; background: #fafafa;\r\n  min-height: 60px; display: flex; align-items: center; justify-content: center; cursor: pointer; padding: 4px; text-align: center;\r\n}\r\n#ykt-presentation-panel .slide-thumb:hover{ border-color: var(--ykt-accent); background: #eef3ff; }\r\n#ykt-presentation-panel .slide-thumb img{ max-width: 100%; max-height: 120px; object-fit: contain; display: block; }\r\n#ykt-presentation-panel .slide-thumb-placeholder{\r\n  max-width: 100%; padding: 12px 4px; color: var(--ykt-muted, #6b7280); font-size: 12px; line-height: 1.4; white-space: pre-line;\r\n}\r\n.ykt-presentation-panel .slide-index {\r\n  position: absolute; top: 4px; left: 4px; z-index: 2;               \r\n  padding: 2px 6px; border-radius: 4px; font-size: 12px; line-height: 1;\r\n  background: rgba(0, 0, 0, 0.6); color: #fff; pointer-events: none;\r\n}\r\n#ykt-presentation-panel .slide-view{\r\n  position: relative; border: 1px solid var(--ykt-border); border-radius: 8px; min-height: 360px; background: #fff; overflow: hidden;\r\n}\r\n#ykt-presentation-panel .slide-cover{ display: flex; align-items: center; justify-content: center; min-height: 360px; }\r\n#ykt-presentation-panel .slide-cover img{ max-width: 100%; max-height: 100%; object-fit: contain; display: block; }\r\n#ykt-presentation-panel .ocr-panel{\r\n  margin-top: 12px;\r\n  border: 1px solid var(--ykt-border);\r\n  border-radius: 8px;\r\n  background: #fff;\r\n  padding: 12px;\r\n}\r\n#ykt-presentation-panel .ocr-head{\r\n  display: flex;\r\n  align-items: center;\r\n  justify-content: space-between;\r\n  gap: 8px;\r\n  margin-bottom: 8px;\r\n  font-weight: 600;\r\n}\r\n#ykt-presentation-panel .ocr-status{\r\n  font-size: 12px;\r\n  color: var(--ykt-muted);\r\n}\r\n#ykt-presentation-panel .ocr-status.is-loading{ color: #a16207; }\r\n#ykt-presentation-panel .ocr-status.is-error{ color: #b42318; }\r\n#ykt-presentation-panel .ocr-status.is-success{ color: #027a48; }\r\n#ykt-presentation-panel .ocr-tip{\r\n  margin-bottom: 8px;\r\n  font-size: 12px;\r\n  color: var(--ykt-muted);\r\n}\r\n#ykt-presentation-panel .ocr-translate-bar{\r\n  display: flex;\r\n  align-items: center;\r\n  gap: 8px;\r\n  flex-wrap: wrap;\r\n  margin: 12px 0 8px;\r\n}\r\n#ykt-presentation-panel .ocr-translate-bar .ocr-status{\r\n  margin-left: auto;\r\n}\r\n#ykt-presentation-panel .ocr-target-input{\r\n  min-width: 220px;\r\n  height: 32px;\r\n  border: 1px solid var(--ykt-border-strong);\r\n  border-radius: 6px;\r\n  padding: 0 10px;\r\n  box-sizing: border-box;\r\n}\r\n#ykt-presentation-panel .ocr-subhead{\r\n  margin-top: 4px;\r\n}\r\n#ykt-presentation-panel .ocr-result{\r\n  width: 100%;\r\n  min-height: 180px;\r\n  resize: vertical;\r\n  border: 1px solid var(--ykt-border-strong);\r\n  border-radius: 6px;\r\n  padding: 10px;\r\n  line-height: 1.5;\r\n  font-size: 13px;\r\n  box-sizing: border-box;\r\n  background: #fafafa;\r\n}\r\n\r\n#ykt-presentation-panel .problem-box{\r\n  position: absolute; left: 12px; right: 12px; bottom: 12px;\r\n  background: rgba(255,255,255,.96); border: 1px solid var(--ykt-border);\r\n  border-radius: 8px; padding: 10px; box-shadow: 0 6px 18px rgba(0,0,0,.12);\r\n}\r\n#ykt-presentation-panel .problem-head{ font-weight: 600; margin-bottom: 6px; padding-right: 28px; }\r\n#ykt-presentation-panel .problem-box-close{\r\n  position: absolute; top: 6px; right: 6px;\r\n  width: 22px; height: 22px; border-radius: 999px;\r\n  border: 1px solid var(--ykt-border-strong);\r\n  background: #fff; color: #555;\r\n  cursor: pointer; font-size: 16px; line-height: 18px;\r\n  padding: 0;\r\n}\r\n#ykt-presentation-panel .problem-box-close:hover{ color: #111; border-color: var(--ykt-accent); }\r\n#ykt-presentation-panel .problem-options{ display: grid; grid-template-columns: 1fr; gap: 4px; }\r\n#ykt-presentation-panel .problem-option{ padding: 6px 8px; border: 1px solid var(--ykt-border); border-radius: 6px; background: #fafafa; }\r\n\r\n/* ===== 题目列表面板 (#ykt-problem-list-panel) ===== */\r\n#ykt-problem-list{ display: flex; flex-direction: column; gap: 10px; }\r\n#ykt-problem-list .problem-row{\r\n  border: 1px solid var(--ykt-border); border-radius: 8px; padding: 8px; background: #fafafa;\r\n}\r\n#ykt-problem-list .problem-title{ font-weight: 600; margin-bottom: 4px; }\r\n#ykt-problem-list .problem-meta{ color: #666; font-size: 12px; margin-bottom: 6px; }\r\n#ykt-problem-list .problem-actions{ display: flex; gap: 8px; align-items: center; }\r\n#ykt-problem-list .problem-actions button{\r\n  height: 28px; padding: 0 10px; border-radius: 6px; border: 1px solid var(--ykt-border-strong); background: #f7f8fa; cursor: pointer;\r\n}\r\n#ykt-problem-list .problem-actions button:hover{ background: #eef3ff; border-color: var(--ykt-accent); }\r\n#ykt-problem-list .problem-done{ color: #0a7a2f; font-weight: 600; }\r\n\r\n/* ===== 活动题目列表（右下角小卡片） ===== */\r\n#ykt-active-problems-panel.ykt-active-wrapper{\r\n  position: fixed; right: 20px; bottom: 60px; z-index: var(--ykt-z);\r\n}\r\n#ykt-active-problems{ display: flex; flex-direction: column; gap: 8px; max-height: 60vh; overflow: auto; }\r\n#ykt-active-problems .active-problem-card{\r\n  position: relative;\r\n  width: 320px; background: #fff; border: 1px solid var(--ykt-border);\r\n  border-radius: 8px; box-shadow: var(--ykt-shadow); padding: 10px;\r\n}\r\n#ykt-active-problems .ap-close{\r\n  position: absolute; top: 6px; right: 6px;\r\n  width: 20px; height: 20px; border-radius: 999px;\r\n  border: 1px solid var(--ykt-border-strong);\r\n  background: #fff; color: #555;\r\n  cursor: pointer; padding: 0; font-size: 14px; line-height: 16px;\r\n}\r\n#ykt-active-problems .ap-close:hover{ color: #111; border-color: var(--ykt-accent); }\r\n#ykt-active-problems .ap-title{ font-weight: 600; margin-bottom: 4px; }\r\n#ykt-active-problems .ap-info{ color: #666; font-size: 12px; margin-bottom: 8px; }\r\n#ykt-active-problems .ap-actions{ display: flex; gap: 8px; }\r\n#ykt-active-problems .ap-actions button{\r\n  height: 28px; padding: 0 10px; border-radius: 6px; border: 1px solid var(--ykt-border-strong); background: #f7f8fa; cursor: pointer;\r\n}\r\n#ykt-active-problems .ap-actions button:hover{ background: #eef3ff; border-color: var(--ykt-accent); }\r\n\r\n/* ===== 教程面板 (#ykt-tutorial-panel) ===== */\r\n#ykt-tutorial-panel .tutorial-content h4{ margin: 8px 0 6px; }\r\n#ykt-tutorial-panel .tutorial-content p,\r\n#ykt-tutorial-panel .tutorial-content li{ line-height: 1.5; }\r\n#ykt-tutorial-panel .tutorial-content a{ color: var(--ykt-accent); text-decoration: none; }\r\n#ykt-tutorial-panel .tutorial-content a:hover{ text-decoration: underline; }\r\n\r\n/* ===== 小屏适配 ===== */\r\n@media (max-width: 1200px){\r\n  #ykt-presentation-panel{ width: 760px; }\r\n  #ykt-presentation-panel .panel-body{ grid-template-columns: 260px 1fr; }\r\n}\r\n@media (max-width: 900px){\r\n  .ykt-panel{ right: 12px; left: 12px; width: auto; }\r\n  #ykt-presentation-panel{ width: auto; }\r\n  #ykt-presentation-panel .panel-body{ grid-template-columns: 1fr; }\r\n}\r\n\r\n/* ===== 自动作答成功弹窗 ===== */\r\n.auto-answer-popup{\r\n  position: fixed; inset: 0; z-index: calc(var(--ykt-z) + 2);\r\n  background: rgba(0,0,0,.2);\r\n  display: flex; align-items: flex-end; justify-content: flex-end;\r\n  opacity: 0; transition: opacity .18s ease;\r\n}\r\n.auto-answer-popup.visible{ opacity: 1; }\r\n\r\n.auto-answer-popup .popup-content{\r\n  width: min(560px, 96vw);\r\n  background: #fff; border: 1px solid var(--ykt-border-strong);\r\n  border-radius: 10px; box-shadow: var(--ykt-shadow);\r\n  margin: 16px; overflow: hidden;\r\n}\r\n\r\n.auto-answer-popup .popup-header{\r\n  display: flex; align-items: center; justify-content: space-between;\r\n  gap: 12px; padding: 10px 12px; border-bottom: 1px solid var(--ykt-border);\r\n}\r\n.auto-answer-popup .popup-header h4{ margin: 0; font-size: 16px; }\r\n.auto-answer-popup .close-btn{ cursor: pointer; color: var(--ykt-muted); }\r\n.auto-answer-popup .close-btn:hover{ color: var(--ykt-hover); }\r\n\r\n.auto-answer-popup .popup-body{ padding: 10px 12px; display: flex; flex-direction: column; gap: 10px; }\r\n.auto-answer-popup .popup-row{ display: grid; grid-template-columns: 56px 1fr; gap: 8px; align-items: start; }\r\n.auto-answer-popup .label{ color: #666; font-size: 12px; line-height: 1.8; }\r\n.auto-answer-popup .content{ white-space: normal; word-break: break-word; }\r\n\r\n/* ===== 1.16.6: 课件浏览面板：固定右侧详细视图，左侧独立滚动 ===== */\r\n#ykt-presentation-panel {\r\n  --ykt-panel-max-h: 72vh;           /* 与 .ykt-panel 的最大高度保持一致 */\r\n}\r\n\r\n/* 两列布局：左列表 + 右详细视图 */\r\n#ykt-presentation-panel .panel-body{\r\n  display: grid;\r\n  grid-template-columns: 300px 1fr;  \r\n  gap: 12px;\r\n  overflow: hidden;                  \r\n  align-items: start;\r\n}\r\n\r\n/* 左侧：只让左列滚动，限制在面板可视高度内 */\r\n#ykt-presentation-panel .panel-left{\r\n  max-height: var(--ykt-panel-max-h);\r\n  overflow: auto;\r\n  min-width: 0;\r\n  align-self: stretch;\r\n}\r\n\r\n/* 右侧：粘性定位为“固定”，始终在面板可视区内 */\r\n#ykt-presentation-panel .panel-right{\r\n  position: sticky;\r\n  top: 0;                            \r\n  align-self: start;\r\n  gap: 12px;\r\n}\r\n\r\n/* 右侧详细视图自身也限制高度并允许内部滚动 */\r\n#ykt-presentation-panel .slide-view{\r\n  max-height: var(--ykt-panel-max-h);\r\n  overflow: auto;\r\n  border: 1px solid var(--ykt-border);\r\n  border-radius: 8px;\r\n  background: #fff;\r\n}\r\n\r\n/* 小屏自适配：堆叠布局时取消 sticky，避免遮挡 */\r\n@media (max-width: 900px){\r\n  #ykt-presentation-panel .panel-body{\r\n    grid-template-columns: 1fr;\r\n  }\r\n  #ykt-presentation-panel .panel-right{\r\n    position: static;\r\n  }\r\n}\r\n\r\n/* 在现有样式基础上添加 */\r\n\r\n.text-status {\r\n  font-size: 12px;\r\n  padding: 4px 8px;\r\n  border-radius: 4px;\r\n  margin: 4px 0;\r\n  display: inline-block;\r\n}\r\n\r\n.text-status.success {\r\n  background-color: #d4edda;\r\n  color: #155724;\r\n  border: 1px solid #c3e6cb;\r\n}\r\n\r\n.text-status.warning {\r\n  background-color: #fff3cd;\r\n  color: #856404;\r\n  border: 1px solid #ffeaa7;\r\n}\r\n\r\n.ykt-question-display {\r\n  background: #f8f9fa;\r\n  border: 1px solid #dee2e6;\r\n  border-radius: 4px;\r\n  padding: 8px;\r\n  margin: 4px 0;\r\n  max-height: 150px;\r\n  overflow-y: auto;\r\n  font-family: monospace;\r\n  font-size: 13px;\r\n  line-height: 1.4;\r\n}\r\n\r\n/* 在现有样式基础上添加 */\r\n\r\n.ykt-custom-prompt {\r\n  width: 100%;\r\n  min-height: 60px;\r\n  padding: 8px;\r\n  border: 1px solid #ddd;\r\n  border-radius: 4px;\r\n  font-family: inherit;\r\n  font-size: 13px;\r\n  line-height: 1.4;\r\n  resize: vertical;\r\n  background-color: #fff;\r\n  transition: border-color 0.3s ease;\r\n}\r\n\r\n.ykt-custom-prompt:focus {\r\n  outline: none;\r\n  border-color: #007bff;\r\n  box-shadow: 0 0 0 2px rgba(0, 123, 255, 0.25);\r\n}\r\n\r\n.ykt-custom-prompt::placeholder {\r\n  color: #999;\r\n  font-style: italic;\r\n}\r\n\r\n.ykt-custom-prompt:empty::before {\r\n  content: attr(placeholder);\r\n  color: #999;\r\n  font-style: italic;\r\n  pointer-events: none;\r\n}\r\n\r\n/* 确保输入框在暗色主题下也能正常显示 */\r\n.ykt-panel.dark .ykt-custom-prompt {\r\n  background-color: #2d3748;\r\n  border-color: #4a5568;\r\n  color: #e2e8f0;\r\n}\r\n\r\n.ykt-panel.dark .ykt-custom-prompt::placeholder {\r\n  color: #a0aec0;\r\n}\r\n\r\n.ykt-panel.dark .ykt-custom-prompt:focus {\r\n  border-color: #63b3ed;\r\n  box-shadow: 0 0 0 2px rgba(99, 179, 237, 0.25);\r\n}\r\n\r\n/* ===== Markdown-like 样式 ===== */\r\n.ai-answer {\r\n  white-space: normal;\r\n  line-height: 1.6;\r\n  font-size: 14px;\r\n  color: inherit;\r\n}\r\n\r\n/* 段落和标题间距 */\r\n.ai-answer p { margin: 8px 0; }\r\n.ai-answer h1, .ai-answer h2, .ai-answer h3,\r\n.ai-answer h4, .ai-answer h5, .ai-answer h6 {\r\n  margin: 12px 0 6px;\r\n  line-height: 1.35;\r\n  font-weight: 600;\r\n}\r\n.ai-answer h1 { font-size: 20px; }\r\n.ai-answer h2 { font-size: 18px; }\r\n.ai-answer h3 { font-size: 16px; }\r\n.ai-answer h4 { font-size: 15px; }\r\n.ai-answer h5, .ai-answer h6 { font-size: 14px; }\r\n\r\n/* 链接 */\r\n.ai-answer a {\r\n  text-decoration: underline;\r\n  cursor: pointer;\r\n}\r\n\r\n/* 引用块 */\r\n.ai-answer blockquote {\r\n  margin: 8px 0;\r\n  padding: 6px 10px;\r\n  border-left: 3px solid rgba(0,0,0,0.2);\r\n  background: rgba(0,0,0,0.03);\r\n}\r\n\r\n/* 水平线 */\r\n.ai-answer hr {\r\n  border: 0;\r\n  border-top: 1px solid rgba(0,0,0,0.15);\r\n  margin: 10px 0;\r\n}\r\n\r\n/* 代码块与行内代码 */\r\n.ai-answer pre.ykt-md-code {\r\n  margin: 8px 0;\r\n  padding: 10px;\r\n  overflow: auto;\r\n  border: 1px solid rgba(0,0,0,0.15);\r\n  border-radius: 6px;\r\n  background: #f7f8fa;\r\n}\r\n.ai-answer pre.ykt-md-code code {\r\n  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;\r\n  font-size: 12px;\r\n}\r\n.ai-answer code.ykt-md-inline {\r\n  padding: 1px 4px;\r\n  border: 1px solid rgba(0,0,0,0.15);\r\n  border-radius: 4px;\r\n  background: #f7f8fa;\r\n  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;\r\n  font-size: 12px;\r\n}\r\n\r\n/* 列表 */\r\n.ai-answer ul, .ai-answer ol {\r\n  margin: 6px 0 6px 22px;   \r\n}\r\n.ai-answer ul { list-style: disc; }\r\n.ai-answer ol { list-style: decimal; }\r\n\r\n/* 表格 */\r\n.ai-answer table {\r\n  border-collapse: collapse;\r\n  margin: 8px 0;\r\n  width: 100%;\r\n  max-width: 100%;\r\n}\r\n.ai-answer th, .ai-answer td {\r\n  border: 1px solid rgba(0,0,0,0.15);\r\n  padding: 6px 8px;\r\n  text-align: left;\r\n}\r\n.ai-answer thead th {\r\n  background: rgba(0,0,0,0.05);\r\n  font-weight: 600;\r\n}\r\n\r\n/* 适配深色 */\r\n@media (prefers-color-scheme: dark) {\r\n  .ai-answer blockquote {\r\n    border-left-color: rgba(255,255,255,0.35);\r\n    background: rgba(255,255,255,0.06);\r\n  }\r\n  .ai-answer pre.ykt-md-code,\r\n  .ai-answer code.ykt-md-inline {\r\n    background: #111418;\r\n    border-color: rgba(255,255,255,0.2);\r\n  }\r\n  .ai-answer hr { border-top-color: rgba(255,255,255,0.2); }\r\n  .ai-answer th, .ai-answer td { border-color: rgba(255,255,255,0.2); }\r\n  .ai-answer thead th { background: rgba(255,255,255,0.08); }\r\n}\r\n\r\n#ykt-ai-answer.tex-enabled svg { vertical-align: middle; }\r\n#ykt-ai-answer.tex-enabled .MathJax { line-height: 1; }\r\n#ykt-ai-answer .mjx-svg { color: currentColor; }\r\n';
  // src/ui/styles.js
    function injectStyles() {
    gm.addStyle(css);
  }
  // src/ui/toolbar.js
    function installToolbar() {
    // 仅创建容器与按钮；具体面板之后用 HTML/Vue 接入
    const bar = document.createElement("div");
    bar.id = "ykt-helper-toolbar";
    bar.innerHTML = `\n    <span id="ykt-btn-bell" class="btn" title="习题提醒"><i class="fas fa-bell"></i></span>\n    <span id="ykt-btn-pres" class="btn" title="课件浏览"><i class="fas fa-file-powerpoint"></i></span>\n    <span id="ykt-btn-ai" class="btn" title="AI解答"><i class="fas fa-robot"></i></span>\n    <span id="ykt-btn-auto-answer" class="btn" title="自动作答"><i class="fas fa-magic-wand-sparkles"></i></span>\n    <span id="ykt-btn-settings" class="btn" title="设置"><i class="fas fa-cog"></i></span>\n    <span id="ykt-btn-help" class="btn" title="使用教程"><i class="fas fa-question-circle"></i></span>\n  `;
    document.body.appendChild(bar);
    // 初始激活态
        if (ui.config.notifyProblems) bar.querySelector("#ykt-btn-bell")?.classList.add("active");
    ui.updateAutoAnswerBtn();
    // 事件绑定
        bar.querySelector("#ykt-btn-bell")?.addEventListener("click", () => {
      ui.config.notifyProblems = !ui.config.notifyProblems;
      ui.saveConfig();
      ui.toast(`习题提醒：${ui.config.notifyProblems ? "开" : "关"}`);
      bar.querySelector("#ykt-btn-bell")?.classList.toggle("active", ui.config.notifyProblems);
    });
    // 课件浏览按钮
        bar.querySelector("#ykt-btn-pres")?.addEventListener("click", () => {
      const btn = bar.querySelector("#ykt-btn-pres");
      const isActive = btn.classList.contains("active");
      ui.showPresentationPanel?.(!isActive);
      btn.classList.toggle("active", !isActive);
    });
    // AI按钮
        bar.querySelector("#ykt-btn-ai")?.addEventListener("click", () => {
      const btn = bar.querySelector("#ykt-btn-ai");
      const isActive = btn.classList.contains("active");
      ui.showAIPanel?.(!isActive);
      btn.classList.toggle("active", !isActive);
    });
    bar.querySelector("#ykt-btn-auto-answer")?.addEventListener("click", () => {
      ui.config.autoAnswer = !ui.config.autoAnswer;
      ui.saveConfig();
      ui.toast(`自动作答：${ui.config.autoAnswer ? "开" : "关"}`);
      ui.updateAutoAnswerBtn();
    });
    bar.querySelector("#ykt-btn-settings")?.addEventListener("click", () => {
      ui.toggleSettingsPanel?.();
    });
    bar.querySelector("#ykt-btn-help")?.addEventListener("click", () => {
      ui.toggleTutorialPanel?.();
    });
  }
  // src/core/runtime-mode.js
    function isMobileReminderPath(pathname = "") {
    return /^\/m\/v2(?:\/|$)/.test(String(pathname));
  }
  /** Mobile /m/v2 only monitors classroom events; it never starts auto-answer. */  function getRuntimeMode(pathname = "") {
    return isMobileReminderPath(pathname) ? "mobile-reminder" : "desktop";
  }
  /** Root URLs are redirect entry points, not a full desktop runtime yet. */  function shouldStartDesktopRuntime(pathname = "") {
    const normalizedPath = String(pathname);
    return normalizedPath !== "/" && normalizedPath !== "" && getRuntimeMode(normalizedPath) === "desktop";
  }
  // src/ui/mobile-reminder-panel.js
    let mounted = false;
  let root = null;
  function optionRow(option) {
    return `\n    <label class="ykt-mobile-reminder-row">\n      <span class="ykt-mobile-reminder-copy">\n        <strong>${option.label}</strong>\n        <small>${option.detail}</small>\n      </span>\n      <input type="checkbox" data-reminder-field="${option.key}" />\n    </label>`;
  }
  function installStyles() {
    if (document.getElementById("ykt-mobile-reminder-styles")) return;
    const style = document.createElement("style");
    style.id = "ykt-mobile-reminder-styles";
    style.textContent = `\n    #ykt-mobile-reminder-root { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }\n    #ykt-mobile-reminder-toggle {\n      position: fixed; right: 16px; bottom: 22px; z-index: 2147483000;\n      width: 52px; height: 52px; border: 0; border-radius: 50%;\n      background: #1368d5; color: #fff; box-shadow: 0 8px 22px rgba(0, 61, 153, .36);\n      font-size: 23px; line-height: 1; touch-action: manipulation;\n    }\n    #ykt-mobile-reminder-sheet {\n      position: fixed; inset: auto 0 0; z-index: 2147483001;\n      max-height: min(82vh, 760px); overflow: auto; box-sizing: border-box;\n      padding: 16px 16px calc(18px + env(safe-area-inset-bottom));\n      background: #f8fbff; color: #16304e; border-radius: 18px 18px 0 0;\n      box-shadow: 0 -12px 30px rgba(5, 42, 89, .22);\n      transform: translateY(105%); transition: transform .18s ease-out;\n      visibility: hidden;\n    }\n    #ykt-mobile-reminder-root.ykt-mobile-reminder-open #ykt-mobile-reminder-sheet {\n      transform: translateY(0); visibility: visible;\n    }\n    .ykt-mobile-reminder-header { display: flex; gap: 12px; align-items: flex-start; margin-bottom: 12px; }\n    .ykt-mobile-reminder-header > div { flex: 1; }\n    .ykt-mobile-reminder-header p { margin: 3px 0 0; color: #5e7189; font-size: 12px; line-height: 1.45; }\n    .ykt-mobile-reminder-eyebrow { color: #1368d5; font-weight: 700; font-size: 11px; letter-spacing: .08em; }\n    .ykt-mobile-reminder-header h2 { margin: 1px 0 0; font-size: 20px; color: #102a46; }\n    .ykt-mobile-reminder-close { border: 0; background: transparent; font-size: 26px; color: #5d6c7c; padding: 0 4px; }\n    .ykt-mobile-reminder-section { margin: 13px 0; border: 1px solid #d7e4f5; border-radius: 12px; overflow: hidden; background: #fff; }\n    .ykt-mobile-reminder-section h3 { margin: 0; padding: 10px 12px; color: #254767; background: #eff6ff; font-size: 13px; }\n    .ykt-mobile-reminder-row { display: flex; align-items: center; gap: 12px; padding: 11px 12px; border-top: 1px solid #edf2f8; }\n    .ykt-mobile-reminder-row:first-of-type { border-top: 0; }\n    .ykt-mobile-reminder-copy { flex: 1; min-width: 0; }\n    .ykt-mobile-reminder-copy strong { display: block; font-size: 14px; font-weight: 650; }\n    .ykt-mobile-reminder-copy small { display: block; margin-top: 3px; color: #687a8e; font-size: 11px; line-height: 1.35; }\n    .ykt-mobile-reminder-row input[type="checkbox"] { width: 20px; height: 20px; accent-color: #1368d5; flex: 0 0 auto; }\n    .ykt-mobile-reminder-number { display: flex; align-items: center; gap: 10px; padding: 11px 12px; border-top: 1px solid #edf2f8; font-size: 13px; }\n    .ykt-mobile-reminder-number label { flex: 1; }\n    .ykt-mobile-reminder-number input { width: 72px; border: 1px solid #c6d7ec; border-radius: 8px; padding: 7px; font-size: 14px; }\n    .ykt-mobile-reminder-actions { display: flex; gap: 8px; margin-top: 14px; }\n    .ykt-mobile-reminder-actions button { flex: 1; min-height: 42px; border-radius: 10px; font-size: 14px; font-weight: 650; }\n    #ykt-mobile-reminder-close-sheet { border: 0; background: #1368d5; color: #fff; }\n    #ykt-mobile-reminder-status { min-height: 18px; margin: 8px 2px 0; color: #64778c; font-size: 11px; }\n    @media (prefers-reduced-motion: reduce) {\n      #ykt-mobile-reminder-sheet { transition: none; }\n    }\n  `;
    document.head.appendChild(style);
  }
  function mountMobileReminderPanel() {
    if (mounted) return root;
    installStyles();
    root = document.createElement("div");
    root.id = "ykt-mobile-reminder-root";
    root.innerHTML = `\n    <button id="ykt-mobile-reminder-toggle" type="button" aria-label="打开课堂提醒控制" aria-expanded="false">🔔</button>\n    <section id="ykt-mobile-reminder-sheet" aria-label="课堂提醒控制">\n      <header class="ykt-mobile-reminder-header">\n        <div>\n          <div class="ykt-mobile-reminder-eyebrow">CLASSROOM SIGNAL</div>\n          <h2>提醒控制</h2>\n          <p>手机版只监听课堂事件，不会启动自动作答或自动进入课堂。</p>\n        </div>\n        <button class="ykt-mobile-reminder-close" type="button" aria-label="关闭提醒控制">×</button>\n      </header>\n      <div class="ykt-mobile-reminder-section">\n        <label class="ykt-mobile-reminder-row">\n          <span class="ykt-mobile-reminder-copy">\n            <strong>总提醒开关</strong>\n            <small>关闭后，下面的所有课堂事件都不会提醒。</small>\n          </span>\n          <input type="checkbox" data-reminder-field="notifyProblems" />\n        </label>\n      </div>\n      <div class="ykt-mobile-reminder-section">\n        <h3>提醒事件</h3>\n        ${REMINDER_EVENT_OPTIONS.map(optionRow).join("")}\n      </div>\n      <div class="ykt-mobile-reminder-section">\n        <h3>提醒方式</h3>\n        ${REMINDER_CHANNEL_OPTIONS.map(optionRow).join("")}\n        <div class="ykt-mobile-reminder-number">\n          <label for="ykt-mobile-reminder-duration">页面弹窗停留（秒）</label>\n          <input id="ykt-mobile-reminder-duration" type="number" min="2" max="60" inputmode="numeric" />\n        </div>\n        <div class="ykt-mobile-reminder-number">\n          <label for="ykt-mobile-reminder-volume">提示音量（0–100）</label>\n          <input id="ykt-mobile-reminder-volume" type="number" min="0" max="100" inputmode="numeric" />\n        </div>\n      </div>\n      <div class="ykt-mobile-reminder-section">\n        <h3>课堂运行</h3>\n        <label class="ykt-mobile-reminder-row">\n          <span class="ykt-mobile-reminder-copy">\n            <strong>课堂保持亮屏</strong>\n            <small>仅防自动熄屏；锁屏、后台冻结和系统省电策略无法由脚本绕过。</small>\n          </span>\n          <input id="ykt-mobile-reminder-wake-lock" type="checkbox" />\n        </label>\n      </div>\n      <div class="ykt-mobile-reminder-actions">\n        <button id="ykt-mobile-reminder-close-sheet" type="button">完成</button>\n      </div>\n      <div id="ykt-mobile-reminder-status" role="status"></div>\n    </section>`;
    document.body.appendChild(root);
    const $toggle = root.querySelector("#ykt-mobile-reminder-toggle");
    const $sheet = root.querySelector("#ykt-mobile-reminder-sheet");
    const $close = root.querySelector(".ykt-mobile-reminder-close");
    const $closeSheet = root.querySelector("#ykt-mobile-reminder-close-sheet");
    const $status = root.querySelector("#ykt-mobile-reminder-status");
    const $duration = root.querySelector("#ykt-mobile-reminder-duration");
    const $volume = root.querySelector("#ykt-mobile-reminder-volume");
    const $wakeLock = root.querySelector("#ykt-mobile-reminder-wake-lock");
    const reminderFields = Object.fromEntries([ ...root.querySelectorAll("[data-reminder-field]") ].map(field => [ field.dataset.reminderField, field ]));
    const setOpen = next => {
      root.classList.toggle("ykt-mobile-reminder-open", next);
      $toggle.setAttribute("aria-expanded", String(next));
      if (next) sync();
    };
    const showWakeLockStatus = status => {
      if (!$wakeLock.checked) $status.textContent = "设置已保存。"; else if (status.reason === "active") $status.textContent = "已请求保持亮屏。"; else if (status.reason === "unsupported") $status.textContent = "当前浏览器不支持保持亮屏。"; else if (status.reason === "request-failed") $status.textContent = "系统未允许保持亮屏，请检查浏览器或省电设置。"; else $status.textContent = "设置已保存；页面可见时会尝试保持亮屏。";
    };
    const save = async () => {
      Object.assign(ui.config, readReminderForm(reminderFields));
      ui.config.notifyPopupDuration = Math.max(2e3, (+$duration.value || 0) * 1e3);
      ui.config.notifyVolume = Math.max(0, Math.min(1, (+$volume.value || 0) / 100));
      ui.config.keepScreenAwake = !!$wakeLock.checked;
      ui.saveConfig();
      const wakeLockStatus = await screenWakeLock.setEnabled(ui.config.keepScreenAwake);
      showWakeLockStatus(wakeLockStatus);
    };
    const sync = () => {
      syncReminderForm(reminderFields, ui.config);
      $duration.value = Math.floor((ui.config.notifyPopupDuration || 5e3) / 1e3);
      $volume.value = Math.round(100 * (ui.config.notifyVolume ?? .6));
      $wakeLock.checked = !!ui.config.keepScreenAwake;
      $status.textContent = "每项修改会自动保存。";
    };
    $toggle.addEventListener("click", () => setOpen(!root.classList.contains("ykt-mobile-reminder-open")));
    $close.addEventListener("click", () => setOpen(false));
    $closeSheet.addEventListener("click", () => setOpen(false));
    $sheet.addEventListener("change", () => {
      void save();
    });
    sync();
    mounted = true;
    return root;
  }
  // src/index.js
    function loadFA() {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css";
    document.head.appendChild(link);
  }
  let desktopStarted = false;
  let mobileReminderStarted = false;
  let runtimeBootQueued = false;
  function startDesktopRuntime() {
    if (desktopStarted) return;
    desktopStarted = true;
    loadFA();
    injectStyles();
    ui._mountAll?.();
    installXHRInterceptor();
    installToolbar();
    actions.startAutoAnswerLoop();
    actions.launchLessonHelper();
  }
  function startMobileReminderRuntime() {
    if (mobileReminderStarted) return;
    mobileReminderStarted = true;
    mountMobileReminderPanel();
    void screenWakeLock.setEnabled(ui.config.keepScreenAwake);
    console.log("[雨课堂助手][INFO] 已启动 /m/v2 手机版仅提醒模式");
  }
  function bootCurrentRuntime() {
    const pathname = window.location.pathname;
    const mode = getRuntimeMode(pathname);
    if (mode === "mobile-reminder") {
      startMobileReminderRuntime();
      return;
    }
    // 根地址只是站点的跳转入口。等待它进入实际路由，避免手机被重定向到
    // /m/v2 时先启动桌面的自动作答和完整面板。
        if (shouldStartDesktopRuntime(pathname)) startDesktopRuntime();
  }
  function queueRuntimeBoot() {
    if (runtimeBootQueued) return;
    runtimeBootQueued = true;
    const run = () => {
      runtimeBootQueued = false;
      bootCurrentRuntime();
    };
    if (document.body) Promise.resolve().then(run); else document.addEventListener("DOMContentLoaded", run, {
      once: true
    });
  }
  function installRuntimeRouteWatcher() {
    const target = gm.uw || window;
    const history = target.history;
    for (const key of [ "pushState", "replaceState" ]) {
      const original = history?.[key];
      if (typeof original !== "function") continue;
      history[key] = function(...args) {
        const result = original.apply(this, args);
        queueRuntimeBoot();
        return result;
      };
    }
    target.addEventListener?.("popstate", queueRuntimeBoot);
    target.addEventListener?.("hashchange", queueRuntimeBoot);
  }
  (function main() {
    // WebSocket needs to be patched at document-start.  Its mode callback is
    // evaluated for every received frame, so a root URL redirect to /m/v2 is
    // safe without a second page refresh.
    installWSInterceptor({
      getRuntimeMode: () => getRuntimeMode(window.location.pathname)
    });
    installRuntimeRouteWatcher();
    queueRuntimeBoot();
  })();
})();
