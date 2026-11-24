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
import {
  START_YEAR as CAMPAIGN_START,
  END_YEAR as CAMPAIGN_END,
  MODEL_NOTE,
  SCENARIOS,
  createCampaign,
  applyYear,
  applyEvent,
  advanceYear,
  getCampaignSummary,
  getScenario,
  getCurrentStage,
  getPendingEvent,
  getYearOptions,
} from './ledger-campaign.js';

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
let C = null;
let viewMode = 'campaign';
let canvasEl = null;
let panelEl = null;
let stageHudEl = null;
let lastSavedKey = '';
let bestRuns = {};
let storageNotice = '';
const BEST_KEY = 'aholo.ledger.campaign.best.v1';

/* ────────────────────────── 入口 ────────────────────────── */

export function openLedger() {
  const ov = document.getElementById('ledgerlog');
  if (!ov) return;
  ov.hidden = false;
  document.body.style.overflow = 'hidden';
  requestAnimationFrame(() => ov.classList.add('is-open'));

  canvasEl = document.getElementById('ledger-canvas');
  panelEl = document.getElementById('ledger-panel');
  viewMode = 'campaign';
  C = null;
  S = newState();
  loadBestRuns();
  ensureStageHud();
  renderPanel();
  redraw();
  window.removeEventListener('resize', draw);
  window.addEventListener('resize', draw);

  /* 3D 层：加载群核生成的三态山体。
     加载不出来就静默回退到纯 2D，不影响玩法。 */
  const c3d = document.getElementById('ledger-3d');
  const badge = document.getElementById('ledger-badge');
  if (c3d && !c3d.dataset.inited) {
    try {
      const ok = initLedger3D(c3d);
      if (ok) {
        c3d.dataset.inited = '1';
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

function ensureStageHud() {
  const stage = canvasEl?.parentElement;
  if (!stage) return;
  stageHudEl = stage.querySelector('#lg-stage-hud');
  if (!stageHudEl) {
    stageHudEl = document.createElement('div');
    stageHudEl.id = 'lg-stage-hud';
    stageHudEl.className = 'lgc-hud';
    stageHudEl.setAttribute('aria-hidden', 'true');
    stage.appendChild(stageHudEl);
  }
}

function syncStageHud(year, scenarioName, cash, mountain, reserve, livelihood, closedYear) {
  if (!stageHudEl) return;
  stageHudEl.innerHTML = `
    <div class="lgc-hud__top"><span>${scenarioName}</span><b>${year}</b></div>
    <div class="lgc-hud__grid">
      <span>累计资金<strong>${cash}</strong><small>万元</small></span>
      <span>山体<strong>${mountain}</strong><small>点</small></span>
      <span>储量<strong>${reserve <= 0 ? '空' : reserve}</strong><small>${reserve <= 0 ? '' : '单位'}</small></span>
      ${livelihood === null ? '' : `<span>民生<strong>${livelihood}</strong><small>点</small></span>`}
    </div>
    <p>${closedYear === null ? '矿仍在开采' : `${closedYear} 年已永久关矿`} · ${MODEL_NOTE}</p>
  `;
}

function draw() {
  if (!canvasEl || !canvasEl.isConnected) return;

  if (viewMode === 'campaign') {
    const scenario = C ? getScenario(C.scenarioId) : SCENARIOS[0];
    const year = C?.year ?? CAMPAIGN_START;
    const cur = C || { ...scenario.initial, closedYear: null };
    const closed = C?.closedYear !== null && C?.closedYear !== undefined;
    const depleted = 1 - cur.reserve / Math.max(1, scenario.initial.reserve);
    const closedFor = closed ? Math.max(0, year - C.closedYear) : 0;
    const mineDepth = Math.max(0.1, Math.min(0.94, 0.12 + depleted * 0.88 - closedFor * 0.018));
    drawLedgerPanorama(canvasEl, {
      year,
      health: cur.mountain,
      mineDepth,
      reserve: cur.reserve,
      cash: cur.cash,
      closed,
      seed: 9001 + SCENARIOS.findIndex((item) => item.id === scenario.id) * 37,
      farOnly: ledger3DReady(),
    });
    setLedger3DState(cur.mountain, closed);
    syncStageHud(year, scenario.name, cur.cash, cur.mountain, cur.reserve, cur.livelihood, cur.closedYear);
    return;
  }

  const cur = S.ledger[S.year] || S.ledger[START_YEAR];
  if (!cur) return;
  const closed = S.closedYear !== null && S.year >= S.closedYear;

  /* 矿坑深度不能用「山有多差」反推：
     2005 年山是满的，但矿已经在挖了，坑该有。
     按开采年数算：挖一年深一点，关矿之后才往回填。 */
  let mineDepth;
  if (closed) {
    /* 远景可逐渐淡化矿坑，但关矿不会抹掉已经发生的修复责任。 */
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
    farOnly: ledger3DReady(),
  });
  setLedger3DState(cur.mountain, closed);
  syncStageHud(S.year, '自由沙盘', cur.cash, cur.mountain, cur.reserve, null, S.closedYear);
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
  if (viewMode === 'campaign') {
    renderCampaign();
    return;
  }
  if (S.phase === 'over') {
    renderOver();
    return;
  }
  renderPlay();
}

function modeSwitchHTML(active) {
  return `
    <nav class="lgc-modes" aria-label="账本玩法">
      <button type="button" data-view="campaign" aria-pressed="${active === 'campaign'}" class="${active === 'campaign' ? 'is-on' : ''}">
        <span>治理模式</span><small>逐年经营 · 默认</small>
      </button>
      <button type="button" data-view="sandbox" aria-pressed="${active === 'sandbox'}" class="${active === 'sandbox' ? 'is-on' : ''}">
        <span>自由沙盘</span><small>任意年份 · 原时间轴</small>
      </button>
    </nav>
  `;
}

function bindModeSwitches() {
  panelEl.querySelectorAll('[data-view]').forEach((button) => {
    button.addEventListener('click', () => {
      const next = button.dataset.view;
      if (next === viewMode) return;
      viewMode = next;
      if (viewMode === 'sandbox' && !Object.keys(S.ledger).length) recalc();
      renderPanel();
      redraw();
      focusCampaignRegion();
    });
  });
}

function normaliseBestRecord(value) {
  if (!value || typeof value !== 'object' || !Number.isFinite(value.metGoals) || !value.final) return null;
  const fields = ['cash', 'mountain', 'reserve', 'livelihood', 'debt'];
  if (!fields.every((key) => Number.isFinite(value.final[key]))) return null;
  const closedYear = value.closedYear === null ? null : Number(value.closedYear);
  if (closedYear !== null && (!Number.isInteger(closedYear) || closedYear < 2009 || closedYear > CAMPAIGN_END)) return null;
  return {
    metGoals: Math.max(0, Math.min(5, Math.round(value.metGoals))),
    rank: Number.isFinite(value.rank) ? value.rank : 0,
    closedYear,
    final: Object.fromEntries(fields.map((key) => [key, Math.round(value.final[key])])),
  };
}

function loadBestRuns() {
  bestRuns = {};
  storageNotice = '';
  let raw = null;
  try {
    raw = window.localStorage.getItem(BEST_KEY);
  } catch (_) {
    storageNotice = '本地存储当前不可用，本次仍可完整游玩。';
    return;
  }
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== 1 || !parsed.scenarios || typeof parsed.scenarios !== 'object') {
      throw new Error('bad best-save shape');
    }
    let dropped = false;
    SCENARIOS.forEach((scenario) => {
      const record = normaliseBestRecord(parsed.scenarios[scenario.id]);
      if (record) bestRuns[scenario.id] = record;
      else if (parsed.scenarios[scenario.id] !== undefined) dropped = true;
    });
    if (dropped) storageNotice = '部分本地最佳记录无法读取，已回退为空白；不影响新一局。';
  } catch (_) {
    bestRuns = {};
    storageNotice = '本地最佳记录已损坏，已回退为空白；不影响新一局。';
    try {
      window.localStorage.removeItem(BEST_KEY);
    } catch (_) {
      storageNotice = '本地最佳记录无法读取，已在本局回退为空白。';
    }
  }
}

function saveBestRun(summary) {
  const rank = summary.metGoals * 1000 + summary.dimensions.reduce((sum, item) => sum + item.score, 0);
  const candidate = normaliseBestRecord({
    metGoals: summary.metGoals,
    rank,
    closedYear: summary.closedYear,
    final: summary.final,
  });
  if (!candidate) return;
  if (!bestRuns[summary.scenarioId] || candidate.rank > bestRuns[summary.scenarioId].rank) {
    bestRuns[summary.scenarioId] = candidate;
    try {
      window.localStorage.setItem(BEST_KEY, JSON.stringify({ version: 1, scenarios: bestRuns }));
      storageNotice = '本场景最佳结果已保存在这台设备上，离线也能查看。';
    } catch (_) {
      storageNotice = '本局已完成，但浏览器未允许写入本地最佳记录。';
    }
  }
}

function focusCampaignRegion() {
  requestAnimationFrame(() => {
    const target = panelEl?.querySelector('[data-focus]');
    if (target) target.focus({ preventScroll: true });
    if (panelEl) panelEl.scrollTop = 0;
  });
}

function campaignHeaderHTML() {
  return `
    ${modeSwitchHTML('campaign')}
    ${storageNotice ? `<p class="lgc-storage" role="status">${storageNotice}</p>` : ''}
    ${C ? `
      <div class="lgc-runbar">
        <div><span>${getScenario(C.scenarioId).name}</span><small>${MODEL_NOTE} · 所有金额单位均为万元</small></div>
        <button type="button" class="lgc-textbtn" id="lgc-exit">重选场景</button>
      </div>
    ` : ''}
  `;
}

function scenarioPickerHTML() {
  return `
    <section class="lgc-intro">
      <p class="lgc-kicker">默认玩法 · 二十年治理</p>
      <h2 class="lgc-title" data-focus tabindex="-1">把二十年，一年一年过下去</h2>
      <p>从 2005 到 2025 共 21 次年度决策。每年先选经营方式，再处理可能出现的年度事件；收入减去成本后累入资金，不能跳年，也不能在结局前改历史。</p>
      <p class="lgc-modelnote"><strong>${MODEL_NOTE}</strong>。场景与事件用于理解权衡，不构成现实预测。</p>
    </section>
    <div class="lgc-scenarios" aria-label="选择一个示意场景">
      ${SCENARIOS.map((scenario, index) => {
        const best = bestRuns[scenario.id];
        return `
          <button type="button" class="lgc-scenario" data-scenario="${scenario.id}" aria-label="开始${scenario.name}，${scenario.difficulty}场景">
            <span class="lgc-scenario__index">0${index + 1} · ${scenario.difficulty}</span>
            <strong>${scenario.name}</strong>
            <span class="lgc-scenario__sub">${scenario.subtitle}</span>
            <span class="lgc-scenario__params">
              <span>起始资金 <b>${scenario.initial.cash}</b></span>
              <span>山体 <b>${scenario.initial.mountain}</b></span>
              <span>储量 <b>${scenario.initial.reserve}</b></span>
              <span>民生 <b>${scenario.initial.livelihood}</b></span>
            </span>
            <span class="lgc-scenario__target">2025 示意目标：资金 ${scenario.targets.cash} · 山体 ${scenario.targets.mountain} · 民生 ${scenario.targets.livelihood} · 欠账不超过 ${scenario.targets.maxDebt}</span>
            <span class="lgc-scenario__best">${best ? `本机最佳：达成 ${best.metGoals}/5 项目标，资金 ${best.final.cash}，山体 ${best.final.mountain}，民生 ${best.final.livelihood}` : '本机还没有完成记录'}</span>
            <span class="lgc-scenario__cta">开始逐年治理 <i aria-hidden="true">→</i></span>
          </button>
        `;
      }).join('')}
    </div>
  `;
}

function campaignProgressHTML() {
  const records = new Set(C.history.map((item) => item.year));
  return `
    <section class="lgc-progress" aria-label="治理进度：已完成 ${C.history.length} 年，共 21 年">
      <div class="lgc-progress__head"><span>治理进度</span><b>${C.history.length} / 21 年</b></div>
      <div class="lgc-progress__years" aria-hidden="true">
        ${Array.from({ length: CAMPAIGN_END - CAMPAIGN_START + 1 }, (_, index) => {
          const year = CAMPAIGN_START + index;
          return `<i class="${records.has(year) ? 'is-done' : ''} ${year === C.year && C.phase !== 'complete' ? 'is-now' : ''}" title="${year}"></i>`;
        }).join('')}
      </div>
      <div class="lgc-progress__ends"><span>2005</span><strong>${C.phase === 'complete' ? '已结算' : `${C.year} 年`}</strong><span>2025</span></div>
    </section>
  `;
}

function campaignStatsHTML() {
  const stats = [
    ['累计资金', C.cash, '万元', 'lgc-cash'],
    ['山体健康', C.mountain, '点', 'lgc-mountain'],
    ['剩余储量', C.reserve <= 0 ? '已耗尽' : C.reserve, C.reserve <= 0 ? '' : '单位', 'lgc-reserve'],
    ['民生就业', C.livelihood, '点', 'lgc-livelihood'],
    ['修复欠账', C.restorationDebt, '万元', 'lgc-debt'],
  ];
  return `
    <div class="lgc-stats" aria-label="当前状态">
      ${stats.map(([label, value, unit, id]) => `<div><span>${label}</span><b id="${id}" class="${Number(value) < 0 ? 'is-low' : ''}">${value}</b><small>${unit}</small></div>`).join('')}
    </div>
    <p class="lgc-closure ${C.closedYear !== null ? 'is-closed' : ''}">${C.closedYear === null ? '尚未关矿。2009 年起可把「永久关矿」作为当年的经营选择。' : `${C.closedYear} 年已永久关矿，开矿选项已经锁定；修复欠账仍需继续处理。`}</p>
  `;
}

function campaignStageHTML() {
  const stage = getCurrentStage(C);
  return `
    <section class="lgc-stagegoal">
      <p><span>${stage.start} 至 ${stage.end}</span><b>${stage.title}</b></p>
      <p>${stage.prompt}</p>
      <small>阶段示意目标：资金 ${stage.cash} · 山体 ${stage.mountain} · 民生 ${stage.livelihood}</small>
    </section>
  `;
}

function operationOptionsHTML() {
  return `
    <section class="lgc-decision" aria-labelledby="lgc-decision-title">
      <p class="lgc-kicker">年度经营 · 只能结算一次</p>
      <h2 id="lgc-decision-title" data-focus tabindex="-1">${C.year} 年，选一种经营方式</h2>
      <p>点击即确定本年经营。预览中的收入减去年度成本后累入总资金；若当年有事件，还需再做一个应对选择。</p>
      <div class="lgc-options">
        ${getYearOptions(C).map((option) => `
          <button type="button" class="lgc-option" data-op="${option.id}" ${option.disabled ? 'disabled' : ''}>
            <span class="lgc-option__head"><strong>${option.name}</strong>${option.id === 'close' ? '<i>不可逆</i>' : ''}</span>
            <span class="lgc-option__desc">${option.disabled ? option.disabledReason : option.description}</span>
            ${option.disabled ? '' : `
              <span class="lgc-option__numbers">
                <span>收入 <b>${option.income}</b></span>
                <span>成本 <b>${option.cost}</b></span>
                <span class="${option.net < 0 ? 'is-low' : ''}">净额 <b>${option.net > 0 ? '+' : ''}${option.net}</b></span>
              </span>
              <span class="lgc-option__deltas">山体 ${option.mountainDelta > 0 ? '+' : ''}${option.mountainDelta} · 民生 ${option.livelihoodDelta > 0 ? '+' : ''}${option.livelihoodDelta} · 储量 ${option.reserveDelta > 0 ? '+' : ''}${option.reserveDelta}${option.debtPayment ? ` · 还债 ${option.debtPayment}` : ''}</span>
              ${option.note ? `<span class="lgc-option__note">${option.note}</span>` : ''}
            `}
          </button>
        `).join('')}
      </div>
    </section>
  `;
}

function eventDecisionHTML() {
  const event = getPendingEvent(C);
  return `
    <section class="lgc-event" aria-labelledby="lgc-event-title">
      <p class="lgc-kicker">${C.year} 年度事件 · 经营已记为「${C.lastYear.operationName}」</p>
      <h2 id="lgc-event-title" data-focus tabindex="-1">${event.title}</h2>
      <p>${event.context}</p>
      <div class="lgc-eventoptions">
        ${event.options.map((option, index) => `
          <button type="button" data-event-choice="${option.id}">
            <span>选择 ${index + 1}</span>
            <strong>${option.name}</strong>
            <small>${option.description}</small>
          </button>
        `).join('')}
      </div>
      <p class="lgc-footnote">事件参数同为示意推演。选择结果会保留到后续年份，不代表现实中的确定因果。</p>
    </section>
  `;
}

function yearResultHTML() {
  const record = C.lastYear;
  return `
    <section class="lgc-yearresult" aria-labelledby="lgc-result-title" aria-live="polite">
      <p class="lgc-kicker">年中反馈 · ${record.year}</p>
      <h2 id="lgc-result-title" data-focus tabindex="-1">${record.year} 年，这笔账这样落下</h2>
      <div class="lgc-ledgerline">
        <span>经营收入 <b>${record.income}</b></span>
        <span>经营成本 <b>${record.operatingCost}</b></span>
        <span>偿还欠账 <b>${record.debtPayment}</b></span>
        <span>事件前净额 <b>${record.income - record.cost}</b></span>
        <span>累计资金 <b>${record.cashAfter}</b></span>
      </div>
      <p class="lgc-feedback">${record.feedback}</p>
      ${record.event ? `
        <div class="lgc-eventresult">
          <span>${record.event.title} · 你选择了</span>
          <h3>${record.event.choiceName}</h3>
          <p>${record.event.explanation}</p>
        </div>
      ` : ''}
      ${record.stageResult ? `
        <div class="lgc-stageresult ${record.stageResult.passed ? 'is-pass' : ''}">
          <strong>${record.stageResult.passed ? '阶段目标达成' : '阶段反馈'} · ${record.stageResult.title}</strong>
          <p>${record.stageResult.text}</p>
        </div>
      ` : ''}
      <button type="button" class="lgc-next" id="lgc-next">${C.year === CAMPAIGN_END ? '查看 2025 多维结算' : `进入 ${C.year + 1  } 年`}<span aria-hidden="true">→</span></button>
      <p class="lgc-footnote">只有完成本年经营和事件后才能推进。没有跳年或提前结算按钮。</p>
    </section>
  `;
}

function campaignSummaryHTML(summary) {
  return `
    <section class="lgc-summary" aria-labelledby="lgc-summary-title">
      <p class="lgc-kicker">2005 至 2025 · ${summary.metGoals}/5 项示意目标达成</p>
      <h2 id="lgc-summary-title" data-focus tabindex="-1">${summary.outcome}</h2>
      <p>${summary.scenarioName} · ${summary.closedYear === null ? '始终未关矿' : `${summary.closedYear} 年永久关矿`} · 剩余储量 ${summary.final.reserve} 单位</p>
      <p class="lgc-modelnote"><strong>${summary.parameterNote}</strong>。以下评价只解释本局参数与选择，不是真实绩效或未来预测。</p>
      <div class="lgc-dimensions">
        ${summary.dimensions.map((dimension) => `
          <article class="lgc-dimension">
            <div><span>${dimension.label}</span><i>${dimension.status}</i></div>
            <h3>${dimension.value}</h3>
            <div class="lgc-meter" role="img" aria-label="${dimension.label}评价 ${dimension.score} 点"><i style="--score:${Math.max(0, Math.min(100, dimension.score))}"></i></div>
            <small>${dimension.target}</small>
            <p>${dimension.detail}</p>
          </article>
        `).join('')}
      </div>
      <section class="lgc-reflection">
        <h3>目标回看与下一局线索</h3>
        <ul>${summary.goals.map((goal) => `<li class="${goal.passed ? 'is-pass' : ''}"><span>${goal.passed ? '已达成' : '待继续'}</span>${goal.label}：${goal.actual}${goal.passed ? '' : `，示意目标 ${goal.target} ${goal.unit}`}</li>`).join('')}</ul>
        ${summary.reflections.map((text) => `<p>${text}</p>`).join('')}
      </section>
      <div class="lgc-summaryactions">
        <button type="button" class="lgc-next" id="lgc-replay">同场景再玩一次</button>
        <button type="button" class="lgc-secondary" id="lgc-scenarios">换一个场景</button>
      </div>
    </section>
  `;
}

function renderCampaign() {
  let content;
  if (!C) content = scenarioPickerHTML();
  else if (C.phase === 'complete') {
    const summary = getCampaignSummary(C);
    saveBestRun(summary);
    content = campaignSummaryHTML(summary);
  } else {
    const phaseContent = C.phase === 'decision'
      ? operationOptionsHTML()
      : C.phase === 'event'
        ? eventDecisionHTML()
        : yearResultHTML();
    content = `${campaignProgressHTML()}${campaignStageHTML()}${campaignStatsHTML()}${phaseContent}`;
  }
  panelEl.innerHTML = `<div class="lgc">${campaignHeaderHTML()}${content}</div>`;
  bindModeSwitches();

  panelEl.querySelector('#lgc-exit')?.addEventListener('click', () => {
    if (C?.history.length && !window.confirm('重选场景会结束当前这一局，已完成的本机最佳记录会保留。继续吗？')) return;
    C = null;
    renderPanel();
    redraw();
    focusCampaignRegion();
  });
  panelEl.querySelectorAll('[data-scenario]').forEach((button) => {
    button.addEventListener('click', () => {
      C = createCampaign(button.dataset.scenario);
      storageNotice = '';
      renderPanel();
      redraw();
      focusCampaignRegion();
    });
  });
  panelEl.querySelectorAll('[data-op]').forEach((button) => {
    button.addEventListener('click', () => {
      if (button.disabled || C?.phase !== 'decision') return;
      C = applyYear(C, button.dataset.op);
      renderPanel();
      redraw();
      focusCampaignRegion();
    });
  });
  panelEl.querySelectorAll('[data-event-choice]').forEach((button) => {
    button.addEventListener('click', () => {
      if (C?.phase !== 'event') return;
      C = applyEvent(C, button.dataset.eventChoice);
      renderPanel();
      redraw();
      focusCampaignRegion();
    });
  });
  panelEl.querySelector('#lgc-next')?.addEventListener('click', () => {
    if (C?.phase !== 'yearResult') return;
    C = advanceYear(C);
    renderPanel();
    redraw();
    focusCampaignRegion();
  });
  panelEl.querySelector('#lgc-replay')?.addEventListener('click', () => {
    C = createCampaign(C.scenarioId);
    renderPanel();
    redraw();
    focusCampaignRegion();
  });
  panelEl.querySelector('#lgc-scenarios')?.addEventListener('click', () => {
    C = null;
    renderPanel();
    redraw();
    focusCampaignRegion();
  });
}

/** 时间轴本体，单独抽出来，两个自由沙盘界面都要用 */
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
    ${modeSwitchHTML('sandbox')}
    <div class="lgc-sandboxnote"><strong>自由沙盘</strong><span>保留原时间轴：可任意改年份，也可直接推到 2025。${MODEL_NOTE}。</span></div>
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
  bindModeSwitches();
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
    ${modeSwitchHTML('sandbox')}
    <div class="lgc-sandboxnote"><strong>自由沙盘 · 结局回看</strong><span>${MODEL_NOTE}。</span></div>
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

  bindModeSwitches();
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
