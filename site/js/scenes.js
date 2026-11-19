/**
 * scenes.js — 各点位的水墨场景 v3
 *
 * 构图按南宋山水的办法来：
 *
 *   1. 一角实、其余虚。全幅重心压在左边，右边交给纸和字。
 *      app.js 会在 w*0.4 之后盖一层纸色渐隐，所以右侧的墨本来就该淡，
 *      构图不能把主景放到那里去。
 *   2. 主峰与次峰有高差。峰的位置和高度写进 peaks，不靠随机起伏。
 *   3. 一景只有一个重心。其余元素只做陪衬，压住画面下缘，不留死白。
 *   4. 树的疏密由落点决定。哪里成丛、哪里空着，是构图的一部分。
 *
 * 每个场景都在「虚拟画布」里绘制（纵向固定 700 单位），
 * 横向按实际宽高比推算，屏幕多大都保持同样的比例关系。
 */

import { inkStroke, rockCluster, pit, mulberry32, hexA, mistBand, house, seal } from './brush.js';
import {
  mass,
  ridge,
  mountain,
  composeRidge,
  fadeAt,
  treeShape,
  treeGroup,
  mist,
  haze,
  water,
  hut,
  cloudBand,
  boat,
  reeds,
  stone,
  bridge,
  bird,
  groundWash,
  skyWash,
} from './inkfig.js';

/* ────────────────────────── 虚拟画布 ────────────────────────── */

const UNIT_H = 700;

function inVirtual(ctx, w, h, fn, seed, gainMul = 1) {
  const s = h / UNIT_H;
  const vw = w / s;
  const vh = UNIT_H;
  ctx.save();
  ctx.scale(s, s);
  ctx.__inkGain = Math.max(1, Math.min(2.4, s * 1.5)) * gainMul;
  fn(ctx, vw, vh, seed);
  ctx.__inkGain = 1;
  ctx.restore();
}

/* ────────────────────────── 通用零件 ────────────────────────── */

/** 一道山脊线：分段上色，靠 fade 化进纸里。fadeT 是每个点的全局 t（可选） */
function ridgeLine(ctx, pts, o = {}) {
  if (!pts || pts.length < 2) return;
  const {
    color = '#5a625b',
    alpha = 0.2,
    width = 1.1,
    seed = 1,
    dry = 0,
    layers = 1,
    fade = null,
    fadeT = null,
    wobble = 1.1,
  } = o;
  const segs = Math.max(6, Math.min(20, Math.round(pts.length / 8)));
  for (let k = 0; k < segs; k++) {
    const i0 = Math.floor(((pts.length - 1) * k) / segs);
    const i1 = Math.min(pts.length - 1, Math.ceil(((pts.length - 1) * (k + 1)) / segs) + 1);
    // 浓淡要按整幅的 t 算：远山只占画幅一段，不能拿段内比例去查表
    const mid = Math.round((i0 + i1) / 2);
    const g = fadeT ? fadeT[Math.min(mid, fadeT.length - 1)] : (k + 0.5) / segs;
    const a = alpha * fadeAt(g, fade);
    if (a < 0.012) continue;
    inkStroke(ctx, pts.slice(i0, i1 + 1), {
      color,
      width,
      alpha: a,
      seed: seed + k * 13,
      wobble,
      jitter: 0.25,
      dry,
      layers,
      taper: false,
      step: 4,
    });
  }
}

/** 远山：只有一道淡线，不填色，不加皴；只画山在的那一段 */
function farRange(ctx, w, h, o = {}) {
  const {
    baseY = 0.2,
    amp = 0.05,
    peaks,
    alpha = 0.2,
    seed = 1,
    fade = [[0, 1], [0.7, 0.85], [1, 0.2]],
  } = o;
  let t0 = 1;
  let t1 = 0;
  for (const pk of peaks) {
    t0 = Math.min(t0, pk.cx - pk.half);
    t1 = Math.max(t1, pk.cx + pk.half);
  }
  const lo = Math.max(0, t0);
  const hi = Math.min(1, t1);
  const band = composeRidge(peaks, 300).filter(([t]) => t >= lo - 1e-4 && t <= hi + 1e-4);
  const pts = [];
  const fadeT = [];
  for (const [t, hh] of band) {
    pts.push([w * t, h * baseY - hh * h * amp]);
    fadeT.push(t);
  }
  ridgeLine(ctx, pts, { color: '#6c736a', alpha, width: 1.05, seed, fade, fadeT, dry: 0 });
}

/** 一块地面／水面的淡染：顶边不齐，底下坐实 */
function washArea(ctx, pts, o = {}) {
  const { color = '#8d948a', a0 = 0.05, a1 = 0.18, yTop, yBot } = o;
  if (pts.length < 3) return;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
  const g = ctx.createLinearGradient(0, yTop, 0, yBot);
  g.addColorStop(0, hexA(color, a0));
  g.addColorStop(0.6, hexA(color, (a0 + a1) * 0.55));
  g.addColorStop(1, hexA(color, a1));
  ctx.fillStyle = g;
  ctx.fill();
  ctx.restore();
}

/** 一条不齐的横线：返回从 x0 到 x1 的点列 */
function softEdge(x0, x1, y, amp, seed, seg = 26) {
  const rnd = mulberry32(seed);
  const pts = [];
  const ph = rnd() * 6.28;
  const ph2 = rnd() * 6.28;
  for (let i = 0; i <= seg; i++) {
    const u = i / seg;
    pts.push([
      x0 + (x1 - x0) * u,
      y + Math.sin(u * 3.1 + ph) * amp + Math.sin(u * 7.7 + ph2) * amp * 0.35,
    ]);
  }
  return pts;
}

/**
 * 梯田：绕着山嘴下来的等高带。
 * 上疏下密（幂次），越近越宽越深，越远越贴越淡。
 */
function terraceFan(ctx, o = {}) {
  const {
    top,
    bottom,
    cx,
    spread,
    rows = 26,
    seed = 1,
    color = '#7c9160',
    alpha = 0.36,
    width = 1,
    tilt = 0.12,
    sink = 0.16,
    seg = 20,
  } = o;
  const rnd = mulberry32(seed);
  for (let r = 0; r < rows; r++) {
    const t = Math.pow(r / (rows - 1), 1.22);
    const y = top + (bottom - top) * t + (rnd() - 0.5) * (bottom - top) * 0.006;
    const half = spread * (0.16 + t * 0.94);
    const cxr = cx + tilt * (t - 0.4) * spread * 0.5;
    const sag = half * (sink + rnd() * 0.1);
    const ph = rnd() * 6.28;
    const pts = [];
    for (let i = 0; i <= seg; i++) {
      const u = i / seg;
      pts.push([
        cxr - half + half * 2 * u,
        y + Math.sin(u * Math.PI) * sag - Math.sin(u * Math.PI * 2 + ph) * sag * 0.2,
      ]);
    }
    inkStroke(ctx, pts, {
      color,
      width: width * (0.7 + t * 0.7),
      alpha: alpha * (0.28 + t * 0.85),
      seed: seed + r * 11,
      wobble: 0.55,
      jitter: 0.25,
      dry: 0.28,
      layers: 1,
      taper: false,
      step: 4,
    });

    // 近处几层田埂上的积水：短横笔，不排成条
    if (t > 0.5 && rnd() > 0.45) {
      const sx = cxr - half * (0.15 + rnd() * 0.55);
      const sw = half * (0.16 + rnd() * 0.3);
      inkStroke(
        ctx,
        [
          [sx, y + sag * 0.55],
          [sx + sw, y + sag * 0.5 + (rnd() - 0.5) * 1.6],
        ],
        {
          color: '#6d8f8a',
          width: 0.9,
          alpha: alpha * 0.28,
          seed: seed + 400 + r * 5,
          wobble: 0.4,
          dry: 0.3,
          layers: 1,
          taper: false,
        }
      );
    }
  }
}

/** 菜地垄：从近往远收，收敛点偏左，才有纵深 */
function cropRows(ctx, o = {}) {
  const {
    w,
    yFar,
    yNear,
    vanishX,
    x0,
    x1,
    rows = 9,
    seed = 1,
    color = '#5a625b',
    alpha = 0.24,
  } = o;
  const rnd = mulberry32(seed);
  for (let r = 0; r < rows; r++) {
    const t = r / (rows - 1);
    const y = yFar + (yNear - yFar) * Math.pow(t, 0.92);
    const grow = 0.3 + Math.pow(t, 0.72) * 0.78;
    const lx = vanishX + (x0 - vanishX) * grow;
    const rx = vanishX + (x1 - vanishX) * grow;
    const pts = [];
    for (let i = 0; i <= 12; i++) {
      const u = i / 12;
      pts.push([lx + (rx - lx) * u, y + Math.sin(u * 4 + r * 0.7) * (0.8 + t * 1.8)]);
    }
    inkStroke(ctx, pts, {
      color,
      width: 0.75 + t * 0.75,
      alpha: alpha * (0.35 + t * 0.9),
      seed: seed + r * 9,
      wobble: 0.45,
      jitter: 0.2,
      dry: 0.3,
      layers: 1,
      taper: false,
      step: 4,
    });
  }
}

/** 一溜屋子：沿一条线排，高低不齐，间距不等 */
function houseRow(ctx, o = {}) {
  const { list, seed = 1, alpha = 0.5, tone = '#3a3f38', toneAlpha = 0.09 } = o;
  list.forEach(([x, y, s, flip], i) => {
    hut(ctx, x, y, {
      size: s,
      seed: seed + i * 7,
      alpha: alpha * (0.84 + ((i * 37) % 10) / 34),
      flip: !!flip,
      tone,
      toneAlpha: toneAlpha * (0.8 + ((i * 53) % 10) / 22),
    });
  });
}

/** 前景压角的大树：位置固定在角上，冠盖伸进画面 */
function cornerTree(ctx, w, h, o = {}) {
  const {
    x = 0.04,
    y = 1.04,
    size = 168,
    seed = 1,
    color = '#222b1f',
    canopy = '#333f2c',
    alpha = 0.48,
    canopyAlpha = 0.19,
    lean = 0.06,
    shape = 'round',
  } = o;
  treeShape(ctx, w * x, h * y, {
    size,
    seed,
    color,
    canopy,
    alpha,
    canopyAlpha,
    trunkRatio: 0.58,
    lean,
    shape,
  });
}

/* ══════════════════════════════════════════════════════════
   一 · 钱江源：远山叠着，林带压住山脚，前景一潭
   ══════════════════════════════════════════════════════════ */

export function sceneQianjiangyuan(ctx, w, h, seed = 3001) {
  skyWash(ctx, w, h, { color: '#8d948a', alpha: 0.09, from: 0, to: 0.42 });

  /* 远：三层淡线，越远越薄，最外一层只用线不落墨 */
  farRange(ctx, w, h, {
    baseY: 0.15,
    amp: 0.045,
    alpha: 0.16,
    seed: seed + 11,
    peaks: [
      { cx: 0.06, half: 0.16, h: 1, tilt: 0.34, sharp: 1.6 },
      { cx: 0.24, half: 0.18, h: 0.72, tilt: -0.2, sharp: 1.5 },
      { cx: 0.44, half: 0.2, h: 0.44, tilt: 0.14, sharp: 1.35 },
    ],
    fade: [[0, 0.9], [0.7, 0.6], [1, 0]],
  });
  farRange(ctx, w, h, {
    baseY: 0.235,
    amp: 0.07,
    alpha: 0.26,
    seed: seed + 17,
    peaks: [
      { cx: 0.09, half: 0.17, h: 1, tilt: 0.3, sharp: 1.4 },
      { cx: 0.27, half: 0.15, h: 0.6, tilt: -0.22, sharp: 1.35 },
      { cx: 0.46, half: 0.18, h: 0.34, tilt: 0.12, sharp: 1.25 },
    ],
    fade: [[0, 1], [0.65, 0.55], [1, 0]],
  });

  /* 主山：主峰站在左边，次峰矮下去，右端整段化进纸 */
  mountain(ctx, w, h, {
    seed: seed + 21,
    baseY: h * 0.45,
    amp: h * 0.27,
    footY: h * 0.63,
    tone: '#4d5c3d',
    toneAlpha: 0.19,
    lineColor: '#2b2f2b',
    lineAlpha: 0.46,
    lineWidth: 2,
    texture: 3.4,
    peaks: [
      { cx: 0.1, half: 0.17, h: 1, tilt: 0.26, crest: 2.4, foot: 0.85 },
      { cx: 0.265, half: 0.13, h: 0.6, tilt: -0.24, crest: 2.1, foot: 0.9 },
      { cx: 0.385, half: 0.11, h: 0.36, tilt: 0.16, crest: 1.8, foot: 1.0 },
    ],
    fade: [[0, 1], [0.5, 0.88], [0.85, 0.32], [1, 0.05]],
    shade: [-0.02, 0.14, 0.1],
    footFade: 0.55,
    veins: 3,
    moss: 10,
  });

  /* 山脚雾，把山与林带分开 */
  mist(ctx, { x: -w * 0.05, y: h * 0.5, w: w * 0.6, h: h * 0.09, seed: seed + 31, strength: 0.85, blobs: 5 });

  /* 中景林：左密右疏，最右一丛只剩个影子 */
  treeGroup(ctx, {
    x: w * 0.05,
    y: h * 0.575,
    size: 58,
    count: 3,
    spread: 0.6,
    seed: seed + 101,
    color: '#2f3a29',
    alpha: 0.44,
    canopy: '#44523a',
    canopyAlpha: 0.15,
    shape: 'mixed',
  });
  treeGroup(ctx, {
    x: w * 0.16,
    y: h * 0.59,
    size: 74,
    count: 4,
    spread: 0.7,
    seed: seed + 117,
    color: '#2b3526',
    alpha: 0.5,
    canopy: '#3f4d36',
    canopyAlpha: 0.17,
    shape: 'mixed',
  });
  treeGroup(ctx, {
    x: w * 0.3,
    y: h * 0.605,
    size: 50,
    count: 2,
    spread: 0.6,
    seed: seed + 131,
    color: '#37432f',
    alpha: 0.32,
    canopy: '#4a5840',
    canopyAlpha: 0.1,
  });
  treeGroup(ctx, {
    x: w * 0.4,
    y: h * 0.62,
    size: 38,
    count: 2,
    spread: 0.5,
    seed: seed + 149,
    color: '#4a544a',
    alpha: 0.18,
    canopyAlpha: 0.07,
  });

  /* 源头细流，从雾里下到潭 */
  inkStroke(
    ctx,
    [
      [w * 0.2, h * 0.5],
      [w * 0.216, h * 0.56],
      [w * 0.205, h * 0.625],
      [w * 0.228, h * 0.69],
      [w * 0.222, h * 0.75],
    ],
    { color: '#6d8f8a', width: 1.5, alpha: 0.42, seed: seed + 41, dry: 0.24, layers: 2, taper: false }
  );

  /* 前景潭：左重右轻，水面铺在视线下方 */
  const poolTop = softEdge(-w * 0.02, w * 0.82, h * 0.755, h * 0.016, seed + 51, 30);
  washArea(
    ctx,
    poolTop.concat([
      [w * 0.82, h * 1.02],
      [-w * 0.02, h * 1.02],
    ]),
    { color: '#6d8f8a', a0: 0.03, a1: 0.17, yTop: h * 0.74, yBot: h }
  );
  water(ctx, w * 0.78, h * 0.79, h * 0.99, { seed: seed + 61, rows: 5, alpha: 0.26, x0: 0.04, x1: 0.72 });

  /* 岸边石，压住潭的上缘 */
  stone(ctx, w * 0.15, h * 0.772, { w: w * 0.075, h: h * 0.026, seed: seed + 71, alpha: 0.4, moss: 4 });
  stone(ctx, w * 0.225, h * 0.79, { w: w * 0.05, h: h * 0.017, seed: seed + 73, alpha: 0.3, moss: 2 });
  rockCluster(ctx, w * 0.36, h * 0.8, { w: w * 0.05, h: h * 0.018, seed: seed + 77, alpha: 0.2 });

  /* 前景两棵树：左边这一角就是全幅的重心 */
  cornerTree(ctx, w, h, { x: 0.035, y: 1.0, size: 176, seed: seed + 901 });
  cornerTree(ctx, w, h, {
    x: 0.135,
    y: 1.03,
    size: 116,
    seed: seed + 907,
    color: '#26301f',
    alpha: 0.36,
    canopyAlpha: 0.15,
    lean: -0.12,
  });

  /* 一只鸟，落在右上那片空里 */
  inkStroke(
    ctx,
    [
      [w * 0.5, h * 0.14],
      [w * 0.516, h * 0.122],
      [w * 0.534, h * 0.14],
    ],
    { color: '#2b2f2b', width: 1, alpha: 0.32, seed: seed + 81, layers: 1, dry: 0, taper: false }
  );
}

/* ══════════════════════════════════════════════════════════
   二 · 下姜村：溪从左上山间下来，两岸散着民居
   ══════════════════════════════════════════════════════════ */

export function sceneXiajiang(ctx, w, h, seed = 2001) {
  skyWash(ctx, w, h, { color: '#8d948a', alpha: 0.08, from: 0, to: 0.4 });

  farRange(ctx, w, h, {
    baseY: 0.17,
    amp: 0.05,
    alpha: 0.18,
    seed: seed + 11,
    peaks: [
      { cx: 0.08, half: 0.17, h: 1, tilt: 0.22, sharp: 1.5 },
      { cx: 0.26, half: 0.18, h: 0.64, tilt: -0.18, sharp: 1.4 },
      { cx: 0.45, half: 0.19, h: 0.38, tilt: 0.12, sharp: 1.25 },
    ],
    fade: [[0, 1], [0.7, 0.55], [1, 0]],
  });

  /* 左边的山：主峰高，山嘴伸下来包住村子 */
  mountain(ctx, w, h, {
    seed: seed + 21,
    baseY: h * 0.4,
    amp: h * 0.25,
    footY: h * 0.72,
    tone: '#4d5c3d',
    toneAlpha: 0.18,
    lineColor: '#2b2f2b',
    lineAlpha: 0.48,
    lineWidth: 2,
    texture: 3,
    peaks: [
      { cx: 0.07, half: 0.16, h: 1, tilt: 0.36, sharp: 1.28 },
      { cx: 0.215, half: 0.115, h: 0.55, tilt: -0.22, sharp: 1.18 },
    ],
    fade: [[0, 1], [0.45, 0.9], [0.8, 0.34], [1, 0.05]],
    shade: [-0.03, 0.1, 0.1],
    footFade: 0.6,
    veins: 2,
    moss: 8,
  });

  /* 右边一座矮山，只把地平线托住，落在纸色渐隐里 */
  mountain(ctx, w, h, {
    seed: seed + 29,
    baseY: h * 0.48,
    amp: h * 0.08,
    footY: h * 0.66,
    tone: '#5d6b4b',
    toneAlpha: 0.09,
    lineColor: '#3a3f38',
    lineAlpha: 0.2,
    lineWidth: 1.2,
    texture: 1.2,
    peaks: [{ cx: 0.6, half: 0.2, h: 1, tilt: -0.1, sharp: 1.2 }],
    fade: [[0, 0.2], [0.3, 0.9], [1, 0.1]],
    footFade: 0.5,
    veins: 1,
  });

  mist(ctx, { x: -w * 0.05, y: h * 0.5, w: w * 0.62, h: h * 0.08, seed: seed + 31, strength: 0.8, blobs: 5 });

  /* 溪：从左上山坳出来，往右下走，越走越宽 */
  inkStroke(
    ctx,
    [
      [w * 0.075, h * 0.44],
      [w * 0.103, h * 0.505],
      [w * 0.092, h * 0.565],
      [w * 0.125, h * 0.62],
    ],
    { color: '#6d8f8a', width: 1.6, alpha: 0.44, seed: seed + 41, dry: 0.16, layers: 2, taper: false }
  );

  /* 溪面：两侧岸线夹出一条带子，中间靠淡青 */
  const leftBank = [
    [w * 0.125, h * 0.615],
    [w * 0.152, h * 0.678],
    [w * 0.17, h * 0.735],
    [w * 0.208, h * 0.8],
    [w * 0.262, h * 0.862],
    [w * 0.34, h * 0.918],
    [w * 0.46, h * 0.972],
  ];
  const rightBank = [
    [w * 0.155, h * 0.61],
    [w * 0.192, h * 0.672],
    [w * 0.228, h * 0.732],
    [w * 0.3, h * 0.798],
    [w * 0.4, h * 0.858],
    [w * 0.53, h * 0.92],
    [w * 0.7, h * 0.975],
  ];
  washArea(ctx, leftBank.concat(rightBank.slice().reverse()), {
    color: '#6d8f8a',
    a0: 0.06,
    a1: 0.22,
    yTop: h * 0.6,
    yBot: h,
  });
  inkStroke(ctx, leftBank, {
    color: '#2b2f2b',
    width: 1.5,
    alpha: 0.42,
    seed: seed + 43,
    dry: 0.2,
    layers: 2,
    taper: false,
  });
  inkStroke(ctx, rightBank, {
    color: '#2b2f2b',
    width: 1.3,
    alpha: 0.34,
    seed: seed + 47,
    dry: 0.24,
    layers: 1,
    taper: false,
  });
  water(ctx, w * 0.7, h * 0.72, h * 0.98, { seed: seed + 53, rows: 4, alpha: 0.26, x0: 0.12, x1: 0.66 });

  /* 两岸的屋：左岸密，右岸两间，都不等高 */
  houseRow(ctx, {
    seed: seed + 400,
    alpha: 0.5,
    list: [
      [w * 0.055, h * 0.675, 30, 0],
      [w * 0.1, h * 0.712, 26, 1],
      [w * 0.045, h * 0.748, 24, 0],
      [w * 0.115, h * 0.775, 28, 0],
      [w * 0.065, h * 0.822, 26, 1],
      [w * 0.152, h * 0.848, 23, 0],
      [w * 0.108, h * 0.892, 27, 0],
    ],
  });
  houseRow(ctx, {
    seed: seed + 460,
    alpha: 0.34,
    list: [
      [w * 0.33, h * 0.855, 21, 1],
      [w * 0.4, h * 0.905, 23, 0],
    ],
  });

  /* 屋后的树，贴着坡长 */
  treeGroup(ctx, {
    x: w * 0.035,
    y: h * 0.652,
    size: 56,
    count: 3,
    spread: 0.55,
    seed: seed + 501,
    color: '#2f3a29',
    alpha: 0.42,
    canopy: '#44523a',
    canopyAlpha: 0.14,
  });
  treeGroup(ctx, {
    x: w * 0.135,
    y: h * 0.668,
    size: 46,
    count: 2,
    spread: 0.45,
    seed: seed + 517,
    color: '#37432f',
    alpha: 0.32,
    canopyAlpha: 0.1,
  });

  /* 溪上一块石板桥 */
  inkStroke(
    ctx,
    [
      [w * 0.205, h * 0.788],
      [w * 0.258, h * 0.812],
    ],
    { color: '#3a3f38', width: 2.4, alpha: 0.46, seed: seed + 61, dry: 0.12, layers: 2, taper: false }
  );
  inkStroke(ctx, [[w * 0.216, h * 0.79], [w * 0.216, h * 0.828]], {
    color: '#3a3f38',
    width: 1,
    alpha: 0.32,
    seed: seed + 63,
    layers: 1,
    dry: 0.2,
  });
  inkStroke(ctx, [[w * 0.25, h * 0.81], [w * 0.25, h * 0.85]], {
    color: '#3a3f38',
    width: 1,
    alpha: 0.28,
    seed: seed + 67,
    layers: 1,
    dry: 0.2,
  });

  /* 前景老樟：冠盖从左上角压下来 */
  cornerTree(ctx, w, h, {
    x: 0.03,
    y: 1.05,
    size: 192,
    seed: seed + 701,
    color: '#1f271c',
    alpha: 0.5,
    canopy: '#2f3a29',
    canopyAlpha: 0.2,
    lean: 0.2,
  });

  /* 岸边石与草 */
  stone(ctx, w * 0.3, h * 0.885, { w: w * 0.045, h: h * 0.017, seed: seed + 81, alpha: 0.26, moss: 2 });
  reeds(ctx, w * 0.44, h * 0.93, { size: 32, count: 4, seed: seed + 87, alpha: 0.22, dir: 1 });
}

/* ══════════════════════════════════════════════════════════
   三 · 余村：左边是被炸开的赭石山，右边是复绿的山
   ══════════════════════════════════════════════════════════ */

export function sceneYucun(ctx, w, h, seed = 1001) {
  skyWash(ctx, w, h, { color: '#8d948a', alpha: 0.07, from: 0, to: 0.38 });

  farRange(ctx, w, h, {
    baseY: 0.16,
    amp: 0.045,
    alpha: 0.16,
    seed: seed + 11,
    peaks: [
      { cx: 0.1, half: 0.2, h: 1, tilt: 0.2, sharp: 1.45 },
      { cx: 0.32, half: 0.18, h: 0.66, tilt: -0.14, sharp: 1.35 },
      { cx: 0.5, half: 0.2, h: 0.4, tilt: 0.1, sharp: 1.2 },
    ],
    fade: [[0, 1], [0.7, 0.5], [1, 0]],
  });

  /* 右：复绿的山。先画，让左边的矿山压在前面。
   * 峰位要收在 0.5 以内：app.js 从 w*0.4 起盖纸色渐隐，再往右就看不见了。
   * 这一幅的对照全在左半幅，矿在 0.03-0.27，绿在 0.28-0.52。 */
  mountain(ctx, w, h, {
    seed: seed + 21,
    baseY: h * 0.44,
    amp: h * 0.185,
    footY: h * 0.7,
    tone: '#7c9160',
    toneAlpha: 0.17,
    lineColor: '#2b2f2b',
    lineAlpha: 0.36,
    lineWidth: 1.8,
    texture: 2.4,
    peaks: [
      { cx: 0.315, half: 0.14, h: 1, tilt: -0.1, sharp: 1.2 },
      { cx: 0.44, half: 0.115, h: 0.66, tilt: 0.14, sharp: 1.15 },
    ],
    fade: [[0, 0.1], [0.22, 0.95], [0.62, 0.6], [1, 0.08]],
    footFade: 0.55,
    veins: 2,
    moss: 7,
  });

  /* 左：赭石矿山。剖面里一段直线，是宕口被切平的台阶 */
  const mineKnots = [
    [0.004, 0.02],
    [0.032, 0.36],
    [0.06, 0.7],
    [0.088, 0.95],
    [0.115, 0.76],
    [0.152, 0.72, 'lin'],
    [0.19, 0.7],
    [0.219, 0.42],
    [0.245, 0.15],
    [0.265, 0.02],
  ];
  mass(ctx, {
    vw: w,
    baseY: h * 0.435,
    amp: h * 0.245,
    knots: mineKnots,
    span: [0.004, 0.265],
    footY: h * 0.86,
    tone: '#b1813f',
    toneAlpha: 0.22,
    lineColor: '#5c4526',
    lineAlpha: 0.54,
    lineWidth: 2.2,
    dry: 0.22,
    layers: 1,
    cun: 12,
    cunLen: 0.15,
    cunAlpha: 0.42,
    moss: 5,
    seed: seed + 31,
    footFade: 0.35,
    band: 0.06,
  });

  /* 宕口：阶梯环 + 坑底 */
  pit(ctx, w * 0.135, h * 0.63, {
    r: w * 0.05,
    depth: 1,
    seed: seed + 41,
    alpha: 0.55,
    color: '#8a6733',
  });

  /* 切面上几道炮孔痕：竖着拉下来，长短不一 */
  for (let i = 0; i < 5; i++) {
    const x = w * (0.108 + i * 0.016 + ((i * 17) % 5) * 0.002);
    inkStroke(
      ctx,
      [
        [x, h * (0.5 + ((i * 13) % 7) * 0.006)],
        [x + 1.2, h * 0.575],
      ],
      {
        color: '#5c4526',
        width: 0.9,
        alpha: 0.24,
        seed: seed + 500 + i,
        wobble: 0.3,
        dry: 0.34,
        layers: 1,
        taper: false,
      }
    );
  }

  rockCluster(ctx, w * 0.05, h * 0.79, { w: w * 0.06, h: h * 0.026, seed: seed + 47, alpha: 0.34 });
  rockCluster(ctx, w * 0.21, h * 0.805, { w: w * 0.05, h: h * 0.021, seed: seed + 49, alpha: 0.26 });

  /* 山谷里的雾，把两座山分开 */
  mist(ctx, { x: w * 0.14, y: h * 0.6, w: w * 0.42, h: h * 0.1, seed: seed + 51, strength: 0.9, blobs: 4 });

  /* 右坡的树：只长在复绿的那一面 */
  treeGroup(ctx, {
    x: w * 0.36,
    y: h * 0.625,
    size: 56,
    count: 4,
    spread: 0.7,
    seed: seed + 601,
    color: '#2f3a29',
    alpha: 0.4,
    canopy: '#44523a',
    canopyAlpha: 0.14,
    shape: 'mixed',
  });
  treeGroup(ctx, {
    x: w * 0.48,
    y: h * 0.655,
    size: 44,
    count: 2,
    spread: 0.5,
    seed: seed + 619,
    color: '#3a4632',
    alpha: 0.26,
    canopyAlpha: 0.09,
  });

  /* 谷底：一条淡染的地面，压住右侧 */
  const floorTop = softEdge(-w * 0.02, w * 0.8, h * 0.795, h * 0.012, seed + 61, 28);
  washArea(
    ctx,
    floorTop.concat([
      [w * 0.8, h * 1.02],
      [-w * 0.02, h * 1.02],
    ]),
    { color: '#7c9160', a0: 0.03, a1: 0.12, yTop: h * 0.79, yBot: h }
  );

  houseRow(ctx, {
    seed: seed + 700,
    alpha: 0.48,
    list: [
      [w * 0.305, h * 0.848, 30, 0],
      [w * 0.375, h * 0.875, 26, 1],
      [w * 0.44, h * 0.905, 22, 0],
    ],
  });

  /* 塘：右下的一小块水，让地面不是白板 */
  const pond = softEdge(w * 0.4, w * 0.76, h * 0.93, h * 0.007, seed + 71, 20);
  washArea(
    ctx,
    pond.concat([
      [w * 0.76, h * 1.02],
      [w * 0.4, h * 1.02],
    ]),
    { color: '#6d8f8a', a0: 0.1, a1: 0.16, yTop: h * 0.93, yBot: h }
  );
  water(ctx, w * 0.36, h * 0.94, h * 0.99, { seed: seed + 73, rows: 2, alpha: 0.2, x0: 0.42, x1: 0.72 });

  /* 山道：从村里往左上走，接上矿山的脚 */
  inkStroke(
    ctx,
    [
      [w * 0.37, h * 0.972],
      [w * 0.32, h * 0.925],
      [w * 0.283, h * 0.878],
      [w * 0.255, h * 0.845],
    ],
    { color: '#8d948a', width: 1.2, alpha: 0.28, seed: seed + 81, dry: 0.34, layers: 1, taper: false }
  );

  /* 前景：左角竹丛，压住矿山的脚 */
  cornerTree(ctx, w, h, {
    x: 0.03,
    y: 1.02,
    size: 150,
    seed: seed + 801,
    color: '#26301f',
    alpha: 0.46,
    canopyAlpha: 0.18,
    shape: 'bamboo',
  });
  cornerTree(ctx, w, h, {
    x: 0.085,
    y: 1.06,
    size: 116,
    seed: seed + 807,
    color: '#2b3526',
    alpha: 0.3,
    canopyAlpha: 0.13,
    lean: 0.14,
    shape: 'bamboo',
  });
}

/* ══════════════════════════════════════════════════════════
   四 · 新溪桥：菜地垄行、大棚、村舍、远山
   ══════════════════════════════════════════════════════════ */

export function sceneXinxinqiao(ctx, w, h, seed = 6001) {
  skyWash(ctx, w, h, { color: '#8d948a', alpha: 0.07, from: 0, to: 0.36 });

  farRange(ctx, w, h, {
    baseY: 0.155,
    amp: 0.04,
    alpha: 0.15,
    seed: seed + 11,
    peaks: [
      { cx: 0.08, half: 0.18, h: 1, tilt: 0.24, sharp: 1.5 },
      { cx: 0.27, half: 0.19, h: 0.64, tilt: -0.16, sharp: 1.4 },
      { cx: 0.46, half: 0.2, h: 0.38, tilt: 0.1, sharp: 1.25 },
    ],
    fade: [[0, 1], [0.7, 0.5], [1, 0]],
  });

  /* 一道近丘陵，把村子和远山隔开 */
  mountain(ctx, w, h, {
    seed: seed + 21,
    baseY: h * 0.3,
    amp: h * 0.075,
    footY: h * 0.48,
    tone: '#6f8055',
    toneAlpha: 0.11,
    lineColor: '#4a544a',
    lineAlpha: 0.26,
    lineWidth: 1.3,
    texture: 1.2,
    peaks: [
      { cx: 0.1, half: 0.18, h: 1, tilt: 0.18, sharp: 1.2 },
      { cx: 0.27, half: 0.15, h: 0.55, tilt: -0.18, sharp: 1.15 },
    ],
    fade: [[0, 1], [0.62, 0.4], [1, 0.02]],
    footFade: 0.6,
    veins: 1,
    moss: 4,
  });

  mist(ctx, { x: -w * 0.05, y: h * 0.44, w: w * 0.6, h: h * 0.075, seed: seed + 31, strength: 0.8, blobs: 4 });

  /* 村舍：左边三间成组，间距不齐 */
  houseRow(ctx, {
    seed: seed + 500,
    alpha: 0.5,
    list: [
      [w * 0.15, h * 0.505, 30, 0],
      [w * 0.205, h * 0.523, 25, 1],
      [w * 0.25, h * 0.508, 27, 0],
      [w * 0.09, h * 0.532, 22, 0],
    ],
  });
  treeGroup(ctx, {
    x: w * 0.055,
    y: h * 0.522,
    size: 50,
    count: 2,
    spread: 0.45,
    seed: seed + 511,
    color: '#37432f',
    alpha: 0.36,
    canopy: '#44523a',
    canopyAlpha: 0.13,
  });
  treeGroup(ctx, {
    x: w * 0.3,
    y: h * 0.532,
    size: 42,
    count: 2,
    spread: 0.45,
    seed: seed + 519,
    color: '#4a544a',
    alpha: 0.22,
    canopyAlpha: 0.08,
  });

  /* 田埂横线，把村子和菜地分开 */
  inkStroke(ctx, softEdge(-w * 0.02, w * 0.72, h * 0.548, h * 0.005, seed + 41, 24), {
    color: '#5a625b',
    width: 1,
    alpha: 0.24,
    seed: seed + 43,
    dry: 0.3,
    layers: 1,
    taper: false,
    step: 5,
  });

  /* 垄行：收敛点偏左，往画面下缘铺 */
  cropRows(ctx, {
    w,
    yFar: h * 0.565,
    yNear: h * 1.0,
    vanishX: w * 0.2,
    x0: -w * 0.1,
    x1: w * 0.82,
    rows: 10,
    seed: seed + 61,
    alpha: 0.28,
  });

  /* 垄上的菜：只画前四行，行内不等距 */
  const rnd = mulberry32(seed + 71);
  for (let r = 0; r < 4; r++) {
    const y = h * (0.625 + r * 0.1);
    const cnt = 9 + r * 4;
    const shrink = 0.32 + r * 0.14;
    for (let i = 0; i < cnt; i++) {
      const u = (i + 0.5) / cnt;
      const x = w * (0.2 - 0.2 * shrink + (0.56 + shrink * 0.4) * u * (0.9 + rnd() * 0.2));
      const s = (3.2 + rnd() * 3) * (1 + r * 0.32);
      inkStroke(
        ctx,
        [
          [x - s, y + (rnd() - 0.5) * 2],
          [x, y - s * 1.15],
          [x + s, y + (rnd() - 0.5) * 2],
        ],
        {
          color: '#4d5c3d',
          width: 0.8,
          alpha: 0.26 + r * 0.05,
          seed: seed + 800 + r * 50 + i,
          wobble: 0.3,
          dry: 0.18,
          layers: 1,
          taper: false,
          step: 2,
        }
      );
    }
  }

  /* 大棚：三架，大小不一，拱架朝同一个方向倒 */
  const greenhouse = (cx, cy, rw, rh, sd, alpha) => {
    const arc = [];
    const seg = 24;
    for (let i = 0; i <= seg; i++) {
      const a = Math.PI + (i / seg) * Math.PI;
      arc.push([cx + Math.cos(a) * rw, cy + Math.sin(a) * rh]);
    }
    inkStroke(ctx, arc, {
      color: '#3a3f38',
      width: 1.5,
      alpha,
      seed: sd,
      wobble: 0.3,
      dry: 0.1,
      layers: 2,
      taper: true,
    });
    inkStroke(ctx, [[cx - rw, cy], [cx + rw, cy]], {
      color: '#3a3f38',
      width: 1,
      alpha: alpha * 0.7,
      seed: sd + 1,
      layers: 1,
      dry: 0.14,
    });
    for (let i = 1; i < 5; i++) {
      const u = i / 5;
      const ax = cx - rw + rw * 2 * u;
      const ah = rh * Math.sin(Math.PI * u);
      inkStroke(ctx, [[ax, cy], [ax + rh * 0.06, cy - ah]], {
        color: '#3a3f38',
        width: 0.6,
        alpha: alpha * 0.4,
        seed: sd + 10 + i,
        layers: 1,
        dry: 0.24,
      });
    }
  };

  greenhouse(w * 0.175, h * 0.6, w * 0.058, h * 0.042, seed + 91, 0.44);
  greenhouse(w * 0.285, h * 0.617, w * 0.046, h * 0.033, seed + 93, 0.32);
  greenhouse(w * 0.372, h * 0.642, w * 0.038, h * 0.027, seed + 97, 0.2);

  /* 田边小路，从下缘往上收 */
  inkStroke(
    ctx,
    [
      [w * 0.09, h * 1.0],
      [w * 0.15, h * 0.93],
      [w * 0.2, h * 0.862],
      [w * 0.235, h * 0.795],
    ],
    { color: '#8d948a', width: 1.4, alpha: 0.3, seed: seed + 101, dry: 0.34, layers: 1, taper: false }
  );

  /* 前景：左下角一块菜畦和一棵树，画面才站得住 */
  groundWash(ctx, { w, y0: h * 0.9, y1: h * 1.02, color: '#7c9160', alpha: 0.18, seed: seed + 111, x0: 0, x1: 0.66 });
  cornerTree(ctx, w, h, {
    x: 0.032,
    y: 1.04,
    size: 126,
    seed: seed + 121,
    alpha: 0.46,
    canopyAlpha: 0.18,
    lean: 0.1,
  });
}

/* ══════════════════════════════════════════════════════════
   五 · 浦江：河面横贯下半幅，对岸是村镇
   ══════════════════════════════════════════════════════════ */

export function scenePujiang(ctx, w, h, seed = 5001) {
  skyWash(ctx, w, h, { color: '#8d948a', alpha: 0.08, from: 0, to: 0.38 });

  farRange(ctx, w, h, {
    baseY: 0.16,
    amp: 0.045,
    alpha: 0.16,
    seed: seed + 11,
    peaks: [
      { cx: 0.07, half: 0.17, h: 1, tilt: 0.32, sharp: 1.5 },
      { cx: 0.25, half: 0.19, h: 0.6, tilt: -0.14, sharp: 1.35 },
      { cx: 0.45, half: 0.2, h: 0.34, tilt: 0.1, sharp: 1.2 },
    ],
    fade: [[0, 1], [0.7, 0.5], [1, 0]],
  });

  /* 对岸的低山，压得很平 */
  mountain(ctx, w, h, {
    seed: seed + 21,
    baseY: h * 0.32,
    amp: h * 0.09,
    footY: h * 0.52,
    tone: '#6f8055',
    toneAlpha: 0.12,
    lineColor: '#3a3f38',
    lineAlpha: 0.3,
    lineWidth: 1.4,
    texture: 1.5,
    peaks: [
      { cx: 0.11, half: 0.2, h: 1, tilt: 0.2, sharp: 1.2 },
      { cx: 0.32, half: 0.16, h: 0.54, tilt: -0.16, sharp: 1.15 },
    ],
    fade: [[0, 1], [0.5, 0.72], [0.85, 0.2], [1, 0.04]],
    footFade: 0.6,
    veins: 1,
    moss: 5,
  });

  /* 对岸：一条窄的岸带 */
  const farBankY = h * 0.5;
  const bankTop = softEdge(-w * 0.02, w * 0.86, farBankY, h * 0.005, seed + 31, 30);
  washArea(
    ctx,
    bankTop.concat([
      [w * 0.86, farBankY + h * 0.04],
      [-w * 0.02, farBankY + h * 0.04],
    ]),
    { color: '#7c9160', a0: 0.18, a1: 0.06, yTop: farBankY, yBot: farBankY + h * 0.045 }
  );

  /* 对岸的村镇：左边密，往右稀 */
  houseRow(ctx, {
    seed: seed + 400,
    alpha: 0.46,
    list: [
      [w * 0.045, h * 0.487, 24, 0],
      [w * 0.098, h * 0.495, 28, 1],
      [w * 0.148, h * 0.485, 23, 0],
      [w * 0.198, h * 0.5, 26, 0],
      [w * 0.268, h * 0.492, 21, 1],
      [w * 0.352, h * 0.5, 20, 0],
      [w * 0.47, h * 0.496, 22, 1],
    ],
  });

  /* 对岸的柳与树丛 */
  treeShape(ctx, w * 0.232, h * 0.505, {
    size: 58,
    seed: seed + 501,
    color: '#37432f',
    alpha: 0.42,
    canopy: '#4a5840',
    canopyAlpha: 0.13,
    shape: 'willow',
  });
  treeShape(ctx, w * 0.3, h * 0.5, {
    size: 48,
    seed: seed + 507,
    color: '#3f4a38',
    alpha: 0.32,
    canopyAlpha: 0.1,
    shape: 'willow',
  });
  treeGroup(ctx, {
    x: w * 0.065,
    y: h * 0.5,
    size: 44,
    count: 3,
    spread: 0.5,
    seed: seed + 513,
    color: '#37432f',
    alpha: 0.3,
    canopyAlpha: 0.1,
    shape: 'mixed',
  });

  /* 河面：一大片淡青，往下越来越淡 */
  const waterTop = softEdge(-w * 0.02, w * 0.98, h * 0.528, h * 0.007, seed + 41, 32);
  washArea(
    ctx,
    waterTop.concat([
      [w * 0.98, h * 1.02],
      [-w * 0.02, h * 1.02],
    ]),
    { color: '#6d8f8a', a0: 0.17, a1: 0.05, yTop: h * 0.52, yBot: h }
  );

  /* 水纹：中上段密，越靠近观者越稀 */
  water(ctx, w * 0.92, h * 0.56, h * 0.86, { seed: seed + 51, rows: 6, alpha: 0.26, x0: 0.02, x1: 0.9 });

  /* 河岸线：一道实笔，压住岸与水 */
  inkStroke(ctx, waterTop, {
    color: '#2b2f2b',
    width: 1.5,
    alpha: 0.42,
    seed: seed + 61,
    dry: 0.18,
    layers: 2,
    taper: false,
    step: 4,
  });

  /* 一条船：人在船上，船尾拖两道水痕 */
  boat(ctx, w * 0.34, h * 0.79, { size: 36, seed: seed + 71, alpha: 0.46 });

  /* 近岸：左下角一块湿岸 */
  const nearBank = softEdge(-w * 0.02, w * 0.44, h * 0.905, h * 0.011, seed + 81, 22);
  washArea(
    ctx,
    nearBank.concat([
      [w * 0.44, h * 1.02],
      [-w * 0.02, h * 1.02],
    ]),
    { color: '#5d6b4b', a0: 0.04, a1: 0.22, yTop: h * 0.9, yBot: h }
  );
  inkStroke(ctx, nearBank, {
    color: '#2b2f2b',
    width: 1.3,
    alpha: 0.3,
    seed: seed + 83,
    dry: 0.3,
    layers: 1,
    taper: false,
    step: 4,
  });
  reeds(ctx, w * 0.15, h * 0.93, { size: 44, count: 6, seed: seed + 87, alpha: 0.3, dir: 1 });
  stone(ctx, w * 0.24, h * 0.925, { w: w * 0.045, h: h * 0.016, seed: seed + 91, alpha: 0.24, moss: 2 });

  /* 前景大树：从左边探出来，冠盖压住河面上空 */
  cornerTree(ctx, w, h, {
    x: 0.04,
    y: 1.06,
    size: 198,
    seed: seed + 901,
    color: '#1f271c',
    alpha: 0.48,
    canopyAlpha: 0.2,
    lean: 0.26,
  });
}

/* ══════════════════════════════════════════════════════════
   六 · 云和梯田：等高线从山腰一层层铺下来
   ══════════════════════════════════════════════════════════ */

export function sceneYunhe(ctx, w, h, seed = 4001) {
  skyWash(ctx, w, h, { color: '#8d948a', alpha: 0.09, from: 0, to: 0.32 });

  farRange(ctx, w, h, {
    baseY: 0.135,
    amp: 0.04,
    alpha: 0.18,
    seed: seed + 11,
    peaks: [
      { cx: 0.06, half: 0.16, h: 1, tilt: 0.34, sharp: 1.6 },
      { cx: 0.24, half: 0.18, h: 0.7, tilt: -0.18, sharp: 1.45 },
      { cx: 0.44, half: 0.2, h: 0.42, tilt: 0.12, sharp: 1.3 },
    ],
    fade: [[0, 1], [0.7, 0.5], [1, 0]],
  });

  /* 梯田赖着的那座山：峰顶在左上，坡一直落到画外 */
  mountain(ctx, w, h, {
    seed: seed + 21,
    baseY: h * 0.215,
    amp: h * 0.145,
    footY: h * 0.42,
    tone: '#5d6b4b',
    toneAlpha: 0.16,
    lineColor: '#2b2f2b',
    lineAlpha: 0.42,
    lineWidth: 1.8,
    texture: 2,
    peaks: [
      { cx: 0.08, half: 0.16, h: 1, tilt: 0.38, sharp: 1.35 },
      { cx: 0.24, half: 0.13, h: 0.6, tilt: -0.2, sharp: 1.2 },
    ],
    fade: [[0, 1], [0.4, 0.8], [0.75, 0.15], [1, 0]],
    footFade: 0.7,
    veins: 2,
    moss: 8,
  });

  mist(ctx, { x: -w * 0.05, y: h * 0.3, w: w * 0.55, h: h * 0.07, seed: seed + 31, strength: 0.85, blobs: 4 });

  /* 右侧一整座山的剪影：淡，只用来托住梯田的右缘 */
  mountain(ctx, w, h, {
    seed: seed + 27,
    baseY: h * 0.26,
    amp: h * 0.1,
    footY: h * 0.45,
    tone: '#5d6b4b',
    toneAlpha: 0.1,
    lineColor: '#4a544a',
    lineAlpha: 0.18,
    lineWidth: 1.1,
    texture: 0.8,
    peaks: [{ cx: 0.52, half: 0.2, h: 1, tilt: 0.1, sharp: 1.2 }],
    fade: [[0, 0], [0.3, 0.8], [1, 0.05]],
    footFade: 0.7,
    veins: 0,
    moss: 0,
  });

  /* 主坡：等高带从山腰铺到画面下缘 */
  terraceFan(ctx, {
    top: h * 0.315,
    bottom: h * 1.02,
    cx: w * 0.235,
    spread: w * 0.255,
    rows: 27,
    seed: seed + 41,
    color: '#6f8055',
    alpha: 0.42,
    width: 1,
    tilt: 0.16,
    sink: 0.15,
  });

  /* 右边另一道坡：层数少，淡，接上主坡 */
  terraceFan(ctx, {
    top: h * 0.36,
    bottom: h * 0.88,
    cx: w * 0.53,
    spread: w * 0.16,
    rows: 13,
    seed: seed + 47,
    color: '#7c9160',
    alpha: 0.18,
    width: 0.8,
    tilt: -0.1,
    sink: 0.13,
  });

  /* 田间的屋：三间，散在坎上，不成排 */
  houseRow(ctx, {
    seed: seed + 600,
    alpha: 0.5,
    list: [
      [w * 0.205, h * 0.575, 24, 0],
      [w * 0.268, h * 0.648, 20, 1],
      [w * 0.163, h * 0.705, 22, 0],
    ],
  });

  /* 田边的树：只在坎沿上长几棵 */
  treeGroup(ctx, {
    x: w * 0.35,
    y: h * 0.625,
    size: 42,
    count: 2,
    spread: 0.45,
    seed: seed + 611,
    color: '#37432f',
    alpha: 0.26,
    canopyAlpha: 0.08,
  });
  treeGroup(ctx, {
    x: w * 0.42,
    y: h * 0.755,
    size: 34,
    count: 2,
    spread: 0.4,
    seed: seed + 619,
    color: '#3f4a38',
    alpha: 0.18,
    canopyAlpha: 0.06,
  });

  /* 中景的云带：横过梯田腰部，把层数断开 */
  mist(ctx, { x: w * 0.02, y: h * 0.83, w: w * 0.56, h: h * 0.055, seed: seed + 61, strength: 0.5, blobs: 3 });

  /* 前景一道坎：最下面一层田埂，压得最重 */
  inkStroke(
    ctx,
    [
      [-w * 0.02, h * 0.965],
      [w * 0.1, h * 0.948],
      [w * 0.22, h * 0.972],
      [w * 0.34, h * 0.955],
      [w * 0.46, h * 0.985],
    ],
    { color: '#2b2f2b', width: 2.2, alpha: 0.42, seed: seed + 71, wobble: 1.2, dry: 0.34, layers: 2, taper: false }
  );
  groundWash(ctx, { w, y0: h * 0.94, y1: h * 1.02, color: '#5d6b4b', alpha: 0.2, seed: seed + 73, x0: 0, x1: 0.5 });

  /* 左下角一棵树，收住整个画面 */
  cornerTree(ctx, w, h, {
    x: 0.022,
    y: 1.05,
    size: 154,
    seed: seed + 901,
    alpha: 0.46,
    canopyAlpha: 0.18,
    lean: 0.08,
  });
}

/* ══════════════════════════════════════════════════════════
   七 · 西溪：整幅是水，三条堤横切，水汊像巷子从堤间穿过去
   ══════════════════════════════════════════════════════════ */

export function sceneXixi(ctx, w, h, seed = 7001) {
  skyWash(ctx, w, h, { color: '#8d948a', alpha: 0.055, from: 0, to: 0.34 });

  /* 西山只剩一道影：西溪四周已经是城，山退得很远 */
  farRange(ctx, w, h, {
    baseY: 0.245,
    amp: 0.045,
    alpha: 0.12,
    seed: seed + 11,
    peaks: [
      { cx: 0.05, half: 0.17, h: 1, tilt: 0.3, sharp: 1.45 },
      { cx: 0.23, half: 0.18, h: 0.64, tilt: -0.16, sharp: 1.3 },
      { cx: 0.43, half: 0.19, h: 0.34, tilt: 0.1, sharp: 1.2 },
    ],
    fade: [[0, 0.85], [0.7, 0.4], [1, 0]],
  });

  /* 水：不画满，留纸当水。只有几笔极淡的青灰横着过去 */
  const waterTop = softEdge(-w * 0.03, w * 1.03, h * 0.3, h * 0.006, seed + 21, 36);
  washArea(ctx, waterTop.concat([[w * 1.03, h * 1.03], [-w * 0.03, h * 1.03]]), {
    color: '#6d8f8a',
    a0: 0.012,
    a1: 0.095,
    yTop: h * 0.29,
    yBot: h,
  });
  inkStroke(ctx, waterTop, {
    color: '#8d948a',
    width: 1.1,
    alpha: 0.22,
    seed: seed + 23,
    wobble: 0.7,
    dry: 0.42,
    layers: 1,
    taper: false,
    step: 5,
  });
  mist(ctx, { x: -w * 0.04, y: h * 0.285, w: w * 0.62, h: h * 0.05, seed: seed + 27, strength: 0.7, blobs: 4 });

  /* 水汊：几条极窄的水道，从远堤一直穿到画外，左右稍微偏，才不像尺子比的 */
  const channels = [
    [[w * 0.185, h * 0.3], [w * 0.176, h * 0.36], [w * 0.158, h * 0.505], [w * 0.148, h * 0.7], [w * 0.134, h * 1.02]],
    [[w * 0.395, h * 0.3], [w * 0.402, h * 0.36], [w * 0.415, h * 0.505], [w * 0.432, h * 0.7], [w * 0.458, h * 1.02]],
    [[w * 0.298, h * 0.345], [w * 0.302, h * 0.505], [w * 0.292, h * 0.7], [w * 0.276, h * 1.02]],
    [[w * 0.292, h * 0.7], [w * 0.336, h * 0.86], [w * 0.372, h * 1.02]],
  ];

  channels.forEach((path, ci) => {
    const left = [];
    const right = [];
    path.forEach(([x, y], i) => {
      const t = i / (path.length - 1);
      const dx = w * (0.0042 + t * 0.0062);
      left.push([x - dx, y]);
      right.push([x + dx, y]);
    });
    // 汊底一道更淡的水：巷子越往里越浅
    washArea(ctx, left.concat(right.slice().reverse()), {
      color: '#6d8f8a',
      a0: 0.05,
      a1: 0.16,
      yTop: h * 0.3,
      yBot: h,
    });
    // 只压一侧岸：两侧都画就成了铁轨
    inkStroke(ctx, ci % 2 === 0 ? left : right, {
      color: '#2b2f2b',
      width: 1.7,
      alpha: 0.4,
      seed: seed + 40 + ci * 9,
      wobble: 0.7,
      dry: 0.26,
      layers: 2,
      taper: false,
      step: 4,
    });
    inkStroke(ctx, ci % 2 === 0 ? right : left, {
      color: '#5a625b',
      width: 1,
      alpha: 0.18,
      seed: seed + 60 + ci * 9,
      wobble: 0.6,
      dry: 0.5,
      layers: 1,
      taper: false,
      step: 5,
    });
  });

  /* 堤：一条土，上缘重、下缘淡，堤脚在水里落一道暗影 */
  const dike = (y, th, segs, sd, alpha) => {
    segs.forEach(([x0, x1], si) => {
      const top = softEdge(x0, x1, y, th * 0.12, sd + si * 5, 24);
      const bot = softEdge(x0, x1, y + th, th * 0.2, sd + si * 5 + 2, 24);
      washArea(ctx, top.concat(bot.slice().reverse()), {
        color: '#6f8055',
        a0: alpha * 0.5,
        a1: alpha * 0.1,
        yTop: y,
        yBot: y + th,
      });
      // 堤脚的影：贴着下缘的一道淡墨，堤才不是贴在纸上的色块
      const shade = bot.map(([x, yy], i) => [x, yy + th * (0.5 + (i % 3) * 0.12)]);
      inkStroke(ctx, shade, {
        color: '#5a625b',
        width: 1.6,
        alpha: alpha * 0.5,
        seed: sd + si * 11 + 1,
        wobble: 0.8,
        dry: 0.5,
        layers: 1,
        taper: true,
        step: 5,
      });
      inkStroke(ctx, top, {
        color: '#2b2f2b',
        width: 1.9,
        alpha: 0.42,
        seed: sd + si * 11 + 3,
        wobble: 0.9,
        dry: 0.3,
        layers: 2,
        taper: true,
        step: 4,
      });
      // 堤上的草与土坡：几笔短短的竖，断断续续，不排成齿
      const r = mulberry32(sd + si * 31);
      const n = Math.round((x1 - x0) / (w * 0.016));
      for (let i = 0; i < n; i++) {
        if (r() > 0.55) continue;
        const x = x0 + (x1 - x0) * ((i + 0.4 + r() * 0.3) / n);
        const hh = th * (0.45 + r() * 0.6);
        inkStroke(ctx, [[x, y + th * 0.75], [x + (r() - 0.5) * th * 0.5, y + th * 0.75 - hh]], {
          color: '#3a3f38',
          width: 0.8,
          alpha: 0.22,
          seed: sd + 500 + si * 41 + i,
          wobble: 0.2,
          dry: 0.2,
          layers: 1,
          taper: true,
          step: 2,
        });
      }
    });
  };

  dike(h * 0.345, h * 0.017, [[-w * 0.03, w * 0.163], [w * 0.189, w * 0.385], [w * 0.412, w * 0.74]], seed + 100, 0.3);
  dike(h * 0.505, h * 0.024, [[-w * 0.03, w * 0.144], [w * 0.172, w * 0.288], [w * 0.316, w * 0.401], [w * 0.430, w * 0.6]], seed + 120, 0.34);
  dike(h * 0.7, h * 0.034, [[-w * 0.03, w * 0.134], [w * 0.162, w * 0.278], [w * 0.306, w * 0.418], [w * 0.446, w * 0.51]], seed + 140, 0.36);

  /* 柿树：一株矮干，梢头三丛点叶，叶子往下垂。不画成风车 */
  const persimmon = (x, y, s, sd) => {
    const r = mulberry32(sd);
    inkStroke(ctx, [[x, y], [x + (r() - 0.5) * s * 0.18, y - s * 0.62]], {
      color: '#2b2f2b',
      width: Math.max(0.8, s * 0.09),
      alpha: 0.4,
      seed: sd,
      wobble: 0.14,
      dry: 0.16,
      layers: 1,
      taper: true,
      step: 2,
    });
    // 三根短枝，往不同方向挑出去
    const tips = [];
    for (let k = 0; k < 3; k++) {
      const dir = k === 0 ? -0.55 : k === 1 ? 1.05 : 0.2;
      const side = k === 0 ? -1 : k === 1 ? 1 : -0.2;
      const tx = x + side * s * (0.16 + r() * 0.12);
      const ty = y - s * (0.56 + r() * 0.12) - Math.abs(side) * s * 0.06;
      inkStroke(ctx, [[x, y - s * 0.6], [tx, ty]], {
        color: '#2b2f2b',
        width: Math.max(0.6, s * 0.05),
        alpha: 0.34,
        seed: sd + 3 + k,
        wobble: 0.1,
        dry: 0.2,
        layers: 1,
        taper: true,
        step: 2,
      });
      tips.push([tx, ty, dir]);
    }
    // 每根枝头一丛叶：三笔短点，朝上散开
    tips.forEach(([tx, ty], ti) => {
      for (let j = 0; j < 4; j++) {
        const a = -Math.PI / 2 + (j - 1.5) * 0.42 + (r() - 0.5) * 0.2;
        const ll = s * (0.18 + r() * 0.1);
        const px = tx + (r() - 0.5) * s * 0.08;
        const py = ty + (r() - 0.5) * s * 0.05;
        inkStroke(ctx, [[px, py], [px + Math.cos(a) * ll, py + Math.sin(a) * ll]], {
          color: '#333f2c',
          width: Math.max(1.1, s * 0.13),
          alpha: 0.3,
          seed: sd + 20 + ti * 7 + j,
          wobble: 0.08,
          dry: 0,
          layers: 1,
          taper: true,
          step: 2,
        });
      }
      // 一颗柿子：极小的一点赭
      inkStroke(ctx, [[tx + s * 0.06, ty + s * 0.06], [tx + s * 0.1, ty + s * 0.08]], {
        color: '#8a6b3f',
        width: Math.max(1.6, s * 0.2),
        alpha: 0.34,
        seed: sd + 60 + ti,
        wobble: 0,
        dry: 0,
        layers: 1,
        taper: true,
        step: 2,
      });
    });
  };

  const rows = [
    { y: h * 0.345, xs: [0.02, 0.062, 0.1, 0.138, 0.212, 0.248, 0.284, 0.322, 0.36, 0.436, 0.474, 0.51, 0.56, 0.61, 0.67, 0.72], s: 11, sd: seed + 300 },
    { y: h * 0.505, xs: [0.012, 0.052, 0.09, 0.126, 0.196, 0.232, 0.262, 0.336, 0.364, 0.452, 0.492, 0.532, 0.575], s: 15, sd: seed + 340 },
    { y: h * 0.7, xs: [0.01, 0.046, 0.088, 0.186, 0.222, 0.256, 0.33, 0.362, 0.462, 0.498], s: 19, sd: seed + 380 },
  ];
  rows.forEach((row, ri) => {
    row.xs.forEach((u, i) => {
      const x = w * u;
      const y = row.y - h * (0.004 + ri * 0.003);
      persimmon(x, y, row.s * (0.86 + ((i * 37) % 9) / 26), row.sd + i * 13);
    });
  });

  /* 零星白墙黑瓦：只落在中堤左端，三五间，不成村 */
  houseRow(ctx, {
    seed: seed + 500,
    alpha: 0.46,
    tone: '#f4efe4',
    toneAlpha: 0.9,
    list: [
      [w * 0.056, h * 0.492, 24, 0],
      [w * 0.104, h * 0.5, 20, 1],
      [w * 0.238, h * 0.494, 19, 0],
    ],
  });

  /* 岸边芦苇：压住近堤的左端，也压住画角 */
  reeds(ctx, w * 0.03, h * 0.735, { size: 52, count: 7, seed: seed + 601, alpha: 0.3, dir: 1 });
  reeds(ctx, w * 0.196, h * 0.73, { size: 40, count: 4, seed: seed + 607, alpha: 0.24, dir: -1 });
  reeds(ctx, w * 0.44, h * 0.885, { size: 34, count: 4, seed: seed + 611, alpha: 0.2, dir: 1 });

  /* 一条摇橹船，停在堤外的水面上，是全幅唯一会动的东西 */
  boat(ctx, w * 0.318, h * 0.79, { size: 26, seed: seed + 701, alpha: 0.32 });

  /* 前景：左下一株垂柳，冠压住水，画面才有个近处 */
  treeShape(ctx, w * 0.045, h * 1.02, {
    size: 150,
    seed: seed + 901,
    color: '#2f3a29',
    alpha: 0.46,
    canopy: '#44523a',
    canopyAlpha: 0.16,
    shape: 'willow',
  });
  stone(ctx, w * 0.15, h * 0.985, { w: w * 0.05, h: h * 0.016, seed: seed + 911, alpha: 0.24, moss: 2 });
}

/* ══════════════════════════════════════════════════════════
   八 · 大陈岛：左重山压海，右小岛留一道海峡，海上铺着网箱
   ══════════════════════════════════════════════════════════ */

export function sceneDachendao(ctx, w, h, seed = 8001) {
  skyWash(ctx, w, h, { color: '#8d948a', alpha: 0.08, from: 0, to: 0.38 });

  /* 海平线：一道极淡的线，把天与海分开，两端都化掉 */
  inkStroke(ctx, softEdge(-w * 0.03, w * 0.95, h * 0.398, h * 0.003, seed + 9, 30), {
    color: '#7c8b88',
    width: 1,
    alpha: 0.2,
    seed: seed + 10,
    wobble: 0.35,
    dry: 0.55,
    layers: 1,
    taper: false,
    step: 5,
  });
  cloudBand(ctx, w * 0.05, h * 0.19, w * 0.4, { alpha: 0.55, seed: seed + 14, rows: 2 });
  bird(ctx, w * 0.335, h * 0.29, { size: 12, alpha: 0.28, seed: seed + 16 });
  bird(ctx, w * 0.362, h * 0.272, { size: 9, alpha: 0.24, seed: seed + 17 });

  /* 左岛：主峰顶在左端，山脊向右一级一级断下去。三峰都在水里立着 */
  mountain(ctx, w, h, {
    seed: seed + 21,
    baseY: h * 0.398,
    amp: h * 0.242,
    footY: h * 0.652,
    tone: '#3f4a38',
    toneAlpha: 0.3,
    lineColor: '#22282a',
    lineAlpha: 0.62,
    lineWidth: 2.3,
    texture: 4.6,
    peaks: [
      { cx: 0.028, half: 0.16, h: 1, tilt: 0.34, sharp: 1.85, crest: 2.3 },
      { cx: 0.2, half: 0.108, h: 0.64, tilt: -0.26, sharp: 1.6, crest: 2 },
      { cx: 0.3, half: 0.07, h: 0.38, tilt: 0.2, sharp: 1.4, crest: 1.8 },
    ],
    fade: [[0, 1], [0.55, 0.94], [0.88, 0.34], [1, 0.06]],
    shade: [-0.02, 0.12, 0.2],
    footFade: 0.34,
    band: 0.1,
    veins: 4,
    moss: 8,
  });

  /* 右岛：矮一截，隔一道海峡。近处这一侧也是崖，不用圆坡收边 */
  mountain(ctx, w, h, {
    seed: seed + 29,
    baseY: h * 0.42,
    amp: h * 0.152,
    footY: h * 0.612,
    tone: '#46523f',
    toneAlpha: 0.22,
    lineColor: '#2b2f2b',
    lineAlpha: 0.46,
    lineWidth: 1.8,
    texture: 3,
    peaks: [
      { cx: 0.545, half: 0.13, h: 1, tilt: -0.2, sharp: 1.7, crest: 2.1 },
      { cx: 0.655, half: 0.095, h: 0.5, tilt: 0.16, sharp: 1.45, crest: 1.9 },
    ],
    fade: [[0, 0.45], [0.32, 0.96], [0.7, 0.4], [1, 0.03]],
    shade: [0.62, 0.72, 0.14],
    footFade: 0.5,
    veins: 2,
    moss: 4,
  });

  /* 两岛之间一道海雾：海峡的远，靠把墨擦掉 */
  mist(ctx, { x: w * 0.26, y: h * 0.6, w: w * 0.36, h: h * 0.05, seed: seed + 31, strength: 0.5, blobs: 3 });

  /* 海：从海平线往画外铺，越近越重；海峡那一道留得最亮 */
  const seaTop = softEdge(-w * 0.03, w * 1.03, h * 0.418, h * 0.003, seed + 41, 34);
  washArea(ctx, seaTop.concat([[w * 1.03, h * 1.03], [-w * 0.03, h * 1.03]]), {
    color: '#6d8f8a',
    a0: 0.05,
    a1: 0.19,
    yTop: h * 0.41,
    yBot: h,
  });

  /* 水纹：分四层写，越近越长、越疏。横笔都不贯通，断在岛脚 */
  const seaBands = [
    { y0: 0.435, y1: 0.5, rows: 5, x0: 0.02, x1: 0.92, a: 0.2 },
    { y0: 0.5, y1: 0.6, rows: 4, x0: 0.02, x1: 0.95, a: 0.24 },
    { y0: 0.62, y1: 0.78, rows: 3, x0: 0.28, x1: 0.98, a: 0.26 },
    { y0: 0.8, y1: 0.97, rows: 3, x0: 0.0, x1: 0.9, a: 0.22 },
  ];
  seaBands.forEach((b, bi) => {
    water(ctx, w, h * b.y0, h * b.y1, {
      seed: seed + 43 + bi * 17,
      rows: b.rows,
      alpha: b.a,
      x0: b.x0,
      x1: b.x1,
    });
  });

  /* 海峡里几道横向的涌，压出两个岛之间的距离 */
  for (let i = 0; i < 4; i++) {
    const y = h * (0.545 + i * 0.03);
    inkStroke(
      ctx,
      [
        [w * (0.322 + i * 0.004), y],
        [w * (0.36 + i * 0.006), y + h * 0.004],
        [w * (0.398 + i * 0.009), y - h * 0.002],
      ],
      {
        color: '#6d8f8a',
        width: 1.1,
        alpha: 0.24 - i * 0.04,
        seed: seed + 50 + i,
        wobble: 0.7,
        dry: 0.42,
        layers: 1,
        taper: false,
        step: 3,
      }
    );
  }

  /* 海蚀崖：山脚是切下去的，不是慢慢斜进水。崖线短、陡、带飞白 */
  const cliff = (u, yTop, yBot, sd, a) => {
    const pts = [
      [w * u, h * yTop],
      [w * (u + 0.003), h * (yTop + (yBot - yTop) * 0.55)],
      [w * (u - 0.001), h * (yBot - (yBot - yTop) * 0.12)],
      [w * (u - 0.004), h * yBot],
    ];
    inkStroke(ctx, pts, {
      color: '#22282a',
      width: 1.7,
      alpha: a,
      seed: sd,
      wobble: 0.45,
      dry: 0.4,
      layers: 2,
      taper: true,
      step: 3,
    });
    // 崖脚那道白：浪打在石上，用留纸表现，只在崖脚擦一小条
    mist(ctx, { x: w * (u - 0.028), y: h * (yBot - 0.008), w: w * 0.06, h: h * 0.022, seed: sd + 9, strength: 0.34, blobs: 2 });
  };
  cliff(0.012, 0.6, 0.648, seed + 70, 0.5);
  cliff(0.052, 0.578, 0.632, seed + 73, 0.44);
  cliff(0.104, 0.598, 0.645, seed + 76, 0.42);
  cliff(0.158, 0.612, 0.652, seed + 79, 0.4);
  cliff(0.232, 0.63, 0.66, seed + 82, 0.34);
  cliff(0.286, 0.64, 0.662, seed + 85, 0.3);
  cliff(0.505, 0.588, 0.618, seed + 88, 0.3);
  cliff(0.572, 0.6, 0.626, seed + 91, 0.28);
  cliff(0.63, 0.607, 0.63, seed + 94, 0.24);

  /* 风机：立在脊线上的一排，细杆 + 三叶。山脊往下走，风机一点点小下去 */
  const turbine = (x, y, s, sd) => {
    const r = mulberry32(sd);
    const hubY = y - s;
    inkStroke(ctx, [[x, y], [x + s * 0.04, hubY]], {
      color: '#2b2f2b',
      width: Math.max(0.8, s * 0.06),
      alpha: 0.5,
      seed: sd,
      wobble: 0.1,
      dry: 0.08,
      layers: 1,
      taper: true,
      step: 2,
    });
    const ph = r() * 1.2;
    for (let k = 0; k < 3; k++) {
      const a = -Math.PI / 2 + ph + (k * Math.PI * 2) / 3;
      inkStroke(
        ctx,
        [
          [x + s * 0.012, hubY],
          [x + s * 0.012 + Math.cos(a) * s * 0.2, hubY + Math.sin(a) * s * 0.2],
          [x + s * 0.012 + Math.cos(a) * s * 0.36, hubY + Math.sin(a) * s * 0.36],
        ],
        {
          color: '#2b2f2b',
          width: Math.max(0.5, s * 0.03),
          alpha: 0.4,
          seed: sd + 3 + k * 4,
          wobble: 0.05,
          dry: 0.1,
          layers: 1,
          taper: true,
          step: 2,
        }
      );
    }
  };
  [
    [0.016, 0.176, 46],
    [0.046, 0.163, 48],
    [0.076, 0.176, 45],
    [0.106, 0.2, 41],
    [0.136, 0.228, 36],
    [0.166, 0.252, 32],
    [0.198, 0.276, 27],
  ].forEach(([u, v, s], i) => turbine(w * u, h * v, s, seed + 800 + i * 17));

  /* 网箱：一块一块独立的浮筏，两三笔围一个格子。行列是有的，但不连成一张网 */
  const raft = (x, y, rw, rh, sd, a) => {
    const quad = [
      [x - rw, y],
      [x - rw * 0.86, y - rh],
      [x + rw, y - rh * 0.86],
      [x + rw * 0.9, y + rh * 0.1],
      [x - rw, y],
    ];
    inkStroke(ctx, quad, {
      color: '#3a3f38',
      width: 1.3,
      alpha: a,
      seed: sd,
      wobble: 0.3,
      dry: 0.28,
      layers: 2,
      taper: false,
      step: 3,
    });
    // 浮子：四角各一点，标出这是一块筏
    for (const [px, py] of [quad[0], quad[1], quad[2], quad[3]]) {
      inkStroke(ctx, [[px - rw * 0.1, py], [px + rw * 0.1, py]], {
        color: '#2b2f2b',
        width: 2.2,
        alpha: a * 0.8,
        seed: sd + Math.round(px),
        wobble: 0,
        dry: 0,
        layers: 1,
        taper: false,
        step: 2,
      });
    }
  };
  const rndR = mulberry32(seed + 1000);
  for (let row = 0; row < 5; row++) {
    const t = row / 4;
    const y = h * (0.668 + Math.pow(t, 1.5) * 0.2);
    const rw = w * (0.016 + t * 0.014);
    const rh = h * (0.008 + t * 0.009);
    const n = 7 + Math.round(t * 2);
    for (let c = 0; c < n; c++) {
      if (rndR() > 0.9) continue;
      const x = w * (0.034 + t * 0.022 + c * (0.049 + t * 0.005)) + (rndR() - 0.5) * w * 0.004;
      if (x > w * 0.5) continue;
      raft(x, y + (rndR() - 0.5) * h * 0.004, rw * (0.85 + rndR() * 0.3), rh, seed + 1010 + row * 40 + c, 0.26 + t * 0.14);
    }
  }

  /* 码头：密排的渔船，压住左下，是全幅唯一的热闹处 */
  const rndB = mulberry32(seed + 1200);
  for (let i = 0; i < 8; i++) {
    const x = w * (0.03 + i * 0.024 + (rndB() - 0.5) * 0.005);
    const y = h * (0.872 + i * 0.008 + (rndB() - 0.5) * 0.007);
    boat(ctx, x, y, {
      size: 16 + rndB() * 8,
      seed: seed + 1210 + i * 13,
      alpha: 0.4 + rndB() * 0.14,
      figure: i % 3 === 0,
    });
  }
  /* 码头那条石砌的岸 */
  inkStroke(ctx, softEdge(-w * 0.02, w * 0.235, h * 0.858, h * 0.0035, seed + 1300, 20), {
    color: '#22282a',
    width: 2.2,
    alpha: 0.44,
    seed: seed + 1301,
    wobble: 0.9,
    dry: 0.34,
    layers: 2,
    taper: true,
    step: 4,
  });
  /* 岸上的矮房与树：只三间，别把海挡住 */
  houseRow(ctx, {
    seed: seed + 1320,
    alpha: 0.4,
    tone: '#f4efe4',
    toneAlpha: 0.8,
    list: [
      [w * 0.048, h * 0.848, 18, 0],
      [w * 0.086, h * 0.842, 15, 1],
      [w * 0.128, h * 0.85, 16, 0],
    ],
  });
  treeGroup(ctx, { x: w * 0.105, y: h * 0.842, size: 26, count: 2, spread: 0.5, seed: seed + 1340, color: '#2f3a29', alpha: 0.34, canopyAlpha: 0.1 });

  /* 前景：左下一块礁，压得最重 */
  stone(ctx, w * 0.04, h * 0.975, { w: w * 0.14, h: h * 0.045, seed: seed + 1400, alpha: 0.42, width: 1.8, moss: 5 });
  stone(ctx, w * 0.15, h * 1.0, { w: w * 0.1, h: h * 0.028, seed: seed + 1403, alpha: 0.32, moss: 3 });
  rockCluster(ctx, w * 0.25, h * 0.978, { w: w * 0.07, h: h * 0.022, seed: seed + 1407, alpha: 0.22 });
  reeds(ctx, w * 0.29, h * 0.958, { size: 30, count: 4, seed: seed + 1411, alpha: 0.2, dir: 1 });
  groundWash(ctx, { w, y0: h * 0.958, y1: h * 1.02, color: '#3f4a38', alpha: 0.18, seed: seed + 1415, x0: 0, x1: 0.35 });
}

/* ══════════════════════════════════════════════════════════
   九 · 桑基鱼塘：俯视的方格，全幅没有一座山
   ══════════════════════════════════════════════════════════ */

export function sceneSangji(ctx, w, h, seed = 9001) {
  skyWash(ctx, w, h, { color: '#8d948a', alpha: 0.055, from: 0, to: 0.2 });

  /* 地平线压得很低：这里是平原，天只占一条 */
  inkStroke(ctx, softEdge(-w * 0.03, w * 0.98, h * 0.318, h * 0.0028, seed + 9, 30), {
    color: '#7c8b88',
    width: 0.95,
    alpha: 0.2,
    seed: seed + 10,
    wobble: 0.4,
    dry: 0.5,
    layers: 1,
    taper: false,
    step: 5,
  });
  /* 远处的树带与两间屋：只有一列影子，没有山 */
  treeGroup(ctx, { x: w * 0.03, y: h * 0.315, size: 15, count: 5, spread: 1.4, seed: seed + 13, color: '#4a544a', alpha: 0.2, canopyAlpha: 0.06 });
  treeGroup(ctx, { x: w * 0.2, y: h * 0.313, size: 13, count: 4, spread: 1.3, seed: seed + 17, color: '#4a544a', alpha: 0.16, canopyAlpha: 0.05 });
  houseRow(ctx, { seed: seed + 21, alpha: 0.26, list: [[w * 0.115, h * 0.309, 11, 0], [w * 0.29, h * 0.31, 10, 1]] });
  mist(ctx, { x: -w * 0.04, y: h * 0.325, w: w * 0.7, h: h * 0.042, seed: seed + 23, strength: 0.5, blobs: 4 });

  /* 塘群：一层极淡的水色打底，塘基是方格，水面从格子里露出来 */
  const fieldTop = softEdge(-w * 0.03, w * 0.99, h * 0.352, h * 0.003, seed + 31, 30);
  washArea(ctx, fieldTop.concat([[w * 0.99, h * 1.02], [-w * 0.03, h * 1.02]]), {
    color: '#6d8f8a',
    a0: 0.02,
    a1: 0.115,
    yTop: h * 0.34,
    yBot: h,
  });

  const vanishX = w * 0.12;
  const yFar = h * 0.372;
  const yNear = h * 1.02;
  const rowsN = 10;
  const rowY = [];
  const rowTh = [];
  for (let r = 0; r <= rowsN; r++) {
    const t = r / rowsN;
    rowY.push(yFar + (yNear - yFar) * Math.pow(t, 1.55));
    rowTh.push(h * (0.0028 + t * t * 0.016));
  }

  /* 塘基线：远的一条细，近的一条厚；两条之间是高出水面的塘基 */
  for (let r = 0; r < rowsN; r++) {
    const y = rowY[r];
    const th = rowTh[r];
    const t = r / rowsN;
    const x0 = -w * 0.03;
    const x1 = w * (0.92 + t * 0.06);
    const top = softEdge(x0, x1, y, th * 0.16, seed + 100 + r * 9, 26);
    const bot = softEdge(x0, x1, y + th, th * 0.2, seed + 104 + r * 9, 26);
    washArea(ctx, top.concat(bot.slice().reverse()), {
      color: '#6f8055',
      a0: 0.22,
      a1: 0.07,
      yTop: y,
      yBot: y + th,
    });
    inkStroke(ctx, top, {
      color: '#3a3f38',
      width: 0.8 + t * 1.1,
      alpha: 0.26 + t * 0.12,
      seed: seed + 110 + r * 7,
      wobble: 0.6,
      dry: 0.34,
      layers: 1,
      taper: false,
      step: 4,
    });
    inkStroke(ctx, bot, {
      color: '#5a625b',
      width: 0.7 + t * 0.8,
      alpha: 0.16 + t * 0.1,
      seed: seed + 130 + r * 7,
      wobble: 0.6,
      dry: 0.42,
      layers: 1,
      taper: false,
      step: 4,
    });
  }

  /* 溇港：横竖都通，几条直的把塘群切成棋盘。竖线往远处收，收到那个消失点 */
  const colsN = 8;
  for (let c = 0; c < colsN; c++) {
    const u = c / (colsN - 1);
    const xNear = w * (-0.05 + u * 0.98);
    const xFar = vanishX + (xNear - vanishX) * 0.4;
    const isChannel = c === 2 || c === 5;
    const path = [];
    for (let k = 0; k <= 6; k++) {
      const t = k / 6;
      const tt = Math.pow(t, 1.3);
      path.push([
        xFar + (xNear - xFar) * tt + Math.sin(t * 3 + c) * w * 0.002,
        yFar + (yNear - yFar) * tt,
      ]);
    }
    path.forEach(([x, y], i) => {
      if (i === 0) return;
      const prev = path[i - 1];
      inkStroke(ctx, [prev, [x, y]], {
        color: isChannel ? '#6d8f8a' : '#5a625b',
        width: (isChannel ? 1.6 : 0.7) * (0.7 + i * 0.12),
        alpha: (isChannel ? 0.3 : 0.2) * (0.7 + i * 0.1),
        seed: seed + 200 + c * 11 + i,
        wobble: 0.3,
        dry: 0.36,
        layers: 1,
        taper: false,
        step: 4,
      });
      // 塘基：水道两侧各一条细岸
      if (isChannel) {
        const dx = w * (0.0035 + i * 0.0009);
        inkStroke(ctx, [[prev[0] - dx, prev[1]], [x - dx, y]], {
          color: '#3a3f38',
          width: 0.9,
          alpha: 0.22,
          seed: seed + 260 + c * 11 + i,
          wobble: 0.25,
          dry: 0.34,
          layers: 1,
          taper: false,
          step: 3,
        });
        inkStroke(ctx, [[prev[0] + dx, prev[1]], [x + dx, y]], {
          color: '#3a3f38',
          width: 0.9,
          alpha: 0.18,
          seed: seed + 290 + c * 11 + i,
          wobble: 0.25,
          dry: 0.34,
          layers: 1,
          taper: false,
          step: 3,
        });
      }
    });
  }

  /* 桑树：沿塘基成行，是笔直的绿带。近处高、远处矮，一条带上一株挨一株 */
  const rndS = mulberry32(seed + 400);
  for (let r = 1; r < rowsN; r++) {
    const t = r / rowsN;
    const y = rowY[r] + rowTh[r] * 0.55;
    const n = 9 + Math.round(t * 16);
    const span = 0.9 - t * 0.22;
    for (let i = 0; i < n; i++) {
      const u = ((i + 0.5) / n) * span - 0.01 + (rndS() - 0.5) * 0.004;
      const x = w * u;
      const hs = h * (0.008 + t * 0.02) * (0.8 + rndS() * 0.4);
      inkStroke(ctx, [[x, y], [x + (rndS() - 0.5) * hs * 0.16, y - hs]], {
        color: '#4d5c3d',
        width: Math.max(0.8, hs * 0.11),
        alpha: 0.24 + t * 0.16,
        seed: seed + 420 + r * 23 + i,
        wobble: 0.12,
        dry: 0.1,
        layers: 1,
        taper: true,
        step: 2,
      });
      // 桑冠：两点，压住树顶
      inkStroke(ctx, [[x - hs * 0.14, y - hs * 0.92], [x + hs * 0.16, y - hs * 1.02]], {
        color: '#5d6b4b',
        width: Math.max(1, hs * 0.2),
        alpha: 0.22 + t * 0.14,
        seed: seed + 480 + r * 23 + i,
        wobble: 0.1,
        dry: 0,
        layers: 1,
        taper: true,
        step: 2,
      });
    }
  }
  /* 靠水道的两侧再补一列，绿带才「成列」 */
  [2, 5].forEach((c, ci) => {
    const u = c / (colsN - 1);
    for (let k = 1; k < 7; k++) {
      const t = Math.pow(k / 7, 1.3);
      const xNear = w * (-0.05 + u * 0.98);
      const xFar = vanishX + (xNear - vanishX) * 0.4;
      const x = xFar + (xNear - xFar) * t - w * 0.012;
      const y = yFar + (yNear - yFar) * t;
      const hs = h * (0.008 + t * 0.02);
      inkStroke(ctx, [[x, y], [x, y - hs]], {
        color: '#4d5c3d',
        width: Math.max(0.8, hs * 0.12),
        alpha: 0.24 + t * 0.14,
        seed: seed + 520 + ci * 40 + k,
        wobble: 0.1,
        dry: 0.1,
        layers: 1,
        taper: true,
        step: 2,
      });
    }
  });

  /* 单孔石桥：一道弧，压在溇港上，是全幅唯一的建筑高光 */
  bridge(ctx, w * 0.29, h * 0.735, { w: w * 0.066, h: h * 0.036, seed: seed + 600, alpha: 0.5 });
  bridge(ctx, w * 0.155, h * 0.53, { w: w * 0.05, h: h * 0.024, seed: seed + 607, alpha: 0.3 });

  /* 塘群中央的小村：几间屋，几棵树，不铺开 */
  houseRow(ctx, {
    seed: seed + 700,
    alpha: 0.46,
    tone: '#f4efe4',
    toneAlpha: 0.85,
    list: [
      [w * 0.232, h * 0.552, 19, 0],
      [w * 0.272, h * 0.566, 16, 1],
      [w * 0.208, h * 0.575, 15, 0],
      [w * 0.252, h * 0.59, 14, 0],
    ],
  });
  treeGroup(ctx, {
    x: w * 0.19,
    y: h * 0.556,
    size: 30,
    count: 3,
    spread: 0.6,
    seed: seed + 717,
    color: '#37432f',
    alpha: 0.34,
    canopyAlpha: 0.1,
    shape: 'mixed',
  });

  /* 前景：左下角一株桑树与一段岸，压住画角 */
  treeShape(ctx, w * 0.032, h * 1.02, {
    size: 132,
    seed: seed + 901,
    color: '#2b3526',
    alpha: 0.44,
    canopy: '#3f4d36',
    canopyAlpha: 0.16,
    lean: 0.1,
  });
  reeds(ctx, w * 0.115, h * 0.965, { size: 34, count: 5, seed: seed + 911, alpha: 0.22, dir: 1 });
  stone(ctx, w * 0.196, h * 0.99, { w: w * 0.045, h: h * 0.015, seed: seed + 915, alpha: 0.2, moss: 2 });
  groundWash(ctx, { w, y0: h * 0.96, y1: h * 1.02, color: '#5d6b4b', alpha: 0.14, seed: seed + 919, x0: 0, x1: 0.3 });
}

/* ══════════════════════════════════════════════════════════
   十 · 滕头：一条环形水渠围住村子，外面是成行成列的苗木
   ══════════════════════════════════════════════════════════ */

export function sceneTengtou(ctx, w, h, seed = 10001) {
  skyWash(ctx, w, h, { color: '#8d948a', alpha: 0.065, from: 0, to: 0.34 });

  /* 远处只有低缓丘陵，压在地平线上，不抢戏 */
  farRange(ctx, w, h, {
    baseY: 0.185,
    amp: 0.028,
    alpha: 0.12,
    seed: seed + 11,
    peaks: [
      { cx: 0.05, half: 0.16, h: 1, tilt: 0.22, sharp: 1.3 },
      { cx: 0.24, half: 0.17, h: 0.62, tilt: -0.14, sharp: 1.2 },
      { cx: 0.42, half: 0.18, h: 0.34, tilt: 0.1, sharp: 1.15 },
    ],
    fade: [[0, 0.9], [0.7, 0.4], [1, 0]],
  });
  mountain(ctx, w, h, {
    seed: seed + 21,
    baseY: h * 0.3,
    amp: h * 0.055,
    footY: h * 0.44,
    tone: '#6f8055',
    toneAlpha: 0.1,
    lineColor: '#4a544a',
    lineAlpha: 0.22,
    lineWidth: 1.2,
    texture: 1,
    peaks: [
      { cx: 0.075, half: 0.2, h: 1, tilt: 0.14, sharp: 1.18 },
      { cx: 0.29, half: 0.17, h: 0.5, tilt: -0.14, sharp: 1.12 },
    ],
    fade: [[0, 0.85], [0.55, 0.4], [1, 0.02]],
    footFade: 0.62,
    veins: 1,
    moss: 3,
  });
  mist(ctx, { x: -w * 0.04, y: h * 0.345, w: w * 0.66, h: h * 0.045, seed: seed + 31, strength: 0.62, blobs: 4 });

  /* 平原底子：一层极淡的田色，从地平线铺到画外 */
  const fieldTop = softEdge(-w * 0.03, w * 0.99, h * 0.372, h * 0.003, seed + 41, 30);
  washArea(ctx, fieldTop.concat([[w * 0.99, h * 1.02], [-w * 0.03, h * 1.02]]), {
    color: '#7c9160',
    a0: 0.03,
    a1: 0.13,
    yTop: h * 0.36,
    yBot: h,
  });

  /* 环形水渠：一圈不圆的环，内外两条岸，中间是水 */
  const cx = w * 0.215;
  const cy = h * 0.615;
  const rx = w * 0.205;
  const ry = h * 0.128;
  const ring = (scale, sd) => {
    const r = mulberry32(sd);
    const pts = [];
    const seg = 44;
    const p1 = r() * 6.28;
    const p2 = r() * 6.28;
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      const k = 1 + Math.sin(a * 3 + p1) * 0.045 + Math.sin(a * 5 + p2) * 0.028;
      pts.push([cx + Math.cos(a) * rx * scale * k, cy + Math.sin(a) * ry * scale * k * (1 + Math.sin(a * 2 + p1) * 0.05)]);
    }
    return pts;
  };
  const outer = ring(1, seed + 51);
  const inner = ring(0.9, seed + 53);
  washArea(ctx, outer.concat(inner.slice().reverse()), {
    color: '#6d8f8a',
    a0: 0.09,
    a1: 0.2,
    yTop: cy - ry,
    yBot: cy + ry,
  });
  inkStroke(ctx, outer, {
    color: '#3a3f38',
    width: 1.6,
    alpha: 0.4,
    seed: seed + 61,
    wobble: 0.6,
    dry: 0.22,
    layers: 2,
    taper: false,
    step: 4,
  });
  inkStroke(ctx, inner, {
    color: '#5a625b',
    width: 1.1,
    alpha: 0.34,
    seed: seed + 67,
    wobble: 0.5,
    dry: 0.3,
    layers: 1,
    taper: false,
    step: 4,
  });

  /* 村里的直路：一横一竖，通到环渠的两个口子 */
  inkStroke(ctx, [[cx, h * 0.492], [cx + w * 0.004, h * 0.742]], {
    color: '#8d948a',
    width: 3.4,
    alpha: 0.3,
    seed: seed + 81,
    wobble: 0.3,
    dry: 0.36,
    layers: 1,
    taper: false,
    step: 6,
  });
  inkStroke(ctx, [[w * 0.038, h * 0.596], [w * 0.392, h * 0.586]], {
    color: '#8d948a',
    width: 3,
    alpha: 0.28,
    seed: seed + 87,
    wobble: 0.3,
    dry: 0.4,
    layers: 1,
    taper: false,
    step: 6,
  });
  /* 路的两侧压线，路才立起来 */
  inkStroke(ctx, [[cx - w * 0.006, h * 0.496], [cx - w * 0.002, h * 0.738]], {
    color: '#3a3f38',
    width: 0.8,
    alpha: 0.22,
    seed: seed + 91,
    wobble: 0.3,
    dry: 0.4,
    layers: 1,
    taper: false,
    step: 5,
  });
  inkStroke(ctx, [[cx + w * 0.006, h * 0.498], [cx + w * 0.01, h * 0.74]], {
    color: '#3a3f38',
    width: 0.8,
    alpha: 0.22,
    seed: seed + 93,
    wobble: 0.3,
    dry: 0.4,
    layers: 1,
    taper: false,
    step: 5,
  });

  /* 白墙黑瓦与独栋小楼混排：沿两条路摆，谁也不对齐 */
  houseRow(ctx, {
    seed: seed + 500,
    alpha: 0.5,
    tone: '#f4efe4',
    toneAlpha: 0.88,
    list: [
      [w * 0.148, h * 0.548, 24, 0],
      [w * 0.19, h * 0.536, 21, 1],
      [w * 0.252, h * 0.546, 22, 0],
      [w * 0.288, h * 0.56, 20, 0],
      [w * 0.128, h * 0.628, 23, 0],
      [w * 0.166, h * 0.646, 20, 1],
      [w * 0.262, h * 0.636, 21, 0],
      [w * 0.3, h * 0.652, 19, 1],
      [w * 0.2, h * 0.694, 22, 0],
      [w * 0.246, h * 0.712, 18, 0],
    ],
  });

  /* 小楼：方盒子，两层，平顶。混在瓦房里，一眼能看出新与旧 */
  const blockHouse = (x, y, s, sd) => {
    inkStroke(
      ctx,
      [[x - s * 0.34, y], [x - s * 0.34, y - s * 0.62], [x + s * 0.36, y - s * 0.6], [x + s * 0.36, y]],
      { color: '#3a3f38', width: Math.max(1, s * 0.055), alpha: 0.46, seed: sd, wobble: 0.22, dry: 0.1, layers: 2, taper: false, step: 3 }
    );
    inkStroke(ctx, [[x - s * 0.4, y - s * 0.62], [x + s * 0.42, y - s * 0.6]], {
      color: '#2b2f2b',
      width: Math.max(1, s * 0.06),
      alpha: 0.42,
      seed: sd + 2,
      wobble: 0.2,
      dry: 0.12,
      layers: 1,
      taper: false,
      step: 3,
    });
    inkStroke(ctx, [[x - s * 0.34, y - s * 0.34], [x + s * 0.36, y - s * 0.33]], {
      color: '#5a625b',
      width: 0.8,
      alpha: 0.3,
      seed: sd + 4,
      wobble: 0.2,
      dry: 0.2,
      layers: 1,
      taper: false,
      step: 3,
    });
    for (let k = 0; k < 2; k++) {
      inkStroke(ctx, [[x - s * 0.2 + k * s * 0.28, y - s * 0.28], [x - s * 0.2 + k * s * 0.28, y - s * 0.16]], {
        color: '#3a3f38',
        width: Math.max(1, s * 0.05),
        alpha: 0.3,
        seed: sd + 10 + k,
        wobble: 0.1,
        dry: 0,
        layers: 1,
        taper: false,
        step: 2,
      });
    }
  };
  blockHouse(w * 0.222, h * 0.6, 26, seed + 540);
  blockHouse(w * 0.176, h * 0.588, 22, seed + 545);
  blockHouse(w * 0.278, h * 0.6, 20, seed + 549);

  /* 村里的绿化：沿路、沿渠，密得很，但不排成线 */
  treeGroup(ctx, { x: w * 0.108, y: h * 0.575, size: 38, count: 3, spread: 0.6, seed: seed + 601, color: '#2f3a29', alpha: 0.36, canopyAlpha: 0.12, shape: 'mixed' });
  treeGroup(ctx, { x: w * 0.318, y: h * 0.585, size: 34, count: 3, spread: 0.55, seed: seed + 611, color: '#37432f', alpha: 0.3, canopyAlpha: 0.1 });
  treeGroup(ctx, { x: w * 0.214, y: h * 0.735, size: 30, count: 3, spread: 0.6, seed: seed + 617, color: '#37432f', alpha: 0.26, canopyAlpha: 0.09 });
  treeGroup(ctx, { x: w * 0.086, y: h * 0.66, size: 32, count: 2, spread: 0.5, seed: seed + 621, color: '#3f4a38', alpha: 0.26, canopyAlpha: 0.09 });
  treeGroup(ctx, { x: w * 0.352, y: h * 0.66, size: 28, count: 2, spread: 0.45, seed: seed + 625, color: '#4a544a', alpha: 0.2, canopyAlpha: 0.07 });

  /* 环外的苗木基地：成行成列的平行细线，一行一行往远处收 */
  const nursery = (x0, x1, yTop, yBot, rows, sd, alpha) => {
    const r = mulberry32(sd);
    for (let i = 0; i < rows; i++) {
      const t = i / (rows - 1);
      const y = yTop + (yBot - yTop) * Math.pow(t, 1.1);
      const shrink = 0.45 + t * 0.6;
      const lx = x0 + (1 - shrink) * (x1 - x0) * 0.5;
      const rx = x1 - (1 - shrink) * (x1 - x0) * 0.5;
      inkStroke(ctx, softEdge(lx, rx, y, h * 0.0016, sd + i * 7, 18), {
        color: '#5a625b',
        width: 0.7 + t * 0.6,
        alpha: alpha * (0.5 + t * 0.6),
        seed: sd + 10 + i * 5,
        wobble: 0.35,
        dry: 0.34,
        layers: 1,
        taper: false,
        step: 4,
      });
      // 苗木：一排小竖笔，间距均匀，这是人工的秩序
      const n = 12 + Math.round(t * 8);
      for (let k = 0; k < n; k++) {
        const u = (k + 0.5) / n;
        const x = lx + (rx - lx) * u + (r() - 0.5) * 1.2;
        const hs = h * (0.006 + t * 0.012);
        inkStroke(ctx, [[x, y], [x, y - hs]], {
          color: '#4d5c3d',
          width: Math.max(0.7, hs * 0.18),
          alpha: alpha * (0.8 + t * 0.5),
          seed: sd + 60 + i * 31 + k,
          wobble: 0.08,
          dry: 0,
          layers: 1,
          taper: true,
          step: 2,
        });
      }
    }
  };
  nursery(w * 0.4, w * 0.62, h * 0.45, h * 0.56, 5, seed + 700, 0.24);
  nursery(w * 0.02, w * 0.2, h * 0.412, h * 0.472, 4, seed + 740, 0.22);
  nursery(w * 0.05, w * 0.34, h * 0.79, h * 0.95, 6, seed + 780, 0.26);

  /* 更远的农田：几道横垄，横着划过去 */
  for (let i = 0; i < 5; i++) {
    const y = h * (0.4 + i * 0.014);
    inkStroke(ctx, softEdge(-w * 0.02, w * 0.56, y, h * 0.0014, seed + 820 + i, 20), {
      color: '#7c9160',
      width: 0.8,
      alpha: 0.18,
      seed: seed + 830 + i,
      wobble: 0.4,
      dry: 0.4,
      layers: 1,
      taper: false,
      step: 4,
    });
  }

  /* 前景：左下角一株树，压住整个画面 */
  treeShape(ctx, w * 0.026, h * 1.04, {
    size: 168,
    seed: seed + 901,
    color: '#1f271c',
    alpha: 0.46,
    canopy: '#333f2c',
    canopyAlpha: 0.18,
    lean: 0.14,
  });
  treeGroup(ctx, { x: w * 0.12, y: h * 1.0, size: 44, count: 3, spread: 0.55, seed: seed + 921, color: '#37432f', alpha: 0.28, canopyAlpha: 0.1, shape: 'mixed' });
  groundWash(ctx, { w, y0: h * 0.955, y1: h * 1.02, color: '#5d6b4b', alpha: 0.16, seed: seed + 931, x0: 0, x1: 0.38 });
}

/* ══════════════════════════════════════════════════════════
   场景注册表
   ══════════════════════════════════════════════════════════ */

export const SCENES = {
  yucun: sceneYucun,
  xiajiang: sceneXiajiang,
  qianjiangyuan: sceneQianjiangyuan,
  yunhe: sceneYunhe,
  pujiang: scenePujiang,
  xinxinqiao: sceneXinxinqiao,
  xixi: sceneXixi,
  dachendao: sceneDachendao,
  sangji: sceneSangji,
  tengtou: sceneTengtou,
};

/** 渲染到 canvas（等比、不拉伸） */
export function renderScene(canvas, key, dpr = 1) {
  const fn = SCENES[key];
  if (!fn) return;

  const rect = canvas.getBoundingClientRect();
  const w = Math.max(rect.width, 320);
  const h = Math.max(rect.height, 220);

  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);

  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  ctx.fillStyle = '#f4efe4';
  ctx.fillRect(0, 0, w, h);

  inVirtual(ctx, w, h, fn, key.charCodeAt(0) * 97 + 1001);
}

/** 供 app.js 直接把场景画到任意上下文 */
export function paintScene(ctx, key, w, h, seed) {
  const fn = SCENES[key];
  if (!fn) return;
  inVirtual(ctx, w, h, fn, seed ?? key.charCodeAt(0) * 97 + 1001);
}

/* ══════════════════════════════════════════════════════════
   账本游戏的山景
   ══════════════════════════════════════════════════════════ */

export function drawLedgerMountain(canvas, s = {}) {
  if (!canvas || !canvas.isConnected) return;
  const { mountain: health100 = 100, mineDepth = 0, mode = 'mine', seed = 9001 } = s;
  const rnd = mulberry32(seed);
  const health = Math.max(0, Math.min(100, health100)) / 100;

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const rect = canvas.getBoundingClientRect();
  const W = Math.max(rect.width, 260);
  const H = Math.max(rect.height, 220);
  if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#f4efe4';
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  const sc = H / UNIT_H;
  const vw = W / sc;
  const vh = UNIT_H;
  ctx.scale(sc, sc);
  ctx.__inkGain = Math.max(1, Math.min(2.4, sc * 1.5));

  const sky = ctx.createLinearGradient(0, 0, 0, vh * 0.66);
  sky.addColorStop(0, hexA(health > 0.5 ? '#dfe8e4' : '#e6dcc6', 0.72));
  sky.addColorStop(1, hexA('#f4efe4', 0));
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, vw, vh * 0.66);

  cloudBand(ctx, vw * 0.08, vh * 0.1, vw * 0.34, {
    alpha: health > 0.6 ? 0.6 : 0.4,
    seed: seed + 5,
  });

  // 山：健康越差，脊线越碎、色越赭
  const topY = vh * 0.46;
  const amp = vh * (0.19 + (1 - health) * 0.05);
  const pts = ridge(vw, topY, amp, seed + 11, 2.2, 96);
  const broken = pts.map(([x, y], i) => {
    const t = i / (pts.length - 1);
    if (t > 0.2 && t < 0.5 && mineDepth > 0.05) {
      return [x, y + (rnd() - 0.5) * amp * 0.3 * mineDepth];
    }
    return [x, y];
  });

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(broken[0][0], broken[0][1]);
  for (let i = 1; i < broken.length; i++) ctx.lineTo(broken[i][0], broken[i][1]);
  ctx.lineTo(vw, vh);
  ctx.lineTo(0, vh);
  ctx.closePath();
  const g = ctx.createLinearGradient(0, topY - amp, 0, vh);
  const tone = health > 0.5 ? '#7c9160' : '#b1813f';
  g.addColorStop(0, hexA(tone, 0.07 + health * 0.15));
  g.addColorStop(0.5, hexA(tone, 0.05 + health * 0.1));
  g.addColorStop(1, hexA(tone, 0.02 + health * 0.05));
  ctx.fillStyle = g;
  ctx.fill();
  ctx.restore();

  inkStroke(ctx, broken, {
    color: health > 0.5 ? '#2b2f2b' : '#5c4526',
    width: 2,
    alpha: 0.56,
    seed: seed + 13,
    wobble: 1,
    dry: 0.12,
    layers: 2,
    taper: false,
  });

  if (mineDepth > 0.02) {
    pit(ctx, vw * 0.31, vh * 0.72, {
      r: vw * 0.12,
      depth: Math.min(1, mineDepth),
      seed: seed + 21,
      alpha: 0.5,
      color: '#8a6733',
    });
  }

  haze(ctx, vw, vh * 0.72, { alpha: 0.7, seed: seed + 31, height: vh * 0.06 });

  // 树：健康好才有
  const treeCount = Math.round(health * 6);
  for (let i = 0; i < treeCount; i++) {
    const x = vw * (0.5 + (i / Math.max(treeCount, 1)) * 0.44 + rnd() * 0.02);
    const y = vh * (0.78 + rnd() * 0.06);
    treeShape(ctx, x, y, {
      size: 34 + rnd() * 26,
      seed: seed + 100 + i * 17,
      color: '#2f3a29',
      alpha: 0.24 + health * 0.36,
      canopy: '#3f4a38',
      canopyAlpha: 0.1 + health * 0.12,
      shape: i % 3 === 0 ? 'pine' : 'round',
    });
  }

  water(ctx, vw * 0.02, vh * 0.9, vh * 0.98, {
    seed: seed + 41,
    rows: 3,
    alpha: 0.12 + health * 0.14,
  });

  ctx.save();
  ctx.fillStyle = 'rgba(90,98,91,0.5)';
  ctx.font = '11px "Kaiti SC", KaiTi, 楷体, serif';
  ctx.textAlign = 'left';
  const label =
    mode === 'mine' ? '开采中' : mode === 'restore' ? '休养中' : mode === 'bamboo' ? '竹林' : '生态产业';
  ctx.fillText(label, 14, 24);
  ctx.restore();

  ctx.restore();
}

/* ══════════════════════════════════════════════════════════
   账本全景：一亩山从 2005 到 2025

   和上面那个小尺寸的 drawLedgerMountain 不同，这一幅是全幅的，
   而且要把「累积的痕迹」画出来：矿坑随开采年份变深变宽，
   村舍随收入增减，树随山体恢复长回来。
   ══════════════════════════════════════════════════════════ */

/**
 * @param {object} s
 *   year, health 0-100, mineDepth 0-1, reserve 0-100,
 *   cash 当年村集体收入（万元）, closed 是否已关矿
 */
export function drawLedgerPanorama(canvas, s = {}) {
  if (!canvas || !canvas.isConnected) return;

  const {
    year = 2005,
    health = 100,
    mineDepth = 0,
    cash = 320,
    closed = false,
    seed = 9001,
  } = s;

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const rect = canvas.getBoundingClientRect();
  const W = Math.max(rect.width, 320);
  const H = Math.max(rect.height, 260);
  if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
  }

  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);

  const rnd = mulberry32(seed);
  const hp = Math.max(0, Math.min(100, health)) / 100;
  const soot = Math.min(1, mineDepth * (1 - hp * 0.5));

  // 天空：从浑浊到清透
  const sky = ctx.createLinearGradient(0, 0, 0, H * 0.62);
  sky.addColorStop(0, hexA(blend('#d8cdb2', '#dfe9e4', hp), 0.9));
  sky.addColorStop(1, hexA('#f4efe4', 0));
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H * 0.66);

  // 粉尘云：开采期才有
  if (soot > 0.12) {
    for (let i = 0; i < 3; i++) {
      mistBand(
        ctx,
        { x: W * (0.06 + i * 0.3), y: H * (0.1 + rnd() * 0.14), w: W * 0.34, h: H * 0.16 },
        { color: '#b8a271', alpha: 0.3 * soot, seed: seed + 7 + i * 13, bands: 2 }
      );
    }
  }

  // 远山
  {
    const far = ridge(W, H * 0.42, H * 0.065, seed + 3, 3, 120);
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(far[0][0], far[0][1]);
    for (let i = 1; i < far.length; i++) ctx.lineTo(far[i][0], far[i][1]);
    ctx.lineTo(W, H * 0.7);
    ctx.lineTo(0, H * 0.7);
    ctx.closePath();
    ctx.fillStyle = hexA('#8b9484', 0.1 + hp * 0.06);
    ctx.fill();
    ctx.restore();
    inkStroke(ctx, far, {
      color: '#7b8478',
      width: 1.1,
      alpha: 0.22,
      seed: seed + 5,
      wobble: 0.8,
      dry: 0.3,
      layers: 1,
      taper: false,
    });
  }

  // 主山
  const topY = H * 0.46;
  const amp = H * 0.2;
  const pts = ridge(W, topY, amp, seed + 11, 2.2, 110);

  // 山体的伤：开采最狠的地方整块塌下去
  const broken = pts.map(([x, y], i) => {
    const t = i / (pts.length - 1);
    if (t > 0.24 && t < 0.56) {
      const dip = Math.sin(((t - 0.24) / 0.32) * Math.PI) * amp * 1.15 * mineDepth;
      return [x, y + dip + (rnd() - 0.5) * amp * 0.12 * mineDepth];
    }
    return [x, y];
  });

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(broken[0][0], broken[0][1]);
  for (let i = 1; i < broken.length; i++) ctx.lineTo(broken[i][0], broken[i][1]);
  ctx.lineTo(W, H);
  ctx.lineTo(0, H);
  ctx.closePath();
  const g = ctx.createLinearGradient(0, topY - amp, 0, H);
  const tone = hp > 0.5 ? '#7c9160' : '#b1813f';
  g.addColorStop(0, hexA(tone, 0.08 + hp * 0.16));
  g.addColorStop(0.55, hexA(tone, 0.05 + hp * 0.1));
  g.addColorStop(1, hexA(tone, 0.02 + hp * 0.04));
  ctx.fillStyle = g;
  ctx.fill();
  ctx.restore();

  inkStroke(ctx, broken, {
    color: hp > 0.5 ? '#2b2f2b' : '#5c4526',
    width: 2.1,
    alpha: 0.5 + hp * 0.1,
    seed: seed + 13,
    wobble: 1,
    dry: 0.12,
    layers: 2,
    taper: false,
  });

  // 矿坑：随深度变宽变深，位置在山腰
  if (mineDepth > 0.03) {
    /* 半径别跟着深度线性放大到失控：
       挖满时坑要显眼，但不能把整座山吞掉。 */
    pit(ctx, W * 0.33, H * 0.645, {
      r: W * (0.085 + mineDepth * 0.075),
      depth: Math.min(1, mineDepth),
      seed: seed + 21,
      alpha: 0.55 + mineDepth * 0.22,
      color: '#8a6733',
    });
    // 坑口的碎石：挖一年堆一年
    for (let i = 0; i < Math.round(mineDepth * 8); i++) {
      rockCluster(ctx, W * (0.24 + rnd() * 0.2), H * (0.7 + rnd() * 0.055), {
        seed: seed + 300 + i * 23,
        size: 6 + rnd() * 10,
        alpha: 0.3,
        color: '#7a5a2c',
      });
    }
  }

  haze(ctx, W, H * 0.74, { alpha: 0.6 - mineDepth * 0.2, seed: seed + 31, height: H * 0.055 });

  /* 山脚缓坡：山体只填到 0.7H，村落在 0.84H 才开始，
     中间那一段原来是空的，看着像断层。补一层坡把两者接上。 */
  const slopeY = H * 0.7;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(0, slopeY + H * 0.01);
  ctx.bezierCurveTo(W * 0.3, slopeY - H * 0.012, W * 0.66, slopeY + H * 0.022, W, slopeY - H * 0.006);
  ctx.lineTo(W, H * 0.86);
  ctx.lineTo(0, H * 0.86);
  ctx.closePath();
  const sg = ctx.createLinearGradient(0, slopeY, 0, H * 0.86);
  sg.addColorStop(0, hexA(hp > 0.5 ? '#8fa07a' : '#b9a675', 0.16));
  sg.addColorStop(1, hexA(hp > 0.5 ? '#8fa07a' : '#b9a675', 0.07));
  ctx.fillStyle = sg;
  ctx.fill();
  ctx.restore();

  // 坡上的等高线：几道顺着地形的横线，把中间这块撑住
  for (let i = 0; i < 4; i++) {
    const y = H * (0.735 + i * 0.028);
    inkStroke(
      ctx,
      [
        [W * 0.03, y],
        [W * 0.34, y + (rnd() - 0.5) * 4],
        [W * 0.68, y + (rnd() - 0.5) * 3],
        [W * 0.97, y + (rnd() - 0.5) * 4],
      ],
      {
        color: '#7b8478',
        width: 0.9,
        alpha: 0.1,
        seed: seed + 640 + i * 13,
        wobble: 0.8,
        dry: 0.42,
        layers: 1,
        taper: false,
      }
    );
  }

  // 树：健康才长得回来
  const treeCount = Math.round(hp * 11);
  for (let i = 0; i < treeCount; i++) {
    const x = W * (0.52 + (i / Math.max(treeCount, 1)) * 0.45 + rnd() * 0.025);
    const y = H * (0.79 + rnd() * 0.06);
    treeShape(ctx, x, y, {
      size: 26 + rnd() * 30,
      seed: seed + 100 + i * 17,
      color: '#2f3a29',
      alpha: 0.22 + hp * 0.4,
      canopy: '#3f4a38',
      canopyAlpha: 0.09 + hp * 0.13,
      shape: i % 3 === 0 ? 'pine' : 'round',
    });
  }

  // 村舍：收入越高房子越多。这是「账本」落到具体人家的地方
  // 2005 年起点收入 320 万，是当年安吉的首富村，房子该是成片的
  const houses = Math.max(3, Math.min(16, Math.round((cash / 320) * 11)));
  for (let i = 0; i < houses; i++) {
    const col = i % 6;
    const row = Math.floor(i / 6);
    const hx = W * (0.045 + col * 0.058 + rnd() * 0.012);
    const hy = H * (0.845 + row * 0.048 + rnd() * 0.008);
    house(ctx, hx, hy, {
      size: 16 + rnd() * 6,
      color: closed ? '#3a3f38' : '#4a4034',
      alpha: 0.44 + hp * 0.18,
      seed: seed + 500 + i * 11,
      flip: rnd() > 0.5,
    });
  }

  // 田：村子周围总有地，几道横向的垄
  for (let i = 0; i < 5; i++) {
    const y = H * (0.9 + i * 0.02);
    inkStroke(
      ctx,
      [
        [W * 0.03, y],
        [W * 0.2, y + (rnd() - 0.5) * 2],
        [W * 0.33, y],
      ],
      {
        color: hp > 0.5 ? '#7c9160' : '#a08a5c',
        width: 1,
        alpha: 0.2,
        seed: seed + 720 + i * 7,
        wobble: 0.5,
        dry: 0.3,
        layers: 1,
        taper: false,
      }
    );
  }

  water(ctx, 0, H * 0.93, H * 0.995, {
    seed: seed + 41,
    rows: 3,
    alpha: 0.1 + hp * 0.14,
  });

  /* 左上角的状态标签。
     原来画在 y=30，canvas 顶部会被覆盖层的顶栏压住一点，
     文字上半截被裁，看着像乱码。这里下移到安全区。 */
  ctx.save();
  ctx.fillStyle = 'rgba(90,98,91,0.62)';
  ctx.font = '13px "Kaiti SC", KaiTi, 楷体, serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const label = closed
    ? hp > 0.72
      ? '山养回来了'
      : hp > 0.42
        ? '还在缓'
        : '刚停下'
    : mineDepth > 0.5
      ? '山一直在被挖'
      : '还在开采';
  ctx.fillText(label, 26, 46);
  ctx.restore();

  seal(ctx, W - 40, H - 38, {
    size: 38,
    text: year >= 2025 ? '合' : '账',
    color: '#9d3a30',
    alpha: 0.22,
    seed: 9001,
    rotate: -0.05,
  });
}

/** 两个十六进制色按 t 混合 */
function blend(a, b, t) {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ra = (pa >> 16) & 255;
  const ga = (pa >> 8) & 255;
  const ba = pa & 255;
  const rb = (pb >> 16) & 255;
  const gb = (pb >> 8) & 255;
  const bb = pb & 255;
  const k = Math.max(0, Math.min(1, t));
  const to = (v) => Math.round(v).toString(16).padStart(2, '0');
  return `#${to(ra + (rb - ra) * k)}${to(ga + (gb - ga) * k)}${to(ba + (bb - ba) * k)}`;
}
