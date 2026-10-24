const PROBLEM_CONTAINER_KEYS = new Set([
  'problems',
  'problem_list',
  'problemList',
  'problem-list',
]);

const TIMELINE_CONTAINER_KEYS = new Set([
  'timelineList',
  'timeline_list',
  'timeline',
]);

const PROBLEM_ID_KEYS = ['problemId', 'problem_id', 'problemid'];
const PROBLEM_TYPE_KEYS = ['problemType', 'problem_type', 'ProblemType', 'questionType'];
const PROBLEM_BODY_KEYS = ['body', 'Body', 'title', 'content'];
const PROBLEM_OPTION_KEYS = ['options', 'Options'];

function isMeaningful(value) {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') return value.trim() !== '';
  if (Array.isArray(value)) return value.length > 0;
  if (value instanceof Date) return true;
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return true;
}

function firstMeaningful(...values) {
  return values.find(isMeaningful);
}

function normalizeId(value) {
  const id = firstMeaningful(value);
  if (id === undefined) return null;
  const text = String(id).trim();
  return text || null;
}

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function normalizeProblem(raw, context = {}, options = {}) {
  let value = raw;
  if (typeof value === 'string' || typeof value === 'number') {
    value = { problemId: value };
  }
  if (!isPlainObject(value)) return null;

  const explicitId = firstMeaningful(...PROBLEM_ID_KEYS.map(key => value[key]));
  const timelineProblemId = options.timelineProblem && (typeof value.problem === 'string' || typeof value.problem === 'number')
    ? value.problem
    : null;
  // A timeline item may wrap a full problem object under `problem`. In that
  // case its own id belongs to the timeline item, not to the problem.
  const bareId = options.allowBareId && !isPlainObject(value.problem) ? value.id : null;
  const problemId = normalizeId(firstMeaningful(explicitId, timelineProblemId, bareId));
  if (!problemId) return null;

  const problem = { ...value, problemId };
  const problemType = firstMeaningful(...PROBLEM_TYPE_KEYS.map(key => value[key]));
  const body = firstMeaningful(...PROBLEM_BODY_KEYS.map(key => value[key]));
  const optionsValue = firstMeaningful(...PROBLEM_OPTION_KEYS.map(key => value[key]));

  if (!isMeaningful(problem.problemType) && problemType !== undefined) problem.problemType = problemType;
  if (!isMeaningful(problem.body) && body !== undefined) problem.body = body;
  if (!isMeaningful(problem.options) && optionsValue !== undefined) problem.options = optionsValue;

  const contextSlide = isPlainObject(context.slide) ? context.slide : null;
  const embeddedSlide = isPlainObject(value.slide) ? value.slide : null;
  const slideId = firstMeaningful(
    value.slideId,
    value.slide_id,
    value.sid,
    embeddedSlide?.id,
    embeddedSlide?.slideId,
    contextSlide?.id,
    contextSlide?.slideId,
  );
  let slide = embeddedSlide || contextSlide;
  if (slideId !== undefined) {
    slide = { ...(slide || {}), id: slide?.id ?? slideId };
  }

  const presentationId = firstMeaningful(
    context.presentationId,
    value.presentationId,
    value.presentation_id,
    value.presId,
    slide?.presentationId,
  );

  return {
    problem,
    slide: slide || null,
    presentationId: presentationId === undefined ? null : String(presentationId),
  };
}

/**
 * Extract every problem embedded in a classroom/report payload.
 * This function is intentionally side-effect free: it never notifies, answers,
 * or creates problem status entries.
 */
export function extractProblemsFromPayload(payload, context = {}) {
  const found = [];
  const seenIds = new Set();
  const basePresentationId = firstMeaningful(context?.presentationId, context?.presentation?.id);

  function add(raw, localContext = {}, options = {}) {
    const entry = normalizeProblem(raw, {
      presentationId: localContext.presentationId ?? basePresentationId,
      slide: localContext.slide,
    }, options);
    if (!entry || seenIds.has(entry.problem.problemId)) return false;
    seenIds.add(entry.problem.problemId);
    found.push(entry);
    return true;
  }

  function isSlideLike(value) {
    return isPlainObject(value) && (
      isMeaningful(value.cover)
      || isMeaningful(value.coverAlt)
      || isMeaningful(value.image)
      || isMeaningful(value.slideId)
      || isMeaningful(value.slide_id)
      || value.type === 'slide'
    );
  }

  function visit(value, state = {}) {
    if (Array.isArray(value)) {
      for (const item of value) visit(item, state);
      return;
    }
    if (!isPlainObject(value)) return;

    const mode = state.mode || 'nested';
    const localContext = {
      presentationId: firstMeaningful(state.presentationId, value.presentationId, value.presentation_id),
      slide: state.slide,
    };

    if (mode === 'timeline-list') {
      const timelineProblem = value.type === 'problem';
      if (timelineProblem) {
        add(value, localContext, { allowBareId: true, timelineProblem: true });
      }
    } else if (mode === 'problem' || mode === 'problem-list') {
      add(value, localContext, { allowBareId: true });
    } else if (PROBLEM_ID_KEYS.some(key => isMeaningful(value[key]))) {
      add(value, localContext, { allowBareId: false });
    }

    const childPresentationId = firstMeaningful(
      localContext.presentationId,
      value.presentationId,
      value.presentation_id,
      (Array.isArray(value.slides) || Array.isArray(value.slideList)) ? value.id : null,
    );

    for (const [key, child] of Object.entries(value)) {
      if (PROBLEM_CONTAINER_KEYS.has(key)) {
        visit(child, { mode: 'problem-list', presentationId: childPresentationId });
        continue;
      }
      if (TIMELINE_CONTAINER_KEYS.has(key)) {
        visit(child, { mode: 'timeline-list', presentationId: childPresentationId });
        continue;
      }
      if (key === 'problem') {
        if (isPlainObject(child)) {
          visit(child, {
            mode: 'problem',
            presentationId: childPresentationId,
            slide: isPlainObject(value.slide)
              ? value.slide
              : (isSlideLike(value) ? value : state.slide),
          });
        } else if (mode === 'timeline-list' && value.type === 'problem') {
          add(child, localContext, { timelineProblem: true });
        }
        continue;
      }
      visit(child, {
        mode: 'nested',
        presentationId: childPresentationId,
        slide: isSlideLike(value) ? value : state.slide,
      });
    }
  }

  visit(payload);
  return found;
}

function dispatchProblemsUpdated() {
  try {
    if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;
    const EventCtor = typeof CustomEvent !== 'undefined' ? CustomEvent : window.CustomEvent;
    if (typeof EventCtor !== 'function') return;
    window.dispatchEvent(new EventCtor('ykt:problems-updated'));
  } catch {}
}

/**
 * Persist harvested problems without entering any realtime-only path.
 */
export function harvestProblemsFromPayload(payload, repo, context = {}) {
  const entries = extractProblemsFromPayload(payload, context);
  if (!repo || entries.length === 0) return entries;

  for (const entry of entries) {
    repo.upsertProblem(entry.problem);
    repo.pushEncounteredProblem(entry.problem, entry.slide, entry.presentationId);
  }
  dispatchProblemsUpdated();
  return entries;
}
