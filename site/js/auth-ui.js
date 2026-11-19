/**
 * auth-ui.js — 账号界面：游客一键进、注册、登录、退出
 *
 * 定位：不打断阅读。首屏右上角一个很轻的身份条，
 * 没登录时点它展开，游客一键进不填任何东西。
 */

import {
  auth,
  guestLogin,
  register,
  login,
  logout,
  fetchMe,
  errText,
  checkHealth,
} from './api.js';

let rootEl = null;
let panelEl = null;
let toastEl = null;

/* ────────────────────────── 初始化 ────────────────────────── */

export async function initAuthUI() {
  rootEl = document.getElementById('authbar');
  panelEl = document.getElementById('authpanel');
  toastEl = document.getElementById('toast');
  if (!rootEl) return;

  await checkHealth();
  if (auth.online) await fetchMe();

  renderBar();
  bindPanel();
}

/* ────────────────────────── 身份条 ────────────────────────── */

function renderBar() {
  if (!rootEl) return;

  if (!auth.online) {
    rootEl.innerHTML = `
      <span class="authbar__off" title="后端未连接，成绩只保存在这台设备">
        本地模式
      </span>
    `;
    return;
  }

  const u = auth.user;

  if (!u) {
    rootEl.innerHTML = `
      <button class="authbar__btn" id="auth-open">
        登录 <span class="authbar__sep">/</span> 游客
      </button>
    `;
    rootEl.querySelector('#auth-open')?.addEventListener('click', () => openPanel('guest'));
    return;
  }

  const isGuest = u.kind === 'guest';
  rootEl.innerHTML = `
    <button class="authbar__user" id="auth-open">
      <span class="authbar__dot ${isGuest ? 'is-guest' : 'is-member'}"></span>
      <span class="authbar__name">${esc(u.nickname)}</span>
      ${isGuest ? '<span class="authbar__tag">游客</span>' : ''}
    </button>
  `;
  rootEl.querySelector('#auth-open')?.addEventListener('click', () => openPanel(isGuest ? 'upgrade' : 'account'));
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

/* ────────────────────────── 面板 ────────────────────────── */

function bindPanel() {
  if (!panelEl) return;

  panelEl.addEventListener('click', (e) => {
    if (e.target === panelEl) closePanel();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !panelEl.hidden) closePanel();
  });

  panelEl.addEventListener('click', async (e) => {
    const t = e.target;

    if (t.closest('#ap-guest')) {
      await doGuest();
      return;
    }
    if (t.closest('#ap-login')) {
      await doLogin();
      return;
    }
    if (t.closest('#ap-register')) {
      await doRegister();
      return;
    }
    if (t.closest('#ap-logout')) {
      await doLogout();
      return;
    }
    if (t.closest('#ap-switch-login')) {
      openPanel('login');
      return;
    }
    if (t.closest('#ap-switch-register')) {
      openPanel('register');
      return;
    }
    if (t.closest('#ap-close')) {
      closePanel();
    }
  });
}

export function openPanel(mode = 'guest') {
  if (!panelEl) return;
  panelEl.hidden = false;
  requestAnimationFrame(() => panelEl.classList.add('is-open'));
  renderPanel(mode);
  document.body.style.overflow = 'hidden';
}

export function closePanel() {
  if (!panelEl) return;
  panelEl.classList.remove('is-open');
  document.body.style.overflow = '';
  setTimeout(() => {
    panelEl.hidden = true;
  }, 260);
}

function renderPanel(mode) {
  if (!panelEl) return;
  const u = auth.user;

  let body = '';

  if (mode === 'account' && u) {
    body = `
      <div class="ap__body">
        <p class="ap__hello">${esc(u.nickname)}</p>
        <dl class="ap__dl">
          <div><dt>账号</dt><dd>${esc(u.handle)}</dd></div>
          <div><dt>身份</dt><dd>${u.kind === 'guest' ? '游客' : '注册用户'}</dd></div>
        </dl>
        <div class="ap__acts">
          <button class="btn btn--ghost" id="ap-logout">退出</button>
          <button class="btn btn--ghost" id="ap-close">关掉</button>
        </div>
      </div>
    `;
  } else if (mode === 'upgrade' && u) {
    body = `
      <div class="ap__body">
        <h3 class="ap__title">把游客身份存下来</h3>
        <p class="ap__note">
          现在叫「${esc(u.nickname)}」。注册之后，你翻过的鸟、推演过的账会跟着账号走，
          换设备也在。
        </p>
        <label class="ap__field">
          <span>账号名</span>
          <input id="ap-handle" type="text" autocomplete="username" maxlength="20" placeholder="2-20 字，中英文都行">
        </label>
        <label class="ap__field">
          <span>昵称</span>
          <input id="ap-nick" type="text" maxlength="24" placeholder="留空就用账号名">
        </label>
        <label class="ap__field">
          <span>密码</span>
          <input id="ap-pass" type="password" autocomplete="new-password" placeholder="至少 8 位">
        </label>
        <p class="ap__err" id="ap-err" hidden></p>
        <div class="ap__acts">
          <button class="btn btn--seal" id="ap-register">注册并保留进度</button>
          <button class="btn btn--ghost" id="ap-close">先不注册</button>
        </div>
      </div>
    `;
  } else if (mode === 'login') {
    body = `
      <div class="ap__body">
        <h3 class="ap__title">登录</h3>
        <label class="ap__field">
          <span>账号名</span>
          <input id="ap-handle" type="text" autocomplete="username" maxlength="20">
        </label>
        <label class="ap__field">
          <span>密码</span>
          <input id="ap-pass" type="password" autocomplete="current-password">
        </label>
        <p class="ap__err" id="ap-err" hidden></p>
        <div class="ap__acts">
          <button class="btn btn--seal" id="ap-login">登录</button>
          <button class="btn btn--ghost" id="ap-close">关掉</button>
        </div>
        <p class="ap__foot"><button class="ap__link" id="ap-switch-register">还没有账号，去注册</button></p>
      </div>
    `;
  } else if (mode === 'register') {
    body = `
      <div class="ap__body">
        <h3 class="ap__title">注册</h3>
        <label class="ap__field">
          <span>账号名</span>
          <input id="ap-handle" type="text" autocomplete="username" maxlength="20" placeholder="2-20 字，中英文都行">
        </label>
        <label class="ap__field">
          <span>昵称</span>
          <input id="ap-nick" type="text" maxlength="24" placeholder="留空就用账号名">
        </label>
        <label class="ap__field">
          <span>密码</span>
          <input id="ap-pass" type="password" autocomplete="new-password" placeholder="至少 8 位">
        </label>
        <p class="ap__err" id="ap-err" hidden></p>
        <div class="ap__acts">
          <button class="btn btn--seal" id="ap-register">注册</button>
          <button class="btn btn--ghost" id="ap-close">关掉</button>
        </div>
        <p class="ap__foot"><button class="ap__link" id="ap-switch-login">已经有账号，去登录</button></p>
      </div>
    `;
  } else {
    body = `
      <div class="ap__body">
        <h3 class="ap__title">先随便逛逛</h3>
        <p class="ap__note">
          可以先用游客身份进去，翻鸟、推账本、守岛都行。
          想留下记录再注册，进度会一起带过去。
        </p>
        <div class="ap__acts">
          <button class="btn btn--seal" id="ap-guest">以游客身份进入</button>
        </div>
        <p class="ap__foot">
          <button class="ap__link" id="ap-switch-register">注册</button>
          <span class="ap__dot2">·</span>
          <button class="ap__link" id="ap-switch-login">登录</button>
        </p>
      </div>
    `;
  }

  panelEl.innerHTML = `
    <div class="ap">
      <div class="ap__head">
        <span class="ap__kicker">身份</span>
        <button class="ap__x" id="ap-close" aria-label="关闭">✕</button>
      </div>
      ${body}
    </div>
  `;

  // 自动聚焦第一个输入框
  const first = panelEl.querySelector('input');
  if (first) setTimeout(() => first.focus(), 120);
}

/* ────────────────────────── 动作 ────────────────────────── */

async function doGuest() {
  const r = await guestLogin();
  if (r.ok) {
    toast('进来了，随便逛');
    closePanel();
    renderBar();
    window.dispatchEvent(new CustomEvent('auth:change', { detail: r.user }));
    return;
  }
  showErr(errText(r.error));
}

async function doRegister() {
  const handle = panelEl.querySelector('#ap-handle')?.value?.trim() ?? '';
  const nick = panelEl.querySelector('#ap-nick')?.value?.trim() ?? '';
  const pass = panelEl.querySelector('#ap-pass')?.value ?? '';

  if (!handle) return showErr('先填账号名');
  if (pass.length < 8) return showErr('密码至少 8 位');

  const r = await register(handle, nick || handle, pass);
  if (r.ok) {
    toast(r.upgraded ? '进度保住了，欢迎' : '注册好了');
    closePanel();
    renderBar();
    window.dispatchEvent(new CustomEvent('auth:change', { detail: r.user }));
    return;
  }
  showErr(errText(r.error));
}

async function doLogin() {
  const handle = panelEl.querySelector('#ap-handle')?.value?.trim() ?? '';
  const pass = panelEl.querySelector('#ap-pass')?.value ?? '';

  if (!handle) return showErr('先填账号名');

  const r = await login(handle, pass);
  if (r.ok) {
    toast('回来了');
    closePanel();
    renderBar();
    window.dispatchEvent(new CustomEvent('auth:change', { detail: r.user }));
    return;
  }
  showErr(errText(r.error));
}

async function doLogout() {
  await logout();
  toast('走了');
  closePanel();
  renderBar();
  window.dispatchEvent(new CustomEvent('auth:change', { detail: null }));
}

function showErr(msg) {
  const el = panelEl?.querySelector('#ap-err');
  if (!el) return;
  el.textContent = msg;
  el.hidden = false;
}

/* ────────────────────────── 轻提示 ────────────────────────── */

let toastTimer = null;

export function toast(msg, ms = 2200) {
  if (!toastEl) {
    toastEl = document.getElementById('toast');
    if (!toastEl) return;
  }
  toastEl.textContent = msg;
  toastEl.classList.add('is-on');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastEl.classList.remove('is-on');
  }, ms);
}
