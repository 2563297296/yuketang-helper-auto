import { REMINDER_DEFAULTS, isReminderEnabled } from './reminder-preferences.js';

const ASSESSMENT_MARKERS = ['problem', 'quiz', 'exam', 'test', 'exercise', 'paper'];
const COURSEWARE_MARKERS = ['presentation', 'courseware', 'ppt', 'slide'];
const PUBLISH_ACTION = /^(send|publish|open|start|release)/;
const COURSEWARE_PUBLISH_ACTION = /^(send|publish|release)/;
const ASSESSMENT_PUBLISH_ACTION = /^(send|publish|start|release)/;
const ENTITY_KEYS = [
  'quiz', 'exam', 'test', 'exercise', 'paper', 'problemGroup', 'problem_group',
  'problem', 'presentation', 'courseware', 'activity',
];
const NESTED_VALUE_KEYS = ['problem', 'data', 'payload', 'result', 'content'];
const ASSESSMENT_GROUP_KEYS = [
  'quiz', 'exam', 'test', 'exercise', 'paper',
  'problemGroup', 'problem_group', 'problemgroup',
];
const CONCRETE_PROBLEM_ID_KEYS = [
  'problemid', 'problemId', 'problem_id', 'prob',
];

// 保留导出，避免其他脚本依赖旧名称；真实配置集中在 reminder-preferences。
export const PUBLISH_REMINDER_DEFAULTS = {
  notifyAssessmentPublishes: REMINDER_DEFAULTS.notifyAssessmentPublishes,
  notifyCoursewarePublishes: REMINDER_DEFAULTS.notifyCoursewarePublishes,
  notifyOtherPublishes: REMINDER_DEFAULTS.notifyOtherPublishes,
};

function normalizeOp(message) {
  return String(message?.op || message?.type || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function includesOneOf(value, markers) {
  return markers.some(marker => value.includes(marker));
}

function getEntity(message) {
  const queue = [message];
  const visited = new Set();
  let fallback = message && typeof message === 'object' ? message : {};

  while (queue.length) {
    const current = queue.shift();
    if (!current || typeof current !== 'object' || visited.has(current)) continue;
    visited.add(current);

    for (const key of ENTITY_KEYS) {
      const entity = current[key];
      if (entity && typeof entity === 'object') return entity;
    }

    for (const key of NESTED_VALUE_KEYS) {
      const nested = current[key];
      if (nested && typeof nested === 'object') {
        fallback = nested;
        if (Array.isArray(nested)) queue.push(...nested);
        else queue.push(nested);
      }
    }
  }

  return fallback;
}

function firstText(source, keys) {
  for (const key of keys) {
    const value = source?.[key];
    if (value === undefined || value === null || typeof value === 'object') continue;
    if (String(value).trim()) return String(value).trim();
  }
  return '';
}

function findNestedValue(source, keys) {
  const queue = [source];
  const visited = new Set();

  while (queue.length) {
    const current = queue.shift();
    if (!current || typeof current !== 'object' || visited.has(current)) continue;
    visited.add(current);

    for (const key of keys) {
      if (!Object.prototype.hasOwnProperty.call(current, key)) continue;
      const value = current[key];
      if (value !== undefined && value !== null) return value;
    }

    for (const key of NESTED_VALUE_KEYS) {
      const nested = current[key];
      if (Array.isArray(nested)) queue.push(...nested);
      else if (nested && typeof nested === 'object') queue.push(nested);
    }
  }

  return undefined;
}

function hasAssessmentGroup(message) {
  const group = findNestedValue(message, ASSESSMENT_GROUP_KEYS);
  return group !== undefined && group !== null;
}

function findProblemValue(message, keys) {
  const problem = findNestedValue(message, ['problem']);
  if (problem && typeof problem === 'object') {
    const value = findNestedValue(problem, keys);
    if (value !== undefined) return value;
  }
  return findNestedValue(message, keys);
}

function scalarString(value) {
  if (value == null || typeof value === 'object') return null;
  const text = String(value).trim();
  return text || null;
}

function getConcreteProblemId(message) {
  const problem = findNestedValue(message, ['problem']);
  if (problem && typeof problem === 'object') {
    const id = firstText(problem, [
      'problemId', 'problem_id', 'problemid', 'id', 'uuid',
    ]);
    if (id) return id;
  }

  const explicitId = findNestedValue(message, CONCRETE_PROBLEM_ID_KEYS);
  if (
    explicitId !== undefined &&
    explicitId !== null &&
    typeof explicitId !== 'object'
  ) {
    const id = String(explicitId).trim();
    if (id) return id;
  }

  if (problem && typeof problem !== 'object') {
    const id = String(problem).trim();
    if (id) return id;
  }

  return '';
}

function getConcreteProblemMetadata(message, op) {
  if (op.includes('problemgroup')) return null;
  if (op !== 'publishproblem' && op !== 'sendproblem') return null;
  // A message containing a quiz/exam/test/... entity is a group publication.
  // Even if it also carries a problem id, auto-answer must stay disabled.
  if (hasAssessmentGroup(message)) return null;

  const problem = findNestedValue(message, ['problem']);
  const explicitId = findNestedValue(message, CONCRETE_PROBLEM_ID_KEYS);
  if (problem === undefined && explicitId === undefined) return null;

  const problemId = getConcreteProblemId(message);
  if (!problemId) return null;

  const slideId = scalarString(findProblemValue(message, ['sid', 'slideId', 'slide_id']));
  const presentationId = scalarString(findProblemValue(
    message,
    ['pres', 'presentationId', 'presentation_id'],
  ));
  const startTime = findProblemValue(message, ['dt', 'startTime', 'start_time']);
  const limit = findProblemValue(message, ['limit', 'duration']);
  const metadata = { problemId, autoAnswerCandidate: true };

  if (slideId) metadata.slideId = slideId;
  if (presentationId) metadata.presentationId = presentationId;
  if (startTime !== undefined && startTime !== null && typeof startTime !== 'object') {
    metadata.startTime = startTime;
  }
  if (limit !== undefined && limit !== null && typeof limit !== 'object') {
    metadata.limit = limit;
  }

  return metadata;
}

const IDENTIFIER_KEYS = [
  'id', 'uuid', 'quizId', 'quiz_id', 'examId', 'exam_id', 'testId', 'test_id',
  'exerciseId', 'exercise_id', 'presentationId', 'presentation_id', 'problemId',
  'problem_id', 'problemid', 'problem', 'presentation', 'activityId', 'activity_id',
];

function findNestedText(source, keys) {
  const queue = [source];
  const visited = new Set();

  while (queue.length) {
    const current = queue.shift();
    if (!current || typeof current !== 'object' || visited.has(current)) continue;
    visited.add(current);

    const value = firstText(current, keys);
    if (value) return value;

    for (const key of NESTED_VALUE_KEYS) {
      const nested = current[key];
      if (Array.isArray(nested)) queue.push(...nested);
      else if (nested && typeof nested === 'object') queue.push(nested);
    }
  }

  return '';
}

function getIdentifier(message, entity, op) {
  return firstText(entity, IDENTIFIER_KEYS)
    || findNestedText(message, IDENTIFIER_KEYS)
    || op;
}

function getDetail(message, entity) {
  return firstText(entity, ['title', 'name', 'subject', 'label', 'body'])
    || firstText(message, ['title', 'name', 'subject', 'label'])
    || '教师发布了新的课堂内容';
}

function getCategory(op) {
  if (op === 'unlockproblem') return null;
  if (op === 'probleminfo') return 'assessment';
  // 结果、关闭、展示、更新等操作同样会带 problem，不能当成新题发布。
  if (includesOneOf(op, ASSESSMENT_MARKERS)) {
    return ASSESSMENT_PUBLISH_ACTION.test(op) ? 'assessment' : null;
  }
  // 打开旧课件、翻页等操作也会带 presentation/slide，不能误落入通用发布提醒。
  if (includesOneOf(op, COURSEWARE_MARKERS)) {
    return COURSEWARE_PUBLISH_ACTION.test(op) ? 'courseware' : null;
  }
  if (PUBLISH_ACTION.test(op)) return 'other';
  return null;
}

export function classifyPublishEvent(message) {
  const op = normalizeOp(message);
  const category = getCategory(op);
  if (!category) return null;

  const entity = getEntity(message);
  const concreteProblem = category === 'assessment'
    ? getConcreteProblemMetadata(message, op)
    : null;
  const id = concreteProblem?.problemId || getIdentifier(message, entity, op);
  const detail = getDetail(message, entity);
  const title = {
    assessment: concreteProblem ? '新题目已发布' : '考试/测试题组已发布',
    courseware: '课件已发布',
    other: '课堂内容已发布',
  }[category];

  return {
    category,
    dedupeKey: `${category}:${id}`,
    title,
    detail,
    ...concreteProblem,
  };
}

export function isPublishReminderEnabled(event, config = {}) {
  if (!event?.category) return false;
  const kind = {
    assessment: 'assessment-publish',
    courseware: 'courseware-publish',
    other: 'other-publish',
  }[event.category];
  return kind ? isReminderEnabled(kind, config) : false;
}

export function getRealtimeEvent(message) {
  const op = normalizeOp(message);

  if (op === 'fetchtimeline') return { kind: 'timeline', timeline: message?.timeline };
  if (op === 'unlockproblem') {
    const rawProblem = message?.problem;
    const problem = rawProblem && typeof rawProblem === 'object'
      ? { ...message, ...rawProblem }
      : { ...message, prob: message?.prob ?? rawProblem ?? message?.problemid };
    return { kind: 'unlockproblem', problem };
  }
  if (op === 'lessonfinished') return { kind: 'lessonfinished' };

  const event = classifyPublishEvent(message);
  return event ? { kind: 'publish', event } : null;
}
