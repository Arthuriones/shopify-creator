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
        /checkout|finalizar|pagamento|fechar pedido|comprar agora|buy now/.test(text) ||
        (href && /checkout|checkouts/.test(href)) ||
        (action && /checkout|checkouts/.test(action)) ||
        checkoutElement.matches(".shopify-payment-button__button, [data-testid*='Checkout-button']")
    );
  }

  function isImmediatePurchaseTarget(target) {
    if (!target || !target.closest) return false;
    var button = target.closest("button, a, input, [role='button']");
    if (!button) return false;
    var text = (button.textContent || button.value || "").toLowerCase();
    return Boolean(
      /comprar agora|buy now/.test(text) ||
        button.matches(".shopify-payment-button__button, [data-testid*='Checkout-button']")
    );
  }

  function isCheckoutForm(form) {
    if (!form || !form.matches) return false;
    var action = form.getAttribute("action") || "";
    return (
      form.matches('form[action*="/checkout"], form[action*="/checkouts"]') ||
      /\/checkout|\/checkouts/.test(action) ||
      Boolean(
        form.querySelector(
          '[name="checkout"], [data-checkout], a[href*="/checkout"], button[name="checkout"], input[name="checkout"]'
        )
      )
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

  function readProductFormLine(target) {
    if (!target || !target.closest) return null;
    var form = target.closest("form");
    if (!form) return null;
    var variantInput =
      form.querySelector('[name="id"]') ||
      form.querySelector('select[name="id"]') ||
      form.querySelector('input[name="variant"]');
    var variantId = variantInput && variantInput.value;
    if (!variantId) return null;
    var quantityInput = form.querySelector('[name="quantity"]');
    var quantity = quantityInput ? Number(quantityInput.value || 1) : 1;
    return {
      sku: "",
      sourceVariantId: "gid://shopify/ProductVariant/" + variantId,
      quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
    };
  }

  async function resolveCheckoutLines(lines) {
    var response = await fetch(appUrl.replace(/\/$/, "") + "/api/checkout-routes/resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: token,
        lines: lines,
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

  async function resolveCheckout(cart) {
    return resolveCheckoutLines(toRouteLines(cart));
  }

  async function routeCheckout(event, targetOverride) {
    var target = targetOverride || event.target;
    if (isRouting || !isCheckoutTarget(target)) return;

    event.preventDefault();
    event.stopPropagation();
    if (event.stopImmediatePropagation) event.stopImmediatePropagation();
    isRouting = true;

    try {
      if (isImmediatePurchaseTarget(target)) {
        var directLine = readProductFormLine(target);
        if (directLine) {
          window.location.href = await resolveCheckoutLines([directLine]);
          return;
        }
      }

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
          routeCheckout(
            event,
            form.querySelector(
              '[name="checkout"], [data-checkout], a[href*="/checkout"], button[name="checkout"], input[name="checkout"]'
            ) || form
          );
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
