/**
 * scroll.js — 手卷的长轴拖拽与吸附
 *
 * 交互逻辑：手卷不是缩放的地图，是一段一段展开的。
 * 拖拽 / 滚轮 / 方向键 / 触摸滑动都能移动，松手后吸附到最近的点位。
 */

export class ScrollController {
  /**
   * @param {object} o
   *   viewport  可拖拽的容器（.scroll__viewport）
   *   track     被移动的内容（.scroll__track）
   *   points    点位数组 [{ id, name, u }]，u 是 0-1 的位置比例
   *   onFocus   点位成为焦点时的回调 (index) => void
   *   onProgress 进度变化回调 (ratio) => void
   */
  constructor(o) {
    this.viewport = o.viewport;
    this.track = o.track;
    this.points = o.points || [];
    this.onFocus = o.onFocus || (() => {});
    this.onProgress = o.onProgress || (() => {});

    this.offset = 0; // 当前平移（负数向左）
    this.velocity = 0;
    this.minOffset = 0;
    this.maxOffset = 0;
    this.raf = null;
    this.wheelRaf = null; // 滚轮缓动帧
    this.wheelTarget = 0; // 滚轮期望到达的位移
    this.wheelActive = false;
    this.dragging = false;
    this.lastX = 0;
    this.lastT = 0;
    this.activeIndex = 0;
    this.hasInteracted = false;

    this._bind();
    this.measure();
  }

  /* ── 测量 ───────────────────────────────────────────── */

  measure() {
    const vw = this.viewport.clientWidth;
    const tw = this.track.scrollWidth || this.track.offsetWidth;
    this.viewW = vw;
    this.trackW = tw;
    this.maxOffset = 0;
    this.minOffset = Math.min(0, vw - tw);
    this.offset = Math.max(this.minOffset, Math.min(this.maxOffset, this.offset));
    this.wheelTarget = this.offset;
    this._apply();
  }

  /** 点位在 track 中的像素位置 */
  pxOf(u) {
    return u * (this.trackW || this.viewW);
  }

  /** 把某个点位滚到屏幕中心附近 */
  focusIndex(i, smooth = true) {
    if (i < 0 || i >= this.points.length) return;
    this.activeIndex = i;
    const target = this._clamp(this.viewW * 0.5 - this.pxOf(this.points[i].u));
    this._animateTo(target, smooth);
    this.onFocus(i);
    this.onProgress(this.progress);
  }

  get progress() {
    if (this.minOffset === 0) return 0;
    return this.offset / this.minOffset;
  }

  /* ── 内部 ───────────────────────────────────────────── */

  _clamp(v) {
    return Math.max(this.minOffset, Math.min(this.maxOffset, v));
  }

  _apply() {
    this.track.style.transform = `translate3d(${this.offset.toFixed(2)}px,0,0)`;
    this.onProgress(this.progress);
  }

  _animateTo(target, smooth, dur = 620) {
    if (this.raf) cancelAnimationFrame(this.raf);
    const from = this.offset;
    const to = this._clamp(target);
    if (!smooth || Math.abs(to - from) < 1) {
      this.offset = to;
      this._apply();
      return;
    }
    const t0 = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - t0) / dur);
      // easeOutQuint 的近似，配合 CSS 的 cubic 感觉
      const e = 1 - Math.pow(1 - t, 5);
      this.offset = from + (to - from) * e;
      this._apply();
      if (t < 1) this.raf = requestAnimationFrame(step);
      else this.raf = null;
    };
    this.raf = requestAnimationFrame(step);
  }

  /** 滚轮驱动的缓动帧：向 wheelTarget 逼近，接近静止再考虑吸附 */
  _startWheelGlide() {
    if (this.wheelRaf) return; // 已经在跑，只更新目标即可

    let idle = 0; // 连续多少帧几乎没有位移

    const step = () => {
      const target = this.wheelTarget ?? this.offset;
      const diff = target - this.offset;

      // 指数逼近：每帧吃掉剩余距离的 18%，手感接近原生滚动惯性
      this.offset += diff * 0.18;
      if (Math.abs(target - this.offset) < 0.4) this.offset = target;
      this._apply();

      const moving = Math.abs(diff) > 0.8;
      idle = moving ? 0 : idle + 1;

      // 还有距离就继续追；停稳 12 帧（约 200ms）后收尾
      if (Math.abs(target - this.offset) > 0.4) {
        this.wheelRaf = requestAnimationFrame(step);
        return;
      }

      if (idle < 12) {
        this.wheelRaf = requestAnimationFrame(step);
        return;
      }

      // 真正停下来了，才判断要不要吸附
      this.wheelRaf = null;
      this.wheelActive = false;
      this._settleAfterWheel();
    };

    this.wheelRaf = requestAnimationFrame(step);
  }

  /** 滚轮停下后的收尾：只有明显偏了才吸附，否则让用户停在原地 */
  _settleAfterWheel() {
    if (!this.points.length) return;

    const center = -this.offset + this.viewW * 0.5;
    let best = 0;
    let bestD = Infinity;
    this.points.forEach((p, i) => {
      const d = Math.abs(this.pxOf(p.u) - center);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });

    // 已经离某一站很近（12% 屏宽内），吸附过去让人看清
    // 离得远说明用户是想自由浏览，就停在原地，不要拽走
    if (bestD < this.viewW * 0.12) {
      this.activeIndex = best;
      this._animateTo(this._clamp(this.viewW * 0.5 - this.pxOf(this.points[best].u)), true, 380);
      this.onFocus(best);
    }
    this.wheelTarget = this.offset;
    this.onProgress(this.progress);
  }

  /** 松手后找最近点位并吸附 */
  _snap() {
    if (!this.points.length) return;
    // 视口中心对应的 track 位置
    const center = -this.offset + this.viewW * 0.5;
    let best = 0;
    let bestD = Infinity;
    this.points.forEach((p, i) => {
      const d = Math.abs(this.pxOf(p.u) - center);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    // 阈值：超过 0.42 屏宽就不吸了，让用户自由停
    if (bestD < this.viewW * 0.42) {
      this.focusIndex(best, true);
    } else {
      this.offset = this._clamp(this.offset);
      this._apply();
    }
  }

  _bind() {
    const v = this.viewport;

    // 指针拖拽
    v.addEventListener('pointerdown', (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      // 点在按钮上不拖
      if (e.target.closest('.mark')) return;
      this.dragging = true;
      this.hasInteracted = true;
      this.lastX = e.clientX;
      this.lastT = performance.now();
      this.velocity = 0;
      // 手指接管，滚轮的缓动立刻让位，否则两边抢同一个 offset
      if (this.raf) {
        cancelAnimationFrame(this.raf);
        this.raf = null;
      }
      if (this.wheelRaf) {
        cancelAnimationFrame(this.wheelRaf);
        this.wheelRaf = null;
      }
      this.wheelActive = false;
      v.classList.add('is-dragging');
      v.setPointerCapture(e.pointerId);
    });

    v.addEventListener('pointermove', (e) => {
      if (!this.dragging) return;
      const now = performance.now();
      const dt = Math.max(1, now - this.lastT);
      const dx = e.clientX - this.lastX;
      this.offset = this._clamp(this.offset + dx);
      this.velocity = (dx / dt) * 16;
      this.lastX = e.clientX;
      this.lastT = now;
      this._apply();
    });

    const end = (e) => {
      if (!this.dragging) return;
      this.dragging = false;
      v.classList.remove('is-dragging');
      try {
        v.releasePointerCapture(e.pointerId);
      } catch (_) {
        /* 指针已释放 */
      }

      // 拖完把滚轮目标对齐到当前位置，避免下次滚轮从旧目标起跳
      this.wheelTarget = this.offset;

      // 惯性
      if (Math.abs(this.velocity) > 1.6) {
        const glide = () => {
          this.velocity *= 0.92;
          this.offset = this._clamp(this.offset + this.velocity);
          this._apply();
          if (Math.abs(this.velocity) > 0.4) {
            this.raf = requestAnimationFrame(glide);
          } else {
            this.raf = null;
            this._snap();
          }
        };
        this.raf = requestAnimationFrame(glide);
      } else {
        this._snap();
      }
    };

    v.addEventListener('pointerup', end);
    v.addEventListener('pointercancel', end);

    // 滚轮：竖向滚动转横向
    //
    // 早期实现是「每格直接 += 105px，停手 160ms 后强制吸附，吸附动画 620ms」，
    // 结果是手指还在动，动画已经在往回拽，体验像被抢方向盘。
    // 现在改成：滚轮只累积一个目标位移，由统一的缓动帧逐步逼近，
    // 停手后先让动量自然衰减，衰减到几乎静止才吸附到最近点位。
    v.addEventListener(
      'wheel',
      (e) => {
        // 横向滚动优先；触控板横向滑动时 deltaX 才是主分量
        const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
        if (Math.abs(d) < 0.5) return;

        // 触控板会连续发大量小增量，鼠标滚轮则是离散的大增量。
        // 用 deltaMode 修正：0=像素 1=行 2=页
        const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? this.viewW : 1;

        // 归一化到「像素」，但要压掉过大的一格（部分浏览器一格 deltaY 可达 300）
        let px = d * unit * 1.6;
        px = Math.max(-420, Math.min(420, px));

        e.preventDefault();
        this.hasInteracted = true;

        // 累积到目标位移，而不是直接改当前位移
        this.wheelTarget = this._clamp((this.wheelTarget ?? this.offset) - px);
        this.wheelActive = true;

        this._startWheelGlide();
      },
      { passive: false }
    );

    // 键盘
    v.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        this.hasInteracted = true;
        this.focusIndex(Math.min(this.activeIndex + 1, this.points.length - 1));
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        this.hasInteracted = true;
        this.focusIndex(Math.max(this.activeIndex - 1, 0));
      } else if (e.key === 'Home') {
        e.preventDefault();
        this.focusIndex(0);
      } else if (e.key === 'End') {
        e.preventDefault();
        this.focusIndex(this.points.length - 1);
      }
    });

    // 尺寸变化
    window.addEventListener('resize', () => {
      this.measure();
      this.focusIndex(this.activeIndex, false);
    });
  }
}
