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

function loadLog() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return { seen: {}, notes: [] };
    const d = JSON.parse(raw);
    return { seen: d.seen || {}, notes: d.notes || [] };
  } catch (_) {
    return { seen: {}, notes: [] };
  }
}

function saveLog(log) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(log));
  } catch (_) {
    /* 存储不可用就静默降级，功能仍可玩 */
  }
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
let opening = false;
let codexOpen = false;

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
  found = new Set();
  lastCatch = null;
  lens = { x: -999, y: -999, active: false };
  t0 = performance.now();
  hideHint(false);
  renderPanel();

  // 贴图要下载 + 处理，先画手绘轮廓顶着，就绪后自动换成真图
  const urls = round.birds.map((b) => b._img).filter(Boolean);
  if (urls.length) preloadBirds(urls);
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
  saveLog(log);

  lastCatch = { ...b, key };
  renderPanel();
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

function bindStage() {
  if (!stageEl) return;
  const move = (clientX, clientY) => {
    const r = canvasEl.getBoundingClientRect();
    lens.x = clientX - r.left;
    lens.y = clientY - r.top;
    lens.active = true;
    // 第一只之前给一句话，之后收回
    if (!found.size) hideHint(true);
  };

  stageEl.addEventListener('pointermove', (e) => move(e.clientX, e.clientY));
  stageEl.addEventListener('pointerdown', (e) => move(e.clientX, e.clientY));
  stageEl.addEventListener('pointerleave', () => {
    lens.active = false;
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

  panelEl.innerHTML = `
    <div class="g__row">
      <div class="g__chips" id="bd-sites">
        ${SITES.map(
          (s) => `
          <button class="chip ${s.id === currentSite.id ? 'is-on' : ''}" data-site="${s.id}">
            <span class="chip__n">${s.name}</span>
            <span class="chip__d">${s.region} · ${habitatLabel(s)}</span>
          </button>`
        ).join('')}
      </div>
    </div>

    <div class="g__row">
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
        ? `<div class="g__row">
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
        : `<div class="g__row">
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
