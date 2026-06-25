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
  var isAddingToCart = false;
  var yampiPatchTimer = null;
  var yampiPatchAttempts = 0;
  var initialized = false;

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
        '.btn-checkout',
        '.cart__checkout-button',
        '.js-transparent-checkout',
        '.yampi_purchase_confirmation_btn',
        '.dm-quick-purchase__buy',
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
        /checkout|finaliz|pagamento|pagar|fechar pedido|comprar agora|comprar ahora|comprar|buy now|ir a pagar|proceder|tramitar|realizar pedido/.test(text) ||
        (href && /checkout|checkouts/.test(href)) ||
        (action && /checkout|checkouts/.test(action)) ||
        checkoutElement.matches(
          ".shopify-payment-button__button, [data-testid*='Checkout-button'], .btn-checkout, .cart__checkout-button, .js-transparent-checkout, .yampi_purchase_confirmation_btn, .dm-quick-purchase__buy"
        )
    );
  }

  function isImmediatePurchaseTarget(target) {
    if (!target || !target.closest) return false;
    var button = target.closest("button, a, input, [role='button']");
    if (!button) return false;
    var closestForm = button.closest("form");
    var formAction = closestForm && closestForm.getAttribute("action");
    var insideCart =
      button.closest("cart-drawer-component, cart-items-component") ||
      (formAction && /\/cart(?!\/add)|\/checkout|\/checkouts/.test(formAction));
    var text = (button.textContent || button.value || "").toLowerCase();
    return Boolean(
      /comprar agora|comprar ahora|comprar|buy now|pagar ahora/.test(text) ||
        button.matches(".shopify-payment-button__button, [data-testid*='Checkout-button'], .dm-quick-purchase__buy") ||
        (button.matches(".js-transparent-checkout") && !insideCart)
    );
  }

  function isAddToCartTarget(target) {
    if (!target || !target.closest) return false;
    var button = target.closest("button, input, [role='button']");
    if (!button || isCheckoutTarget(button)) return false;
    var text = (button.textContent || button.value || "").toLowerCase();
    return Boolean(
      button.getAttribute("name") === "add" ||
        button.matches("[name='add'], .add-to-cart-button, .quick-add__button--add, #AddToCart, .ProductForm__AddToCart") ||
        /adicionar ao carrinho|adicionar|add to cart/.test(text)
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
    var form = target.closest("form") || findProductForm(target);
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

  async function routeCartCheckout(skipGuard) {
    if (isRouting && !skipGuard) return;
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

      await routeCartCheckout(true);
    } catch (error) {
      console.warn("[RoutedCheckout] fallback para checkout nativo", error);
      window.location.href = rootPath() + "checkout";
    } finally {
      setTimeout(function () {
        isRouting = false;
      }, 1500);
    }
  }

  function findProductForm(target) {
    if (!target || !target.closest) return null;
    var form = target.closest("form");
    if (form) return form;
    return document.querySelector('form[action*="/cart/add"]');
  }

  function submitProductForm(form) {
    var formData = new FormData(form);
    var sectionIds = Array.prototype.slice
      .call(document.querySelectorAll("cart-items-component"))
      .map(function (element) {
        return element.dataset && element.dataset.sectionId;
      })
      .filter(Boolean);

    if (sectionIds.length) {
      formData.set("sections", sectionIds.join(","));
      formData.set("sections_url", window.location.pathname);
    }

    return fetch(rootPath() + "cart/add.js", {
      method: "POST",
      credentials: "same-origin",
      headers: {
        Accept: "application/json, text/html",
        "X-Requested-With": "XMLHttpRequest",
      },
      body: formData,
    }).then(function (response) {
      if (!response.ok) {
        return new Promise(function (resolve) {
          setTimeout(resolve, 350);
        }).then(function () {
          return fetch(rootPath() + "cart/add.js", {
            method: "POST",
            credentials: "same-origin",
            headers: {
              Accept: "application/json",
              "X-Requested-With": "XMLHttpRequest",
            },
            body: new FormData(form),
          });
        });
      }
      return response;
    }).then(function (response) {
      if (!response.ok) throw new Error("Nao foi possivel adicionar ao carrinho.");
      return response.json();
    });
  }

  function getProductIdFromForm(form) {
    var productInput = form && form.querySelector('[name="product-id"]');
    return productInput && productInput.value ? productInput.value : "";
  }

  function animateAddToCartButton(target) {
    var component = target && target.closest && target.closest("add-to-cart-component");
    if (component && typeof component.animateAddToCart === "function") {
      component.animateAddToCart();
    }
  }

  async function syncThemeCart(item, response, form) {
    var cart = await getCart().catch(function () {
      return null;
    });
    var itemCount = cart && typeof cart.item_count === "number" ? cart.item_count : item.quantity || 1;
    var detail = {
      resource: {},
      sourceId: String(item.id || item.variant_id || ""),
      data: {
        source: "routed-checkout-loader",
        itemCount: itemCount,
        productId: getProductIdFromForm(form),
        sections: response && response.sections ? response.sections : {},
      },
    };

    document.dispatchEvent(
      new CustomEvent("cart:update", {
        bubbles: true,
        detail: detail,
      })
    );
    document.dispatchEvent(
      new CustomEvent("cart:refresh", {
        bubbles: true,
        detail: { item: item, cart: cart, sections: detail.data.sections },
      })
    );
    document.dispatchEvent(
      new CustomEvent("cart:updated", {
        bubbles: true,
        detail: { item: item, cart: cart, sections: detail.data.sections },
      })
    );
  }

  function openCartPreview() {
    setTimeout(function () {
      var selectors = [
        "cart-icon button",
        "[aria-controls*='cart']",
        "[data-cart-drawer-toggle]",
        "button.header-actions__action",
        "button[class*='cart']",
        "button"
      ];
      var buttons = [];

      selectors.forEach(function (selector) {
        buttons = buttons.concat(Array.prototype.slice.call(document.querySelectorAll(selector)));
      });

      var clicked = buttons.some(function (button) {
        var label = (
          button.getAttribute("aria-label") ||
          button.textContent ||
          button.value ||
          button.className ||
          ""
        ).toString().toLowerCase();
        var rect = button.getBoundingClientRect ? button.getBoundingClientRect() : null;
        if (!/cart|carrinho/.test(label)) return false;
        if (rect && (!rect.width || !rect.height)) return false;
        button.click();
        return true;
      });

      if (!clicked) {
        document.dispatchEvent(new CustomEvent("cart:open"));
        document.dispatchEvent(new CustomEvent("theme:cart:open"));
      }
    }, 450);
  }

  async function routeAddToCart(event) {
    if (isAddingToCart) return;
    var target = event.target;
    var form = findProductForm(target);
    if (!form) return;

    event.preventDefault();
    event.stopPropagation();
    if (event.stopImmediatePropagation) event.stopImmediatePropagation();
    isAddingToCart = true;

    try {
      animateAddToCartButton(target);
      var response = await submitProductForm(form);
      var item = response.items && response.items[0] ? response.items[0] : response;
      document.dispatchEvent(
        new CustomEvent("routed-checkout:cart-added", { detail: { item: item } })
      );
      await syncThemeCart(item, response, form);
      openCartPreview();
    } catch (error) {
      console.warn("[RoutedCheckout] fallback para add-to-cart nativo", error);
      form.submit();
    } finally {
      setTimeout(function () {
        isAddingToCart = false;
      }, 1200);
    }
  }

  function handleDocumentClick(event) {
    if (isCheckoutTarget(event.target)) {
      routeCheckout(event);
    }
    // O "adicionar ao carrinho" NAO e interceptado: o proprio tema adiciona o
    // produto da vitrine normalmente (1 item). O roteamento acontece so no
    // checkout. Interceptar o add causava double-add (loader + tema = 2 itens).
  }

  function patchYampiCheckoutFunctions() {
    ["getNewCheckoutURL", "yampiClick", "fakeClick"].forEach(function (name) {
      var current = window[name];
      if (typeof current !== "function" || current.__routedCheckoutWrapped) return;
      window[name] = function (event) {
        if (event && event.preventDefault) event.preventDefault();
        routeCartCheckout();
        return false;
      };
      window[name].__routedCheckoutWrapped = true;
    });

    yampiPatchAttempts += 1;
    if (yampiPatchAttempts > 40 && yampiPatchTimer) {
      clearInterval(yampiPatchTimer);
      yampiPatchTimer = null;
    }
  }

  function bindDirectCheckoutTargets() {
    var selector =
      "[name='checkout'], [data-checkout], a[href*='/checkout'], button[name='checkout'], input[name='checkout'], .btn-checkout, .cart__checkout-button, .js-transparent-checkout, .yampi_purchase_confirmation_btn, .dm-quick-purchase__buy";
    Array.prototype.slice.call(document.querySelectorAll(selector)).forEach(function (element) {
      if (element.__routedCheckoutBound) return;
      element.__routedCheckoutBound = true;
      element.addEventListener(
        "click",
        function (event) {
          routeCheckout(event, element);
        },
        true
      );
    });
  }

  function init() {
    if (initialized || !document.body) return;
    initialized = true;
    window.addEventListener("click", handleDocumentClick, true);
    document.addEventListener("click", handleDocumentClick, true);
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
    bindDirectCheckoutTargets();
    patchYampiCheckoutFunctions();
    yampiPatchTimer = setInterval(function () {
      bindDirectCheckoutTargets();
      patchYampiCheckoutFunctions();
    }, 500);
  }

  function boot() {
    if (document.body) {
      init();
      return;
    }
    setTimeout(boot, 50);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  }
  boot();
})();
