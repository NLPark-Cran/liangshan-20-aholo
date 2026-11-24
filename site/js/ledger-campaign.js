/**
 * ledger-campaign.js — 「一亩山的账本」治理模式引擎
 *
 * 所有数值都是示意参数。模块不访问 DOM、网络或存储，也不使用随机数；
 * 每个操作都返回新状态，相同输入得到相同结果，方便离线运行与测试。
 */

export const START_YEAR = 2005;
export const END_YEAR = 2025;
export const MODEL_NOTE = '示意推演，非真实账目';

const clamp = (value, min = 0, max = 100) => Math.min(max, Math.max(min, value));
const round = (value) => Math.round(value);

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

export const SCENARIOS = deepFreeze([
  {
    id: 'transition',
    name: '山村转型试验',
    subtitle: '在订单、修复和转岗之间找出能持续的组合',
    difficulty: '均衡',
    initial: { cash: 320, mountain: 86, reserve: 100, livelihood: 58 },
    extraction: 6,
    orePrice: 43,
    costScale: 1,
    mineCost: 54,
    mineDamage: 4,
    closureCost: 95,
    repairFactor: 2.2,
    targets: { cash: 2200, mountain: 76, livelihood: 72, maxDebt: 90, closeBy: 2016 },
    stages: [
      { start: 2005, end: 2009, title: '先稳住一年的生活', prompt: '尝试不同经营方式，别让资金与民生同时下滑。', cash: 400, mountain: 60, livelihood: 55 },
      { start: 2010, end: 2015, title: '给替代产业留时间', prompt: '竹产业和生态旅游都需要前期投入，关注后续收入变化。', cash: 700, mountain: 64, livelihood: 62 },
      { start: 2016, end: 2020, title: '把修复欠账摆上台面', prompt: '关矿只是起点，山体与修复欠账要一起照看。', cash: 1200, mountain: 70, livelihood: 67 },
      { start: 2021, end: 2025, title: '留下能继续的账本', prompt: '最后五年同时看生态、累计结余、民生和修复欠账。', cash: 2200, mountain: 76, livelihood: 72 },
    ],
  },
  {
    id: 'deepmine',
    name: '老矿镇修复压力',
    subtitle: '山已受损、储量较多，转型成本与就业压力更高',
    difficulty: '挑战',
    initial: { cash: 180, mountain: 54, reserve: 132, livelihood: 46 },
    extraction: 7,
    orePrice: 39,
    costScale: 1.12,
    mineCost: 62,
    mineDamage: 5,
    closureCost: 145,
    repairFactor: 2.65,
    targets: { cash: 1100, mountain: 68, livelihood: 66, maxDebt: 150, closeBy: 2014 },
    stages: [
      { start: 2005, end: 2009, title: '先处理最紧的欠账', prompt: '起始山体与民生偏低，现金投入要留出修复余地。', cash: 220, mountain: 48, livelihood: 45 },
      { start: 2010, end: 2015, title: '给转岗一个支点', prompt: '订单能缓解现金压力，也会压缩后面的修复窗口。', cash: 520, mountain: 53, livelihood: 54 },
      { start: 2016, end: 2020, title: '别让绿色只停在表面', prompt: '持续修复比一次性绿化更重要，注意事件留下的长期影响。', cash: 950, mountain: 61, livelihood: 60 },
      { start: 2021, end: 2025, title: '把高压账本收尾', prompt: '不必追求单项满分，先理解每项缺口从哪里来。', cash: 1100, mountain: 68, livelihood: 66 },
    ],
  },
  {
    id: 'bamboo',
    name: '竹乡早产转型',
    subtitle: '初始资金较宽、储量偏少，更早建立非矿收入',
    difficulty: '探索',
    initial: { cash: 520, mountain: 74, reserve: 68, livelihood: 62 },
    extraction: 5,
    orePrice: 40,
    costScale: 0.94,
    mineCost: 48,
    mineDamage: 3,
    closureCost: 80,
    repairFactor: 2,
    targets: { cash: 1900, mountain: 84, livelihood: 80, maxDebt: 60, closeBy: 2012 },
    stages: [
      { start: 2005, end: 2009, title: '用缓冲换转型时间', prompt: '初始资金不是额外奖励，它要覆盖产业培育和转岗。', cash: 560, mountain: 67, livelihood: 63 },
      { start: 2010, end: 2015, title: '让非矿收入接上来', prompt: '储量有限，竹产业合作与生态收入更值得培育。', cash: 950, mountain: 74, livelihood: 70 },
      { start: 2016, end: 2020, title: '把山水变成长期收入', prompt: '观察山体健康如何影响生态旅游，而不是只看当年进账。', cash: 1650, mountain: 80, livelihood: 75 },
      { start: 2021, end: 2025, title: '守住较高的目标', prompt: '高目标需要持续投入，也需要给每年成本留下空间。', cash: 1900, mountain: 84, livelihood: 80 },
    ],
  },
]);

export const OPERATIONS = deepFreeze({
  mine: {
    name: '审慎开矿',
    short: '开矿',
    description: '用当年储量换现金，承担开采成本、山体损耗与储量下降。',
    baseCost: 54,
  },
  bamboo: {
    name: '培育竹产业',
    short: '竹产业',
    description: '收入随年份、山体和事件中的产业培育变化，前期投入较高。',
    baseCost: 70,
  },
  eco: {
    name: '经营生态旅游',
    short: '生态游',
    description: '山体越好，收入基础越高；经营成本与修复责任同时存在。',
    baseCost: 88,
  },
  restore: {
    name: '封山修复',
    short: '修复',
    description: '少量补助不覆盖全部修复成本，但可加速还绿并偿还修复欠账。',
    baseCost: 72,
  },
  close: {
    name: '永久关矿',
    short: '关矿',
    description: '支付安置与首期治理费用，当年收入断崖，留下修复欠账，之后不能再开矿。',
    baseCost: 95,
  },
});

export const EVENTS = deepFreeze([
  {
    id: 'orders-2007',
    year: 2007,
    title: '一张加急石料订单',
    context: '外地项目希望加价采购，交货要求会挤占修复和管护时间。',
    options: [
      {
        id: 'accept',
        name: '接单并增加班次',
        description: '立即增加现金和就业，但多消耗 8 单位储量、损伤山体。',
        effects: { cash: 140, reserve: -8, mountain: -5, livelihood: 4, mineMultiplier: 1.12 },
        result: '订单补上了现金，后续开矿收入系数提高 12%；超采与班次增加也留下山体损耗。',
      },
      {
        id: 'cap',
        name: '限量接单，保留管护工时',
        description: '只取少量订单收入，后续开采规模下降，每年多留一点修复时间。',
        effects: { cash: 35, mountain: 2, livelihood: -1, mineMultiplier: 0.9, annualMountain: 1 },
        result: '订单收入较少，后续开矿收入系数降低 10%；保留下来的管护工时让以后每年山体额外恢复 1 点。',
      },
    ],
  },
  {
    id: 'jobs-2009',
    year: 2009,
    title: '一份转岗名单',
    context: '矿上岗位可能减少，村民关心下一份收入从哪里来。',
    options: [
      {
        id: 'train',
        name: '办竹编与导览培训',
        description: '投入培训费，提升民生，并让后续竹产业收入提高。',
        effects: { cash: -90, livelihood: 9, bambooMultiplier: 1.18, annualLivelihood: 1 },
        result: '培训增加了当期支出；技能留下来，后续竹产业收入系数提高 18%，每年民生额外增加 1 点。',
      },
      {
        id: 'subsidy',
        name: '先发给一次性过渡补贴',
        description: '支出较低，马上缓解生活压力，但不改变后续产业收入。',
        effects: { cash: -40, livelihood: 4 },
        result: '补贴用较小支出缓和了当期压力；没有新增技能投入，后续经营收入系数不变。',
      },
    ],
  },
  {
    id: 'storm-2012',
    year: 2012,
    title: '暴雨冲开旧矿沟',
    context: '裸露矿沟出现冲刷，处置方式会影响后续山体恢复。',
    options: [
      {
        id: 'reinforce',
        name: '修挡土墙并恢复水系',
        description: '支出较高，修复山体并减少欠账，后续恢复更稳定。',
        effects: { cash: -120, mountain: 4, debt: -45, annualMountain: 1 },
        result: '工程费换来了山体恢复与欠账下降，后续每年山体额外恢复 1 点。',
      },
      {
        id: 'fence',
        name: '先围挡危险区域',
        description: '暂时少花钱，但冲刷风险与修复欠账继续累积。',
        effects: { cash: -30, mountain: -5, livelihood: -2, debt: 55, annualMountain: -1 },
        result: '围挡降低了当期支出；未治理的冲沟使山体和民生下降，后续每年山体额外损失 1 点。',
      },
    ],
  },
  {
    id: 'bamboo-2015',
    year: 2015,
    title: '竹材收购价下跌',
    context: '分散农户议价困难，竹产业要不要换一种组织方式。',
    options: [
      {
        id: 'coop',
        name: '成立合作社，共担加工成本',
        description: '先投入 95 万元，提升民生和以后各年的竹产业收入。',
        effects: { cash: -95, livelihood: 8, bambooMultiplier: 1.35 },
        result: '合作社增加了当期投入，后续竹产业收入系数提高 35%，这是跨年份的长期影响。',
      },
      {
        id: 'wholesale',
        name: '签低价包销合同',
        description: '立即获得 70 万元周转金，但锁定较低的后续竹产业收入。',
        effects: { cash: 70, livelihood: -2, bambooMultiplier: 0.85 },
        result: '包销合同缓解了现金压力，民生略降；后续竹产业收入系数降低 15%。',
      },
    ],
  },
  {
    id: 'visitors-2018',
    year: 2018,
    title: '游客突然多起来',
    context: '客流带来收入，也让步道、水源和垃圾清运承压。',
    options: [
      {
        id: 'reserve',
        name: '预约限流，先修步道与清运',
        description: '承担管理成本，保护山体，提升后续生态旅游质量。',
        effects: { cash: -55, mountain: 4, livelihood: 3, ecoMultiplier: 1.28 },
        result: '管理投入压住了当期现金，后续生态旅游收入系数提高 28%，山体也得到休养。',
      },
      {
        id: 'expand',
        name: '扩建接待区，尽量接住客流',
        description: '立即增加收入和就业，但破坏山体，后续管护压力上升。',
        effects: { cash: 160, mountain: -6, livelihood: 7, ecoMultiplier: 1.12, annualMountain: -1 },
        result: '接待收入与就业增加，后续生态旅游收入系数提高 12%；扩建扰动使以后每年山体额外损失 1 点。',
      },
    ],
  },
  {
    id: 'water-2021',
    year: 2021,
    title: '饮水监测出现异常',
    context: '检测范围要多大、结果怎么处理，会影响信任和后续经营。',
    options: [
      {
        id: 'fulltest',
        name: '扩大检测并公开结果',
        description: '投入检测与处置费用，修复信任和生态，偿还部分欠账。',
        effects: { cash: -90, mountain: 3, livelihood: 6, debt: -60, annualLivelihood: 1 },
        result: '公开检测增加了当期成本，换来生态、民生和欠账改善；后续每年民生额外增加 1 点。',
      },
      {
        id: 'localonly',
        name: '只处理矿区附近点位',
        description: '减少当期支出，但信任受损，生态旅游与修复欠账承压。',
        effects: { cash: -25, mountain: -4, livelihood: -5, debt: 45, ecoMultiplier: 0.85 },
        result: '局部处理省下了当期费用；信任与生态下降使后续生态旅游收入系数降低 15%，欠账增加。',
      },
    ],
  },
  {
    id: 'acceptance-2023',
    year: 2023,
    title: '修复验收前的最后选择',
    context: '验收不只是看远处绿不绿，也要看植被能否稳定生长。',
    options: [
      {
        id: 'native',
        name: '补植乡土树，继续养土',
        description: '较高投入换来持续恢复，并核销一部分修复欠账。',
        effects: { cash: -110, mountain: 7, livelihood: 3, debt: -90, annualMountain: 1 },
        result: '乡土植被与养土增加了当期成本，后续每年山体额外恢复 1 点，修复欠账也得到核销。',
      },
      {
        id: 'grass',
        name: '铺草皮，先让地表变绿',
        description: '当期支出少、地表见效快，但稳定修复欠账仍在。',
        effects: { cash: -35, mountain: 2, debt: 20, annualMountain: -1 },
        result: '草皮让当期山体读数上升，却没有结清根系与土壤治理；后续每年山体额外损失 1 点。',
      },
    ],
  },
]);

function getScenarioConfig(scenarioId) {
  const scenario = SCENARIOS.find((item) => item.id === scenarioId);
  if (!scenario) throw new RangeError(`未知场景：${scenarioId}`);
  return scenario;
}

function copyState(state) {
  return JSON.parse(JSON.stringify(state));
}

function assertCampaign(state) {
  if (!state || state.version !== 1 || !SCENARIOS.some((item) => item.id === state.scenarioId)) {
    throw new TypeError('无效的治理模式状态');
  }
}

function eventForYear(year) {
  return EVENTS.find((event) => event.year === year) || null;
}

function stageForYear(scenario, year) {
  return scenario.stages.find((stage) => year >= stage.start && year <= stage.end) || scenario.stages.at(-1);
}

function signed(value) {
  return `${value > 0 ? '+' : ''}${value}`;
}

/** 新建一个可序列化状态。2005 至 2025 每年各有一次经营决策。 */
export function createCampaign(scenarioId = SCENARIOS[0].id) {
  const scenario = getScenarioConfig(scenarioId);
  return {
    version: 1,
    scenarioId: scenario.id,
    year: START_YEAR,
    phase: 'decision',
    cash: scenario.initial.cash,
    mountain: scenario.initial.mountain,
    reserve: scenario.initial.reserve,
    livelihood: scenario.initial.livelihood,
    closedYear: null,
    restorationDebt: 0,
    modifiers: {
      mine: 1,
      bamboo: 1,
      eco: 1,
      annualMountain: 0,
      annualLivelihood: 0,
    },
    history: [],
    lastYear: null,
    pendingEvent: null,
    eventChoices: {},
  };
}

export function getScenario(scenarioId) {
  return getScenarioConfig(scenarioId);
}

export function getCurrentStage(state) {
  assertCampaign(state);
  return stageForYear(getScenarioConfig(state.scenarioId), state.year);
}

export function getPendingEvent(state) {
  assertCampaign(state);
  return state.pendingEvent ? EVENTS.find((event) => event.id === state.pendingEvent) || null : null;
}

function calculateYear(state, modeId) {
  const scenario = getScenarioConfig(state.scenarioId);
  const operation = OPERATIONS[modeId];
  if (!operation) throw new RangeError(`未知经营方式：${modeId}`);
  if (state.closedYear !== null && modeId === 'mine') {
    throw new Error(`矿已于 ${state.closedYear} 年永久关闭，不能重新开采`);
  }
  if (modeId === 'close' && (state.closedYear !== null || state.year < 2009)) {
    throw new Error(state.closedYear !== null ? '关矿决策不可逆' : '2009 年起才能提出永久关矿');
  }

  const before = {
    cash: state.cash,
    mountain: state.mountain,
    reserve: state.reserve,
    livelihood: state.livelihood,
    debt: state.restorationDebt,
  };
  const index = state.year - START_YEAR;
  let income = 0;
  let operatingCost = round(operation.baseCost * scenario.costScale);
  let debtPayment = 0;
  let debtAdded = 0;
  let mountainDelta = state.modifiers.annualMountain;
  let livelihoodDelta = state.modifiers.annualLivelihood;
  let reserveDelta = 0;
  let note = '';

  if (modeId === 'mine') {
    operatingCost = round(scenario.mineCost * scenario.costScale);
    const extracted = Math.min(state.reserve, scenario.extraction);
    reserveDelta = -extracted;
    if (extracted <= 0) {
      income = 0;
      livelihoodDelta -= 2;
      note = '储量已经归零，开矿收入为 0，仍要承担组织与安全成本。';
    } else {
      income = round(extracted * scenario.orePrice * state.modifiers.mine);
      mountainDelta -= scenario.mineDamage;
      livelihoodDelta += 4;
      if (state.reserve - extracted <= 0) {
        note = '这一年储量见底；下一年再选开矿，收入会变为 0。';
      }
    }
  } else if (modeId === 'bamboo') {
    income = round((26 + index * 4.2) * (state.mountain / 85) * state.modifiers.bamboo);
    mountainDelta += 2;
    livelihoodDelta += 3;
  } else if (modeId === 'eco') {
    income = state.mountain < 45
      ? 0
      : round((Math.max(0, state.mountain - 35) * 2 + index * 3.2) * state.modifiers.eco);
    mountainDelta += 2;
    livelihoodDelta += 4;
    if (state.mountain < 45) note = '山体低于 45 点，生态旅游当年收入为 0，需要先恢复环境承载力。';
  } else if (modeId === 'restore') {
    income = round(10 + state.mountain * 0.08);
    mountainDelta += 5;
    livelihoodDelta += 1;
  } else if (modeId === 'close') {
    const damage = 100 - state.mountain;
    debtAdded = round(70 + damage * scenario.repairFactor);
    debtPayment = Math.min(before.debt + debtAdded, round(debtAdded * 0.16));
    operatingCost = scenario.closureCost;
    income = 0;
    mountainDelta += 2;
    livelihoodDelta -= 14;
    note = `矿在门口关上了：当年矿业收入降为 0，安置与首期治理支出 ${operatingCost + debtPayment} 万元，仍有修复欠账需要以后偿还。`;
  }

  if (modeId !== 'close' && before.debt > 0) {
    const rate = modeId === 'restore' ? 55 : modeId === 'bamboo' || modeId === 'eco' ? 25 : 8;
    debtPayment = Math.min(before.debt, rate);
  }

  const cost = operatingCost + debtPayment;
  const after = {
    cash: before.cash + income - cost,
    mountain: round(clamp(before.mountain + mountainDelta)),
    reserve: round(clamp(before.reserve + reserveDelta, 0, scenario.initial.reserve + 30)),
    livelihood: round(clamp(before.livelihood + livelihoodDelta)),
    debt: Math.max(0, before.debt + debtAdded - debtPayment),
  };

  return {
    year: state.year,
    operation: modeId,
    operationName: operation.name,
    income,
    operatingCost,
    debtPayment,
    debtAdded,
    cost,
    net: income - cost,
    cashBefore: before.cash,
    cashAfter: after.cash,
    mountainBefore: before.mountain,
    mountainAfter: after.mountain,
    reserveBefore: before.reserve,
    reserveAfter: after.reserve,
    livelihoodBefore: before.livelihood,
    livelihoodAfter: after.livelihood,
    debtBefore: before.debt,
    debtAfter: after.debt,
    note,
    event: null,
    stageResult: null,
  };
}

function annualFeedback(record) {
  if (record.operation === 'close') return record.note;
  const cashText = record.net >= 0
    ? `当年净结余 ${record.net} 万元，已累入总资金。`
    : `当年净支出 ${Math.abs(record.net)} 万元，累计资金相应减少。`;
  const ecoText = record.mountainAfter >= record.mountainBefore
    ? `山体变化 ${signed(record.mountainAfter - record.mountainBefore)} 点。`
    : `山体变化 ${record.mountainAfter - record.mountainBefore} 点，后续修复压力上升。`;
  const livelihoodText = `民生变化 ${signed(record.livelihoodAfter - record.livelihoodBefore)} 点。`;
  return `${cashText}${ecoText}${livelihoodText}${record.note ? ` ${record.note}` : ''}`;
}

function applyStageResult(state) {
  const scenario = getScenarioConfig(state.scenarioId);
  const stage = stageForYear(scenario, state.year);
  if (!stage || stage.end !== state.year) return;
  const gaps = [];
  if (state.cash < stage.cash) gaps.push(`累计资金差 ${stage.cash - state.cash} 万元`);
  if (state.mountain < stage.mountain) gaps.push(`山体差 ${stage.mountain - state.mountain} 点`);
  if (state.livelihood < stage.livelihood) gaps.push(`民生差 ${stage.livelihood - state.livelihood} 点`);
  const passed = gaps.length === 0;
  state.lastYear.stageResult = {
    title: stage.title,
    passed,
    text: passed
      ? `阶段目标已达成：累计资金 ${state.cash} 万元、山体 ${state.mountain} 点、民生 ${state.livelihood} 点。下一阶段仍可调整路线。`
      : `阶段目标暂未达成：${gaps.join('，')}。这不是终局，后续年份仍可通过增收、修复和转岗补上缺口。`,
  };
}

function applyAnnualRecord(state, record) {
  state.cash = record.cashAfter;
  state.mountain = record.mountainAfter;
  state.reserve = record.reserveAfter;
  state.livelihood = record.livelihoodAfter;
  state.restorationDebt = record.debtAfter;
  if (record.operation === 'close') state.closedYear = state.year;
  state.lastYear = record;
  state.history.push(record);
}

/**
 * 结算当前年份的经营选择。year 由状态机保管，外部不能指定年份跳关。
 * 有事件时进入 event 阶段；否则进入 yearResult，必须阅读反馈后再推进。
 */
export function applyYear(state, modeId) {
  assertCampaign(state);
  if (state.phase !== 'decision') throw new Error('当前年份已经结算，不能重复经营或跳年');
  const next = copyState(state);
  const record = calculateYear(next, modeId);
  applyAnnualRecord(next, record);
  record.feedback = annualFeedback(record);
  const event = eventForYear(next.year);
  next.pendingEvent = event?.id || null;
  next.phase = event ? 'event' : 'yearResult';
  applyStageResult(next);
  return next;
}

function eventEffectText(effects) {
  const parts = [];
  if (effects.cash) parts.push(`资金 ${signed(effects.cash)} 万元`);
  if (effects.mountain) parts.push(`山体 ${signed(effects.mountain)} 点`);
  if (effects.reserve) parts.push(`储量 ${signed(effects.reserve)} 单位`);
  if (effects.livelihood) parts.push(`民生 ${signed(effects.livelihood)} 点`);
  if (effects.debt) parts.push(`修复欠账 ${signed(effects.debt)} 万元`);
  return parts.length ? parts.join('，') : '当期读数不变';
}

/** 应对当前年事件。选项会写入后续收入系数或年度恢复量，并在结果里解释原因。 */
export function applyEvent(state, choiceId) {
  assertCampaign(state);
  if (state.phase !== 'event' || !state.pendingEvent) throw new Error('当前没有待处理事件');
  const event = EVENTS.find((item) => item.id === state.pendingEvent);
  const choice = event?.options.find((item) => item.id === choiceId);
  if (!choice) throw new RangeError('事件选项不属于当前事件');
  const next = copyState(state);
  const e = choice.effects;
  const before = {
    cash: next.cash,
    mountain: next.mountain,
    reserve: next.reserve,
    livelihood: next.livelihood,
    debt: next.restorationDebt,
  };
  next.cash = round(next.cash + (e.cash || 0));
  next.mountain = round(clamp(next.mountain + (e.mountain || 0)));
  next.reserve = Math.max(0, round(next.reserve + (e.reserve || 0)));
  next.livelihood = round(clamp(next.livelihood + (e.livelihood || 0)));
  next.restorationDebt = Math.max(0, round(next.restorationDebt + (e.debt || 0)));
  if (e.mineMultiplier) next.modifiers.mine = round(next.modifiers.mine * e.mineMultiplier * 10000) / 10000;
  if (e.bambooMultiplier) next.modifiers.bamboo = round(next.modifiers.bamboo * e.bambooMultiplier * 10000) / 10000;
  if (e.ecoMultiplier) next.modifiers.eco = round(next.modifiers.eco * e.ecoMultiplier * 10000) / 10000;
  next.modifiers.annualMountain += e.annualMountain || 0;
  next.modifiers.annualLivelihood += e.annualLivelihood || 0;

  const result = {
    eventId: event.id,
    title: event.title,
    choiceId,
    choiceName: choice.name,
    deltaText: eventEffectText(e),
    explanation: `${choice.result} 本次直接变化：${eventEffectText(e)}。`,
  };
  next.eventChoices[event.year] = choiceId;
  next.lastYear.event = result;
  next.lastYear.cashAfter = next.cash;
  next.lastYear.net += e.cash || 0;
  next.lastYear.mountainAfter = next.mountain;
  next.lastYear.reserveAfter = next.reserve;
  next.lastYear.livelihoodAfter = next.livelihood;
  next.lastYear.debtAfter = next.restorationDebt;
  next.lastYear.eventBefore = before;
  next.history[next.history.length - 1] = next.lastYear;
  next.pendingEvent = null;
  next.phase = 'yearResult';
  applyStageResult(next);
  return next;
}

/** 推进到下一次决策。2025 年结算并处理完事件后进入 complete。 */
export function advanceYear(state) {
  assertCampaign(state);
  if (state.phase !== 'yearResult') throw new Error('先完成本年经营与事件，再进入下一年');
  const next = copyState(state);
  if (next.year >= END_YEAR) {
    next.phase = 'complete';
    return next;
  }
  next.year += 1;
  next.phase = 'decision';
  return next;
}

/** UI 使用的年度预览，不改变状态，也不能绕过 applyYear 的校验。 */
export function getYearOptions(state) {
  assertCampaign(state);
  return Object.keys(OPERATIONS).map((id) => {
    let disabledReason = '';
    if (id === 'close' && state.closedYear !== null) disabledReason = `已于 ${state.closedYear} 年关矿`;
    else if (id === 'close' && state.year < 2009) disabledReason = '2009 年起可选';
    else if (id === 'mine' && state.closedYear !== null) disabledReason = '永久关矿后不可重开';
    if (disabledReason) {
      return { id, ...OPERATIONS[id], disabled: true, disabledReason };
    }
    const preview = calculateYear(state, id);
    return {
      id,
      ...OPERATIONS[id],
      disabled: false,
      disabledReason: '',
      income: preview.income,
      cost: preview.cost,
      debtPayment: preview.debtPayment,
      net: preview.net,
      mountainDelta: preview.mountainAfter - preview.mountainBefore,
      livelihoodDelta: preview.livelihoodAfter - preview.livelihoodBefore,
      reserveDelta: preview.reserveAfter - preview.reserveBefore,
      note: preview.note,
    };
  });
}

function scoreLabel(score) {
  if (score >= 85) return '稳固';
  if (score >= 65) return '有进展';
  return '待补课';
}

/** 多维结算，不把生态、资金、民生与关矿时点压成唯一总分。 */
export function getCampaignSummary(state) {
  assertCampaign(state);
  const scenario = getScenarioConfig(state.scenarioId);
  const t = scenario.targets;
  const transitionScore = state.closedYear === null
    ? 20
    : round(clamp(100 - Math.max(0, state.closedYear - t.closeBy) * 6, 25, 100));
  const repairScore = round(clamp(100 - (state.restorationDebt / t.maxDebt) * 70));
  const dimensions = [
    {
      id: 'ecology',
      label: '生态恢复',
      score: state.mountain,
      value: `${state.mountain} 点`,
      target: `目标 ${t.mountain} 点`,
      status: scoreLabel(state.mountain),
      detail: state.mountain >= t.mountain ? '山体达到本场景示意目标。' : '山体仍有缺口，可增加封山修复并留意长期负面事件。',
    },
    {
      id: 'cash',
      label: '累计资金',
      score: round(clamp((state.cash / t.cash) * 100)),
      value: `${state.cash} 万元`,
      target: `目标 ${t.cash} 万元`,
      status: scoreLabel(round(clamp((state.cash / t.cash) * 100))),
      detail: state.cash >= t.cash ? '逐年收入减成本后的累计结余达到目标。' : '累计结余仍不足，下局可比较不同产业收入与每年成本。',
    },
    {
      id: 'livelihood',
      label: '民生与就业',
      score: state.livelihood,
      value: `${state.livelihood} 点`,
      target: `目标 ${t.livelihood} 点`,
      status: scoreLabel(state.livelihood),
      detail: state.livelihood >= t.livelihood ? '转岗和经营选择保住了民生长线。' : '民生仍有缺口，培训、合作社和公开处置事件能提供长期支持。',
    },
    {
      id: 'transition',
      label: '关矿时点',
      score: transitionScore,
      value: state.closedYear === null ? '始终未关矿' : `${state.closedYear} 年`,
      target: `建议在 ${t.closeBy} 年前完成转型`,
      status: scoreLabel(transitionScore),
      detail: state.closedYear === null
        ? '矿业收入保留了现金路线，但没有主动结束开采，储量与生态压力仍在。'
        : state.closedYear <= t.closeBy
          ? '较早关矿留下了更长的修复和产业培育窗口。'
          : '较晚关矿保留了部分矿业现金流，也压缩了修复窗口。',
    },
    {
      id: 'repair',
      label: '修复履约',
      score: repairScore,
      value: `欠账 ${state.restorationDebt} 万元`,
      target: `目标不超过 ${t.maxDebt} 万元`,
      status: scoreLabel(repairScore),
      detail: state.restorationDebt <= t.maxDebt ? '修复责任控制在场景目标内。' : '关矿没有消除修复责任，欠账仍需后续经营与修复共同消化。',
    },
  ];
  const goals = [
    { id: 'cash', label: '累计资金', passed: state.cash >= t.cash, actual: state.cash, target: t.cash, unit: '万元' },
    { id: 'ecology', label: '山体健康', passed: state.mountain >= t.mountain, actual: state.mountain, target: t.mountain, unit: '点' },
    { id: 'livelihood', label: '民生就业', passed: state.livelihood >= t.livelihood, actual: state.livelihood, target: t.livelihood, unit: '点' },
    { id: 'repair', label: '修复欠账', passed: state.restorationDebt <= t.maxDebt, actual: state.restorationDebt, target: t.maxDebt, unit: '万元以内' },
    { id: 'transition', label: '转型时点', passed: state.closedYear !== null && state.closedYear <= t.closeBy, actual: state.closedYear ?? '未关矿', target: t.closeBy, unit: '年前' },
  ];
  const reflections = goals.filter((goal) => !goal.passed).map((goal) => {
    if (goal.id === 'cash') return `资金目标未达成：累计结余 ${state.cash} 万元，距离示意目标还差 ${t.cash - state.cash} 万元。可重新比较矿业现金流、替代产业和年度成本。`;
    if (goal.id === 'ecology') return `生态目标未达成：山体 ${state.mountain} 点，还差 ${t.mountain - state.mountain} 点。长期管护和封山修复比一次性变绿更稳定。`;
    if (goal.id === 'livelihood') return `民生目标未达成：当前 ${state.livelihood} 点，还差 ${t.livelihood - state.livelihood} 点。可试试培训、合作社和更充分的信息公开。`;
    if (goal.id === 'repair') return `修复目标未达成：还剩 ${state.restorationDebt} 万元欠账，比目标多 ${state.restorationDebt - t.maxDebt} 万元。早关矿与持续修复能减轻这部分压力。`;
    return state.closedYear === null
      ? '转型时点目标未达成：这局始终未关矿。下局可比较保留矿业收入与提前结束开采的差别。'
      : `转型时点目标未达成：${state.closedYear} 年关矿，晚于本场景 ${t.closeBy} 年目标。矿业现金流更久，修复时间也更短。`;
  });
  const met = goals.filter((goal) => goal.passed).length;
  return {
    version: 1,
    scenarioId: state.scenarioId,
    scenarioName: scenario.name,
    parameterNote: MODEL_NOTE,
    complete: state.phase === 'complete',
    finalYear: state.year,
    closedYear: state.closedYear,
    final: {
      cash: state.cash,
      mountain: state.mountain,
      reserve: state.reserve,
      livelihood: state.livelihood,
      debt: state.restorationDebt,
    },
    dimensions,
    goals,
    metGoals: met,
    outcome: met === goals.length ? '山水、资金与生活都站稳了' : met >= 3 ? '转型已经起步，仍有几笔账要接着算' : '这局留下了清楚的缺口，也留下了下一条路线',
    reflections: reflections.length ? reflections : ['五项目标都达到本场景示意值。可换另一条路线，看看相同目标是否只有一种答案。'],
  };
}
