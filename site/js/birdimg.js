/**
 * birdimg.js — 把鸟类贴图加载并处理成水墨风格
 *
 * 贴图是彩色的透明 webp，直接画到生境上会像贴纸。
 * 这里做三件事：
 *   1. 去饱和，只留一点点原作的颜色倾向
 *   2. 把亮部往纸色靠、暗部往墨色靠，压成单色阶
 *   3. 缓存处理后的离屏 canvas，避免每帧重算
 */

const cache = new Map(); // url -> { img, canvas, ready }

/** 把图片处理成水墨小图 */
function inkify(img, size) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d');
  g.imageSmoothingQuality = 'high';

  // 按原始比例居中放进 size×size
  const s = Math.min(size / img.width, size / img.height);
  const w = img.width * s;
  const h = img.height * s;
  g.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);

  const data = g.getImageData(0, 0, size, size);
  const d = data.data;

  /* 目标不是「变灰」，而是「像用淡墨画的」：
     整体抬亮、压低对比，暗部只到中灰，
     这样贴在浅色纸面上不会像一块黑斑。 */
  const PAPER = [244, 239, 228];
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3];
    if (a < 8) continue;
    const lum = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) / 255;

    // 只保留 10% 原色
    const gray = lum * 255;
    let r = d[i] * 0.1 + gray * 0.9;
    let gg = d[i + 1] * 0.1 + gray * 0.9;
    let b = d[i + 2] * 0.1 + gray * 0.9;

    // 墨色上限压到中灰（约 0.55），再往纸色里掺一点
    const ink = Math.min(1, lum) ** 0.85; // 提亮暗部
    /* 用非线性拉开明暗：暗部保持结构，亮部大面积留白。
       线性映射会让整只鸟糊成一块灰。 */
    const depth = 0.1 + ink * ink * 0.62;
    r = 58 * depth + PAPER[0] * (1 - depth);
    gg = 63 * depth + PAPER[1] * (1 - depth);
    b = 56 * depth + PAPER[2] * (1 - depth);

    // 与原来的灰度做一次融合，保留一点结构
    d[i] = r * 0.68 + (d[i] * 0.1 + gray * 0.9) * 0.32;
    d[i + 1] = gg * 0.68 + (d[i + 1] * 0.1 + gray * 0.9) * 0.32;
    d[i + 2] = b * 0.68 + (d[i + 2] * 0.1 + gray * 0.9) * 0.32;
    d[i + 3] = Math.min(255, a * 1.05);
  }
  g.putImageData(data, 0, 0);
  return c;
}

/**
 * 预加载一批贴图。返回时全部就绪（或失败）。
 * @param {string[]} urls
 */
export function preloadBirds(urls) {
  const jobs = urls.filter((u) => u && !cache.has(u)).map(
    (u) =>
      new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.decoding = 'async';
        img.onload = () => {
          let canvas = null;
          try {
            canvas = inkify(img, 96);
          } catch (_) {
            // 跨域污染时退回原图（canvas 仍可 drawImage，只是取不到像素）
            canvas = null;
          }
          cache.set(u, { img, canvas, ready: true });
          resolve();
        };
        img.onerror = () => {
          cache.set(u, { img: null, canvas: null, ready: false });
          resolve();
        };
        img.src = u;
      })
  );
  return Promise.all(jobs);
}

/** 取一张已处理的贴图；没加载或失败返回 null，调用方回退手绘 */
export function getBirdImage(url) {
  const it = cache.get(url);
  if (!it || !it.ready) return null;
  return it.canvas || it.img || null;
}
