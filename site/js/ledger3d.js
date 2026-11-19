/**
 * ledger3d.js — 账本的 3D 推演场
 *
 * 为什么要有这一层：
 *   账本原来是一幅 2D 水墨全景，好看但只能「看」。
 *   群核生成的三态山体模型（健康 / 开挖 / 恢复）能真的把
 *   「这座山被挖了二十年」变成可以绕着看的东西。
 *
 * 做法：
 *   三个 GLB 常驻场景，只在年份变化时调它们的不透明度与缩放。
 *   不是换模型，是让同一座山在三种状态之间过渡，
 *   所以拖时间轴时会看到山「一点点秃下去」。
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from '../vendor/three/libs/meshopt_decoder.module.js';

const MODELS = {
  healthy: 'assets/models/shan_healthy.min.glb',
  mined: 'assets/models/shan_mined.min.glb',
  restored: 'assets/models/shan_restored.min.glb',
};

let renderer = null;
let scene = null;
let camera = null;
let canvasEl = null;
let rafId = null;
let clock = null;

/** 三个状态各自的根节点 */
const roots = { healthy: null, mined: null, restored: null };
const loaded = { healthy: false, mined: false, restored: false };

/** 当前混合权重，做插值用 */
const mix = { healthy: 1, mined: 0, restored: 0 };
const target = { healthy: 1, mined: 0, restored: 0 };

let dragging = false;
let lastX = 0;
let yaw = 0;
let yawTarget = 0;
let running = false;

const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);

/* ────────────────────────── 初始化 ────────────────────────── */

export function initLedger3D(canvas) {
  if (!canvas) return false;
  canvasEl = canvas;

  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xf4efe4, 9, 22);

  camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  camera.position.set(0, 4.1, 9.4);
  camera.lookAt(0, 0.7, 0);

  clock = new THREE.Clock();

  /* 光：一盏主光从左上打，一盏补光从右后，一盏底光把山脚提起来 */
  const key = new THREE.DirectionalLight(0xfff6e4, 2.1);
  key.position.set(-4.2, 7.5, 4.2);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.near = 0.5;
  key.shadow.camera.far = 26;
  key.shadow.camera.left = -9;
  key.shadow.camera.right = 9;
  key.shadow.camera.top = 9;
  key.shadow.camera.bottom = -9;
  key.shadow.bias = -0.0012;
  scene.add(key);

  const rim = new THREE.DirectionalLight(0xcfe0d8, 0.75);
  rim.position.set(5, 4, -5);
  scene.add(rim);

  const amb = new THREE.HemisphereLight(0xf4efe4, 0xb9a887, 1.15);
  scene.add(amb);

  /* 地台：一块浅色的圆盘，把模型托住 */
  const disk = new THREE.Mesh(
    new THREE.CircleGeometry(5.6, 72),
    new THREE.MeshStandardMaterial({
      color: 0xf0e9d8,
      roughness: 0.94,
      metalness: 0,
    })
  );
  disk.rotation.x = -Math.PI / 2;
  disk.position.y = -0.02;
  disk.receiveShadow = true;
  scene.add(disk);

  // 地台边缘一圈淡墨环
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(5.56, 5.66, 72),
    new THREE.MeshBasicMaterial({ color: 0xc3c6bd, transparent: true, opacity: 0.4 })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = -0.015;
  scene.add(ring);

  bindDrag(canvas);
  start();
  void loadAll();
  return true;
}

/* ────────────────────────── 载入 ────────────────────────── */

function normalize(root, target2 = 6.4) {
  /* 三个模型的包围盒差别很大，各自按自己的尺寸缩放，
     切状态时画面会突跳。所以统一按「最长边」归到同一个尺寸，
     再统一把底面贴到 y=0。 */
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.z, size.y * 1.4) || 1;
  const s = target2 / maxDim;
  root.scale.setScalar(s);

  // 重新量一次，把底部精确贴地、中心对齐原点
  const box2 = new THREE.Box3().setFromObject(root);
  const c2 = box2.getCenter(new THREE.Vector3());
  root.position.set(-c2.x, -box2.min.y, -c2.z);

  root.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
    const m = o.material;
    if (m) {
      m.transparent = true;
      m.envMapIntensity = 0.7;
    }
  });
}

function loadOne(name) {
  return new Promise((resolve) => {
    loader.load(
      MODELS[name],
      (gltf) => {
        const g = new THREE.Group();
        g.add(gltf.scene);
        normalize(gltf.scene);
        g.visible = false;
        scene.add(g);
        roots[name] = g;
        loaded[name] = true;
        resolve(true);
      },
      undefined,
      () => {
        loaded[name] = false;
        resolve(false);
      }
    );
  });
}

let onReady = null;

async function loadAll() {
  // 串行载入，别一次抢满带宽
  for (const n of ['healthy', 'mined', 'restored']) {
    await loadOne(n);
  }
  applyMix();
  // 通知外面：3D 就绪了，2D 可以退成远景
  if (typeof onReady === 'function') onReady();
}

/** 注册「模型就绪」回调，用来让 2D 层切成远景 */
export function onLedger3DReady(fn) {
  onReady = fn;
  if (ledger3DReady()) fn();
}

/* ────────────────────────── 状态切换 ────────────────────────── */

/**
 * 按年份与山体健康决定该显示哪一态。
 * @param {number} health 0-100
 * @param {boolean} closed 是否已关矿
 */
export function setLedger3DState(health, closed) {
  const hp = Math.max(0, Math.min(100, health)) / 100;

  if (hp > 0.6) {
    // 山还算好：健康态为主
    const t = (hp - 0.6) / 0.4; // 0.6→0, 1.0→1
    target.healthy = 0.35 + t * 0.65;
    target.mined = 1 - t * 0.75;
    target.restored = 0;
  } else {
    // 山已破：开挖态为主
    const t = Math.max(0, (0.6 - hp) / 0.6); // 0.6→0, 0→1
    target.mined = 0.4 + t * 0.6;
    target.healthy = Math.max(0, 0.3 - t * 0.3);
    target.restored = 0;
  }

  // 关矿之后，恢复态逐渐顶上来
  if (closed) {
    const t = Math.min(1, Math.max(0, (0.55 - (1 - hp)) / 0.55));
    target.restored = 0.25 + t * 0.75;
    target.mined *= 1 - t * 0.7;
    target.healthy *= 1 - t * 0.5;
  }

  // 归一化，避免三个都亮
  const sum = target.healthy + target.mined + target.restored || 1;
  target.healthy /= sum;
  target.mined /= sum;
  target.restored /= sum;
}

function applyMix() {
  /* 三个模型不能真的叠着半透明显示：
     它们的地形轮廓不完全一致，叠在一起会出现重影，
     看着像两个山嵌在一块。
     所以只用「权重最大的那个」做主体，其余全部隐藏；
     过渡由 shader 外的整体淡入做，不靠同时显示。 */
  let best = 'healthy';
  let bestW = -1;
  for (const k of ['healthy', 'mined', 'restored']) {
    if (mix[k] > bestW) {
      bestW = mix[k];
      best = k;
    }
  }

  for (const k of ['healthy', 'mined', 'restored']) {
    const g = roots[k];
    if (!g) continue;
    const isMain = k === best;
    g.visible = isMain;
    if (!isMain) continue;

    g.traverse((o) => {
      if (!o.isMesh || !o.material) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach((m) => {
        m.transparent = true;
        // 主模型的透明度跟着它的权重走，权重高就更实
        m.opacity = Math.min(1, 0.55 + bestW * 0.45);
        m.depthWrite = true;
      });
    });

    g.scale.setScalar(1);
  }
}

/* ────────────────────────── 交互与循环 ────────────────────────── */

function bindDrag(canvas) {
  canvas.addEventListener('pointerdown', (e) => {
    dragging = true;
    lastX = e.clientX;
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch (_) {
      /* 捕获失败也能拖 */
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    yawTarget += (e.clientX - lastX) * 0.006;
    lastX = e.clientX;
  });
  const stop = (e) => {
    if (!dragging) return;
    dragging = false;
    try {
      canvas.releasePointerCapture(e.pointerId);
    } catch (_) {
      /* 同上 */
    }
  };
  canvas.addEventListener('pointerup', stop);
  canvas.addEventListener('pointercancel', stop);
}

function resize() {
  if (!canvasEl || !renderer) return;
  const r = canvasEl.getBoundingClientRect();
  const w = Math.max(r.width, 320);
  const h = Math.max(r.height, 240);
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

function start() {
  if (running) return;
  running = true;
  const tick = () => {
    if (!running) return;
    rafId = requestAnimationFrame(tick);
    if (!canvasEl || !canvasEl.isConnected) {
      running = false;
      return;
    }
    const dt = Math.min(0.05, clock.getDelta());

    // 权重插值
    let changed = false;
    for (const k of ['healthy', 'mined', 'restored']) {
      const d = target[k] - mix[k];
      if (Math.abs(d) > 0.002) {
        mix[k] += d * Math.min(1, dt * 3.2);
        changed = true;
      } else if (d !== 0) {
        mix[k] = target[k];
        changed = true;
      }
    }
    if (changed) applyMix();

    // 缓慢自转 + 拖动
    yaw += (yawTarget - yaw) * Math.min(1, dt * 6);
    scene.rotation.y = yaw;

    resize();
    renderer.render(scene, camera);
  };
  rafId = requestAnimationFrame(tick);
}

export function stopLedger3D() {
  running = false;
  if (rafId) cancelAnimationFrame(rafId);
  rafId = null;
}

/** 有没有至少一个模型可用（没有就回退 2D） */
export function ledger3DReady() {
  return loaded.healthy || loaded.mined || loaded.restored;
}
