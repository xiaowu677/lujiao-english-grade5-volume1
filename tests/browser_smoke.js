const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const smokeId = process.env.SMOKE_ID || 'grade5-unit5';
const fullDir = 'v2.1-unit5';
const expectedFullWords = 16;
const expectedStoryTitle = '赛季开始';
const prefix = `${smokeId}-`;
const port = Number(process.env.SMOKE_PORT || 9535);
const sitePort = Number(process.env.SITE_PORT || 9585);
const profile = path.join(__dirname, `edge-smoke-${smokeId}`);
const output = path.join(__dirname, 'browser-output');

fs.mkdirSync(output, { recursive: true });

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForJson(url, timeoutMs = 8000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return response.json();
      }
    } catch {
      // Edge is still starting.
    }
    await wait(100);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function waitForHttp(url, timeoutMs = 8000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // The local site server is still starting.
    }
    await wait(100);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

class Cdp {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    this.events = [];
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.id) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(message.error.message));
        else pending.resolve(message.result);
      } else {
        this.events.push(message);
      }
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    this.socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
  }
}

async function evaluate(cdp, expression) {
  const result = await cdp.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    const details = result.exceptionDetails;
    throw new Error(
      details.exception?.description ||
        details.exception?.value ||
        details.text,
    );
  }
  return result.result.value;
}

async function capture(cdp, name) {
  await cdp.send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
  });
  const result = await cdp.send('Page.captureScreenshot', {
    format: 'png',
    fromSurface: true,
  });
  fs.writeFileSync(path.join(output, name), Buffer.from(result.data, 'base64'));
}

async function openPage(cdp, targetUrl, width, height, expectGame = true) {
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await cdp.send('Page.navigate', { url: targetUrl });
  let readyState = 'loading';
  for (let attempt = 0; attempt < 25 && readyState !== 'complete'; attempt += 1) {
    await wait(150);
    readyState = await evaluate(cdp, 'document.readyState');
  }
  assert.equal(readyState, 'complete', `${targetUrl} did not finish loading`);
  if (expectGame) {
    assert.equal(
      await evaluate(cdp, `Boolean(document.querySelector('#start-button'))`),
      true,
      `${targetUrl} did not render the home screen`,
    );
  }
}

async function main() {
  fs.rmSync(profile, { recursive: true, force: true });
  const siteServer = spawn(
    'python',
    [
      '-m',
      'http.server',
      String(sitePort),
      '--bind',
      '127.0.0.1',
    ],
    { cwd: root, stdio: 'ignore' },
  );
  const browser = spawn(
    edge,
    [
      '--headless=old',
      '--disable-gpu',
      '--disable-software-rasterizer',
      '--no-first-run',
      '--no-sandbox',
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profile}`,
      'about:blank',
    ],
    { stdio: 'ignore' },
  );

  try {
    const siteBase = `http://127.0.0.1:${sitePort}`;
    await waitForHttp(`${siteBase}/index.html`);
    console.log('waiting for Edge DevTools');
    const pages = await waitForJson(`http://127.0.0.1:${port}/json/list`);
    console.log('connecting to page');
    const page = pages.find((item) => item.type === 'page');
    assert.ok(page, 'Edge did not expose a normal browser page');
    const socket = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true });
      socket.addEventListener('error', reject, { once: true });
    });
    const cdp = new Cdp(socket);
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Log.enable');
    console.log('DevTools ready');

    await openPage(cdp, `${siteBase}/index.html`, 1440, 1100, false);
    assert.match(
      await evaluate(cdp, `document.title`),
      /鲁教版五年级英语上册/,
    );
    await capture(cdp, 'grade5-landing.png');

    const full = `${siteBase}/outputs/${fullDir}/index.html`;
    await cdp.send('Emulation.setUserAgentOverride', {
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) ' +
        'AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 ' +
        'MicroMessenger/8.0.50(0x18003237) NetType/WIFI Language/zh_CN',
      platform: 'iPhone',
    });
    await openPage(cdp, `${siteBase}/index.html`, 430, 932, false);
    const landingMobile = await evaluate(
      cdp,
      `({
        innerWidth: window.innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
      })`,
    );
    assert.ok(
      landingMobile.scrollWidth <= landingMobile.innerWidth,
      'landing page overflows at 430px',
    );
    await capture(cdp, 'grade5-landing-mobile.png');

    await openPage(cdp, full, 430, 932);
    console.log('full mobile loaded');
    const mobile = await evaluate(
      cdp,
      `(() => {
        const overflow = [...document.querySelectorAll('body *')]
          .map((element) => ({
            tag: element.tagName,
            className: String(element.className || ''),
            text: (element.textContent || '').trim().slice(0, 40),
            left: element.getBoundingClientRect().left,
            right: element.getBoundingClientRect().right,
          }))
          .filter((item) => item.left < -1 || item.right > window.innerWidth + 1)
          .slice(0, 12);
        return {
          innerWidth: window.innerWidth,
          scrollWidth: document.documentElement.scrollWidth,
          overflow,
        };
      })()`,
    );
    assert.ok(
      mobile.scrollWidth <= mobile.innerWidth,
      `mobile page overflows: ${JSON.stringify(mobile.overflow)}`,
    );
    await capture(cdp, `${prefix}full-mobile.png`);

    await openPage(cdp, full, 1440, 1100);
    console.log('full desktop loaded');
    await capture(cdp, `${prefix}full-home.png`);
    await evaluate(
      cdp,
      `(() => {
        window.__spoken = [];
        window.__playedAudio = [];
        Object.defineProperty(HTMLMediaElement.prototype, 'play', {
          configurable: true,
          value: function () {
            window.__playedAudio.push(this.src);
            return Promise.resolve();
          },
        });
        return true;
      })()`,
    );
    await evaluate(cdp, `document.querySelector('#start-button').click()`);
    await wait(450);
    const training = await evaluate(
      cdp,
      `(() => ({
        words: window.WordQuestCore.WORDS.length,
        options: document.querySelectorAll('#test-screen .option').length,
        count: document.querySelector('#question-count').textContent,
        eyebrow: document.querySelector('#stage-eyebrow').textContent,
        visible: !document.querySelector('#test-screen').hidden,
      }))()`,
    );
    assert.equal(training.words, expectedFullWords);
    assert.equal(training.options, 4);
    assert.match(training.count, new RegExp(`0 / ${expectedFullWords}`));
    assert.equal(training.visible, true);
    await capture(cdp, `${prefix}full-training.png`);

    const trainingComplete = await evaluate(
      cdp,
      `(async () => {
        window.__realTimeout = window.setTimeout.bind(window);
        window.__testWait = (ms) =>
          new Promise((resolve) => window.__realTimeout(resolve, ms));
        window.setTimeout = (callback) => {
          if (typeof callback === 'function') callback();
          return 0;
        };
        const overflowText = [];
        const modePlayback = {};
        let steps = 0;
        while (steps < 300) {
          steps += 1;
          const question = document.querySelector('.question-card');
          const mode = question?.dataset.mode;
          if (mode && !modePlayback[mode]) {
            const replay = document.querySelector(
              '#test-screen:not([hidden]) #question-prompt [data-action="replay"]',
            );
            const playedBefore = window.__playedAudio.filter((source) =>
              source.includes('/assets/audio/'),
            ).length;
            replay?.click();
            await window.__testWait(20);
            modePlayback[mode] = {
              button: Boolean(replay),
              played:
                window.__playedAudio.filter((source) =>
                  source.includes('/assets/audio/'),
                ).length > playedBefore,
            };
          }
          for (const element of document.querySelectorAll(
            '#test-screen:not([hidden]) .prompt-word, #test-screen:not([hidden]) .option-text',
          )) {
            if (element.scrollWidth > element.clientWidth + 1) {
              overflowText.push(element.textContent.trim());
            }
          }
          const option = document.querySelector(
            '#test-screen:not([hidden]) .option[data-correct="true"]',
          );
          if (option) {
            option.click();
            continue;
          }
          const next = document.querySelector(
            '#milestone-screen:not([hidden]) #milestone-button',
          );
          if (next) {
            next.click();
            continue;
          }
          break;
        }
        return {
          storyVisible: !document.querySelector('#story-screen').hidden,
          storyTitle: document.querySelector('#story-title').textContent,
          storyWords: document.querySelectorAll('.story-word').length,
          missingStoryWords: window.WordQuestCore.CONTEXT_SCENES[0].wordEns.filter(
            (word) =>
              !document
                .querySelector('#story-text')
                .textContent.toLowerCase()
                .includes(word.toLowerCase()),
          ),
          overflowText: [...new Set(overflowText)],
          modePlayback,
          steps,
        };
      })()`,
    );
    assert.equal(trainingComplete.storyVisible, true);
    assert.equal(trainingComplete.storyTitle, expectedStoryTitle);
    assert.ok(trainingComplete.storyWords >= 1);
    assert.deepEqual(trainingComplete.missingStoryWords, []);
    assert.deepEqual(trainingComplete.overflowText, []);
    assert.deepEqual(Object.keys(trainingComplete.modePlayback).sort(), [
      'en-zh',
      'listen-en',
      'listen-zh',
      'zh-en',
    ]);
    for (const [mode, playback] of Object.entries(
      trainingComplete.modePlayback,
    )) {
      assert.equal(playback.button, true, `${mode}: missing manual replay button`);
      assert.equal(playback.played, true, `${mode}: manual replay did not speak`);
    }
    const storyPlayback = await evaluate(
      cdp,
      `(async () => {
        const replay = document.getElementById('story-replay-button');
        const playedBefore = window.__playedAudio.filter((source) =>
          source.includes('/assets/audio/'),
        ).length;
        replay.click();
        await window.__testWait(20);
        return {
          visible: !replay.hidden,
          played:
            window.__playedAudio.filter((source) =>
              source.includes('/assets/audio/'),
            ).length > playedBefore,
        };
      })()`,
    );
    assert.equal(storyPlayback.visible, true, 'story replay button is hidden');
    assert.equal(storyPlayback.played, true, 'story replay did not speak');
    await capture(cdp, `${prefix}full-story.png`);

    const flowComplete = await evaluate(
      cdp,
      `(async () => {
        document.querySelector(
          '#story-screen:not([hidden]) [data-action="start-context-quiz"]',
        ).click();
        const modePlayback = {};
        let steps = 0;
        while (steps < 400) {
          steps += 1;
          const question = document.querySelector('.question-card');
          const mode = question?.dataset.mode;
          if (mode && !modePlayback[mode]) {
            const replay = document.querySelector(
              '#test-screen:not([hidden]) #question-prompt [data-action="replay"]',
            );
            const playedBefore = window.__playedAudio.filter((source) =>
              source.includes('/assets/audio/'),
            ).length;
            replay?.click();
            await window.__testWait(20);
            modePlayback[mode] = {
              button: Boolean(replay),
              played:
                window.__playedAudio.filter((source) =>
                  source.includes('/assets/audio/'),
                ).length > playedBefore,
            };
          }
          const option = document.querySelector(
            '#test-screen:not([hidden]) .option[data-correct="true"]',
          );
          if (option) {
            option.click();
            continue;
          }
          const next = document.querySelector(
            '#milestone-screen:not([hidden]) #milestone-button',
          );
          if (next) {
            next.click();
            continue;
          }
          if (!document.querySelector('#story-screen').hidden) {
            document.querySelector(
              '#story-screen:not([hidden]) [data-action="start-context-quiz"]',
            ).click();
            continue;
          }
          break;
        }
        return {
          resultVisible: !document.querySelector('#result-screen').hidden,
          resultTitle: document.querySelector('#result-title').textContent,
          score: document.querySelector('#result-score').textContent,
          modePlayback,
          steps,
        };
      })()`,
    );
    assert.equal(flowComplete.resultVisible, true);
    assert.equal(flowComplete.resultTitle, '通关成功！');
    assert.equal(
      flowComplete.score,
      `${expectedFullWords} / ${expectedFullWords}`,
    );
    for (const [mode, playback] of Object.entries(flowComplete.modePlayback)) {
      assert.equal(playback.button, true, `${mode}: missing manual replay button`);
      assert.equal(playback.played, true, `${mode}: manual replay did not speak`);
    }
    assert.ok(
      Object.keys(flowComplete.modePlayback).includes('context-training'),
      'context training mode was not exercised',
    );
    await capture(cdp, `${prefix}full-result.png`);

    for (let unitNumber = 1; unitNumber <= 7; unitNumber += 1) {
      await openPage(
        cdp,
        `${siteBase}/outputs/v2.1-unit${unitNumber}/index.html`,
        430,
        932,
      );
      const responsive = await evaluate(
        cdp,
        `({
          innerWidth: window.innerWidth,
          scrollWidth: document.documentElement.scrollWidth,
          words: window.WordQuestCore.WORDS.length,
        })`,
      );
      assert.ok(
        responsive.scrollWidth <= responsive.innerWidth,
        `Unit ${unitNumber} overflows at 430px`,
      );
      assert.ok(responsive.words > 0);
    }

    await openPage(cdp, full, 430, 932);
    await evaluate(cdp, `localStorage.clear()`);
    await openPage(cdp, full, 430, 932);
    await evaluate(
      cdp,
      `(() => {
        window.__spoken = [];
        window.__playedAudio = [];
        Object.defineProperty(HTMLMediaElement.prototype, 'play', {
          configurable: true,
          value: function () {
            window.__playedAudio.push(this.src);
            return Promise.resolve();
          },
        });
        return true;
      })()`,
    );
    await evaluate(cdp, `document.querySelector('#start-button').click()`);
    await wait(1200);
    const mobileAutoPlays = await evaluate(
      cdp,
      `(() => ({
        fixed: window.__playedAudio.filter((source) =>
          source.includes('/assets/audio/'),
        ).length,
        unlock: window.__playedAudio.some((source) =>
          source.startsWith('data:audio/wav'),
        ),
      }))()`,
    );
    assert.ok(
      mobileAutoPlays.fixed > 0,
      'mobile: first question should autoplay after the start tap',
    );
    assert.equal(mobileAutoPlays.unlock, true, 'mobile: audio was not unlocked');
    const mobilePlayback = await evaluate(
      cdp,
      `(async () => {
        const replay = document.querySelector(
          '#question-prompt [data-action="replay"]',
        );
        const playedBefore = window.__playedAudio.filter((source) =>
          source.includes('/assets/audio/'),
        ).length;
        replay?.click();
        await new Promise((resolve) => setTimeout(resolve, 50));
        return {
          button: Boolean(replay),
          played:
            window.__playedAudio.filter((source) =>
              source.includes('/assets/audio/'),
            ).length > playedBefore,
          scrollWidth: document.documentElement.scrollWidth,
          innerWidth: window.innerWidth,
        };
      })()`,
    );
    assert.equal(mobilePlayback.button, true, 'mobile: replay button missing');
    assert.equal(mobilePlayback.played, true, 'mobile: replay did not speak');
    assert.ok(mobilePlayback.scrollWidth <= mobilePlayback.innerWidth);
    await capture(cdp, `${prefix}full-mobile-training.png`);

    const landing = await fetch(`${siteBase}/index.html`);
    assert.equal(landing.status, 200);
    const landingHtml = await landing.text();
    assert.match(landingHtml, /鲁教版五年级英语上册/);
    assert.equal(
      (landingHtml.match(/outputs\/v2\.1-unit\d\/index\.html/g) || []).length,
      7,
    );

    const errors = cdp.events
      .filter((event) => event.method === 'Runtime.exceptionThrown')
      .map((event) => event.params.exceptionDetails.text);
    const logErrors = cdp.events
      .filter(
        (event) =>
          event.method === 'Log.entryAdded' &&
          event.params.entry.level === 'error' &&
          !event.params.entry.url?.endsWith('/favicon.ico'),
      )
      .map((event) => event.params.entry.text);
    assert.deepEqual([...errors, ...logErrors], []);
    socket.close();

    console.log(
      JSON.stringify(
        {
          fullWords: training.words,
          mobile: mobile.innerWidth,
          options: training.options,
          count: training.count,
        },
        null,
        2,
      ),
    );
  } finally {
    browser.kill();
    siteServer.kill();
  }
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
