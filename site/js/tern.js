/**
 * tern.js — 「等一只鸟回来」：中华凤头燕鸥招引推演
 *
 * 重做原因：上一版整个右栏是三组选项的表单，左边画布几乎空白，
 * 点「等一个繁殖季」等两秒、出一行结论，玩完不知道自己在干什么。
 *
 * 这一版把决策放回画面上：岛在眼前，假鸟真的站在礁石上，
 * 声音用一圈一圈的波纹看得见。玩家选岛、定假鸟数、定放声音的时段，
 * 然后亲眼看着鸟从海上来，或者不来。
 */

import { drawTernPanorama } from './tern-scene.js';
import { auth, submitTern } from './api.js';

/* ────────────────────────── 参数 ────────────────────────── */

const ISLANDS = [
  {
    id: 'reef',
    name: '礁岩小岛',
    desc: '四周浪大，船靠不上去，人不好打扰',
    base: 0.2,
    risk: 0.05,
  },
  {
    id: 'sandbar',
    name: '沙洲',
    desc: '低平，涨潮会淹掉一半，卵容易被卷走',
    base: 0.14,
    risk: 0.15,
  },
  {
    id: 'pond',
    name: '鱼塘埂',
    desc: '靠近人的活动，鸟会来，但待不长',
    base: 0.09,
    risk: 0.19,
  },
];

const DECOYS = [
  { id: 'few', name: '3 只', value: 0.34, cost: 1, desc: '太少，鸟群看不见' },
  { id: 'mid', name: '12 只', value: 0.62, cost: 2, desc: '一个能引起注意的小群' },
  { id: 'many', name: '30 只', value: 0.86, cost: 3, desc: '像模像样的一群' },
];

const SOUNDS = [
  { id: 'day', name: '只在白天', value: 0.3, cost: 1, desc: '夜里回岛的鸟听不到' },
  { id: 'dusk', name: '黄昏到入夜', value: 0.72, cost: 2, desc: '燕鸥多在傍晚归岛' },
  { id: 'all', name: '整夜不停', value: 0.9, cost: 3, desc: '效果最好，最耗电' },
];

const BUDGET = 4;
const MONTHS = ['四月', '五月', '六月', '七月', '八月'];

/* ────────────────────────── 状态 ────────────────────────── */

function newGame() {
  return {
    round: 0,
    island: null,
    decoy: 'mid',
    sound: 'dusk',
    phase: 'choose', // choose | waiting | result | end
    birds: 0,
    nests: 0,
    chicks: 0,
    seasons: [],
    cap: null, // 这一季的结算摘要，用于浮层
    lastP: 0,
  };
}

let S = newGame();
let canvasEl = null;
let panelEl = null;
let rafId = null;
let lastTernKey = '';
let waitingUntil = 0;
let animBirds = 0; // 用于让鸟一只一只落下来

/* ────────────────────────── 入口 ────────────────────────── */

export function openTern() {
  const ov = document.getElementById('ternlog');
  if (!ov) return;
  ov.hidden = false;
  document.body.style.overflow = 'hidden';
  requestAnimationFrame(() => ov.classList.add('is-open'));

  canvasEl = document.getElementById('tern-canvas');
  panelEl = document.getElementById('tern-panel');
  S = newGame();
  lastTernKey = '';
  animBirds = 0;
  renderPanel();
  startLoop();
}

export function closeTern() {
  const ov = document.getElementById('ternlog');
  if (!ov) return;
  ov.classList.remove('is-open');
  document.body.style.overflow = '';
  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
  setTimeout(() => {
    ov.hidden = true;
  }, 300);
}

/* ────────────────────────── 绘制 ────────────────────────── */

function startLoop() {
  if (rafId) cancelAnimationFrame(rafId);
  let last = 0;
  const tick = (now) => {
    if (!canvasEl || !canvasEl.isConnected) {
      rafId = null;
      return;
    }
    if (now - last >= 32) {
      last = now;

      // 等待期：真鸟一只一只从天上落下来
      if (S.phase === 'waiting' && S.cap) {
        const total = S.cap.birds;
        const left = Math.max(0, waitingUntil - now);
        const p = 1 - left / 2200;
        animBirds = Math.round(total * Math.min(1, p));
      }

      drawTernPanorama(canvasEl, {
        island: S.island,
        decoy: S.decoy,
        sound: S.phase === 'waiting' || S.phase === 'choose' ? S.sound : S.sound,
        birds: S.phase === 'waiting' ? animBirds : S.birds,
        nests: S.phase === 'waiting' ? animBirds * 0.4 : S.nests,
        phase: S.phase,
        round: S.round,
        t: now / 1000,
      });
    }
    rafId = requestAnimationFrame(tick);
  };
  rafId = requestAnimationFrame(tick);
}

/* ────────────────────────── 面板 ────────────────────────── */

function renderPanel() {
  if (!panelEl) return;

  if (S.phase === 'end') {
    renderEnd();
    return;
  }
  if (S.phase === 'result') {
    renderResult();
    return;
  }
  if (S.phase === 'waiting') {
    renderWaiting();
    return;
  }
  renderChoose();
}

function renderChoose() {
  const decoy = DECOYS.find((d) => d.id === S.decoy);
  const sound = SOUNDS.find((s) => s.id === S.sound);
  const spent = (decoy?.cost || 0) + (sound?.cost || 0);
  const over = spent > BUDGET;
  const canGo = S.island && !over;

  panelEl.innerHTML = `
    <div class="g__row">
      <span class="g__lab">第 ${S.round + 1} 季 · ${MONTHS[Math.min(S.round, 4)]}</span>
      <div class="g__chips g__chips--even">
        ${ISLANDS.map(
          (it) => `
          <button class="chip ${S.island === it.id ? 'is-on' : ''}" data-island="${it.id}">
            <span class="chip__n">${it.name}</span>
            <span class="chip__d">${it.desc}</span>
          </button>`
        ).join('')}
      </div>
    </div>

    <div class="g__row">
      <span class="g__lab">摆假鸟</span>
      <div class="g__chips g__chips--even">
        ${DECOYS.map(
          (it) => `
          <button class="chip ${S.decoy === it.id ? 'is-on' : ''}" data-decoy="${it.id}">
            <span class="chip__n">${it.name}<em class="chip__cost">耗 ${it.cost}</em></span>
            <span class="chip__d">${it.desc}</span>
          </button>`
        ).join('')}
      </div>
    </div>

    <div class="g__row">
      <span class="g__lab">放声音</span>
      <div class="g__chips g__chips--even">
        ${SOUNDS.map(
          (it) => `
          <button class="chip ${S.sound === it.id ? 'is-on' : ''}" data-sound="${it.id}">
            <span class="chip__n">${it.name}<em class="chip__cost">耗 ${it.cost}</em></span>
            <span class="chip__d">${it.desc}</span>
          </button>`
        ).join('')}
      </div>
    </div>

    <div class="g__row">
      <span class="g__lab">电力人力</span>
      <div class="g__read">
        <b class="${over ? 'is-over' : ''}">${spent}</b><span>/ ${BUDGET}</span>
        ${
          over
            ? '<span class="g__dot">·</span><span class="g__warn">超了，得省一样</span>'
            : !S.island
              ? '<span class="g__dot">·</span><span>还没选岛</span>'
              : ''
        }
      </div>
      <div class="g__acts">
        <button class="g__go" id="tn-go" ${canGo ? '' : 'disabled'}>等一个繁殖季</button>
      </div>
    </div>
  `;

  bindChoose();
}

function bindChoose() {
  panelEl.querySelectorAll('[data-island]').forEach((b) => {
    b.addEventListener('click', () => {
      S.island = b.dataset.island;
      renderPanel();
    });
  });
  panelEl.querySelectorAll('[data-decoy]').forEach((b) => {
    b.addEventListener('click', () => {
      S.decoy = b.dataset.decoy;
      renderPanel();
    });
  });
  panelEl.querySelectorAll('[data-sound]').forEach((b) => {
    b.addEventListener('click', () => {
      S.sound = b.dataset.sound;
      renderPanel();
    });
  });
  panelEl.querySelector('#tn-go')?.addEventListener('click', runSeason);
}

/* ────────────────────────── 推演一季 ────────────────────────── */

function runSeason() {
  const island = ISLANDS.find((i) => i.id === S.island);
  const decoy = DECOYS.find((d) => d.id === S.decoy);
  const sound = SOUNDS.find((s) => s.id === S.sound);
  if (!island || !decoy || !sound) return;
  if (decoy.cost + sound.cost > BUDGET) return;

  // 成功率：岛的底子 × 假鸟与声音的合力。
  // 用加法再取幂，让「一端拉满 + 一端省着」和「两样中等」都有竞争力；
  // 纯乘法会让两样中等永远占优，选择就没意义了。
  const mix = decoy.value + sound.value;
  const p = Math.min(0.92, island.base * Math.pow(mix, 2.1) * 2.6);
  S.lastP = p;

  const roll = Math.random();
  const arrived = roll < p;

  let birds = 0;
  let nests = 0;
  let chicks = 0;
  if (arrived) {
    birds = 8 + Math.round(roll * 40);
    nests = Math.round(birds * (0.3 + Math.random() * 0.3));
    const hatch = 0.62 + Math.random() * 0.28 - island.risk;
    chicks = Math.max(0, Math.round(nests * hatch * 0.72));
  }

  S.birds = 0;
  S.nests = 0;
  S.chicks = 0;
  S.cap = { arrived, birds, nests, chicks, p };
  animBirds = 0;
  S.phase = 'waiting';
  waitingUntil = performance.now() + 2200;
  renderPanel();

  setTimeout(() => {
    S.phase = 'result';
    S.birds = birds;
    S.nests = nests;
    S.chicks = chicks;
    S.seasons.push({
      round: S.round,
      island: island.name,
      decoy: decoy.name,
      sound: sound.name,
      p,
      arrived,
      birds,
      nests,
      chicks,
    });
    renderPanel();
  }, 2300);
}

function renderWaiting() {
  panelEl.innerHTML = `
    <div class="g__row">
      <span class="g__lab">第 ${S.round + 1} 季 · ${MONTHS[Math.min(S.round, 4)]}</span>
      <div class="g__read">
        <span>假鸟摆好了，声音放出去了</span>
      </div>
    </div>
    <div class="g__row">
      <p class="g__note">剩下的事，得等。</p>
    </div>
  `;
}

function renderResult() {
  const last = S.seasons[S.seasons.length - 1];
  if (!last) return;
  const arrived = last.arrived;

  panelEl.innerHTML = `
    <div class="g__row">
      <span class="g__lab">第 ${S.round + 1} 季 · ${MONTHS[Math.min(S.round, 4)]}</span>
      <div class="g__read">
        <b class="g__big" style="color:${arrived ? 'var(--bamboo)' : 'var(--ochre)'}">${
          arrived ? last.birds : 0
        }</b>
        <span>${arrived ? '只落下来' : '一只也没来'}</span>
        ${
          arrived
            ? `<span class="g__dot">·</span><span>筑巢</span><b>${last.nests}</b>
               <span class="g__dot">·</span><span>出飞</span><b>${last.chicks}</b><span>雏</span>`
            : ''
        }
        <span class="g__dot">·</span>
        <span>估计概率</span><b>${Math.round(last.p * 100)}%</b>
      </div>
    </div>

    <div class="g__row">
      <p class="g__note">${
        arrived
          ? '它们落在礁石上，先是几只，然后一片白。护鸟的人退到观测棚里，数巢、记环志、不敢大声说话。'
          : '这一季的礁石上只有假鸟。它们站在那儿，一直站到八月结束。招引从来不是一次就能成的事。'
      }</p>
      <div class="g__acts">
        <button class="g__go" id="tn-next">${S.round >= 4 ? '看看这五年' : '下一个繁殖季'}</button>
      </div>
    </div>
  `;

  panelEl.querySelector('#tn-next')?.addEventListener('click', () => {
    S.round += 1;
    S.birds = 0;
    S.nests = 0;
    S.chicks = 0;
    S.cap = null;
    animBirds = 0;
    S.phase = S.round >= 5 ? 'end' : 'choose';
    renderPanel();
  });
}

function renderEnd() {
  const total = S.seasons.reduce((a, s) => a + s.chicks, 0);
  const success = S.seasons.filter((s) => s.arrived).length;

  panelEl.innerHTML = `
    <div class="g__row">
      <span class="g__lab">五年</span>
      <div class="g__read">
        <span>有鸟落下</span><b class="g__big">${success}</b><span>季</span>
        <span class="g__dot">·</span>
        <span>一共飞出</span><b class="g__big">${total}</b><span>只雏鸟</span>
      </div>
      <div class="tn__season">
        ${S.seasons
          .map(
            (s) =>
              `<span class="tn__sq ${s.arrived ? 'is-yes' : 'is-no'}" title="第 ${s.round + 1} 季"></span>`
          )
          .join('')}
      </div>
    </div>

    <div class="g__row">
      <p class="g__note">${
        total > 0
          ? '它们一年只产一枚卵，孵不成就得再等一年。所以每一只出飞的雏鸟，都算得上一次侥幸。'
          : '这五季，一只也没飞出来。假鸟在礁石上，站了五年。真实项目里，有的岛试了好几年。'
      }</p>
      <div class="g__acts">
        <button class="g__go g__go--quiet" id="tn-again">再守五年</button>
      </div>
    </div>

    <div class="g__row">
      <p class="g__note" id="tn-save" style="color:var(--ink-300)">
        象山韭山列岛从 2013 年开始招引，到 2025 年累计孵出 214 只雏鸟，占全球繁殖总量的八成以上。
      </p>
    </div>
  `;

  panelEl.querySelector('#tn-again')?.addEventListener('click', () => {
    S = newGame();
    animBirds = 0;
    renderPanel();
  });

  void saveTernRun();
}

/* ────────────────────────── 归档 ────────────────────────── */

async function saveTernRun() {
  const hint = panelEl?.querySelector('#tn-save');
  if (!hint) return;

  if (!auth.ready || !auth.online) {
    hint.textContent = '本地模式：这五季只留在这台设备上。';
    return;
  }
  if (!auth.user) {
    hint.textContent = '登录后这次的记录会存到账号里。';
    return;
  }
  if (auth.user.kind !== 'member') {
    hint.innerHTML = '<button class="ap__link" id="tn-tologin">注册账号</button>，这次的记录就能存下来。';
    hint.querySelector('#tn-tologin')?.addEventListener('click', () => {
      window.dispatchEvent(new CustomEvent('auth:need-member'));
    });
    return;
  }

  const key = S.seasons.map((s) => `${s.round}:${s.chicks}`).join('|');
  if (key === lastTernKey) return;
  lastTernKey = key;

  try {
    const r = await submitTern({ seasons: S.seasons });
    if (r.ok) {
      hint.textContent = r.isNewBest
        ? `这是你的最好成绩：${r.totalChicks} 只雏鸟。`
        : `已经记下了。你的最好成绩是 ${r.prevBest} 只。`;
    } else {
      hint.textContent = '记录没成功，不影响继续玩。';
    }
  } catch (_) {
    hint.textContent = '记录没成功，不影响继续玩。';
  }
}
