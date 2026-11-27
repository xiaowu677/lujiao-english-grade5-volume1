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
  assert.ok(context.core, 'generated page must expose WordQuestCore');
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

test('independent Grade 5 landing page shows live totals', () => {
  const html = fs.readFileSync(path.join(buildRoot, 'index.html'), 'utf8');
  assert.match(html, /鲁教版五年级英语上册/);
  assert.match(html, /<b>7<\/b> 个学习单元/);
  assert.match(html, /<b>155<\/b> 个词条/);
  assert.match(html, /<b>930<\/b> 道学习题/);

  for (const unit of data.units) {
    const number = unit.id.replace('unit', '');
    assert.match(
      html,
      new RegExp(`outputs/v2\\.1-unit${number}/index\\.html`),
      `${unit.id} link`,
    );
  }
  assert.doesNotMatch(html, /-key\/index\.html/);
});

for (const unit of data.units) {
  const number = unit.id.replace('unit', '');
  const pagePath = path.join(
    buildRoot,
    'outputs',
    `v2.1-unit${number}`,
    'index.html',
  );

  test(`${unit.id} page preserves workbook order and dynamic totals`, () => {
    const html = fs.readFileSync(pagePath, 'utf8');
    const core = extractCore(html);
    const count = unit.words.length;

    assert.deepEqual(
      Array.from(core.WORDS, (word) => word.en),
      unit.words.map((word) => word.en),
    );
    assert.match(html, new RegExp(`单词星球 2\\.1 · .*Unit ${number}`));
    assert.match(html, new RegExp(`<b>${count}</b> 个单词`));
    assert.match(html, new RegExp(`<b>${count * 4}</b> 格基础训练`));
    assert.match(html, new RegExp(`<b>${count}</b> 题语境训练`));
    assert.match(
      html,
      new RegExp(
        `word-planet-grade5-v2\\.1-unit${number}-full-progress-v3`,
      ),
    );
    assert.match(html, /class="home-link"/);
    assert.match(html, /href="\.\.\/\.\.\/"/);
    assert.doesNotMatch(html, /140 格基础训练 → 4 幕故事 → 35 题/);
    assert.doesNotMatch(html, /35 题新语境验收/);
    assert.doesNotMatch(html, /\/ 80 模式已掌握/);
    assert.doesNotMatch(html, /const masteredThisRound = 20 -/);
    assert.doesNotMatch(html, /const masteredThisScene = 5 -/);
  });

  test(`${unit.id} has four scenes and complete fresh acceptance contexts`, () => {
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
      assert.equal(
        context.trainingSentence.match(/\{\{word\}\}/g)?.length,
        1,
      );
      assert.equal(
        context.acceptanceSentence.match(/\{\{word\}\}/g)?.length,
        1,
      );
      assert.equal(context.acceptanceZh.match(/\{\{word\}\}/g)?.length, 1);
      assert.notEqual(
        context.trainingSentence,
        context.acceptanceSentence,
      );
    }

    if (unit.id === 'unit6') {
      assert.match(
        core.buildContextTrainingQuestion('be born').sentence,
        /phrase be born/,
      );
    }
    if (unit.id === 'unit7') {
      assert.match(
        core.buildContextTrainingQuestion('eve').sentence,
        /New Year’s Eve/,
      );
    }
  });

  test(`${unit.id} gives four unique choices in every training mode`, () => {
    const html = fs.readFileSync(pagePath, 'utf8');
    const core = extractCore(html);
    const count = unit.words.length;

    for (let seed = 1; seed <= 20; seed += 1) {
      const rounds = core.buildTrainingRounds(seededRandom(seed));
      assert.equal(rounds.length, 4);
      for (const round of rounds) {
        assert.equal(round.questions.length, count);
        for (const question of round.questions) {
          assert.equal(question.choices.length, 4);
          assert.equal(
            new Set(question.choices.map((choice) => choice.value)).size,
            4,
            `${unit.id} ${question.word.en} ${question.mode}`,
          );
          assert.equal(
            question.choices.filter(
              (choice) => choice.value === question.correctValue,
            ).length,
            1,
          );
        }
      }
    }

    const coverage = core.auditTrainingCoverage(core.createMasteryRecord());
    assert.equal(coverage.total, count * 4);
  });

  test(`${unit.id} acceptance covers every word with four unique choices`, () => {
    const html = fs.readFileSync(pagePath, 'utf8');
    const core = extractCore(html);
    const questions = core.buildContextAcceptanceTest(seededRandom(20261127));

    assert.equal(questions.length, unit.words.length);
    assert.equal(
      new Set(questions.map((question) => question.word.en)).size,
      unit.words.length,
    );
    for (const question of questions) {
      assert.equal(question.choices.length, 4);
      assert.equal(
        new Set(question.choices.map((choice) => choice.value)).size,
        4,
      );
    }
  });

  test(`${unit.id} uses fixed audio without device speech fallback`, () => {
    const html = fs.readFileSync(pagePath, 'utf8');
    assert.match(
      html,
      /const AUDIO_BASE = '\.\.\/assets\/audio\/v2\.1\/en-GB-SoniaNeural\/';/,
    );
    assert.match(
      html,
      /const AUDIO_MANIFEST_URL\s*=\s*'\.\.\/assets\/audio\/v2\.1\/en-GB-SoniaNeural\/manifest\.json';/,
    );
    assert.match(html, /const FIXED_AUDIO_ENABLED = true;/);
    assert.match(html, /const narrationPlayer = new Audio\(\);/);
    assert.match(html, /function narrationAudioFile\(narration\)/);
    assert.match(html, /function escapeRegExp/);
    assert.doesNotMatch(html, /__APP__/);
    assert.doesNotMatch(html, /speechSynthesis/i);
    assert.doesNotMatch(html, /SpeechSynthesisUtterance/);
  });
}
