/**
 * brush.js — 程序化水墨笔触原语
 *
 * 设计目标：让每一根线都像是手画出来的，而不是矢量算出来的。
 * 手绘感的三个来源：
 *   1. 线条抖动   —— 沿法向叠加低频正弦，形成自然的弯曲
 *   2. 墨色浓淡   —— 同一笔画用多层不同宽度/透明度叠压，模拟提按
 *   3. 断续飞白   —— 沿路径随机打断，断处留白，模拟笔枯
 *
 * 所有随机都来自确定性种子，保证同一 seed 每次渲染完全一致，
 * 这样截图对比、导出 PNG 都能复现。
 */

/* ────────────────────────── 确定性随机 ────────────────────────── */

export function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 由字符串派生稳定种子 */
export function hashSeed(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/* ────────────────────────── 几何工具 ────────────────────────── */

function dist(a, b) {
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
}

/** 沿折线按弧长重采样，返回等距点列 */
function resample(pts, step) {
  const out = [];
  let carry = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const d = dist(a, b);
    if (d === 0) continue;
    let t = carry;
    while (t < d) {
      const k = t / d;
      out.push([a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]);
      t += step;
    }
    carry = t - d;
  }
  out.push(pts[pts.length - 1]);
  return out;
}

/** 折线平滑（Chaikin 一次迭代） */
export function smooth(pts, iterations = 1) {
  let cur = pts;
  for (let it = 0; it < iterations; it++) {
    if (cur.length < 3) return cur;
    const next = [cur[0]];
    for (let i = 0; i < cur.length - 1; i++) {
      const a = cur[i];
      const b = cur[i + 1];
      next.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25]);
      next.push([a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
    }
    next.push(cur[cur.length - 1]);
    cur = next;
  }
  return cur;
}

/** 把点列写成 path，可选闭合 */
function tracePath(ctx, pts, close = false) {
  if (!pts.length) return;
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  if (close) ctx.closePath();
}

/* ────────────────────────── 核心：一笔 ────────────────────────── */

/**
 * 一条有笔意的线。
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {Array<[number,number]>} points  控制点
 * @param {object} o
 *   color     墨色，默认 '#2b2f2b'
 *   width     主笔画宽度
 *   alpha     主笔画透明度
 *   seed      随机种子（决定抖动和飞白形态）
 *   jitter    抖动幅度（法向像素）
 *   wobble    低频摆动幅度
 *   layers    叠压层数（2-3 层最像运笔）
 *   dry       飞白强度 0-1
 *   step      重采样步长
 *   taper     两端是否收笔（宽度渐变）
 */
export function inkStroke(ctx, points, o = {}) {
  if (!points || points.length < 2) return;
  const {
    color = '#2b2f2b',
    width = 2,
    alpha = 0.9,
    seed = 1,
    jitter = 0.8,
    wobble = 2.2,
    layers = 2,
    dry = 0.18,
    step = 3,
    taper = true,
  } = o;

  // 墨色增益：读当前上下文里的增益系数，叠加进本条笔触的透明度
  const gain = ctx.__inkGain || 1;
  const A = Math.min(1, alpha * gain);

  const rnd = mulberry32(seed);
  const base = resample(points, step);
  if (base.length < 2) return;

  const phase1 = rnd() * Math.PI * 2;
  const phase2 = rnd() * Math.PI * 2;
  const freq1 = 0.012 + rnd() * 0.014;
  const freq2 = 0.05 + rnd() * 0.04;

  // 沿法向叠加摆动，得到实际笔画路径
  const displaced = base.map((p, i) => {
    const prev = base[Math.max(0, i - 1)];
    const next = base[Math.min(base.length - 1, i + 1)];
    let nx = -(next[1] - prev[1]);
    let ny = next[0] - prev[0];
    const len = Math.hypot(nx, ny) || 1;
    nx /= len;
    ny /= len;
    const s = i * step;
    const off =
      Math.sin(s * freq1 + phase1) * wobble +
      Math.sin(s * freq2 + phase2) * jitter * 0.5 +
      (rnd() - 0.5) * jitter;
    return [p[0] + nx * off, p[1] + ny * off];
  });

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = color;

  // 逐层叠压：越下层越宽越淡，模拟水墨洇开
  for (let L = 0; L < layers; L++) {
    const k = layers === 1 ? 0 : L / (layers - 1);
    const lw = width * (1.9 - k * 0.95);
    // 顶层要压到接近满墨，否则轮廓立不住
    const la = A * (0.3 + k * 0.7);

    ctx.globalAlpha = la;
    ctx.lineWidth = lw;

    // 飞白：按段随机断开。断口要稀但长，否则会变成虚线
    if (dry > 0 && L === layers - 1) {
      let run = [];
      let skip = 0;
      for (let i = 0; i < displaced.length; i++) {
        if (skip > 0) {
          skip--;
          if (run.length > 1) {
            ctx.beginPath();
            tracePath(ctx, run);
            ctx.stroke();
          }
          run = [];
          continue;
        }
        // 只有很低的概率起一个断口，断口持续几个采样点
        if (rnd() < dry * 0.12) {
          skip = 1 + Math.floor(rnd() * 2);
          if (run.length > 1) {
            ctx.beginPath();
            tracePath(ctx, run);
            ctx.stroke();
          }
          run = [];
          continue;
        }
        run.push(displaced[i]);
      }
      if (run.length > 1) {
        ctx.beginPath();
        tracePath(ctx, run);
        ctx.stroke();
      }
    } else {
      ctx.beginPath();
      tracePath(ctx, displaced);
      ctx.stroke();
    }
  }

  // 收笔：两端各点一笔，让笔画有起落
  if (taper) {
    ctx.globalAlpha = A * 0.7;
    ctx.lineWidth = width * 0.7;
    const ends = [displaced[0], displaced[displaced.length - 1]];
    for (const e of ends) {
      ctx.beginPath();
      ctx.arc(e[0], e[1], width * 0.42, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    }
  }

  ctx.restore();
}

/* ────────────────────────── 渲染填充 ────────────────────────── */

/**
 * 水墨渲染填充：一块面状区域，颜色由内向外变淡，边缘不齐。
 * 用于省域底色、水面、山体。
 */
export function washFill(ctx, points, o = {}) {
  const {
    color = '#7c9160',
    alpha = 0.14,
    seed = 3,
    edgeJitter = 1.6,
    innerBias = 0.55,
  } = o;

  if (!points || points.length < 3) return;
  const rnd = mulberry32(seed);

  // 边缘做轻微扰动，避免完全平滑的轮廓
  const edge = points.map((p) => [
    p[0] + (rnd() - 0.5) * edgeJitter * 2,
    p[1] + (rnd() - 0.5) * edgeJitter * 2,
  ]);

  // 计算包围盒，用于渐变
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of edge) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const r = Math.max(maxX - minX, maxY - minY) * 0.62;

  ctx.save();
  ctx.beginPath();
  tracePath(ctx, edge, true);
  ctx.clip();

  const g = ctx.createRadialGradient(cx, cy, r * 0.05, cx, cy, r);
  g.addColorStop(0, hexA(color, alpha * (1 + innerBias * 0.6)));
  g.addColorStop(0.55, hexA(color, alpha * 0.85));
  g.addColorStop(1, hexA(color, alpha * 0.25));
  ctx.fillStyle = g;
  ctx.fillRect(minX - 10, minY - 10, maxX - minX + 20, maxY - minY + 20);

  ctx.restore();
}

/** hex + alpha → rgba 字符串 */
export function hexA(hex, a) {
  const h = hex.replace('#', '');
  const n = parseInt(
    h.length === 3
      ? h
          .split('')
          .map((c) => c + c)
          .join('')
      : h,
    16
  );
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/* ────────────────────────── 山石 ────────────────────────── */

/**
 * 山石组：用短折线叠出皴法。
 * 每块石由 3-6 条短笔组成，方向各异，模拟披麻皴。
 */
export function rockCluster(ctx, x, y, o = {}) {
  const {
    w = 60,
    h = 34,
    seed = 7,
    color = '#3a3f38',
    alpha = 0.5,
    strokes = 5,
    width = 1.3,
  } = o;
  const rnd = mulberry32(seed);

  // 主轮廓：一条起伏的弧
  const ridge = [];
  const seg = 7;
  for (let i = 0; i <= seg; i++) {
    const t = i / seg;
    ridge.push([
      x - w / 2 + w * t,
      y - Math.sin(t * Math.PI) * h * (0.7 + rnd() * 0.5) + (rnd() - 0.5) * h * 0.18,
    ]);
  }
  inkStroke(ctx, ridge, {
    color,
    width: width * 1.3,
    alpha: alpha * 0.95,
    seed: seed + 1,
    wobble: 1.3,
    dry: 0.12,
  });

  // 皴：从脊线向下拉短笔
  for (let i = 0; i < strokes; i++) {
    const t = 0.12 + rnd() * 0.76;
    const idx = Math.floor(t * seg);
    const p = ridge[idx];
    const len = h * (0.25 + rnd() * 0.5);
    const dx = (rnd() - 0.5) * w * 0.12;
    inkStroke(
      ctx,
      [
        [p[0], p[1] + 2],
        [p[0] + dx * 0.5, p[1] + len * 0.6],
        [p[0] + dx, p[1] + len],
      ],
      {
        color,
        width: width * 0.62,
        alpha: alpha * 0.62,
        seed: seed + 20 + i * 7,
        wobble: 0.7,
        dry: 0.32,
        layers: 1,
      }
    );
  }
}

/* ────────────────────────── 水 ────────────────────────── */

/**
 * 水波纹：一组平行的断续弧线，越往下越疏。
 */
export function waterLines(ctx, rect, o = {}) {
  const {
    color = '#6d8f8a',
    alpha = 0.34,
    seed = 11,
    rows = 7,
    width = 1,
  } = o;
  const { x, y, w, h } = rect;
  const rnd = mulberry32(seed);

  for (let r = 0; r < rows; r++) {
    const ty = y + (h * (r + 0.5)) / rows;
    const pts = [];
    const seg = 10;
    const amp = 1.6 + rnd() * 2.6;
    const phase = rnd() * Math.PI * 2;
    const span = w * (0.5 + rnd() * 0.45);
    const offset = (w - span) * rnd();
    for (let i = 0; i <= seg; i++) {
      const t = i / seg;
      pts.push([
        x + offset + span * t,
        ty + Math.sin(t * Math.PI * 2.2 + phase) * amp,
      ]);
    }
    inkStroke(ctx, pts, {
      color,
      width,
      alpha,
      seed: seed + r * 13,
      wobble: 0.6,
      dry: 0.3,
      layers: 1,
      taper: false,
      step: 4,
    });
  }
}

/* ────────────────────────── 树 ────────────────────────── */

/**
 * 树丛：墨点聚散。
 * density 越大，点越靠中心聚、越密，树冠感越强；小 density 则更像灌木。
 */
export function treeClump(ctx, x, y, o = {}) {
  const {
    r = 22,
    count = 16,
    seed = 5,
    color = '#3f4a38',
    alpha = 0.42,
    dotR = 2.4,
    density = 1,
  } = o;
  const rnd = mulberry32(seed);

  // 起笔：枝干一笔，把树丛「种」在地上
  if (density > 0.7) {
    inkStroke(ctx, [[x, y + r * 0.55], [x + (rnd() - 0.5) * r * 0.2, y]], {
      color,
      width: Math.max(0.8, r * 0.055),
      alpha: alpha * 0.7,
      seed: seed + 991,
      wobble: 0.4,
      layers: 1,
      dry: 0.16,
      taper: false,
    });
  }

  ctx.save();
  for (let i = 0; i < count; i++) {
    const a = rnd() * Math.PI * 2;
    // density 越高，半径分布越向内集中
    const rr = Math.pow(rnd(), density * 0.7 + 0.3) * r;
    const px = x + Math.cos(a) * rr;
    const py = y + Math.sin(a) * rr * 0.68 - r * 0.18;
    ctx.globalAlpha = alpha * (0.5 + rnd() * 0.7);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(px, py, dotR * (0.5 + rnd() * 0.85) * (density > 0.8 ? 1.15 : 1), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/* ────────────────────────── 屋舍 ────────────────────────── */

/** 极简坡顶屋：两笔屋顶 + 一笔墙 */
export function house(ctx, x, y, o = {}) {
  const { size = 14, color = '#3a3f38', alpha = 0.55, seed = 9, flip = false } = o;
  const s = size;
  const dir = flip ? -1 : 1;
  inkStroke(
    ctx,
    [
      [x - s * 0.5 * dir, y],
      [x, y - s * 0.42],
      [x + s * 0.5 * dir, y],
    ],
    { color, width: 1.1, alpha, seed: seed + 1, wobble: 0.6, layers: 1, dry: 0.1 }
  );
  inkStroke(
    ctx,
    [
      [x - s * 0.42 * dir, y],
      [x - s * 0.42 * dir, y + s * 0.46],
      [x + s * 0.42 * dir, y + s * 0.46],
      [x + s * 0.42 * dir, y],
    ],
    { color, width: 0.9, alpha: alpha * 0.8, seed: seed + 2, wobble: 0.4, layers: 1, dry: 0.1 }
  );
}

/* ────────────────────────── 梯田 ────────────────────────── */

/**
 * 梯田：层层等高弧线，越往上越窄。
 */
export function terrace(ctx, rect, o = {}) {
  const { color = '#7c9160', alpha = 0.4, seed = 13, rows = 12, width = 1 } = o;
  const { x, y, w, h } = rect;
  const rnd = mulberry32(seed);

  for (let r = 0; r < rows; r++) {
    const t = r / rows;
    const ty = y + h * t;
    const shrink = t * 0.28;
    const pts = [];
    const seg = 9;
    const waveA = 2 + rnd() * 3.5;
    const phase = rnd() * 6.28;
    for (let i = 0; i <= seg; i++) {
      const u = i / seg;
      const px = x + w * (shrink * 0.5 + (1 - shrink) * u);
      const py = ty + Math.sin(u * Math.PI * 1.6 + phase) * waveA * (0.5 + t * 0.7);
      pts.push([px, py]);
    }
    inkStroke(ctx, pts, {
      color,
      width,
      alpha: alpha * (0.55 + t * 0.55),
      seed: seed + r * 11,
      wobble: 0.5,
      dry: 0.22,
      layers: 1,
      taper: false,
      step: 4,
    });
  }
}

/* ────────────────────────── 矿坑 ────────────────────────── */

/**
 * 矿坑：环形阶梯切口，中心深赭石色。
 * depth 0-1 控制深度。
 */
export function pit(ctx, x, y, o = {}) {
  const { r = 40, depth = 0.7, seed = 17, color = '#b1813f', alpha = 0.55 } = o;
  const rnd = mulberry32(seed);

  // 中心填色
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(x, y, r * 0.55, r * 0.34, 0, 0, Math.PI * 2);
  const g = ctx.createRadialGradient(x, y, 1, x, y, r * 0.55);
  g.addColorStop(0, hexA(color, alpha * depth * 0.85));
  g.addColorStop(1, hexA(color, 0));
  ctx.fillStyle = g;
  ctx.fill();
  ctx.restore();

  // 阶梯环
  const rings = 4;
  for (let i = 0; i < rings; i++) {
    const t = i / rings;
    const rr = r * (0.3 + t * 0.7);
    const pts = [];
    const seg = 14;
    const phase = rnd() * 6.28;
    for (let k = 0; k <= seg; k++) {
      const a = (k / seg) * Math.PI * 2;
      const jitter = 1 + (rnd() - 0.5) * 0.13;
      pts.push([
        x + Math.cos(a + phase) * rr * jitter,
        y + Math.sin(a + phase) * rr * 0.62 * jitter,
      ]);
    }
    inkStroke(ctx, pts, {
      color: '#7a5a2c',
      width: 0.9,
      alpha: alpha * (0.9 - t * 0.35) * (0.5 + depth * 0.7),
      seed: seed + i * 9,
      wobble: 0.5,
      dry: 0.28,
      layers: 1,
      taper: false,
      step: 4,
    });
  }
}

/* ────────────────────────── 云气 ────────────────────────── */

/** 云气：淡墨横向扫过的柔和团块 */
export function mistBand(ctx, rect, o = {}) {
  const { color = '#ffffff', alpha = 0.5, seed = 23, bands = 3 } = o;
  const { x, y, w, h } = rect;
  const rnd = mulberry32(seed);
  ctx.save();
  for (let i = 0; i < bands; i++) {
    const cy = y + h * (0.2 + rnd() * 0.7);
    const cx = x + w * rnd();
    const rx = w * (0.18 + rnd() * 0.3);
    const ry = h * (0.04 + rnd() * 0.08);
    const g = ctx.createRadialGradient(cx, cy, 1, cx, cy, Math.max(rx, ry));
    g.addColorStop(0, hexA(color, alpha * (0.5 + rnd() * 0.5)));
    g.addColorStop(0.6, hexA(color, alpha * 0.4));
    g.addColorStop(1, hexA(color, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/* ────────────────────────── 印章 ────────────────────────── */

/** 印章：朱砂方框 + 竖排文字，边缘残破 */
export function seal(ctx, x, y, o = {}) {
  const {
    size = 46,
    text = '两山二十年',
    color = '#9d3a30',
    alpha = 0.86,
    seed = 31,
    rotate = -0.03,
    font = '"Kaiti SC", KaiTi, 楷体, serif',
  } = o;
  const rnd = mulberry32(seed);

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotate);

  // 底：略不规则的红块
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  const pad = 2;
  ctx.beginPath();
  const corners = [
    [-size / 2 + pad, -size / 2 + pad],
    [size / 2 - pad, -size / 2 + pad],
    [size / 2 - pad, size / 2 - pad],
    [-size / 2 + pad, size / 2 - pad],
  ];
  corners.forEach(([cx, cy], i) => {
    const jx = cx + (rnd() - 0.5) * 3;
    const jy = cy + (rnd() - 0.5) * 3;
    if (i === 0) ctx.moveTo(jx, jy);
    else ctx.lineTo(jx, jy);
  });
  ctx.closePath();
  ctx.fill();

  // 字：挖白
  ctx.globalCompositeOperation = 'destination-out';
  const chars = [...text];
  const fs = Math.min((size * 0.74) / Math.max(chars.length, 2), size * 0.3);
  ctx.font = `600 ${fs}px ${font}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const totalH = fs * chars.length * 1.06;
  chars.forEach((ch, i) => {
    const cw = size * 0.52;
    const cy = -totalH / 2 + fs * 0.53 + i * fs * 1.06;
    ctx.fillText(ch, 0, cy);
    // 让字形有磨损
    if (rnd() > 0.55) {
      ctx.globalAlpha = alpha * 0.35;
      ctx.fillRect(-size / 2, cy - fs * 0.1, size, fs * 0.16);
      ctx.globalAlpha = alpha;
    }
  });
  ctx.globalCompositeOperation = 'source-over';

  // 外框
  ctx.globalAlpha = alpha * 0.55;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.2;
  ctx.strokeRect(-size / 2 + pad + 1.4, -size / 2 + pad + 1.4, size - pad * 2 - 2.8, size - pad * 2 - 2.8);

  ctx.restore();
}

/* ────────────────────────── 手绘线（分隔） ────────────────────────── */

/** 一条横向的手绘分隔线，供 DOM 用（返回 SVG 字符串） */
export function handLineSVG(width, o = {}) {
  const { color = '#c3c6bd', seed = 41, height = 8 } = o;
  const rnd = mulberry32(seed);
  const seg = 24;
  let d = '';
  for (let i = 0; i <= seg; i++) {
    const x = (width * i) / seg;
    const y = height / 2 + Math.sin(i * 1.7 + rnd()) * 1.6 + (rnd() - 0.5) * 1.2;
    d += i === 0 ? `M${x.toFixed(1)},${y.toFixed(1)}` : `L${x.toFixed(1)},${y.toFixed(1)}`;
  }
  return `<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" style="display:block;width:100%;height:${height}px"><path d="${d}" fill="none" stroke="${color}" stroke-width="1" stroke-linecap="round"/></svg>`;
}

/* ────────────────────────── 宣纸纹理 ────────────────────────── */

/** 在给定 canvas 上铺一层噪声，模拟宣纸纤维 */
export function paperGrain(ctx, w, h, o = {}) {
  const { alpha = 0.055, scale = 1, seed = 77 } = o;
  const rnd = mulberry32(seed);
  const step = Math.max(2, Math.round(2 / scale));
  ctx.save();
  ctx.globalAlpha = alpha;
  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      const v = rnd();
      if (v > 0.72) {
        ctx.fillStyle = v > 0.9 ? '#7a6f58' : '#a99e86';
        ctx.fillRect(x, y, step * 0.7, step * 0.7);
      }
    }
  }
  ctx.restore();
}
