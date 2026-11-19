/**
 * inkcurve.js — 直接画平滑曲线的脊线
 *
 * 为什么需要这个：
 * inkStroke 用 lineTo 逐点连接，点密的时候是直线段拼出来的折线。
 * 山脊的峰顶曲率最大，折线在那里最明显，看起来就是尖角。
 *
 * 这里改用二次贝塞尔：每个点取与前后点的中点作为控制点，
 * 曲线自然穿过所有采样点，且处处一阶连续。
 */

import { mulberry32, hexA } from './brush.js';

/**
 * 一条平滑曲线，带手绘抖动与浓淡。
 * @param {CanvasRenderingContext2D} ctx
 * @param {Array<[number,number]>} pts 采样点（已经很密）
 * @param {object} o
 */
export function smoothStroke(ctx, pts, o = {}) {
  if (!pts || pts.length < 2) return;
  const {
    color = '#2b2f2b',
    width = 2,
    alpha = 0.7,
    seed = 1,
    jitter = 0.22,
    layers = 2,
    dry = 0.12,
    gain = 1,
  } = o;

  const rnd = mulberry32(seed);

  // 抖动：沿法向加极小的偏移，保住手绘感但不破坏曲率
  const jp = pts.map((p, i) => {
    if (i === 0 || i === pts.length - 1) return [p[0], p[1]];
    const a = pts[i - 1];
    const b = pts[i + 1];
    let nx = -(b[1] - a[1]);
    let ny = b[0] - a[0];
    const L = Math.hypot(nx, ny) || 1;
    nx /= L;
    ny /= L;
    const d = (rnd() - 0.5) * jitter * 2;
    return [p[0] + nx * d, p[1] + ny * d];
  });

  const A = Math.min(1, alpha * gain);

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = color;

  const trace = (points, from, to) => {
    ctx.beginPath();
    ctx.moveTo(points[from][0], points[from][1]);
    for (let i = from + 1; i <= to; i++) {
      const cur = points[i];
      const nxt = points[Math.min(to, i + 1)];
      // 以「当前点」与「下一点」的中点为终点，当前点作控制点
      const mx = (cur[0] + nxt[0]) / 2;
      const my = (cur[1] + nxt[1]) / 2;
      if (i === to) {
        ctx.lineTo(cur[0], cur[1]);
      } else {
        ctx.quadraticCurveTo(cur[0], cur[1], mx, my);
      }
    }
  };

  for (let L = 0; L < layers; L++) {
    const k = layers === 1 ? 0 : L / (layers - 1);
    ctx.globalAlpha = A * (0.3 + k * 0.7);
    ctx.lineWidth = width * (1.9 - k * 0.95);

    if (dry > 0 && L === layers - 1) {
      // 飞白：长段保留，断口稀疏
      let from = 0;
      let i = 0;
      while (i < jp.length) {
        if (i > 6 && i < jp.length - 6 && rnd() < dry * 0.1) {
          if (i - from > 4) trace(jp, from, i);
          i += 2;
          from = i;
        } else {
          i++;
        }
      }
      if (jp.length - from > 2) trace(jp, from, jp.length - 1);
      ctx.stroke();
    } else {
      trace(jp, 0, jp.length - 1);
      ctx.stroke();
    }
  }

  ctx.restore();
}

/**
 * 一条山脊线：从点列生成，带权重衰减。
 * @param {object} o
 *   fade  权重数组 [[t, w], ...]，控制哪一段该淡出
 */
export function ridgeLine(ctx, pts, vw, o = {}) {
  const {
    color = '#2b2f2b',
    width = 2,
    alpha = 0.6,
    seed = 1,
    fade = null,
    dry = 0.12,
    layers = 2,
    gain = 1,
  } = o;

  // 按 fade 权重裁出可见段
  let from = 0;
  let to = pts.length - 1;
  if (fade && fade.length) {
    const w = (t) => {
      if (t <= fade[0][0]) return fade[0][1];
      for (let i = 0; i < fade.length - 1; i++) {
        const [t0, v0] = fade[i];
        const [t1, v1] = fade[i + 1];
        if (t >= t0 && t <= t1) {
          const k = (t - t0) / Math.max(1e-6, t1 - t0);
          return v0 + (v1 - v0) * k;
        }
      }
      return fade[fade.length - 1][1];
    };
    const n = pts.length - 1;
    for (let i = 0; i <= n; i++) {
      if (w(i / n) > 0.06) {
        from = i;
        break;
      }
    }
    for (let i = n; i >= 0; i--) {
      if (w(i / n) > 0.06) {
        to = i;
        break;
      }
    }
  }
  if (to - from < 2) return;

  smoothStroke(ctx, pts.slice(from, to + 1), {
    color,
    width,
    alpha,
    seed,
    dry,
    layers,
    gain,
  });
}

void hexA;
