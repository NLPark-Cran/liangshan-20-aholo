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

const PROTECTIONS = [
  {
    id: 'none',
    name: '暂不增设',
    cost: 0,
    desc: '预算全给招引，当季风险不获缓解',
    weather: 0,
    guard: 0,
  },
  {
    id: 'weather',
    name: '加固与遮护',
    cost: 1,
    desc: '重点缓解风暴、涨潮和降雨',
    weather: 0.72,
    guard: 0.08,
  },
  {
    id: 'warden',
    name: '巡护与缓冲',
    cost: 1,
    desc: '重点缓解人为干扰和捕食压力',
    weather: 0.08,
    guard: 0.72,
  },
  {
    id: 'combined',
    name: '综合值守',
    cost: 2,
    desc: '两类风险都照顾，但单项缓解较弱',
    weather: 0.48,
    guard: 0.48,
  },
];

/* 五季风险只服务玩法，不对应真实年份、预报或项目统计。 */
const RISKS = [
  {
    id: 'storm',
    name: '风暴潮',
    group: 'weather',
    desc: '强风叠着高潮位，低平巢区更敏感。',
    arrival: 0.12,
    nesting: 0.34,
    rearing: 0.24,
    exposure: { reef: 0.55, sandbar: 1, pond: 0.7 },
  },
  {
    id: 'disturbance',
    name: '人为干扰',
    group: 'guard',
    desc: '船与近岸活动影响停留，靠近人的位置更敏感。',
    arrival: 0.18,
    nesting: 0.18,
    rearing: 0.12,
    exposure: { reef: 0.35, sandbar: 0.7, pond: 1 },
  },
  {
    id: 'predator',
    name: '捕食压力',
    group: 'guard',
    desc: '风险更多落在卵和雏鸟上，巡护能保住已有巢群。',
    arrival: 0.03,
    nesting: 0.22,
    rearing: 0.38,
    exposure: { reef: 0.85, sandbar: 0.75, pond: 1 },
  },
  {
    id: 'tide',
    name: '连续涨潮',
    group: 'weather',
    desc: '巢区可用空间收窄，沙洲需要优先加固。',
    arrival: 0.08,
    nesting: 0.4,
    rearing: 0.18,
    exposure: { reef: 0.45, sandbar: 1, pond: 0.65 },
  },
  {
    id: 'rain',
    name: '持续降雨',
    group: 'weather',
    desc: '成鸟仍可能到达，遮护会影响巢与雏鸟的留存。',
    arrival: 0.07,
    nesting: 0.22,
    rearing: 0.34,
    exposure: { reef: 0.75, sandbar: 0.85, pond: 1 },
  },
];

const BUDGET = 4;
const MONTHS = ['四月', '五月', '六月', '七月', '八月'];
const MAX_ARRIVAL = 0.68;

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function seededRandom(seed) {
  let a = Number(seed) >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeRandom(seed) {
  if (typeof seed === 'function') return seed;
  if (seed !== undefined && seed !== null && Number.isFinite(Number(seed))) {
    return seededRandom(seed);
  }
  return Math.random;
}

function percent(v) {
  return `${Math.round(v * 100)}%`;
}

function points(v) {
  return `${Math.round(v * 100)} 个百分点`;
}

/* ────────────────────────── 状态 ────────────────────────── */

function newGame(seed) {
  return {
    round: 0,
    island: null,
    decoy: 'mid',
    sound: 'dusk',
    protection: 'none',
    phase: 'choose', // choose | waiting | result | end
    birds: 0,
    nests: 0,
    chicks: 0,
    seasons: [],
    cap: null, // 这一季的结算摘要，用于浮层
    lastP: 0,
    experience: 0,
    colony: 0,
    previousIsland: null,
    seed,
    rng: makeRandom(seed),
  };
}

let S = newGame();
let canvasEl = null;
let panelEl = null;
let rafId = null;
let lastTernKey = '';
let waitingUntil = 0;
let waitingDuration = 2200;
let seasonTimer = null;
let animBirds = 0; // 用于让鸟一只一只落下来

/* ────────────────────────── 入口 ────────────────────────── */

export function openTern(seed) {
  const ov = document.getElementById('ternlog');
  if (!ov) return;
  clearSeasonTimer();
  ov.hidden = false;
  document.body.style.overflow = 'hidden';
  requestAnimationFrame(() => ov.classList.add('is-open'));

  canvasEl = document.getElementById('tern-canvas');
  panelEl = document.getElementById('tern-panel');
  const stage = document.getElementById('tern-stage');
  if (stage && !stage.querySelector('#tn-risk')) {
    const risk = document.createElement('div');
    risk.id = 'tn-risk';
    risk.className = 'tn__risk';
    risk.setAttribute('aria-live', 'polite');
    stage.appendChild(risk);
  }
  S = newGame(seed);
  lastTernKey = '';
  animBirds = 0;
  renderPanel();
  startLoop();
}

function clearSeasonTimer() {
  if (seasonTimer) {
    clearTimeout(seasonTimer);
    seasonTimer = null;
  }
}

export function closeTern() {
  const ov = document.getElementById('ternlog');
  if (!ov) return;
  clearSeasonTimer();
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
        const p = 1 - left / waitingDuration;
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

  if (S.phase === 'end') renderEnd();
  else if (S.phase === 'result') renderResult();
  else if (S.phase === 'waiting') renderWaiting();
  else renderChoose();
  updateStageRisk();
}

function currentRisk() {
  return RISKS[Math.min(S.round, RISKS.length - 1)];
}

function seasonFactors(island, decoy, sound, protection) {
  const risk = currentRisk();
  const exposure = risk.exposure[island.id] ?? 1;
  const mitigation = protection[risk.group] || 0;
  const mix = decoy.value + sound.value;
  const base = Math.min(0.64, island.base * Math.pow(mix, 1.65) * 1.75);
  const riskLoss = risk.arrival * exposure;
  const protectionGain = riskLoss * mitigation;
  const colony = S.previousIsland === island.id ? S.colony : 0;
  const p = clamp(base - riskLoss + protectionGain + S.experience + colony, 0.04, MAX_ARRIVAL);
  return {
    base,
    riskLoss,
    protectionGain,
    experience: S.experience,
    colony,
    exposure,
    mitigation,
    nestingLoss: risk.nesting * exposure * (1 - mitigation),
    rearingLoss: risk.rearing * exposure * (1 - mitigation),
    p,
  };
}

function factorStrip(f) {
  return `<div class="tn__factors" aria-label="本季示意概率拆解">
    <span data-factor="base">基础 ${percent(f.base)}</span>
    <span data-factor="risk">风险 −${points(f.riskLoss)}</span>
    <span data-factor="protection">保护 +${points(f.protectionGain)}</span>
    <span data-factor="experience">经验 +${points(f.experience)}</span>
    <span data-factor="colony">群落 +${points(f.colony)}</span>
  </div>`;
}

function updateStageRisk() {
  const el = document.getElementById('tn-risk');
  if (!el) return;
  if (S.phase === 'end') {
    el.innerHTML = `<span class="tn__risk-tag">五季示意复盘</span><strong>每个选择都留下了记录</strong><span>概率与数量仅用于玩法推演</span>`;
    return;
  }
  const risk = currentRisk();
  el.innerHTML = `
    <span class="tn__risk-tag">第 ${S.round + 1} / 5 季 · 示意风险</span>
    <strong>${risk.name}</strong>
    <span>${risk.desc}</span>
    <div class="tn__track" aria-label="五季进度">${RISKS.map(
      (r, i) => `<i class="${i < S.round || S.phase === 'result' && i === S.round ? 'is-done' : i === S.round ? 'is-now' : ''}" title="第 ${i + 1} 季：${r.name}"></i>`
    ).join('')}</div>`;
}

function renderChoose() {
  const decoy = DECOYS.find((d) => d.id === S.decoy);
  const sound = SOUNDS.find((s) => s.id === S.sound);
  const protection = PROTECTIONS.find((p) => p.id === S.protection);
  const island = ISLANDS.find((i) => i.id === S.island);
  const risk = currentRisk();
  const spent = (decoy?.cost || 0) + (sound?.cost || 0) + (protection?.cost || 0);
  const over = spent > BUDGET;
  const canGo = island && !over;
  const factors = island ? seasonFactors(island, decoy, sound, protection) : null;

  panelEl.innerHTML = `
    <section class="tn__brief" aria-label="当季风险与已有经验">
      <div class="tn__brief-head"><span>第 ${S.round + 1} 季 · ${MONTHS[Math.min(S.round, 4)]}</span><strong>${risk.name}</strong><em>示意风险</em></div>
      <p>${risk.desc} 所有参数仅用于玩法推演，不对应真实项目统计。</p>
      <div class="tn__legacy"><span>已有经验 +${points(S.experience)}</span><span>同岛群落延续 +${points(S.colony)}</span><span>换岛保留经验，群落延续只留在原岛</span></div>
    </section>

    <div class="g__row tn__choices">
      <span class="g__lab">选岛</span>
      <div class="g__chips g__chips--even">
        ${ISLANDS.map(
          (it) => `
          <button class="chip ${S.island === it.id ? 'is-on' : ''}" data-island="${it.id}" aria-pressed="${S.island === it.id}">
            <span class="chip__n">${it.name}</span>
            <span class="chip__d">${it.desc}</span>
          </button>`
        ).join('')}
      </div>
    </div>

    <div class="g__row tn__choices">
      <span class="g__lab">摆假鸟</span>
      <div class="g__chips g__chips--even">
        ${DECOYS.map(
          (it) => `
          <button class="chip ${S.decoy === it.id ? 'is-on' : ''}" data-decoy="${it.id}" aria-pressed="${S.decoy === it.id}">
            <span class="chip__n">${it.name}<em class="chip__cost">耗 ${it.cost}</em></span>
            <span class="chip__d">${it.desc}</span>
          </button>`
        ).join('')}
      </div>
    </div>

    <div class="g__row tn__choices">
      <span class="g__lab">放声音</span>
      <div class="g__chips g__chips--even">
        ${SOUNDS.map(
          (it) => `
          <button class="chip ${S.sound === it.id ? 'is-on' : ''}" data-sound="${it.id}" aria-pressed="${S.sound === it.id}">
            <span class="chip__n">${it.name}<em class="chip__cost">耗 ${it.cost}</em></span>
            <span class="chip__d">${it.desc}</span>
          </button>`
        ).join('')}
      </div>
    </div>

    <div class="g__row tn__choices">
      <span class="g__lab">保护措施</span>
      <div class="g__chips g__chips--even tn__protections">
        ${PROTECTIONS.map(
          (it) => `
          <button class="chip ${S.protection === it.id ? 'is-on' : ''}" data-protection="${it.id}" aria-pressed="${S.protection === it.id}">
            <span class="chip__n">${it.name}<em class="chip__cost">耗 ${it.cost}</em></span>
            <span class="chip__d">${it.desc}</span>
          </button>`
        ).join('')}
      </div>
    </div>

    <div class="tn__decision">
      <div class="g__read">
        <span>电力人力</span><b class="${over ? 'is-over' : ''}">${spent}</b><span>/ ${BUDGET}</span>
        ${factors ? `<span class="g__dot">·</span><span>本季示意到达率</span><b id="tn-probability" data-value="${factors.p}">${percent(factors.p)}</b>` : ''}
        ${over ? '<span class="g__warn">超了，得省一样</span>' : !island ? '<span>还没选岛</span>' : ''}
      </div>
      ${factors ? factorStrip(factors) : ''}
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
  panelEl.querySelectorAll('[data-protection]').forEach((b) => {
    b.addEventListener('click', () => {
      S.protection = b.dataset.protection;
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
  const protection = PROTECTIONS.find((p) => p.id === S.protection);
  if (!island || !decoy || !sound || !protection) return;
  if (decoy.cost + sound.cost + protection.cost > BUDGET) return;

  const risk = currentRisk();
  const factors = seasonFactors(island, decoy, sound, protection);
  factors.nestingLoss = clamp(factors.nestingLoss + island.risk * 0.25, 0, 0.8);
  factors.rearingLoss = clamp(factors.rearingLoss + island.risk * 0.3, 0, 0.85);
  const p = factors.p;
  S.lastP = p;

  const arrived = S.rng() < p;
  let birds = 0;
  let nests = 0;
  let chicks = 0;
  if (arrived) {
    birds = 6 + Math.floor(S.rng() * 12) + Math.round(p * 18);
    nests = Math.max(0, Math.round(birds * (0.32 + S.rng() * 0.16) * (1 - factors.nestingLoss)));
    chicks = Math.max(0, Math.round(nests * (0.42 + S.rng() * 0.2) * (1 - factors.rearingLoss)));
  }

  const experienceGain = arrived && nests > 0 ? 0.025 : 0.02;
  const nextExperience = Math.min(0.1, S.experience + experienceGain);
  const nextColony = Math.min(0.12, nests * 0.003 + chicks * 0.006);
  const observation = arrived
    ? `本季推演记录：${risk.name}经「${protection.name}」后，巢区示意损失 ${percent(factors.nestingLoss)}，雏鸟阶段示意损失 ${percent(factors.rearingLoss)}。下一季经验增加 ${points(experienceGain)}。`
    : `这次未到达也留下了对照：${island.name}、${decoy.name}假鸟、${sound.name}声音与「${protection.name}」在${risk.name}下的示意到达率为 ${percent(p)}。下一季经验增加 ${points(experienceGain)}。`;

  S.birds = 0;
  S.nests = 0;
  S.chicks = 0;
  S.cap = {
    round: S.round,
    islandId: island.id,
    island: island.name,
    decoy: decoy.name,
    sound: sound.name,
    protection: protection.name,
    risk: risk.name,
    riskId: risk.id,
    p,
    factors,
    arrived,
    birds,
    nests,
    chicks,
    experienceGain,
    nextExperience,
    nextColony,
    observation,
  };
  S.experience = nextExperience;
  S.colony = nextColony;
  S.previousIsland = island.id;
  animBirds = 0;
  S.phase = 'waiting';
  waitingDuration = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 90 : 1800;
  waitingUntil = performance.now() + waitingDuration;
  renderPanel();

  clearSeasonTimer();
  seasonTimer = setTimeout(() => {
    seasonTimer = null;
    S.phase = 'result';
    S.birds = birds;
    S.nests = nests;
    S.chicks = chicks;
    S.seasons.push(S.cap);
    renderPanel();
  }, waitingDuration + 80);
}

function renderWaiting() {
  const risk = currentRisk();
  panelEl.innerHTML = `
    <div class="tn__waiting" role="status">
      <span class="g__lab">第 ${S.round + 1} 季 · ${risk.name}</span>
      <strong>假鸟、声音和保护措施已经落下，等这一季给出结果。</strong>
      <p class="g__note">本季示意到达率 ${percent(S.cap?.p || 0)}，结果仍保留不确定性。</p>
    </div>
  `;
}

function renderResult() {
  const last = S.seasons[S.seasons.length - 1];
  if (!last) return;
  const arrived = last.arrived;

  panelEl.innerHTML = `
    <section class="tn__result" data-risk="${last.riskId}" data-arrived="${arrived}" data-birds="${last.birds}" data-nests="${last.nests}" data-chicks="${last.chicks}">
      <div class="tn__result-head">
        <span class="g__lab">第 ${S.round + 1} 季 · ${last.risk}</span>
        <div class="g__read">
          <b class="g__big" style="color:${arrived ? 'var(--bamboo)' : 'var(--ochre)'}">${last.birds}</b>
          <span>${arrived ? '只落下来' : '没有落下'}</span>
          <span class="g__dot">·</span><span>筑巢</span><b>${last.nests}</b>
          <span class="g__dot">·</span><span>出飞</span><b>${last.chicks}</b><span>雏</span>
          <span class="g__dot">·</span><span>示意到达率</span><b>${percent(last.p)}</b>
        </div>
      </div>
      <p class="tn__selection">${last.island} · ${last.decoy}假鸟 · ${last.sound}声音 · ${last.protection}</p>
      ${factorStrip(last.factors)}
      <div class="tn__observation">
        <strong>${arrived ? '这一季留下了什么' : '失败也留下了信息'}</strong>
        <p>${last.observation}</p>
        <p>下一季同岛群落延续 +${points(last.nextColony)}。换岛后经验仍保留，群落延续不接过去。</p>
      </div>
      <p class="tn__disclaimer">以上均为示意推演，不代表真实项目新观测或预测。</p>
      <div class="g__acts">
        <button class="g__go" id="tn-next">${S.round >= 4 ? '看看这五季' : '带着记录到下一季'}</button>
      </div>
    </section>
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
    <section class="tn__end">
      <div class="tn__end-head">
        <span class="g__lab">五季复盘</span>
        <div class="g__read">
          <span>有鸟落下</span><b class="g__big">${success}</b><span>季</span>
          <span class="g__dot">·</span>
          <span>示意出飞合计</span><b class="g__big">${total}</b><span>只雏鸟</span>
        </div>
        <div class="tn__season" aria-label="五季到达结果">
          ${S.seasons
            .map(
              (s) =>
                `<span class="tn__sq ${s.arrived ? 'is-yes' : 'is-no'}" title="第 ${s.round + 1} 季：${s.risk}"></span>`
            )
            .join('')}
        </div>
      </div>
      <p class="tn__disclaimer">以下概率、数量和损失都是玩法示意。复盘用于解释选择的影响，不构成真实项目结论。</p>
      <ol class="tn__review">
        ${S.seasons.map(
          (s) => `<li data-season="${s.round}" data-risk="${s.riskId}">
            <div class="tn__review-title"><strong>第 ${s.round + 1} 季 · ${s.risk}</strong><span class="${s.arrived ? 'is-yes' : 'is-no'}">${s.arrived ? `${s.birds} 只落下` : '没有落下'}</span></div>
            <p class="tn__selection">${s.island} · ${s.decoy}假鸟 · ${s.sound}声音 · ${s.protection}</p>
            <div class="tn__review-numbers"><span>示意到达率 ${percent(s.p)}</span><span>筑巢 ${s.nests}</span><span>出飞 ${s.chicks}</span><span>下季经验 +${points(s.experienceGain)}</span><span>同岛群落 +${points(s.nextColony)}</span></div>
            ${factorStrip(s.factors)}
            <p>${s.observation}</p>
          </li>`
        ).join('')}
      </ol>
      <div class="g__acts">
        <button class="g__go g__go--quiet" id="tn-again">再守五季</button>
      </div>
      <p class="g__note" id="tn-save">本地模式：这五季只留在这台设备上。</p>
      <p class="tn__source">背景资料沿用站内已有记录：象山韭山列岛从 2013 年开始招引，到 2025 年累计孵出 214 只雏鸟。</p>
    </section>
  `;

  panelEl.querySelector('#tn-again')?.addEventListener('click', () => {
    clearSeasonTimer();
    S = newGame(S.seed);
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
