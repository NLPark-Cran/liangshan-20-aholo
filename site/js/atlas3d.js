/**
 * atlas3d.js — 3D 展台
 *
 * 一件展品一个圆形台座，沿一条直线摆开。镜头横向平移，走到谁面前就停谁。
 * 标题压在左上，资料是左下浮层卡，底部是胶片条索引，画面主体始终是模型本身。
 *
 * 三个取舍：
 * - 不用 OrbitControls。这里的动作是「沿展台走过去」，自由轨道会让视角失序。
 *   自己写一个带阻尼的轨道，俯仰和距离都有限制。
 * - 所有模型归一化到同一包围盒，各处才有可比的视觉尺度。
 * - 材质一律保持资产原样。之前统一抬 roughness 把水面抹成哑光白，是错的。
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from '../vendor/three/environments/RoomEnvironment.js';
import { MeshoptDecoder } from '../vendor/three/libs/meshopt_decoder.module.js';
// 文案与数据只有 points.js 一份来源，长卷和这里共用。
import SITE_POINTS from './points.js';

/* ────────────────────────── 展台编排 ────────────────────────── */

/**
 * 上台的点位与每件的朝向。名称、地区、文案、数据、引语一律取自 points.js。
 * 这里只决定「谁上台、朝哪边」；增删点位时改这一个表，别处不用动。
 * 有模型文件但没写进这张表的点位不会出现，反之也不会。
 */
const STAGE = [
  { id: 'yucun', yaw: -0.22 },
  { id: 'xiajiang', yaw: -0.10 },
  { id: 'xinxinqiao', yaw: Math.PI - 0.22 },
  { id: 'pujiang', yaw: -0.10 },
  { id: 'qianjiangyuan', yaw: -0.34 },
  { id: 'xixi', yaw: -0.18 },
  { id: 'yunhe', yaw: -0.22 },
  { id: 'sangji', yaw: -0.16 },
  { id: 'tengtou', yaw: -0.20 },
  { id: 'dachendao', yaw: 0.12 },
];

const POINTS = STAGE.map((s) => {
  const c = SITE_POINTS.find((p) => p.id === s.id);
  return { ...(c || { name: s.id, region: '', tag: '', lead: '', data: [] }), ...s };
});

/* ────────────────────────── 场景 ────────────────────────── */

const canvas = document.getElementById('stage');
const hud = document.getElementById('hud');
const film = document.getElementById('film');
const mark = document.getElementById('mark');
const card = document.getElementById('card');
const cardBody = document.getElementById('card-body');
const hint = document.getElementById('hint');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.06;

const scene = new THREE.Scene();
// canvas 透明，纸色底由 body 的渐变给，和整站同一个底
scene.fog = new THREE.Fog('#f4efe4', 15, 40);

// 环境贴图：水面要能反射，否则 PBR 只剩漫反射，看着发白。
// RoomEnvironment 是程序生成的光板，不额外下载资源。
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.45;
pmrem.dispose();

const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 200);

/* 光：一盏主光带阴影，一盏背部轮廓光，半球光压住暗部 */
const key = new THREE.DirectionalLight('#fff8ec', 2.6);
key.position.set(6, 12, 8);
key.castShadow = true;
key.shadow.mapSize.set(1024, 1024);
key.shadow.camera.near = 1;
key.shadow.camera.far = 60;
key.shadow.camera.left = -16;
key.shadow.camera.right = 16;
key.shadow.camera.top = 16;
key.shadow.camera.bottom = -16;
key.shadow.bias = -0.0005;
key.shadow.normalBias = 0.02;
// 场景基本静止，阴影按需重算。每帧重画几十万面的深度图，软件渲染下直接掉到个位数帧。
key.shadow.autoUpdate = false;
key.shadow.needsUpdate = true;
scene.add(key);

const rim = new THREE.DirectionalLight('#cfdfe6', 1.0);
rim.position.set(-8, 5, -10);
scene.add(rim);
scene.add(new THREE.HemisphereLight('#e6eef0', '#c8b79a', 1.0));
scene.add(new THREE.AmbientLight('#ffffff', 0.18));

/* 台座 */
const SPACING = 5.6;
for (let i = 0; i < POINTS.length; i++) {
  const pad = new THREE.Mesh(
    new THREE.CylinderGeometry(1.74, 1.8, 0.16, 72),
    new THREE.MeshStandardMaterial({ color: '#e9dfca', roughness: 0.95, metalness: 0 }),
  );
  pad.position.set(i * SPACING, -0.09, 0);
  pad.receiveShadow = true;
  pad.castShadow = true;
  scene.add(pad);

  const halo = new THREE.Mesh(
    new THREE.CircleGeometry(2.2, 64),
    new THREE.MeshBasicMaterial({ color: '#ddd0b6', transparent: true, opacity: 0.28 }),
  );
  halo.rotation.x = -Math.PI / 2;
  halo.position.set(i * SPACING, -0.17, 0);
  scene.add(halo);
}

/* ────────────────────────── 载入 ────────────────────────── */

const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);

const slots = POINTS.map(() => ({ group: null, ready: false }));

function normalize(root, target = 2.5) {
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.z) || 1;
  const s = target / maxDim;
  root.scale.setScalar(s);
  root.position.set(-center.x * s, -box.min.y * s, -center.z * s);
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
    const m = o.material;
    if (m) m.envMapIntensity = 0.8;
  });
  return { tris: countTris(root) };
}

function countTris(root) {
  let t = 0;
  root.traverse((o) => {
    if (o.isMesh && o.geometry) {
      const idx = o.geometry.index;
      t += (idx ? idx.count : o.geometry.attributes.position.count) / 3;
    }
  });
  return Math.round(t);
}

let loadedCount = 0;

function loadOne(i) {
  const p = POINTS[i];
  return new Promise((resolve) => {
    loader.load(
      `assets/models/${p.id}.min.glb`,
      (gltf) => {
        const holder = new THREE.Group();
        holder.add(gltf.scene);
        const info = normalize(gltf.scene);
        holder.position.set(i * SPACING, 0, 0);
        holder.rotation.y = p.yaw ?? -0.22;
        scene.add(holder);

        slots[i] = { group: holder, ready: true, tris: info.tris };
        loadedCount++;
        updateHud();
        updateFilm();
        resolve(true);
      },
      undefined,
      (err) => {
        console.warn('模型载入失败', p.id, err?.message);
        slots[i] = { group: null, ready: false, failed: true };
        loadedCount++;
        updateHud();
        updateFilm();
        resolve(false);
      },
    );
  });
}

async function loadAll() {
  await Promise.all(POINTS.map((_, i) => loadOne(i)));
}

/* ────────────────────────── 状态显示 ────────────────────────── */

function updateHud() {
  const ok = slots.filter((s) => s.ready).length;
  const pct = Math.round((ok / POINTS.length) * 100);
  hud.innerHTML =
    `<span class="hud__bar"><i style="width:${pct}%"></i></span>` +
    `<span><b>${String(active + 1).padStart(2, '0')}</b> / ${POINTS.length}</span>`;
}

function updateFilm() {
  film.innerHTML = POINTS.map((p, i) => {
    const s = slots[i];
    const state = s?.ready ? 'ready' : s?.failed ? 'failed' : 'loading';
    return `<button class="film__item${i === active ? ' is-on' : ''}" data-i="${i}" data-state="${state}"
      aria-current="${i === active ? 'true' : 'false'}">
      <span class="film__name">${p.name}</span>
      <span class="film__region">${p.region}</span>
    </button>`;
  }).join('');
  film.querySelectorAll('.film__item').forEach((el) => {
    el.addEventListener('click', () => focus(Number(el.dataset.i)));
  });
  const on = film.querySelector('.film__item.is-on');
  if (on && film.scrollWidth > film.clientWidth) {
    on.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }
}

/* ────────────────────────── 相机 ────────────────────────── */

let active = 0;
const cam = {
  x: 0,
  dist: 8.9,
  pitch: 0.54,
  // 平滑量
  cx: 0,
  cdist: 11.6,
  cpitch: 0.54,
};

function focus(i) {
  active = Math.max(0, Math.min(POINTS.length - 1, i));
  cam.x = active * SPACING;
  cam.dist = 8.9;
  cam.pitch = 0.54;
  showMark();
  showCard();
  updateHud();
  updateFilm();
  hideHint();
}

function showMark() {
  const p = POINTS[active];
  mark.querySelector('.mark__region').textContent = p.region || '';
  mark.querySelector('.mark__name').textContent = p.name;
  mark.querySelector('.mark__tag').textContent = p.tag || '';
  mark.classList.remove('is-swap');
  void mark.offsetWidth; // 重启动画
  mark.classList.add('is-swap');
}

function showCard() {
  const p = POINTS[active];

  const rows = (p.data || [])
    .slice(0, 4)
    .map(
      (d) => `<div class="row">
        <dt>${d.k}</dt>
        <dd><b>${d.v}</b>${d.note ? `<span>${d.note}</span>` : ''}${
          d.source ? `<i>${d.source}</i>` : ''
        }</dd>
      </div>`,
    )
    .join('');

  const quote = p.quote?.text
    ? `<blockquote class="quote">
         <p>${p.quote.text}</p>
         ${p.quote.cite ? `<cite>${p.quote.cite}</cite>` : ''}
       </blockquote>`
    : '';

  // 本组自撰的札记，与领导人引语分开呈现，不混成引语
  const note = p.note?.text
    ? `<div class="note">
         <p>${p.note.text}</p>
         ${p.note.cite ? `<cite>${p.note.cite}</cite>` : ''}
       </div>`
    : '';

  cardBody.innerHTML = `
    <p class="card__lead">${p.lead || ''}</p>
    ${rows ? `<dl class="rows">${rows}</dl>` : ''}
    ${quote}
    ${note}
  `;
  cardBody.scrollTop = 0;
}

const cardToggle = document.getElementById('card-toggle');
function setCard(open) {
  card.dataset.open = String(open);
  cardToggle.setAttribute('aria-expanded', String(open));
}
cardToggle.addEventListener('click', () => setCard(card.dataset.open !== 'true'));

function hideHint() {
  if (hint && !hint.classList.contains('is-off')) hint.classList.add('is-off');
}

/* ────────────────────────── 交互 ────────────────────────── */

let dragging = false;
let lastX = 0;
let lastY = 0;
let moved = 0;
let startX = 0;

canvas.addEventListener('pointerdown', (e) => {
  dragging = true;
  moved = 0;
  lastX = startX = e.clientX;
  lastY = e.clientY;
  canvas.setPointerCapture(e.pointerId);
});

canvas.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  const dx = e.clientX - lastX;
  const dy = e.clientY - lastY;
  lastX = e.clientX;
  lastY = e.clientY;
  moved += Math.abs(dx) + Math.abs(dy);
  cam.x -= dx * 0.011;
  cam.pitch = Math.min(1.02, Math.max(0.1, cam.pitch + dy * 0.0038));
  if (moved > 8) hideHint();
});

canvas.addEventListener('pointerup', (e) => {
  dragging = false;
  canvas.releasePointerCapture?.(e.pointerId);
  // 甩得够远就顺势翻到下一件，像翻书
  const fling = e.clientX - startX;
  if (Math.abs(fling) > 90) focus(active + (fling < 0 ? 1 : -1));
  else snapToNearest();
});

canvas.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    cam.dist = Math.min(15, Math.max(3.8, cam.dist + e.deltaY * 0.0055));
    hideHint();
  },
  { passive: false },
);

/** 松手后回到最近的展台，不允许停在两件之间 */
function snapToNearest() {
  const near = Math.round(cam.x / SPACING);
  if (near !== active) focus(near);
  else cam.x = active * SPACING;
}

addEventListener('keydown', (e) => {
  if (e.key === 'ArrowRight') { e.preventDefault(); focus(active + 1); }
  if (e.key === 'ArrowLeft') { e.preventDefault(); focus(active - 1); }
  if (e.key === 'Home') { e.preventDefault(); focus(0); }
  if (e.key === 'End') { e.preventDefault(); focus(POINTS.length - 1); }
});

/* ────────────────────────── 渲染 ────────────────────────── */

function resize() {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  const pr = renderer.getPixelRatio();
  if (canvas.width !== Math.round(w * pr) || canvas.height !== Math.round(h * pr)) {
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
}

const clock = new THREE.Clock();
let frames = 0;
let fpsT = performance.now();
let fps = 0;
let frameNo = 0;

/** 宽屏时把当前这件推到画面右半边，左手边留给标题和资料卡 */
function screenShift() {
  return camera.aspect < 1.05 ? 0 : 0.72;
}

/** 窄屏下方要留出资料抽屉的位置，模型整体上移一点 */
function liftY() {
  return camera.aspect < 1.05 ? 0.5 : 0;
}

function tick() {
  requestAnimationFrame(tick);
  resize();

  const k = (a, b, t) => a + (b - a) * t;
  cam.cx = k(cam.cx, cam.x, 0.085);
  cam.cdist = k(cam.cdist, cam.dist, 0.085);
  cam.cpitch = k(cam.cpitch, cam.pitch, 0.095);

  const t = clock.getElapsedTime();
  const bob = Math.sin(t * 0.45) * 0.035;

  // 视口窄时自动退远，避免只看得到半件。
  // 系数别太大：推太远会把模型压小、上下都留空。
  const pull = Math.max(0, 1.5 - camera.aspect) * 2.1;
  const dist = cam.cdist + pull;

  const shift = screenShift();
  camera.position.set(
    cam.cx - shift,
    Math.sin(cam.cpitch) * dist + bob,
    Math.cos(cam.cpitch) * dist,
  );
  // 注视点略低于模型中心，让台座落在画面下半部，上方留出天空；
  // 窄屏把注视点再压低，模型整体上移，给底部抽屉让位
  camera.lookAt(cam.cx + shift * 0.1, -0.18 - liftY(), 0);
  // 只有当前这件轻轻自转
  for (let i = 0; i < slots.length; i++) {
    const s = slots[i];
    if (!s?.group) continue;
    if (i === active) s.group.rotation.y += 0.0015;
  }
  if (++frameNo % 10 === 0) key.shadow.needsUpdate = true;

  renderer.render(scene, camera);

  frames++;
  const now = performance.now();
  if (now - fpsT > 1000) {
    fps = Math.round((frames * 1000) / (now - fpsT));
    frames = 0;
    fpsT = now;
    window.__fps = fps;
  }
}

/* ────────────────────────── 启动 ────────────────────────── */

// 窄屏默认把卡片收起，先让出画面
setCard(window.innerWidth > 860);
updateHud();
updateFilm();
focus(0);
addEventListener('resize', resize);
resize();
tick();

window.__atlas = {
  get ready() { return loadedCount; },
  get total() { return POINTS.length; },
  get tris() { return slots.reduce((a, s) => a + (s.tris || 0), 0); },
  get fps() { return fps; },
  focus,
};

setTimeout(() => document.getElementById('boot')?.classList.add('is-done'), 260);

loadAll().then(() => {
  updateHud();
  focus(0);
  window.__atlasDone = true;
});
