/**
 * birding.js — 观鸟观测手账
 *
 * 重做原因：原来点一下按钮随机蹦一张记录卡，本质是抽奖机。
 * 真正的观鸟是「在一整片生境里找到那只鸟」，所以这一版把它做成找鸟：
 * 整幅画就是一片生境，鸟藏在草丛、枝头、水面、芦苇后面，
 * 用望远镜视野扫过去，扫到了才记进本子。
 *
 * 稀有度直接体现在难度上：常客在明处，迷鸟和神鸟躲得偏、个头小。
 */

import {
  SITES,
  RARITY,
  KIND_LABEL,
  HABITATS,
  TOTAL_SPECIES,
  allSpecies,
} from '../data/birds.js';
import { buildScene, drawBirdScene, LENS_R } from './birdscene.js';
import { auth, drawBird } from './api.js';
import { loadStickerIndex, stickerUrl, warmUp } from './sticker.js';
import { preloadBirds } from './birdimg.js';

const STORE_KEY = 'liangshan20.birdlog.v2';

function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function habitatLabel(site) {
  const byKind = KIND_LABEL[site.kind];
  if (byKind) return byKind;
  return HABITATS[site.scene]?.label || '';
}

/* ────────────────────────── 本地存档 ────────────────────────── */

function emptyLog() {
  return { seen: {}, notes: [], missions: {}, stamps: {} };
}

function loadLog() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return emptyLog();
    const d = JSON.parse(raw);
    if (!d || typeof d !== 'object' || Array.isArray(d)) return emptyLog();
    return {
      ...d,
      seen: d.seen && typeof d.seen === 'object' && !Array.isArray(d.seen) ? d.seen : {},
      notes: Array.isArray(d.notes) ? d.notes : [],
      missions: d.missions && typeof d.missions === 'object' && !Array.isArray(d.missions) ? d.missions : {},
      stamps: d.stamps && typeof d.stamps === 'object' && !Array.isArray(d.stamps) ? d.stamps : {},
    };
  } catch (_) {
    return emptyLog();
  }
}

function saveLog(log) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(log));
  } catch (_) {
    /* 存储不可用就静默降级，功能仍可玩 */
  }
}

/* ────────────────────────── 每站观测任务 ────────────────────────── */

function siteMissions(site) {
  const common = site.species.filter((sp) => (sp.r || 'C') === 'C');
  const targetPool = common.length ? common : site.species;
  const hash = [...site.id].reduce((sum, ch) => (sum * 31 + ch.charCodeAt(0)) >>> 0, 7);
  const target = targetPool[hash % targetPool.length];
  const rarity = site.species.some((sp) => sp.r === 'U') ? 'U' : 'C';
  const countGoal = Math.min(3, site.species.length);
  return [
    {
      id: `${site.id}:species`,
      kind: 'species',
      target: target.s,
      goal: 1,
      title: `找到 ${target.s}`,
      detail: '指定鸟来自本站现有物种池',
    },
    {
      id: `${site.id}:count`,
      kind: 'count',
      target: null,
      goal: countGoal,
      title: `记录 ${countGoal} 只鸟`,
      detail: '同一只鸟在本轮只计数一次',
    },
    {
      id: `${site.id}:rarity`,
      kind: 'rarity',
      target: rarity,
      goal: 1,
      title: `记录 1 只${RARITY[rarity].label}鸟`,
      detail: `本站物种池包含${RARITY[rarity].label}鸟`,
    },
  ];
}

function missionView(site) {
  const stored = log.missions[site.id] || {};
  const progress = stored.progress && typeof stored.progress === 'object' ? stored.progress : {};
  const tasks = siteMissions(site).map((mission) => {
    const value = Number(progress[mission.id]);
    const current = Number.isFinite(value) ? Math.max(0, Math.min(mission.goal, Math.floor(value))) : 0;
    return { ...mission, current, done: current >= mission.goal };
  });
  return { tasks, stamp: log.stamps[site.id] || null };
}

function updateMissions(bird) {
  const missions = siteMissions(currentSite);
  const previous = missionView(currentSite);
  const progress = { ...(log.missions[currentSite.id]?.progress || {}) };
  const completed = {};
  const completedNow = [];

  missions.forEach((mission) => {
    const old = previous.tasks.find((task) => task.id === mission.id);
    let value = old?.current || 0;
    const matches =
      mission.kind === 'count' ||
      (mission.kind === 'species' && bird.s === mission.target) ||
      (mission.kind === 'rarity' && (bird.r || 'C') === mission.target);
    if (matches && value < mission.goal) value += 1;
    progress[mission.id] = Math.min(mission.goal, value);
    completed[mission.id] = progress[mission.id] >= mission.goal;
    if (!old?.done && completed[mission.id]) completedNow.push(mission.title);
  });

  log.missions[currentSite.id] = {
    progress,
    completed,
    updatedAt: new Date().toISOString(),
  };

  let stampedNow = false;
  if (missions.every((mission) => completed[mission.id]) && !log.stamps[currentSite.id]) {
    log.stamps[currentSite.id] = {
      site: currentSite.name,
      at: new Date().toISOString(),
      tasks: missions.map((mission) => mission.id),
    };
    stampedNow = true;
  }
  return { completedNow, stampedNow };
}

/* ────────────────────────── 状态 ────────────────────────── */

let log = loadLog();
let currentSite = SITES[0];
let round = null; // buildScene 的产出
let found = new Set();
let lens = { x: -999, y: -999, active: false };
let canvasEl = null;
let stageEl = null;
let panelEl = null;
let rafId = null;
let t0 = performance.now();
let lastCatch = null;
let missionFlash = null;
let opening = false;
let codexOpen = false;
let boundStage = null;

/* ────────────────────────── 入口 ────────────────────────── */

export function initBirding() {
  panelEl = document.getElementById('bird-panel');
  if (!panelEl) return;
  renderPanel();
  // 贴纸索引异步加载，到了之后预热
  loadStickerIndex().then(() => warmUp(currentSite.species.map((s) => s.s)));
}

export function openBirding() {
  const ov = document.getElementById('birdlog');
  if (!ov) return;
  if (opening) return;
  opening = true;
  ov.hidden = false;
  document.body.style.overflow = 'hidden';
  requestAnimationFrame(() => {
    ov.classList.add('is-open');
    opening = false;
  });

  canvasEl = document.getElementById('bird-canvas');
  stageEl = document.getElementById('bird-stage');
  panelEl = document.getElementById('bird-panel');
  if (canvasEl) {
    canvasEl.tabIndex = 0;
    canvasEl.setAttribute('role', 'application');
    canvasEl.setAttribute('aria-label', '观鸟望远镜。聚焦后使用方向键移动，Shift 加方向键加速，找到鸟会自动记录。');
    canvasEl.setAttribute('aria-keyshortcuts', 'ArrowUp ArrowDown ArrowLeft ArrowRight');
  }
  const hint = document.getElementById('bird-hint');
  if (hint) hint.textContent = '移动鼠标或触屏拖动扫鸟；聚焦画面后，也可用方向键移动望远镜。';
  if (stageEl && !stageEl.querySelector('#bd-lens-status')) {
    const status = document.createElement('div');
    status.id = 'bd-lens-status';
    status.className = 'bd__lens';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    status.setAttribute('aria-atomic', 'true');
    stageEl.appendChild(status);
  }

  /* 贴纸索引没就绪时 buildScene 拿不到贴图地址，
     只能画手绘轮廓。所以先等索引（本地 7KB，很快），
     再开这一局，第一眼就是真图。 */
  loadStickerIndex()
    .catch(() => null)
    .then(() => {
      newRound();
    });

  bindStage();
  startLoop();
}

export function closeBirding() {
  const ov = document.getElementById('birdlog');
  if (!ov) return;
  ov.classList.remove('is-open');
  document.body.style.overflow = '';
  stopLoop();
  setTimeout(() => {
    ov.hidden = true;
  }, 300);
}

/* ────────────────────────── 一局 ────────────────────────── */

function newRound() {
  if (!canvasEl) return;
  const rect = canvasEl.getBoundingClientRect();
  round = buildScene(currentSite, log, {
    w: Math.max(rect.width, 320),
    h: Math.max(rect.height, 260),
    seed: (Date.now() % 100000) + currentSite.id.length * 137,
  });
  ensureMissionTargets();
  found = new Set();
  lastCatch = null;
  missionFlash = null;
  lens = { x: -999, y: -999, active: false };
  t0 = performance.now();
  hideHint(false);
  renderPanel();
  updateLensFeedback();

  // 贴图要下载 + 处理，先画手绘轮廓顶着，就绪后自动换成真图
  const urls = round.birds.map((b) => b._img).filter(Boolean);
  if (urls.length) preloadBirds(urls);
}

/* 指定目标若被本轮抽样漏掉，用同站鸟池中的原记录补入，不改写场景绘制。 */
function ensureMissionTargets() {
  if (!round) return;
  const view = missionView(currentSite);
  const required = [];
  const speciesTask = view.tasks.find((task) => task.kind === 'species' && !task.done);
  const rarityTask = view.tasks.find((task) => task.kind === 'rarity' && !task.done);
  if (speciesTask && !round.birds.some((b) => b.s === speciesTask.target)) {
    const target = currentSite.species.find((sp) => sp.s === speciesTask.target);
    if (target) required.push(target);
  }
  if (
    rarityTask &&
    !round.birds.some((b) => (b.r || 'C') === rarityTask.target) &&
    !required.some((sp) => (sp.r || 'C') === rarityTask.target)
  ) {
    const target = currentSite.species.find((sp) => (sp.r || 'C') === rarityTask.target);
    if (target) required.push(target);
  }

  const reserved = new Set(required.map((sp) => sp.s));
  required.forEach((sp) => {
    if (round.birds.some((b) => b.s === sp.s)) return;
    let index = round.birds.findIndex((b) => (b.r || 'C') === 'C' && !reserved.has(b.s));
    if (index < 0) index = round.birds.findIndex((b) => !reserved.has(b.s));
    if (index < 0) return;
    const old = round.birds[index];
    const rarity = sp.r || 'C';
    round.birds[index] = {
      ...sp,
      _x: old._x,
      _y: old._y,
      _r: rarity === 'X' ? 15 : rarity === 'M' ? 18 : rarity === 'R' ? 21 : rarity === 'U' ? 25 : 29,
      _ph: old._ph,
      _drift: old._drift,
      _img: stickerUrl(sp.s),
    };
  });
}

function startLoop() {
  stopLoop();
  // 30fps 就够：省电，也让截图/录屏能抓到稳定帧
  let last = 0;
  const tick = (now) => {
    if (!canvasEl || !canvasEl.isConnected) {
      rafId = null;
      return;
    }
    if (!round) return;

    if (now - last >= 32) {
      last = now;
      const rect = canvasEl.getBoundingClientRect();
      drawBirdScene(canvasEl, {
        sceneKind: currentSite.scene,
        birds: round.birds,
        found,
        t: (now - t0) / 1000,
        seed: round.seed,
        lensX: lens.active ? lens.x : -999,
        lensY: lens.active ? lens.y : -999,
      });

      // 扫过就判定
      if (lens.active) checkHit(rect.width, rect.height);
    }

    rafId = requestAnimationFrame(tick);
  };
  rafId = requestAnimationFrame(tick);
}

function stopLoop() {
  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
}

/* ────────────────────────── 找到一只 ────────────────────────── */

function checkHit(w, h) {
  if (!round) return;
  const R = Math.min(w, h) * LENS_R;

  for (let i = 0; i < round.birds.length; i++) {
    const b = round.birds[i];
    const key = `${b.s}-${i}`;
    if (found.has(key)) continue;

    /* 判定要和视觉对上：
       望远镜是一个圆，鸟在圆心附近才算「看清了」。
       之前给了 R*0.16 的宽容（约 60px），鸟还在视野边缘就记下了，
       玩家会觉得「我还没对准呢」。
       现在要求鸟落在圆心半径内，稀有鸟给得稍宽一点（本来就难找）。 */
    const dx = b._x - lens.x;
    const dy = b._y - lens.y;
    const dist = Math.hypot(dx, dy);
    const tol = b.r === 'X' ? R * 0.34 : b.r === 'M' ? R * 0.3 : R * 0.24;
    if (dist < tol) {
      catchBird(b, i, key);
    }
  }
}

function catchBird(b, i, key) {
  found.add(key);

  log.seen[b.s] = (log.seen[b.s] || 0) + 1;
  log.notes.push({
    s: b.s,
    en: b.en,
    site: currentSite.name,
    rarity: b.r || 'C',
    at: new Date().toISOString(),
  });
  missionFlash = updateMissions(b);
  saveLog(log);

  lastCatch = { ...b, rarity: b.r || 'C', key };
  renderPanel();
  updateLensFeedback();
  hideHint(true);

  // 稀有鸟：停一下再消失，让人看清名字
  const hold = b.r === 'X' || b.r === 'M' ? 4200 : 2600;
  setTimeout(() => {
    if (lastCatch?.key === key) {
      // 保留在面板里，但不闪
    }
  }, hold);

  // 会员走后端确认一次，失败不影响本地记录
  const isMember = auth.ready && auth.online && auth.user && auth.user.kind === 'member';
  if (isMember) {
    void drawBird(currentSite.id, false).catch(() => {});
  }
}

function hideHint(hide) {
  const h = document.getElementById('bird-hint');
  if (h) h.style.opacity = hide ? '0' : '0.85';
}

/* ────────────────────────── 互动 ────────────────────────── */

function updateLensFeedback() {
  const el = document.getElementById('bd-lens-status');
  if (!el || !canvasEl) return;
  if (!round || !lens.active) {
    el.textContent = round
      ? `望远镜待命 · 本轮 ${found.size} / ${round.birds.length} 只 · 聚焦画面后用方向键移动`
      : '望远镜正在准备';
    return;
  }
  const rect = canvasEl.getBoundingClientRect();
  const x = Math.round(clamp01(lens.x / Math.max(rect.width, 1)) * 100);
  const y = Math.round(clamp01(lens.y / Math.max(rect.height, 1)) * 100);
  const view = missionView(currentSite);
  const done = view.tasks.filter((task) => task.done).length;
  el.textContent = `镜位 X ${x}% · Y ${y}% · 本轮已记 ${found.size} / ${round.birds.length} · 本站任务 ${done} / 3${view.stamp ? ' · 站点印章已盖' : ''}`;
  canvasEl.dataset.lensX = String(x);
  canvasEl.dataset.lensY = String(y);
}

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

function bindStage() {
  if (!stageEl || !canvasEl || boundStage === stageEl) return;
  boundStage = stageEl;

  const move = (clientX, clientY) => {
    const r = canvasEl.getBoundingClientRect();
    lens.x = Math.max(0, Math.min(r.width, clientX - r.left));
    lens.y = Math.max(0, Math.min(r.height, clientY - r.top));
    lens.active = true;
    checkHit(r.width, r.height);
    updateLensFeedback();
    if (!found.size) hideHint(true);
  };

  stageEl.addEventListener('pointermove', (e) => move(e.clientX, e.clientY));
  stageEl.addEventListener('pointerdown', (e) => {
    canvasEl.focus({ preventScroll: true });
    move(e.clientX, e.clientY);
  });
  stageEl.addEventListener('pointerleave', () => {
    if (document.activeElement === canvasEl) return;
    lens.active = false;
    updateLensFeedback();
  });

  canvasEl.addEventListener('focus', () => {
    const r = canvasEl.getBoundingClientRect();
    if (!lens.active || lens.x < 0 || lens.y < 0) {
      lens.x = r.width / 2;
      lens.y = r.height / 2;
    }
    lens.active = true;
    checkHit(r.width, r.height);
    updateLensFeedback();
    hideHint(true);
  });

  canvasEl.addEventListener('keydown', (e) => {
    const delta = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (!delta) return;
    e.preventDefault();
    e.stopPropagation();
    const r = canvasEl.getBoundingClientRect();
    if (!lens.active || lens.x < 0 || lens.y < 0) {
      lens.x = r.width / 2;
      lens.y = r.height / 2;
    }
    const step = e.shiftKey ? 48 : 18;
    lens.x = Math.max(0, Math.min(r.width, lens.x + delta[0] * step));
    lens.y = Math.max(0, Math.min(r.height, lens.y + delta[1] * step));
    lens.active = true;
    checkHit(r.width, r.height);
    updateLensFeedback();
    hideHint(true);
  });

  // 触屏：拖动就是扫，抬手不复位，方便慢慢看
  stageEl.addEventListener('touchstart', (e) => {
    const t = e.touches[0];
    if (t) move(t.clientX, t.clientY);
  }, { passive: true });
  stageEl.addEventListener('touchmove', (e) => {
    const t = e.touches[0];
    if (t) move(t.clientX, t.clientY);
  }, { passive: true });
}

/* ────────────────────────── 面板 ────────────────────────── */

function renderPanel() {
  if (!panelEl) return;
  if (codexOpen) {
    renderCodex();
    return;
  }

  const seenCount = Object.keys(log.seen).length;
  const left = round ? round.birds.length - found.size : 0;
  const c = lastCatch;
  const r = c ? RARITY[c.rarity] || RARITY.C : null;
  const view = missionView(currentSite);
  const doneCount = view.tasks.filter((task) => task.done).length;
  const stampCount = SITES.filter((site) => log.stamps[site.id]).length;

  panelEl.innerHTML = `
    <section class="bd__missions" aria-label="${esc(currentSite.name)}本次观测任务">
      <header class="bd__mission-head">
        <div><span class="g__lab">本次观测任务</span><strong>${esc(currentSite.name)}</strong></div>
        <span>${doneCount} / 3 项 · 总印章 ${stampCount} / ${SITES.length}</span>
      </header>
      <div class="bd__task-grid">
        ${view.tasks.map(
          (task, index) => `<div class="bd__task ${task.done ? 'is-done' : ''} ${missionFlash?.completedNow.includes(task.title) ? 'is-new' : ''}" data-mission="${task.id}" data-progress="${task.current}" data-goal="${task.goal}">
            <span class="bd__task-index">0${index + 1}</span>
            <div class="bd__task-body">
              <strong>${esc(task.title)}</strong>
              <span>${esc(task.detail)}</span>
              <progress max="${task.goal}" value="${task.current}" aria-label="${esc(task.title)}进度 ${task.current}/${task.goal}"></progress>
            </div>
            <b>${task.current} / ${task.goal}</b>
          </div>`
        ).join('')}
      </div>
      <div class="bd__stamp ${view.stamp ? 'is-earned' : ''} ${missionFlash?.stampedNow ? 'is-new' : ''}" data-site-stamp="${view.stamp ? 'earned' : 'pending'}">
        <span class="bd__stamp-mark">${view.stamp ? '已' : '待'}</span>
        <div><strong>${view.stamp ? `${esc(currentSite.name)}观测印章` : '三项完成后盖站点印章'}</strong><span>${
          missionFlash?.stampedNow
            ? '印章与任务进度已写入本地手账'
            : view.stamp
              ? `本地记录 ${esc(String(view.stamp.at).slice(0, 10))}`
              : '换生境不会清空已完成的任务与印章'
        }</span></div>
      </div>
    </section>

    <div class="g__row bd__site-row">
      <div class="g__chips" id="bd-sites">
        ${SITES.map(
          (s) => `
          <button class="chip ${s.id === currentSite.id ? 'is-on' : ''}" data-site="${s.id}" aria-pressed="${s.id === currentSite.id}">
            <span class="chip__n">${s.name}${log.stamps[s.id] ? '<i class="bd__site-done">已盖章</i>' : ''}</span>
            <span class="chip__d">${s.region} · ${habitatLabel(s)}</span>
          </button>`
        ).join('')}
      </div>
    </div>

    <div class="g__row bd__round-row">
      <div class="g__read">
        <span>这一片还有</span><b>${left}</b><span>只没找到</span>
        <span class="g__dot">·</span>
        <span>手账里已记</span><b>${seenCount}</b><span>种</span>
      </div>
      <div class="g__acts">
        <button class="g__go g__go--quiet" id="bd-codex">看全部图鉴</button>
        <button class="g__go" id="bd-again">换一片生境</button>
      </div>
    </div>

    ${
      c
        ? `<div class="g__row bd__record-row">
             <div class="rec" style="--rc:${r.color}">
               <div class="rec__head">
                 <span class="rec__mark">记下了</span>
                 <span class="rec__name">${esc(c.s)}</span>
                 <span class="rec__tag">${r.label}</span>
               </div>
               <div class="rec__sub">${esc(c.en)}</div>
               <p class="rec__tip">${esc(c.tip)}</p>
             </div>
           </div>`
        : `<div class="g__row bd__record-row">
             <span class="g__lab">提示</span>
             <p class="g__note">${esc(currentSite.note)}</p>
           </div>`
    }
  `;

  bindPanel();
}

function bindPanel() {
  panelEl.querySelectorAll('[data-site]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const s = SITES.find((x) => x.id === btn.dataset.site);
      if (!s || s.id === currentSite.id) return;
      currentSite = s;
      codexOpen = false;
      newRound();
      warmUp(currentSite.species.map((x) => x.s));
    });
  });

  panelEl.querySelector('#bd-codex')?.addEventListener('click', () => {
    codexOpen = true;
    renderPanel();
  });

  panelEl.querySelector('#bd-again')?.addEventListener('click', () => {
    newRound();
  });
}

/* ────────────────────────── 图鉴 ────────────────────────── */

function renderCodex() {
  const all = allSpecies();
  const seen = log.seen;
  const seenCount = Object.keys(seen).length;
  const byRarity = { X: [], M: [], R: [], U: [], C: [] };
  all.forEach((sp) => {
    const k = sp.r || 'C';
    if (byRarity[k]) byRarity[k].push(sp);
  });

  panelEl.innerHTML = `
    <div class="g__row">
      <div class="g__read">
        <span>全部</span><b>${TOTAL_SPECIES}</b><span>种，已记</span><b>${seenCount}</b><span>种</span>
      </div>
      <button class="g__go g__go--quiet" id="bd-back">返回生境</button>
    </div>
    <div class="g__row" style="max-height:34vh;overflow-y:auto">
      <div style="width:100%">
        ${['X', 'M', 'R', 'U', 'C']
          .map((k) => {
            const list = byRarity[k];
            if (!list.length) return '';
            const r = RARITY[k];
            return `
            <section class="codex__group">
              <h4 class="codex__gh" style="--rc:${r.color}">
                <span class="codex__gb">${r.label}</span>
                <span class="codex__gd">${r.desc}</span>
                <span class="codex__gc">${list.filter((s) => seen[s.s]).length} / ${list.length}</span>
              </h4>
              <div class="codex__grid">
                ${list
                  .map((sp) => {
                    const got = !!seen[sp.s];
                    const thumb = got ? stickerUrl(sp.s) : '';
                    return `<div class="cg ${got ? 'is-got' : ''}">
                      ${
                        thumb
                          ? `<img class="cg__pic" src="${thumb}" alt="${sp.s}" decoding="async" />`
                          : `<span class="cg__pic cg__pic--none">${got ? '·' : '？'}</span>`
                      }
                      <span class="cg__n">${got ? sp.s : '？'}</span>
                      <span class="cg__s">${got ? sp.sites.slice(0, 2).join(' / ') : '未记录'}</span>
                    </div>`;
                  })
                  .join('')}
              </div>
            </section>`;
          })
          .join('')}
      </div>
    </div>
  `;

  panelEl.querySelector('#bd-back')?.addEventListener('click', () => {
    codexOpen = false;
    renderPanel();
  });
}
