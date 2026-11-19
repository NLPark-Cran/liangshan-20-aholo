/**
 * inkfig.js — 水墨图元 v2
 *
 * 这一版的三个根本改变：
 *
 * 1. 雾不再是「画上去的白」。
 *    整个场景先画在一层透明墨层上，雾是用 destination-out 把墨擦掉。
 *    宣纸自己承担雾，所以永远没有白色硬边。
 *
 * 2. 山形不再随机生成。
 *    随机只能得到「丘陵」。每座山由控制点剖面（knots）单调三次插值成形，
 *    构图由场景决定：哪边是断崖、哪边化进雾里，都写在剖面里。
 *
 * 3. 树用点叶法。
 *    干与枝是渐细的带（ribbon），叶是从枝梢散出的成组短点。
 *    叶点压住枝梢，冠与干自然长在一起，不会「一根棍顶一团棉花」。
 */

import { inkStroke, mulberry32, hexA } from './brush.js';
import { ridgeLine } from './inkcurve.js';

/* ────────────────────────── 剖面 ────────────────────────── */

/**
 * 单调三次插值（Fritsch–Carlson），不会过冲。
 * knots: [[t, h, 'lin'?], ...]  t 递增，h 为相对高度
 * 第三个元素写 'lin' 时，从**前一个**控制点到本点的这一段是直线（做断崖用）
 */
export function sampleProfile(knots, n = 140) {
  const xs = knots.map((k) => k[0]);
  const ys = knots.map((k) => k[1]);
  const N = xs.length;
  if (N === 1) return Array.from({ length: n + 1 }, (_, i) => [i / n, ys[0]]);

  const d = [];
  for (let i = 0; i < N - 1; i++) d[i] = (ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i] || 1e-6);
  const m = new Array(N);
  m[0] = d[0];
  m[N - 1] = d[N - 2];
  for (let i = 1; i < N - 1; i++) {
    m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  }
  for (let i = 0; i < N - 1; i++) {
    if (d[i] === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = m[i] / d[i];
    const b = m[i + 1] / d[i];
    const s = a * a + b * b;
    if (s > 9) {
      const tau = 3 / Math.sqrt(s);
      m[i] = tau * a * d[i];
      m[i + 1] = tau * b * d[i];
    }
  }

  const out = [];
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    let i = 0;
    while (i < N - 2 && t > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i] || 1e-6;
    const u = Math.max(0, Math.min(1, (t - xs[i]) / h));
    let v;
    if (knots[i + 1][2] === 'lin') {
      v = ys[i] + (ys[i + 1] - ys[i]) * u;
    } else {
      const u2 = u * u;
      const u3 = u2 * u;
      v =
        (2 * u3 - 3 * u2 + 1) * ys[i] +
        (u3 - 2 * u2 + u) * h * m[i] +
        (-2 * u3 + 3 * u2) * ys[i + 1] +
        (u3 - u2) * h * m[i + 1];
    }
    out.push([t, v]);
  }
  return out;
}

/** 剖面转画布点列 */
export function profilePts(knots, vw, baseY, amp, n = 150) {
  return sampleProfile(knots, n).map(([t, h]) => [vw * t, baseY - h * amp]);
}

/**
 * 一座峰的剖面。
 *
 * 峰顶不放在正中：tilt 让它偏一边，一侧坡长一侧坡短，
 * 这是宋画主峰的样子（马远、夏圭的峰都是偏的）。
 * 副峰用 sub 压低一点，接在主峰旁边。
 */
export function peakKnots(o = {}) {
  const {
    cx = 0.5,
    half = 0.26,
    h = 1,
    tilt = 0,
    leftShoulder = 0.66,
    rightShoulder = 0.56,
    sub = 0,
    seed = 1,
  } = o;
  const rnd = mulberry32(seed);
  const x0 = Math.max(0.001, cx - half);
  const x1 = Math.min(0.999, cx + half);
  const L = Math.max(0.015, cx - x0);
  const R = Math.max(0.015, x1 - cx);
  const sx = Math.min(x1 - R * 0.16, Math.max(x0 + L * 0.16, cx + tilt * half * 0.55));

  const raw = [
    [x0, 0],
    [x0 + L * 0.24, h * leftShoulder * 0.14],
    [x0 + L * 0.56, h * leftShoulder * 0.56],
    [x0 + L * 0.84, h * leftShoulder * 0.9],
    [sx - R * 0.12 - L * 0.1, h * (0.97 - sub * 0.06)],
    [sx, h * (1 - sub * 0.12)],
    [sx + R * 0.16, h * (0.82 - sub * 0.1)],
    [x1 - R * 0.54, h * rightShoulder * 0.58],
    [x1 - R * 0.24, h * rightShoulder * 0.2],
    [x1, 0],
  ];

  // 排序、去重、保证 t 严格递增：剖面插值不能有重复节点
  raw.sort((a, b) => a[0] - b[0]);
  const knots = [];
  let lastT = -1;
  for (const [t0, hh] of raw) {
    const t = Math.min(0.999, Math.max(0.001, t0));
    if (t - lastT < 0.004) continue;
    knots.push([t, Math.max(0, hh) * (0.97 + rnd() * 0.06)]);
    lastT = t;
  }
  if (knots.length < 3) return [[x0, 0], [cx, h], [x1, 0]];
  return knots;
}

/** 沿程浓淡：fade = [[t, factor], ...]，线性过渡 */
function fadeAt(t, fade) {
  if (!fade || !fade.length) return 1;
  if (t <= fade[0][0]) return fade[0][1];
  for (let i = 0; i < fade.length - 1; i++) {
    const a = fade[i];
    const b = fade[i + 1];
    if (t >= a[0] && t <= b[0]) {
      const k = (t - a[0]) / (b[0] - a[0] || 1e-6);
      return a[1] + (b[1] - a[1]) * k * k * (3 - 2 * k);
    }
  }
  return fade[fade.length - 1][1];
}

function slopeAt(pts, i) {
  const a = pts[Math.max(0, i - 1)];
  const b = pts[Math.min(pts.length - 1, i + 1)];
  return (b[1] - a[1]) / (b[0] - a[0] || 1e-6);
}

/* ────────────────────────── 山体 ────────────────────────── */

/**
 * 一块山。
 *
 * 只有块面、脊线、皴、苔点四样东西。脊线按 fade 分段画，
 * 淡的那一段会化进纸里——这是南宋山水的「远」，不是靠加白色。
 */
export function mass(ctx, o = {}) {
  const {
    vw,
    baseY,
    amp,
    knots,
    footY = baseY + amp * 1.5,
    span = null,
    tone = '#7c9160',
    toneAlpha = 0.15,
    lineColor = '#2b2f2b',
    lineAlpha = 0.5,
    lineWidth = 1.8,
    dry = 0.12,
    layers = 1,
    fade = null,
    cun = 0,
    cunLen = 0.3,
    cunAlpha = 0.3,
    moss = 0,
    seed = 1,
    footFade = 0,
    shade = null,
    band = 0.1,
    veins = 0,
    veinDepth = 0.5,
    inner = 0,
  } = o;

  /* 只在 span 这一段里取点：山外的部分不该被填成一条横带 */
  const tA = span ? Math.max(0, span[0]) : 0;
  const tB = span ? Math.min(1, span[1]) : 1;
  /* 剖面已经是密点列时直接用，不再插值（插值会把峰顶的转折圆掉） */
  const dense = knots.length > 60 ? knots : sampleProfile(knots, 420);
  const pts = [];
  for (const [t, hh] of dense) {
    if (t < tA - 1e-6 || t > tB + 1e-6) continue;
    pts.push([vw * t, baseY - hh * amp]);
  }
  if (pts.length < 3) return;

  const rnd = mulberry32(seed);
  const x0 = pts[0][0];
  const x1 = pts[pts.length - 1][0];

  /** 山体轮廓（脊线 + 山脚），填色与裁剪共用。
   *  两端各带一段斜翼，免得脊线落到零高度时画出一条竖直硬边。 */
  const tail = Math.max(10, amp * 0.28);
  const outlinePath = () => {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.lineTo(pts[pts.length - 1][0] + tail, footY);
    ctx.lineTo(pts[0][0] - tail, footY);
    ctx.closePath();
  };

  /* 块面 */
  ctx.save();
  outlinePath();
  const g = ctx.createLinearGradient(0, baseY - amp, 0, footY);
  g.addColorStop(0, hexA(tone, toneAlpha * 1.35));
  g.addColorStop(0.3, hexA(tone, toneAlpha * 0.8));
  g.addColorStop(0.7, hexA(tone, toneAlpha * 0.38));
  g.addColorStop(1, hexA(tone, toneAlpha * 0.05));
  ctx.fillStyle = g;
  ctx.fill();
  ctx.restore();

  /* 脊下一条窄带压深：山脊重，坡面淡，这是块面的分界 */
  if (band > 0) {
    ctx.save();
    outlinePath();
    ctx.clip();
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    for (let i = pts.length - 1; i >= 0; i--) {
      ctx.lineTo(pts[i][0], pts[i][1] + amp * band * (0.6 + 0.8 * (i / pts.length)));
    }
    ctx.closePath();
    ctx.fillStyle = hexA(tone, toneAlpha * 1.6);
    ctx.fill();
    ctx.restore();
  }

  /* 阴面：一侧压深，山才有体积 */
  if (shade) {
    const [t0, t1, amt] = shade;
    ctx.save();
    outlinePath();
    ctx.clip();
    const sx0 = vw * t0;
    const sx1 = vw * t1;
    const sg = ctx.createLinearGradient(sx0, 0, sx1, 0);
    sg.addColorStop(0, hexA(lineColor, amt));
    sg.addColorStop(1, hexA(lineColor, 0));
    ctx.fillStyle = sg;
    const top = baseY - amp * 1.15;
    ctx.fillRect(Math.min(sx0, sx1) - Math.abs(sx1 - sx0) * 0.25, top, Math.abs(sx1 - sx0) * 1.5, footY - top);
    ctx.restore();
  }

  /* 分脉：从峰脊拉下来的几道石纹，把整块山劈成几块 */
  if (veins > 0) {
    let topI = 0;
    for (let i = 0; i < pts.length; i++) if (pts[i][1] < pts[topI][1]) topI = i;
    for (let v = 0; v < veins; v++) {
      const side = v % 2 === 0 ? 1 : -1;
      let start = topI + side * Math.round((0.04 + rnd() * 0.09) * pts.length);
      start = Math.max(1, Math.min(pts.length - 2, start));
      const p0 = pts[start];
      const depth = amp * veinDepth * (0.45 + rnd() * 0.75);
      const drift = side * amp * (0.12 + rnd() * 0.3);
      const path = [];
      const n = 6;
      for (let i = 0; i <= n; i++) {
        const u = i / n;
        path.push([
          p0[0] + drift * u * u + (rnd() - 0.5) * 3,
          p0[1] + depth * u + (rnd() - 0.5) * 2,
        ]);
      }
      inkStroke(ctx, path, {
        color: lineColor,
        width: Math.max(0.8, lineWidth * 0.6),
        alpha: lineAlpha * 0.5 * (0.6 + rnd() * 0.5),
        seed: seed + 700 + v * 23,
        wobble: 1.2,
        jitter: 0.3,
        dry: 0.42,
        layers: 1,
        taper: false,
        step: 4,
      });
    }
  }

  /* 脊线：整条一次画完。
     切段会在接缝处留下折点，峰顶正好落在接缝附近时会画出尖角。 */
  const taperL = tA > 0.004;
  const taperR = tB < 0.996;
  const endTaper = (u) => {
    let f = 1;
    if (taperL && u < 0.1) f *= 0.2 + 0.8 * (u / 0.1);
    if (taperR && u > 0.9) f *= 0.2 + 0.8 * ((1 - u) / 0.1);
    return Math.max(0.03, f);
  };
  {
    const edge = [];
    const n = pts.length - 1;
    for (let i = 0; i <= n; i++) {
      const u = n ? i / n : 0;
      const f = fadeAt(u, fade);
      if (f * endTaper(u) > 0.05) edge.push(pts[i]);
    }
    if (edge.length > 2) {
      // 用二次贝塞尔画，避免密集采样点连成折线在峰顶留下尖角
      ridgeLine(ctx, edge, vw, {
        color: lineColor,
        width: lineWidth,
        alpha: lineAlpha,
        seed: seed + 7,
        dry,
        layers,
      });
    }
  }

  /* 内轮廓：阴面一侧再压一道短脊线，山才有厚度，不是一张剪影 */
  if (inner > 0) {
    let topI = 0;
    for (let i = 0; i < pts.length; i++) if (pts[i][1] < pts[topI][1]) topI = i;
    for (let side = -1; side <= 1; side += 2) {
      const a0 = Math.max(0, Math.min(pts.length - 1, topI + side * Math.round(pts.length * 0.02)));
      const len = Math.round(pts.length * (0.12 + rnd() * 0.1));
      const seg = [];
      for (let i = 0; i <= len; i += 3) {
        const idx = Math.max(0, Math.min(pts.length - 1, a0 + side * i));
        const p = pts[idx];
        // 顺着坡往下偏一点，成一道内脊
        const drop = amp * inner * Math.sin((i / len) * Math.PI * 0.9);
        seg.push([p[0], p[1] + drop + 1]);
      }
      if (seg.length < 2) continue;
      inkStroke(ctx, seg, {
        color: lineColor,
        width: Math.max(0.9, lineWidth * 0.62),
        alpha: lineAlpha * 0.5,
        seed: seed + 880 + side,
        wobble: 1,
        jitter: 0.3,
        dry: 0.4,
        layers: 1,
        taper: false,
        step: 4,
      });
    }
  }

  /* 皴：从峰脊往下拉，沿坡面走，不沿脊线走。
   * 沿脊线画会变成一串挂下来的竖条，像滴水不像皴。 */
  if (cun > 0) {
    let topI = 0;
    for (let i = 0; i < pts.length; i++) if (pts[i][1] < pts[topI][1]) topI = i;
    const groups = Math.max(1, Math.round(cun / 4));
    for (let gi = 0; gi < groups; gi++) {
      const u = 0.1 + (gi / groups) * 0.8 + (rnd() - 0.5) * 0.1;
      const idx = Math.round(u * (pts.length - 1));
      const p = pts[idx];
      const f = fadeAt(u, fade);
      if (f < 0.14) continue;
      // 落笔点偏出峰的一侧：峰左往左拉，峰右往右拉
      const dirX = idx < topI ? -1 : 1;
      const cnt = Math.max(2, Math.round(cun / groups));
      for (let i = 0; i < cnt; i++) {
        const len = amp * cunLen * (0.5 + rnd() * 1.1);
        const x0c = p[0] + (rnd() - 0.5) * amp * 0.06;
        const y0c = p[1] + amp * 0.015 + rnd() * amp * 0.04;
        const drift = dirX * len * (0.22 + rnd() * 0.3);
        inkStroke(
          ctx,
          [
            [x0c, y0c],
            [x0c + drift * 0.45 + (rnd() - 0.5) * 3, y0c + len * 0.5],
            [x0c + drift, y0c + len],
          ],
          {
            color: lineColor,
            width: Math.max(0.7, lineWidth * 0.46),
            alpha: lineAlpha * cunAlpha * f * (0.45 + rnd() * 0.65),
            seed: seed + 300 + gi * 31 + i * 7,
            wobble: 0.7,
            jitter: 0.25,
            dry: 0.46,
            layers: 1,
            taper: false,
            step: 3,
          }
        );
      }
    }
  }

  /* 苔点：压在脊线上，聚一丛最有神；fade 按山自身这一段算 */
  if (moss > 0) {
    const mt = 0.24 + rnd() * 0.4;
    for (let i = 0; i < moss; i++) {
      const u = Math.min(0.97, Math.max(0.03, mt + (rnd() - 0.5) * 0.34));
      const idx = Math.round(u * (pts.length - 1));
      const p = pts[idx];
      const f = fadeAt(u, fade);
      if (f < 0.35) continue;
      // 苔点聚成两三丛，不是沿脊撒胡椒
      const clump = 1 + Math.floor(rnd() * 3);
      for (let c = 0; c < clump; c++) {
        ctx.save();
        ctx.fillStyle = hexA(lineColor, lineAlpha * 0.9 * f * (0.7 + rnd() * 0.4));
        ctx.beginPath();
        ctx.ellipse(
          p[0] + (rnd() - 0.5) * amp * 0.05,
          p[1] - 1 + (rnd() - 0.5) * 4,
          1.6 + rnd() * 1.7,
          1.2 + rnd() * 1.2,
          rnd() * 3,
          0,
          Math.PI * 2
        );
        ctx.fill();
        ctx.restore();
      }
    }
  }

  /* 山脚化开：只擦山体自身，不能横扫整幅 */
  if (footFade > 0) {
    ctx.save();
    outlinePath();
    ctx.clip();
    ctx.globalCompositeOperation = 'destination-out';
    const yy = baseY + (footY - baseY) * 0.6;
    const gg = ctx.createLinearGradient(0, yy, 0, footY);
    gg.addColorStop(0, `rgba(0,0,0,0)`);
    gg.addColorStop(1, `rgba(0,0,0,${footFade})`);
    ctx.fillStyle = gg;
    ctx.fillRect(x0, yy, x1 - x0, footY - yy);
    ctx.restore();
  }
}

/** 旧接口：随机山脊（账本与兼容用） */
export function ridge(w, y, amp, seed, peaks = 3, seg = 96) {
  const rnd = mulberry32(seed);
  const knots = [[0, 0.05]];
  const n = Math.max(2, Math.round(peaks));
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    knots.push([t - 0.14, 0.28 + rnd() * 0.22]);
    knots.push([t, 0.55 + rnd() * 0.45]);
    knots.push([t + 0.14, 0.3 + rnd() * 0.24]);
  }
  knots.push([1, 0.06]);
  knots.sort((a, b) => a[0] - b[0]);
  return sampleProfile(knots, seg).map(([t, h]) => [w * t, y - h * amp]);
}

/**
 * 单峰的剖面：顶点可以不在正中，两坡不对称。
 *
 * 关键在上坡的形状：先缓、后陡，到顶有一个转折。
 * 用正弦或抛物线做剖面，顶端斜率归零，出来一定是「面包」。
 * 这里用 0.55k + 0.45k^2.4，越往上越陡，峰顶才立得住。
 */
function peakHeight(t, pk) {
  const { cx, half, h = 1, tilt = 0 } = pk;
  const x0 = cx - half;
  const x1 = cx + half;
  if (t <= x0 || t >= x1) return 0;

  const apex = Math.min(0.92, Math.max(0.08, 0.52 + tilt * 0.4));
  const u = (t - x0) / (x1 - x0);
  const k = u <= apex ? u / apex : (1 - u) / (1 - apex);

  /* 峰顶必须圆。
     之前用 (foot*k + (crest-foot)*k^crest)/crest，在 k=1 处导数是
     (foot + crest*(crest-foot))/crest，crest=1.9 时等于 1.497，不收敛到 0，
     所以顶点是一道折角，看起来就是尖的三角。
     这里改成 1-(1-k)^p：k=1 时值取 1、导数必为 0，顶点天然圆。
     p 越大越陡（脚缓顶平），p 越小越圆。 */
  const sharp = pk.sharp ?? 1.25;
  const rawP = pk.crest != null ? pk.crest : 1.3 + (sharp - 1) * 1.1;
  const p = Math.min(3.2, Math.max(1.35, rawP));
  let v = 1 - Math.pow(1 - k, p);

  // 左右坡略不等，避免完全对称
  const bias = u <= apex ? 1 : 0.95 + ((Math.abs(tilt) * 10) % 1) * 0.08;
  v *= bias;
  return Math.max(0, Math.min(1, v)) * h;
}

/**
 * 几座峰合成一道山脊：取包络，主峰压住次峰。
 * 峰与峰之间不直接落到零：低处用一道浅的鞍部接起来，
 * 这样山脊是一道连续的脊，不是几个分开的包子。
 */
export function composeRidge(peaks, n = 420) {
  let lo = 1;
  let hi = 0;
  for (const pk of peaks) {
    lo = Math.min(lo, pk.cx - pk.half);
    hi = Math.max(hi, pk.cx + pk.half);
  }
  lo = Math.max(0, lo);
  hi = Math.min(1, hi);

  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    let hh = 0;
    for (const pk of peaks) {
      const v = peakHeight(t, pk);
      if (v > hh) hh = v;
    }
    // 地基的起伏：几条低频正弦，幅度很小，只为把峰脚连起来
    const base =
      0.09 *
      (0.55 + 0.28 * Math.sin(t * 9.1 + 1.7) + 0.14 * Math.sin(t * 21.3 + 0.4));
    hh = Math.max(hh, base);
    // 两端收到零，山才落在纸上，而不是被一刀切断
    const edge = Math.min(1, (t - lo) / 0.035, (hi - t) / 0.035);
    out.push([t, hh * Math.max(0, edge)]);
  }

  /* 轻度平滑：只削峰顶的尖角，山脚和鞍部基本不动。
     包络取 max 会在两峰交界处留下折点，平滑一次就圆了。 */
  const sm = [];
  const R = 3;
  for (let i = 0; i <= n; i++) {
    let sum = 0;
    let wsum = 0;
    for (let k = -R; k <= R; k++) {
      const j = i + k;
      if (j < 0 || j > n) continue;
      const w = R + 1 - Math.abs(k);
      sum += out[j][1] * w;
      wsum += w;
    }
    sm.push([out[i][0], wsum ? sum / wsum : out[i][1]]);
  }
  return sm;
}

/**
 * 一道山脉。主峰 + 次峰，高差写进 peaks 里。
 * 场景只给峰的位置和高度，块面、脊线、皴、分脉由这里负责。
 */
export function mountain(ctx, w, h, o = {}) {
  /* 向后兼容：旧调用方用 ridgeY / y0 / 数字 peaks。
     这些参数在 v1 里存在，v2 改成了 baseY / footY / 对象数组。
     保留兼容层，避免每一个调用点都要改。 */
  if (o.ridgeY !== undefined && o.baseY === undefined) {
    o = { ...o, baseY: o.ridgeY };
  }
  if (o.y0 !== undefined && o.footY === undefined) {
    o = { ...o, footY: o.y0 };
  }
  if (typeof o.peaks === 'number') {
    // 数字 peaks 的意思是「大致几个峰」，转成等距的对象数组
    const n = Math.max(1, Math.round(o.peaks));
    o = {
      ...o,
      peaks: Array.from({ length: n }, (_, i) => ({
        cx: (i + 0.5) / n,
        half: 0.5 / n * 1.35,
        h: 0.72 + ((i * 37) % 29) / 100,
        tilt: ((i % 2) - 0.5) * 0.3,
      })),
    };
  }

  const {
    seed = 1,
    baseY = h * 0.45,
    amp = h * 0.16,
    footY = h,
    peaks = null,
    tone = '#7c9160',
    toneAlpha = 0.16,
    lineColor = '#2b2f2b',
    lineAlpha = 0.55,
    lineWidth = 1.8,
    texture = 3,
    fade = null,
    shade = null,
    footFade = 0.3,
    band = 0.12,
    veins = 2,
    moss = 0,
    knots: givenKnots = null,
    span: givenSpan = null,
  } = o;

  const list = peaks || [
    { cx: 0.5, half: 0.42, h: 1, tilt: 0.1 },
    { cx: 0.78, half: 0.2, h: 0.55, tilt: -0.2 },
  ];

  const knots = givenKnots || composeRidge(list, 480);

  /* 山只占它自己那一段：两端收在峰脚上，山外留纸 */
  let span = givenSpan;
  if (!span) {
    let t0 = 1;
    let t1 = 0;
    for (const pk of list) {
      t0 = Math.min(t0, pk.cx - pk.half);
      t1 = Math.max(t1, pk.cx + pk.half);
    }
    span = [Math.max(0, t0), Math.min(1, t1)];
  }

  mass(ctx, {
    vw: w,
    baseY,
    amp,
    knots,
    footY,
    span,
    tone,
    toneAlpha,
    lineColor,
    lineAlpha,
    lineWidth,
    dry: 0.14,
    layers: 1,
    fade,
    cun: texture * 5,
    cunLen: 0.26,
    cunAlpha: 0.34,
    moss: moss || Math.max(0, Math.round(texture * 1.6)),
    seed,
    footFade,
    shade,
    band,
    veins,
    veinDepth: 0.5,
  });
}

/* ────────────────────────── 树 ────────────────────────── */

/** 一条渐细的墨带：树干、树枝都用它 */
function ribbon(ctx, pts, w0, w1, o = {}) {
  const { color = '#2b2f2b', alpha = 0.7, edge = null } = o;
  if (!pts || pts.length < 2) return;
  const left = [];
  const right = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const prev = pts[Math.max(0, i - 1)];
    const next = pts[Math.min(pts.length - 1, i + 1)];
    let nx = -(next[1] - prev[1]);
    let ny = next[0] - prev[0];
    const L = Math.hypot(nx, ny) || 1;
    nx /= L;
    ny /= L;
    const t = i / (pts.length - 1);
    const hw = (w0 + (w1 - w0) * Math.pow(t, 0.7)) * 0.5;
    left.push([p[0] + nx * hw, p[1] + ny * hw]);
    right.push([p[0] - nx * hw, p[1] - ny * hw]);
  }
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(left[0][0], left[0][1]);
  for (let i = 1; i < left.length; i++) ctx.lineTo(left[i][0], left[i][1]);
  for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i][0], right[i][1]);
  ctx.closePath();
  ctx.fillStyle = hexA(color, alpha);
  ctx.fill();
  ctx.restore();
  if (edge) {
    inkStroke(ctx, right, {
      color,
      width: Math.max(0.6, w0 * 0.16),
      alpha: edge,
      seed: Math.round(w0 * 97 + pts[0][0]),
      wobble: 0.4,
      jitter: 0.2,
      dry: 0.18,
      layers: 1,
      taper: false,
      step: 3,
    });
  }
}

/** 一片叶：尖头的小点，不是圆球。起于 (x,y)，朝 ang 伸出 len */
function leafDab(ctx, x, y, ang, len, wid) {
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  const nx = -s * wid;
  const ny = c * wid;
  ctx.moveTo(x, y);
  ctx.quadraticCurveTo(x + c * len * 0.42 + nx, y + s * len * 0.42 + ny, x + c * len, y + s * len);
  ctx.quadraticCurveTo(x + c * len * 0.42 - nx, y + s * len * 0.42 - ny, x, y);
}

/** 一丛叶：从一点朝一个扇面散出几片，个字点／介字点的意思 */
function leafFan(ctx, px, py, dir, spread, n, len, rnd, out) {
  for (let i = 0; i < n; i++) {
    const k = n === 1 ? 0.5 : i / (n - 1);
    const ang = dir + (k - 0.5) * spread + (rnd() - 0.5) * 0.22;
    const ll = len * (0.6 + rnd() * 0.75);
    out.push({
      x: px + (rnd() - 0.5) * len * 0.5,
      y: py + (rnd() - 0.5) * len * 0.35,
      ang,
      len: ll,
      wid: ll * (0.16 + rnd() * 0.1),
      a: 0.35 + rnd() * 0.65,
    });
  }
}

/** 叶点批量填充：按浓淡分桶，一次 path 一笔色 */
function leafDots(ctx, dots, color, baseAlpha) {
  if (!dots.length) return;
  const buckets = [[], [], []];
  for (const d of dots) {
    const b = Math.min(2, Math.max(0, Math.floor((d.a ?? 1) * 2.999)));
    buckets[b].push(d);
  }
  for (let b = 0; b < 3; b++) {
    if (!buckets[b].length) continue;
    ctx.save();
    ctx.beginPath();
    for (const d of buckets[b]) {
      if (d.len) {
        leafDab(ctx, d.x, d.y, d.ang, d.len, d.wid);
      } else {
        ctx.ellipse(d.x, d.y, d.rx, d.ry, d.ang, 0, Math.PI * 2);
      }
    }
    ctx.fillStyle = hexA(color, baseAlpha * (0.6 + b * 0.22));
    ctx.fill();
    ctx.restore();
  }
}

/**
 * 一丛树：树干不齐，冠分主次，疏密不均。
 *
 * trees 是手写的几处落点（画面要能控制哪里有树、哪里空），
 * 每处再按 count 长出一小丛，丛内靠近主树，往边缘变稀。
 */
export function treeGroup(ctx, o = {}) {
  const {
    x = 0,
    y = 0,
    size = 50,
    count = 3,
    spread = 0.9,
    seed = 1,
    color = '#3a3f38',
    alpha = 0.55,
    canopy = '#4d5c3d',
    canopyAlpha = 0.18,
    shape = 'round',
    baseAngle = 0.02,
  } = o;
  const rnd = mulberry32(seed);
  for (let i = 0; i < count; i++) {
    const k = count === 1 ? 0 : i / (count - 1);
    // 主树最大，往两侧递减，且不排成等距
    const fall = k === 0 ? 1 : 1 - Math.abs(k - 0.5) * 0.5 - (i % 2) * 0.12;
    const ss = size * (0.55 + 0.55 * fall) * (0.85 + rnd() * 0.3);
    // 丛宽以树高为单位，允许冠与冠互相压住，这样才像一丛而不是一排
    const ox = (k - 0.5) * size * spread * 1.7 + (rnd() - 0.5) * size * 0.2;
    const oy = (rnd() - 0.5) * size * 0.1 + baseAngle * ox;
    treeShape(ctx, x + ox, y + oy, {
      size: ss,
      seed: seed + i * 131,
      color,
      alpha: alpha * (0.82 + rnd() * 0.3),
      canopy,
      canopyAlpha: canopyAlpha * (0.8 + rnd() * 0.4),
      shape: shape === 'mixed' ? (rnd() > 0.7 ? 'pine' : 'round') : shape,
      trunkRatio: 0.5 + rnd() * 0.18,
      flip: rnd() > 0.5 ? 1 : -1,
    });
  }
}

/**
 * 一棵树。
 *
 * shape: round 阔叶 / pine 松 / willow 柳 / bamboo 竹 / scrub 灌木
 * 干与枝先画，叶压在上面，叶是从枝梢散出的，所以不会脱节。
 */
export function treeShape(ctx, x, y, o = {}) {
  const {
    size = 40,
    seed = 1,
    color = '#3a3f38',
    alpha = 0.62,
    canopy = '#4d5c3d',
    canopyAlpha = 0.2,
    shape = 'round',
    trunkRatio = 0.55,
    lean = 0,
    flip = 1,
  } = o;
  const s = size;
  const rnd = mulberry32(seed);
  const barkW = Math.max(1.6, s * 0.075);
  const leafColor = canopy;
  const leafA = Math.min(0.95, canopyAlpha * 2.6 + alpha * 0.34);

  const trunkBase = [x, y];
  const H = s * trunkRatio;
  const leanX = (lean || (rnd() - 0.5) * 0.16) * s;
  const top = [x + leanX, y - H];

  const trunkPts = [];
  for (let i = 0; i <= 4; i++) {
    const t = i / 4;
    const bend = Math.sin(t * Math.PI) * s * 0.03 * (rnd() - 0.5) * 2;
    trunkPts.push([
      x + leanX * t + bend,
      y - H * t + (t > 0.6 ? 0 : 0),
    ]);
  }

  if (shape === 'bamboo') {
    bambooClump(ctx, x, y, { s, seed, color, alpha, canopy, canopyAlpha: leafA, rnd });
    return;
  }

  if (shape === 'willow') {
    ribbon(ctx, trunkPts, barkW * 1.15, barkW * 0.5, { color, alpha: alpha * 0.92, edge: alpha * 0.35 });
    const dots = [];
    const tips = [];
    const nBr = 4;
    for (let i = 0; i < nBr; i++) {
      const t = 0.5 + i * 0.16;
      const side = i % 2 === 0 ? 1 : -1;
      const bx = x + leanX * t;
      const by = y - H * t;
      const len = s * (0.3 + rnd() * 0.18);
      const pts = [
        [bx, by],
        [bx + side * len * 0.55, by - s * 0.05 - rnd() * s * 0.05],
        [bx + side * len, by + s * 0.03],
      ];
      ribbon(ctx, pts, barkW * 0.5, barkW * 0.2, { color, alpha: alpha * 0.7 });
      tips.push([bx + side * len, by + s * 0.03, side]);
    }
    // 垂枝：从横枝端点往下垂
    for (const [tx, ty, side] of tips) {
      const strands = 3 + Math.floor(rnd() * 3);
      for (let i = 0; i < strands; i++) {
        const sx = tx + (rnd() - 0.5) * s * 0.16;
        inkStroke(
          ctx,
          [
            [sx, ty],
            [sx + side * s * 0.02 + (rnd() - 0.5) * s * 0.03, ty + s * 0.16],
            [sx + (rnd() - 0.5) * s * 0.06, ty + s * (0.24 + rnd() * 0.16)],
          ],
          {
            color: leafColor,
            width: Math.max(0.7, s * 0.012),
            alpha: leafA * 0.8,
            seed: seed + 900 + i * 7 + Math.round(tx),
            wobble: 0.4,
            dry: 0.2,
            layers: 1,
            taper: false,
            step: 3,
          }
        );
      }
      // 冠部一小簇
      for (let i = 0; i < 6; i++) {
        const a = -0.4 + rnd() * 1.4;
        dots.push({
          x: tx + (rnd() - 0.5) * s * 0.2,
          y: ty - rnd() * s * 0.06,
          rx: Math.max(1.5, s * 0.035),
          ry: Math.max(0.9, s * 0.012),
          ang: a,
          a: 0.5 + rnd() * 0.5,
        });
      }
    }
    leafDots(ctx, dots, leafColor, leafA * 0.75);
    return;
  }

  if (shape === 'pine') {
    // 干：略弯，松树皮用断笔点到
    ribbon(ctx, trunkPts, barkW * 1.25, barkW * 0.42, { color, alpha: alpha * 0.95, edge: alpha * 0.4 });
    const tiers = s > 46 ? 4 : 3;
    const dots = [];
    for (let i = 0; i < tiers; i++) {
      const t = 0.42 + (i / tiers) * 0.55;
      const bx = x + leanX * t;
      const by = y - H * t;
      const side = i % 2 === 0 ? 1 : -1;
      const len = s * (0.34 - i * 0.05) * (0.85 + rnd() * 0.4);
      const branch = [
        [bx, by],
        [bx + side * len * 0.6, by - s * 0.02],
        [bx + side * len, by + s * 0.02],
      ];
      ribbon(ctx, branch, barkW * 0.45, barkW * 0.16, { color, alpha: alpha * 0.72 });
      // 针叶：从枝端向内散
      const fanN = s > 46 ? 9 : 6;
      for (let k = 0; k < fanN; k++) {
        const u = k / (fanN - 1);
        const px = bx + side * len * (0.45 + u * 0.55);
        const py = by + s * 0.02;
        for (let j = 0; j < 3; j++) {
          const ang = -Math.PI / 2 + side * (0.35 + j * 0.42) + (rnd() - 0.5) * 0.2;
          const ll = s * (0.05 + rnd() * 0.035);
          inkStroke(
            ctx,
            [
              [px, py],
              [px + Math.cos(ang) * ll * 0.6, py + Math.sin(ang) * ll * 0.6],
              [px + Math.cos(ang) * ll, py + Math.sin(ang) * ll],
            ],
            {
              color: leafColor,
              width: Math.max(0.65, s * 0.011),
              alpha: leafA * (0.55 + rnd() * 0.5),
              seed: seed + 400 + i * 37 + k * 5 + j,
              wobble: 0.2,
              jitter: 0.15,
              dry: 0.1,
              layers: 1,
              taper: false,
              step: 2,
            }
          );
        }
      }
    }
    // 树梢一撮
    for (let i = 0; i < 10; i++) {
      const ang = -Math.PI / 2 + (rnd() - 0.5) * 1.6;
      const ll = s * (0.05 + rnd() * 0.04);
      inkStroke(
        ctx,
        [
          top,
          [top[0] + Math.cos(ang) * ll * 0.6, top[1] + Math.sin(ang) * ll * 0.6],
          [top[0] + Math.cos(ang) * ll, top[1] + Math.sin(ang) * ll],
        ],
        {
          color: leafColor,
          width: Math.max(0.6, s * 0.01),
          alpha: leafA * (0.5 + rnd() * 0.5),
          seed: seed + 700 + i * 9,
          wobble: 0.2,
          dry: 0.1,
          layers: 1,
          taper: false,
          step: 2,
        }
      );
    }
    leafDots(ctx, dots, leafColor, leafA * 0.4);
    return;
  }

  /* ── 阔叶：干 + 三四根分枝 + 从枝梢散出的叶组 ── */
  ribbon(ctx, trunkPts, barkW * 1.1, barkW * 0.4, { color, alpha: alpha * 0.92, edge: alpha * 0.4 });

  const branches = [];
  const nBr = s > 60 ? 4 : 3;
  for (let i = 0; i < nBr; i++) {
    const t = 0.52 + (i / nBr) * 0.46 + (rnd() - 0.5) * 0.08;
    const side = (i % 2 === 0 ? 1 : -1) * (rnd() > 0.85 ? -1 : 1) * flip;
    const bx = x + leanX * t;
    const by = y - H * t;
    const len = s * (0.3 - i * 0.035) * (0.8 + rnd() * 0.5);
    const rise = s * (0.06 + rnd() * 0.14);
    const pts = [
      [bx, by],
      [bx + side * len * 0.5, by - rise * 0.5],
      [bx + side * len * 0.86, by - rise],
      [bx + side * len, by - rise * 1.05],
    ];
    ribbon(ctx, pts, barkW * 0.42, barkW * 0.13, { color, alpha: alpha * 0.72 });
    branches.push({ tip: pts[3], mid: pts[2], side, len });
  }

  const dots = [];
  /**
   * 一簇叶落在枝上：沿枝走，靠枝端密、靠枝根疏，
   * 叶朝外张开，中间留缝，不做成一团棉花。
   */
  const alongBranch = (from, to, n, dirBias, leafLen, spreadW) => {
    for (let i = 0; i < n; i++) {
      const u = Math.pow(rnd(), 0.75) * 0.9 + 0.1;
      const px = from[0] + (to[0] - from[0]) * u;
      const py = from[1] + (to[1] - from[1]) * u;
      const side = rnd() > 0.5 ? 1 : -1;
      const dir = -Math.PI / 2 + side * (0.5 + rnd() * 0.75) + dirBias;
      const gx = px + (rnd() - 0.5) * spreadW;
      const gy = py + (rnd() - 0.5) * spreadW * 0.55;
      leafFan(ctx, gx, gy, dir, 1.15, 2 + Math.floor(rnd() * 2), leafLen, rnd, dots);
    }
  };

  for (const br of branches) {
    // 从枝根到枝梢，叶越往梢越密
    alongBranch([br.mid[0] * 0.35 + br.tip[0] * 0.65, br.mid[1] * 0.35 + br.tip[1] * 0.65], br.tip, s > 55 ? 5 : 4, -0.25 * br.side, s * 0.085, s * 0.055);
    alongBranch(br.mid, br.tip, s > 55 ? 3 : 2, 0.2 * br.side, s * 0.07, s * 0.05);
  }
  // 冠顶：叶最密的一处，压住整棵树的轮廓
  leafFan(ctx, top[0], top[1] - s * 0.02, -Math.PI / 2, 1.7, s > 55 ? 7 : 5, s * 0.1, rnd, dots);
  leafFan(ctx, top[0] + s * 0.03, top[1] + s * 0.05, -Math.PI / 2 + 0.5, 1.5, 4, s * 0.08, rnd, dots);
  // 干身中段一小丛，让冠不是「悬空的伞」
  leafFan(ctx, x + leanX * 0.45, y - H * 0.48, -Math.PI / 2 - 0.9, 1.2, 3, s * 0.075, rnd, dots);

  leafDots(ctx, dots, leafColor, leafA);
}

/** 竹丛：几竿细竹，节点横断，叶在梢头 */
function bambooClump(ctx, x, y, o) {
  const { s, seed, color, alpha, canopy, canopyAlpha, rnd } = o;
  const culms = 3 + Math.floor(rnd() * 3);
  const dots = [];
  for (let i = 0; i < culms; i++) {
    const bx = x + (i - culms / 2) * s * 0.15 + (rnd() - 0.5) * s * 0.08;
    const hh = s * (0.75 + rnd() * 0.5);
    const bend = (rnd() - 0.5) * s * 0.08;
    const pts = [
      [bx, y],
      [bx + bend * 0.4, y - hh * 0.4],
      [bx + bend, y - hh * 0.75],
      [bx + bend * 1.4, y - hh],
    ];
    ribbon(ctx, pts, Math.max(1.1, s * 0.026), Math.max(0.8, s * 0.012), {
      color,
      alpha: alpha * 0.85,
    });
    // 节
    const nodes = 5;
    for (let k = 1; k < nodes; k++) {
      const t = k / nodes;
      const px = bx + bend * t * 1.2;
      const py = y - hh * t;
      inkStroke(
        ctx,
        [
          [px - s * 0.022, py],
          [px + s * 0.022, py],
        ],
        {
          color,
          width: Math.max(0.6, s * 0.01),
          alpha: alpha * 0.5,
          seed: seed + 500 + i * 13 + k,
          wobble: 0.1,
          dry: 0,
          layers: 1,
          taper: false,
          step: 2,
        }
      );
    }
    // 叶：梢头散出，两三片一组
    const tipX = bx + bend * 1.4;
    const tipY = y - hh;
    for (let g = 0; g < 3; g++) {
      const gx = tipX + (rnd() - 0.5) * s * 0.2;
      const gy = tipY + s * (0.04 + rnd() * 0.22);
      for (let k = 0; k < 3; k++) {
        const ang = (rnd() - 0.5) * 2.6 + (rnd() > 0.5 ? 0.7 : -0.7);
        dots.push({
          x: gx + Math.cos(ang) * s * 0.045,
          y: gy + Math.sin(ang) * s * 0.03,
          rx: Math.max(1.6, s * 0.05),
          ry: Math.max(1.0, s * 0.012),
          ang,
          a: 0.4 + rnd() * 0.6,
        });
      }
    }
  }
  leafDots(ctx, dots, canopy, canopyAlpha);
}

/* ────────────────────────── 雾 ────────────────────────── */

/**
 * 雾：擦掉墨，不画白。
 * 多个低强度、椭圆、羽化极大的渐变叠加，接缝不可见。
 *
 * strength 是「擦掉多少」，不是「多白」。单块雾超过 0.6 就会在纸上
 * 留下一道横扫的硬白带，所以每块的上限压得比较低，靠块数叠出来。
 */
export function mist(ctx, o = {}) {
  const { x = 0, y = 0, w = 400, h = 80, seed = 7, strength = 0.9, blobs = 5, tilt = 0 } = o;
  const rnd = mulberry32(seed);
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < blobs; i++) {
    const cx = x + w * (0.12 + rnd() * 0.76);
    const cy = y + (rnd() - 0.5) * h * 0.55;
    const rx = w * (0.2 + rnd() * 0.3);
    const ry = h * (0.5 + rnd() * 0.75);
    const st = Math.min(0.34, strength * (0.16 + rnd() * 0.16));
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(tilt * (rnd() - 0.5));
    ctx.scale(rx, ry);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    g.addColorStop(0, `rgba(0,0,0,${st})`);
    g.addColorStop(0.45, `rgba(0,0,0,${st * 0.74})`);
    g.addColorStop(0.78, `rgba(0,0,0,${st * 0.26})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(-1, -1, 2, 2);
    ctx.restore();
  }
  ctx.restore();
}

/** 旧接口：haze(ctx, w, y, ...) */
export function haze(ctx, w, y, o = {}) {
  const { alpha = 0.8, seed = 7, height = 40, bands = 4 } = o;
  mist(ctx, {
    x: -w * 0.05,
    y,
    w: w * 1.1,
    h: height,
    seed,
    strength: Math.min(0.95, alpha * 0.9),
    blobs: Math.max(3, bands),
  });
}

/* ────────────────────────── 水 ────────────────────────── */

/** 水面：几道断续的短弧，位置错落，绝不排成横条 */
export function water(ctx, w, y0, y1, o = {}) {
  const { color = '#6d8f8a', alpha = 0.3, seed = 11, rows = 6, width = 1, x0 = 0, x1 = 1 } = o;
  const rnd = mulberry32(seed);
  for (let r = 0; r < rows; r++) {
    const t = rows === 1 ? 0.5 : r / (rows - 1);
    const y = y0 + (y1 - y0) * Math.pow(t, 1.15);
    const span = w * (0.1 + rnd() * 0.26) * (1 - t * 0.35);
    const st = w * (x0 + (x1 - x0) * rnd() * 0.88);
    const pts = [];
    const seg = 6;
    const ph = rnd() * 6.283;
    const amp = 0.8 + rnd() * 1.8;
    for (let i = 0; i <= seg; i++) {
      const u = i / seg;
      pts.push([st + span * u, y + Math.sin(u * 4.6 + ph) * amp]);
    }
    inkStroke(ctx, pts, {
      color,
      width: width * (0.8 + rnd() * 0.5),
      alpha: alpha * (0.5 + t * 0.6) * (0.7 + rnd() * 0.5),
      seed: seed + r * 13,
      wobble: 0.4,
      jitter: 0.2,
      dry: 0.34,
      layers: 1,
      taper: false,
      step: 3,
    });
  }
}

/** 一段岸线：只画一段，长短由参数定，不横贯 */
export function bankLine(ctx, o = {}) {
  const {
    x0 = 0.1,
    x1 = 0.6,
    y = 0.6,
    w,
    amp = 6,
    seed = 3,
    color = '#2b2f2b',
    alpha = 0.45,
    width = 1.5,
    dry = 0.2,
  } = o;
  const rnd = mulberry32(seed);
  const pts = [];
  const seg = 20;
  const ph = rnd() * 6.28;
  for (let i = 0; i <= seg; i++) {
    const u = i / seg;
    pts.push([
      w * (x0 + (x1 - x0) * u),
      w * 0 + y + Math.sin(u * 3.4 + ph) * amp + Math.sin(u * 7.7 + ph * 2) * amp * 0.4,
    ]);
  }
  inkStroke(ctx, pts, {
    color,
    width,
    alpha,
    seed,
    wobble: 0.8,
    jitter: 0.35,
    dry,
    layers: 2,
    taper: false,
    step: 4,
  });
}

/* ────────────────────────── 屋、桥、船 ────────────────────────── */

/**
 * 一间屋。
 *
 * 浙北民居的样子：屋顶长、两头起翘，出檐压住墙，墙脚有一道横线。
 * 屋顶是一笔带弧的线，不是三角形；墙是淡墨块，不勾满框，
 * 这样一片房子叠在一起也不会变成一堆线框。
 */
export function hut(ctx, x, y, o = {}) {
  const {
    size = 26,
    color = '#3a3f38',
    alpha = 0.6,
    seed = 9,
    flip = false,
    wall = 0.46,
    tone = null,
    toneAlpha = 0.1,
  } = o;
  const s = size;
  const d = flip ? -1 : 1;
  const eaveL = x - s * 0.66 * d;
  const eaveR = x + s * 0.66 * d;

  /* 墙：淡墨一块，先铺，屋顶压在上面 */
  if (tone) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x - s * 0.36 * d, y - s * 0.05);
    ctx.lineTo(x + s * 0.36 * d, y - s * 0.05);
    ctx.lineTo(x + s * 0.36 * d, y + s * wall);
    ctx.lineTo(x - s * 0.36 * d, y + s * wall);
    ctx.closePath();
    ctx.fillStyle = hexA(tone, toneAlpha);
    ctx.fill();
    ctx.restore();
  }

  /* 屋顶：一道长弧，中间略塌，两端翘起 */
  inkStroke(
    ctx,
    [
      [eaveL, y - s * 0.03],
      [x - s * 0.42 * d, y - s * 0.3],
      [x - s * 0.16 * d, y - s * 0.46],
      [x + s * 0.14 * d, y - s * 0.47],
      [x + s * 0.42 * d, y - s * 0.32],
      [eaveR, y - s * 0.05],
    ],
    {
      color,
      width: Math.max(1.1, s * 0.06),
      alpha,
      seed: seed + 1,
      wobble: 0.4,
      jitter: 0.25,
      dry: 0.14,
      layers: 2,
      taper: true,
    }
  );

  /* 出檐的暗：屋顶下一道短横，把檐与墙分开 */
  inkStroke(
    ctx,
    [
      [x - s * 0.44 * d, y - s * 0.02],
      [x + s * 0.44 * d, y - s * 0.04],
    ],
    {
      color,
      width: Math.max(0.8, s * 0.03),
      alpha: alpha * 0.5,
      seed: seed + 2,
      wobble: 0.25,
      dry: 0.2,
      layers: 1,
      taper: false,
    }
  );

  /* 墙脚：一道横线，屋才坐在地上而不是浮着 */
  inkStroke(
    ctx,
    [
      [x - s * 0.34 * d, y + s * wall],
      [x + s * 0.34 * d, y + s * wall],
    ],
    {
      color,
      width: Math.max(0.9, s * 0.034),
      alpha: alpha * 0.78,
      seed: seed + 3,
      wobble: 0.3,
      dry: 0.18,
      layers: 1,
      taper: false,
    }
  );

  /* 两端的墙线：只画一条腿，不必四面封口 */
  inkStroke(
    ctx,
    [
      [x - s * 0.34 * d, y - s * 0.02],
      [x - s * 0.34 * d, y + s * wall],
    ],
    {
      color,
      width: Math.max(0.7, s * 0.026),
      alpha: alpha * 0.5,
      seed: seed + 5,
      wobble: 0.2,
      dry: 0.22,
      layers: 1,
      taper: false,
    }
  );

  /* 门：一条竖笔，不必画成框 */
  inkStroke(
    ctx,
    [
      [x + s * 0.06 * d, y + s * wall],
      [x + s * 0.06 * d, y + s * (wall - 0.24)],
    ],
    {
      color,
      width: Math.max(0.6, s * 0.03),
      alpha: alpha * 0.6,
      seed: seed + 7,
      wobble: 0.1,
      dry: 0.1,
      layers: 1,
      taper: false,
    }
  );
}

/** 拱桥：一跨，桥面一道，桥洞一道 */
export function bridge(ctx, x, y, o = {}) {
  const { w = 60, h = 22, color = '#3a3f38', alpha = 0.55, seed = 11 } = o;
  const deck = [];
  for (let i = 0; i <= 12; i++) {
    const u = i / 12;
    deck.push([x - w / 2 + w * u, y - Math.sin(u * Math.PI) * h]);
  }
  inkStroke(ctx, deck, {
    color,
    width: 1.8,
    alpha,
    seed,
    wobble: 0.35,
    dry: 0.1,
    layers: 2,
    taper: false,
  });
  const arch = [];
  for (let i = 0; i <= 12; i++) {
    const u = i / 12;
    arch.push([x - w * 0.3 + w * 0.6 * u, y + Math.sin(u * Math.PI) * h * 0.1 - Math.sin(u * Math.PI) * h * 0.62]);
  }
  inkStroke(ctx, arch, {
    color,
    width: 1,
    alpha: alpha * 0.6,
    seed: seed + 3,
    wobble: 0.3,
    dry: 0.16,
    layers: 1,
    taper: false,
  });
  // 桥墩小段
  for (const px of [x - w * 0.29, x + w * 0.29]) {
    inkStroke(ctx, [[px, y], [px, y - h * 0.05]], {
      color,
      width: 0.9,
      alpha: alpha * 0.5,
      seed: seed + 7,
      layers: 1,
      dry: 0.1,
      taper: false,
    });
  }
}

/** 小船 + 一个人 */
export function boat(ctx, x, y, o = {}) {
  const { size = 30, color = '#2b2f2b', alpha = 0.55, seed = 21, figure = true } = o;
  const s = size;
  inkStroke(
    ctx,
    [
      [x - s * 0.5, y - s * 0.02],
      [x - s * 0.3, y + s * 0.12],
      [x + s * 0.32, y + s * 0.12],
      [x + s * 0.5, y - s * 0.06],
    ],
    { color, width: Math.max(1.1, s * 0.045), alpha, seed, wobble: 0.3, dry: 0.12, layers: 2, taper: false }
  );
  // 篷
  inkStroke(
    ctx,
    [
      [x - s * 0.16, y - s * 0.01],
      [x - s * 0.1, y - s * 0.16],
      [x + s * 0.06, y - s * 0.16],
      [x + s * 0.12, y - s * 0.01],
    ],
    { color, width: Math.max(0.8, s * 0.03), alpha: alpha * 0.72, seed: seed + 5, wobble: 0.2, dry: 0.1, layers: 1, taper: false }
  );
  if (figure) {
    inkStroke(
      ctx,
      [
        [x + s * 0.26, y + s * 0.04],
        [x + s * 0.26, y - s * 0.1],
      ],
      { color, width: Math.max(0.9, s * 0.035), alpha: alpha * 0.8, seed: seed + 9, wobble: 0.1, dry: 0.05, layers: 1, taper: false }
    );
    inkStroke(
      ctx,
      [
        [x + s * 0.3, y - s * 0.22],
        [x + s * 0.5, y - s * 0.5],
      ],
      { color, width: Math.max(0.6, s * 0.018), alpha: alpha * 0.55, seed: seed + 11, wobble: 0.2, dry: 0.2, layers: 1, taper: false }
    );
  }
  // 水痕
  inkStroke(
    ctx,
    [
      [x - s * 0.7, y + s * 0.2],
      [x - s * 0.2, y + s * 0.22],
    ],
    { color: '#6d8f8a', width: 0.9, alpha: alpha * 0.4, seed: seed + 13, wobble: 0.5, dry: 0.3, layers: 1, taper: false }
  );
  inkStroke(
    ctx,
    [
      [x + s * 0.1, y + s * 0.26],
      [x + s * 0.6, y + s * 0.24],
    ],
    { color: '#6d8f8a', width: 0.8, alpha: alpha * 0.3, seed: seed + 15, wobble: 0.5, dry: 0.3, layers: 1, taper: false }
  );
}

/** 一只鸟：两笔，一高一低 */
export function bird(ctx, x, y, o = {}) {
  const { size = 12, color = '#2b2f2b', alpha = 0.45, seed = 31 } = o;
  inkStroke(
    ctx,
    [
      [x - size * 0.5, y + size * 0.12],
      [x - size * 0.22, y - size * 0.14],
      [x, y],
      [x + size * 0.24, y - size * 0.16],
      [x + size * 0.52, y + size * 0.1],
    ],
    { color, width: 1, alpha, seed, wobble: 0.2, dry: 0, layers: 1, taper: false }
  );
}

/** 芦苇：两三丛细线，压住水边 */
export function reeds(ctx, x, y, o = {}) {
  const { size = 40, count = 5, color = '#3a3f38', alpha = 0.4, seed = 41, dir = 1 } = o;
  const rnd = mulberry32(seed);
  for (let i = 0; i < count; i++) {
    const bx = x + (rnd() - 0.5) * size * 0.5;
    const hh = size * (0.5 + rnd() * 0.6);
    const bend = dir * size * (0.12 + rnd() * 0.2);
    inkStroke(
      ctx,
      [
        [bx, y],
        [bx + bend * 0.3, y - hh * 0.55],
        [bx + bend, y - hh],
      ],
      {
        color,
        width: Math.max(0.7, size * 0.012),
        alpha: alpha * (0.6 + rnd() * 0.5),
        seed: seed + i * 7,
        wobble: 0.4,
        dry: 0.18,
        layers: 1,
        taper: true,
        step: 3,
      }
    );
  }
}

/** 云：几段极淡的水平短线，不是白团 */
export function cloudBand(ctx, x, y, w, o = {}) {
  const { alpha = 0.5, seed = 3, rows = 2 } = o;
  const rnd = mulberry32(seed);
  for (let r = 0; r < rows; r++) {
    const yy = y + (rnd() - 0.5) * w * 0.02 + r * w * 0.018;
    const span = w * (0.2 + rnd() * 0.4);
    const sx = x + w * rnd() * 0.5;
    const pts = [];
    for (let i = 0; i <= 14; i++) {
      const u = i / 14;
      pts.push([sx + span * u, yy + Math.sin(u * 5 + rnd()) * w * 0.004]);
    }
    inkStroke(ctx, pts, {
      color: '#8d948a',
      width: 0.9,
      alpha: alpha * 0.28,
      seed: seed + r * 9,
      wobble: 0.4,
      dry: 0.4,
      layers: 1,
      taper: false,
      step: 4,
    });
  }
}

/* ────────────────────────── 梯田 ────────────────────────── */

/**
 * 梯田：绕着一处山嘴的等高带。
 * 越近越宽、越深；远端收紧化进雾里。
 */
export function terraceBands(ctx, o = {}) {
  const {
    cx,
    cy,
    span,
    top,
    bottom,
    rows = 14,
    color = '#7c9160',
    alpha = 0.4,
    seed = 13,
    width = 1,
    tilt = 0.18,
  } = o;
  const rnd = mulberry32(seed);
  for (let r = 0; r < rows; r++) {
    const t = r / (rows - 1);
    const y = top + (bottom - top) * Math.pow(t, 1.35);
    const half = span * (0.22 + t * 0.78);
    const ph = rnd() * 6.28;
    const sag = half * (0.1 + rnd() * 0.06);
    const pts = [];
    const seg = 22;
    for (let i = 0; i <= seg; i++) {
      const u = i / seg;
      const x = cx - half + half * 2 * u;
      // 山嘴：中间鼓起，两侧向下收
      const yy = y + Math.sin(u * Math.PI) * sag - Math.sin(u * Math.PI * 2 + ph) * sag * 0.16;
      pts.push([x + (u - 0.5) * tilt * half * 0.4, yy]);
    }
    inkStroke(ctx, pts, {
      color,
      width: width * (0.75 + t * 0.55),
      alpha: alpha * (0.34 + t * 0.8),
      seed: seed + r * 11,
      wobble: 0.55,
      jitter: 0.25,
      dry: 0.26,
      layers: 1,
      taper: false,
      step: 4,
    });
    // 田埂的积水：只给近处几层
    if (t > 0.55 && rnd() > 0.35) {
      const sx = cx - half * (0.1 + rnd() * 0.5);
      const sw = half * (0.2 + rnd() * 0.4);
      inkStroke(
        ctx,
        [
          [sx, y + sag * 0.6],
          [sx + sw, y + sag * 0.55],
        ],
        {
          color: '#6d8f8a',
          width: 0.9,
          alpha: alpha * 0.3,
          seed: seed + 300 + r * 5,
          wobble: 0.4,
          dry: 0.3,
          layers: 1,
          taper: false,
        }
      );
    }
  }
}

/* ────────────────────────── 田垄 / 大棚 ────────────────────────── */

/** 菜地垄：从近处往远处收，带一点透视 */
export function furrows(ctx, o = {}) {
  const {
    x0,
    x1,
    yNear,
    yFar,
    vanishX,
    rows = 8,
    color = '#5a625b',
    alpha = 0.24,
    seed = 17,
    width = 0.9,
  } = o;
  const rnd = mulberry32(seed);
  for (let r = 0; r < rows; r++) {
    const t = r / (rows - 1);
    const y = yFar + (yNear - yFar) * t;
    const a = Math.pow(t, 0.7);
    const lx = vanishX + (x0 - vanishX) * (0.35 + a * 0.75);
    const rx = vanishX + (x1 - vanishX) * (0.35 + a * 0.75);
    const pts = [];
    for (let i = 0; i <= 10; i++) {
      const u = i / 10;
      pts.push([lx + (rx - lx) * u, y + Math.sin(u * 3 + r) * 1.1 * (0.4 + t)]);
    }
    inkStroke(ctx, pts, {
      color,
      width: width * (0.7 + t * 0.8),
      alpha: alpha * (0.35 + t * 0.9) * (0.8 + rnd() * 0.4),
      seed: seed + r * 9,
      wobble: 0.4,
      jitter: 0.2,
      dry: 0.28,
      layers: 1,
      taper: false,
      step: 4,
    });
  }
}

/** 大棚：半圆拱，几条压条 */
export function greenhouse(ctx, cx, cy, rw, rh, o = {}) {
  const { color = '#3a3f38', alpha = 0.5, seed = 31 } = o;
  const arc = [];
  const seg = 20;
  for (let i = 0; i <= seg; i++) {
    const a = Math.PI + (i / seg) * Math.PI;
    arc.push([cx + Math.cos(a) * rw, cy + Math.sin(a) * rh]);
  }
  inkStroke(ctx, arc, { color, width: 1.6, alpha, seed, wobble: 0.3, dry: 0.1, layers: 2, taper: true });
  inkStroke(ctx, [[cx - rw, cy], [cx + rw, cy]], {
    color,
    width: 1.1,
    alpha: alpha * 0.7,
    seed: seed + 1,
    wobble: 0.2,
    dry: 0.1,
    layers: 1,
    taper: false,
  });
  for (let i = 1; i < 4; i++) {
    const u = i / 4;
    const ax = cx - rw + rw * 2 * u;
    const ah = rh * Math.sin(Math.PI * u);
    inkStroke(ctx, [[ax, cy], [ax, cy - ah]], {
      color,
      width: 0.65,
      alpha: alpha * 0.34,
      seed: seed + 10 + i,
      wobble: 0.2,
      dry: 0.2,
      layers: 1,
      taper: false,
    });
  }
}

/* ────────────────────────── 石 ────────────────────────── */

/** 一块石：轮廓一笔 + 两三笔皴 + 苔点 */
export function stone(ctx, x, y, o = {}) {
  const { w = 60, h = 34, seed = 7, color = '#3a3f38', alpha = 0.5, width = 1.3, moss = 3 } = o;
  const rnd = mulberry32(seed);
  const ridge = [];
  const seg = 7;
  for (let i = 0; i <= seg; i++) {
    const t = i / seg;
    ridge.push([
      x - w / 2 + w * t,
      y - Math.sin(t * Math.PI) * h * (0.72 + rnd() * 0.45) + (rnd() - 0.5) * h * 0.16,
    ]);
  }
  inkStroke(ctx, ridge, {
    color,
    width: width * 1.25,
    alpha: alpha * 0.95,
    seed: seed + 1,
    wobble: 1.1,
    dry: 0.14,
    layers: 2,
    taper: false,
  });
  for (let i = 0; i < 3; i++) {
    const t = 0.2 + rnd() * 0.6;
    const p = ridge[Math.round(t * seg)];
    const len = h * (0.25 + rnd() * 0.45);
    inkStroke(
      ctx,
      [
        [p[0], p[1] + 1.5],
        [p[0] + (rnd() - 0.5) * 6, p[1] + len],
      ],
      {
        color,
        width: width * 0.55,
        alpha: alpha * 0.55,
        seed: seed + 20 + i * 7,
        wobble: 0.5,
        dry: 0.32,
        layers: 1,
        taper: false,
      }
    );
  }
  for (let i = 0; i < moss; i++) {
    const p = ridge[Math.round((0.2 + rnd() * 0.6) * seg)];
    ctx.save();
    ctx.fillStyle = hexA(color, alpha * 0.8);
    ctx.beginPath();
    ctx.ellipse(p[0], p[1] - 1, 1.6 + rnd() * 1.4, 1.2 + rnd(), rnd() * 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

/** 一块地面薄染，给前景坐住 */
export function groundWash(ctx, o = {}) {
  const { w, y0, y1, color = '#8d948a', alpha = 0.1, seed = 3, x0 = 0, x1 = 1 } = o;
  const rnd = mulberry32(seed);
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(w * x0, y1);
  const seg = 12;
  for (let i = 0; i <= seg; i++) {
    const u = i / seg;
    const x = w * (x0 + (x1 - x0) * u);
    const y = y0 + Math.sin(u * 3.2 + rnd() * 0.2) * (y1 - y0) * 0.06;
    ctx.lineTo(x, y);
  }
  ctx.lineTo(w * x1, y1);
  ctx.closePath();
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, hexA(color, alpha * 0.2));
  g.addColorStop(0.55, hexA(color, alpha * 0.7));
  g.addColorStop(1, hexA(color, alpha));
  ctx.fillStyle = g;
  ctx.fill();
  ctx.restore();
}

/* ────────────────────────── 天空 ────────────────────────── */

/** 极淡的天光：只在上三分之一，往下归纸 */
export function skyWash(ctx, w, h, o = {}) {
  const { color = '#8d948a', alpha = 0.1, from = 0, to = 0.42 } = o;
  const g = ctx.createLinearGradient(0, h * from, 0, h * to);
  g.addColorStop(0, hexA(color, alpha));
  g.addColorStop(0.6, hexA(color, alpha * 0.35));
  g.addColorStop(1, hexA(color, 0));
  ctx.save();
  ctx.fillStyle = g;
  ctx.fillRect(0, h * from, w, h * (to - from));
  ctx.restore();
}

export { ribbon, leafDots, fadeAt };
