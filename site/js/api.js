/**
 * api.js — 前端与后端的唯一接口层
 *
 * 所有请求都带 cookie（同域自动带），不存 token 到 localStorage。
 * 后端不可用时全部降级为本地模式，页面照常能玩。
 */

const BASE = '/api';

export const auth = {
  user: null,
  online: false,
  /** 后端是否可用 */
  ready: false,
};

/** 统一的 fetch 包装 */
async function call(path, opts = {}) {
  const res = await fetch(BASE + path, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch (_) {
    data = { ok: false, error: 'bad_response' };
  }
  return { status: res.status, ...data };
}

/* ────────────────────────── 健康与启动 ────────────────────────── */

export async function checkHealth() {
  // 后端无响应时必须尽快放弃，否则 init() 卡在 await 上，
  // 首屏的「展卷」遮罩永远不消失。
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 2500);
  try {
    const r = await call('/health', { method: 'GET', signal: ctrl.signal });
    auth.online = !!r.ok;
    auth.ready = true;
    return auth.online;
  } catch (_) {
    auth.online = false;
    auth.ready = true;
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** 轻量埋点：失败就算了，绝不打扰用户 */
export function track(event, detail) {
  if (!auth.online) return;
  try {
    fetch(BASE + '/track', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: String(event).slice(0, 40), detail: detail ?? null }),
      keepalive: true,
    }).catch(() => {});
  } catch (_) {
    /* 忽略 */
  }
}

/* ────────────────────────── 认证 ────────────────────────── */

export async function fetchMe() {
  try {
    const r = await call('/auth/me', { method: 'GET' });
    if (r.ok) {
      auth.user = r.user ?? null;
      auth.online = true;
      return auth.user;
    }
  } catch (_) {
    /* 离线 */
  }
  return null;
}

export async function guestLogin() {
  const r = await call('/auth/guest', { method: 'POST', body: '{}' });
  if (r.ok) auth.user = r.user;
  return r;
}

export async function register(handle, nickname, password) {
  const r = await call('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ handle, nickname, password }),
  });
  if (r.ok) auth.user = r.user;
  return r;
}

export async function login(handle, password) {
  const r = await call('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ handle, password }),
  });
  if (r.ok) auth.user = r.user;
  return r;
}

export async function logout() {
  const r = await call('/auth/logout', { method: 'POST', body: '{}' });
  if (r.ok) auth.user = null;
  return r;
}

/* ────────────────────────── 业务 ────────────────────────── */

export async function drawBird(siteId, typhoon = false) {
  return call('/birds/draw', {
    method: 'POST',
    body: JSON.stringify({ siteId, typhoon }),
  });
}

export async function fetchMyBirds() {
  return call('/birds/mine', { method: 'GET' });
}

export async function submitLedger(payload) {
  return call('/ledger/submit', { method: 'POST', body: JSON.stringify(payload) });
}

export async function submitTern(payload) {
  return call('/tern/submit', { method: 'POST', body: JSON.stringify(payload) });
}

export async function fetchMyStats() {
  return call('/stats/mine', { method: 'GET' });
}

export async function fetchLeaderboard() {
  return call('/leaderboard', { method: 'GET' });
}

export async function fetchSites() {
  return call('/sites', { method: 'GET' });
}

/* ────────────────────────── 错误文案 ────────────────────────── */

const ERR_TEXT = {
  unauthorized: '请先登录',
  need_member: '这个功能需要注册账号',
  handle_taken: '这个名字有人用了',
  bad_credentials: '账号或密码不对',
  weak_password: '密码至少 8 位',
  bad_handle: '名字 2-20 字，只能中英文、数字、下划线',
  long_nickname: '昵称太长',
  too_many: '操作太频繁，稍等一会儿',
  bad_json: '请求格式有误',
  unknown_site: '没有这个地点',
  bad_body: '数据格式有误',
  too_long: '数据太长',
};

export function errText(code) {
  return ERR_TEXT[code] || '出错了，稍后再试';
}
