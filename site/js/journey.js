/**
 * journey.js — 十地考察主线
 *
 * 站点只提供入口与本模块。题目来自 data/journey.js，存档仅记录答案 ID。
 */

import { JOURNEY_INTRO, JOURNEY_CHAPTERS } from '../data/journey.js';

const STORE_KEY = 'liangshan20.journey.v1';
const STORE_VERSION = 1;
const CHAPTER_COUNT = 10;
const DECISIONS_PER_CHAPTER = 2;
const CHOICES_PER_DECISION = 3;
const TOTAL_DECISIONS = CHAPTER_COUNT * DECISIONS_PER_CHAPTER;
const DIMENSIONS = [
  { id: 'ecology', label: '生态' },
  { id: 'livelihood', label: '生计' },
  { id: 'culture', label: '文化' },
];

let model = null;
let prepared = false;
let state = { answers: Object.create(null) };
let root = null;
let lastFocus = null;
let previousBodyOverflow = '';
let storageAvailable = true;
let sessionNotice = '';
let view = freshView();

function freshView() {
  return {
    screen: 'cover',
    requestedChapter: 0,
    chapterIndex: 0,
    decisionIndex: 0,
    editing: false,
    confirmReset: false,
  };
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requireText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function validateData(intro, chapters) {
  if (!isRecord(intro) || !['title', 'kicker', 'description', 'scenarioNote'].every((key) => requireText(intro[key]))) {
    throw new Error('Invalid journey introduction');
  }
  if (!Array.isArray(chapters) || chapters.length !== CHAPTER_COUNT) {
    throw new Error('Journey requires ten chapters');
  }

  const chapterIds = new Set();
  const decisionIds = new Set();
  const decisionById = new Map();
  const decisions = [];

  chapters.forEach((chapter) => {
    if (!isRecord(chapter) || !['id', 'siteId', 'title', 'subtitle', 'context', 'reflection'].every((key) => requireText(chapter[key]))) {
      throw new Error('Invalid journey chapter');
    }
    if (chapterIds.has(chapter.id)) throw new Error('Duplicate chapter id');
    chapterIds.add(chapter.id);
    if (!isRecord(chapter.evidence) || !requireText(chapter.evidence.text) || !requireText(chapter.evidence.source)) {
      throw new Error('Invalid chapter evidence');
    }
    if (!Array.isArray(chapter.decisions) || chapter.decisions.length !== DECISIONS_PER_CHAPTER) {
      throw new Error('Each chapter requires two decisions');
    }

    chapter.decisions.forEach((decision) => {
      if (!isRecord(decision) || !['id', 'title', 'situation', 'question'].every((key) => requireText(decision[key]))) {
        throw new Error('Invalid journey decision');
      }
      if (decisionIds.has(decision.id)) throw new Error('Duplicate decision id');
      decisionIds.add(decision.id);
      if (!Array.isArray(decision.choices) || decision.choices.length !== CHOICES_PER_DECISION) {
        throw new Error('Each decision requires three choices');
      }

      const choiceIds = new Set();
      const choiceById = new Map();
      decision.choices.forEach((choice) => {
        if (!isRecord(choice) || !['id', 'label', 'detail', 'result'].every((key) => requireText(choice[key]))) {
          throw new Error('Invalid journey choice');
        }
        if (choiceIds.has(choice.id)) throw new Error('Duplicate choice id');
        choiceIds.add(choice.id);
        if (!isRecord(choice.effects) || !DIMENSIONS.every(({ id }) => Number.isFinite(choice.effects[id]))) {
          throw new Error('Invalid choice effects');
        }
        choiceById.set(choice.id, choice);
      });

      const entry = { decision, choiceById };
      decisionById.set(decision.id, entry);
      decisions.push(entry);
    });
  });

  if (decisions.length !== TOTAL_DECISIONS) throw new Error('Journey requires twenty decisions');
  return { intro, chapters, decisions, decisionById };
}

function prepare() {
  if (prepared) return;
  prepared = true;
  try {
    model = validateData(JOURNEY_INTRO, JOURNEY_CHAPTERS);
  } catch (_) {
    model = null;
  }
  state = loadState();
}

function emptyEffects() {
  return { ecology: 0, livelihood: 0, culture: 0 };
}

function loadState() {
  const blank = { answers: Object.create(null) };
  let raw;
  try {
    raw = window.localStorage.getItem(STORE_KEY);
  } catch (_) {
    storageAvailable = false;
    return blank;
  }
  if (raw === null) return blank;

  try {
    const saved = JSON.parse(raw);
    if (!isRecord(saved) || saved.version !== STORE_VERSION || !isRecord(saved.answers)) {
      throw new Error('Invalid save');
    }
    if (!model) return blank;

    const answers = Object.create(null);
    let skipped = 0;
    Object.entries(saved.answers).forEach(([decisionId, choiceId]) => {
      const entry = model.decisionById.get(decisionId);
      if (typeof choiceId !== 'string' || !entry || !entry.choiceById.has(choiceId)) {
        skipped += 1;
        return;
      }
      answers[decisionId] = choiceId;
    });
    if (skipped) sessionNotice = '部分旧记录与当前题目不匹配，已保留可识别的答案。';
    return { answers };
  } catch (_) {
    sessionNotice = '旧存档无法读取，已回退到空白考察。';
    try {
      window.localStorage.removeItem(STORE_KEY);
    } catch (_) {
      storageAvailable = false;
    }
    return blank;
  }
}

function saveState() {
  try {
    window.localStorage.setItem(STORE_KEY, JSON.stringify({
      version: STORE_VERSION,
      answers: state.answers,
    }));
    storageAvailable = true;
  } catch (_) {
    storageAvailable = false;
  }
}

function selectedChoice(decision) {
  const entry = model?.decisionById.get(decision.id);
  const choiceId = state.answers[decision.id];
  return entry && typeof choiceId === 'string' ? entry.choiceById.get(choiceId) || null : null;
}

/** 所有汇总都从当前答案重算，回看改选不会叠加。 */
export function getJourneyProgress() {
  prepare();
  const effects = emptyEffects();
  let answered = 0;

  if (model) {
    model.decisions.forEach(({ decision, choiceById }) => {
      const choiceId = state.answers[decision.id];
      if (typeof choiceId !== 'string' || !choiceById.has(choiceId)) return;
      const choice = choiceById.get(choiceId);
      answered += 1;
      DIMENSIONS.forEach(({ id }) => {
        effects[id] += choice.effects[id];
      });
    });
  }

  DIMENSIONS.forEach(({ id }) => {
    effects[id] = Number(effects[id].toFixed(2));
  });
  const total = model ? model.decisions.length : TOTAL_DECISIONS;
  const completedChapters = model
    ? model.chapters.filter((chapter) => chapter.decisions.every((decision) => Boolean(selectedChoice(decision)))).length
    : 0;

  return {
    answered,
    total,
    completedChapters,
    totalChapters: model ? model.chapters.length : CHAPTER_COUNT,
    completed: total > 0 && answered === total,
    effects,
  };
}

/** 幂等创建全屏对话框，不要求 index.html 预留节点。 */
export function initJourney() {
  prepare();
  if (root?.isConnected) return root;
  if (!document.body) return null;

  root = document.createElement('dialog');
  root.id = 'journey-dialog';
  root.className = 'journey';
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-labelledby', 'journey-dialog-title');
  root.innerHTML = `
    <div class="journey__shell">
      <header class="journey__header">
        <div class="journey__brand">
          <span class="journey__seal" aria-hidden="true">考</span>
          <div>
            <span class="journey__overline">两山二十年</span>
            <span class="journey__name" id="journey-dialog-title">十地考察</span>
          </div>
        </div>
        <div class="journey__header-actions">
          <span class="journey__progress" data-journey-progress aria-live="polite" aria-atomic="true"></span>
          <button class="journey__close" type="button" data-action="close" aria-label="收起十地考察">
            <span aria-hidden="true">收起</span><span aria-hidden="true">×</span>
          </button>
        </div>
      </header>
      <div class="journey__notices" data-journey-notices></div>
      <div class="journey__layout">
        <nav class="journey__chapters" data-journey-chapters aria-label="考察章节"></nav>
        <section class="journey__content" data-journey-content aria-label="考察内容"></section>
      </div>
      <p class="journey__sr" data-journey-announcer role="status" aria-live="polite" aria-atomic="true"></p>
    </div>`;

  root.addEventListener('click', handleClick);
  root.addEventListener('cancel', (event) => {
    event.preventDefault();
    if (view.confirmReset) cancelReset();
    else closeJourney();
  });
  root.addEventListener('close', restoreAfterClose);
  root.addEventListener('keydown', trapFocus);
  document.body.appendChild(root);
  render();
  return root;
}

/** 默认先显示封面；传入章节序号后，开始按钮会从该章进入。 */
export function openJourney(chapterIndex = 0) {
  const dialog = initJourney();
  if (!dialog) return;
  const requestedChapter = clampIndex(chapterIndex, model?.chapters.length || CHAPTER_COUNT);

  if (dialog.open) {
    showChapter(requestedChapter, 0);
    return;
  }

  lastFocus = document.activeElement;
  previousBodyOverflow = document.body.style.overflow;
  view = { ...freshView(), requestedChapter };
  render();
  document.body.style.overflow = 'hidden';
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', '');
  dialog.classList.add('is-open');
  focusElement('[data-journey-heading]');
}

export function closeJourney() {
  if (!root?.open) return;
  if (typeof root.close === 'function') root.close();
  else {
    root.removeAttribute('open');
    restoreAfterClose();
  }
}

/** 公开重置直接清空；界面入口会先经过二次确认。 */
export function resetJourney() {
  prepare();
  state = { answers: Object.create(null) };
  sessionNotice = '';
  try {
    window.localStorage.removeItem(STORE_KEY);
    storageAvailable = true;
  } catch (_) {
    storageAvailable = false;
  }
  const requestedChapter = view.requestedChapter || 0;
  view = { ...freshView(), requestedChapter };
  if (root) {
    render();
    if (root.open) focusElement('[data-journey-heading]');
  }
  announce('考察记录已清空，可以重新开始。');
  return getJourneyProgress();
}

function restoreAfterClose() {
  if (!root) return;
  root.classList.remove('is-open');
  document.body.style.overflow = previousBodyOverflow;
  const target = lastFocus;
  lastFocus = null;
  if (target?.isConnected && typeof target.focus === 'function') {
    target.focus({ preventScroll: true });
  }
}

function clampIndex(value, length) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(length - 1, Math.trunc(number)));
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[char]);
}

function pad(value) {
  return String(value).padStart(2, '0');
}

function signed(value) {
  const normalized = Number(value.toFixed(2));
  return normalized > 0 ? `+${normalized}` : String(normalized);
}

function announce(message) {
  const node = root?.querySelector('[data-journey-announcer]');
  if (node) node.textContent = message;
}

function focusElement(selector) {
  if (!root?.open) return false;
  const node = root.querySelector(selector);
  if (!node || typeof node.focus !== 'function') return false;
  node.focus({ preventScroll: true });
  return true;
}

function trapFocus(event) {
  if (event.key !== 'Tab' || !root?.open) return;
  const focusables = Array.from(root.querySelectorAll(
    'button:not([disabled]), [href], textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
  )).filter((node) => !node.closest('[hidden]') && node.getClientRects().length > 0);
  if (!focusables.length) {
    event.preventDefault();
    return;
  }
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  const active = document.activeElement;
  if (event.shiftKey && (active === first || !root.contains(active))) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && (active === last || !root.contains(active))) {
    event.preventDefault();
    first.focus();
  }
}

function render() {
  if (!root) return;
  const progress = getJourneyProgress();
  root.dataset.screen = model ? view.screen : 'error';
  root.querySelector('[data-journey-progress]').textContent = `已答 ${progress.answered} / ${progress.total}`;

  const noticeNode = root.querySelector('[data-journey-notices]');
  const notices = [];
  if (!storageAvailable) notices.push('浏览器未能保存进度，本次记录仅在当前页面保留。');
  if (sessionNotice) notices.push(sessionNotice);
  noticeNode.hidden = notices.length === 0;
  noticeNode.textContent = notices.join(' ');

  const navigation = root.querySelector('[data-journey-chapters]');
  navigation.hidden = !model || view.screen === 'cover';
  navigation.innerHTML = model && view.screen !== 'cover' ? renderChapterNavigation(progress) : '';

  const content = root.querySelector('[data-journey-content]');
  if (!model) content.innerHTML = renderDataError();
  else if (view.screen === 'chapter') content.innerHTML = renderChapter();
  else if (view.screen === 'summary') content.innerHTML = renderSummary(progress);
  else content.innerHTML = renderCover(progress);
  content.scrollTop = 0;
}

function renderDataError() {
  return `
    <div class="journey__page journey__page--centered">
      <p class="journey__kicker">资料载入</p>
      <h1 data-journey-heading tabindex="-1">考察数据暂未就绪</h1>
      <p class="journey__lead">请确认题目数据包含十章、二十问，并为每问提供三个行动选项。</p>
      <button class="journey__button journey__button--quiet" type="button" data-action="close">返回地图</button>
    </div>`;
}

function renderCover(progress) {
  const { intro } = model;
  const hasArchive = progress.answered > 0;
  let primary;
  if (progress.completed) {
    primary = '<button class="journey__button" type="button" data-action="summary">查看个人考察手记</button>';
  } else if (hasArchive) {
    const next = firstUnansweredLocation();
    primary = `<button class="journey__button" type="button" data-action="continue">继续考察 · 第 ${next.chapterIndex + 1} 章</button>`;
  } else {
    primary = '<button class="journey__button" type="button" data-action="start">开始考察</button>';
  }

  return `
    <div class="journey__page journey__cover">
      <div class="journey__cover-mark" aria-hidden="true"><span>十</span><span>地</span></div>
      <p class="journey__kicker">${esc(intro.kicker)}</p>
      <h1 data-journey-heading tabindex="-1">${esc(intro.title)}</h1>
      <p class="journey__lead">${esc(intro.description)}</p>
      <div class="journey__counts" aria-label="十章二十问六十项行动">
        <span><strong>10</strong> 章地方情境</span>
        <span><strong>20</strong> 问治理选择</span>
        <span><strong>60</strong> 项具体行动</span>
      </div>
      <div class="journey__scenario">
        <span class="journey__section-label">设问边界</span>
        <p>${esc(intro.scenarioNote)}</p>
        <p>选项与结果用于理解治理权衡。三维数值只汇总本局选择，不构成现实预测或能力评价。</p>
      </div>
      <div class="journey__actions">
        ${primary}
        ${hasArchive ? '<button class="journey__button journey__button--quiet" type="button" data-action="review">从第一章回看</button>' : ''}
      </div>
      ${hasArchive ? `<p class="journey__archive">本地已有 ${progress.answered} 条答案，完成 ${progress.completedChapters} 章。回看改选后，汇总会自动更新。</p>` : '<p class="journey__archive">答案仅保存在当前浏览器，不收集个人信息。</p>'}
    </div>`;
}

function renderChapterNavigation() {
  const items = model.chapters.map((chapter, chapterIndex) => {
    const answered = chapter.decisions.filter((decision) => Boolean(selectedChoice(decision))).length;
    const current = view.screen === 'chapter' && chapterIndex === view.chapterIndex;
    return `
      <li>
        <button class="journey__chapter${current ? ' is-current' : ''}${answered === DECISIONS_PER_CHAPTER ? ' is-complete' : ''}"
          type="button" data-action="chapter" data-chapter-index="${chapterIndex}"
          ${current ? 'aria-current="step"' : ''}
          aria-label="第 ${chapterIndex + 1} 章 ${esc(chapter.title)}，已答 ${answered} 问">
          <span class="journey__chapter-number">${pad(chapterIndex + 1)}</span>
          <span class="journey__chapter-title">${esc(chapter.title)}</span>
          <span class="journey__chapter-count">${answered} / ${DECISIONS_PER_CHAPTER}</span>
        </button>
      </li>`;
  }).join('');
  return `<ol>${items}</ol>`;
}

function renderChapter() {
  const chapter = model.chapters[view.chapterIndex];
  const decision = chapter.decisions[view.decisionIndex];
  const choice = selectedChoice(decision);
  const globalIndex = view.chapterIndex * DECISIONS_PER_CHAPTER + view.decisionIndex;

  return `
    <div class="journey__page journey__chapter-page">
      <header class="journey__chapter-header">
        <p class="journey__kicker">第 ${pad(view.chapterIndex + 1)} 章 · ${esc(chapter.siteId)}</p>
        <h1 data-journey-heading tabindex="-1">${esc(chapter.title)}</h1>
        <p class="journey__subtitle">${esc(chapter.subtitle)}</p>
        <p class="journey__context">${esc(chapter.context)}</p>
        <aside class="journey__evidence" aria-label="事实依据">
          <span class="journey__section-label">事实依据</span>
          <p>${esc(chapter.evidence.text)}</p>
          <p class="journey__source">来源：${esc(chapter.evidence.source)}</p>
        </aside>
      </header>

      <div class="journey__decision-tabs" role="group" aria-label="本章设问">
        ${chapter.decisions.map((item, index) => `
          <button type="button" data-action="decision" data-decision-index="${index}"
            class="journey__decision-tab${index === view.decisionIndex ? ' is-current' : ''}"
            ${index === view.decisionIndex ? 'aria-current="step"' : ''}
            aria-label="第 ${index + 1} 问，${selectedChoice(item) ? '已答' : '未答'}">
            <span>设问 ${pad(index + 1)}</span><span>${selectedChoice(item) ? '已记录' : '待选择'}</span>
          </button>`).join('')}
      </div>

      ${choice && !view.editing ? renderResult(chapter, decision, choice, globalIndex) : renderChoices(decision, choice, globalIndex)}
    </div>`;
}

function renderChoices(decision, currentChoice, globalIndex) {
  return `
    <article class="journey__decision">
      <p class="journey__question-index">全程第 ${pad(globalIndex + 1)} 问 · 本章第 ${view.decisionIndex + 1} 问</p>
      <h2 data-decision-heading tabindex="-1">${esc(decision.title)}</h2>
      <p class="journey__situation">${esc(decision.situation)}</p>
      <p class="journey__question">${esc(decision.question)}</p>
      ${currentChoice ? '<p class="journey__editing-note">改选会替换原答案，三维合计将重新计算。</p>' : ''}
      <div class="journey__choices">
        ${decision.choices.map((choice, index) => `
          <button class="journey__choice${currentChoice?.id === choice.id ? ' is-selected' : ''}" type="button"
            data-action="choose" data-choice-index="${index}" aria-pressed="${currentChoice?.id === choice.id}">
            <span class="journey__choice-index" aria-hidden="true">${pad(index + 1)}</span>
            <span class="journey__choice-copy"><strong>${esc(choice.label)}</strong><span>${esc(choice.detail)}</span></span>
            <span class="journey__choice-arrow" aria-hidden="true">→</span>
          </button>`).join('')}
      </div>
      ${currentChoice ? '<button class="journey__text-button" type="button" data-action="cancel-edit">保留原选择，返回结果</button>' : ''}
    </article>`;
}

function renderResult(chapter, decision, choice, globalIndex) {
  const isLast = globalIndex === TOTAL_DECISIONS - 1;
  const completed = getJourneyProgress().completed;
  const nextLabel = isLast ? (completed ? '查看个人考察手记' : '前往首个未答') : '下一问';
  return `
    <article class="journey__decision journey__result">
      <p class="journey__question-index">全程第 ${pad(globalIndex + 1)} 问 · 选择已记录</p>
      <h2 data-decision-heading tabindex="-1">${esc(decision.title)}</h2>
      <div class="journey__result-card">
        <span class="journey__section-label">本局行动 · ${esc(choice.label)}</span>
        <p>${esc(choice.result)}</p>
      </div>
      <div class="journey__effect-block">
        <span class="journey__section-label">本次三维变化</span>
        <ul class="journey__effects">
          ${DIMENSIONS.map(({ id, label }) => `
            <li class="journey__effect journey__effect--${id}">
              <span>${label}</span><strong>${signed(choice.effects[id])}</strong>
            </li>`).join('')}
        </ul>
        <p class="journey__effect-note">变化值用于本局对照，不代表真实地区的因果预测。</p>
      </div>
      <aside class="journey__reflection">
        <span class="journey__section-label">本章反思</span>
        <p>${esc(chapter.reflection)}</p>
      </aside>
      <div class="journey__result-actions">
        <button class="journey__text-button" type="button" data-action="edit">改选此问</button>
        <div>
          ${globalIndex > 0 ? '<button class="journey__button journey__button--quiet" type="button" data-action="previous">上一问</button>' : ''}
          <button class="journey__button" type="button" data-action="next">${nextLabel}</button>
        </div>
      </div>
    </article>`;
}

function neutralTitle(effects) {
  const highest = Math.max(...DIMENSIONS.map(({ id }) => effects[id]));
  const leaders = DIMENSIONS.filter(({ id }) => effects[id] === highest);
  return leaders.length === 1 ? `${leaders[0].label}线索记录者` : '多维治理记录者';
}

function choiceDistribution() {
  const counts = Array(CHOICES_PER_DECISION).fill(0);
  model.decisions.forEach(({ decision, choiceById }) => {
    const choice = choiceById.get(state.answers[decision.id]);
    const index = decision.choices.indexOf(choice);
    if (index >= 0) counts[index] += 1;
  });
  return counts;
}

function buildNotes(progress) {
  const distribution = choiceDistribution();
  const lines = [
    `《${model.intro.title}》个人考察手记`,
    '十章二十问已完成。本手记来自虚构设问，仅用于回看本局选择。',
    `本局称号：${neutralTitle(progress.effects)}`,
    `三维合计：${DIMENSIONS.map(({ id, label }) => `${label} ${signed(progress.effects[id])}`).join('；')}`,
    `行动位置分布：${distribution.map((count, index) => `第 ${index + 1} 项 ${count} 次`).join('；')}`,
    '',
    '每章回顾',
  ];

  model.chapters.forEach((chapter, chapterIndex) => {
    lines.push(`${pad(chapterIndex + 1)} ${chapter.title}`);
    chapter.decisions.forEach((decision, decisionIndex) => {
      const choice = selectedChoice(decision);
      if (!choice) return;
      lines.push(`${decisionIndex + 1}. ${decision.title}：${choice.label}`);
      lines.push(choice.result);
    });
    lines.push('');
  });
  lines.push('称号描述选择分布，不评价现实治理能力。三维合计不构成现实预测。');
  return lines.join('\n');
}

function renderSummary(progress) {
  const distribution = choiceDistribution();
  const notes = buildNotes(progress);
  return `
    <div class="journey__page journey__summary">
      <header class="journey__summary-header">
        <p class="journey__kicker">考察完成 · 20 / 20</p>
        <h1 data-journey-heading tabindex="-1">个人考察手记</h1>
        <p class="journey__lead">二十次选择已经收进这一页。可以复制留存，也可以回到任意一章改选。</p>
      </header>

      <section class="journey__summary-grid" aria-label="本局选择汇总">
        <div class="journey__title-card">
          <span class="journey__section-label">本局称号</span>
          <strong>${esc(neutralTitle(progress.effects))}</strong>
          <p>描述本次选择分布，不评价现实治理能力。</p>
        </div>
        <div class="journey__total-card">
          <span class="journey__section-label">三维合计</span>
          <ul class="journey__effects journey__effects--totals">
            ${DIMENSIONS.map(({ id, label }) => `
              <li class="journey__effect journey__effect--${id}"><span>${label}</span><strong>${signed(progress.effects[id])}</strong></li>`).join('')}
          </ul>
          <p>仅汇总当前二十问答案。</p>
        </div>
        <div class="journey__distribution-card">
          <span class="journey__section-label">行动位置分布</span>
          <ul>
            ${distribution.map((count, index) => `
              <li><span>每问第 ${index + 1} 项</span><strong>${count} 次</strong>
                <span class="journey__share" aria-hidden="true"><span style="width:${(count / TOTAL_DECISIONS) * 100}%"></span></span>
              </li>`).join('')}
          </ul>
        </div>
      </section>

      ${view.confirmReset ? `
        <div class="journey__confirm" role="alert" aria-labelledby="journey-reset-title">
          <div><strong id="journey-reset-title">确认重新考察？</strong><p>这会清空二十问记录和当前手记，操作无法撤回。</p></div>
          <div class="journey__actions">
            <button class="journey__button journey__button--quiet" type="button" data-action="reset-cancel">保留当前手记</button>
            <button class="journey__button journey__button--danger" type="button" data-action="reset-confirm">确认清空</button>
          </div>
        </div>` : `
        <div class="journey__summary-actions">
          <button class="journey__button" type="button" data-action="copy">复制考察手记</button>
          <button class="journey__button journey__button--quiet" type="button" data-action="review">回第一章改选</button>
          <button class="journey__text-button journey__text-button--danger" type="button" data-action="reset-request">重新考察</button>
        </div>`}
      <label class="journey__copy-fallback" data-copy-fallback hidden>
        <span>自动复制未成功，请在下方全选并复制手记。</span>
        <textarea data-journey-notes readonly rows="12" aria-label="个人考察手记文本">${esc(notes)}</textarea>
      </label>

      <section class="journey__review" aria-labelledby="journey-review-title">
        <div class="journey__review-heading">
          <span class="journey__section-label">逐章回看</span>
          <h2 id="journey-review-title">十章结果回顾</h2>
        </div>
        <ol>
          ${model.chapters.map((chapter, chapterIndex) => `
            <li class="journey__review-chapter">
              <button class="journey__review-title" type="button" data-action="chapter" data-chapter-index="${chapterIndex}"
                aria-label="回看第 ${chapterIndex + 1} 章 ${esc(chapter.title)}">
                <span>${pad(chapterIndex + 1)}</span><strong>${esc(chapter.title)}</strong><span aria-hidden="true">回看 →</span>
              </button>
              <div class="journey__review-decisions">
                ${chapter.decisions.map((decision) => {
                  const choice = selectedChoice(decision);
                  return `<article>
                    <p class="journey__review-question">${esc(decision.title)}</p>
                    <p class="journey__review-choice">${esc(choice?.label || '')}</p>
                    <p>${esc(choice?.result || '')}</p>
                  </article>`;
                }).join('')}
              </div>
            </li>`).join('')}
        </ol>
      </section>
    </div>`;
}

function firstUnansweredLocation() {
  if (!model) return { chapterIndex: 0, decisionIndex: 0 };
  const index = model.decisions.findIndex(({ decision }) => !selectedChoice(decision));
  if (index < 0) return { chapterIndex: 0, decisionIndex: 0 };
  return {
    chapterIndex: Math.floor(index / DECISIONS_PER_CHAPTER),
    decisionIndex: index % DECISIONS_PER_CHAPTER,
  };
}

function showChapter(chapterIndex, decisionIndex = null) {
  if (!model) return;
  const safeChapter = clampIndex(chapterIndex, model.chapters.length);
  const targetDecision = decisionIndex === null
    ? model.chapters[safeChapter].decisions.findIndex((decision) => !selectedChoice(decision))
    : decisionIndex;
  view = {
    ...freshView(),
    screen: 'chapter',
    requestedChapter: view.requestedChapter,
    chapterIndex: safeChapter,
    decisionIndex: targetDecision < 0 ? 0 : clampIndex(targetDecision, DECISIONS_PER_CHAPTER),
  };
  render();
  focusElement('[data-journey-heading]');
}

function showDecision(globalIndex) {
  const safeIndex = clampIndex(globalIndex, TOTAL_DECISIONS);
  view = {
    ...freshView(),
    screen: 'chapter',
    requestedChapter: view.requestedChapter,
    chapterIndex: Math.floor(safeIndex / DECISIONS_PER_CHAPTER),
    decisionIndex: safeIndex % DECISIONS_PER_CHAPTER,
  };
  render();
  focusElement('[data-decision-heading]');
}

function showSummary() {
  if (!getJourneyProgress().completed) {
    const next = firstUnansweredLocation();
    showChapter(next.chapterIndex, next.decisionIndex);
    return;
  }
  view = { ...freshView(), screen: 'summary', requestedChapter: view.requestedChapter };
  render();
  focusElement('[data-journey-heading]');
}

function cancelReset() {
  view.confirmReset = false;
  render();
  focusElement('[data-action="reset-request"]');
  announce('已保留当前考察手记。');
}

async function copyNotes() {
  const progress = getJourneyProgress();
  if (!progress.completed) return;
  const notes = buildNotes(progress);
  try {
    if (!navigator.clipboard || typeof navigator.clipboard.writeText !== 'function') {
      throw new Error('Clipboard unavailable');
    }
    await navigator.clipboard.writeText(notes);
    announce('个人考察手记已复制。');
  } catch (_) {
    const fallback = root?.querySelector('[data-copy-fallback]');
    const textarea = root?.querySelector('[data-journey-notes]');
    if (!fallback || !textarea) return;
    fallback.hidden = false;
    textarea.value = notes;
    textarea.focus();
    textarea.select();
    announce('自动复制未成功，手记文本已全选，可以手动复制。');
  }
}

function handleClick(event) {
  const button = event.target.closest('button[data-action]');
  if (!button || !root?.contains(button)) return;
  const action = button.dataset.action;

  if (action === 'close') closeJourney();
  else if (action === 'start') showChapter(view.requestedChapter, 0);
  else if (action === 'continue') {
    const next = firstUnansweredLocation();
    showChapter(next.chapterIndex, next.decisionIndex);
  } else if (action === 'review') showChapter(0, 0);
  else if (action === 'summary') showSummary();
  else if (action === 'chapter') showChapter(Number(button.dataset.chapterIndex));
  else if (action === 'decision') {
    view.decisionIndex = clampIndex(Number(button.dataset.decisionIndex), DECISIONS_PER_CHAPTER);
    view.editing = false;
    render();
    focusElement('[data-decision-heading]');
  } else if (action === 'choose') {
    const chapter = model.chapters[view.chapterIndex];
    const decision = chapter.decisions[view.decisionIndex];
    const choice = decision.choices[clampIndex(Number(button.dataset.choiceIndex), CHOICES_PER_DECISION)];
    state.answers[decision.id] = choice.id;
    view.editing = false;
    saveState();
    render();
    focusElement('[data-decision-heading]');
    announce(`已记录「${choice.label}」。${getJourneyProgress().answered} 问已完成。`);
  } else if (action === 'edit') {
    view.editing = true;
    render();
    focusElement('.journey__choice.is-selected') || focusElement('.journey__choice');
  } else if (action === 'cancel-edit') {
    view.editing = false;
    render();
    focusElement('[data-decision-heading]');
  } else if (action === 'previous') {
    showDecision(view.chapterIndex * DECISIONS_PER_CHAPTER + view.decisionIndex - 1);
  } else if (action === 'next') {
    const current = view.chapterIndex * DECISIONS_PER_CHAPTER + view.decisionIndex;
    if (current >= TOTAL_DECISIONS - 1) {
      if (getJourneyProgress().completed) showSummary();
      else {
        const next = firstUnansweredLocation();
        showChapter(next.chapterIndex, next.decisionIndex);
      }
    } else showDecision(current + 1);
  } else if (action === 'copy') void copyNotes();
  else if (action === 'reset-request') {
    view.confirmReset = true;
    render();
    focusElement('[data-action="reset-cancel"]');
  } else if (action === 'reset-cancel') cancelReset();
  else if (action === 'reset-confirm') resetJourney();
}
