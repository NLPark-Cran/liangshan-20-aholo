/**
 * birdscene.js — 观鸟手账的「找鸟」场景
 *
 * 玩法变了：原来点一下随机蹦一张记录卡，本质是抽奖机。
 * 现在整幅画就是一片生境，鸟真的藏在里面：草丛里、枝头上、水面上、芦苇后。
 * 玩家用望远镜视野扫过去，扫到了才记下来。稀有的鸟躲得更偏、更小。
 *
 * 这个文件只负责画和算位置，不碰 DOM。
 */

import { inkStroke, mulberry32, hexA, mistBand } from './brush.js';
import { mountain, treeShape, treeGroup, haze, water, reeds, bird as birdGlyph, stone } from './inkfig.js';
import { getBirdImage } from './birdimg.js';
import { stickerUrl } from './sticker.js';

/** 望远镜有效半径（相对画布短边），birding.js 判定命中时也用它 */
export const LENS_R = 0.26;

/**
 * 生成一局：把该地点这一季能遇到的鸟，按稀有度决定「出现几只、藏在哪」。
 *
 * @param {object} site  birds.js 的地点
 * @param {object} log   已记录（用来决定要不要给新种）
 * @param {object} o
 *   seed, w, h
 * @returns {{birds: Array, deco: object}}
 */
export function buildScene(site, log, o = {}) {
  const { w = 1200, h = 700, seed = 12345 } = o;
  const rnd = mulberry32(seed);

  const pool = site.species;
  const birds = [];

  // 常客一定在，稀有的一局只给一两只，神级的经常整局不出现
  const byRarity = { C: [], U: [], R: [], M: [], X: [] };
  pool.forEach((sp) => {
    const k = sp.r || 'C';
    (byRarity[k] || byRarity.C).push(sp);
  });

  const quota = {
    C: Math.min(byRarity.C.length, 3),
    U: Math.min(byRarity.U.length, rnd() < 0.55 ? 2 : 1),
    R: rnd() < 0.5 ? Math.min(byRarity.R.length, 1) : 0,
    M: rnd() < 0.16 ? Math.min(byRarity.M.length, 1) : 0,
    X: rnd() < 0.03 ? Math.min(byRarity.X.length, 1) : 0,
  };

  ['C', 'U', 'R', 'M', 'X'].forEach((k) => {
    const list = byRarity[k] || [];
    if (!list.length) return;
    const n = quota[k];
    // 不重复地在同类里抽
    const copy = [...list];
    for (let i = 0; i < n && copy.length; i++) {
      const idx = Math.floor(rnd() * copy.length);
      const sp = copy.splice(idx, 1)[0];
      birds.push(sp);
    }
  });

  // 给每只鸟分配一个藏身点：按生境类型决定分布区
  const spots = placeSpots(site.scene, birds.length, w, h, rnd);
  birds.forEach((sp, i) => {
    sp._x = spots[i].x;
    sp._y = spots[i].y;
    // 稀有度决定半径：越稀有越小、越难扫到
    sp._r =
      sp.r === 'X' ? 15 : sp.r === 'M' ? 18 : sp.r === 'R' ? 21 : sp.r === 'U' ? 25 : 29;
    // 会动：翅膀抖动相位
    sp._ph = rnd() * Math.PI * 2;
    sp._drift = sp.r === 'C' ? 0.7 : 0.32;
    // 真实贴图地址（可能为 null，绘制时回退手绘）
    sp._img = stickerUrl(sp.s);
  });

  return { birds, seed };
}

/**
 * 不同生境的藏身区域不同：
 *   ridge 山脊 → 都贴在脊线上（猛禽贴线飞）
 *   lake/wetland → 水面与岸边
 *   forest → 树冠层
 *   tidal → 泥滩与低处
 *   island → 礁石顶部与空中
 */
function placeSpots(kind, n, w, h, rnd) {
  const spots = [];
  for (let i = 0; i < n; i++) {
    let x;
    let y;
    switch (kind) {
      case 'ridge':
        x = w * (0.14 + rnd() * 0.72);
        // 贴着脊线上下浮动
        y = h * (0.3 + Math.sin((x / w) * Math.PI * 2.2) * 0.06 + rnd() * 0.09);
        break;
      case 'lake':
        x = w * (0.12 + rnd() * 0.76);
        y = h * (0.56 + rnd() * 0.3);
        break;
      case 'wetland':
        x = w * (0.1 + rnd() * 0.8);
        y = h * (0.5 + rnd() * 0.34);
        break;
      case 'forest':
        x = w * (0.1 + rnd() * 0.8);
        y = h * (0.32 + rnd() * 0.3);
        break;
      case 'tidal':
        x = w * (0.1 + rnd() * 0.8);
        y = h * (0.58 + rnd() * 0.26);
        break;
      case 'island':
        x = w * (0.16 + rnd() * 0.68);
        y = h * (0.3 + rnd() * 0.34);
        break;
      case 'reed':
        x = w * (0.1 + rnd() * 0.8);
        y = h * (0.52 + rnd() * 0.28);
        break;
      default:
        x = w * (0.12 + rnd() * 0.76);
        y = h * (0.42 + rnd() * 0.3);
    }
    spots.push({ x, y });
  }
  return spots;
}

/**
 * 画整幅生境。鸟本身也画，但很小很淡：要找才看得见。
 *
 * @param {object} s
 *   sceneKind, birds, t（秒）, found（已找到的 id 集合）, w, h, dpr
 */
export function drawBirdScene(canvas, s = {}) {
  if (!canvas || !canvas.isConnected) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const rect = canvas.getBoundingClientRect();
  const w = Math.max(rect.width, 320);
  const h = Math.max(rect.height, 260);
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }

  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  const { sceneKind = 'ridge', birds = [], t = 0, found = new Set(), seed = 12345 } = s;
  const rnd = mulberry32(seed);

  // 天色
  const sky = ctx.createLinearGradient(0, 0, 0, h * 0.7);
  sky.addColorStop(0, hexA('#dfe6e2', 0.66));
  sky.addColorStop(1, hexA('#f4efe4', 0));
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h * 0.72);

  // 云
  mistBand(ctx, { x: 0, y: h * 0.06, w, h: h * 0.2 }, { alpha: 0.4, seed: seed + 3, bands: 2 });

  // 生境本体
  switch (sceneKind) {
    case 'ridge':
      drawRidge(ctx, w, h, seed, rnd);
      break;
    case 'lake':
      drawLake(ctx, w, h, seed, rnd);
      break;
    case 'wetland':
      drawWetland(ctx, w, h, seed, rnd);
      break;
    case 'forest':
      drawForest(ctx, w, h, seed, rnd);
      break;
    case 'island':
      drawIsland(ctx, w, h, seed, rnd);
      break;
    case 'tidal':
      drawTidal(ctx, w, h, seed, rnd);
      break;
    case 'reed':
      drawReed(ctx, w, h, seed, rnd);
      break;
    default:
      drawRidge(ctx, w, h, seed, rnd);
  }

  /* 鸟：有真实贴图就画贴图，没有才回退到手绘轮廓。
     贴图在 birdimg.js 里已经做过去饱和和压墨，能融进纸面。 */
  birds.forEach((b, i) => {
    const got = found.has(`${b.s}-${i}`);
    const bob = Math.sin(t * 1.6 + b._ph) * 2.2 * b._drift;
    const sway = Math.sin(t * 5 + b._ph) * 1.6;
    const px = b._x + sway;
    const py = b._y + bob;

    const pic = b._img ? getBirdImage(b._img) : null;
    if (pic) {
      // 贴图比手绘面积大，按半径换算成边长
      const side = b._r * 2.6;
      ctx.save();
      ctx.globalAlpha = got ? 0.94 : 0.62;
      // 越稀有的越淡，逼玩家凑近看
      if (!got) ctx.globalAlpha *= b.r === 'X' ? 0.7 : b.r === 'M' ? 0.82 : 1;
      ctx.drawImage(pic, px - side / 2, py - side / 2, side, side);
      ctx.restore();
    } else {
      birdGlyph(ctx, px, py, {
        size: b._r,
        color: got ? '#9d3a30' : '#2f3a35',
        alpha: got ? 0.92 : 0.42,
        seed: 300 + i * 13,
      });
    }

    if (got) {
      // 已记录：细虚线一圈，不要抢画面
      const rr = b._r * 1.35;
      ctx.save();
      ctx.strokeStyle = 'rgba(157,58,48,0.34)';
      ctx.lineWidth = 0.9;
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.arc(px, py, rr, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  });

  // 望远镜视野：中心保持原样，四周压暗
  const cx = s.lensX ?? -999;
  const cy = s.lensY ?? -999;
  if (cx > 0 && cy > 0) {
    const R = Math.min(w, h) * LENS_R;
    ctx.save();

    // 用 evenodd 把「整幅减去一个圆」这条路填成暗色，圆内完全不动
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(28,31,29,0.52)';
    ctx.fill('evenodd');

    // 镜圈
    ctx.strokeStyle = 'rgba(244,239,228,0.62)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.stroke();

    // 内圈淡描，像镜片边缘
    ctx.strokeStyle = 'rgba(244,239,228,0.2)';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(cx, cy, R - 3, 0, Math.PI * 2);
    ctx.stroke();

    // 十字细线
    ctx.strokeStyle = 'rgba(244,239,228,0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - R * 0.2, cy);
    ctx.lineTo(cx - R * 0.06, cy);
    ctx.moveTo(cx + R * 0.06, cy);
    ctx.lineTo(cx + R * 0.2, cy);
    ctx.moveTo(cx, cy - R * 0.2);
    ctx.lineTo(cx, cy - R * 0.06);
    ctx.moveTo(cx, cy + R * 0.06);
    ctx.lineTo(cx, cy + R * 0.2);
    ctx.stroke();

    ctx.restore();
  }
}

/* ────────────────────────── 各生境 ────────────────────────── */

function drawRidge(ctx, w, h, seed, rnd) {
  // 远山先垫一层，把纵深推开
  mountain(ctx, w, h, {
    seed: seed + 91,
    ridgeY: h * 0.34,
    amp: h * 0.1,
    y0: h * 0.62,
    peaks: 2.9,
    tone: '#8b9484',
    toneAlpha: 0.06,
    lineColor: '#7b8478',
    lineAlpha: 0.2,
    lineWidth: 1,
    texture: 1,
  });

  mountain(ctx, w, h, {
    seed,
    ridgeY: h * 0.42,
    amp: h * 0.17,
    y0: h,
    peaks: 2.3,
    tone: '#5a6b4e',
    toneAlpha: 0.1,
    lineColor: '#3a3f38',
    lineAlpha: 0.38,
    lineWidth: 1.4,
    texture: 2,
  });

  // 坡面：几道顺着山势的枯笔，山的体积才立得住
  for (let i = 0; i < 7; i++) {
    const y0 = h * (0.5 + i * 0.062);
    const wob = (rnd() - 0.5) * 10;
    inkStroke(
      ctx,
      [
        [w * (0.03 + rnd() * 0.2), y0],
        [w * (0.3 + rnd() * 0.2), y0 + wob * 0.5],
        [w * (0.55 + rnd() * 0.3), y0 + wob],
      ],
      {
        color: '#5a625b',
        width: 0.8,
        alpha: 0.1,
        seed: seed + 210 + i * 13,
        wobble: 0.7,
        dry: 0.4,
        layers: 1,
        taper: false,
      }
    );
  }

  haze(ctx, w, h * 0.62, { alpha: 0.6, seed: seed + 21, height: h * 0.05 });

  // 山脚：一片起雾的滩地，把下半幅填实，别留死白
  const flat = ctx.createLinearGradient(0, h * 0.66, 0, h);
  flat.addColorStop(0, hexA('#7c9160', 0.06));
  flat.addColorStop(1, hexA('#b1813f', 0.1));
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(0, h * 0.7);
  ctx.bezierCurveTo(w * 0.28, h * 0.66, w * 0.66, h * 0.74, w, h * 0.69);
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.closePath();
  ctx.fillStyle = flat;
  ctx.fill();
  ctx.restore();

  // 田垄：几道顺着地势的横线
  for (let i = 0; i < 7; i++) {
    const y = h * (0.74 + i * 0.036);
    inkStroke(
      ctx,
      [
        [w * (0.02 + rnd() * 0.08), y],
        [w * (0.36 + rnd() * 0.2), y + (rnd() - 0.5) * 3],
        [w * (0.72 + rnd() * 0.24), y - (rnd() - 0.5) * 2],
      ],
      {
        color: '#8d948a',
        width: 0.9,
        alpha: 0.14,
        seed: seed + 810 + i * 11,
        wobble: 0.6,
        dry: 0.34,
        layers: 1,
        taper: false,
      }
    );
  }

  // 山脚几丛树，给鸟落
  for (let i = 0; i < 5; i++) {
    treeShape(ctx, w * (0.08 + i * 0.21 + rnd() * 0.03), h * (0.88 + rnd() * 0.05), {
      size: 34 + rnd() * 26,
      seed: seed + 400 + i * 17,
      alpha: 0.4,
      canopyAlpha: 0.14,
      shape: i % 3 === 0 ? 'pine' : 'round',
    });
  }

  // 近处一丛芦苇，压住下缘
  for (let i = 0; i < 7; i++) {
    const x = w * (0.02 + i * 0.045 + rnd() * 0.02);
    inkStroke(
      ctx,
      [
        [x, h * 0.995],
        [x + (rnd() - 0.5) * 4, h * (0.9 + rnd() * 0.04)],
        [x + (rnd() - 0.5) * 6, h * (0.855 + rnd() * 0.03)],
      ],
      {
        color: '#5a625b',
        width: 1,
        alpha: 0.26,
        seed: seed + 950 + i * 9,
        layers: 1,
        dry: 0.22,
        taper: false,
      }
    );
  }
}

function drawLake(ctx, w, h, seed, rnd) {
  mountain(ctx, w, h, {
    seed,
    ridgeY: h * 0.32,
    amp: h * 0.1,
    y0: h * 0.5,
    peaks: 2,
    tone: '#7c9160',
    toneAlpha: 0.08,
    lineColor: '#5a625b',
    lineAlpha: 0.24,
    lineWidth: 1.1,
    texture: 1,
  });
  haze(ctx, w, h * 0.5, { alpha: 0.72, seed: seed + 21, height: h * 0.05 });
  water(ctx, 0, h * 0.5, h, { seed: seed + 31, rows: 7, alpha: 0.28 });
  // 池杉：直立的细树干，成排
  for (let i = 0; i < 9; i++) {
    const x = w * (0.06 + i * 0.105 + rnd() * 0.02);
    const y = h * (0.62 + rnd() * 0.22);
    inkStroke(ctx, [[x, y], [x + (rnd() - 0.5) * 2, y - 34 - rnd() * 26]], {
      color: '#5a625b',
      width: 1.4,
      alpha: 0.34,
      seed: seed + 600 + i * 9,
      layers: 1,
      dry: 0.2,
      taper: true,
    });
  }
}

function drawWetland(ctx, w, h, seed, rnd) {
  mountain(ctx, w, h, {
    seed,
    ridgeY: h * 0.3,
    amp: h * 0.08,
    y0: h * 0.44,
    peaks: 1.8,
    tone: '#7c9160',
    toneAlpha: 0.07,
    lineColor: '#5a625b',
    lineAlpha: 0.2,
    lineWidth: 1,
    texture: 1,
  });
  haze(ctx, w, h * 0.44, { alpha: 0.7, seed: seed + 21, height: h * 0.05 });
  water(ctx, 0, h * 0.5, h, { seed: seed + 51, rows: 5, alpha: 0.24 });
  for (let i = 0; i < 6; i++) {
    treeShape(ctx, w * (0.08 + i * 0.17), h * (0.54 + rnd() * 0.06), {
      size: 24 + rnd() * 14,
      seed: seed + 800 + i * 11,
      alpha: 0.32,
      canopyAlpha: 0.11,
    });
  }
}

function drawForest(ctx, w, h, seed, rnd) {
  mountain(ctx, w, h, {
    seed,
    ridgeY: h * 0.36,
    amp: h * 0.14,
    y0: h,
    peaks: 2.2,
    tone: '#4d5c3d',
    toneAlpha: 0.14,
    lineColor: '#3a3f38',
    lineAlpha: 0.36,
    lineWidth: 1.4,
    texture: 2,
  });
  // 前景树冠：鸟藏在里面
  for (let i = 0; i < 7; i++) {
    treeShape(ctx, w * (0.05 + i * 0.15 + rnd() * 0.03), h * (0.84 + rnd() * 0.08), {
      size: 46 + rnd() * 30,
      seed: seed + 700 + i * 17,
      alpha: 0.42,
      canopyAlpha: 0.16,
      shape: i % 4 === 1 ? 'pine' : 'round',
    });
  }
}

function drawIsland(ctx, w, h, seed, rnd) {
  const seaY = h * 0.56;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, seaY, w, h - seaY);
  const g = ctx.createLinearGradient(0, seaY, 0, h);
  g.addColorStop(0, hexA('#6d8f8a', 0.16));
  g.addColorStop(1, hexA('#6d8f8a', 0.05));
  ctx.fillStyle = g;
  ctx.fill();
  ctx.restore();
  water(ctx, 0, seaY, h, { seed: seed + 31, rows: 6, alpha: 0.26 });
  // 岛体
  inkStroke(
    ctx,
    [
      [w * 0.2, seaY + 2],
      [w * 0.29, h * 0.3],
      [w * 0.42, h * 0.25],
      [w * 0.52, h * 0.38],
      [w * 0.58, seaY + 2],
    ],
    { color: '#3a3f38', width: 1.7, alpha: 0.5, seed: seed + 41, dry: 0.12, layers: 2 }
  );
  // 礁石
  stone(ctx, w * 0.45, h * 0.44, { seed: seed + 77, w: 34, h: 18, alpha: 0.34 });
}

function drawTidal(ctx, w, h, seed, rnd) {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(0, h * 0.54);
  ctx.bezierCurveTo(w * 0.3, h * 0.49, w * 0.7, h * 0.6, w, h * 0.53);
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.closePath();
  const g = ctx.createLinearGradient(0, h * 0.5, 0, h);
  g.addColorStop(0, hexA('#b1813f', 0.16));
  g.addColorStop(1, hexA('#8d948a', 0.16));
  ctx.fillStyle = g;
  ctx.fill();
  ctx.restore();
  for (let i = 0; i < 9; i++) {
    const y = h * (0.6 + i * 0.045);
    inkStroke(ctx, [[0, y], [w, y + (rnd() - 0.5) * 2]], {
      color: '#8d948a',
      width: 0.7,
      alpha: 0.2,
      seed: seed + 900 + i,
      layers: 1,
      dry: 0.34,
      taper: false,
    });
  }
  haze(ctx, w, h * 0.55, { alpha: 0.6, seed: seed + 5, height: h * 0.06 });
}

function drawReed(ctx, w, h, seed, rnd) {
  drawWetland(ctx, w, h, seed, rnd);
  // 芦苇：藏鸟的地方
  for (let i = 0; i < 16; i++) {
    const x = w * (0.02 + i * 0.062 + rnd() * 0.02);
    inkStroke(
      ctx,
      [
        [x, h * 0.99],
        [x + (rnd() - 0.5) * 4, h * (0.72 + rnd() * 0.08)],
        [x + (rnd() - 0.5) * 7, h * (0.58 + rnd() * 0.1)],
      ],
      {
        color: '#5a625b',
        width: 1.1,
        alpha: 0.34,
        seed: seed + 320 + i * 9,
        layers: 1,
        dry: 0.2,
        taper: false,
      }
    );
  }
}
