/**
 * geo.js — 投影与省域边界渲染
 *
 * 用真实经纬度画浙江，不做地图库那套。
 * 投影用等距圆柱加纬度余弦补偿，5 个纬度范围内误差小于 0.5%。
 */

import { inkStroke, washFill, hexA, mulberry32 } from './brush.js';

/* ────────────────────────── 投影 ────────────────────────── */

export const PROJ = {
  lon0: 118.0,
  lat0: 31.6,
  latMid: 29.2,
};

const COS_MID = Math.cos((PROJ.latMid * Math.PI) / 180);

/**
 * 经纬度 → 单位坐标（未缩放）
 * 返回 [u, v]，u 向东为正，v 向南为正。
 */
export function project(lon, lat) {
  const u = (lon - PROJ.lon0) * COS_MID;
  const v = -(lat - PROJ.lat0);
  return [u, v];
}

/**
 * 构造一个把经纬度映射到画布像素的映射器。
 * @param {object} bbox  {minU,maxU,minV,maxV} 单位坐标包围盒
 * @param {object} rect  {x,y,w,h} 画布上的目标矩形
 * @param {boolean} fitWidth 是否按宽度铺满（长卷模式用 true）
 */
export function makeMapper(bbox, rect, fitWidth = true) {
  const du = bbox.maxU - bbox.minU || 1;
  const dv = bbox.maxV - bbox.minV || 1;

  let scale;
  if (fitWidth) {
    scale = rect.w / du;
  } else {
    scale = Math.min(rect.w / du, rect.h / dv);
  }

  const drawnW = du * scale;
  const drawnH = dv * scale;
  const ox = rect.x + (rect.w - drawnW) / 2;
  const oy = rect.y + (rect.h - drawnH) / 2;

  return {
    scale,
    drawnW,
    drawnH,
    toPx(lon, lat) {
      const [u, v] = project(lon, lat);
      return [
        ox + (u - bbox.minU) * scale,
        oy + (v - bbox.minV) * scale,
      ];
    },
    bbox,
  };
}

/** 从 GeoJSON 计算单位坐标包围盒，可选 padding（单位坐标） */
export function computeBBox(geojson, padding = 0) {
  let minU = Infinity;
  let maxU = -Infinity;
  let minV = Infinity;
  let maxV = -Infinity;

  const walk = (coords) => {
    if (typeof coords[0] === 'number') {
      const [u, v] = project(coords[0], coords[1]);
      if (u < minU) minU = u;
      if (u > maxU) maxU = u;
      if (v < minV) minV = v;
      if (v > maxV) maxV = v;
    } else {
      for (const c of coords) walk(c);
    }
  };

  for (const f of geojson.features) walk(f.geometry.coordinates);

  return {
    minU: minU - padding,
    maxU: maxU + padding,
    minV: minV - padding,
    maxV: maxV + padding,
  };
}

/* ────────────────────────── 边界提取 ────────────────────────── */

/**
 * 从 GeoJSON 提取每个地市的环列表（外环 + 内环），已投影到像素。
 * 返回 [{ name, rings: [[ [x,y], ... ], ...] }]
 */
export function buildShapes(geojson, mapper) {
  const out = [];

  for (const f of geojson.features) {
    const name = f.properties.name || f.properties.NAME || '';
    const g = f.geometry;
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
    const kept = [];

    for (const poly of polys) {
      for (const ring of poly) {
        // 投影
        const pts = ring.map(([lon, lat]) => mapper.toPx(lon, lat));

        // 面积过滤：太小的岛屿直接扔（舟山有 94 个多边形，全画会糊）
        const area = Math.abs(ringArea(pts));
        const minArea = mapper.drawnW * mapper.drawnH * 0.00012;
        if (area < minArea) continue;

        kept.push(pts);
      }
    }

    if (kept.length) out.push({ name, rings: kept });
  }

  // 大块在前，小岛在后，避免描边被盖住
  out.sort((a, b) => ringArea(b.rings[0]) - ringArea(a.rings[0]));
  return out;
}

function ringArea(pts) {
  let s = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    s += pts[i][0] * pts[i + 1][1] - pts[i + 1][0] * pts[i][1];
  }
  return s / 2;
}

/* ────────────────────────── 渲染 ────────────────────────── */

/**
 * 把一个环画成有笔意的闭合轮廓。
 */
export function strokeRing(ctx, pts, o = {}) {
  const {
    color = '#3a3f38',
    width = 1.4,
    alpha = 0.72,
    seed = 1,
    wobble = 1.6,
    dry = 0.1,
  } = o;
  if (pts.length < 3) return;

  // 取稀疏一点的控制点，让抖动是「大笔触」而非「毛刺」
  const step = Math.max(1, Math.floor(pts.length / 220));
  const coarse = [];
  for (let i = 0; i < pts.length; i += step) coarse.push(pts[i]);
  coarse.push(pts[0]);

  inkStroke(ctx, coarse, {
    color,
    width,
    alpha,
    seed,
    wobble,
    jitter: 0.5,
    dry,
    layers: 2,
    taper: false,
    step: 4,
  });
}

/**
 * 画省域：填色 + 描边 + 内部一层淡皴。
 */
export function drawProvince(ctx, shapes, o = {}) {
  const {
    fill = '#7c9160',
    fillAlpha = 0.1,
    stroke = '#3a3f38',
    strokeWidth = 1.5,
    strokeAlpha = 0.75,
    seed = 100,
  } = o;

  // 先填
  for (const sh of shapes) {
    for (const ring of sh.rings) {
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(ring[0][0], ring[0][1]);
      for (let i = 1; i < ring.length; i++) ctx.lineTo(ring[i][0], ring[i][1]);
      ctx.closePath();
      ctx.fillStyle = hexA(fill, fillAlpha);
      ctx.fill();
      ctx.restore();
    }
  }

  // 再描边
  let idx = 0;
  for (const sh of shapes) {
    for (const ring of sh.rings) {
      strokeRing(ctx, ring, {
        color: stroke,
        width: strokeWidth,
        alpha: strokeAlpha,
        seed: seed + idx * 17,
      });
      idx++;
    }
  }
}

/**
 * 内部皴：在省域范围内撒一组短笔，模拟山峦起伏。
 * 只在陆地大块里画，跳过小岛。
 */
export function textureTerrain(ctx, shapes, o = {}) {
  const {
    color = '#5a625b',
    alpha = 0.16,
    seed = 200,
    perShape = 90,
    width = 1,
  } = o;
  const rnd = mulberry32(seed);
  let idx = 0;

  for (const sh of shapes) {
    const ring = sh.rings[0];
    if (!ring || ring.length < 10) continue;

    // 包围盒
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const [x, y] of ring) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }

    // 太小的块（岛屿）不画皴
    if ((maxX - minX) * (maxY - minY) < 2600) continue;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(ring[0][0], ring[0][1]);
    for (let i = 1; i < ring.length; i++) ctx.lineTo(ring[i][0], ring[i][1]);
    ctx.closePath();
    ctx.clip();

    const n = Math.round(perShape * Math.min(1.6, ((maxX - minX) * (maxY - minY)) / 90000));
    for (let i = 0; i < n; i++) {
      const x = minX + rnd() * (maxX - minX);
      const y = minY + rnd() * (maxY - minY);
      const len = 6 + rnd() * 16;
      const ang = -0.9 + rnd() * 0.55; // 大致朝右上
      const dx = Math.cos(ang) * len;
      const dy = Math.sin(ang) * len;
      inkStroke(
        ctx,
        [
          [x - dx * 0.5, y - dy * 0.5 + (rnd() - 0.5) * 3],
          [x, y + (rnd() - 0.5) * 2],
          [x + dx * 0.5, y + dy * 0.5],
        ],
        {
          color,
          width: width * (0.6 + rnd() * 0.7),
          alpha: alpha * (0.5 + rnd() * 0.7),
          seed: seed + idx * 997 + i * 13,
          wobble: 0.7,
          jitter: 0.4,
          dry: 0.34,
          layers: 1,
          taper: false,
          step: 3,
        }
      );
    }
    ctx.restore();
    idx++;
  }
}

/* ────────────────────────── 指北与小字 ────────────────────────── */

/** 画一个手绘风指北标 */
export function drawCompass(ctx, x, y, o = {}) {
  const { size = 34, color = '#5a625b', alpha = 0.55, seed = 301 } = o;
  const rnd = mulberry32(seed);

  // 圆
  const circle = [];
  for (let i = 0; i <= 28; i++) {
    const a = (i / 28) * Math.PI * 2;
    circle.push([x + Math.cos(a) * size * 0.5, y + Math.sin(a) * size * 0.5]);
  }
  inkStroke(ctx, circle, {
    color,
    width: 1,
    alpha: alpha * 0.8,
    seed,
    wobble: 0.5,
    dry: 0.1,
    layers: 1,
    taper: false,
    step: 3,
  });

  // 指北针：两片三角，一半实一半虚
  const tip = [x, y - size * 0.42];
  const left = [x - size * 0.13, y + size * 0.08];
  const right = [x + size * 0.13, y + size * 0.08];

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(tip[0], tip[1]);
  ctx.lineTo(left[0], left[1]);
  ctx.lineTo(x, y + size * 0.22);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = alpha * 0.35;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(tip[0], tip[1]);
  ctx.lineTo(right[0], right[1]);
  ctx.lineTo(x, y + size * 0.22);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // 「北」字
  ctx.save();
  ctx.globalAlpha = alpha * 0.7;
  ctx.fillStyle = color;
  ctx.font = '9px "Kaiti SC", KaiTi, 楷体, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('北', x, y - size * 0.72);
  ctx.restore();

  void rnd;
}
