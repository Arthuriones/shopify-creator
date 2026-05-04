(function () {
  var configEl = document.getElementById("routed-checkout-config");
  if (!configEl) return;

  var config;
  try {
    config = JSON.parse(configEl.textContent || "{}");
  } catch (error) {
    console.warn("[RoutedCheckout] invalid config", error);
    return;
  }

  if (!config.enabled || !config.token || !config.resolveUrl) return;

  var isRouting = false;

  function rootPath() {
    return (window.Shopify && window.Shopify.routes && window.Shopify.routes.root) || "/";
  }

  function isCheckoutTarget(target) {
    if (!target || !target.closest) return false;
    return Boolean(
      target.closest('[name="checkout"], #checkout, a[href="/checkout"], a[href*="/checkout"], button[name="checkout"]')
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
      return {
        sku: item.sku || "",
        sourceVariantId: item.variant_id || item.id,
        quantity: item.quantity || 1,
      };
    });
  }

  async function resolveCheckout(cart) {
    var response = await fetch(config.resolveUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: config.token,
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

  async function routeCheckout(event) {
    if (isRouting || !isCheckoutTarget(event.target)) return;

    event.preventDefault();
    event.stopPropagation();
    isRouting = true;

    try {
      var cart = await getCart();
      if (!cart.items || cart.items.length === 0) {
        window.location.href = rootPath() + "cart";
        return;
      }

      window.location.href = await resolveCheckout(cart);
    } catch (error) {
      console.warn("[RoutedCheckout] fallback to native checkout", error);
      window.location.href = rootPath() + "checkout";
    } finally {
      setTimeout(function () {
        isRouting = false;
      }, 1500);
    }
  }

  document.addEventListener("click", routeCheckout, true);
  document.addEventListener(
    "submit",
    function (event) {
      var submitter = event.submitter;
      var form = event.target;
      var isCartForm = form && form.matches && form.matches('form[action*="/cart"]');
      if (submitter && isCheckoutTarget(submitter)) {
        routeCheckout(event);
      } else if (isCartForm && form.querySelector('[name="checkout"]')) {
        routeCheckout(event);
      }
    },
    true
  );
})();
