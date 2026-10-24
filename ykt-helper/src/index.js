// src/index.js
import { installWSInterceptor } from './net/ws-interceptor.js';
import { installXHRInterceptor } from './net/xhr-interceptor.js';
import  './net/fetch-interceptor.js';
import { injectStyles } from './ui/styles.js';
import { installToolbar } from './ui/toolbar.js';
import { actions } from './state/actions.js';
import { ui } from './ui/ui-api.js'; 
import { gm } from './core/env.js';
import { getRuntimeMode, shouldStartDesktopRuntime } from './core/runtime-mode.js';
import { screenWakeLock } from './core/screen-wake-lock.js';
import { mountMobileReminderPanel } from './ui/mobile-reminder-panel.js';

function loadFA() {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css';
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
  console.log('[雨课堂助手][INFO] 已启动 /m/v2 手机版仅提醒模式');
}

function bootCurrentRuntime() {
  const pathname = window.location.pathname;
  const mode = getRuntimeMode(pathname);
  if (mode === 'mobile-reminder') {
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
  if (document.body) {
    Promise.resolve().then(run);
  } else {
    document.addEventListener('DOMContentLoaded', run, { once: true });
  }
}

function installRuntimeRouteWatcher() {
  const target = gm.uw || window;
  const history = target.history;
  for (const key of ['pushState', 'replaceState']) {
    const original = history?.[key];
    if (typeof original !== 'function') continue;
    history[key] = function (...args) {
      const result = original.apply(this, args);
      queueRuntimeBoot();
      return result;
    };
  }
  target.addEventListener?.('popstate', queueRuntimeBoot);
  target.addEventListener?.('hashchange', queueRuntimeBoot);
}

(function main() {
  // WebSocket needs to be patched at document-start.  Its mode callback is
  // evaluated for every received frame, so a root URL redirect to /m/v2 is
  // safe without a second page refresh.
  installWSInterceptor({
    getRuntimeMode: () => getRuntimeMode(window.location.pathname),
  });
  installRuntimeRouteWatcher();
  queueRuntimeBoot();
})();
