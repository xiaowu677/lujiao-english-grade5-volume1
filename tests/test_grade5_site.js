const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const builder = path.join(root, 'tools', 'build_grade5.py');
const buildRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'grade5-site-'));
const data = JSON.parse(
  fs.readFileSync(path.join(root, 'data', 'grade5.json'), 'utf8'),
);

function extractCore(html) {
  const source = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)]
    .map((match) => match[1])
    .find((script) => script.includes('const WORDS ='));
  assert.ok(source, 'generated page must contain the word-game core');
  const context = { console, module: { exports: {} }, window: {} };
  vm.createContext(context);
  vm.runInContext(`${source}\nthis.core = window.WordQuestCore;`, context);
  return context.core;
}

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

test.before(() => {
  execFileSync('python', [builder, '--output-root', buildRoot], {
    cwd: root,
    encoding: 'utf8',
    stdio: 'pipe',
  });
});

test.after(() => {
  fs.rmSync(buildRoot, { recursive: true, force: true });
});

test('landing page shows adaptive live totals', () => {
  const html = fs.readFileSync(path.join(buildRoot, 'index.html'), 'utf8');
  const totalWords = data.units.reduce((sum, unit) => sum + unit.words.length, 0);
  const adaptiveQuestions = data.units.reduce(
    (sum, unit) =>
      sum + unit.words.length + Math.min(unit.words.length, 20),
    0,
  );

  assert.match(html, /鲁教版五年级英语上册/);
  assert.match(html, /<b>7<\/b> 个学习单元/);
  assert.match(html, new RegExp(`<b>${totalWords}</b> 个词条`));
  assert.match(html, new RegExp(`<b>${adaptiveQuestions}</b> 道学习题`));
});

for (const unit of data.units) {
  const number = unit.id.replace('unit', '');
  const pagePath = path.join(
    buildRoot,
    'outputs',
    `v2.1-unit${number}`,
    'index.html',
  );

  test(`${unit.id} preserves workbook order and adaptive totals`, () => {
    const html = fs.readFileSync(pagePath, 'utf8');
    const core = extractCore(html);
    const count = unit.words.length;

    assert.deepEqual(
      Array.from(core.WORDS, (word) => word.en),
      unit.words.map((word) => word.en),
    );
    assert.match(html, new RegExp(`<b>${count}</b> 个单词`));
    assert.match(html, new RegExp(`<b>${count}</b> 词混合闯关`));
    assert.match(html, /<b>≤20<\/b> 题抽样验收/);
    assert.match(html, /id="result-duration"/);
    assert.match(
      html,
      new RegExp(`word-planet-grade5-v2\\.1-unit${number}-full-progress-v4`),
    );
    assert.match(html, /class="home-link"/);
    assert.match(html, /href="\.\.\/\.\.\/"/);
  });

  test(`${unit.id} keeps four complete stories and contexts`, () => {
    const html = fs.readFileSync(pagePath, 'utf8');
    const core = extractCore(html);
    const expectedWords = unit.words.map((word) => word.en);
    const sceneWords = core.CONTEXT_SCENES.flatMap((scene) => scene.wordEns);

    assert.equal(core.CONTEXT_SCENES.length, 4);
    assert.equal(sceneWords.length, expectedWords.length);
    assert.deepEqual(new Set(sceneWords), new Set(expectedWords));
    assert.deepEqual(new Set(Object.keys(core.CONTEXTS)), new Set(expectedWords));

    for (const word of unit.words) {
      const context = core.CONTEXTS[word.en];
      assert.equal(context.trainingSentence.match(/\{\{word\}\}/g)?.length, 1);
      assert.equal(context.acceptanceSentence.match(/\{\{word\}\}/g)?.length, 1);
      assert.equal(context.acceptanceZh.match(/\{\{word\}\}/g)?.length, 1);
      assert.notEqual(context.trainingSentence, context.acceptanceSentence);
    }
  });

  test(`${unit.id} uses one balanced adaptive question per word`, () => {
    const html = fs.readFileSync(pagePath, 'utf8');
    const core = extractCore(html);
    const queue = core.createAdaptiveQueue(
      core.WORDS,
      seededRandom(20261127),
    );

    assert.equal(queue.length, core.WORDS.length);
    assert.equal(
      new Set(queue.map((item) => item.wordEn)).size,
      core.WORDS.length,
    );

    for (const word of core.WORDS) {
      const contextQuestion = core.buildContextTrainingQuestion(word.en);
      assert.equal(contextQuestion.choices.length, 4);
      assert.equal(
        new Set(contextQuestion.choices.map((choice) => choice.value)).size,
        4,
      );
    }
  });

  test(`${unit.id} acceptance samples at most twenty words`, () => {
    const html = fs.readFileSync(pagePath, 'utf8');
    const core = extractCore(html);
    const names = core.WORDS.map((word) => word.en);
    const selected = core.selectAcceptanceWords(
      names.slice(0, 2),
      names,
      20,
      seededRandom(20261127),
    );

    assert.equal(selected.length, Math.min(names.length, 20));
    assert.equal(new Set(selected).size, selected.length);
  });

  test(`${unit.id} hides English-answer audio and records duration`, () => {
    const html = fs.readFileSync(pagePath, 'utf8');
    const core = extractCore(html);

    assert.match(
      html,
      /const AUDIO_BASE = '\.\.\/assets\/audio\/v2\.1\/en-GB-SoniaNeural\/';/,
    );
    assert.match(html, /const FIXED_AUDIO_ENABLED = true;/);
    assert.match(html, /function loadNarrationManifest\(\)/);
    assert.match(html, /function getNarrationAudio\(narration\)/);
    assert.equal(core.audioPolicyForQuestion({ mode: 'zh-en' }), 'none');
    assert.equal(
      core.audioPolicyForQuestion({ mode: 'context-training' }),
      'none',
    );
    assert.equal(
      core.audioPolicyForQuestion({ mode: 'context-zh-en' }),
      'none',
    );
    assert.match(html, /Core\.formatDuration\(durationSeconds\)/);
  });
}
