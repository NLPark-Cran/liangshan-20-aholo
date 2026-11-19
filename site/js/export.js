/**
 * export.js — 导出符合课程要求的手绘地图 PNG
 *
 * 课程硬指标：
 *   带透明通道的 PNG / ≥900×600 像素 / ≥300dpi
 *
 * 做法：
 *   1. 离屏 Canvas 按 4 倍超采样重绘（逻辑 900×600 → 输出 3600×2400）
 *   2. toBlob 得到 PNG
 *   3. 手写 pHYs 块声明 300dpi（Canvas 默认不写这个块）
 */

import { buildShapes, drawProvince, textureTerrain, drawCompass } from './geo.js';
import { seal } from './brush.js';

/* ────────────────────────── CRC32 ────────────────────────── */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf, start = 0, end = buf.length) {
  let c = 0xffffffff;
  for (let i = start; i < end; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

/* ────────────────────────── PNG 头注入 ────────────────────────── */

/**
 * 在 PNG 的 IHDR 之后插入 pHYs 块，声明 DPI。
 * @param {ArrayBuffer} buf 原始 PNG
 * @param {number} dpi 目标 DPI
 * @returns {Blob}
 */
function injectDPI(buf, dpi = 300) {
  const src = new Uint8Array(buf);

  // PNG 签名 8 字节
  const SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  for (let i = 0; i < 8; i++) {
    if (src[i] !== SIG[i]) {
      // 不是 PNG，原样返回
      return new Blob([buf], { type: 'image/png' });
    }
  }

  // 解析块，找到 IHDR 结束位置与是否已有 pHYs
  let pos = 8;
  let afterIHDR = -1;
  let hasPHYs = false;

  while (pos + 8 <= src.length) {
    const len = (src[pos] << 24) | (src[pos + 1] << 16) | (src[pos + 2] << 8) | src[pos + 3];
    const type = String.fromCharCode(src[pos + 4], src[pos + 5], src[pos + 6], src[pos + 7]);
    if (type === 'IHDR') afterIHDR = pos + 12 + len;
    if (type === 'pHYs') hasPHYs = true;
    if (type === 'IEND') break;
    pos += 12 + len;
  }

  if (hasPHYs || afterIHDR < 0) {
    return new Blob([buf], { type: 'image/png' });
  }

  // 构造 pHYs：9 字节数据
  const ppu = Math.round(dpi / 0.0254); // 每米像素数
  const data = new Uint8Array(9);
  data[0] = (ppu >>> 24) & 0xff;
  data[1] = (ppu >>> 16) & 0xff;
  data[2] = (ppu >>> 8) & 0xff;
  data[3] = ppu & 0xff;
  data[4] = data[0];
  data[5] = data[1];
  data[6] = data[2];
  data[7] = data[3];
  data[8] = 1; // 单位：米

  const typeBytes = [0x70, 0x48, 0x59, 0x73]; // "pHYs"
  const chunk = new Uint8Array(4 + 4 + 9 + 4);
  // 长度
  chunk[0] = 0;
  chunk[1] = 0;
  chunk[2] = 0;
  chunk[3] = 9;
  // 类型
  for (let i = 0; i < 4; i++) chunk[4 + i] = typeBytes[i];
  // 数据
  chunk.set(data, 8);
  // CRC 覆盖类型 + 数据
  const crc = crc32(chunk, 4, 17);
  chunk[17] = (crc >>> 24) & 0xff;
  chunk[18] = (crc >>> 16) & 0xff;
  chunk[19] = (crc >>> 8) & 0xff;
  chunk[20] = crc & 0xff;

  // 拼接
  const out = new Uint8Array(src.length + chunk.length);
  out.set(src.subarray(0, afterIHDR), 0);
  out.set(chunk, afterIHDR);
  out.set(src.subarray(afterIHDR), afterIHDR + chunk.length);

  return new Blob([out], { type: 'image/png' });
}

/* ────────────────────────── 导出主流程 ────────────────────────── */

/**
 * 导出手绘地图。
 * @param {object} o
 *   geojson  浙江边界数据
 *   points   点位数组 [{ name, lon, lat, index }]
 *   dpi      目标 DPI，默认 300
 *   logical  逻辑尺寸 { w, h }，默认 900×600
 *   scale    超采样倍数，默认 4
 */
export async function exportMap(o = {}) {
  const {
    geojson,
    points = [],
    dpi = 300,
    logical = { w: 900, h: 600 },
    scale = 4,
  } = o;

  const W = logical.w * scale;
  const H = logical.h * scale;

  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext('2d');

  // 透明背景（课程要求带透明通道，所以不铺底色）

  // 投影：按高度贴合，四周留出题名与印章的呼吸位
  const { makeMapper, computeBBox } = await import('./geo.js');
  const bbox = computeBBox(geojson, 0.035);
  // 右侧留 26% 给竖排题名，上下各留 8%
  const box = {
    x: logical.w * 0.2,
    y: logical.h * 0.07,
    w: logical.w * 0.66,
    h: logical.h * 0.86,
  };
  const mapper = makeMapper(bbox, box, false);

  // 整体放大
  ctx.save();
  ctx.scale(scale, scale);

  // 省域
  const shapes = buildShapes(geojson, mapper);
  drawProvince(ctx, shapes, {
    fill: '#7c9160',
    fillAlpha: 0.12,
    stroke: '#2b2f2b',
    strokeWidth: 1.6,
    strokeAlpha: 0.72,
    seed: 100,
  });

  // 内部皴法
  textureTerrain(ctx, shapes, {
    color: '#5a625b',
    alpha: 0.18,
    seed: 200,
    perShape: 70,
  });

  // 点位
  points.forEach((p, i) => {
    const [x, y] = mapper.toPx(p.lon, p.lat);

    // 标记：双圈 + 中心点
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.strokeStyle = '#9d3a30';
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.arc(x, y, 5.5, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = '#9d3a30';
    ctx.beginPath();
    ctx.arc(x, y, 2.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 竖排站名
    ctx.save();
    ctx.globalAlpha = 0.92;
    ctx.fillStyle = '#1c1f1d';
    ctx.font = '600 15px "Kaiti SC", KaiTi, 楷体, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const chars = [...p.name];
    chars.forEach((ch, k) => {
      ctx.fillText(ch, x, y + 13 + k * 17);
    });
    ctx.restore();

    // 序号
    ctx.save();
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = '#5a625b';
    ctx.font = '9px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(String(i + 1).padStart(2, '0'), x, y - 11);
    ctx.restore();
  });

  // 指北：放到右上角空白区
  drawCompass(ctx, logical.w - 44, logical.h * 0.13, { size: 26, alpha: 0.45, seed: 301 });

  // 印章：右下角，尺寸要放得下四个字
  seal(ctx, logical.w - 56, logical.h - 62, {
    size: 62,
    text: '两山廿年',
    color: '#9d3a30',
    alpha: 0.82,
    seed: 31,
    rotate: -0.04,
  });

  // 题名：左侧竖排，与地图留出空隙
  ctx.save();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';

  // 主标题
  ctx.fillStyle = 'rgba(28,31,29,0.9)';
  ctx.font = '600 22px "Kaiti SC", KaiTi, 楷体, serif';
  const title = '两山二十年';
  [...title].forEach((ch, i) => {
    ctx.fillText(ch, 34, 46 + i * 26);
  });

  // 副题：再往右一列
  ctx.fillStyle = 'rgba(90,98,91,0.7)';
  ctx.font = '9px "PingFang SC", "Microsoft YaHei", sans-serif';
  const sub = '绿水青山就是金山银山';
  [...sub].forEach((ch, i) => {
    ctx.fillText(ch, 66, 50 + i * 11.2);
  });

  // 更小的第三列：范围说明
  ctx.fillStyle = 'rgba(141,148,138,0.72)';
  ctx.font = '8px "PingFang SC", "Microsoft YaHei", sans-serif';
  const sub2 = '浙江六地 · 二〇〇五—二〇二五';
  [...sub2].forEach((ch, i) => {
    ctx.fillText(ch, 82, 54 + i * 9.6);
  });
  ctx.restore();

  ctx.restore();

  // 转 PNG 并注入 DPI
  const blob = await new Promise((resolve) => cv.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('导出失败：Canvas 未能生成图片');

  const buf = await blob.arrayBuffer();
  const out = injectDPI(buf, dpi);

  return {
    blob: out,
    width: W,
    height: H,
    dpi,
  };
}

/** 触发下载 */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
