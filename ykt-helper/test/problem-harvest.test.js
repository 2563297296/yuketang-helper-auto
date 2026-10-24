import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  extractProblemsFromPayload,
  harvestProblemsFromPayload,
} from '../src/state/problem-harvest.js';
import { repo } from '../src/state/repo.js';

function resetRepo() {
  repo.presentations.clear();
  repo.slides.clear();
  repo.problems.clear();
  repo.problemStatus.clear();
  repo.encounteredProblems.length = 0;
}

function readSource(relativePath) {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}

test('extracts problems from data.problems', () => {
  const entries = extractProblemsFromPayload({
    data: {
      problems: [{
        problemId: 'p-1',
        problemType: 1,
        body: 'Question one',
        options: ['A', 'B'],
      }],
    },
  });

  assert.equal(entries.length, 1);
  assert.equal(entries[0].problem.problemId, 'p-1');
  assert.equal(entries[0].problem.problemType, 1);
  assert.equal(entries[0].problem.body, 'Question one');
  assert.deepEqual(entries[0].problem.options, ['A', 'B']);
});

test('supports problem_list and historical field aliases', () => {
  const entries = extractProblemsFromPayload({
    result: {
      problem_list: [{
        problem_id: 'p-2',
        Body: 'Fill in the blank',
        ProblemType: 4,
        Options: ['one', 'two'],
      }],
    },
  });

  assert.equal(entries.length, 1);
  assert.equal(entries[0].problem.problemId, 'p-2');
  assert.equal(entries[0].problem.body, 'Fill in the blank');
  assert.equal(entries[0].problem.problemType, 4);
  assert.deepEqual(entries[0].problem.options, ['one', 'two']);
});

test('recognizes timeline problems and keeps their slide context', () => {
  const entries = extractProblemsFromPayload({
    data: {
      timelineList: [{
        id: 'event-1',
        type: 'problem',
        problem: {
          problemId: 'p-3',
          body: 'Timeline question',
        },
        slide: {
          id: 'slide-9',
          index: 2,
          cover: 'https://example.test/slide-9.jpg',
        },
      }],
    },
  });

  assert.equal(entries.length, 1);
  assert.equal(entries[0].problem.problemId, 'p-3');
  assert.equal(entries[0].slide.id, 'slide-9');
});

test('recognizes a bare-id timeline problem without treating normal slides as problems', () => {
  const entries = extractProblemsFromPayload({
    data: {
      timelineList: [
        {
          id: 'slide-1',
          type: 'slide',
          index: 1,
          cover: 'https://example.test/slide-1.jpg',
        },
        {
          id: 'p-4',
          type: 'problem',
          problemType: 1,
          body: 'Bare timeline question',
        },
      ],
    },
  });

  assert.equal(entries.length, 1);
  assert.equal(entries[0].problem.problemId, 'p-4');
});

test('does not treat ordinary presentation objects or generic id-only objects as problems', () => {
  const entries = extractProblemsFromPayload({
    data: {
      id: 'presentation-1',
      slides: [{
        id: 'slide-1',
        type: 'slide',
        index: 1,
        cover: 'https://example.test/slide-1.jpg',
      }],
      metadata: {
        id: 'metadata-only',
        body: 'Not a problem container',
      },
    },
  });

  assert.deepEqual(entries, []);
});

test('harvests duplicate problems once and never creates problem status', () => {
  resetRepo();

  const entries = harvestProblemsFromPayload({
    data: {
      problems: [
        { problemId: 'p-5', body: 'First copy' },
        { problemId: 'p-5', body: 'Second copy' },
      ],
    },
  }, repo);

  assert.equal(entries.length, 1);
  assert.equal(repo.problems.size, 1);
  assert.equal(repo.encounteredProblems.length, 1);
  assert.equal(repo.problemStatus.size, 0);
});

test('sparse historical payloads do not overwrite complete problem data', () => {
  resetRepo();
  repo.upsertProblem({
    problemId: 'p-6',
    problemType: 2,
    body: 'Original body',
    options: ['A', 'B'],
    status: { done: true, answering: false },
  });

  harvestProblemsFromPayload({
    data: {
      problems: [{
        problemId: 'p-6',
        problemType: null,
        body: '',
        options: [],
        status: { done: null },
      }],
    },
  }, repo);

  const problem = repo.getProblem('p-6');
  assert.equal(problem.problemType, 2);
  assert.equal(problem.body, 'Original body');
  assert.deepEqual(problem.options, ['A', 'B']);
  assert.deepEqual(problem.status, { done: true, answering: false });
});

test('historical harvesting has no live notification or answer path', () => {
  const source = readSource('../src/state/problem-harvest.js');
  assert.doesNotMatch(source, /onUnlockProblem|notifyProblemStart|problemStatus/);
  assert.doesNotMatch(source, /actions\.onFetchTimeline/);
});

test('interceptors route historical reports only to the harvest module', () => {
  const fetchSource = readSource('../src/net/fetch-interceptor.js');
  const xhrSource = readSource('../src/net/xhr-interceptor.js');

  assert.match(fetchSource, /harvestProblemsFromPayload/);
  assert.match(fetchSource, /if \(!resp\.ok/);
  assert.doesNotMatch(fetchSource, /actions\.onFetchTimeline|onUnlockProblem/);

  assert.match(xhrSource, /harvestProblemsFromPayload/);
  assert.match(xhrSource, /meta\?\.ok/);
  assert.doesNotMatch(xhrSource, /actions\.onFetchTimeline/);
});

test('problem panel refreshes on harvest without opening itself', () => {
  const source = readSource('../src/ui/panels/problem-list.js');
  assert.match(source, /ykt:problems-updated/);
  assert.doesNotMatch(source, /ykt:problems-updated[^\n]*showProblemListPanel\(true\)/);
});

test('entrypoint no longer schedules automatic page reloads', () => {
  const source = readSource('../src/index.js');
  assert.doesNotMatch(source, /startPeriodicReload|maybeAutoReloadOnMount|location\.reload/);
});
