/*!
 * DialogLightbox v1.3.0 — native <dialog> lightbox / modal / drawer, zero dependencies.
 * - 內容類型註冊制：DialogLightbox.registerType(name, renderFn)
 * - 變體：lightbox（預設）| modal | drawer
 * - 燈箱：縮放、縮圖列、觸控滑動
 * - 面板：autoOpen() + 「今天不再顯示」
 */
(function (global) {
  'use strict';

  const svg = (d, extra = '') =>
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" ${extra}>${d}</svg>`;
  const ICONS = {
    close: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
    prev: svg('<path d="M15 5l-7 7 7 7"/>'),
    next: svg('<path d="M9 5l7 7-7 7"/>'),
    zoomIn: svg('<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4M11 8v6M8 11h6"/>', 'class="i-in"'),
    zoomOut: svg('<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4M8 11h6"/>', 'class="i-out"')
  };

  const DEFAULTS = {
    selector: '[data-lbx]',
    variant: 'lightbox',            // 'lightbox' | 'modal' | 'drawer'
    loop: true,
    swipeThreshold: 50,
    zoom: true,                     // 燈箱圖片縮放
    maxZoom: 4,
    thumbnails: false,              // 燈箱縮圖列
    mediaProtocols: ['http:', 'https:', 'blob:', 'data:'],
    iframeHosts: ['www.youtube-nocookie.com', 'www.youtube.com', 'player.vimeo.com'],
    labels: {
      dialog: '媒體檢視器',
      close: '關閉',
      prev: '上一項',
      next: '下一項',
      zoom: '放大圖片',
      thumbs: '縮圖',
      loading: '載入中',
      error: '內容無法載入',
      captions: '字幕',
      counter: (i, n) => `${i} / ${n}`,
      status: (i, n, cap) => `第 ${i} 項，共 ${n} 項${cap ? '：' + cap : ''}`,
      thumb: (i, cap) => `第 ${i} 項${cap ? '：' + cap : ''}`,
      zoomStatus: (pct) => pct > 100 ? `已放大至 ${pct}%` : '已恢復原始大小'
    }
  };

  const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
  const SNOOZE_PREFIX = 'lbx-snooze:';
  const today = () => new Date().toLocaleDateString('sv'); // YYYY-MM-DD（本地時區）
  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
  let uid = 0;

  class DialogLightbox {
    /* ===== 內容類型註冊 ===== */
    static types = new Map();
    static registerType(name, render) { DialogLightbox.types.set(name, render); }

    /* ===== 「今天不再顯示」 ===== */
    static isSnoozed(id) {
      try { return localStorage.getItem(SNOOZE_PREFIX + id) === today(); } catch (_) { return false; }
    }
    static snooze(id) {
      try { localStorage.setItem(SNOOZE_PREFIX + id, today()); } catch (_) {}
    }
    static clearSnooze(id) {
      try { localStorage.removeItem(SNOOZE_PREFIX + id); } catch (_) {}
    }

    constructor(options = {}) {
      this.o = { ...DEFAULTS, ...options, labels: { ...DEFAULTS.labels, ...(options.labels || {}) } };
      this.variant = this.o.variant;
      this.isPanel = this.variant === 'modal' || this.variant === 'drawer';
      this.items = [];
      this.index = 0;
      this.trigger = null;
      this._suppressClick = false;
      this._pointers = new Map();
      this._gesture = null;
      this._lastTap = 0;
      this._closeToken = 0;
      this.z = { s: 1, x: 0, y: 0 };

      this._onDocClick = this._onDocClick.bind(this);
      this._build();
      document.addEventListener('click', this._onDocClick);
    }

    /* ---------- DOM ---------- */
    _build() {
      const d = document.createElement('dialog');
      d.className = 'lbx' + (this.isPanel ? ` lbx--panel lbx--${this.variant}` : '') + (this.o.className ? ' ' + this.o.className : '');
      const titleId = 'lbx-title-' + (++uid);
      // 靜態骨架（不含任何外部資料）
      d.innerHTML =
        '<div class="lbx__inner">' +
          '<div class="lbx__bar">' +
            '<p class="lbx__counter" aria-hidden="true"></p>' +
            '<h2 class="lbx__title" id="' + titleId + '"></h2>' +
            '<div class="lbx__tools">' +
              '<button type="button" class="lbx__btn lbx__zoom" aria-pressed="false" hidden>' + ICONS.zoomIn + ICONS.zoomOut + '</button>' +
              '<button type="button" class="lbx__btn lbx__close">' + ICONS.close + '</button>' +
            '</div>' +
          '</div>' +
          '<div class="lbx__stage">' +
            '<div class="lbx__media"></div>' +
            '<div class="lbx__spinner" hidden></div>' +
          '</div>' +
          '<div class="lbx__foot">' +
            '<button type="button" class="lbx__btn lbx__nav lbx__nav--prev">' + ICONS.prev + '</button>' +
            '<p class="lbx__caption"></p>' +
            '<button type="button" class="lbx__btn lbx__nav lbx__nav--next">' + ICONS.next + '</button>' +
          '</div>' +
          '<nav class="lbx__thumbs" hidden><ul></ul></nav>' +
          '<p class="lbx__status visually-hidden" aria-live="polite" aria-atomic="true"></p>' +
        '</div>';

      const L = this.o.labels;
      const $ = (s) => d.querySelector(s);
      this.dialog = d;
      this.el = {
        inner: $('.lbx__inner'), counter: $('.lbx__counter'), title: $('.lbx__title'),
        zoom: $('.lbx__zoom'), close: $('.lbx__close'),
        stage: $('.lbx__stage'), media: $('.lbx__media'), spinner: $('.lbx__spinner'),
        foot: $('.lbx__foot'), prev: $('.lbx__nav--prev'), next: $('.lbx__nav--next'),
        caption: $('.lbx__caption'), thumbs: $('.lbx__thumbs'), thumbList: $('.lbx__thumbs ul'),
        status: $('.lbx__status')
      };

      if (this.isPanel) {
        d.setAttribute('aria-labelledby', titleId);
        this.el.counter.hidden = true;
        this.el.foot.hidden = true;
      } else {
        d.setAttribute('aria-label', L.dialog);
        this.el.title.hidden = true;
      }
      this.el.close.setAttribute('aria-label', L.close);
      this.el.zoom.setAttribute('aria-label', L.zoom);
      this.el.prev.setAttribute('aria-label', L.prev);
      this.el.next.setAttribute('aria-label', L.next);
      this.el.thumbs.setAttribute('aria-label', L.thumbs);
      this.el.spinner.setAttribute('role', 'img');
      this.el.spinner.setAttribute('aria-label', L.loading);

      this.el.close.addEventListener('click', () => { this._reason = 'close'; this.close(); });
      this.el.zoom.addEventListener('click', () => this.toggleZoom());
      this.el.prev.addEventListener('click', () => this.prev());
      this.el.next.addEventListener('click', () => this.next());
      this.el.thumbList.addEventListener('click', (e) => {
        const b = e.target.closest('.lbx__thumb');
        if (b) this.go(Number(b.dataset.index));
      });

      d.addEventListener('keydown', (e) => this._onKey(e));
      d.addEventListener('cancel', (e) => {
        const it = this.items[this.index];
        if (it && it.escClose === false) { e.preventDefault(); return; }
        this._reason = 'esc';
      });
      d.addEventListener('close', () => this._onClose());
      d.addEventListener('click', (e) => this._onDialogClick(e));

      if (!this.isPanel) this._bindGestures();
      document.body.appendChild(d);
    }

    /* ---------- 手勢：滑動切換、拖曳平移、雙指縮放、雙擊縮放、滾輪縮放 ---------- */
    _bindGestures() {
      const st = this.el.stage;

      st.addEventListener('pointerdown', (e) => {
        if (e.target.closest('video, iframe, .lbx__inline, button')) return;
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        this._pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        const img = this._img();

        if (this._pointers.size === 2 && img && this.o.zoom) {
          const [a, b] = [...this._pointers.values()];
          this._gesture = { type: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y), s0: this.z.s };
        } else if (this._pointers.size === 1) {
          if (img && this.z.s > 1 && e.target === img) {
            st.setPointerCapture(e.pointerId);
            this._gesture = { type: 'pan', x0: e.clientX, y0: e.clientY, tx: this.z.x, ty: this.z.y, moved: false };
            img.classList.add('is-panning');
          } else if (e.pointerType !== 'mouse') {
            this._gesture = { type: 'swipe', x0: e.clientX, y0: e.clientY };
          } else {
            this._gesture = null;
          }
        }
      });

      st.addEventListener('pointermove', (e) => {
        if (!this._pointers.has(e.pointerId)) return;
        this._pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        const g = this._gesture;
        if (!g) return;
        if (g.type === 'pinch' && this._pointers.size === 2) {
          const [a, b] = [...this._pointers.values()];
          const dist = Math.hypot(a.x - b.x, a.y - b.y);
          const c = this._toCenter((a.x + b.x) / 2, (a.y + b.y) / 2);
          this.zoomTo(g.s0 * dist / g.d0, c.x, c.y);
        } else if (g.type === 'pan') {
          const dx = e.clientX - g.x0, dy = e.clientY - g.y0;
          if (Math.abs(dx) + Math.abs(dy) > 4) g.moved = true;
          this.z.x = g.tx + dx; this.z.y = g.ty + dy;
          this._applyZoom();
        }
      });

      const end = (e) => {
        if (!this._pointers.has(e.pointerId)) return;
        const start = this._gesture;
        this._pointers.delete(e.pointerId);
        const img = this._img();
        if (img) img.classList.remove('is-panning');

        if (start && start.type === 'pan' && start.moved) this._suppressClick = true;

        if (start && start.type === 'swipe' && e.type === 'pointerup') {
          const dx = e.clientX - start.x0, dy = e.clientY - start.y0;
          if (Math.abs(dx) > this.o.swipeThreshold && Math.abs(dx) > Math.abs(dy) && this.z.s === 1) {
            this._suppressClick = true;
            dx < 0 ? this.next() : this.prev();
          } else if (Math.abs(dx) < 10 && Math.abs(dy) < 10 && img && e.target === img) {
            // 觸控雙擊縮放
            const now = Date.now();
            if (now - this._lastTap < 300) {
              const c = this._toCenter(e.clientX, e.clientY);
              this.toggleZoom(c.x, c.y);
              this._lastTap = 0;
            } else this._lastTap = now;
          }
        }
        if (start && start.type === 'pinch' && this._pointers.size < 2) {
          if (this.z.s < 1.05) this.resetZoom(true);
          this._announceZoom();
        }
        this._gesture = this._pointers.size ? this._gesture : null;
      };
      st.addEventListener('pointerup', end);
      st.addEventListener('pointercancel', end);

      // 滑鼠雙擊
      this.el.media.addEventListener('dblclick', (e) => {
        if (e.target !== this._img() || !this.o.zoom) return;
        const c = this._toCenter(e.clientX, e.clientY);
        this.toggleZoom(c.x, c.y);
      });

      // 滾輪縮放
      st.addEventListener('wheel', (e) => {
        const img = this._img();
        if (!img || !this.o.zoom) return;
        e.preventDefault();
        const c = this._toCenter(e.clientX, e.clientY);
        this.zoomTo(this.z.s * (e.deltaY < 0 ? 1.15 : 1 / 1.15), c.x, c.y);
        clearTimeout(this._wheelT);
        this._wheelT = setTimeout(() => this._announceZoom(), 400);
      }, { passive: false });
    }

    /* ---------- 事件 ---------- */
    _onDocClick(e) {
      const el = e.target.closest(this.o.selector);
      if (!el || this.dialog.contains(el)) return;
      if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      this.openFrom(el);
    }

    _onKey(e) {
      if (this.isPanel) return;
      if (e.target.closest('input, textarea, select, video, [contenteditable="true"]')) return;
      const zoomed = this.z.s > 1;

      // 縮放快捷鍵
      if (this._img() && this.o.zoom) {
        if (e.key === '+' || e.key === '=') { e.preventDefault(); this.zoomTo(this.z.s * 1.5, 0, 0, true); this._announceZoom(); return; }
        if (e.key === '-') { e.preventDefault(); this.zoomTo(this.z.s / 1.5, 0, 0, true); this._announceZoom(); return; }
        if (e.key === '0') { e.preventDefault(); this.resetZoom(true); this._announceZoom(); return; }
        if (zoomed && e.key.startsWith('Arrow')) {
          e.preventDefault();
          const step = 60;
          if (e.key === 'ArrowLeft') this.z.x += step;
          if (e.key === 'ArrowRight') this.z.x -= step;
          if (e.key === 'ArrowUp') this.z.y += step;
          if (e.key === 'ArrowDown') this.z.y -= step;
          this._applyZoom(true);
          return;
        }
      }

      const map = { ArrowLeft: 'prev', ArrowRight: 'next', Home: 'first', End: 'last' };
      const act = map[e.key];
      if (!act || this.items.length < 2) return;
      if (e.target.closest('.lbx__thumbs') && (act === 'first' || act === 'last')) return;
      e.preventDefault();
      if (act === 'first') this.go(0);
      else if (act === 'last') this.go(this.items.length - 1);
      else this[act]();
    }

    _onDialogClick(e) {
      const closer = e.target.closest('[data-lbx-close]');
      if (closer && this.dialog.contains(closer)) { this._reason = closer.value || 'button'; this.close(closer.value || ''); return; }

      if (this._suppressClick) { this._suppressClick = false; return; }
      const t = e.target;
      const isBackdrop = this.isPanel
        ? t === this.dialog
        : (t === this.dialog || t === this.el.inner || t === this.el.stage || t === this.el.media);
      const it = this.items[this.index];
      if (isBackdrop && !(it && it.backdropClose === false)) { this._reason = 'backdrop'; this.close(); }
    }

    _onClose() {
      const returnValue = this.dialog.returnValue;
      const it = this.items[this.index];
      // 「今天不再顯示」：面板內有勾選 [data-lbx-snooze] 時記錄
      if (it && it.snooze && this.el.media.querySelector('[data-lbx-snooze]:checked')) {
        DialogLightbox.snooze(it.snooze);
      }
      // 立即停止聲音，但保留畫面到淡出結束，避免閃爍
      this.el.media.querySelectorAll('video, audio').forEach((m) => m.pause());
      this.el.media.querySelectorAll('iframe').forEach((f) => { f.style.visibility = 'hidden'; f.src = 'about:blank'; });
      const token = ++this._closeToken;
      const root = document.documentElement;
      root.classList.add('lbx-closing'); // 淡出期間維持捲動鎖定，避免捲軸回來造成位移
      setTimeout(() => {
        if (!document.querySelector('dialog.lbx[open]')) root.classList.remove('lbx-closing');
        if (token !== this._closeToken || this.dialog.open) return; // 期間又被開啟則略過
        this.resetZoom();
        this.el.media.replaceChildren(); // 釋放資源
      }, this._transitionMs() + 50);

      const t = this.trigger;
      this.trigger = null;
      if (t && t.isConnected && typeof t.focus === 'function') t.focus({ preventScroll: true });
      this._emit('lbx:close', { returnValue, reason: this._reason || 'api', item: it });
    }

    /* ---------- 公開 API ---------- */
    openFrom(el) {
      const group = !this.isPanel && el.dataset.lbxGroup;
      const els = group
        ? Array.from(document.querySelectorAll(`${this.o.selector}[data-lbx-group="${CSS.escape(group)}"]`))
            .filter((n) => !this.dialog.contains(n))
        : [el];
      this.open(els.map((n) => this._parse(n)), Math.max(0, els.indexOf(el)), el);
    }

    open(items, index = 0, trigger = document.activeElement) {
      if (!items || !items.length) return;
      this.items = items.map((it) => ({ el: null, caption: '', alt: '', title: '', size: '', placement: '', snooze: '', thumb: '', ...it }));
      this.index = index;
      this.trigger = trigger;
      this.dialog.returnValue = '';
      this._reason = '';
      this._closeToken++; // 取消尚未執行的關閉清理
      this._buildThumbs();
      this._render();
      if (!this.dialog.open) {
        // 鎖定捲動前量測捲軸寬度（其他實例已開啟時沿用既有值）
        const root = document.documentElement;
        if (!document.querySelector('dialog.lbx[open]') && !root.classList.contains('lbx-closing')) {
          root.style.setProperty('--lbx-scrollbar', (global.innerWidth - root.clientWidth) + 'px');
        }
        this.dialog.showModal();
      }
      this._syncThumbs(true); // 開啟後才有版面尺寸，立即定位縮圖
      this._initialFocus();
      if (!this.isPanel) setTimeout(() => this._announce(), 150);
      this._emit('lbx:open', this._detail());
    }

    /**
     * 頁面載入時自動開啟（例：首頁公告），當天已勾選「今天不再顯示」則略過。
     * @returns {boolean} 是否有開啟
     */
    autoOpen(src, { title = '', size = '', placement = '', snooze = '', type = 'inline' } = {}) {
      if (snooze && DialogLightbox.isSnoozed(snooze)) return false;
      this.open([{ type, src, title, size, placement, snooze }], 0, null);
      return true;
    }

    close(returnValue) { if (this.dialog.open) this.dialog.close(returnValue); }
    next() { this.go(this.index + 1); }
    prev() { this.go(this.index - 1); }

    go(i) {
      const n = this.items.length;
      if (n < 2) return;
      if (this.o.loop) i = (i + n) % n;
      else if (i < 0 || i >= n) return;
      if (i === this.index) return;
      this.index = i;
      this._render();
      this._announce();
      this._emit('lbx:change', this._detail());
    }

    /* 縮放：x, y 為相對於舞台中心的座標 */
    zoomTo(scale, x = 0, y = 0, animate = false) {
      const img = this._img();
      if (!img) return;
      const s = clamp(scale, 1, this.o.maxZoom);
      const px = (x - this.z.x) / this.z.s;
      const py = (y - this.z.y) / this.z.s;
      this.z.s = s;
      this.z.x = x - px * s;
      this.z.y = y - py * s;
      this._applyZoom(animate);
    }

    toggleZoom(x = 0, y = 0) {
      const img = this._img();
      if (!img) return;
      if (this.z.s > 1) this.resetZoom(true);
      else {
        const natural = img.naturalWidth && img.offsetWidth ? img.naturalWidth / img.offsetWidth : 1;
        this.zoomTo(clamp(Math.max(2, natural), 1, this.o.maxZoom), x, y, true);
      }
      this._announceZoom();
    }

    resetZoom(animate = false) {
      this.z = { s: 1, x: 0, y: 0 };
      this._applyZoom(animate);
    }

    destroy() {
      document.removeEventListener('click', this._onDocClick);
      this.close();
      this.dialog.remove();
    }

    /* ---------- 給渲染器用的工具 ---------- */
    safeUrl(src, kind) {
      let u;
      try { u = new URL(src, document.baseURI); } catch (_) { return null; }
      if (!this.o.mediaProtocols.includes(u.protocol)) return null;
      if (u.protocol === 'data:' && !(kind && u.href.toLowerCase().startsWith('data:' + kind + '/'))) return null;
      return u;
    }

    setLoading(on) {
      this.el.spinner.hidden = !on;
      on ? this.el.stage.setAttribute('aria-busy', 'true') : this.el.stage.removeAttribute('aria-busy');
    }

    renderError() {
      this.setLoading(false);
      const p = document.createElement('p');
      p.className = 'lbx__error';
      p.textContent = this.o.labels.error;
      this.el.media.replaceChildren(p);
      this._syncZoomBtn();
    }

    /* ---------- 內部 ---------- */
    _img() {
      const img = this.el.media.firstElementChild;
      return img && img.tagName === 'IMG' ? img : null;
    }

    /** 取得對話框與面板的最長轉場時間（ms），用於關閉後延遲清理 */
    _transitionMs() {
      const toMs = (el) => {
        const cs = getComputedStyle(el);
        const durs = cs.transitionDuration.split(',');
        const dels = cs.transitionDelay.split(',');
        return Math.max(0, ...durs.map((d, i) => (parseFloat(d) + parseFloat(dels[i % dels.length] || '0')) * 1000));
      };
      return Math.max(toMs(this.dialog), toMs(this.el.inner));
    }

    _toCenter(cx, cy) {
      const r = this.el.stage.getBoundingClientRect();
      return { x: cx - (r.left + r.width / 2), y: cy - (r.top + r.height / 2) };
    }

    _applyZoom(animate = false) {
      const img = this._img();
      if (img) {
        const st = this.el.stage;
        const maxX = Math.max(0, (img.offsetWidth * this.z.s - st.clientWidth) / 2);
        const maxY = Math.max(0, (img.offsetHeight * this.z.s - st.clientHeight) / 2);
        this.z.x = clamp(this.z.x, -maxX, maxX);
        this.z.y = clamp(this.z.y, -maxY, maxY);
        img.classList.toggle('is-animating', animate);
        img.classList.toggle('is-zoomed', this.z.s > 1);
        const zoomed = this.z.s !== 1;
        img.style.translate = zoomed ? `${this.z.x}px ${this.z.y}px` : '';
        img.style.scale = zoomed ? String(this.z.s) : '';
        if (animate) setTimeout(() => img.classList.remove('is-animating'), 220);
      }
      this._syncZoomBtn();
    }

    _syncZoomBtn() {
      const show = !this.isPanel && this.o.zoom && !!this._img();
      this.el.zoom.hidden = !show;
      this.el.zoom.setAttribute('aria-pressed', String(this.z.s > 1));
      if (!show && document.activeElement === this.el.zoom) this.el.close.focus();
    }

    _announceZoom() {
      if (!this._img()) return;
      this.el.status.textContent = this.o.labels.zoomStatus(Math.round(this.z.s * 100));
    }

    _parse(el) {
      const img = el.querySelector('img');
      const fig = el.closest('figure');
      const figcap = fig ? fig.querySelector('figcaption') : null;
      const caption = el.dataset.lbxCaption ?? (figcap ? figcap.textContent.trim() : '');
      const alt = el.dataset.lbxAlt ?? (img ? img.alt : '');
      return {
        el,
        type: el.dataset.lbxType || (this.isPanel ? 'inline' : 'image'),
        src: el.dataset.lbxSrc || el.getAttribute('href') || '',
        caption,
        alt,
        title: el.dataset.lbxTitle || caption || alt,
        size: el.dataset.lbxSize || '',
        placement: el.dataset.lbxPlacement || '',
        snooze: el.dataset.lbxSnooze || '',
        thumb: el.dataset.lbxThumb || (img ? (img.currentSrc || img.src) : '')
      };
    }

    _buildThumbs() {
      const { thumbs, thumbList } = this.el;
      thumbList.replaceChildren();
      const show = !this.isPanel && this.o.thumbnails && this.items.length > 1;
      thumbs.hidden = !show;
      if (!show) return;
      this.items.forEach((it, i) => {
        const li = document.createElement('li');
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'lbx__thumb';
        b.dataset.index = String(i);
        b.setAttribute('aria-label', this.o.labels.thumb(i + 1, it.caption || it.title));
        const u = it.thumb && this.safeUrl(it.thumb, 'image');
        if (u) {
          const im = document.createElement('img');
          im.src = u.href; im.alt = ''; im.loading = 'lazy'; im.decoding = 'async';
          b.appendChild(im);
        } else {
          const s = document.createElement('span');
          s.setAttribute('aria-hidden', 'true');
          s.textContent = String(i + 1);
          b.appendChild(s);
        }
        li.appendChild(b);
        thumbList.appendChild(li);
      });
    }

    _render() {
      const it = this.items[this.index];
      const n = this.items.length;
      const { media, caption, counter, prev, next, title } = this.el;

      this.resetZoom();
      media.replaceChildren();
      this.setLoading(false);

      const render = DialogLightbox.types.get(it.type);
      if (typeof render === 'function') render.call(this, it, media);
      else this.renderError();
      this._syncZoomBtn();

      if (this.isPanel) {
        title.textContent = it.title || this.o.labels.dialog;
        it.size ? this.dialog.setAttribute('data-size', it.size) : this.dialog.removeAttribute('data-size');
        this.dialog.setAttribute('data-placement', it.placement || 'end');
        return;
      }

      caption.textContent = it.caption || '';
      counter.textContent = n > 1 ? this.o.labels.counter(this.index + 1, n) : '';
      prev.hidden = next.hidden = n < 2;
      if (!this.o.loop) {
        prev.disabled = this.index === 0;
        next.disabled = this.index === n - 1;
        if (document.activeElement && document.activeElement.disabled) this.el.close.focus();
      }
      this._syncThumbs();
      this._preload();
    }

    _syncThumbs(instant = false) {
      if (this.el.thumbs.hidden) return;
      this.el.thumbList.querySelectorAll('.lbx__thumb').forEach((b, i) => {
        if (i === this.index) {
          b.setAttribute('aria-current', 'true');
          // 只捲動縮圖列本身，不影響外層
          const ul = this.el.thumbList;
          const reduce = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
          const left = b.offsetLeft - (ul.clientWidth - b.offsetWidth) / 2;
          ul.scrollTo({ left: Math.max(0, left), behavior: reduce || instant ? 'auto' : 'smooth' });
        } else b.removeAttribute('aria-current');
      });
    }

    _initialFocus() {
      const af = this.el.media.querySelector('[autofocus]');
      if (af && af.matches(FOCUSABLE)) af.focus();
      else this.el.close.focus();
    }

    _preload() {
      const n = this.items.length;
      if (n < 2) return;
      [this.index + 1, this.index - 1].forEach((i) => {
        const it = this.items[(i + n) % n];
        if (it.type !== 'image') return;
        const u = this.safeUrl(it.src, 'image');
        if (u) { const im = new Image(); im.src = u.href; }
      });
    }

    _announce() {
      const it = this.items[this.index];
      if (!it || !this.dialog.open) return;
      this.el.status.textContent = this.o.labels.status(this.index + 1, this.items.length, it.caption || it.title);
    }

    _detail() {
      const it = this.items[this.index];
      return { index: this.index, total: this.items.length, item: it, trigger: this.trigger };
    }

    _emit(name, detail) {
      this.dialog.dispatchEvent(new CustomEvent(name, { detail }));
    }
  }

  /* =====================================================
   * 內建內容類型
   * 渲染器簽名：function (item, mediaEl) { ... }，this = 實例
   * ===================================================== */

  DialogLightbox.registerType('image', function (it, media) {
    const u = this.safeUrl(it.src, 'image');
    if (!u) return this.renderError();
    const img = new Image();
    img.decoding = 'async';
    img.alt = it.alt;
    img.draggable = false;
    this.setLoading(true);
    img.addEventListener('load', () => this.setLoading(false), { once: true });
    img.addEventListener('error', () => { if (img.isConnected) this.renderError(); }, { once: true });
    img.src = u.href;
    media.appendChild(img);
  });

  DialogLightbox.registerType('inline', function (it, media) {
    let tpl = null;
    try { tpl = document.querySelector(it.src); } catch (_) {}
    if (!(tpl instanceof HTMLTemplateElement)) return this.renderError();
    const wrap = document.createElement('div');
    wrap.className = 'lbx__inline';
    wrap.appendChild(tpl.content.cloneNode(true));
    media.appendChild(wrap);
  });

  DialogLightbox.registerType('iframe', function (it, media) {
    const u = this.safeUrl(it.src);
    if (!u || u.protocol !== 'https:' || !this.o.iframeHosts.includes(u.hostname)) return this.renderError();
    const f = document.createElement('iframe');
    f.src = u.href;
    f.title = it.title || this.o.labels.dialog;
    f.loading = 'lazy';
    f.referrerPolicy = 'strict-origin-when-cross-origin';
    f.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-presentation allow-popups');
    f.setAttribute('allow', 'autoplay; fullscreen; picture-in-picture; encrypted-media');
    f.allowFullscreen = true;
    media.appendChild(f);
  });

  DialogLightbox.registerType('video', function (it, media) {
    const u = this.safeUrl(it.src, 'video');
    if (!u) return this.renderError();
    const v = document.createElement('video');
    v.controls = true;
    v.preload = 'metadata';
    v.playsInline = true;
    if (it.title) v.setAttribute('aria-label', it.title);
    const ds = it.el ? it.el.dataset : {};
    if (ds.lbxPoster) {
      const p = this.safeUrl(ds.lbxPoster, 'image');
      if (p) v.poster = p.href;
    }
    if (ds.lbxTrack) {
      const tu = this.safeUrl(ds.lbxTrack, 'text');
      if (tu) {
        const t = document.createElement('track');
        t.kind = 'captions';
        t.srclang = ds.lbxTrackLang || document.documentElement.lang || 'zh-Hant';
        t.label = ds.lbxTrackLabel || this.o.labels.captions;
        t.src = tu.href;
        t.default = true;
        v.appendChild(t);
      }
    }
    this.setLoading(true);
    v.addEventListener('loadedmetadata', () => this.setLoading(false), { once: true });
    v.addEventListener('error', () => { if (v.isConnected) this.renderError(); }, { once: true });
    v.src = u.href;
    media.appendChild(v);
  });

  global.DialogLightbox = DialogLightbox;
})(window);
