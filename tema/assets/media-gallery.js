import { Component } from '@theme/component';
import { ThemeEvents } from '@theme/events';

// Evita que o navegador restaure posição de scroll e influencie o carrossel (melhora no iOS)
// iOS fix (opcional, mas recomendado)
try { history.scrollRestoration = 'manual'; } catch (e) {}

/**
 * @typedef {object} Refs
 * @property {import('./zoom-dialog').ZoomDialog} [zoomDialogComponent]
 * @property {import('./slideshow').Slideshow} [slideshow]
 * @property {HTMLElement[]} [media]
 */
export class MediaGallery extends Component {
  connectedCallback() {
    super.connectedCallback();

    const { signal } = this.#controller;
    const target = this.closest('.shopify-section, dialog');

    target?.addEventListener(ThemeEvents.variantUpdate, this.#handleVariantUpdate, { signal });
    this.refs.zoomDialogComponent?.addEventListener(ThemeEvents.zoomMediaSelected, this.#handleZoomMediaSelected, { signal });

    // Seleção inicial (lógica já existente)
    this.#maybeSelectInitial();

    // iOS fix: garantir que o slideshow comece no índice 0 após a primeira montagem
    if (this.#isIOS() && this.dataset.fromVariantUpdate !== 'true') {
  this.#selectFirstSlideSoon();
} // <<< ADICIONADO

    // Observa troca de slide e mantém thumbs/dots sincronizados
    this.#observeSlideChanges();

    // Desktop: drag horizontal nas thumbs com botão esquerdo
    this.#initDesktopThumbDrag();

    // Mobile/geral: preservar posição de scroll das thumbs ao clicar (sem mexer em seleção)
    this.#setupThumbsPreserveScroll();

    // Pós-montagem: se veio de troca de variante, selecione pelo mediaId
    if (this.dataset.fromVariantUpdate === 'true' && this.dataset.selectedMediaId) {
      const desiredId = String(this.dataset.selectedMediaId);
      this.#selectByMediaId(desiredId, { preferMobile: true, retries: 16 });
    }
  }

  #controller = new AbortController();
  #observers = [];
  #isSyncingThumbs = false;

  /* ======================= Utils ======================= */

  #isMobile() {
    return window.matchMedia('(max-width: 749px)').matches;
  }

  #isIOS() {
    const ua = navigator.userAgent || navigator.vendor || '';
    // iPhone/iPad/iPod and iPadOS (MacIntel + touch)
    return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }

  #slidesOrdered() {
    // Usa a ordem DOM das refs "slides[]"; filtra só os que têm data-media-id
    const root = this.slideshow || this;
    const list = Array.from(root.querySelectorAll('[ref="slides[]"], slideshow-slide'));
    return list.filter((el) => el.hasAttribute('data-media-id'));
  }

  #scopedThumbControls(scope = (this.#isMobile() ? 'mobile' : 'primary')) {
    return this.querySelectorAll(`slideshow-controls[thumbnails][data-scope="${scope}"]`);
  }

  /* ======================= iOS first-slide guard ======================= */
  // iOS fix: força seleção do primeiro slide (índice 0) após layout
  #selectFirstSlideSoon = () => {
    // Dois frames garantem que layout/refs do slideshow existam
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        try {
          this.slideshow?.select(0, undefined, { animate: false });
          // reforça a seleção por alguns frames (evita desync de thumbs no Safari)
          this.#reinforceThumbSelection(4);
        } catch (e) {
          // silencioso
        }
      });
    });
  };

  /* ======================= Selecionar por mediaId ======================= */

  /**
   * Seleciona o slide da galeria para o mediaId informado.
   * iOS: seleciona diretamente o slide pelo índice (sem clicar em thumb).
   * Outros: tenta clicar a thumb (sincroniza via tema) e reforça a seleção.
   */
  #selectByMediaId(mediaId, { preferMobile = false, retries = 12 } = {}) {
    // --- iOS: seleciona direto no slideshow (sem clique de thumb) ---
    if (this.#isIOS()) {
      const tryDirect = (attempt = 0) => {
        const slides = this.#slidesOrdered();
        const el = slides.find((s) => s.getAttribute('data-media-id') === String(mediaId));
        if (!el) {
          if (attempt < retries) return requestAnimationFrame(() => tryDirect(attempt + 1));
          return;
        }
        // Índice baseado na ordem DOM dos slides visíveis
        const idx = (() => {
          const visible = slides.filter(
            (s) => !s.hasAttribute('hidden') || s.hasAttribute('reveal')
          );
          const byDom = visible.indexOf(el);
          if (byDom >= 0) return byDom;
          const parsed = parseInt(el.getAttribute('data-index') || '-1', 10);
          return Number.isNaN(parsed) ? 0 : parsed;
        })();

        this.slideshow?.select(idx, undefined, { animate: false });

        // Sincroniza thumbs/dots pelo mediaId e reforça por alguns frames (Safari)
        this.#syncThumbsByMediaId(String(mediaId));
        this.#reinforceThumbSelection(6);
      };
      return requestAnimationFrame(() => tryDirect());
    }

    // --- Android/Desktop: manter fluxo por clique na thumb e reforçar ---
    let attempts = Math.max(1, retries);
    const tryOnce = () => {
      const mobileFirst = preferMobile || this.#isMobile();
      const tryScopes = mobileFirst ? ['mobile', 'primary'] : ['primary', 'mobile'];
      let clicked = false;

      for (const scope of tryScopes) {
        const lists = this.#scopedThumbControls(scope);
        for (const ctrl of lists) {
          const btn = ctrl.querySelector(
            `.slideshow-controls__thumbnail[data-media-id="${CSS.escape(String(mediaId))}"]`
          );
          if (btn) {
            const container = ctrl.querySelector('.slideshow-controls__thumbnails-container') || ctrl;
            const savedScroll = container.scrollLeft || 0;

            // Clica a thumb para deixar o tema sincronizar
            btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

            // Restaura scroll e reforça seleção por alguns frames
            let frames = 6;
            const fix = () => {
              container.scrollLeft = savedScroll;
              this.#reinforceThumbSelection(4);
              if (--frames > 0) requestAnimationFrame(fix);
            };
            requestAnimationFrame(fix);

            clicked = true;
            break;
          }
        }
        if (clicked) break;
      }

      // Fallback: seleciona direto pelo índice do slide
      if (!clicked) {
        const slides = this.#slidesOrdered();
        const el = slides.find((s) => s.getAttribute('data-media-id') === String(mediaId));
        if (el) {
          const idx = parseInt(el.getAttribute('data-index') || '-1', 10);
          if (!Number.isNaN(idx) && idx >= 0) {
            this.slideshow?.select(idx, undefined, { animate: false });
            this.#reinforceThumbSelection(4);
            clicked = true;
          }
        }
      }

      if (!clicked && --attempts > 0) {
        requestAnimationFrame(tryOnce);
      }
    };

    requestAnimationFrame(tryOnce);
  }

  /* ======================= Seleção inicial ======================= */

  #maybeSelectInitial() {
    const fromVariantUpdate     = this.dataset.fromVariantUpdate === 'true';
    const preferFeatured        = (this.dataset.preferFeatured ?? 'true') === 'true';
    const selectedMediaId       = this.dataset.selectedMediaId;
    const featuredIndex         = Number(this.dataset.featuredIndex ?? 0);
    const hideVariants          = this.dataset.hideVariants === 'true';
    const respectVariantOnLoad  = (this.dataset.respectVariantOnLoad ?? 'false') === 'true';

    let desired = null; // mediaId
    let byIndex = null; // índice

    if (!hideVariants && fromVariantUpdate && selectedMediaId) {
      desired = String(selectedMediaId);
    } else if (preferFeatured) {
      byIndex = featuredIndex;
    }

    if (!fromVariantUpdate && respectVariantOnLoad && !hideVariants && selectedMediaId) {
      desired = String(selectedMediaId);
      byIndex = null;
    }

    if (desired === null && byIndex === null) return;

    const trySelect = (attempt = 0) => {
      const maxAttempts = 20;
      const slideshowEl = this.slideshow;
      if (!slideshowEl) {
        if (attempt < maxAttempts) return requestAnimationFrame(() => trySelect(attempt + 1));
        return;
      }

      const slides = this.#slidesOrdered();
      if (!slides.length) {
        if (attempt < maxAttempts) return requestAnimationFrame(() => trySelect(attempt + 1));
        return;
      }

      let idx = -1;

      if (desired) {
        const el = slides.find((s) => s.getAttribute('data-media-id') === desired);
        if (el) {
          const visible = slides.filter((s) => !s.hasAttribute('hidden') || s.hasAttribute('reveal'));
          const pos = visible.indexOf(el);
          idx = pos >= 0 ? pos : parseInt(el.getAttribute('data-index') || '-1', 10);
        }
      } else if (byIndex !== null) {
        idx = Math.max(0, Math.min(byIndex, slides.length - 1));
      }

      if (idx >= 0) {
        this.slideshow?.select(idx, undefined, { animate: false });
        const el = slides[idx];
        const mid = el?.getAttribute('data-media-id') || (desired || null);
        if (mid) this.#syncThumbsByMediaId(String(mid));
        this.#reinforceThumbSelection(4);
      } else if (desired) {
        this.#selectByMediaId(desired, { preferMobile: true, retries: 16 });
        if (attempt < maxAttempts) requestAnimationFrame(() => trySelect(attempt + 1));
      } else if (attempt < maxAttempts) {
        requestAnimationFrame(() => trySelect(attempt + 1));
      }
    };

    requestAnimationFrame(() => trySelect());
  }

  /* ======================= Slide atual ======================= */

  #currentSlideInfo() {
    const root = this.refs.slideshow || this;

    // 1) grupo com aria-hidden="false"
    const group = root.querySelector('[role="group"][aria-hidden="false"]');
    if (group) {
      const el = group.querySelector('[data-media-id][data-index]') || group;
      const idx = parseInt(el.getAttribute('data-index') || '0', 10) || 0;
      const mediaId = el.getAttribute('data-media-id');
      return { idx, mediaId };
    }

    // 2) item com aria-hidden="false"
    const items = [...root.querySelectorAll('[data-media-id][data-index]')];
    for (const el of items) {
      if (el.getAttribute('aria-hidden') === 'false') {
        const idx = parseInt(el.getAttribute('data-index') || '0', 10) || 0;
        const mediaId = el.getAttribute('data-media-id');
        return { idx, mediaId };
      }
    }

    // 3) fallback: selectedMediaId
    if (this.dataset.selectedMediaId) {
      const desired = String(this.dataset.selectedMediaId);
      const el = items.find((s) => s.getAttribute('data-media-id') === desired);
      if (el) {
        const idx = parseInt(el.getAttribute('data-index') || '0', 10) || 0;
        return { idx, mediaId: desired };
      }
    }

    // 4) primeiro
    const first = items[0];
    if (first) {
      const idx = parseInt(first.getAttribute('data-index') || '0', 10) || 0;
      const mediaId = first.getAttribute('data-media-id');
      return { idx, mediaId };
    }

    return { idx: 0, mediaId: null };
  }

  /* ======================= Sync de thumbs/dots ======================= */

  #syncPagination(idx, mediaId = null) {
    this.#isSyncingThumbs = true;

    const controlsLists = this.#scopedThumbControls();
    controlsLists.forEach((ctrl) => {
      const container = ctrl.querySelector('.slideshow-controls__thumbnails-container') || ctrl;
      const btns = Array.from(ctrl.querySelectorAll('.slideshow-controls__thumbnail[data-index]'));

      let idxForThisList = idx;
      if (mediaId) {
        const byId = btns.find((b) => b.getAttribute('data-media-id') === String(mediaId));
        if (byId) {
          const parsed = parseInt(byId.getAttribute('data-index') || '-1', 10);
          if (!Number.isNaN(parsed) && parsed >= 0) idxForThisList = parsed;
        }
      }

      btns.forEach((btn) => {
        const isActive = Number(btn.getAttribute('data-index')) === idxForThisList;
        btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
        btn.classList.toggle('is-selected', isActive);
        if (isActive) this.#scrollThumbIntoView(container, btn);
      });
    });

    // Dots (se presentes)
    const dots = this.querySelectorAll('.slideshow-controls__dots [data-index]');
    dots.forEach((dot) => {
      const isActive = Number(dot.getAttribute('data-index')) === idx;
      dot.setAttribute('aria-selected', isActive ? 'true' : 'false');
      dot.classList.toggle('is-selected', isActive);
    });

    requestAnimationFrame(() => { this.#isSyncingThumbs = false; });
  }

  // Marca SOMENTE as thumbs pelo mediaId (não depende do índice)
  #syncThumbsByMediaId(mediaId) {
    let matched = false;
    const lists = this.#scopedThumbControls();

    lists.forEach((ctrl) => {
      const container = ctrl.querySelector('.slideshow-controls__thumbnails-container') || ctrl;
      const btns = Array.from(ctrl.querySelectorAll('.slideshow-controls__thumbnail[data-index]'));
      const activeBtn = btns.find((b) => b.getAttribute('data-media-id') === String(mediaId));
      if (!activeBtn) return;

      matched = true;
      const wantIdx = parseInt(activeBtn.getAttribute('data-index') || '-1', 10);

      btns.forEach((btn) => {
        const isActive = btn === activeBtn;
        btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
        btn.classList.toggle('is-selected', isActive);
      });

      this.#scrollThumbIntoView(container, activeBtn);

      // Dots em sincronia
      const dots = this.querySelectorAll('.slideshow-controls__dots [data-index]');
      dots.forEach((dot) => {
        const isActive = Number(dot.getAttribute('data-index')) === wantIdx;
        dot.setAttribute('aria-selected', isActive ? 'true' : 'false');
        dot.classList.toggle('is-selected', isActive);
      });
    });

    return matched;
  }

  // Reforça por N frames sempre baseado no SLIDE ATUAL (ou selectedMediaId)
  #reinforceThumbSelection(frames = 2) {
    let i = 0;
    const tick = () => {
      const { idx, mediaId } = this.#currentSlideInfo();
      if (mediaId) {
        this.#syncPagination(idx, mediaId);
      } else if (this.dataset.selectedMediaId) {
        this.#syncThumbsByMediaId(String(this.dataset.selectedMediaId));
      }
      if (++i < frames) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  #scrollThumbIntoView(container, el) {
    if (!container || !el) return;
    const c = container.getBoundingClientRect();
    const e = el.getBoundingClientRect();
    if (e.left < c.left) {
      container.scrollLeft -= (c.left - e.left) + 8;
    } else if (e.right > c.right) {
      container.scrollLeft += (e.right - c.right) + 8;
    }
  }

  /* ======================= Observers ======================= */

  #observeSlideChanges() {
    const mo = new MutationObserver(() => {
      const { idx, mediaId } = this.#currentSlideInfo();
      if (mediaId) {
        this.#syncPagination(idx, mediaId);
      } else if (this.dataset.selectedMediaId) {
        this.#syncThumbsByMediaId(String(this.dataset.selectedMediaId));
      }
    });
    mo.observe(this, { subtree: true, attributes: true, attributeFilter: ['aria-hidden'] });
    this.#observers.push(mo);
  }

  /* ======================= Desktop drag nas thumbs ======================= */

  #initDesktopThumbDrag() {
    const isDesktopPointer = matchMedia('(pointer: fine)').matches && matchMedia('(hover: hover)').matches;
    if (!isDesktopPointer) return;

    // arraste só no controle primário (desktop)
    const lists = this.querySelectorAll('slideshow-controls[thumbnails][data-scope="primary"]');
    lists.forEach((ctrl) => {
      const mode = ctrl.getAttribute('scroll-mode') || 'horizontal';
      if (mode !== 'horizontal') return;

      const container = ctrl.querySelector('.slideshow-controls__thumbnails-container');
      if (!container) return;

      container.querySelectorAll('img').forEach((img) => {
        img.setAttribute('draggable', 'false');
        img.addEventListener('dragstart', (e) => e.preventDefault(), { passive: false });
      });

      let dragging = false;
      let startX = 0;
      let startScroll = 0;
      let pointerId = null;
      let suppressClick = false;
      const THRESHOLD = 10;

      const onPointerDown = (e) => {
        if (e.pointerType !== 'mouse' || e.button !== 0) return;
        startX = e.clientX;
        startScroll = container.scrollLeft;
        pointerId = e.pointerId;
        dragging = false;
        suppressClick = false;
      };

      const onPointerMove = (e) => {
        if (e.pointerType !== 'mouse') return;
        if ((e.buttons & 1) !== 1) { if (dragging) finishDrag(); return; }
        const dx = e.clientX - startX;

        if (!dragging && Math.abs(dx) >= THRESHOLD) {
          dragging = true;
          suppressClick = true;
          container.classList.add('is-dragging');
          container.setPointerCapture?.(pointerId);
        }

        if (dragging) {
          container.scrollLeft = startScroll - dx;
          e.preventDefault();
        }
      };

      const finishDrag = () => {
        if (dragging) {
          dragging = false;
          container.classList.remove('is-dragging');
          container.releasePointerCapture?.(pointerId);
        }
        pointerId = null;
      };

      const onPointerUp = () => finishDrag();
      const onPointerCancel = () => finishDrag();
      const onPointerLeave = (e) => { if (e.pointerType === 'mouse') finishDrag(); };

      const onClickCapture = (e) => {
        if (suppressClick) {
          e.stopPropagation();
          e.preventDefault();
          suppressClick = false;
        }
      };

      container.addEventListener('pointerdown', onPointerDown,   { passive: true });
      container.addEventListener('pointermove', onPointerMove,    { passive: false });
      container.addEventListener('pointerup',   onPointerUp,      { passive: true });
      container.addEventListener('pointercancel', onPointerCancel,{ passive: true });
      container.addEventListener('pointerleave', onPointerLeave,  { passive: true });
      container.addEventListener('click', onClickCapture, true);
    });
  }

  /* ======================= Preservar scroll no clique ======================= */

  #setupThumbsPreserveScroll() {
    const lists = this.#scopedThumbControls();
    lists.forEach((ctrl) => {
      const container = ctrl.querySelector('.slideshow-controls__thumbnails-container');
      if (!container) return;

      let saved = 0;

      const remember = () => { saved = container.scrollLeft || 0; };
      container.addEventListener('pointerdown', remember, { passive: true, capture: true });
      container.addEventListener('touchstart',  remember, { passive: true, capture: true });
      container.addEventListener('mousedown',   remember, { passive: true, capture: true });
      container.addEventListener('click',       remember, { passive: true, capture: true });

      container.addEventListener('click', () => {
        let attempts = 3;
        const tick = () => {
          container.scrollLeft = saved;
          if (--attempts > 0) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }, { passive: true });
    });
  }

  /* ======================= Lifecycle & handlers ======================= */

  disconnectedCallback() {
    super.disconnectedCallback();
    this.#controller.abort();
    this.#observers.forEach((mo) => mo.disconnect());
    this.#observers = [];
  }

#handleVariantUpdate = (event) => {
  const source = event.detail.data.html;
  if (!source) return;

  const newMediaGallery = source.querySelector('media-gallery');
  if (!newMediaGallery) return;

  // Marcar para o connectedCallback da NOVA galeria saber que veio de update
  newMediaGallery.dataset.fromVariantUpdate = 'true';

  // Troca efetiva do elemento
  this.replaceWith(newMediaGallery);

  // Após o upgrade do custom element e refs do slideshow, selecione a *mídia da variante*
  customElements.whenDefined('media-gallery').then(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        try {
          const mid = newMediaGallery.dataset.selectedMediaId;
          if (mid) {
            // Usa o seletor por mediaId (funciona melhor no iOS porque não depende do offset)
            newMediaGallery.#selectByMediaId(String(mid), { preferMobile: true, retries: 16 });
            newMediaGallery.#reinforceThumbSelection?.(4);
          } else {
            // Fallback: índice 0 (primeiro slide da ordem vinda do Liquid)
            newMediaGallery.slideshow?.select(0, undefined, { animate: false });
            newMediaGallery.#reinforceThumbSelection?.(4);
          }
        } catch (e) { /* silencioso */ }
      });
    });
  });
};

  #handleZoomMediaSelected = (event) => {
    const idx = event.detail.index;
    this.slideshow?.select(idx, undefined, { animate: false });
    this.#reinforceThumbSelection(4);
  };

  zoom(index, event) {
    this.refs.zoomDialogComponent?.open(index, event);
  }

  get slideshow() { return this.refs.slideshow; }
  get media() { return this.refs.media; }
  get presentation() { return this.dataset.presentation; }
}

if (!customElements.get('media-gallery')) {
  customElements.define('media-gallery', MediaGallery);
}