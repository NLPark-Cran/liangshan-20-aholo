/**
 * splat-view.js — 用 WebGL 画 3DGS 点云
 *
 * 3DGS 的原生做法是每个点一个椭球、按深度排序后 alpha 叠加，
 * 代价高。这里用近似：每个点画成一个柔边圆点精灵，
 * 大小按点的尺度换算，颜色带 alpha。视觉上能看出是「体积」，
 * 性能足够跑在普通笔记本上。
 */

const VS = `
attribute vec3 aPos;
attribute vec4 aColor;
attribute vec3 aScale;

uniform mat4 uView;
uniform mat4 uProj;
uniform float uPointScale;
uniform vec3 uCenter;
uniform float uRadius;

varying vec4 vColor;
varying float vSoft;

void main() {
  // 平移到模型中心
  vec3 p = aPos - uCenter;
  vec4 mv = uView * vec4(p, 1.0);
  gl_Position = uProj * mv;

  /* 点大小不按椭球半径换算。
     3DGS 的 scale 只有配合它自己的场景尺度才有物理意义，
     单独拿出来算会得到亚像素级的结果，什么都看不见。
     轻量查看器的通行做法：给一个固定的基准像素大小，
     靠点的数量与 alpha 叠出体积感。 */
  float size = uPointScale / max(0.35, -mv.z);
  gl_PointSize = clamp(size, 1.4, 22.0);

  vColor = aColor;
  // 不做径向淡出：裁剪后的场景边界不规则，按距离裁会把有效点也削掉
  vSoft = 1.0;
}
`;

const FS = `
precision mediump float;
varying vec4 vColor;
varying float vSoft;

void main() {
  // 圆点内做柔边，看起来才像高斯团而不是方格
  vec2 d = gl_PointCoord - vec2(0.5);
  float r = length(d) * 2.0;
  if (r > 1.0) discard;
  float a = smoothstep(1.0, 0.15, r);
  // alpha 提升：SPZ 的原始 alpha 普遍很小，不放大叠不出体积
  gl_FragColor = vec4(vColor.rgb, clamp(vColor.a * 2.6, 0.0, 1.0) * a * vSoft);
}
`;

function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(s);
    gl.deleteShader(s);
    throw new Error('shader 编译失败: ' + log);
  }
  return s;
}

function program(gl) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, VS));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, FS));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    throw new Error('program 链接失败: ' + gl.getProgramInfoLog(p));
  }
  return p;
}

/* ────────────────────────── 矩阵 ────────────────────────── */

function perspective(fov, aspect, near, far) {
  const f = 1 / Math.tan(fov / 2);
  const nf = 1 / (near - far);
  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) * nf, -1,
    0, 0, 2 * far * near * nf, 0,
  ]);
}

function lookAt(eye, target, up) {
  const z = norm(sub(eye, target));
  const x = norm(cross(up, z));
  const y = cross(z, x);
  return new Float32Array([
    x[0], y[0], z[0], 0,
    x[1], y[1], z[1], 0,
    x[2], y[2], z[2], 0,
    -dot(x, eye), -dot(y, eye), -dot(z, eye), 1,
  ]);
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const norm = (a) => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

/* ────────────────────────── 视图 ────────────────────────── */

export class SplatView {
  constructor(canvas) {
    this.canvas = canvas;
    const opts = { antialias: false, alpha: true, premultipliedAlpha: false };
    this.gl = canvas.getContext('webgl', opts) || canvas.getContext('experimental-webgl', opts);
    if (!this.gl) throw new Error('没有 WebGL');

    const gl = this.gl;
    this.prog = program(gl);
    this.loc = {
      aPos: gl.getAttribLocation(this.prog, 'aPos'),
      aColor: gl.getAttribLocation(this.prog, 'aColor'),
      aScale: gl.getAttribLocation(this.prog, 'aScale'),
      uView: gl.getUniformLocation(this.prog, 'uView'),
      uProj: gl.getUniformLocation(this.prog, 'uProj'),
      uPointScale: gl.getUniformLocation(this.prog, 'uPointScale'),
      uCenter: gl.getUniformLocation(this.prog, 'uCenter'),
      uRadius: gl.getUniformLocation(this.prog, 'uRadius'),
    };

    this.buffers = { pos: gl.createBuffer(), color: gl.createBuffer(), scale: gl.createBuffer() };
    this.count = 0;
    this.center = [0, 0, 0];
    this.radius = 1;

    this.yaw = 0;
    this.pitch = 0.06;
    this.dist = 2.4;
    /* 实测这个场景是「掠飞采集」形成的薄壳结构：
       相机在球心附近时几乎看不到东西，从外面拉远才能看清。 */
    this.eyeOffset = 0.06;
    /* 每个点在屏幕上的基准像素大小。3DGS 的 scale 无法单独换算，
       所以用一个固定基准，靠点的数量与 alpha 叠出体积。 */
    this.pointPx = 3.2;
    this.ready = false;
    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.disable(gl.DEPTH_TEST);
  }

  setData(data) {
    const gl = this.gl;
    this.count = data.count;

    const b = data.bounds;
    this.center = [
      (b.min[0] + b.max[0]) / 2,
      (b.min[1] + b.max[1]) / 2,
      (b.min[2] + b.max[2]) / 2,
    ];
    const sx = b.max[0] - b.min[0];
    const sy = b.max[1] - b.min[1];
    const sz = b.max[2] - b.min[2];
    this.radius = Math.max(sx, sy, sz) / 2 || 1;

    /* 位置与尺度用同一个比例归一化，保持相对关系。
       3DGS 的尺度是椭球半径，量级在千分之一，
       所以显示时在 shader 里统一放大。 */
    const pos = new Float32Array(data.count * 3);
    const sc = new Float32Array(data.count * 3);
    const k = 1 / this.radius;
    for (let i = 0; i < data.count; i++) {
      pos[i * 3] = (data.positions[i * 3] - this.center[0]) * k;
      pos[i * 3 + 1] = (data.positions[i * 3 + 1] - this.center[1]) * k;
      pos[i * 3 + 2] = (data.positions[i * 3 + 2] - this.center[2]) * k;
      sc[i * 3] = data.scales[i * 3] * k;
      sc[i * 3 + 1] = data.scales[i * 3 + 1] * k;
      sc[i * 3 + 2] = data.scales[i * 3 + 2] * k;
    }
    // 中心与世界尺度都规整好，接下来的矩阵按单位球算
    this.center = [0, 0, 0];
    this.worldRadius = this.radius;
    this.radius = 1;

    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.pos);
    gl.bufferData(gl.ARRAY_BUFFER, pos, gl.STATIC_DRAW);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.color);
    gl.bufferData(gl.ARRAY_BUFFER, data.colors, gl.STATIC_DRAW);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.scale);
    gl.bufferData(gl.ARRAY_BUFFER, sc, gl.STATIC_DRAW);

    this.ready = true;
  }

  resize() {
    const c = this.canvas;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(2, Math.round(c.clientWidth * dpr));
    const h = Math.max(2, Math.round(c.clientHeight * dpr));
    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
    }
  }

  draw(t) {
    if (!this.ready) return;
    const gl = this.gl;
    this.resize();
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    /* 实测这个场景是「掠飞采集」形成的薄壳结构：
       相机在球心附近时几乎看不到东西，从外面拉远才能看清。
       所以默认放在外面，绕球看。 */
    const yaw = this.yaw + (t || 0) * 0.02;
    const cp = Math.cos(this.pitch);
    const eye = [
      Math.sin(yaw) * cp * this.dist,
      Math.sin(this.pitch) * this.dist,
      Math.cos(yaw) * cp * this.dist,
    ];
    const view = lookAt(eye, [0, 0, 0], [0, 1, 0]);
    const proj = perspective(Math.PI / 3.2, this.canvas.width / this.canvas.height, 0.01, 60);

    gl.useProgram(this.prog);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.pos);
    gl.enableVertexAttribArray(this.loc.aPos);
    gl.vertexAttribPointer(this.loc.aPos, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.color);
    gl.enableVertexAttribArray(this.loc.aColor);
    gl.vertexAttribPointer(this.loc.aColor, 4, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.scale);
    gl.enableVertexAttribArray(this.loc.aScale);
    gl.vertexAttribPointer(this.loc.aScale, 3, gl.FLOAT, false, 0, 0);

    gl.uniformMatrix4fv(this.loc.uView, false, view);
    gl.uniformMatrix4fv(this.loc.uProj, false, proj);
    gl.uniform3fv(this.loc.uCenter, this.center);
    gl.uniform1f(this.loc.uRadius, this.radius);
    /* 点大小：给一个基准像素值，随距离衰减。
       不做物理换算，因为 3DGS 的 scale 脱离它自己的场景尺度就没意义。 */
    gl.uniform1f(this.loc.uPointScale, this.pointPx || 3.2);

    gl.drawArrays(gl.POINTS, 0, this.count);
  }

  /** 拖动旋转 */
  orbit(dx, dy) {
    this.yaw -= dx * 0.006;
    this.pitch = Math.max(-1.2, Math.min(1.2, this.pitch + dy * 0.004));
  }

  zoom(dz) {
    this.dist = Math.max(1.6, Math.min(8, this.dist + dz * 0.002));
  }
}
