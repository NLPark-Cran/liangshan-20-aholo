/**
 * app.js — 入口：装配所有模块
 *
 * 长卷结构按真实手卷来：
 *   卷首（浙江全省，比例正确）→ 六段独立画面 → 卷尾
 * 手卷不是一张连续的地图，是一连串各自的构图，中间用云气隔开。
 */

import { buildShapes, computeBBox, makeMapper, drawProvince, textureTerrain, drawCompass } from './geo.js';
import { inkStroke, seal, mulberry32, mistBand, treeClump } from './brush.js';
import { ScrollController } from './scroll.js';
import { initOverlay, openSite, closeOverlay, onNavigate } from './overlay.js';
import { paintScene } from './scenes.js';
import { openLedger, closeLedger } from './ledger.js';
import { initBirding, openBirding, closeBirding } from './birding.js';
import { openTern, closeTern } from './tern.js';
import { exportMap, downloadBlob } from './export.js';
import POINTS, { SITE_COORDS } from './points.js';
import { initAuthUI, openPanel, toast } from './auth-ui.js';
import { initStats, openStats } from './stats-ui.js';
import { initJourney, openJourney } from './journey.js';
import { auth, track } from './api.js';

/* ────────────────────────── 全局状态 ────────────────────────── */

const state = {
  geojson: null,
  scroll: null,
  scrollPoints: [],
  panels: [],
  mapper: null,
  resizeObserver: null,
  lastViewport: { w: 0, h: 0 },
};

/* ────────────────────────── 启动 ────────────────────────── */

document.addEventListener('DOMContentLoaded', () => {
  init().catch((err) => {
    console.error(err);
    document.getElementById('boot')?.classList.add('is-done');
  });
});

async function init() {
  // 首屏与长卷先建立，身份接口和地理数据在后台并行，不阻塞入口。
  const failsafe = setTimeout(() => {
    document.getElementById('boot')?.classList.add('is-done');
  }, 4000);

  initOverlay();
  initBirding();
  initStats();
  initJourney();
  bindGlobalButtons();
  drawHeroArt();
  drawHeroSeal();
  buildScroll();

  const authTask = (async () => {
    await initAuthUI();
    bindAuthEvents();
  })().catch((err) => console.error('身份模块载入失败', err));

  const geoTask = (async () => {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 8000);
      const res = await fetch('data/zhejiang.json', { signal: ctrl.signal });
      if (!res.ok) throw new Error(`边界数据 HTTP ${res.status}`);
      state.geojson = await res.json();
      clearTimeout(timer);
      const cover = state.panels[0];
      if (cover) {
        cover.drawn = false;
        ensurePanelDrawn(0);
      }
    } catch (err) {
      console.error('边界数据载入失败', err);
    }
  })();

  clearTimeout(failsafe);
  requestAnimationFrame(() => document.getElementById('boot')?.classList.add('is-done'));
  await Promise.allSettled([authTask, geoTask]);

  requestAnimationFrame(() => requestAnimationFrame(drawHeroArt));
}

/** 登录态变化时，把已经开着的面板同步一下 */
function bindAuthEvents() {
  window.addEventListener('auth:change', () => {
    // 观鸟手账的进度条依赖登录态，重新渲染一次
    const birdOpen = !document.getElementById('birdlog')?.hidden;
    if (birdOpen) {
      // birding 模块自己会读 auth，不需要额外动作；这里只提示
      toast('身份已更新');
    }
  });

  // 需要注册账号时，直接弹注册面板
  window.addEventListener('auth:need-member', () => {
    openPanel(auth.user?.kind === 'guest' ? 'upgrade' : 'register');
  });
}

/* ────────────────────────── 按钮 ────────────────────────── */

function bindGlobalButtons() {
  document.getElementById('btn-enter')?.addEventListener('click', () => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    document.getElementById('scroll-anchor')?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' });
  });

  document.getElementById('btn-journey')?.addEventListener('click', () => {
    track('open:journey');
    openJourney();
  });
  document.getElementById('btn-ledger')?.addEventListener('click', () => {
    track('open:ledger');
    openLedger();
  });
  document.getElementById('btn-birds')?.addEventListener('click', () => {
    track('open:birds');
    openBirding();
  });
  document.getElementById('btn-tern')?.addEventListener('click', () => {
    track('open:tern');
    openTern();
  });
  document.getElementById('btn-stats')?.addEventListener('click', () => {
    track('open:stats');
    openStats();
  });

  document.getElementById('ledger-close')?.addEventListener('click', () => closeLedger());
  document.getElementById('bird-close')?.addEventListener('click', () => closeBirding());
  document.getElementById('tern-close')?.addEventListener('click', () => closeTern());

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!document.getElementById('ledgerlog')?.hidden) closeLedger();
    if (!document.getElementById('birdlog')?.hidden) closeBirding();
    if (!document.getElementById('ternlog')?.hidden) closeTern();
  });

  document.getElementById('btn-export')?.addEventListener('click', doExport);

  onNavigate((dir, idx) => {
    const next = dir === 'next' ? idx + 1 : idx - 1;
    if (next < 0 || next >= POINTS.length) {
      closeOverlay();
      return;
    }
    openSite(POINTS[next], next, POINTS.length);
    state.scroll?.focusIndex(next + 1, true);
  });

  // 导出时记一次，看看有多少人真的拿走了图
  document.getElementById('btn-export')?.addEventListener('click', () => track('export:png'), { once: true });
}

/* ────────────────────────── 首屏装饰 ────────────────────────── */

function drawHeroArt() {
  const cv = document.getElementById('hero-bg');
  if (!cv) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  // 只量 .hero。canvas 的 width/height 属性会变成它的固有尺寸，
  // 一旦量自己就会读到上一轮放大后的值，每重绘一次再涨一圈。
  const parent = cv.parentElement;
  const prect = parent ? parent.getBoundingClientRect() : null;
  const w = Math.max(prect ? prect.width : 0, 320);
  const h = Math.max(prect ? prect.height : 0, 320);
  // CSS 已经把画布锁成 100%×100%。这里只设位图分辨率，
  // 不再让属性值反过来决定布局尺寸。
  cv.width = Math.round(w * dpr);
  cv.height = Math.round(h * dpr);
  const ctx = cv.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  const rnd = mulberry32(2005);
  const mobile = w < 820;
  const startX = mobile ? 0 : w * 0.31;
  const artW = w - startX;

  // 左侧保留文字安全区，右侧用近山、水岸与树丛形成视觉主角。
  for (let l = 0; l < 3; l++) {
    const baseY = h * ((mobile ? 0.7 : 0.58) + l * 0.075);
    const amp = h * (0.13 - l * 0.024);
    const pts = [];
    const p1 = rnd() * 6.28;
    const p2 = rnd() * 6.28;
    for (let i = 0; i <= 56; i++) {
      const t = i / 56;
      const ridge = Math.sin(t * 3.2 + p1) * 0.58 + Math.sin(t * 7.1 + p2) * 0.25;
      pts.push([startX + artW * t, baseY - (ridge * 0.5 + 0.5) * amp]);
    }
    inkStroke(ctx, pts, {
      color: '#3a3f38',
      width: 1.8 - l * 0.3,
      alpha: 0.16 + l * 0.045,
      seed: 300 + l * 17,
      wobble: 1.4,
      dry: 0.2,
      layers: 1,
      taper: false,
      step: 5,
    });
  }

  const ridge = [];
  for (let i = 0; i <= 64; i++) {
    const t = i / 64;
    const peakA = Math.exp(-Math.pow((t - 0.64) * 5.2, 2));
    const peakB = Math.exp(-Math.pow((t - 0.88) * 7.4, 2)) * 0.64;
    const foot = Math.sin(t * Math.PI) * 0.08;
    ridge.push([startX + artW * t, h * 0.82 - (peakA + peakB + foot) * h * (mobile ? 0.2 : 0.31)]);
  }
  ctx.beginPath();
  ctx.moveTo(ridge[0][0], ridge[0][1]);
  ridge.slice(1).forEach(([x, y]) => ctx.lineTo(x, y));
  ctx.lineTo(w, h * 0.92);
  ctx.lineTo(startX, h * 0.92);
  ctx.closePath();
  const wash = ctx.createLinearGradient(0, h * 0.48, 0, h * 0.92);
  wash.addColorStop(0, 'rgba(58,63,56,0.12)');
  wash.addColorStop(0.62, 'rgba(90,98,91,0.07)');
  wash.addColorStop(1, 'rgba(244,239,228,0)');
  ctx.fillStyle = wash;
  ctx.fill();
  inkStroke(ctx, ridge, {
    color: '#333a35', width: 2.3, alpha: 0.34, seed: 514,
    wobble: 1.1, dry: 0.17, layers: 2, taper: false, step: 4,
  });

  for (let i = 0; i < 7; i++) {
    const x = startX + artW * (0.53 + i * 0.067);
    const y = h * (0.79 + (i % 3) * 0.014);
    treeClump(ctx, x, y, {
      r: Math.max(12, artW * (0.018 + (i % 2) * 0.006)),
      count: 24 + (i % 3) * 8,
      seed: 610 + i * 19,
      alpha: 0.24,
    });
  }

  mistBand(ctx, { x: startX, y: h * 0.69, w: artW, h: h * 0.1 }, { alpha: 0.48, seed: 77, bands: 4 });

  for (let i = 0; i < 12; i++) {
    const y = h * (0.86 + i * 0.007);
    const x = startX + artW * (0.12 + rnd() * 0.26);
    const len = artW * (0.26 + rnd() * 0.48);
    inkStroke(ctx, [[x, y], [x + len * 0.52, y - 1.5], [x + len, y]], {
      color: '#6d8f8a', width: 0.85, alpha: 0.17, seed: 900 + i,
      dry: 0.35, layers: 1, taper: false, step: 9,
    });
  }
}

function drawHeroSeal() {
  const cv = document.getElementById('hero-seal');
  if (!cv) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const size = 52;
  cv.width = size * dpr;
  cv.height = size * dpr;
  const ctx = cv.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, size, size);
  seal(ctx, size / 2, size / 2, {
    size: size * 0.94,
    text: '两山',
    color: '#9d3a30',
    alpha: 0.82,
    seed: 31,
    rotate: -0.045,
  });
}

/* ────────────────────────── 长卷装配 ────────────────────────── */

function buildScroll() {
  const viewport = document.getElementById('scroll-viewport');
  const track = document.getElementById('scroll-track');
  const railLine = document.getElementById('rail-line');
  if (!viewport || !track || state.scroll) return;

  const vw = viewport.clientWidth || window.innerWidth;
  const segs = [
    { kind: 'cover', title: '卷首', w: vw * 1.05 },
    ...POINTS.map((p, i) => ({ kind: 'site', point: p, index: i, title: p.name, w: vw })),
    { kind: 'tail', title: '卷尾', w: vw * 0.78 },
  ];

  state.panels = [];
  track.innerHTML = '';
  let acc = 0;

  segs.forEach((seg, si) => {
    const el = document.createElement('section');
    el.className = `panel panel--${seg.kind}`;
    el.style.width = `${seg.w}px`;
    el.setAttribute('aria-label', seg.title);

    const cv = document.createElement('canvas');
    cv.className = 'panel__canvas';
    el.appendChild(cv);

    if (seg.kind === 'site') {
      const cap = document.createElement('div');
      cap.className = 'panel__cap';
      cap.innerHTML = `
        <span class="panel__idx num">${String(seg.index + 1).padStart(2, '0')}</span>
        <button class="panel__name" data-open="${seg.index}">${seg.point.name}</button>
        <span class="panel__region">${seg.point.region}</span>
        <span class="panel__tagline">${seg.point.tag}</span>
      `;
      el.appendChild(cap);
      cap.querySelector('[data-open]')?.addEventListener('click', () => {
        openSite(seg.point, seg.index, POINTS.length);
      });
    }

    if (seg.kind === 'cover') {
      const cap = document.createElement('div');
      cap.className = 'panel__cover';
      cap.innerHTML = `
        <p class="panel__coverkicker">浙 江</p>
        <h2 class="panel__covertitle">十 地</h2>
        <p class="panel__coverdesc">从一条江的源头，到一座被关掉的矿，到一块租给城里人的菜地，再到一座把海水里的碳卖出去的岛。</p>
      `;
      el.appendChild(cap);
    }

    if (seg.kind === 'tail') {
      const cap = document.createElement('div');
      cap.className = 'panel__tail';
      cap.innerHTML = `
        <p class="panel__tailtext">山还是那座山<br>算法已经换过了</p>
        <p class="panel__tailnote">长卷看完，可以继续读展卷说明，也可以回到卷首。</p>
        <div class="panel__tailactions">
          <button class="btn btn--ghost" type="button" data-tail="colophon">继续阅读</button>
          <button class="btn btn--ghost" type="button" data-tail="cover">返回卷首</button>
        </div>
      `;
      el.appendChild(cap);
      cap.querySelector('[data-tail="colophon"]')?.addEventListener('click', () => {
        const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        document.getElementById('colophon')?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' });
      });
      cap.querySelector('[data-tail="cover"]')?.addEventListener('click', () => state.scroll?.focusIndex(0, true));
    }

    track.appendChild(el);
    state.panels.push({
      el,
      canvas: cv,
      kind: seg.kind,
      point: seg.point,
      index: seg.index ?? si,
      x: acc,
      w: seg.w,
      drawn: false,
      drawQueued: false,
    });
    acc += seg.w;
  });

  state.scrollPoints = state.panels.map((panel) => ({
    id: panel.point?.id || panel.kind,
    name: panel.point?.name || (panel.kind === 'cover' ? '卷首' : '卷尾'),
    u: (panel.x + panel.w / 2) / acc,
  }));

  if (railLine) {
    railLine.innerHTML = '';
    state.scrollPoints.forEach((p, i) => {
      const tick = document.createElement('button');
      tick.className = 'scroll__tick';
      tick.type = 'button';
      tick.setAttribute('aria-label', `跳到 ${p.name}`);
      tick.addEventListener('click', () => state.scroll?.focusIndex(i, true));
      railLine.appendChild(tick);
    });
  }
  layoutScrollTicks();

  state.scroll = new ScrollController({
    viewport,
    track,
    points: state.scrollPoints,
    onFocus: updateScrollFocus,
    onInteraction: () => document.getElementById('hintbar')?.classList.add('is-hidden'),
    onProgress: (ratio) => {
      const value = Math.max(0, Math.min(1, ratio || 0));
      railLine?.style.setProperty('--progress', `${value * 100}%`);
      railLine?.style.setProperty('--progress-scale', String(value));
    },
  });

  document.getElementById('btn-prev')?.addEventListener('click', () => {
    state.scroll.focusIndex(Math.max(0, state.scroll.activeIndex - 1), true);
  });
  document.getElementById('btn-next')?.addEventListener('click', () => {
    state.scroll.focusIndex(Math.min(state.scrollPoints.length - 1, state.scroll.activeIndex + 1), true);
  });

  updateScrollFocus(0);
  state.scroll.focusIndex(0, false);
  observeScrollResize(viewport);
}

function updateScrollFocus(index) {
  document.querySelectorAll('.scroll__tick').forEach((tick, i) => {
    tick.classList.toggle('is-active', i === index);
    if (i === index) tick.setAttribute('aria-current', 'step');
    else tick.removeAttribute('aria-current');
  });
  state.panels.forEach((panel, i) => panel.el.classList.toggle('is-current', i === index));
  const prev = document.getElementById('btn-prev');
  const next = document.getElementById('btn-next');
  if (prev) prev.disabled = index <= 0;
  if (next) next.disabled = index >= state.scrollPoints.length - 1;
  [index - 1, index, index + 1].forEach(ensurePanelDrawn);
}

function ensurePanelDrawn(index) {
  const panel = state.panels[index];
  if (!panel || panel.drawn || panel.drawQueued) return;
  panel.drawQueued = true;
  requestAnimationFrame(() => {
    panel.drawQueued = false;
    drawPanel(panel, state.panels.length, index);
    panel.drawn = true;
    if (panel.kind === 'cover') addCoverMarks(panel);
  });
}

function layoutScrollTicks() {
  const viewport = document.getElementById('scroll-viewport');
  const vw = viewport?.clientWidth || window.innerWidth;
  const trackW = state.panels.reduce((sum, panel) => sum + panel.w, 0);
  const distance = Math.max(1, trackW - vw);
  document.querySelectorAll('.scroll__tick').forEach((tick, i) => {
    const panel = state.panels[i];
    if (!panel) return;
    const target = Math.max(vw - trackW, Math.min(0, vw * 0.5 - (panel.x + panel.w / 2)));
    tick.style.left = `${(Math.abs(target) / distance) * 100}%`;
  });
}

function addCoverMarks(panel) {
  panel.el.querySelectorAll('.panel__mapmark').forEach((el) => el.remove());
  if (!state.mapper) return;
  POINTS.forEach((point, i) => {
    const coord = SITE_COORDS[point.id];
    if (!coord) return;
    const [x, y] = state.mapper.toPx(coord.lon, coord.lat);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'panel__mapmark';
    btn.dataset.open = String(i);
    btn.style.left = `${x}px`;
    btn.style.top = `${y}px`;
    btn.textContent = String(i + 1).padStart(2, '0');
    btn.setAttribute('aria-label', `打开${point.name}`);
    btn.addEventListener('click', () => openSite(point, i, POINTS.length));
    panel.el.appendChild(btn);
  });
}

function observeScrollResize(viewport) {
  state.resizeObserver?.disconnect();
  state.lastViewport = { w: viewport.clientWidth, h: viewport.clientHeight };
  let frame = null;
  state.resizeObserver = new ResizeObserver((entries) => {
    const rect = entries[0]?.contentRect;
    if (!rect) return;
    const last = state.lastViewport;
    if (Math.abs(rect.width - last.w) < 2 && Math.abs(rect.height - last.h) < 2) return;
    state.lastViewport = { w: rect.width, h: rect.height };
    if (frame) cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      const vw = viewport.clientWidth || window.innerWidth;
      let acc = 0;
      state.panels.forEach((panel, i) => {
        panel.w = vw * (i === 0 ? 1.05 : i === state.panels.length - 1 ? 0.78 : 1);
        panel.x = acc;
        panel.el.style.width = `${panel.w}px`;
        panel.drawn = false;
        acc += panel.w;
      });
      state.scrollPoints.forEach((point, i) => {
        const panel = state.panels[i];
        point.u = (panel.x + panel.w / 2) / acc;
      });
      layoutScrollTicks();
      state.scroll?.measure();
      state.scroll?.focusIndex(state.scroll.activeIndex, false);
      updateScrollFocus(state.scroll?.activeIndex || 0);
    });
  });
  state.resizeObserver.observe(viewport);
}

/* ────────────────────────── 单段绘制 ────────────────────────── */

function drawPanel(panel, total, index) {
  const cv = panel.canvas;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const rect = panel.el.getBoundingClientRect();
  const w = Math.max(rect.width, 320);
  const h = Math.max(rect.height || panel.el.clientHeight, 320);

  cv.width = Math.round(w * dpr);
  cv.height = Math.round(h * dpr);
  cv.style.width = `${w}px`;
  cv.style.height = `${h}px`;

  const ctx = cv.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  if (panel.kind === 'cover') {
    drawCoverPanel(ctx, w, h);
  } else if (panel.kind === 'site') {
    // 站点：手绘场景，等比绘制（内部已做虚拟尺寸换算）
    ctx.fillStyle = '#f4efe4';
    ctx.fillRect(0, 0, w, h);
    paintScene(ctx, panel.point.scene, w, h, (panel.index + 3) * 977 + 1001);
    // 右侧留白渐隐，让文字不压画面。
    // 起点定在 0.58：太靠左会把画面大半盖住，构图展不开。
    const g = ctx.createLinearGradient(w * 0.58, 0, w, 0);
    g.addColorStop(0, 'rgba(244,239,228,0)');
    g.addColorStop(0.62, 'rgba(244,239,228,0.55)');
    g.addColorStop(1, 'rgba(244,239,228,0.92)');
    ctx.fillStyle = g;
    ctx.fillRect(w * 0.58, 0, w * 0.42, h);
  } else {
    drawTailPanel(ctx, w, h);
  }

  // 段与段之间用云气接缝
  if (index > 0) {
    const seam = ctx.createLinearGradient(0, 0, Math.min(w * 0.22, 220), 0);
    seam.addColorStop(0, 'rgba(244,239,228,0.95)');
    seam.addColorStop(1, 'rgba(244,239,228,0)');
    ctx.fillStyle = seam;
    ctx.fillRect(0, 0, Math.min(w * 0.22, 220), h);
  }
  if (index < total - 1) {
    const seamR = ctx.createLinearGradient(w, 0, w - Math.min(w * 0.22, 220), 0);
    seamR.addColorStop(0, 'rgba(244,239,228,0.95)');
    seamR.addColorStop(1, 'rgba(244,239,228,0)');
    ctx.fillStyle = seamR;
    ctx.fillRect(w - Math.min(w * 0.22, 220), 0, Math.min(w * 0.22, 220), h);
  }
}

/** 卷首：浙江全省，比例正确，各点位落真实经纬度 */
function drawCoverPanel(ctx, w, h) {
  if (!state.geojson) {
    ctx.fillStyle = '#f4efe4';
    ctx.fillRect(0, 0, w, h);
    return;
  }

  // 全省按高度占 74% 来定尺寸，保持真实比例
  const box = { x: w * 0.24, y: h * 0.1, w: w * 0.62, h: h * 0.8 };

  const bbox = computeBBox(state.geojson, 0.02);
  const mapper = makeMapper(bbox, box, false);
  state.mapper = mapper;

  const shapes = buildShapes(state.geojson, mapper);
  drawProvince(ctx, shapes, {
    fill: '#7c9160',
    fillAlpha: 0.12,
    stroke: '#2b2f2b',
    strokeWidth: 1.9,
    strokeAlpha: 0.72,
    seed: 100,
  });
  textureTerrain(ctx, shapes, { color: '#5a625b', alpha: 0.15, seed: 200, perShape: 70 });

  // 点位：真实经纬度
  POINTS.forEach((p, i) => {
    const c = SITE_COORDS[p.id];
    if (!c) return;
    const [x, y] = mapper.toPx(c.lon, c.lat);

    // 引线朝右下，与序号对齐
    const dx = 15;
    const dy = 15;
    ctx.save();
    ctx.strokeStyle = 'rgba(157,58,48,0.26)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(x + 2, y + 2);
    ctx.lineTo(x + dx, y + dy);
    ctx.lineTo(x + dx + 16, y + dy);
    ctx.stroke();

    // 点
    ctx.fillStyle = p.mine ? '#b8912f' : '#9d3a30';
    ctx.beginPath();
    ctx.arc(x, y, 3.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(244,239,228,0.92)';
    ctx.lineWidth = 1.4;
    ctx.stroke();

    // 序号
    ctx.fillStyle = 'rgba(90,98,91,0.78)';
    ctx.font = '8px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(i + 1).padStart(2, '0'), x + dx + 19, y + dy);
    ctx.restore();
  });

  drawCompass(ctx, w * 0.94, h * 0.16, { size: 26, alpha: 0.4, seed: 301 });
}

/** 卷尾：一片空山，收笔 */
function drawTailPanel(ctx, w, h) {
  const rnd = mulberry32(7331);
  ctx.fillStyle = '#f4efe4';
  ctx.fillRect(0, 0, w, h);

  const pts = [];
  const seg = 50;
  const p1 = rnd() * 6.28;
  const p2 = rnd() * 6.28;
  for (let i = 0; i <= seg; i++) {
    const t = i / seg;
    const ridge =
      Math.sin(t * 2.6 + p1) * 0.6 + Math.sin(t * 5.9 + p2) * 0.26 + Math.sin(t * 10.4) * 0.1;
    pts.push([w * t, h * 0.62 - (ridge * 0.5 + 0.5) * h * 0.17]);
  }
  inkStroke(ctx, pts, {
    color: '#3a3f38',
    width: 1.5,
    alpha: 0.34,
    seed: 811,
    wobble: 1.2,
    dry: 0.16,
    layers: 1,
    taper: false,
  });

  // 几棵树
  for (let i = 0; i < 5; i++) {
    treeClump(ctx, w * (0.3 + i * 0.1), h * (0.68 + rnd() * 0.08), {
      r: w * 0.024,
      count: 26,
      seed: 900 + i * 13,
      alpha: 0.26,
    });
  }

  inkStroke(ctx, [[0, h * 0.86], [w * 0.5, h * 0.82], [w, h * 0.87]], {
    color: '#8d948a',
    width: 1.1,
    alpha: 0.28,
    seed: 913,
    dry: 0.3,
    layers: 1,
  });
}

/* ────────────────────────── 导出 ────────────────────────── */

async function doExport() {
  const btn = document.getElementById('btn-export');
  if (!btn) return;
  const old = btn.innerHTML;

  if (!state.geojson) {
    btn.innerHTML = '<span>数据未就绪</span>';
    setTimeout(() => {
      btn.innerHTML = old;
    }, 1800);
    return;
  }

  btn.innerHTML = '<span>渲染中…</span>';
  btn.disabled = true;

  try {
    const pts = POINTS.map((p, i) => ({
      name: p.name,
      lon: SITE_COORDS[p.id]?.lon ?? 120,
      lat: SITE_COORDS[p.id]?.lat ?? 29.5,
      index: i,
    }));

    const { blob, width, height } = await exportMap({
      geojson: state.geojson,
      points: pts,
      dpi: 300,
      logical: { w: 900, h: 600 },
      scale: 4,
    });

    downloadBlob(blob, `两山二十年-手绘地图-${width}x${height}-300dpi.png`);
    btn.innerHTML = '<span>已导出</span>';
    setTimeout(() => {
      btn.innerHTML = old;
      btn.disabled = false;
    }, 2200);
  } catch (e) {
    console.error(e);
    btn.innerHTML = '<span>导出失败</span>';
    setTimeout(() => {
      btn.innerHTML = old;
      btn.disabled = false;
    }, 2200);
  }
}

let heroResizeFrame = null;
window.addEventListener('resize', () => {
  if (heroResizeFrame) cancelAnimationFrame(heroResizeFrame);
  heroResizeFrame = requestAnimationFrame(() => {
    heroResizeFrame = null;
    drawHeroArt();
  });
});
