/**
 * ledger-panorama.js — 一亩山的账本：二十年的全景
 *
 * 这一版把画法整个换掉了。
 * 之前用一条手绘脊线加两块渐变，山出来像两个馒头：
 * 没有皴法、没有明暗、没有体积，矿坑像水波纹，树像十字符号。
 *
 * 现在改用 inkfig 里真正的画山函数：
 *   mountain()  带皴法、苔点、分脉、阴面
 *   terraceBands() 山脚的梯田
 *   treeGroup()    成片的树
 *   house()        村舍
 * 山形本身会随开采塌下去，矿坑做成真正的凹口而不是一圈同心圆，
 * 关矿之后矿坑逐年回填、苔点逐年长回来。
 */

import {
  haze,
  water,
  reeds,
  terraceBands,
  furrows,
  groundWash,
  mist,
} from './inkfig.js';
import { inkStroke, mulberry32, hexA, rockCluster, washFill, paperGrain, seal } from './brush.js';

/* ────────────────────────── 山形 ────────────────────────── */

/**
 * 造一座山的剖面。
 * 关键：开采会让山脊在山腰处塌下去，形成一个缺口，
 * 这个缺口就是矿坑所在，而不是在山体上另画一个圆。
 */
function ridgeProfile(o) {
  const { w, h, mineDepth = 0, hp = 1, seed = 1, baseY, amp } = o;
  const rnd = mulberry32(seed);
  const n = 260;
  const pts = [];

  /* 三座峰，中间留出鞍部。
     用 max 而不是 sum：相加会叠成一整片高原，
     取最大值才能让峰与峰之间有真正的谷。 */
  const peaks = [
    { cx: 0.235, sigma: 0.115, h: 1.0 },
    { cx: 0.475, sigma: 0.085, h: 0.58 },
    { cx: 0.775, sigma: 0.125, h: 0.86 },
  ];

  for (let i = 0; i <= n; i++) {
    const t = i / n;
    let y = 0;
    peaks.forEach((p) => {
      const d = (t - p.cx) / p.sigma;
      y = Math.max(y, p.h * Math.exp(-d * d * 0.5));
    });

    /* 山脚向外收，两端要落到零，不能顶到画面边缘 */
    const edge = Math.min(t / 0.07, (1 - t) / 0.07, 1);
    y *= Math.max(0, Math.min(1, edge));

    // 山脊的小起伏：越靠山顶越硬
    y += (Math.sin(t * 31 + seed * 0.1) * 0.008 + Math.sin(t * 73 + seed) * 0.004) * (0.5 + y);

    /* 塌陷：矿在主峰右侧的山腰，挖得越狠缺口越深。
       左壁陡（切坡），右壁缓（排土场）。 */
    if (mineDepth > 0.02) {
      const c = 0.3;
      const wide = 0.045 + mineDepth * 0.07;
      if (t > c - wide && t < c + wide * 1.7) {
        const u = (t - (c - wide)) / (wide * 2.7);
        const w2 = u < 0.4 ? (u / 0.4) ** 0.65 : 1 - (u - 0.4) / 0.6;
        y -= Math.max(0, w2) * mineDepth * 0.66 * (0.55 + y * 0.6);
      }
    }

    // 山头被削平：开采久了，峰顶也会矮一截
    if (mineDepth > 0.3 && t > 0.17 && t < 0.32) {
      const flat = (mineDepth - 0.3) / 0.7;
      y = Math.min(y, 0.88 - flat * 0.08);
    }

    pts.push([t, Math.max(0.015, y)]);
  }

  return pts.map(([t, v]) => [w * t, baseY - v * amp]);
}

/* ────────────────────────── 主绘制 ────────────────────────── */

export function drawLedgerPanorama(canvas, s = {}) {
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
    year = 2005,
    health = 100,
    mineDepth = 0,
    cash = 320,
    closed = false,
    seed = 9001,
    /* 有 3D 主体时，2D 只当远景：天空 + 远山，不画主山和村落，
       否则两层各有一座山，会打架。 */
    farOnly = false,
  } = s;

  const hp = Math.max(0, Math.min(100, health)) / 100;
  const md = Math.max(0, Math.min(1, mineDepth));
  const rnd = mulberry32(seed);
  const soot = md * (1 - hp * 0.55);

  const baseY = H * 0.5;
  const amp = H * 0.26;
  const footY = H * 0.74;

  /* ── 纸底 ── */
  groundWash(ctx, {
    w: W,
    y0: H * 0.72,
    y1: H,
    color: '#b8a887',
    alpha: 0.1,
    seed,
  });

  /* ── 天：随开采变浊 ── */
  const sky = ctx.createLinearGradient(0, 0, 0, H * 0.6);
  sky.addColorStop(0, hexA(blend3('#c9b58e', '#dfe9e4', '#e8e2d2', hp), 0.85));
  sky.addColorStop(0.65, hexA('#f4efe4', 0.1));
  sky.addColorStop(1, hexA('#f4efe4', 0));
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H * 0.64);

  /* ── 粉尘：开采最盛时天上挂着一层土黄 ── */
  if (soot > 0.15) {
    for (let i = 0; i < 4; i++) {
      mist(ctx, {
        x: W * (0.04 + i * 0.26),
        y: H * (0.12 + rnd() * 0.16),
        w: W * 0.36,
        h: H * 0.1,
        seed: seed + 11 + i * 7,
        strength: 0.22 * soot + 0.08,
        blobs: 4,
      });
    }
  }

  /* ── 远山：三层，越远越淡，这是国画里推空间的唯一办法 ── */
  const farLayers = [
    { y: 0.36, a: 0.085, amp: 0.062, peaks: 0.9, tone: '#8b9484' },
    { y: 0.4, a: 0.13, amp: 0.075, peaks: 0.66, tone: '#7b8478' },
    { y: 0.435, a: 0.16, amp: 0.088, peaks: 0.5, tone: '#6f776c' },
  ];
  farLayers.forEach((L, i) => {
    const pts2 = ridgeProfile({
      w: W,
      h: H,
      seed: seed + 40 + i * 17,
      baseY: H * L.y,
      amp: H * L.amp,
      mineDepth: 0,
      hp: 1,
    });
    // 远山不要矿坑，也不要那么尖
    const soft = pts2.map(([x, y], k) => [x, y + Math.sin(k * 0.09 + i) * H * 0.004]);

    /* 远山只填到山脚，不铺到画面下半。
       三层都填到 0.72 的话，叠起来就是一块灰雾，
       整幅画的中段会被糊死。底边还要做出起伏，
       否则会留下一条水平的硬边。 */
    const footBase = L.y + L.amp * 0.9;
    const bottom = [];
    const steps = 28;
    for (let s = 0; s <= steps; s++) {
      const u = s / steps;
      bottom.push([W * (1 - u), H * (footBase + Math.sin(u * 9 + i * 2) * 0.012)]);
    }
    washFill(ctx, [...soft, ...bottom], {
      color: L.tone,
      alpha: L.a,
      seed: seed + 60 + i,
    });
    inkStroke(ctx, soft, {
      color: L.tone,
      width: 1,
      alpha: 0.16 + i * 0.05,
      seed: seed + 80 + i * 9,
      wobble: 0.7,
      dry: 0.4,
      layers: 1,
      taper: false,
    });
  });

  /* ── 只画远景时到此为止：主山交给 3D，这里不再画第二座 ── */
  if (farOnly) {
    // 山脚留一层薄雾，让 3D 模型的下部能自然地“长”在纸面上
    haze(ctx, W, H * 0.62, {
      alpha: 0.34,
      seed: seed + 71,
      height: H * 0.07,
      bands: 3,
    });
    paperGrain(ctx, W, H, { alpha: 0.05, seed: seed + 900 });
    return;
  }

  /* ── 主山 ── */
  const ridge = ridgeProfile({
    w: W,
    h: H,
    seed: seed + 3,
    baseY,
    amp,
    mineDepth: md,
    hp,
  });

  /* 山体填色：只在山脊附近着墨，往下很快归纸。
     国画的山体不靠大面积平涂，靠脊线加皴擦。 */
  const tone = hp > 0.62 ? '#6f8a58' : hp > 0.34 ? '#8a8a5a' : '#a1854f';
  const fillBottom = baseY + amp * 0.26;
  const off = document.createElement('canvas');
  off.width = Math.round(W * dpr);
  off.height = Math.round(H * dpr);
  const oc = off.getContext('2d');
  oc.setTransform(dpr, 0, 0, dpr, 0, 0);

  oc.beginPath();
  oc.moveTo(ridge[0][0], ridge[0][1]);
  for (let i = 1; i < ridge.length; i++) oc.lineTo(ridge[i][0], ridge[i][1]);
  oc.lineTo(W, fillBottom);
  oc.lineTo(0, fillBottom);
  oc.closePath();
  const mg = oc.createLinearGradient(0, baseY - amp, 0, fillBottom);
  mg.addColorStop(0, hexA(tone, 0.16 + hp * 0.08));
  mg.addColorStop(0.3, hexA(tone, 0.06 + hp * 0.03));
  mg.addColorStop(0.62, hexA(tone, 0.015));
  mg.addColorStop(1, hexA(tone, 0));
  oc.fillStyle = mg;
  oc.fill();

  // 在离屏上擦两端，不影响底下的天空
  oc.globalCompositeOperation = 'destination-out';
  const fl = oc.createLinearGradient(0, 0, W * 0.16, 0);
  fl.addColorStop(0, 'rgba(0,0,0,1)');
  fl.addColorStop(0.55, 'rgba(0,0,0,0.75)');
  fl.addColorStop(1, 'rgba(0,0,0,0)');
  oc.fillStyle = fl;
  oc.fillRect(0, 0, W * 0.16, H);
  const fr = oc.createLinearGradient(W, 0, W * 0.84, 0);
  fr.addColorStop(0, 'rgba(0,0,0,1)');
  fr.addColorStop(0.55, 'rgba(0,0,0,0.75)');
  fr.addColorStop(1, 'rgba(0,0,0,0)');
  oc.fillStyle = fr;
  oc.fillRect(W * 0.84, 0, W * 0.16, H);

  ctx.drawImage(off, 0, 0, W, H);

  /* 脊下暗带：山脊重、坡面淡，体积就出来了 */
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(ridge[0][0], ridge[0][1]);
  for (let i = 1; i < ridge.length; i++) ctx.lineTo(ridge[i][0], ridge[i][1]);
  for (let i = ridge.length - 1; i >= 0; i--) {
    ctx.lineTo(ridge[i][0], ridge[i][1] + amp * 0.1 * (0.5 + i / ridge.length));
  }
  ctx.closePath();
  ctx.fillStyle = hexA(tone, 0.2 + hp * 0.1);
  ctx.fill();
  ctx.restore();

  /* 阴面：左坡受光，右坡压深。只在山脊下方一带，别铺到山脚 */
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(ridge[0][0], ridge[0][1]);
  for (let i = 1; i < ridge.length; i++) ctx.lineTo(ridge[i][0], ridge[i][1]);
  ctx.lineTo(W, fillBottom);
  ctx.lineTo(0, fillBottom);
  ctx.closePath();
  ctx.clip();
  const sh = ctx.createLinearGradient(W * 0.3, 0, W * 0.95, 0);
  sh.addColorStop(0, hexA('#3a3f38', 0));
  sh.addColorStop(0.5, hexA('#3a3f38', 0.07 + md * 0.04));
  sh.addColorStop(1, hexA('#3a3f38', 0.015));
  ctx.fillStyle = sh;
  ctx.fillRect(0, 0, W, fillBottom);
  ctx.restore();

  /* ── 皴法：短而斜的笔触，贴着坡面走 ──
     原来只往正下方落笔，方向全一样，看着像下雨。
     国画的披麻皴是顺着坡势斜着走的，长短交错。 */
  const cunCount = Math.round(150 + (1 - hp) * 70);
  for (let i = 0; i < cunCount; i++) {
    const t = (i + 0.5) / cunCount;
    const idx = Math.floor(t * (ridge.length - 1));
    const [px, py] = ridge[idx];
    // 坡的走向：山脊线在这一点的斜率
    const dx = ridge[Math.min(ridge.length - 1, idx + 1)][0] - ridge[Math.max(0, idx - 1)][0];
    const dy = ridge[Math.min(ridge.length - 1, idx + 1)][1] - ridge[Math.max(0, idx - 1)][1];
    const sl = Math.abs(dx) > 1e-3 ? dy / dx : 0;

    // 笔触从山脊下方一点起，顺着坡往下，斜着走
    const drop = H * (0.012 + rnd() * 0.05);
    const len = H * (0.014 + rnd() * 0.03); // 短，不要长
    const lean = (rnd() - 0.5) * 0.8 + sl * 0.35; // 沿坡倾斜

    const sx = px + (rnd() - 0.5) * 4;
    const sy = py + drop;
    const path = [];
    const seg = 3;
    for (let k = 0; k <= seg; k++) {
      const u = k / seg;
      path.push([sx + lean * len * u + (rnd() - 0.5) * 1.2, sy + len * u]);
    }
    inkStroke(ctx, path, {
      color: hp > 0.5 ? '#44503a' : '#5c4a2e',
      width: 0.7 + rnd() * 0.5,
      alpha: 0.1 + rnd() * 0.14,
      seed: seed + 200 + i * 13,
      wobble: 0.4,
      jitter: 0.2,
      dry: 0.3,
      layers: 2,
      taper: true,
    });
  }

  /* ── 分脉：几道沿坡而下的石纹，把山体分成几块 ──
     笔触要跟着坡走，不能竖直落下，否则和皴法一样像雨。 */
  const topIdx = ridge.reduce((best, p, i) => (p[1] < ridge[best][1] ? i : best), 0);
  for (let v = 0; v < 5; v++) {
    const side = v % 2 === 0 ? 1 : -1;
    let st = topIdx + side * Math.round((0.04 + rnd() * 0.1) * ridge.length);
    st = Math.max(1, Math.min(ridge.length - 2, st));
    const p0 = ridge[st];

    // 沿坡向外的分量：左右坡向不同
    const outward = side * (0.3 + rnd() * 0.5);
    const depth = amp * (0.3 + rnd() * 0.5);
    const path = [];
    for (let i = 0; i <= 5; i++) {
      const u = i / 5;
      path.push([
        p0[0] + outward * depth * u + (rnd() - 0.5) * 2.5,
        p0[1] + depth * u * 0.85,
      ]);
    }
    inkStroke(ctx, path, {
      color: hp > 0.5 ? '#2f3a2b' : '#4a3a22',
      width: 0.9,
      alpha: 0.14 + rnd() * 0.12,
      seed: seed + 700 + v * 23,
      wobble: 0.7,
      jitter: 0.3,
      dry: 0.3,
      layers: 2,
      taper: true,
    });
  }

  /* ── 山脊线：全幅最实的一笔。
     layers 必须给 2：只有最上层才是满墨，
     layers=1 时那一层只有 30% 墨，脊线会虚掉。
     分段画是为了避开飞白在长线上断开。 ── */
  const seg = Math.ceil(ridge.length / 3);
  for (let i = 0; i < 3; i++) {
    const part = ridge.slice(Math.max(0, i * seg - 3), Math.min(ridge.length, (i + 1) * seg + 3));
    if (part.length < 2) continue;
    inkStroke(ctx, part, {
      color: hp > 0.5 ? '#20251c' : '#3f3320',
      width: 2.4,
      alpha: 0.72 + hp * 0.12,
      seed: seed + 13,
      wobble: 0.4,
      jitter: 0.3,
      dry: 0,
      layers: 2,
      step: 3,
      taper: false,
    });
  }

  /* ── 矿坑：真正的凹口，不是同心圆 ── */
  if (md > 0.04) {
    drawPit(ctx, {
      W, H, ridge, md, tone, seed, closed, hp,
    });
  }

  /* ── 苔点：树与石上的点，健康时密，被挖时只剩零星 ── */
  const mossCount = Math.round(hp * 120);
  for (let i = 0; i < mossCount; i++) {
    const t = 0.06 + rnd() * 0.88;
    const idx = Math.floor(t * (ridge.length - 1));
    const [px, py] = ridge[idx];
    const dy = rnd() * amp * 0.34;
    ctx.save();
    ctx.globalAlpha = 0.1 + rnd() * 0.22;
    ctx.fillStyle = '#2f3a29';
    ctx.beginPath();
    ctx.ellipse(px + (rnd() - 0.5) * 7, py + dy, 1.1 + rnd() * 1.5, 0.8 + rnd() * 1.1, rnd() * 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /* ── 山脚：梯田 + 田垄，把中景填实 ── */
  /* 先铺一层地面：山脚到村落之间原来是一片空的，
     上下连不上，画面会断成两截。 */
  const gy0 = fillBottom - H * 0.01;
  const gy1 = H * 0.9;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(0, gy0);
  ctx.bezierCurveTo(W * 0.3, gy0 - H * 0.012, W * 0.7, gy0 + H * 0.016, W, gy0 - H * 0.004);
  ctx.lineTo(W, gy1);
  ctx.lineTo(0, gy1);
  ctx.closePath();
  const gg = ctx.createLinearGradient(0, gy0, 0, gy1);
  gg.addColorStop(0, hexA(hp > 0.5 ? '#8fa06a' : '#b3a070', 0.14));
  gg.addColorStop(0.5, hexA(hp > 0.5 ? '#8fa06a' : '#b3a070', 0.08));
  gg.addColorStop(1, hexA(hp > 0.5 ? '#8fa06a' : '#b3a070', 0.02));
  ctx.fillStyle = gg;
  ctx.fill();
  ctx.restore();

  terraceBands(ctx, {
    cx: W * 0.5,
    cy: H * 0.78,
    span: W * 0.62,
    top: H * 0.735,
    bottom: H * 0.8,
    rows: 5,
    color: hp > 0.5 ? '#8a9a6a' : '#b0a068',
    alpha: 0.32,
    seed: seed + 41,
  });
  furrows(ctx, {
    x0: 0,
    x1: W,
    yNear: H * 0.87,
    yFar: H * 0.805,
    vanishX: W * 0.5,
    rows: 7,
    color: hp > 0.5 ? '#7f9060' : '#a89a66',
    alpha: 0.24,
    seed: seed + 51,
  });

  /* ── 树：健康才长得回来 ──
     treeShape 的针叶在远景尺寸下太细，树冠撑不起来，
     远看像一排光秃的枝杈。这里自己画：湿墨点出冠的块面，
     再压几笔枝干，远看就是树。 */
  const drawTree = (tx, ty, ts, tone) => {
    const r2 = mulberry32(seed + Math.round(tx) + Math.round(ty));
    // 冠：两三个重叠的湿墨团
    const lobes = 2 + Math.floor(r2() * 2);
    ctx.save();
    for (let k = 0; k < lobes; k++) {
      const ox = (r2() - 0.5) * ts * 0.62;
      const oy = -ts * (0.5 + r2() * 0.26);
      const rr = ts * (0.28 + r2() * 0.16);
      ctx.beginPath();
      ctx.ellipse(tx + ox, ty + oy, rr, rr * (0.78 + r2() * 0.2), (r2() - 0.5) * 0.5, 0, Math.PI * 2);
      ctx.fillStyle = hexA(tone, 0.26 + hp * 0.2);
      ctx.fill();
    }
    ctx.restore();

    // 树干
    inkStroke(
      ctx,
      [
        [tx, ty],
        [tx + (r2() - 0.5) * 2, ty - ts * 0.42],
      ],
      {
        color: '#3a332a',
        width: Math.max(0.9, ts * 0.045),
        alpha: 0.34 + hp * 0.2,
        seed: seed + 810 + Math.round(tx),
        wobble: 0.3,
        dry: 0.1,
        layers: 2,
        taper: true,
      }
    );
  };

  const clumps = Math.round(3 + hp * 9);
  for (let i = 0; i < clumps; i++) {
    const x = W * (0.46 + (i / Math.max(1, clumps)) * 0.52 + rnd() * 0.025);
    const y = H * (0.8 + rnd() * 0.05);
    drawTree(x, y, 18 + rnd() * 16, hp > 0.5 ? '#44543a' : '#5c5236');
  }
  for (let i = 0; i < Math.round(2 + hp * 3); i++) {
    drawTree(W * (0.03 + rnd() * 0.13), H * (0.81 + rnd() * 0.04), 15 + rnd() * 12, hp > 0.5 ? '#44543a' : '#5c5236');
  }

  /* ── 村舍：收入越高房子越多，这是账本落到人家的地方 ──
     brush.house 只描线且墨色很淡，远处看着像空框。
     这里自己画：屋身填色、屋顶填色、再压一道深线。 */
  const houses = Math.max(3, Math.min(15, Math.round((cash / 320) * 11)));
  for (let i = 0; i < houses; i++) {
    const col = i % 5;
    const row = Math.floor(i / 5);
    const hx = W * (0.05 + col * 0.062 + rnd() * 0.014);
    const hy = H * (0.815 + row * 0.042 + rnd() * 0.008);
    const hs = 15 + rnd() * 6;
    const dir = rnd() > 0.5 ? 1 : -1;
    const a = 0.5 + hp * 0.24;

    // 屋身
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(hx - hs * 0.42 * dir, hy);
    ctx.lineTo(hx - hs * 0.42 * dir, hy + hs * 0.44);
    ctx.lineTo(hx + hs * 0.42 * dir, hy + hs * 0.44);
    ctx.lineTo(hx + hs * 0.42 * dir, hy);
    ctx.closePath();
    ctx.fillStyle = hexA('#efe6d2', a * 0.9);
    ctx.fill();
    ctx.restore();

    // 屋顶：黛瓦，压得比墙深
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(hx - hs * 0.56 * dir, hy);
    ctx.lineTo(hx, hy - hs * 0.46);
    ctx.lineTo(hx + hs * 0.56 * dir, hy);
    ctx.closePath();
    ctx.fillStyle = hexA('#4a4034', a * 0.85);
    ctx.fill();
    ctx.restore();

    // 勾轮廓
    inkStroke(
      ctx,
      [
        [hx - hs * 0.56 * dir, hy],
        [hx, hy - hs * 0.46],
        [hx + hs * 0.56 * dir, hy],
      ],
      { color: '#3a332a', width: 1, alpha: a * 0.9, seed: seed + 500 + i * 11, wobble: 0.4, dry: 0.05, layers: 2, taper: false }
    );
    inkStroke(
      ctx,
      [
        [hx - hs * 0.42 * dir, hy],
        [hx - hs * 0.42 * dir, hy + hs * 0.44],
        [hx + hs * 0.42 * dir, hy + hs * 0.44],
        [hx + hs * 0.42 * dir, hy],
      ],
      { color: '#3a332a', width: 0.8, alpha: a * 0.7, seed: seed + 600 + i * 13, wobble: 0.3, dry: 0.05, layers: 2, taper: false }
    );
  }

  /* 村道：一条从村口通往山脚的土路，把上下连起来 */
  inkStroke(
    ctx,
    [
      [W * 0.2, H * 0.83],
      [W * 0.31, H * 0.81],
      [W * 0.37, H * 0.775],
      [W * 0.4, H * 0.75],
    ],
    {
      color: '#7a7058',
      width: 1.4,
      alpha: 0.22,
      seed: seed + 611,
      wobble: 1,
      dry: 0.35,
      layers: 1,
      taper: false,
    }
  );

  /* ── 近处：水塘与芦苇，压住画面下缘 ── */
  water(ctx, W * 0.02, H * 0.9, H * 0.99, {
    seed: seed + 61,
    rows: 3,
    alpha: 0.12 + hp * 0.1,
  });
  for (let i = 0; i < 8; i++) {
    reeds(ctx, W * (0.03 + i * 0.055 + rnd() * 0.02), H * 0.965, {
      seed: seed + 700 + i * 9,
      count: 3,
      size: 18 + rnd() * 10,
      alpha: 0.2,
    });
  }

  /* ── 雾：从山脚升起，越脏越浓 ── */
  haze(ctx, W, H * 0.7, {
    alpha: 0.5 - md * 0.16,
    seed: seed + 71,
    height: H * 0.06,
    bands: 3,
  });

  /* ── 纸纹压在最后，让整幅像画在纸上 ── */
  paperGrain(ctx, W, H, { alpha: 0.05, seed: seed + 900 });

  /* ── 状态标签：左上角，别被顶栏压住 ── */
  ctx.save();
  ctx.font = '13px "Kaiti SC", KaiTi, 楷体, serif';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillStyle = hexA(soot > 0.3 ? '#7a5a2c' : '#5a625b', 0.72);
  const label = closed
    ? hp > 0.72
      ? '山养回来了'
      : hp > 0.42
        ? '还在缓'
        : '刚停下'
    : md > 0.45
      ? '山一直在被挖'
      : '还在开采';
  ctx.fillText(label, 26, 46);
  ctx.restore();

  /* ── 角章 ── */
  seal(ctx, W - 46, H - 44, {
    size: 40,
    text: year >= 2025 ? '合' : '账',
    color: '#9d3a30',
    alpha: 0.22,
    seed: 9101,
    rotate: -0.05,
  });
}

/* ────────────────────────── 矿坑 ────────────────────────── */

/**
 * 矿坑要画成「山被啃掉一块」：
 *   坑内渐暗、坑壁有层理、坑底积一层浑水、坑口堆着碎石。
 * 关矿之后坑边开始长草，坑底的水变清。
 */
function drawPit(ctx, o) {
  const { W, H, ridge, md, seed, closed, hp } = o;
  const rnd = mulberry32(seed + 21);

  /* 矿坑位置不能用「脊线最低点」来找：
     2005 年塌陷还浅，整条线最低处是画面两端的山脚，
     坑就跑到边缘去了。按设计好的塌陷中心取点。 */
  const centerT = 0.3;
  const lowIdx = Math.max(
    1,
    Math.min(ridge.length - 2, Math.round(centerT * (ridge.length - 1)))
  );
  const [cx, cy] = ridge[lowIdx];

  const rx = W * (0.05 + md * 0.075);
  const ry = H * (0.022 + md * 0.055);

  /* 坑口两端要落在豁口的两个肩上，不然看起来像扣在山坡上的碗 */
  const half = Math.max(3, Math.round(rx / W * ridge.length));
  const lIdx = Math.max(0, lowIdx - half);
  const rIdx = Math.min(ridge.length - 1, lowIdx + half);
  const [lx, ly] = ridge[lIdx];
  const [rxp, ryp] = ridge[rIdx];

  /* 坑体：从豁口左肩挂下去，到右肩收回来。
     坑底比豁口低，坑壁向里收，才像被挖开的凹面。 */
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(lx, ly);
  ctx.bezierCurveTo(
    lx + (cx - lx) * 0.5, cy + ry * 1.1,
    cx - rx * 0.3, cy + ry * 1.25,
    cx, cy + ry * 1.2
  );
  ctx.bezierCurveTo(
    cx + rx * 0.32, cy + ry * 1.25,
    rxp - (rxp - cx) * 0.5, cy + ry * 1.05,
    rxp, ryp
  );
  ctx.lineTo(lx, ly);
  ctx.closePath();

  /* 坑内不能填成一块实心褐补丁。
     用「上缘透明、越往里越深」的渐变，
     让它像影子一样陷进山体，而不是贴上去的一张纸。 */
  const ig = ctx.createLinearGradient(0, cy - ry * 0.4, 0, cy + ry * 1.2);
  ig.addColorStop(0, 'rgba(74,58,34,0)');
  ig.addColorStop(0.18, 'rgba(84,64,36,0.34)');
  ig.addColorStop(0.62, 'rgba(66,54,38,0.54)');
  ig.addColorStop(1, 'rgba(44,40,32,0.62)');
  ctx.fillStyle = ig;
  ctx.fill();
  ctx.restore();

  /* 开采台面：一层层往里退的台阶，这是露天矿最醒目的特征 */
  const benches = Math.round(2 + md * 4);
  for (let i = 0; i < benches; i++) {
    const u = (i + 0.7) / (benches + 0.7);
    const shr = 0.78 - u * 0.5;
    const y0 = cy + ry * (0.12 + u * 0.9);
    const w0 = (rxp - lx) * shr * 0.5;
    const mx = (lx + rxp) / 2;
    inkStroke(
      ctx,
      [
        [mx - w0, y0],
        [mx - w0 * 0.3, y0 + ry * 0.06],
        [mx + w0 * 0.4, y0 + ry * 0.02],
        [mx + w0, y0 - ry * 0.04],
      ],
      {
        color: '#3a3226',
        width: 1.1,
        alpha: 0.18 + (1 - u) * 0.14,
        seed: seed + 820 + i * 11,
        wobble: 0.7,
        dry: 0.32,
        layers: 1,
        taper: false,
      }
    );
  }

  /* 坑壁的层理：几道顺着碗形的弧线 */
  const layers = Math.round(3 + md * 6);
  for (let i = 0; i < layers; i++) {
    const u = (i + 0.6) / (layers + 0.6);
    const yy = cy - ry * 0.1 + ry * 1.15 * u;
    const half = rx * (0.92 - u * 0.62);
    inkStroke(
      ctx,
      [
        [cx - half, yy - ry * 0.06],
        [cx - half * 0.3, yy + ry * 0.05],
        [cx + half * 0.5, yy],
        [cx + half, yy - ry * 0.05],
      ],
      {
        color: '#3a3226',
        width: 0.8,
        alpha: 0.1 + rnd() * 0.14,
        seed: seed + 900 + i * 9,
        wobble: 0.9,
        dry: 0.45,
        layers: 1,
        taper: false,
      }
    );
  }

  /* 坑底积水：关矿后变清，开采时是浑的 */
  if (md > 0.42) {
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(cx, cy + ry * 0.88, rx * 0.42, ry * 0.26, 0, 0, Math.PI * 2);
    ctx.fillStyle = closed ? hexA('#6d8f8a', 0.34) : hexA('#7a6a3c', 0.4);
    ctx.fill();
    ctx.restore();
  }

  /* 坑口碎石：挖一年堆一年，关矿后长草 */
  const rocks = Math.round(md * 11);
  for (let i = 0; i < rocks; i++) {
    const ang = rnd() * Math.PI;
    const px = cx + Math.cos(ang) * rx * (1.02 + rnd() * 0.2);
    const py = cy + Math.sin(ang) * ry * 0.5 + rnd() * ry * 0.7;
    rockCluster(ctx, px, py, {
      w: 8 + rnd() * 14,
      h: 5 + rnd() * 8,
      seed: seed + 300 + i * 23,
      alpha: 0.3,
      color: '#7a5a2c',
      strokes: 3,
    });
  }

  /* 关矿后坑边长草：几丛绿点 */
  if (closed && hp > 0.35) {
    for (let i = 0; i < Math.round(hp * 14); i++) {
      const px = cx + (rnd() - 0.5) * rx * 2.4;
      const py = cy + ry * (0.1 + rnd() * 0.7);
      ctx.save();
      ctx.globalAlpha = 0.14 + rnd() * 0.2;
      ctx.strokeStyle = '#5c7042';
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px + (rnd() - 0.5) * 3, py - 4 - rnd() * 5);
      ctx.stroke();
      ctx.restore();
    }
  }

  /* 坑口边缘：沿两个肩把开口勾住，只勾上缘，不勾坑底 */
  inkStroke(
    ctx,
    [
      [lx, ly],
      [lx + (cx - lx) * 0.45, ly + (cy - ly) * 0.25 + ry * 0.3],
      [cx, cy + ry * 0.5],
      [rxp - (rxp - cx) * 0.45, ryp + (cy - ryp) * 0.25 + ry * 0.3],
      [rxp, ryp],
    ],
    {
      color: '#3f3320',
      width: 1.6,
      alpha: 0.3,
      seed: seed + 950,
      wobble: 0.9,
      dry: 0.25,
      layers: 1,
      taper: false,
    }
  );
}

/* ────────────────────────── 小工具 ────────────────────────── */

/** 三个颜色按 t 混合（0 -> a，0.5 -> b，1 -> c） */
function blend3(a, b, c, t) {
  const k = Math.max(0, Math.min(1, t));
  if (k < 0.5) return blend(a, b, k * 2);
  return blend(b, c, (k - 0.5) * 2);
}

function blend(a, b, t) {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const k = Math.max(0, Math.min(1, t));
  const ch = (p, s) => (p >> s) & 255;
  const mix = (s) => Math.round(ch(pa, s) + (ch(pb, s) - ch(pa, s)) * k);
  const hex = (v) => v.toString(16).padStart(2, '0');
  return `#${hex(mix(16))}${hex(mix(8))}${hex(mix(0))}`;
}
