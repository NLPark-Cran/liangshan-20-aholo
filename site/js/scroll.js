/**
 * scroll.js — 手卷的长轴拖拽与吸附
 * 纵向滚轮只在长卷内部转换为横向位移，到达首尾后交还页面。
 */

export class ScrollController {
  constructor(o) {
    this.viewport = o.viewport;
    this.track = o.track;
    this.points = o.points || [];
    this.onFocus = o.onFocus || (() => {});
    this.onProgress = o.onProgress || (() => {});
    this.onInteraction = o.onInteraction || (() => {});

    this.offset = 0;
    this.velocity = 0;
    this.minOffset = 0;
    this.maxOffset = 0;
    this.activeIndex = 0;
    this.raf = null;
    this.wheelRaf = null;
    this.wheelTarget = 0;
    this.wheelActive = false;
    this.wheelIdle = 0;
    this.motionToken = 0;
    this.dragging = false;
    this.pendingDrag = false;
    this.pointerId = null;
    this.hasInteracted = false;
    this.suppressClick = false;
    this.clickTimer = null;
    this.listeners = [];
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

    this._bind();
    this.measure();
  }

  measure() {
    const index = Math.min(this.activeIndex, Math.max(0, this.points.length - 1));
    this._stopAllMotion();
    this.viewW = this.viewport.clientWidth;
    this.trackW = this.track.scrollWidth || this.track.offsetWidth;
    this.maxOffset = 0;
    this.minOffset = Math.min(0, this.viewW - this.trackW);
    this.offset = this.points.length ? this.pointOffset(index) : this._clamp(this.offset);
    this.wheelTarget = this.offset;
    this._apply();
  }

  pxOf(u) {
    return u * (this.trackW || this.viewW || 1);
  }

  pointOffset(index) {
    if (!this.points[index]) return this._clamp(this.offset);
    return this._clamp(this.viewW * 0.5 - this.pxOf(this.points[index].u));
  }

  focusIndex(index, smooth = true) {
    if (index < 0 || index >= this.points.length) return;
    this._stopAllMotion();
    this._interacted();
    this.activeIndex = index;
    this.onFocus(index);
    this._animateTo(this.pointOffset(index), smooth);
  }

  get progress() {
    if (!this.minOffset) return 0;
    return Math.max(0, Math.min(1, this.offset / this.minOffset));
  }

  destroy() {
    this._stopAllMotion();
    this.listeners.forEach(([target, type, handler, options]) => {
      target.removeEventListener(type, handler, options);
    });
    this.listeners = [];
    this.reducedMotion.removeEventListener('change', this._motionPreferenceChanged);
    clearTimeout(this.clickTimer);
    this.viewport.classList.remove('is-dragging');
    this.dragging = false;
    this.pendingDrag = false;
  }

  _listen(target, type, handler, options) {
    target.addEventListener(type, handler, options);
    this.listeners.push([target, type, handler, options]);
  }

  _clamp(value) {
    return Math.max(this.minOffset, Math.min(this.maxOffset, value));
  }

  _interacted() {
    if (this.hasInteracted) return;
    this.hasInteracted = true;
    this.onInteraction();
  }

  _apply() {
    this.track.style.transform = `translate3d(${this.offset.toFixed(2)}px,0,0)`;
    this._updateNearest();
    this.onProgress(this.progress);
  }

  _updateNearest() {
    if (!this.points.length) return;
    let best = 0;
    let distance = Infinity;
    this.points.forEach((_, index) => {
      const d = Math.abs(this.pointOffset(index) - this.offset);
      if (d < distance) {
        distance = d;
        best = index;
      }
    });
    if (best !== this.activeIndex) {
      this.activeIndex = best;
      this.onFocus(best);
    }
  }

  _stopAllMotion() {
    this.motionToken += 1;
    if (this.raf) cancelAnimationFrame(this.raf);
    if (this.wheelRaf) cancelAnimationFrame(this.wheelRaf);
    this.raf = null;
    this.wheelRaf = null;
    this.wheelActive = false;
    this.wheelIdle = 0;
  }

  _animateTo(target, smooth = true, duration = 480) {
    if (this.raf) cancelAnimationFrame(this.raf);
    const from = this.offset;
    const to = this._clamp(target);
    const token = ++this.motionToken;
    if (!smooth || this.reducedMotion.matches || Math.abs(to - from) < 0.5) {
      this.offset = to;
      this._apply();
      this.raf = null;
      return;
    }
    const start = performance.now();
    const step = (now) => {
      if (token !== this.motionToken) return;
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 4);
      this.offset = from + (to - from) * eased;
      this._apply();
      if (t < 1) this.raf = requestAnimationFrame(step);
      else this.raf = null;
    };
    this.raf = requestAnimationFrame(step);
  }

  _startWheelGlide() {
    if (this.wheelRaf) return;
    const token = ++this.motionToken;
    let last = performance.now();
    this.wheelIdle = 0;

    const step = (now) => {
      if (token !== this.motionToken) return;
      const dt = Math.max(1, Math.min(50, now - last));
      last = now;
      const diff = this.wheelTarget - this.offset;
      if (this.reducedMotion.matches) this.offset = this.wheelTarget;
      else this.offset += diff * (1 - Math.exp(-dt / 82));
      if (Math.abs(diff) < 0.35) this.offset = this.wheelTarget;
      this._apply();

      if (Math.abs(this.wheelTarget - this.offset) > 0.35) {
        this.wheelIdle = 0;
        this.wheelRaf = requestAnimationFrame(step);
        return;
      }
      this.wheelIdle += dt;
      if (this.wheelIdle < 110) {
        this.wheelRaf = requestAnimationFrame(step);
        return;
      }
      this.wheelRaf = null;
      this.wheelActive = false;
      this._snap();
    };
    this.wheelRaf = requestAnimationFrame(step);
  }

  _snap() {
    if (!this.points.length) return;
    this._updateNearest();
    const target = this.pointOffset(this.activeIndex);
    if (Math.abs(target - this.offset) < this.viewW * 0.44) {
      this.focusIndex(this.activeIndex, true);
    } else {
      this.offset = this._clamp(this.offset);
      this.wheelTarget = this.offset;
      this._apply();
    }
  }

  _startInertia() {
    if (this.reducedMotion.matches || Math.abs(this.velocity) < 1.2) {
      this._snap();
      return;
    }
    const token = ++this.motionToken;
    let last = performance.now();
    const step = (now) => {
      if (token !== this.motionToken) return;
      const dt = Math.max(1, Math.min(50, now - last));
      last = now;
      const frameScale = dt / 16.67;
      this.offset = this._clamp(this.offset + this.velocity * frameScale);
      this.velocity *= Math.exp(-dt / 145);
      this._apply();
      if (Math.abs(this.velocity) > 0.25) this.raf = requestAnimationFrame(step);
      else {
        this.raf = null;
        this._snap();
      }
    };
    this.raf = requestAnimationFrame(step);
  }

  _bind() {
    const v = this.viewport;
    const interactive = 'button,a,input,select,textarea,[data-no-drag]';

    this._motionPreferenceChanged = () => this._stopAllMotion();
    this._listen(this.reducedMotion, 'change', this._motionPreferenceChanged);

    this._listen(v, 'pointerdown', (event) => {
      if (event.button !== undefined && event.button !== 0) return;
      if (event.target.closest(interactive)) return;
      this._stopAllMotion();
      this.pendingDrag = true;
      this.dragging = false;
      this.pointerId = event.pointerId;
      this.startX = this.lastX = event.clientX;
      this.startY = event.clientY;
      this.lastT = performance.now();
      this.velocity = 0;
    });

    this._listen(v, 'pointermove', (event) => {
      if (!this.pendingDrag || event.pointerId !== this.pointerId) return;
      const totalX = event.clientX - this.startX;
      const totalY = event.clientY - this.startY;
      if (!this.dragging) {
        if (Math.hypot(totalX, totalY) < 5) return;
        if (Math.abs(totalY) > Math.abs(totalX) * 1.1) {
          this.pendingDrag = false;
          return;
        }
        this.dragging = true;
        this._interacted();
        v.classList.add('is-dragging');
        v.setPointerCapture(event.pointerId);
      }
      if (event.cancelable) event.preventDefault();
      const now = performance.now();
      const dt = Math.max(1, now - this.lastT);
      const dx = event.clientX - this.lastX;
      this.offset = this._clamp(this.offset + dx);
      this.velocity = (dx / dt) * 16.67;
      this.lastX = event.clientX;
      this.lastT = now;
      this._apply();
    });

    const end = (event, cancelled = false) => {
      if (!this.pendingDrag || event.pointerId !== this.pointerId) return;
      const wasDragging = this.dragging;
      this.pendingDrag = false;
      this.dragging = false;
      this.pointerId = null;
      v.classList.remove('is-dragging');
      if (!wasDragging) return;
      this._interacted();
      try {
        v.releasePointerCapture(event.pointerId);
      } catch (_) {
        /* 指针可能已经由浏览器释放。 */
      }
      this.suppressClick = true;
      clearTimeout(this.clickTimer);
      this.clickTimer = setTimeout(() => { this.suppressClick = false; }, 350);
      this.wheelTarget = this.offset;
      if (cancelled) this._snap();
      else this._startInertia();
    };
    this._listen(v, 'pointerup', (event) => end(event));
    this._listen(v, 'pointercancel', (event) => end(event, true));

    this._listen(v, 'click', (event) => {
      if (!this.suppressClick) return;
      event.preventDefault();
      event.stopPropagation();
      this.suppressClick = false;
      clearTimeout(this.clickTimer);
    }, true);

    this._listen(v, 'wheel', (event) => {
      const horizontal = Math.abs(event.deltaX) > Math.abs(event.deltaY);
      const delta = horizontal ? event.deltaX : event.deltaY;
      if (Math.abs(delta) < 0.5) return;
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? this.viewW : 1;
      const reference = this.wheelActive ? this.wheelTarget : this.offset;
      const first = this.pointOffset(0);
      const last = this.pointOffset(this.points.length - 1);
      const atStart = reference >= -0.5 || Math.abs(reference - first) < 2;
      const atEnd = reference <= this.minOffset + 0.5 || Math.abs(reference - last) < 2;
      if (!horizontal && ((delta < 0 && atStart) || (delta > 0 && atEnd))) {
        this._stopAllMotion();
        return;
      }
      if ((delta < 0 && reference >= this.maxOffset) || (delta > 0 && reference <= this.minOffset)) return;

      event.preventDefault();
      this._interacted();
      if (this.raf) {
        cancelAnimationFrame(this.raf);
        this.raf = null;
        this.motionToken += 1;
      }
      const px = Math.max(-420, Math.min(420, delta * unit * 1.45));
      const base = this.wheelActive ? this.wheelTarget : this.offset;
      this.wheelTarget = this._clamp(base - px);
      this.wheelActive = true;
      this._startWheelGlide();
    }, { passive: false });

    this._listen(v, 'keydown', (event) => {
      if (event.target !== v && event.target.closest(interactive)) return;
      let target = null;
      if (event.key === 'ArrowRight') target = Math.min(this.activeIndex + 1, this.points.length - 1);
      else if (event.key === 'ArrowLeft') target = Math.max(this.activeIndex - 1, 0);
      else if (event.key === 'Home') target = 0;
      else if (event.key === 'End') target = this.points.length - 1;
      if (target === null) return;
      event.preventDefault();
      this.focusIndex(target, true);
    });

    this._listen(window, 'resize', () => this.measure());
  }
}
