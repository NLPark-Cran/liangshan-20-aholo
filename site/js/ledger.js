/**
 * ledger.js — 「一亩山的账本」
 *
 * 这一版是重做的。原来的问题是：点「过一年」→ 数字跳一下 → 再点，
 * 本质上是一张表格，没有可玩的东西，画面上也只有一座不动的山。
 *
 * 现在改成：一条 2005-2025 的时间轴，拖到哪里算到哪一年。
 * 但真正决定命运的是「哪一年关矿」这个不可逆的岔口。
 * 关得早，钱掉得狠、山回来得快；关得晚，一直在赚钱、但矿挖空了，
 * 山也挖秃了，修复欠账越滚越大。玩家能看清代价，但回不了头。
 */

import { drawLedgerPanorama } from './ledger-panorama.js';
import { initLedger3D, setLedger3DState, stopLedger3D, ledger3DReady, onLedger3DReady } from './ledger3d.js';
import { auth, submitLedger } from './api.js';

/* ────────────────────────── 参数 ────────────────────────── */

const START_YEAR = 2005;
const END_YEAR = 2025;
const SPAN = END_YEAR - START_YEAR; // 20

/* 矿量：100 单位，每年采 5 单位，正好 2025 见底。
   把「挖得完」变成看得见的事。 */
const RESERVE_FULL = 100;
const MINE_RATE = 5;

const MODES = {
  mine: {
    name: '开矿',
    short: '开矿',
    mountain: -4.2,
    desc: '石头卖得掉，一年三百多万。山在变秃，矿也在变薄。',
  },
  bamboo: {
    name: '种竹',
    short: '种竹',
    mountain: 1.5,
    desc: '短期看不见钱，五六年之后有笋、有竹材。山慢慢绿回来。',
  },
  eco: {
    name: '做生态',
    short: '生态',
    mountain: 2.4,
    desc: '游客只为好山好水来。山还没养回来之前，这条路一直亏。',
  },
  restore: {
    name: '封山',
    short: '封山',
    mountain: 3.6,
    desc: '什么都不做，只是让它歇着。最快恢复，也最没有收入。',
  },
};

/** 当年收入（万元）。收入跟山体健康与剩余矿量都挂钩。 */
function incomeOf(mode, state) {
  const t = (state.year - START_YEAR) / SPAN; // 0..1
  const hp = state.mountain / 100;
  switch (mode) {
    case 'mine':
      if (state.reserve <= 0) return 6;
      return Math.round(state.reserve * 3.2);
    case 'bamboo':
      return Math.round(20 + t * 44 * hp);
    case 'eco':
      if (state.mountain < 45) return 7;
      return Math.round(hp * (58 + t * 205));
    case 'restore':
      if (state.mountain < 55) return 4;
      return Math.round(4 + (state.mountain - 55) * 0.5 + t * 25);
    default:
      return 0;
  }
}

/* ────────────────────────── 状态 ────────────────────────── */

function newState() {
  return {
    // 玩家在这一年做出了关矿决定；null 表示还没关
    closedYear: null,
    // 玩家在时间轴上设的「今年」，playhead
    year: START_YEAR,
    // 每年选的做法，按年份索引
    picks: {},
    // 每年结算出来的账
    ledger: {},
    phase: 'play', // play | over
  };
}

/** 默认做法：还没关矿就开矿，关了之后就封山养着 */
function defaultPick(state, year) {
  if (state.closedYear === null) return 'mine';
  return year < state.closedYear + 3 ? 'restore' : 'eco';
}

let S = newState();
let canvasEl = null;
let panelEl = null;
let lastSavedKey = '';

/* ────────────────────────── 入口 ────────────────────────── */

export function openLedger() {
  const ov = document.getElementById('ledgerlog');
  if (!ov) return;
  ov.hidden = false;
  document.body.style.overflow = 'hidden';
  requestAnimationFrame(() => ov.classList.add('is-open'));

  canvasEl = document.getElementById('ledger-canvas');
  panelEl = document.getElementById('ledger-panel');
  S = newState();
  // 先结算到 2005
  recalc();
  renderPanel();
  redraw();

  /* 3D 层：加载群核生成的三态山体。
     加载不出来就静默回退到纯 2D，不影响玩法。 */
  const c3d = document.getElementById('ledger-3d');
  const badge = document.getElementById('ledger-badge');
  if (c3d && !c3d.dataset.inited) {
    try {
      const ok = initLedger3D(c3d);
      if (ok) {
        c3d.dataset.inited = '1';
        // 模型到齐之后再重绘一次，让 2D 退成远景
        onLedger3DReady(() => {
          if (badge) badge.hidden = false;
          draw();
        });
      }
    } catch (_) {
      c3d.hidden = true;
    }
  } else if (c3d && ledger3DReady() && badge) {
    badge.hidden = false;
  }
}

export function closeLedger() {
  const ov = document.getElementById('ledgerlog');
  if (!ov) return;
  ov.classList.remove('is-open');
  document.body.style.overflow = '';
  window.removeEventListener('resize', draw);
  // 只在遮罩真正关掉之后停掉渲染循环，免得动画闪一下
  setTimeout(() => {
    ov.hidden = true;
    stopLedger3D();
  }, 300);
}

/* ────────────────────────── 结算 ────────────────────────── */

/**
 * 从 2005 结算到 2025，结果写进 S.ledger。
 * 每次都全量重算：玩家改了任一年的做法或关矿年份，后面全都会变。
 */
function recalc() {
  S.ledger = {};

  let mountain = 100;
  let reserve = RESERVE_FULL;
  let cash = 320;

  for (let y = START_YEAR; y <= END_YEAR; y++) {
    const mode = S.picks[y] || defaultPick(S, y);
    const closedNow = S.closedYear === y;

    // 关矿当年的收入断崖：只剩三成多，还要先扣一笔修复欠账
    if (closedNow) {
      const debt = Math.round((100 - mountain) * 2.2);
      cash = Math.max(0, Math.round(cash * 0.35) - debt + 10);
      S.ledger[y] = {
        year: y,
        mode: '关矿',
        income: cash,
        mountain: Math.round(mountain),
        reserve: Math.round(reserve),
        debt,
        closedNow: true,
        cash,
      };
      // 关矿当年就转入封山
      mountain = Math.max(0, Math.min(100, mountain + MODES.restore.mountain));
      continue;
    }

    const income = incomeOf(mode, { year: y, mountain, reserve });
    cash = Math.max(0, income);

    mountain = Math.max(0, Math.min(100, mountain + MODES[mode].mountain));

    if (mode === 'mine') {
      reserve = Math.max(0, reserve - MINE_RATE);
    }

    S.ledger[y] = {
      year: y,
      mode: MODES[mode].name,
      income,
      mountain: Math.round(mountain),
      reserve: Math.round(reserve),
      debt: 0,
      closedNow: false,
      cash,
    };
  }
}

/* ────────────────────────── 绘制 ────────────────────────── */

function draw() {
  if (!canvasEl || !canvasEl.isConnected) return;
  const cur = S.ledger[S.year] || S.ledger[START_YEAR];
  if (!cur) return;

  const closed = S.closedYear !== null && S.year >= S.closedYear;

  /* 矿坑深度不能用「山有多差」反推：
     2005 年山是满的，但矿已经在挖了，坑该有。
     按开采年数算：挖一年深一点，关矿之后才往回填。 */
  let mineDepth;
  if (closed) {
    /* 关矿后逐年回填。真实里这种矿坑不会自己消失，
       但十几年后植被长起来，从远处基本看不出坑。
       所以下限压到 0.06，让人能看出「缓过来了」。 */
    const spent = Math.max(0, S.year - S.closedYear);
    mineDepth = Math.max(0.06, 0.92 - spent * 0.11);
  } else {
    const years = S.year - START_YEAR;
    mineDepth = Math.min(1, 0.1 + years * 0.055);
  }

  drawLedgerPanorama(canvasEl, {
    year: S.year,
    health: cur.mountain,
    mineDepth,
    reserve: cur.reserve,
    cash: cur.cash,
    closed,
    seed: 9001,
    // 3D 有模型时，2D 退成远景，避免两层各有一座山
    farOnly: ledger3DReady(),
  });

  /* 同步 3D 层：年份一变，山体的三种状态按权重切。
     3D 没加载出来就只是 2D，不影响任何玩法。 */
  setLedger3DState(cur.mountain, closed);
}

/** 面板重排后容器尺寸会变，等一帧再画，否则量到的是旧尺寸 */
function redraw() {
  requestAnimationFrame(() => {
    draw();
    // 布局彻底稳定后再补一次，防止首帧量到塌缩的容器
    setTimeout(draw, 60);
  });
}

/* ────────────────────────── 面板 ────────────────────────── */

function renderPanel() {
  if (!panelEl) return;
  if (S.phase === 'over') {
    renderOver();
    return;
  }
  renderPlay();
}

/** 时间轴本体，单独抽出来，两个界面都要用 */
function trackHTML() {
  const ticks = [];
  for (let y = START_YEAR; y <= END_YEAR; y++) {
    // 只在关键年份写数字：提出理念、矿挖完、玩家关矿那一年
    const key = y === 2005 || y === 2021 || y === S.closedYear;
    const label = key || y % 5 === 0 ? String(y).slice(2) : '';
    ticks.push(`<span class="lg__tick ${key ? 'is-key' : ''}">${label}</span>`);
  }
  const pct = ((S.year - START_YEAR) / SPAN) * 100;

  return `
    <div class="lg__track" id="lg-track" role="slider"
         aria-label="年份" aria-valuemin="${START_YEAR}" aria-valuemax="${END_YEAR}"
         aria-valuenow="${S.year}" tabindex="0">
      <div class="lg__rail"></div>
      <div class="lg__ticks">${ticks.join('')}</div>
      <div class="lg__railfill" style="width:${pct}%"></div>
      <div class="lg__knob" style="left:${pct}%"></div>
    </div>
  `;
}

function renderPlay() {
  const cur = S.ledger[S.year];
  const mode = S.picks[S.year] || (S.year === S.closedYear ? 'mine' : defaultPick(S, S.year));
  const isCloseYear = S.closedYear === S.year;
  const canClose = S.closedYear === null && S.year >= 2009;

  panelEl.innerHTML = `
    <div class="g__row">
      <span class="g__lab">年份</span>
      ${trackHTML()}
      <span class="g__read"><b class="g__big" id="lg-year">${S.year}</b></span>
    </div>

    <div class="g__row">
      <span class="g__lab">今年做法</span>
      <div class="g__chips g__chips--even">
        ${Object.entries(MODES)
          .filter(([k]) => k !== 'restore' || S.closedYear !== null || S.year >= 2009)
          .map(
            ([k, m]) => `
          <button class="chip ${mode === k && !isCloseYear ? 'is-on' : ''}"
                  data-mode="${k}"
                  ${S.closedYear !== null && k === 'mine' ? 'disabled' : ''}>
            <span class="chip__n">${m.short}</span>
            <span class="chip__d">${m.desc}</span>
          </button>`
          )
          .join('')}
      </div>
    </div>

    <div class="g__row">
      <span class="g__lab">账本</span>
      <div class="g__read">
        <span>村集体年收入</span><b id="lg-cash">${cur.cash}</b><span>万元</span>
        <span class="g__dot">·</span>
        <span>山</span><b id="lg-mtn">${cur.mountain}%</b>
        <span class="g__dot">·</span>
        <span>矿</span><b id="lg-ore">${cur.reserve <= 0 ? '空了' : cur.reserve + '%'}</b>
      </div>
    </div>

    <div class="g__row">
      ${
        canClose
          ? `<button class="g__go" id="lg-close">在这个村，把矿关掉</button>
             <p class="g__note">关掉就再也开不回来了。收入会掉到十位数，几十个人失业。</p>`
          : isCloseYear
            ? `<p class="g__note">${S.year} 年，矿山关了。这一年账上写着一笔修复欠账，${cur.debt} 万。</p>`
            : S.closedYear !== null
              ? `<p class="g__note">矿已经在 ${S.closedYear} 年关了。山一年年往回长。</p>`
              : `<p class="g__note">2009 年起，村民大会开始提关矿这件事。</p>`
      }
      <div class="g__acts">
        <button class="g__go g__go--quiet" id="lg-end">推到 2025，看最后</button>
      </div>
    </div>
  `;

  bindPlay();
}

function bindPlay() {
  // 拖动时间轴
  const track = panelEl.querySelector('#lg-track');
  if (track) {
    const pick = (clientX) => {
      const r = track.getBoundingClientRect();
      const t = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
      const y = Math.round(START_YEAR + t * SPAN);
      if (y !== S.year) {
        S.year = y;
        // 只更新读数与时间轴位置，不重建面板：
        // 重建会把 track 元素换掉，拖到一半就断了
        syncTrack(y);
        syncReadout(y);
        redraw();
      }
    };

    /** 把滑块与进度、年份读数对齐到 y，不动 DOM 结构 */
    const syncTrack = (y) => {
      const pct = ((y - START_YEAR) / SPAN) * 100;
      const knob = track.querySelector('.lg__knob');
      const fill = track.querySelector('.lg__railfill');
      if (knob) knob.style.left = `${pct}%`;
      if (fill) fill.style.width = `${pct}%`;
      track.setAttribute('aria-valuenow', String(y));
      const head = panelEl.querySelector('#lg-year');
      if (head) head.textContent = String(y);
    };

    /** 账本读数：收入、山、矿 */
    const syncReadout = (y) => {
      const cur = S.ledger[y];
      if (!cur) return;
      const set = (id, v) => {
        const el = panelEl.querySelector(`#${id}`);
        if (el) el.textContent = v;
      };
      set('lg-cash', String(cur.cash));
      set('lg-mtn', `${cur.mountain}%`);
      set('lg-ore', cur.reserve <= 0 ? '空了' : `${cur.reserve}%`);

      // 这一年的做法高亮
      const mode = S.picks[y] || (y === S.closedYear ? 'mine' : defaultPick(S, y));
      panelEl.querySelectorAll('[data-mode]').forEach((b) => {
        b.classList.toggle('is-on', b.dataset.mode === mode && S.closedYear !== y);
      });
    };

    /**
     * 时间轴只负责「看哪一年」。拖动时轻量同步，松手后重建面板，
     * 让关矿按钮、提示这些随年份变化的控件都跟上。
     */
    let dragging = false;
    track.addEventListener('pointerdown', (e) => {
      dragging = true;
      try {
        track.setPointerCapture(e.pointerId);
      } catch (_) {
        /* 拿不到捕获也能拖，只是移出元素后不再跟随 */
      }
      pick(e.clientX);
    });
    track.addEventListener('pointermove', (e) => {
      if (dragging) pick(e.clientX);
    });
    const stop = (e) => {
      if (!dragging) return;
      dragging = false;
      try {
        track.releasePointerCapture(e.pointerId);
      } catch (_) {
        /* 没捕获过就没什么可释放的 */
      }
      if (typeof e.clientX === 'number' && e.clientX > 0) pick(e.clientX);
      // 松手后重排一次，把随年份变化的控件（关矿按钮、提示语）刷新
      renderPanel();
    };
    track.addEventListener('pointerup', stop);
    track.addEventListener('pointercancel', () => {
      dragging = false;
    });

    // 键盘也要能走
    const nudge = (delta) => {
      const y = Math.max(START_YEAR, Math.min(END_YEAR, S.year + delta));
      if (y !== S.year) {
        S.year = y;
        renderPanel();
        redraw();
      }
    };
    track.addEventListener('keydown', (e) => {
      const step = e.shiftKey ? 5 : 1;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
        nudge(-step);
        e.preventDefault();
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
        nudge(step);
        e.preventDefault();
      }
    });
  }

  // 换做法
  panelEl.querySelectorAll('[data-mode]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const k = btn.dataset.mode;
      if (k === 'mine' && S.closedYear !== null) return;
      S.picks[S.year] = k;
      recalc();
      renderPanel();
      redraw();
    });
  });

  // 关矿
  panelEl.querySelector('#lg-close')?.addEventListener('click', () => {
    S.closedYear = S.year;
    // 关矿之后默认封山
    S.picks[S.year] = 'restore';
    recalc();
    renderPanel();
    redraw();
  });

  // 推到结尾
  panelEl.querySelector('#lg-end')?.addEventListener('click', () => {
    S.year = END_YEAR;
    S.phase = 'over';
    renderPanel();
    redraw();
  });
}

function renderOver() {
  const rows = Object.values(S.ledger).sort((a, b) => a.year - b.year);
  const closed = S.closedYear;
  const last = S.ledger[END_YEAR];
  const lowest = rows.reduce((m, r) => Math.min(m, r.income), Infinity);

  panelEl.innerHTML = `
    <div class="g__row">
      <span class="g__lab">二十年</span>
      <div class="g__read">
        <span>${closed ? `${closed} 年关的矿` : '一直没关矿'}</span>
        <span class="g__dot">·</span>
        <span>最少的一年</span><b>${lowest}</b><span>万元</span>
        <span class="g__dot">·</span>
        <span>2025 年的山</span><b>${last.mountain}%</b>
        <span class="g__dot">·</span>
        <span>2025 年的收入</span><b>${last.cash}</b><span>万元</span>
      </div>
    </div>

    <div class="g__row">
      <span class="g__lab">回看</span>
      ${trackHTML()}
    </div>

    <div class="g__row">
      <p class="g__note" id="lg-save">${
        closed
          ? `山是能养回来的，但要花二十年，还要先掏一笔 ${rows.find((r) => r.closedNow)?.debt ?? 0} 万的修复钱。真实的事比这慢得多。`
          : '矿挖完了，山也秃了。挖出来的坑要修复，这笔钱村里还没算过。'
      }</p>
      <div class="g__acts">
        <button class="g__go g__go--quiet" id="lg-again">再来一次</button>
      </div>
    </div>
  `;

  // 结算页时间轴只用来回看，不切状态
  const track = panelEl.querySelector('#lg-track');
  if (track) {
    track.style.pointerEvents = 'none';
  }

  panelEl.querySelector('#lg-again')?.addEventListener('click', () => {
    S = newState();
    recalc();
    renderPanel();
    redraw();
  });

  void saveRun();
}

/* ────────────────────────── 归档 ────────────────────────── */

async function saveRun() {
  const hint = panelEl?.querySelector('#lg-save');
  if (!hint) return;

  if (!auth.ready || !auth.online) {
    hint.textContent = '本地模式：这局只留在这台设备上。';
    return;
  }
  if (!auth.user) {
    hint.textContent = '登录后这局的成绩会存到账号里。';
    return;
  }
  if (auth.user.kind !== 'member') {
    hint.innerHTML = '<button class="ap__link" id="lg-tologin">注册账号</button>，这局的成绩就能存下来。';
    hint.querySelector('#lg-tologin')?.addEventListener('click', () => {
      window.dispatchEvent(new CustomEvent('auth:need-member'));
    });
    return;
  }

  const key = `${S.closedYear}:${S.ledger[END_YEAR]?.cash}:${S.ledger[END_YEAR]?.mountain}`;
  if (key === lastSavedKey) return;
  lastSavedKey = key;

  try {
    const r = await submitLedger({
      closedYear: S.closedYear,
      finalYear: END_YEAR,
      finalCash: S.ledger[END_YEAR].cash,
      finalMountain: S.ledger[END_YEAR].mountain,
      years: Object.values(S.ledger).map((x) => ({
        year: x.year,
        mode: x.mode,
        income: x.income,
        cash: x.cash,
        mountain: x.mountain,
      })),
    });
    hint.textContent = r.ok ? '这一局已经记到你的账号里。' : '记录没成功，不影响继续玩。';
  } catch (_) {
    hint.textContent = '记录没成功，不影响继续玩。';
  }
}
