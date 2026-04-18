import { ThemeEvents, VariantUpdateEvent } from '@theme/events';

/**
 * A custom element that displays a product price.
 * This component listens for variant update events and updates the price display accordingly.
 * It handles price updates from two different sources:
 * 1. Variant picker (in quick add modal or product page)
 * 2. Swatches variant picker (in product cards)
 */
class ProductPrice extends HTMLElement {
  connectedCallback() {
    const closestSection = this.closest('.shopify-section, dialog');
    if (!closestSection) return;
    closestSection.addEventListener(ThemeEvents.variantUpdate, this.updatePrice);
  }

  disconnectedCallback() {
    const closestSection = this.closest('.shopify-section, dialog');
    if (!closestSection) return;
    closestSection.removeEventListener(ThemeEvents.variantUpdate, this.updatePrice);
  }

  /**
   * Updates the price.
   * @param {VariantUpdateEvent} event - The variant update event.
   */
updatePrice = (event) => {
  if (event.detail.data.newProduct) {
    this.dataset.productId = event.detail.data.newProduct.id;
  } else if (event.target instanceof HTMLElement && event.target.dataset.productId !== this.dataset.productId) {
    return;
  }

  const newPrice = event.detail.data.html.querySelector('product-price [ref="priceContainer"]');
  const currentPrice = this.querySelector('[ref="priceContainer"]');

  if (!newPrice || !currentPrice) return;

  if (currentPrice.innerHTML !== newPrice.innerHTML) {
    currentPrice.replaceWith(newPrice);
    // ---> ADICIONE ISSO
const variant =
  (event.detail && event.detail.data && event.detail.data.variant) ||
  event.detail?.variant || // fallback, dependendo do tema
  null;

if (window.atualizarParcelamento && variant) {
  const scope = this.closest('.shopify-section') || document;
  window.atualizarParcelamento(variant, scope);
}
  }

  // ====== NOVO BLOCO ======
  const variant =
    event.detail?.data?.variant ||
    event.detail?.variant ||
    event.detail?.data?.currentVariant ||
    event.detail?.data?.selectedVariant ||
    null;

  // Fallback: extrair preço do HTML se o tema não envia variant
  let fakeVariant = null;
  if(!variant){
    const priceNode = newPrice.querySelector('.price');
    const cents = priceNode ? parseInt(priceNode.textContent.replace(/\D/g,''),10) : NaN;
    if(!isNaN(cents)) fakeVariant = {price: cents};
  }

  const scope = this.closest('.shopify-section, dialog') || document;

  if(window.atualizarParcelamento){
    requestAnimationFrame(()=>{
      window.atualizarParcelamento(variant || fakeVariant, scope);
    });
  }
};
}

if (!customElements.get('product-price')) {
  customElements.define('product-price', ProductPrice);
}
