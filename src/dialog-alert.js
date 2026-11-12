/*!
 * DialogAlert v1.3.0 — SweetAlert2 風格的提示視窗，建構於 DialogLightbox（需先載入 dialog-lightbox.js）
 *
 *   DialogAlert.fire({ icon, title, text, showCancelButton, ... }) → Promise<Result>
 *   DialogAlert.fire('標題', '內文', 'success')
 *   DialogAlert.toast({ icon, title, timer })
 *
 * Result：{ isConfirmed, isDenied, isDismissed, value, dismiss }
 *   dismiss：'cancel' | 'esc' | 'backdrop' | 'close' | 'timer'
 */
(function (global) {
  'use strict';

  if (!global.DialogLightbox) throw new Error('DialogAlert 需要先載入 dialog-lightbox.js');
  const DL = global.DialogLightbox;

  /* ---------- 圖示（SVG，pathLength=1 方便描線動畫） ---------- */
  const ICON_SVG = {
    success: '<circle class="ring" cx="40" cy="40" r="36" pathLength="1"/><path class="mark" d="M24 41l11 11 21-23" pathLength="1"/>',
    error: '<circle class="ring" cx="40" cy="40" r="36" pathLength="1"/><path class="mark" d="M28 28l24 24" pathLength="1"/><path class="mark mark--2" d="M52 28L28 52" pathLength="1"/>',
    warning: '<circle class="ring" cx="40" cy="40" r="36" pathLength="1"/><path class="mark" d="M40 22v24" pathLength="1"/><circle class="dot" cx="40" cy="57" r="3.5"/>',
    info: '<circle class="ring" cx="40" cy="40" r="36" pathLength="1"/><circle class="dot" cx="40" cy="24" r="3.5"/><path class="mark" d="M40 34v24" pathLength="1"/>',
    question: '<circle class="ring" cx="40" cy="40" r="36" pathLength="1"/><path class="mark" d="M30 31a10 10 0 1 1 14 9c-3 1.5-4 3.5-4 7" pathLength="1"/><circle class="dot" cx="40" cy="57" r="3.5"/>'
  };

  const DEFAULTS = {
    icon: '',                     // success | error | warning | info | question
    title: '',
    text: '',                     // 純文字（以 textContent 輸出，避免 XSS）
    html: null,                   // 進階：傳入 Node / DocumentFragment / <template> 選擇器
    showConfirmButton: true,
    showDenyButton: false,
    showCancelButton: false,
    showCloseButton: false,
    confirmButtonText: '確定',
    denyButtonText: '不儲存',
    cancelButtonText: '取消',
    confirmButtonClass: 'btn btn-primary',
    denyButtonClass: 'btn btn-danger',
    cancelButtonClass: 'btn btn-outline-secondary',
    reverseButtons: false,
    focusConfirm: true,
    focusCancel: false,           // 破壞性操作建議 true
    allowOutsideClick: true,
    allowEscapeKey: true,
    input: null,                  // text | email | password | number | url | textarea | select
    inputLabel: '',
    inputPlaceholder: '',
    inputValue: '',
    inputOptions: null,           // select：{ value: '顯示文字' }
    inputAttributes: null,        // { maxlength: 50, ... }
    inputValidator: null,         // (value) => 錯誤訊息字串 | null（可回傳 Promise）
    preConfirm: null,             // (value) => 新值 | Promise；throw Error 顯示訊息
    loadingText: '處理中…',
    timer: 0,                     // 毫秒，0 = 不自動關閉
    timerProgressBar: false,
    pauseOnHover: true,           // 計時時滑鼠移入／鍵盤聚焦暫停（WCAG 2.2.1）
    size: ''                      // '' | 'sm' | 'lg'
  };

  const ICON_LABEL = { success: '成功', error: '錯誤', warning: '警告', info: '資訊', question: '詢問' };
  let instance = null;
  let seq = 0;

  function el(tag, cls, attrs) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (attrs) Object.entries(attrs).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== false) n.setAttribute(k, v === true ? '' : String(v)); });
    return n;
  }

  function iconEl(type) {
    if (!ICON_SVG[type]) return null;
    const wrap = el('div', `lbx-alert__icon lbx-alert__icon--${type}`, { 'aria-hidden': 'true' });
    wrap.innerHTML = `<svg viewBox="0 0 80 80" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" focusable="false">${ICON_SVG[type]}</svg>`; // 靜態內容
    return wrap;
  }

  /* ---------- 計時器：可暫停 ---------- */
  class Timer {
    constructor(ms, onDone) { this.left = ms; this.onDone = onDone; this.start(); }
    start() { this.t0 = Date.now(); this.id = setTimeout(this.onDone, this.left); this.running = true; }
    pause() { if (!this.running) return; clearTimeout(this.id); this.left -= Date.now() - this.t0; this.running = false; }
    resume() { if (!this.running && this.left > 0) this.start(); }
    stop() { clearTimeout(this.id); this.running = false; }
  }

  /* ---------- 內容類型：alert ---------- */
  DL.registerType('alert', function (it, media) {
    const o = it.alert;
    const id = 'lbx-alert-' + (++seq);
    const box = el('div', 'lbx-alert');
    const dialog = this.dialog;

    // 圖示
    const icon = iconEl(o.icon);
    if (icon) box.appendChild(icon);

    // 標題（對話框名稱）
    if (o.title) {
      const h = el('h2', 'lbx-alert__title', { id: id + '-title' });
      if (ICON_LABEL[o.icon]) {
        const sr = el('span', 'visually-hidden');
        sr.textContent = ICON_LABEL[o.icon] + '：';
        h.appendChild(sr);
      }
      h.appendChild(document.createTextNode(o.title));
      box.appendChild(h);
      dialog.removeAttribute('aria-label');
      dialog.setAttribute('aria-labelledby', h.id);
    } else {
      dialog.removeAttribute('aria-labelledby');
      dialog.setAttribute('aria-label', ICON_LABEL[o.icon] || '提示');
    }

    // 內文
    const describedBy = [];
    if (o.text) {
      const p = el('p', 'lbx-alert__text', { id: id + '-text' });
      p.textContent = o.text;
      box.appendChild(p);
      describedBy.push(p.id);
    }
    if (o.html) {
      const wrap = el('div', 'lbx-alert__html', { id: id + '-html' });
      let node = o.html;
      if (typeof node === 'string') {
        const tpl = document.querySelector(node);
        node = tpl instanceof HTMLTemplateElement ? tpl.content.cloneNode(true) : null;
      }
      if (node instanceof Node) { wrap.appendChild(node); box.appendChild(wrap); describedBy.push(wrap.id); }
    }
    describedBy.length ? dialog.setAttribute('aria-describedby', describedBy.join(' ')) : dialog.removeAttribute('aria-describedby');

    // 輸入欄位
    let input = null;
    const errId = id + '-error';
    if (o.input) {
      const field = el('div', 'lbx-alert__field');
      const inputId = id + '-input';
      if (o.inputLabel) {
        const lab = el('label', 'form-label lbx-alert__label', { for: inputId });
        lab.textContent = o.inputLabel;
        field.appendChild(lab);
      }
      if (o.input === 'textarea') {
        input = el('textarea', 'form-control', { id: inputId, rows: 3 });
      } else if (o.input === 'select') {
        input = el('select', 'form-select', { id: inputId });
        if (o.inputPlaceholder) {
          const ph = el('option', '', { value: '' });
          ph.textContent = o.inputPlaceholder;
          input.appendChild(ph);
        }
        Object.entries(o.inputOptions || {}).forEach(([v, label]) => {
          const op = el('option', '', { value: v });
          op.textContent = label;
          input.appendChild(op);
        });
      } else {
        input = el('input', 'form-control', { id: inputId, type: o.input });
      }
      if (o.inputPlaceholder && o.input !== 'select') input.placeholder = o.inputPlaceholder;
      if (!o.inputLabel) input.setAttribute('aria-label', o.title || '輸入');
      Object.entries(o.inputAttributes || {}).forEach(([k, v]) => input.setAttribute(k, v));
      input.value = o.inputValue || '';
      input.setAttribute('aria-describedby', errId);
      field.appendChild(input);
      box.appendChild(field);
    }

    // 驗證／錯誤訊息
    const err = el('div', 'lbx-alert__error', { id: errId, role: 'alert' });
    err.hidden = true;
    box.appendChild(err);
    const showError = (msg) => {
      err.textContent = msg || '';
      err.hidden = !msg;
      if (input) msg ? input.setAttribute('aria-invalid', 'true') : input.removeAttribute('aria-invalid');
    };

    // 按鈕
    const actions = el('div', 'lbx-alert__actions');
    const btns = {};
    const make = (key, text, cls) => {
      const b = el('button', `lbx-alert__btn lbx-alert__btn--${key} ${cls}`, { type: 'button' });
      const label = el('span', 'lbx-alert__btn-label');
      label.textContent = text;
      b.appendChild(label);
      btns[key] = b;
      return b;
    };
    const order = [];
    if (o.showConfirmButton) order.push(make('confirm', o.confirmButtonText, o.confirmButtonClass));
    if (o.showDenyButton) order.push(make('deny', o.denyButtonText, o.denyButtonClass));
    if (o.showCancelButton) order.push(make('cancel', o.cancelButtonText, o.cancelButtonClass));
    (o.reverseButtons ? order.reverse() : order).forEach((b) => actions.appendChild(b));
    if (order.length) box.appendChild(actions);

    // 計時條
    let bar = null;
    if (o.timer && o.timerProgressBar) {
      bar = el('div', 'lbx-alert__timer', { 'aria-hidden': 'true' });
      bar.style.animationDuration = o.timer + 'ms';
      box.appendChild(bar);
    }

    // 關閉 ×
    if (o.showCloseButton) {
      const x = el('button', 'lbx-alert__close', { type: 'button', 'aria-label': this.o.labels.close });
      x.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6L6 18"/></svg>';
      x.addEventListener('click', () => { this._reason = 'close'; this.close(''); });
      box.appendChild(x);
    }

    // 初始焦點
    const focusTarget = input
      || (o.focusCancel && btns.cancel)
      || (o.focusConfirm && btns.confirm)
      || btns.cancel || btns.deny || btns.confirm;
    if (focusTarget) focusTarget.setAttribute('autofocus', '');

    // ---- 行為 ----
    const state = it._state;
    const setLoading = (on) => {
      box.classList.toggle('is-loading', on);
      Object.values(btns).forEach((b) => { b.disabled = on; });
      if (input) input.disabled = on;
      if (btns.confirm) {
        btns.confirm.setAttribute('aria-busy', String(on));
        btns.confirm.querySelector('.lbx-alert__btn-label').textContent = on ? o.loadingText : o.confirmButtonText;
      }
    };

    const confirm = async () => {
      let value = input ? (input.type === 'number' ? input.valueAsNumber : input.value) : true;
      showError('');
      try {
        if (o.inputValidator) {
          const msg = await o.inputValidator(value);
          if (msg) { showError(msg); input && input.focus(); return; }
        }
        if (o.preConfirm) {
          setLoading(true);
          const res = await o.preConfirm(value);
          if (res === false) { setLoading(false); return; }
          if (res !== undefined && res !== true) value = res;
        }
      } catch (e) {
        setLoading(false);
        showError((e && e.message) || String(e));
        (input || btns.confirm).focus();
        return;
      }
      state.value = value;
      this._reason = 'confirm';
      this.close('confirm');
    };

    if (btns.confirm) btns.confirm.addEventListener('click', confirm);
    if (btns.deny) btns.deny.addEventListener('click', () => { this._reason = 'deny'; this.close('deny'); });
    if (btns.cancel) btns.cancel.addEventListener('click', () => { this._reason = 'cancel'; this.close('cancel'); });
    if (input && input.tagName !== 'TEXTAREA') {
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); confirm(); } });
    }

    // 自動關閉
    if (o.timer) {
      const timer = new Timer(o.timer, () => { this._reason = 'timer'; this.close('timer'); });
      state.timer = timer;
      if (o.pauseOnHover) {
        const pause = () => { timer.pause(); box.classList.add('is-paused'); };
        const resume = () => {
          if (box.matches(':hover') || box.contains(document.activeElement) && document.activeElement.matches(':focus-visible')) return;
          timer.resume(); box.classList.remove('is-paused');
        };
        box.addEventListener('pointerenter', pause);
        box.addEventListener('pointerleave', resume);
        box.addEventListener('focusin', (e) => { if (e.target.matches(':focus-visible')) pause(); });
        box.addEventListener('focusout', resume);
      }
    }

    media.appendChild(box);
  });

  /* ---------- 公開 API ---------- */
  function getInstance() {
    if (!instance) {
      instance = new DL({ variant: 'modal', selector: '[data-dialog-alert-never]', className: 'lbx--alert' });
      instance.dialog.setAttribute('role', 'alertdialog');
    }
    return instance;
  }

  function fire(a, b, c) {
    const opts = typeof a === 'string' ? { title: a, text: b || '', icon: c || '' } : (a || {});
    const o = { ...DEFAULTS, ...DialogAlert.defaults, ...opts };
    const inst = getInstance();
    const state = { value: undefined, timer: null };

    return new Promise((resolve) => {
      const onClose = (e) => {
        inst.dialog.removeEventListener('lbx:close', onClose);
        if (state.timer) state.timer.stop();
        const rv = e.detail.returnValue;
        const isConfirmed = rv === 'confirm';
        const isDenied = rv === 'deny';
        const result = { isConfirmed, isDenied, isDismissed: !isConfirmed && !isDenied };
        if (isConfirmed) result.value = state.value;
        if (isDenied) result.value = false;
        if (result.isDismissed) result.dismiss = e.detail.reason === 'api' ? 'close' : e.detail.reason;
        resolve(result);
      };
      // 若前一個提示仍開著，先結束它
      if (inst.dialog.open) { inst._reason = 'close'; inst.close(''); }
      inst.dialog.addEventListener('lbx:close', onClose);
      inst.open([{
        type: 'alert',
        alert: o,
        _state: state,
        title: o.title,
        size: o.size,
        backdropClose: !!o.allowOutsideClick,
        escClose: !!o.allowEscapeKey
      }], 0, document.activeElement);
    });
  }

  /* ---------- Toast（非強制回應，不搶焦點） ---------- */
  let toastRegion = null;
  const canPopover = 'popover' in HTMLElement.prototype;
  function getToastRegion() {
    if (toastRegion && toastRegion.isConnected) return toastRegion;
    // live region 需先存在於頁面，之後加入的內容才會被播報
    toastRegion = el('div', 'lbx-toasts', { 'aria-live': 'polite', 'aria-relevant': 'additions', role: 'region', 'aria-label': '通知' });
    if (canPopover) toastRegion.setAttribute('popover', 'manual');
    document.body.appendChild(toastRegion);
    if (canPopover) { try { toastRegion.showPopover(); } catch (_) {} }
    toastRegion._fresh = true;
    return toastRegion;
  }
  function raiseToastRegion(region) {
    // 有 dialog 開啟時，重新顯示 popover 使其位於最上層
    if (!canPopover || !document.querySelector('dialog[open]')) return;
    try { region.hidePopover(); region.showPopover(); } catch (_) {}
  }

  function toast(opts = {}) {
    const o = { icon: 'success', title: '', text: '', timer: 3000, timerProgressBar: true, ...opts };
    const region = getToastRegion();
    raiseToastRegion(region);
    const t = el('div', `lbx-toast lbx-toast--${o.icon}`);
    const icon = iconEl(o.icon);
    if (icon) t.appendChild(icon);
    const body = el('div', 'lbx-toast__body');
    const strong = el('p', 'lbx-toast__title');
    if (ICON_LABEL[o.icon]) {
      const sr = el('span', 'visually-hidden');
      sr.textContent = ICON_LABEL[o.icon] + '：';
      strong.appendChild(sr);
    }
    strong.appendChild(document.createTextNode(o.title));
    body.appendChild(strong);
    if (o.text) { const p = el('p', 'lbx-toast__text'); p.textContent = o.text; body.appendChild(p); }
    t.appendChild(body);
    const x = el('button', 'lbx-toast__close', { type: 'button', 'aria-label': '關閉通知' });
    x.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6L6 18"/></svg>';
    t.appendChild(x);
    if (o.timer && o.timerProgressBar) {
      const bar = el('div', 'lbx-alert__timer', { 'aria-hidden': 'true' });
      bar.style.animationDuration = o.timer + 'ms';
      t.appendChild(bar);
    }

    let timer = null;
    const remove = () => {
      if (timer) timer.stop();
      t.classList.add('is-leaving');
      setTimeout(() => t.remove(), 200);
    };
    x.addEventListener('click', remove);
    if (o.timer) {
      timer = new Timer(o.timer, remove);
      t.addEventListener('pointerenter', () => { timer.pause(); t.classList.add('is-paused'); });
      t.addEventListener('pointerleave', () => { timer.resume(); t.classList.remove('is-paused'); });
      t.addEventListener('focusin', () => { timer.pause(); t.classList.add('is-paused'); });
      t.addEventListener('focusout', () => { timer.resume(); t.classList.remove('is-paused'); });
    }
    if (region._fresh) { region._fresh = false; setTimeout(() => region.appendChild(t), 100); }
    else region.appendChild(t);
    return { close: remove, element: t };
  }

  const DialogAlert = {
    defaults: {},
    fire,
    toast,
    /** 建立預設值不同的版本，例如統一按鈕文字 */
    mixin(defaults) {
      return {
        fire: (o) => fire({ ...defaults, ...(typeof o === 'string' ? { title: o } : o) }),
        toast: (o) => toast({ ...defaults, ...o })
      };
    },
    close() { if (instance && instance.dialog.open) { instance._reason = 'close'; instance.close(''); } },
    isVisible() { return !!(instance && instance.dialog.open); }
  };

  global.DialogAlert = DialogAlert;
})(window);
