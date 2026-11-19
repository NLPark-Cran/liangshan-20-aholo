/**
 * tern-scene.js — 燕鸥招引的海岛全景
 *
 * 重做后这幅画要撑满整个展台：
 *   岛在画面中央偏左，海铺满下方，天占上半。
 *   假鸟真的站在岛顶（数量跟档位对应）；
 *   真鸟来了就从天上落下来，落在岛上，一圈一圈地盘。
 *   放声音用一圈一圈扩散的波纹表示，从岛向外走。
 */

import { inkStroke, hexA, mulberry32, mistBand, seal } from './brush.js';
import { water } from './inkfig.js';

/** 岛的轮廓，按 id 给出不同形状 */
function islandShape(id, w, h) {
  const seaY = h * 0.63;
  if (id === 'reef') {
    // 海蚀礁岩：顶面平而带锯齿，两侧被浪掏空，不能画成圆馒头
    return {
      seaY,
      pts: reefOutline(w, h, seaY),
      top: { x: w * 0.47, y: h * 0.375, span: w * 0.26 },
    };
  }
  if (id === 'sandbar') {
    return {
      seaY,
      pts: [
        [w * 0.13, seaY + 12],
        [w * 0.22, seaY + 2],
        [w * 0.34, seaY - 5],
        [w * 0.47, seaY - 8],
        [w * 0.6, seaY - 5],
        [w * 0.72, seaY + 1],
        [w * 0.84, seaY + 12],
      ],
      top: { x: w * 0.47, y: seaY - 6, span: w * 0.2 },
    };
  }
  // 鱼塘埂：极窄的一条，两侧都是水
  return {
    seaY,
    pts: [
      [w * 0.1, seaY + 20],
      [w * 0.28, seaY + 10],
      [w * 0.46, seaY + 7],
      [w * 0.64, seaY + 8],
      [w * 0.8, seaY + 4],
      [w * 0.9, seaY + 20],
    ],
    top: { x: w * 0.45, y: seaY + 4, span: w * 0.22 },
  };
}

/**
 * @param {object} s
 *   island  'reef'|'sandbar'|'pond'|null
 *   decoy   档位 id
 *   sound   档位 id
 *   birds   本季到岛的真鸟数
 *   nests   筑巢
 *   phase   choose | waiting | result | end
 *   round   第几季 0-4
 *   t       秒
 */
export function drawTernPanorama(canvas, s = {}) {
  if (!canvas || !canvas.isConnected) return;

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

  const {
    island = null,
    decoy = null,
    sound = null,
    birds = 0,
    nests = 0,
    phase = 'choose',
    round = 0,
    t = 0,
  } = s;

  const rnd = mulberry32(4401);

  // ── 天色：随繁殖季推移，从春天到盛夏
  const seasonT = Math.min(1, round / 4);
  const sky = ctx.createLinearGradient(0, 0, 0, H * 0.66);
  sky.addColorStop(0, hexA(mix('#e6ecdf', '#e8e4d4', seasonT), 0.92));
  sky.addColorStop(0.6, hexA('#f0ebdd', 0.5));
  sky.addColorStop(1, hexA('#f4efe4', 0));
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H * 0.68);

  // 云：横向长条，压住天际
  mistBand(ctx, { x: 0, y: H * 0.06, w: W, h: H * 0.2 }, { alpha: 0.5, seed: 4403, bands: 3 });

  // ── 远岛：海平线上几点淡影，把空间推开
  for (let i = 0; i < 3; i++) {
    const bx = W * (0.05 + rnd() * 0.9);
    const bw = W * (0.06 + rnd() * 0.09);
    const bh = H * (0.01 + rnd() * 0.014);
    inkStroke(
      ctx,
      [
        [bx - bw, H * 0.585],
        [bx - bw * 0.4, H * 0.585 - bh],
        [bx + bw * 0.12, H * 0.585 - bh * 0.7],
        [bx + bw, H * 0.585],
      ],
      {
        color: '#5a625b',
        width: 1,
        alpha: 0.22,
        seed: 4421 + i * 11,
        wobble: 0.7,
        dry: 0.2,
        layers: 1,
        taper: false,
      }
    );
  }

  // ── 海
  const seaY = H * 0.62;
  const sea = ctx.createLinearGradient(0, seaY, 0, H);
  sea.addColorStop(0, hexA('#7a9c96', 0.34));
  sea.addColorStop(0.35, hexA('#7a9c96', 0.22));
  sea.addColorStop(1, hexA('#8aa9a2', 0.1));
  ctx.fillStyle = sea;
  ctx.fillRect(0, seaY, W, H - seaY);

  // 岛在水里的倒影：贴着岛的轮廓往下映一小段，压得很淡
  if (island) {
    const sh0 = islandShape(island, W, H);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, seaY, W, Math.min(H * 0.085, H - seaY));
    ctx.clip();
    ctx.globalAlpha = 0.055;
    ctx.beginPath();
    ctx.moveTo(sh0.pts[0][0], sh0.pts[0][1]);
    for (let i = 1; i < sh0.pts.length; i++) ctx.lineTo(sh0.pts[i][0], sh0.pts[i][1]);
    ctx.lineTo(sh0.pts[sh0.pts.length - 1][0], seaY + H * 0.2);
    ctx.lineTo(sh0.pts[0][0], seaY + H * 0.2);
    ctx.closePath();
    ctx.fillStyle = '#4f574d';
    ctx.fill();
    ctx.restore();
  }

  // 海平线
  inkStroke(ctx, [[0, seaY], [W, seaY]], {
    color: '#6d8f8a',
    width: 0.9,
    alpha: 0.16,
    seed: 4407,
    layers: 2,
    dry: 0.35,
    taper: false,
  });

  // 波纹：缓慢右移
  const wr = mulberry32(4405);
  for (let i = 0; i < 16; i++) {
    const y = seaY + (H - seaY) * ((i + 0.5) / 16);
    const amp = 1.1 + wr() * 2.2;
    const span = W * 0.26;
    const speed = 7 + wr() * 9;
    const off = ((t * speed) % (W + span * 2)) - span;
    const pts = [];
    for (let k = 0; k <= 12; k++) {
      const u = k / 12;
      pts.push([off + span * u, y + Math.sin(u * 6.4 + i + t * 0.9) * amp]);
    }
    inkStroke(ctx, pts, {
      color: '#6d8f8a',
      width: 0.9,
      alpha: 0.16 + (1 - i / 16) * 0.1,
      seed: 5000 + i * 7,
      wobble: 0.4,
      dry: 0.3,
      layers: 1,
      taper: false,
      step: 4,
    });
  }

  // ── 岛
  if (island) {
    const sh = islandShape(island, W, H);

    // 岛体填色：顶面受光偏亮，往下渐暗，别整块一个灰度
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(sh.pts[0][0], sh.pts[0][1]);
    for (let i = 1; i < sh.pts.length; i++) ctx.lineTo(sh.pts[i][0], sh.pts[i][1]);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, H * 0.33, 0, sh.seaY);
    if (island === 'reef') {
      g.addColorStop(0, hexA('#9aa094', 0.46));
      g.addColorStop(0.35, hexA('#8a9082', 0.34));
      g.addColorStop(0.72, hexA('#6f7568', 0.24));
      g.addColorStop(1, hexA('#5c6156', 0.16));
    } else {
      g.addColorStop(0, hexA('#c0a26c', 0.44));
      g.addColorStop(0.5, hexA('#ae9060', 0.3));
      g.addColorStop(1, hexA('#8f7650', 0.16));
    }
    ctx.fillStyle = g;
    ctx.fill();
    ctx.restore();

    /* 岛面的明暗：右半边压深，礁石才有体积 */
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(sh.pts[0][0], sh.pts[0][1]);
    for (let i = 1; i < sh.pts.length; i++) ctx.lineTo(sh.pts[i][0], sh.pts[i][1]);
    ctx.closePath();
    ctx.clip();
    const sideG = ctx.createLinearGradient(W * 0.42, 0, W * 0.78, 0);
    sideG.addColorStop(0, 'rgba(58,63,56,0)');
    sideG.addColorStop(1, 'rgba(58,63,56,0.16)');
    ctx.fillStyle = sideG;
    ctx.fillRect(0, H * 0.3, W, H * 0.4);
    ctx.restore();

    /* 轮廓：分三段画，整条一次画完会被飞白打断，看着像断成两截。
       顶面最实，两侧肩线稍淡，水面以下不描。 */
    const cutL = sh.pts.findIndex((p) => p[1] < H * 0.42);
    const cutR = sh.pts.length - 1 - [...sh.pts].reverse().findIndex((p) => p[1] < H * 0.42);

    // 左肩：从水面上来到顶面起点
    if (cutL > 1) {
      inkStroke(ctx, sh.pts.slice(0, cutL + 1), {
        color: '#4a5048', width: 1.6, alpha: 0.44, seed: 4412,
        dry: 0.1, layers: 1, taper: false, step: 5,
      });
    }
    // 顶面：最实的一段
    inkStroke(ctx, sh.pts.slice(cutL, cutR + 1), {
      color: '#3a3f38', width: 1.9, alpha: 0.62, seed: 4411,
      dry: 0.06, layers: 1, taper: false, step: 5,
    });
    // 右肩
    if (cutR < sh.pts.length - 1) {
      inkStroke(ctx, sh.pts.slice(cutR), {
        color: '#4a5048', width: 1.6, alpha: 0.44, seed: 4413,
        dry: 0.1, layers: 1, taper: false, step: 5,
      });
    }

    // 岩层线
    if (island === 'reef') {
      /* 岩纹：不能等长等距地横排，那样像横格纸。
         长短不一、起止错开，颜色更淡，才像石头的层理。 */
      const rr = mulberry32(4431);
      for (let i = 0; i < 9; i++) {
        const y = H * (0.385 + i * 0.028);
        // 越往下越宽，跟着岛形走
        const grow = 0.1 + i * 0.013;
        const halfW = W * grow;
        // 起点和终点各自随机偏移，长短就不齐
        const off = (rr() - 0.5) * W * 0.06;
        const shrink = 0.55 + rr() * 0.5;
        inkStroke(
          ctx,
          [
            [W * 0.46 - halfW + off, y],
            [W * 0.46 + off * 0.4, y + (rr() - 0.5) * 2.2],
            [W * 0.46 + halfW * shrink + off * 0.3, y + (rr() - 0.5) * 1.6],
          ],
          {
            color: '#6a7064',
            width: 0.85,
            alpha: 0.12 + rr() * 0.06,
            seed: 4413 + i * 7,
            wobble: 0.7,
            dry: 0.42,
            layers: 1,
            taper: false,
          }
        );
      }
    }

    /* 鸟要站在岛面上，不是全挤在一条线上。
       这里按岛顶的宽度和可用高度算一块落鸟区，
       用两个不同频率的随机把鸟铺开，看起来才像散落的。 */
    const perchX = (u) => sh.top.x - sh.top.span / 2 + u * sh.top.span;
    const perchY = (v) => sh.top.y - v * H * 0.055;

    // ── 假鸟：站在岛面上，数量对应档位
    // 假的要一眼看出是假的：灰白、僵直、亮度比真鸟低
    const n = decoy === 'few' ? 3 : decoy === 'mid' ? 12 : decoy === 'many' ? 28 : 0;
    for (let i = 0; i < n; i++) {
      const r2 = mulberry32(4500 + i * 13);
      // 越往后越靠里，形成前后两层，不叠在一处
      const u = (i + 0.5) / n + (r2() - 0.5) * (0.9 / n);
      const v = r2();
      glyph(ctx, perchX(Math.max(0.02, Math.min(0.98, u))), perchY(v), 0.78, '#e8e4d8', 0.9);
    }

    // ── 声音：从岛向外扩散的弧
    if (sound) {
      const rings = sound === 'day' ? 2 : sound === 'dusk' ? 4 : 6;
      const reach = sound === 'day' ? 0.1 : sound === 'dusk' ? 0.19 : 0.28;
      // 夜晚档位才画，白天档只在近处
      const cx = sh.top.x;
      const cy = sh.top.y + H * 0.05;
      for (let i = 0; i < rings; i++) {
        const ph = (t * 0.22 + i / rings) % 1;
        const rr = W * reach * ph;
        ctx.save();
        ctx.strokeStyle = hexA('#6d8f8a', 0.3 * (1 - ph));
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(cx, cy, rr, Math.PI * 1.08, Math.PI * 1.92);
        ctx.stroke();
        ctx.restore();
      }
    }

    // ── 真鸟
    if (birds > 0) {
      const show = Math.min(birds, 40);
      for (let i = 0; i < show; i++) {
        const r3 = mulberry32(4700 + i * 17);
        const grounded = i < Math.min(nests, show);
        let px;
        let py;
        if (grounded) {
          // 落在岛面上，铺开而不是排队
          const u = (i + 0.5) / Math.max(1, Math.min(nests, show)) + (r3() - 0.5) * 0.1;
          px = perchX(Math.max(0.03, Math.min(0.97, u)));
          py = perchY(0.15 + r3() * 0.8);
        } else {
          // 天上盘旋：分几层高度，不要挤成一个环
          const ang = r3() * Math.PI * 2 + t * 0.3;
          const rad = W * (0.1 + r3() * 0.3);
          const layer = H * (0.05 + r3() * 0.13);
          px = sh.top.x + Math.cos(ang) * rad;
          py = sh.top.y - layer + Math.sin(ang) * rad * 0.32;
        }
        glyph(ctx, px, py, 0.8 + r3() * 0.34, '#3a3f38', 0.5 + r3() * 0.36);
      }
    }
  }

  /* 还没选岛：画三座岛的剪影，让空画面有东西可看，
     但不标名字和序号——底部已经有三张带说明的卡，
     画布上再标一遍只会造成两套编号对不上。 */
  if (!island) {
    const opts = [
      { id: 'reef', cx: 0.19 },
      { id: 'sandbar', cx: 0.5 },
      { id: 'pond', cx: 0.81 },
    ];
    opts.forEach((op) => {
      const sh = islandShape(op.id, W, H);
      const dx = (op.cx - 0.45) * W;
      ctx.save();
      ctx.globalAlpha = 0.34;
      ctx.beginPath();
      ctx.moveTo(sh.pts[0][0] + dx, sh.pts[0][1]);
      for (let k = 1; k < sh.pts.length; k++) ctx.lineTo(sh.pts[k][0] + dx, sh.pts[k][1]);
      ctx.closePath();
      ctx.fillStyle = hexA('#8d948a', 0.26);
      ctx.fill();
      ctx.strokeStyle = hexA('#4a5048', 0.55);
      ctx.lineWidth = 1.6;
      ctx.stroke();
      ctx.restore();
    });
  }

  // 角章
  seal(ctx, W - 46, H - 44, {
    size: 42,
    text: '守',
    color: '#9d3a30',
    alpha: 0.26,
    seed: 4801,
    rotate: -0.05,
  });
}

/** 一只燕鸥：两段弧做翅膀，一点做身体 */
export function glyph(ctx, x, y, scale = 1, color = '#3a3f38', alpha = 0.7) {
  const s = 7 * scale;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(0.7, 1.2 * scale);

  // 浅色的鸟在浅色岛面上会糊掉，先垫一层极淡的暗边
  const lum = parseInt(color.slice(1, 3), 16);
  if (lum > 200) {
    ctx.strokeStyle = 'rgba(58,63,56,0.18)';
    ctx.lineWidth = Math.max(1.4, 2.2 * scale);
    ctx.beginPath();
    ctx.moveTo(x - s * 1.5, y + s * 0.24);
    ctx.quadraticCurveTo(x - s * 0.6, y - s * 0.5, x, y);
    ctx.quadraticCurveTo(x + s * 0.6, y - s * 0.5, x + s * 1.5, y + s * 0.24);
    ctx.stroke();
  }

  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(0.7, 1.2 * scale);
  ctx.beginPath();
  ctx.moveTo(x - s * 1.5, y + s * 0.24);
  ctx.quadraticCurveTo(x - s * 0.6, y - s * 0.5, x, y);
  ctx.quadraticCurveTo(x + s * 0.6, y - s * 0.5, x + s * 1.5, y + s * 0.24);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, y + s * 0.8);
  ctx.stroke();
  ctx.restore();
}

/** 两个十六进制色按 t 混合 */
function mix(a, b, t) {
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

/**
 * 礁岩轮廓：左端进水，右端出水，顶面是一排高低不齐的岩齿。
 * 这样才有礁石的样子，圆滑的钟形曲线一律不行。
 */
function reefOutline(w, h, seaY) {
  const left = w * 0.15;
  const right = w * 0.775;
  const topY = h * 0.375;
  const pts = [];

  // 左侧入水，几段折线爬到顶面
  pts.push([left, seaY + 4]);
  pts.push([left + w * 0.018, h * 0.552]);
  pts.push([left + w * 0.042, h * 0.468]);
  pts.push([left + w * 0.082, h * 0.414]);
  pts.push([left + w * 0.14, h * 0.386]);

  // 顶面：一串岩齿，高低错落
  const teeth = 9;
  const span = right - left - w * 0.26;
  for (let i = 0; i <= teeth; i++) {
    const u = i / teeth;
    const x = left + w * 0.15 + span * u;
    // 奇数齿高、偶数齿低，再加一点不对称
    const dip = i % 2 === 0 ? h * 0.004 : h * 0.018;
    pts.push([x, topY + dip]);
  }

  // 右侧下水
  const rx = left + w * 0.15 + span;
  pts.push([rx + w * 0.05, h * 0.402]);
  pts.push([rx + w * 0.086, h * 0.446]);
  pts.push([rx + w * 0.116, h * 0.508]);
  pts.push([rx + w * 0.136, h * 0.566]);
  pts.push([right, seaY + 4]);
  return pts;
}
