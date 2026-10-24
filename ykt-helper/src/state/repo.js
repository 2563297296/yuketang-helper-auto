// src/state/repo.js
import { storage } from '../core/storage.js';

function problemKey(value) {
  const key = String(value ?? '').trim();
  return key || null;
}

function isMeaningfulValue(value) {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') return value.trim() !== '';
  if (Array.isArray(value)) return value.length > 0;
  if (value instanceof Date) return true;
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return true;
}

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function mergeSparseObject(base, patch) {
  const result = isPlainObject(base) ? { ...base } : {};
  if (!isPlainObject(patch)) return result;

  for (const [key, value] of Object.entries(patch)) {
    if (!isMeaningfulValue(value)) continue;
    const current = result[key];

    if (key === 'status' && isPlainObject(current) && isPlainObject(value)) {
      const status = { ...current };
      for (const [statusKey, statusValue] of Object.entries(value)) {
        if (isMeaningfulValue(statusValue)) status[statusKey] = statusValue;
      }
      result[key] = status;
      continue;
    }

    if (isPlainObject(current) && isPlainObject(value)) {
      result[key] = mergeSparseObject(current, value);
    } else {
      result[key] = value;
    }
  }

  return result;
}

export const repo = {
  presentations: new Map(), // id -> presentation
  slides: new Map(),        // slideId -> slide
  problems: new Map(),      // problemId -> problem
  problemStatus: new Map(), // problemId -> {presentationId, slideId, startTime, endTime, done, autoAnswerTime, answering}
  encounteredProblems: [],  // [{problemId, ...ref}]

  currentPresentationId: null,
  currentSlideId: null,
  currentLessonId: null,
  currentSelectedUrl: null,

  // 按课程分组存储课件
  setPresentation(id, data) {
    this.presentations.set(id, { id, ...data });
    const key = this.currentLessonId ? `presentations-${this.currentLessonId}` : 'presentations';
    storage.alterMap(key, (m) => {
      m.set(id, data);
      // 仍然做容量裁剪
      const max = (storage.get('config', {})?.maxPresentations ?? 5);
      const excess = m.size - max;
      if (excess > 0) [...m.keys()].slice(0, excess).forEach(k => m.delete(k));
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
    const normalized = { ...prob, problemId: key };
    const current = this.problems.get(key);
    this.problems.set(key, current ? mergeSparseObject(current, normalized) : normalized);
    return true;
  },
  getSlide(id) { return this.slides.get(problemKey(id)); },
  hasSlide(id) { return this.slides.has(problemKey(id)); },
  getProblem(id) { return this.problems.get(problemKey(id)); },
  hasProblem(id) { return this.problems.has(problemKey(id)); },
  getProblemStatus(id) { return this.problemStatus.get(problemKey(id)); },
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
      slide,
      presentationId,
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
      answers: incoming.answers || [],
    });
    return true;
  },
  // === 自动进入课堂所需的多“线程”（多课堂）状态 ===
  listeningLessons: new Set(),      // lessonId 的集合，表示已经建立WS监听
  lessonTokens: new Map(),          // lessonId -> lessonToken（/lesson/checkin 返回）
  lessonSockets: new Map(),         // lessonId -> WebSocket 实例
  autoJoinRunning: false,           // 轮询开关
  autoJoinedLessons: new Set(),     // 被“自动进入”的课堂集合（仅标记自动进入建立的连接）
  forceAutoAnswerLessons: new Set(),// 若需要，可以对某些课强制视为“自动答题开启”

  // 载入本课（按课程分组）在本地存储过的课件
  loadStoredPresentations() {
    if (!this.currentLessonId) return;
    const key = `presentations-${this.currentLessonId}`;
    const stored = storage.getMap(key);
    for (const [id, data] of stored.entries()) {
      this.setPresentation(id, data);
    }
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
    if (enabled) this.autoJoinedLessons.add(lessonId);
    else this.autoJoinedLessons.delete(lessonId);
  },
};
