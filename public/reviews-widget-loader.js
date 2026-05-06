(function () {
  var scriptTag = document.currentScript;
  if (!scriptTag) return;

  var appUrl = scriptTag.dataset.appUrl || new URL(scriptTag.src).origin;
  var limit = scriptTag.dataset.limit || "12";

  function getProductId() {
    var analyticsProduct =
      window.ShopifyAnalytics &&
      window.ShopifyAnalytics.meta &&
      window.ShopifyAnalytics.meta.product;
    if (analyticsProduct && analyticsProduct.id) return String(analyticsProduct.id);

    var metaProduct = window.meta && window.meta.product;
    if (metaProduct && metaProduct.id) return String(metaProduct.id);

    var productInput = document.querySelector('[name="product-id"]');
    return productInput && productInput.value ? String(productInput.value) : "";
  }

  function getProductHandle() {
    var match = window.location.pathname.match(/\/products\/([^/?#]+)/);
    return match ? decodeURIComponent(match[1]) : "";
  }

  function getShopDomain() {
    return (window.Shopify && window.Shopify.shop) || "";
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function stars(rating) {
    var count = Math.max(1, Math.min(5, Number(rating || 5)));
    return Array.from({ length: 5 })
      .map(function (_, index) {
        return '<span class="scr-star' + (index < count ? " is-filled" : "") + '">★</span>';
      })
      .join("");
  }

  function findMount() {
    var explicit = document.querySelector("[data-shopify-creator-reviews]");
    if (explicit) return explicit;

    var productInfo =
      document.querySelector("product-info") ||
      document.querySelector(".product__info-container") ||
      document.querySelector(".product-information") ||
      document.querySelector("product-form-component") ||
      document.querySelector('form[action*="/cart/add"]');

    var mount = document.createElement("section");
    mount.setAttribute("data-shopify-creator-reviews", "true");
    if (productInfo && productInfo.parentNode) {
      productInfo.parentNode.insertBefore(mount, productInfo.nextSibling);
    } else {
      document.body.appendChild(mount);
    }
    return mount;
  }

  function render(reviews) {
    if (!reviews.length) return;
    var mount = findMount();
    mount.innerHTML =
      '<style>' +
      ".scr-reviews{margin:32px 0;padding:24px;border:1px solid rgba(15,23,42,.12);border-radius:14px;background:#fff;color:#111827;font-family:inherit}" +
      ".scr-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:18px}" +
      ".scr-title{margin:0;font-size:22px;line-height:1.2;font-weight:700}" +
      ".scr-badge{display:inline-flex;align-items:center;border:1px solid rgba(15,23,42,.14);border-radius:999px;padding:5px 9px;font-size:11px;color:#475569;background:#f8fafc;white-space:nowrap}" +
      ".scr-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:14px}" +
      ".scr-card{border:1px solid rgba(15,23,42,.1);border-radius:12px;overflow:hidden;background:#fff}" +
      ".scr-img{display:block;width:100%;aspect-ratio:1/1;object-fit:cover;background:#f3f4f6}" +
      ".scr-body{padding:14px}" +
      ".scr-stars{color:#f59e0b;font-size:14px;letter-spacing:1px}" +
      ".scr-star{color:#d1d5db}.scr-star.is-filled{color:#f59e0b}" +
      ".scr-review-title{margin:9px 0 6px;font-size:14px;font-weight:700;line-height:1.35}" +
      ".scr-copy{margin:0;color:#374151;font-size:13px;line-height:1.55}" +
      ".scr-meta{margin-top:12px;display:flex;align-items:center;justify-content:space-between;gap:10px;color:#64748b;font-size:12px}" +
      ".scr-disclosure{margin-top:16px;color:#64748b;font-size:11px;line-height:1.45}" +
      "@media(max-width:640px){.scr-reviews{margin:24px 0;padding:18px}.scr-head{display:block}.scr-badge{margin-top:10px}.scr-title{font-size:20px}}" +
      "</style>" +
      '<div class="scr-reviews">' +
      '<div class="scr-head"><h2 class="scr-title">Reviews do produto</h2><span class="scr-badge">Conteúdo gerado por IA</span></div>' +
      '<div class="scr-grid">' +
      reviews
        .map(function (review) {
          return (
            '<article class="scr-card">' +
            (review.imageUrl
              ? '<img class="scr-img" src="' + escapeHtml(review.imageUrl) + '" alt="">'
              : "") +
            '<div class="scr-body">' +
            '<div class="scr-stars" aria-label="' + escapeHtml(review.rating) + ' de 5">' +
            stars(review.rating) +
            "</div>" +
            '<h3 class="scr-review-title">' +
            escapeHtml(review.title) +
            "</h3>" +
            '<p class="scr-copy">' +
            escapeHtml(review.body) +
            "</p>" +
            '<div class="scr-meta"><strong>' +
            escapeHtml(review.customerName) +
            "</strong><span>" +
            escapeHtml(review.productUseCase) +
            "</span></div>" +
            "</div></article>"
          );
        })
        .join("") +
      "</div>" +
      '<p class="scr-disclosure">' +
      escapeHtml(reviews[0].disclosure || "Conteúdo gerado por IA / simulação") +
      "</p>" +
      "</div>";
  }

  function load() {
    var productId = getProductId();
    var handle = getProductHandle();
    if (!productId && !handle) return;

    var params = new URLSearchParams({
      shop: getShopDomain(),
      host: window.location.hostname,
      productId: productId,
      handle: handle,
      limit: limit,
    });

    fetch(appUrl.replace(/\/$/, "") + "/api/public/reviews?" + params.toString(), {
      headers: { Accept: "application/json" },
    })
      .then(function (response) {
        if (!response.ok) throw new Error("reviews unavailable");
        return response.json();
      })
      .then(function (data) {
        render(data.reviews || []);
      })
      .catch(function (error) {
        console.warn("[ShopifyCreatorReviews] widget nao carregado", error);
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", load, { once: true });
  } else {
    load();
  }
})();
