/**
 * splat.js — 极简 3DGS 渲染器
 *
 * 为什么不引第三方库：
 *   @mkkellogg/gaussian-splats-3d 需要 wasm 与 worker，配置重、体积大，
 *   而且它主要面向 .splat/.ply，对 spz 还要额外转换。
 *   群核返回的正是 spz（gzip 包着的 NGSP v3），格式很清楚，
 *   自己解一遍反而更可控，也能少几 MB 依赖。
 *
 * 支持：
 *   - gzip 解压（浏览器 DecompressionStream）
 *   - SPZ v3：int24 位置、uint8 颜色/透明度/尺度/旋转
 *   - WebGL 点精灵，按深度排序的近似（用点大小与 alpha 叠出体积感）
 */

/* ────────────────────────── 解析 ────────────────────────── */

/** 读 int24 小端，带符号 */
function i24(b, o) {
  let v = b[o] | (b[o + 1] << 8) | (b[o + 2] << 16);
  if (v & 0x800000) v -= 1 << 24;
  return v;
}

/* 颜色查表：28 万个点逐个算 pow 太慢，先把 256 个值算好 */
const SH_LUT = new Float32Array(256);
for (let v = 0; v < 256; v++) {
  // 反 SH DC 编码
  const c = (v / 255.0 - 0.5) / 0.15;
  // SH 常量 0.28209479177387814
  const lin = Math.max(0, Math.min(1, c * 0.28209479177387814 + 0.5));
  // 线性 -> sRGB
  const s = lin <= 0.0031308 ? lin * 12.92 : 1.055 * Math.pow(lin, 1 / 2.4) - 0.055;
  SH_LUT[v] = s;
}

function shToSrgb(v) {
  return SH_LUT[v];
}

/**
 * 解析 SPZ（已解压的 NGSP 数据）
 * @param {ArrayBuffer} buf
 */
export function parseSPZ(buf) {
  const d = new Uint8Array(buf);
  const dv = new DataView(buf);
  const magic = String.fromCharCode(d[0], d[1], d[2], d[3]);
  if (magic !== 'NGSP') throw new Error('不是 SPZ: ' + magic);

  const version = dv.getUint32(4, true);
  const count = dv.getUint32(8, true);
  const shDegree = d[12];
  const fracBits = d[13];
  if (version !== 3) throw new Error('只支持 SPZ v3，当前 ' + version);

  const shCoef = shDegree === 0 ? 0 : shDegree === 1 ? 3 : shDegree === 2 ? 8 : 15;
  const posStart = 16;
  const alphaStart = posStart + count * 9;
  const colStart = alphaStart + count;
  const scaleStart = colStart + count * 3;
  const rotStart = scaleStart + count * 3;
  // 位置要除以 2^fracBits 才是世界坐标
  const scale = 1 / (1 << fracBits);

  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 4); // rgba 0-1
  const scales = new Float32Array(count * 3);
  const rots = new Float32Array(count * 4);

  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;

  for (let i = 0; i < count; i++) {
    const p = posStart + i * 9;
    const x = i24(d, p) * scale;
    const y = i24(d, p + 3) * scale;
    const z = i24(d, p + 6) * scale;
    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (z > maxZ) maxZ = z;

    /* 颜色不是直接 sRGB，SPZ 存的是球谐 DC 分量：
         raw 先反编码成 SH 系数，再转线性色，最后转 sRGB。
       少了这一步，整幅会灰成一片。 */
    const c = colStart + i * 3;
    colors[i * 4] = shToSrgb(d[c]);
    colors[i * 4 + 1] = shToSrgb(d[c + 1]);
    colors[i * 4 + 2] = shToSrgb(d[c + 2]);
    /* 透明度：SPZ 存的 uint8 是已经 sigmoid 过的，
       直接当 alpha 用即可（1 表示几乎透明，241 表示很实）。 */
    colors[i * 4 + 3] = d[alphaStart + i] / 255;

    /* 尺度：存的是 log 尺度的量化值，要还原成实际大小。
       公式来自 3DGS 原始实现：scale = exp(v/255 * 4 - 10)。 */
    const s = scaleStart + i * 3;
    scales[i * 3] = Math.exp((d[s] / 255) * 4 - 10);
    scales[i * 3 + 1] = Math.exp((d[s + 1] / 255) * 4 - 10);
    scales[i * 3 + 2] = Math.exp((d[s + 2] / 255) * 4 - 10);

    // 旋转：uint8 编码的四元数
    const r = rotStart + i * 4;
    rots[i * 4] = d[r] / 127.5 - 1;
    rots[i * 4 + 1] = d[r + 1] / 127.5 - 1;
    rots[i * 4 + 2] = d[r + 2] / 127.5 - 1;
    rots[i * 4 + 3] = d[r + 3] / 127.5 - 1;
  }

  return {
    count,
    positions,
    colors,
    scales,
    rots,
    bounds: { min: [minX, minY, minZ], max: [maxX, maxY, maxZ] },
    shDegree,
  };
}

/** 用浏览器的 DecompressionStream 解 gzip */
export async function gunzip(buf) {
  const ds = new DecompressionStream('gzip');
  const stream = new Blob([buf]).stream().pipeThrough(ds);
  return await new Response(stream).arrayBuffer();
}

/** 下载并解析一个 spz */
export async function loadSPZ(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('下载失败 ' + res.status);
  const raw = await res.arrayBuffer();
  // 前两字节是 gzip 魔数就解压
  const head = new Uint8Array(raw, 0, 2);
  const isGzip = head[0] === 0x1f && head[1] === 0x8b;
  const buf = isGzip ? await gunzip(raw) : raw;
  return parseSPZ(buf);
}
