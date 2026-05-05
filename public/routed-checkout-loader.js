(function () {
  var scriptTag = document.currentScript;
  if (!scriptTag) return;

  var token = scriptTag.dataset.token || "";
  var appUrl = scriptTag.dataset.appUrl || new URL(scriptTag.src).origin;

  if (!token) {
    console.error("[RoutedCheckout] data-token nao encontrado no script.");
    return;
  }

  var isRouting = false;

  function rootPath() {
    return (window.Shopify && window.Shopify.routes && window.Shopify.routes.root) || "/";
  }

  function isCheckoutTarget(target) {
    if (!target || !target.closest) return false;
    var checkoutElement = target.closest(
      [
        '[name="checkout"]',
        '[id*="checkout"]',
        '[class*="checkout"]',
        '[data-checkout]',
        '[data-testid*="checkout"]',
        'a',
        'button',
        '[role="button"]',
        'a[href="/checkout"]',
        'a[href*="/checkout"]',
        'button[name="checkout"]',
        'button[type="submit"]',
        'input[name="checkout"]',
        'input[type="submit"]'
      ].join(",")
    );

    if (!checkoutElement) return false;

    var href = checkoutElement.getAttribute && checkoutElement.getAttribute("href");
    var action = checkoutElement.getAttribute && checkoutElement.getAttribute("formaction");
    var text = (checkoutElement.textContent || checkoutElement.value || "").toLowerCase();

    return Boolean(
      checkoutElement.getAttribute("name") === "checkout" ||
        /checkout|finalizar|pagamento|fechar pedido/.test(text) ||
        (href && /checkout|checkouts|cart/.test(href)) ||
        (action && /checkout|checkouts|cart/.test(action))
    );
  }

  function isCheckoutForm(form) {
    if (!form || !form.matches) return false;
    var action = form.getAttribute("action") || "";
    return (
      form.matches('form[action*="/cart"], form[action*="/checkout"], form[action*="/checkouts"]') ||
      /\/cart|\/checkout|\/checkouts/.test(action) ||
      Boolean(form.querySelector('[name="checkout"], [id*="checkout"], [class*="checkout"]'))
    );
  }

  async function getCart() {
    var response = await fetch(rootPath() + "cart.js", {
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) throw new Error("Nao foi possivel ler o carrinho.");
    return response.json();
  }

  function toRouteLines(cart) {
    return (cart.items || []).map(function (item) {
      var variantId = item.variant_id || item.id;
      return {
        sku: item.sku || "",
        sourceVariantId: variantId ? "gid://shopify/ProductVariant/" + variantId : "",
        quantity: item.quantity || 1,
      };
    });
  }

  async function resolveCheckout(cart) {
    var response = await fetch(appUrl.replace(/\/$/, "") + "/api/checkout-routes/resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: token,
        lines: toRouteLines(cart),
      }),
    });

    var data = await response.json().catch(function () {
      return {};
    });

    if (!response.ok || !data.redirectUrl) {
      throw new Error(data.error || "Nao foi possivel rotear o checkout.");
    }

    return data.redirectUrl;
  }

  async function routeCheckout(event, targetOverride) {
    var target = targetOverride || event.target;
    if (isRouting || !isCheckoutTarget(target)) return;

    event.preventDefault();
    event.stopPropagation();
    if (event.stopImmediatePropagation) event.stopImmediatePropagation();
    isRouting = true;

    try {
      var cart = await getCart();
      if (!cart.items || cart.items.length === 0) {
        window.location.href = rootPath() + "cart";
        return;
      }

      window.location.href = await resolveCheckout(cart);
    } catch (error) {
      console.warn("[RoutedCheckout] fallback para checkout nativo", error);
      window.location.href = rootPath() + "checkout";
    } finally {
      setTimeout(function () {
        isRouting = false;
      }, 1500);
    }
  }

  function init() {
    document.addEventListener("click", routeCheckout, true);
    document.addEventListener(
      "submit",
      function (event) {
        var submitter = event.submitter;
        var form = event.target;
        if (submitter && isCheckoutTarget(submitter)) {
          routeCheckout(event, submitter);
        } else if (isCheckoutForm(form)) {
          routeCheckout(event, form.querySelector('[name="checkout"], [id*="checkout"], [class*="checkout"], button[type="submit"], input[type="submit"]') || form);
        }
      },
      true
    );
  }

  if (document.body) {
    init();
  } else {
    document.addEventListener("DOMContentLoaded", init);
  }
})();
