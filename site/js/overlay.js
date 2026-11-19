/**
 * overlay.js — 点位详情覆盖层
 *
 * 用数据渲染，不写死在 HTML 里。内容全部来自 data/points.js。
 */

import { renderScene } from './scenes.js';

let overlayEl = null;
let bodyEl = null;
let crumbEl = null;
let lastFocus = null;
let onCloseCb = null;

/** 初始化，只在 app.js 里调用一次 */
export function initOverlay() {
  overlayEl = document.getElementById('overlay');
  bodyEl = document.getElementById('overlay-body');
  crumbEl = document.getElementById('overlay-crumb');

  if (!overlayEl) return;

  const closeBtn = document.getElementById('overlay-close');
  closeBtn?.addEventListener('click', () => closeOverlay());

  // 点击空白处关闭（点在内容上不关）
  overlayEl.addEventListener('click', (e) => {
    if (e.target === overlayEl) closeOverlay();
  });

  // Esc 关闭
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !overlayEl.hidden) {
      e.preventDefault();
      closeOverlay();
    }
  });

  // 焦点陷阱
  overlayEl.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;
    const focusables = overlayEl.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  });
}

/** 打开某个点位 */
export function openSite(point, index, total) {
  if (!overlayEl) return;
  lastFocus = document.activeElement;

  crumbEl.textContent = `第 ${pad(index + 1)} 站 · 共 ${pad(total)} 站`;

  bodyEl.innerHTML = renderSiteHTML(point, index, total);
  bodyEl.scrollTop = 0;

  overlayEl.hidden = false;
  document.body.style.overflow = 'hidden';
  requestAnimationFrame(() => overlayEl.classList.add('is-open'));

  // 渲染手绘场景
  const canvas = bodyEl.querySelector('.site__art canvas');
  if (canvas) {
    requestAnimationFrame(() => {
      renderScene(canvas, point.scene, Math.min(window.devicePixelRatio || 1, 2.4));
    });
  }

  // 前后导航
  bodyEl.querySelector('[data-nav="prev"]')?.addEventListener('click', () => {
    if (onCloseCb) onCloseCb('prev', index);
  });
  bodyEl.querySelector('[data-nav="next"]')?.addEventListener('click', () => {
    if (onCloseCb) onCloseCb('next', index);
  });

  document.getElementById('overlay-close')?.focus();
}

/** 打开账本游戏 */
export function openLedgerPanel() {
  if (!overlayEl) return;
  lastFocus = document.activeElement;
  crumbEl.textContent = '一亩山的账本 · 推演';

  bodyEl.innerHTML = `
    <div class="ledger" id="ledger-root">
      <div class="ledger__stage"><canvas id="ledger-canvas"></canvas></div>
      <div class="ledger__panel" id="ledger-panel"></div>
    </div>
  `;

  overlayEl.hidden = false;
  document.body.style.overflow = 'hidden';
  requestAnimationFrame(() => overlayEl.classList.add('is-open'));
  document.getElementById('overlay-close')?.focus();
}

export function closeOverlay() {
  if (!overlayEl || overlayEl.hidden) return;
  overlayEl.classList.remove('is-open');
  document.body.style.overflow = '';
  setTimeout(() => {
    overlayEl.hidden = true;
    bodyEl.innerHTML = '';
  }, 300);
  if (lastFocus && lastFocus.focus) {
    try {
      lastFocus.focus();
    } catch (_) {
      /* 元素已移除 */
    }
  }
}

/** 供外部注册「切换点位」的回调 */
export function onNavigate(cb) {
  onCloseCb = cb;
}

export function isOverlayOpen() {
  return overlayEl && !overlayEl.hidden;
}

/* ────────────────────────── 渲染 ────────────────────────── */

function pad(n) {
  return String(n).padStart(2, '0');
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function renderSiteHTML(p, index, total) {
  const statsHTML = (p.data || [])
    .map(
      (d) => `
      <div class="stat">
        <span class="stat__k">${esc(d.k)}</span>
        <span class="stat__v">${esc(d.v)}${d.unit ? `<small>${esc(d.unit)}</small>` : ''}</span>
        ${d.note ? `<span class="stat__note">${esc(d.note)}</span>` : ''}
        ${d.source ? `<span class="stat__src">来源 · ${esc(d.source)}</span>` : ''}
      </div>`
    )
    .join('');

  const quoteHTML = p.quote
    ? `<div class="quote-block">
         ${esc(p.quote.text)}
         ${p.quote.cite ? `<cite>${esc(p.quote.cite)}</cite>` : ''}
       </div>`
    : '';

  // 本组自己的话，和领导人引语在视觉上必须分开
  const noteHTML = p.note
    ? `<div class="note-block">
         <span class="note-block__tag">本组札记</span>
         <p class="note-block__text">${esc(p.note.text)}</p>
         ${p.note.cite ? `<cite>${esc(p.note.cite)}</cite>` : ''}
       </div>`
    : '';

  const storyHTML = (p.story || []).map((para) => `<p>${esc(para)}</p>`).join('');

  const prev = index > 0 ? `<button class="btn btn--ghost" data-nav="prev">← 上一站</button>` : '<span></span>';
  const next =
    index < total - 1
      ? `<button class="btn btn--ghost" data-nav="next">下一站 →</button>`
      : `<button class="btn btn--ghost" data-nav="prev">回看上一站</button>`;

  return `
    <article class="site">
      <div class="site__art">
        <canvas role="img" aria-label="${esc(p.name)}的手绘场景"></canvas>
      </div>
      <div class="site__text">
        <div class="site__kicker">
          <span>${pad(index + 1)}</span>
          <span class="dot" aria-hidden="true"></span>
          <span>${esc(p.region || '')}</span>
          ${p.mine ? '<span aria-hidden="true">·</span><span>本组调研点</span>' : ''}
        </div>
        <h1 class="site__title">${esc(p.name)}</h1>
        <p class="site__tag">${esc(p.tag || '')}</p>

        <div class="site__body">
          ${storyHTML}
        </div>

        ${p.data && p.data.length ? `<div class="stats">${statsHTML}</div>` : ''}

        ${quoteHTML}

        ${noteHTML}

        ${p.source ? `<p class="src">${esc(p.source)}</p>` : ''}

        <div class="site__nav">
          ${prev}
          ${next}
        </div>
      </div>
    </article>
  `;
}
