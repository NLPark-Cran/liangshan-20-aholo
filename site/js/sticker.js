/**
 * sticker.js — 鸟类贴纸（花叔开源贴纸库）
 *
 * 只用于「观鸟观测手账」这一块的鸟类插图。
 * 长卷的六个场景仍然全部由代码绘制，没有一张位图。
 *
 * 数据来源：https://github.com/alchaincyf/huashu-bird-sticker
 * 授权：CC BY 4.0（署名见页面「资料来源」与手账底部）
 * 图片走 jsDelivr CDN，本地只存 index（data/stickers.json，53 种，7KB）
 */

const INDEX_URL = 'data/stickers.json';

let index = null; // { cdn, license, source, species: { 中文名: {file, sci, en} } }
let loading = null;

/** 加载索引，只请求一次 */
export function loadStickerIndex() {
  if (index) return Promise.resolve(index);
  if (loading) return loading;

  loading = fetch(INDEX_URL)
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => {
      index = d;
      return d;
    })
    .catch(() => {
      index = null;
      return null;
    });

  return loading;
}

/**
 * 取某个中文种名的贴纸地址。
 * 索引没加载完或该种没有贴纸时返回 null，调用方自己回退到手绘轮廓。
 */
export function stickerUrl(zhName) {
  if (!index || !index.species) return null;
  const it = index.species[zhName];
  if (!it || !it.file) return null;
  return `${index.cdn}/${it.file}`;
}

/** 署名行，贴在手账底部 */
export function stickerCredit() {
  if (!index) return '';
  return `鸟类插图：<a href="https://birdalbum.com" target="_blank" rel="noopener">Bird Album</a> / <a href="https://github.com/alchaincyf/huashu-bird-sticker" target="_blank" rel="noopener">huashu-bird-sticker</a>，CC BY 4.0`;
}

/**
 * 预热若干张贴纸。
 * CDN 单张要 1-2 秒，翻页后才开始下载会看到空白。
 * 进入手账时先悄悄拉几张高概率出现的，翻页时就基本命中了。
 */
export function warmUp(zhNames = []) {
  if (!index) return;
  zhNames.forEach((n) => {
    const u = stickerUrl(n);
    if (!u) return;
    const img = new Image();
    img.decoding = 'async';
    img.src = u;
  });
}
