import {
  getApps,
  initializeApp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";

import {
  getAuth,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  collection,
  getDocs,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import { firebaseConfig } from "./firebase-config.js";

// =====================================================
// FIREBASE
// =====================================================

const firebaseApp =
  getApps().length > 0
    ? getApps()[0]
    : initializeApp(firebaseConfig);

const firebaseAuth = getAuth(firebaseApp);
const firestore = getFirestore(firebaseApp);

let loggedInUser = null;

// =====================================================
// AUTH READY
// =====================================================

const authReady = new Promise((resolve) => {
  onAuthStateChanged(firebaseAuth, (user) => {
    loggedInUser = user;
    resolve(user);
  });
});

async function getUser() {
  await Promise.race([
    authReady,
    new Promise((resolve) => setTimeout(resolve, 4000))
  ]);

  return loggedInUser || firebaseAuth.currentUser;
}

// =====================================================
// MAIN APP
// =====================================================

function initApp() {
  const isCategoryPage =
    document.body.classList.contains("category-page");

  // =================================================
  // CATEGORY LABELS
  // =================================================

  const CATEGORY_LABELS = {
    all: "All Jewellery",
    earrings: "Earrings",
    bracelets: "Bracelets",
    sets: "Jewellery Sets",
    kamarbandh: "Kamarbandh",
    necklaces: "Necklaces",
    hathphool: "Hathphool",
    "hair-accessories": "Hair Accessories",
    anklets: "Anklets",
    rings: "Rings"
  };

  // =================================================
  // HELPERS
  // =================================================

  function formatRupees(amount) {
    return "₹" + Number(amount || 0).toLocaleString("en-IN");
  }

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  // =================================================
  // DISCOUNT BADGE
  // =================================================

  function applyDiscountBadge(card) {
    if (!card || card.dataset.badgeDone === "1") {
      return;
    }

    card.dataset.badgeDone = "1";

    const discount = Number(card.dataset.discount || 0);

    if (!discount) {
      return;
    }

    const priceEl = card.querySelector(".product-price");
    const imageEl = card.querySelector(".product-image");

    if (!priceEl || !imageEl) {
      return;
    }

    const currentPrice = Number(
      priceEl.dataset.price ||
      priceEl.textContent.replace(/[^\d.]/g, "")
    );

    if (!currentPrice) {
      return;
    }

    const originalPrice = Math.round(
      currentPrice / (1 - discount / 100)
    );

    const badge = document.createElement("span");

    badge.className = "discount-badge";
    badge.textContent = `${discount}% OFF`;

    imageEl.appendChild(badge);

    const group = document.createElement("span");

    group.className = "price-group";

    const originalSpan = document.createElement("span");

    originalSpan.className = "price-original";

    originalSpan.textContent =
      formatRupees(originalPrice);

    priceEl.replaceWith(group);

    group.appendChild(originalSpan);
    group.appendChild(priceEl);
  }

  // =================================================
  // LOW STOCK BADGE
  // =================================================

  function applyLowStockBadge(card) {
    if (!card) {
      return;
    }

    const stock = Number(card.dataset.stock);

    if (!Number.isFinite(stock)) {
      return;
    }

    // Remove old stock badges
    card
      .querySelectorAll(".low-stock-badge")
      .forEach((badge) => {
        badge.remove();
      });

    // Reset card
    card.classList.remove("out-of-stock");

    card
      .querySelectorAll(".add-cart-btn, .buy-now-btn")
      .forEach((button) => {
        button.disabled = false;
      });

    const productInfo =
      card.querySelector(".product-info");

    if (!productInfo) {
      return;
    }

    // More than 5 = no message
    if (stock > 5) {
      card.dataset.stockBadgeDone = "1";
      return;
    }

    const badge =
      document.createElement("div");

    badge.className =
      "low-stock-badge";

    // =================================================
    // OUT OF STOCK
    // =================================================

    if (stock <= 0) {
      badge.classList.add(
        "out-of-stock"
      );

      badge.textContent =
        "Out of Stock";

      card.classList.add(
        "out-of-stock"
      );

      card
        .querySelectorAll(
          ".add-cart-btn, .buy-now-btn"
        )
        .forEach((button) => {
          button.disabled = true;
        });
    }

    // =================================================
    // LOW STOCK
    // =================================================

    else {
      badge.textContent =
        stock === 1
          ? "Only 1 piece remaining"
          : `Only ${stock} pieces remaining`;
    }

    // =================================================
    // BADGE POSITION
    // =================================================

    const description =
      productInfo.querySelector(
        ".product-description"
      );

    if (description) {
      description.insertAdjacentElement(
        "afterend",
        badge
      );
    } else {
      productInfo.prepend(
        badge
      );
    }

    card.dataset.stockBadgeDone = "1";
  }

  // =================================================
  // STOCK CACHE
  // =================================================

  const stockCache = new Map();

  // =================================================
  // FIND PRODUCT CARD
  // =================================================

  function findProductCardById(
    productId,
    root = document
  ) {
    if (!productId) {
      return null;
    }

    const cards =
      root.querySelectorAll(
        ".product-card"
      );

    for (const card of cards) {
      const buttons =
        card.querySelectorAll(
          "[data-id]"
        );

      for (const button of buttons) {
        if (
          button.dataset.id ===
          String(productId)
        ) {
          return card;
        }
      }
    }

    return null;
  }

  // =================================================
  // GET PRODUCT STOCK
  // FIRESTORE = MAIN SOURCE
  // =================================================

  async function getProductStock(
    productId,
    sourceButton = null
  ) {
    const normalizedId =
      String(productId || "");

    if (!normalizedId) {
      return null;
    }

    // =================================================
    // 1. FIRESTORE
    // =================================================

    try {
      const productRef =
        doc(
          firestore,
          "products",
          normalizedId
        );

      const snapshot =
        await getDoc(
          productRef
        );

      if (snapshot.exists()) {
        const data =
          snapshot.data();

        const stock =
          Number(
            data.stock
          );

        if (Number.isFinite(stock)) {
          stockCache.set(
            normalizedId,
            stock
          );

          return stock;
        }
      }
    }

    catch (error) {
      console.error(
        "Firestore stock read error:",
        error
      );
    }

    // =================================================
    // 2. CACHE
    // =================================================

    if (
      stockCache.has(
        normalizedId
      )
    ) {
      return stockCache.get(
        normalizedId
      );
    }

    // =================================================
    // 3. HTML FALLBACK
    // =================================================

    const currentCard =
      sourceButton?.closest(
        ".product-card"
      ) ||
      findProductCardById(
        normalizedId
      );

    if (
      currentCard &&
      currentCard.dataset.stock !==
        undefined
    ) {
      const stock =
        Number(
          currentCard.dataset.stock
        );

      if (
        Number.isFinite(
          stock
        )
      ) {
        stockCache.set(
          normalizedId,
          stock
        );

        return stock;
      }
    }

    return null;
  }

  // =================================================
  // VALIDATE CHECKOUT STOCK
  // =================================================

  async function validateCheckoutStock(
    items
  ) {
    for (
      const item of items
    ) {
      const stock =
        await getProductStock(
          item.id
        );

      if (
        !Number.isFinite(
          stock
        )
      ) {
        continue;
      }

      const qty =
        Number(item.qty) || 1;

      if (
        stock <= 0
      ) {
        return {
          ok: false,
          message:
            `${item.name} is out of stock.`
        };
      }

      if (
        qty > stock
      ) {
        return {
          ok: false,
          message:
            `Only ${stock} piece${
              stock === 1
                ? ""
                : "s"
            } of ${
              item.name
            } available.`
        };
      }
    }

    return {
      ok: true
    };
  }

  // =================================================
  // CART
  // =================================================

  const CART_KEY =
    "ayonizaCart";

  const OPEN_CART_FLAG =
    "ayonizaOpenCart";

  const BUY_NOW_KEY =
    "ayonizaBuyNow";

  // =================================================
  // LOAD CART
  // =================================================

  function loadCart() {
    try {
      const raw =
        localStorage.getItem(
          CART_KEY
        );

      const parsed =
        raw
          ? JSON.parse(raw)
          : [];

      if (
        !Array.isArray(parsed)
      ) {
        return [];
      }

      return parsed
        .filter(
          (item) =>
            item &&
            item.id &&
            item.name &&
            Number(item.price) >= 0 &&
            Number(item.qty) > 0
        )
        .map(
          (item) => ({
            id: String(
              item.id
            ),

            name: String(
              item.name
            ),

            price: Number(
              item.price
            ),

            image: String(
              item.image || ""
            ),

            qty: Math.floor(
              Number(item.qty)
            )
          })
        );
    }

    catch (error) {
      console.error(
        "Cart load error:",
        error
      );

      return [];
    }
  }

  // =================================================
  // SAVE CART
  // =================================================

  function saveCart() {
    try {
      localStorage.setItem(
        CART_KEY,
        JSON.stringify(
          cart
        )
      );
    }

    catch (error) {
      console.error(
        "Cart save error:",
        error
      );
    }
  }

  let cart =
    loadCart();

  // =================================================
  // CART ELEMENTS
  // =================================================

  const cartCountEl =
    document.getElementById(
      "cartCount"
    );

  const cartItemsEl =
    document.getElementById(
      "cartItems"
    );

  const cartEmptyEl =
    document.getElementById(
      "cartEmpty"
    );

  const cartTotalEl =
    document.getElementById(
      "cartTotal"
    );

  const cartDrawer =
    document.getElementById(
      "cartDrawer"
    );

  const cartOverlay =
    document.getElementById(
      "cartOverlay"
    );

  const openCartBtn =
    document.getElementById(
      "openCartBtn"
    );

  const closeCartBtn =
    document.getElementById(
      "closeCartBtn"
    );

  const continueShoppingBtn =
    document.getElementById(
      "continueShoppingBtn"
    );

  const checkoutBtn =
    document.getElementById(
      "checkoutBtn"
    );

  // =================================================
  // OPEN CART
  // =================================================

  function openCart() {
    cartDrawer?.classList.add(
      "open"
    );

    cartOverlay?.classList.add(
      "active"
    );

    cartDrawer?.setAttribute(
      "aria-hidden",
      "false"
    );
  }

  // =================================================
  // CLOSE CART
  // =================================================

  function closeCart() {
    cartDrawer?.classList.remove(
      "open"
    );

    cartOverlay?.classList.remove(
      "active"
    );

    cartDrawer?.setAttribute(
      "aria-hidden",
      "true"
    );
  }

  // =================================================
  // RENDER CART
  // =================================================

  function renderCart() {
    saveCart();

    const totalQty =
      cart.reduce(
        (sum, item) =>
          sum + item.qty,
        0
      );

    const totalPrice =
      cart.reduce(
        (sum, item) =>
          sum +
          item.qty *
            item.price,
        0
      );

    if (
      cartCountEl
    ) {
      cartCountEl.textContent =
        totalQty;
    }

    if (
      cartTotalEl
    ) {
      cartTotalEl.textContent =
        formatRupees(
          totalPrice
        );
    }

    if (
      checkoutBtn
    ) {
      checkoutBtn.disabled =
        cart.length === 0;
    }

    if (
      !cartItemsEl
    ) {
      return;
    }

    cartItemsEl
      .querySelectorAll(
        ".cart-item"
      )
      .forEach(
        (element) =>
          element.remove()
      );

    if (
      cart.length === 0
    ) {
      if (
        cartEmptyEl
      ) {
        cartEmptyEl.hidden =
          false;
      }

      return;
    }

    if (
      cartEmptyEl
    ) {
      cartEmptyEl.hidden =
        true;
    }

    cart.forEach(
      (item) => {

        const row =
          document.createElement(
            "div"
          );

        row.className =
          "cart-item";

        row.innerHTML = `
          <img
            src="${esc(
              item.image
            )}"
            alt="${esc(
              item.name
            )}"
          >

          <div>

            <p class="cart-item-name">
              ${esc(
                item.name
              )}
            </p>

            <p class="cart-item-price">
              ${formatRupees(
                item.price
              )}
            </p>

            <div class="cart-item-qty">

              <button
                class="qty-btn"
                data-action="decrease"
                data-id="${esc(
                  item.id
                )}"
                aria-label="Decrease quantity"
              >
                −
              </button>

              <span>
                ${item.qty}
              </span>

              <button
                class="qty-btn"
                data-action="increase"
                data-id="${esc(
                  item.id
                )}"
                aria-label="Increase quantity"
              >
                +
              </button>

            </div>

          </div>

          <button
            class="remove-item"
            data-action="remove"
            data-id="${esc(
              item.id
            )}"
          >
            Remove
          </button>
        `;

        cartItemsEl.appendChild(
          row
        );
      }
    );
  }

  // =================================================
  // ADD TO CART
  // =================================================

  function addToCart(
    {
      id,
      name,
      price,
      image
    },
    shouldOpen = true
  ) {
    const normalizedId =
      String(
        id || ""
      );

    const existing =
      cart.find(
        (item) =>
          item.id ===
          normalizedId
      );

    if (
      existing
    ) {
      existing.qty += 1;
    }

    else {
      cart.push({

        id:
          normalizedId,

        name:
          String(
            name || ""
          ),

        price:
          Number(
            price
          ) || 0,

        image:
          String(
            image || ""
          ),

        qty:
          1

      });
    }

    renderCart();

    if (
      shouldOpen
    ) {
      openCart();
    }
  }

  // =================================================
  // CHANGE QUANTITY
  // =================================================

  async function changeQty(
    id,
    delta
  ) {
    const item =
      cart.find(
        (entry) =>
          entry.id ===
          id
      );

    if (!item) {
      return;
    }

    // Increase quantity
    if (
      delta > 0
    ) {
      const stock =
        await getProductStock(
          id
        );

      if (
        Number.isFinite(
          stock
        )
      ) {

        if (
          stock <= 0
        ) {
          alert(
            `${item.name} is out of stock.`
          );

          cart =
            cart.filter(
              (entry) =>
                entry.id !==
                id
            );

          renderCart();

          return;
        }

        if (
          item.qty >=
          stock
        ) {
          alert(
            `Only ${stock} piece${
              stock === 1
                ? ""
                : "s"
            } available for ${item.name}.`
          );

          return;
        }
      }
    }

    item.qty += delta;

    if (
      item.qty <= 0
    ) {
      cart =
        cart.filter(
          (entry) =>
            entry.id !==
            id
        );
    }

    renderCart();
  }

  // =================================================
  // REMOVE ITEM
  // =================================================

  function removeItem(
    id
  ) {
    cart =
      cart.filter(
        (item) =>
          item.id !==
          id
      );

    renderCart();
  }

  // =================================================
  // CHECKOUT ELEMENTS
  // =================================================

  const STORAGE_KEY =
    "ayonizaCustomerInfo";


  // =================================================
  // PHONEPE
  // =================================================

  const PHONEPE_WORKER_URL =
    "https://ayoniza-payment.ayoniza-support.workers.dev";

  const PAYMENT_RESULT_URL =
    "https://ayoniza.shop/payment-result.html";

  const checkoutOverlay =
    document.getElementById(
      "checkoutOverlay"
    );

  const checkoutModal =
    document.getElementById(
      "checkoutModal"
    );

  const checkoutClose =
    document.getElementById(
      "checkoutClose"
    );

  const checkoutBack =
    document.getElementById(
      "checkoutBack"
    );

  const checkoutTitle =
    document.getElementById(
      "checkoutTitle"
    );

  const checkoutForm =
    document.getElementById(
      "checkoutForm"
    );

  const checkoutConfirmStep =
    document.getElementById(
      "checkoutConfirmStep"
    );

  const checkoutPaymentStep =
    document.getElementById(
      "checkoutPaymentStep"
    );

  const orderSummaryEl =
    document.getElementById(
      "orderSummary"
    );

  const orderTotalEl =
    document.getElementById(
      "orderTotal"
    );

  const confirmOrderSummaryEl =
    document.getElementById(
      "confirmOrderSummary"
    );

  const confirmOrderTotalEl =
    document.getElementById(
      "confirmOrderTotal"
    );

  const confirmNameEl =
    document.getElementById(
      "confirmName"
    );

  const confirmAddressLineEl =
    document.getElementById(
      "confirmAddressLine"
    );

  const confirmPhoneLineEl =
    document.getElementById(
      "confirmPhoneLine"
    );

  const changeAddressBtn =
    document.getElementById(
      "changeAddressBtn"
    );

  const confirmContinueBtn =
    document.getElementById(
      "confirmContinueBtn"
    );

  const placeOrderBtn =
    document.getElementById(
      "placeOrderBtn"
    );

  const saveInfoCheckbox =
    document.getElementById(
      "saveInfo"
    );

  const stepItems =
    document.querySelectorAll(
      "#checkoutSteps .step-item"
    );

  let checkoutItems =
    [];

  let checkoutSource =
    "cart";

  let currentStep =
    1;

  // =================================================
  // LOAD SAVED INFO
  // =================================================

  function loadSavedInfo() {
    try {

      const raw =
        localStorage.getItem(
          STORAGE_KEY
        );

      return raw
        ? JSON.parse(
            raw
          )
        : null;

    }

    catch (error) {

      console.error(
        "Saved info load error:",
        error
      );

      return null;
    }
  }

  // =================================================
  // PREFILL CHECKOUT FORM
  // =================================================

  async function prefillForm() {
    if (!checkoutForm) {
      return;
    }

    let saved =
      loadSavedInfo();

    const user =
      await getUser();

    if (
      user
    ) {

      try {

        const snapshot =
          await getDoc(
            doc(
              firestore,
              "users",
              user.uid
            )
          );

        if (
          snapshot.exists()
        ) {

          const data =
            snapshot.data();

          saved = {

            name:
              data.fullName ||
              saved?.name ||
              user.displayName ||
              "",

            mobile:
              data.phone ||
              saved?.mobile ||
              "",

            address:
              data.address ||
              saved?.address ||
              "",

            landmark:
              data.landmark ||
              saved?.landmark ||
              "",

            city:
              data.city ||
              saved?.city ||
              "",

            state:
              data.state ||
              saved?.state ||
              "",

            pin:
              data.pincode ||
              saved?.pin ||
              "",

            country:
              data.country ||
              saved?.country ||
              "India"

          };
        }

      }

      catch (error) {

        console.error(
          "Could not load customer profile:",
          error
        );

      }
    }

    if (!saved) {
      return;
    }

    if (
      checkoutForm.custName
    ) {
      checkoutForm.custName.value =
        saved.name || "";
    }

    if (
      checkoutForm.custMobile
    ) {
      checkoutForm.custMobile.value =
        saved.mobile || "";
    }

    if (
      checkoutForm.custAddress
    ) {
      checkoutForm.custAddress.value =
        saved.address || "";
    }

    if (
      checkoutForm.custLandmark
    ) {
      checkoutForm.custLandmark.value =
        saved.landmark || "";
    }

    if (
      checkoutForm.custCity
    ) {
      checkoutForm.custCity.value =
        saved.city || "";
    }

    if (
      checkoutForm.custState
    ) {
      checkoutForm.custState.value =
        saved.state || "";
    }

    if (
      checkoutForm.custPin
    ) {
      checkoutForm.custPin.value =
        saved.pin || "";
    }

    if (
      checkoutForm.custCountry
    ) {
      checkoutForm.custCountry.value =
        saved.country ||
        "India";
    }

    if (
      saveInfoCheckbox
    ) {
      saveInfoCheckbox.checked =
        true;
    }
  }

  // =================================================
  // PRODUCT BUTTONS - ADD TO CART
  // =================================================

  async function wireAddButton(
    btn
  ) {
    if (
      !btn ||
      btn.dataset.wired ===
        "1"
    ) {
      return;
    }

    btn.dataset.wired =
      "1";

    btn.addEventListener(
      "click",
      async () => {

        const user =
          await getUser();

        if (
          !user
        ) {

          alert(
            "Please login before adding products to cart."
          );

          window.location.href =
            "login.html";

          return;
        }

        const productId =
          btn.dataset.id;

        const productName =
          btn.dataset.name ||
          "This product";

        const stock =
          await getProductStock(
            productId,
            btn
          );

        if (
          Number.isFinite(
            stock
          )
        ) {

          if (
            stock <= 0
          ) {

            alert(
              `${productName} is out of stock.`
            );

            return;
          }

          const existing =
            cart.find(
              (item) =>
                item.id ===
                productId
            );

          const currentQty =
            existing
              ? Number(
                  existing.qty
                ) || 0
              : 0;

          if (
            currentQty >=
            stock
          ) {

            alert(
              `Only ${stock} piece${
                stock === 1
                  ? ""
                  : "s"
              } available for ${productName}.`
            );

            return;
          }
        }

        addToCart({
          id:
            productId,

          name:
            productName,

          price:
            btn.dataset.price,

          image:
            btn.dataset.image
        });
      }
    );
  }

  // =================================================
  // BUY NOW BUTTON
  // =================================================

  async function wireBuyButton(
    btn
  ) {
    if (
      !btn ||
      btn.dataset.wired ===
        "1"
    ) {
      return;
    }

    btn.dataset.wired =
      "1";

    btn.addEventListener(
      "click",
      async () => {

        const user =
          await getUser();

        if (
          !user
        ) {

          alert(
            "Please login before buying."
          );

          window.location.href =
            "login.html";

          return;
        }

        const productId =
          btn.dataset.id;

        const productName =
          btn.dataset.name ||
          "This product";

        const stock =
          await getProductStock(
            productId,
            btn
          );

        if (
          Number.isFinite(
            stock
          ) &&
          stock <= 0
        ) {

          alert(
            `${productName} is out of stock.`
          );

          return;
        }

        const item = {

          id:
            productId,

          name:
            productName,

          price:
            Number(
              btn.dataset.price
            ) || 0,

          image:
            btn.dataset.image ||
            "",

          qty:
            1
        };

        if (
          !checkoutForm
        ) {

          localStorage.setItem(
            BUY_NOW_KEY,
            JSON.stringify(
              item
            )
          );

          window.location.href =
            "index.html";

          return;
        }

        await openCheckout(
          [item],
          "buynow"
        );
      }
    );
  }

  // =================================================
  // PRODUCT CARD
  // =================================================

  function wireProductCard(
    card
  ) {
    applyDiscountBadge(
      card
    );

    applyLowStockBadge(
      card
    );

    void wireAddButton(
      card.querySelector(
        ".add-cart-btn"
      )
    );

    void wireBuyButton(
      card.querySelector(
        ".buy-now-btn"
      )
    );
  }

  // =================================================
  // FIRESTORE PRODUCT CARD
  // =================================================

  function createHomepageFirestoreProductCard(
    product
  ) {

    const card =
      document.createElement(
        "article"
      );

    const productId =
      String(
        product.productId ||
        product.firebaseId ||
        ""
      );

    const stock =
      Number.isFinite(
        Number(product.stock)
      )
        ? Number(product.stock)
        : 0;

    const discount =
      Number.isFinite(
        Number(product.discount)
      )
        ? Number(product.discount)
        : 0;

    const price =
      Number(product.price || 0);

    const category =
      String(
        product.category ||
        ""
      );

    card.className =
      "product-card";

    card.dataset.category =
      category;

    card.dataset.discount =
      String(discount);

    card.dataset.stock =
      String(stock);

    card.innerHTML = `
      <div class="product-image">
        <img
          src="${esc(product.image || "")}" 
          alt="${esc(product.name || "Product")}" 
          loading="lazy"
        >
      </div>

      <div class="product-info">
        <p class="product-category">
          ${esc(
            CATEGORY_LABELS[category] ||
            category ||
            "Jewellery"
          )}
        </p>

        <h3>
          ${esc(
            product.name ||
            "Unnamed Product"
          )}
        </h3>

        <p class="product-description">
          ${esc(
            product.description ||
            ""
          )}
        </p>

        <div class="product-bottom">
          <span
            class="product-price"
            data-price="${esc(price)}"
          >
            ${formatRupees(price)}
          </span>

          <div class="product-actions">
            <button
              class="add-cart-btn"
              data-id="${esc(productId)}"
              data-name="${esc(product.name || "Product")}" 
              data-price="${esc(price)}"
              data-image="${esc(product.image || "")}" 
            >
              Add to Cart
            </button>

            <button
              class="product-button buy-now-btn"
              data-id="${esc(productId)}"
              data-name="${esc(product.name || "Product")}" 
              data-price="${esc(price)}"
              data-image="${esc(product.image || "")}" 
            >
              Buy Now
            </button>
          </div>
        </div>
      </div>
    `;

    return card;
  }

  // =================================================
  // HOMEPAGE FIRESTORE CATALOG
  // =================================================

  async function loadHomepageCatalog() {

    if (isCategoryPage) {
      return;
    }

    const grid =
      document.getElementById(
        "productsGrid"
      );

    const noResults =
      document.getElementById(
        "noResults"
      );

    if (!grid) {
      return;
    }

    grid.hidden = false;

    try {

      const snapshot =
        await getDocs(
          collection(
            firestore,
            "products"
          )
        );

      const products =
        snapshot.docs
          .map(
            (item) => ({
              firebaseId:
                item.id,
              ...item.data()
            })
          )
          .filter(
            (product) =>
              product.listed !== false
          );

      if (products.length > 0) {

        grid.innerHTML = "";

        products.forEach(
          (product) => {

            const card =
              createHomepageFirestoreProductCard(
                product
              );

            grid.appendChild(card);

            wireProductCard(card);

          }
        );

        if (noResults) {
          noResults.hidden = true;
        }

        await refreshStockBadges();
        return;
      }

      // Firestore empty: keep the existing static cards.
      const staticCards =
        Array.from(
          grid.querySelectorAll(
            ".product-card"
          )
        );

      staticCards.forEach(
        (card) => {
          wireProductCard(card);
        }
      );

      if (noResults) {
        noResults.hidden =
          staticCards.length !== 0;
      }

      await refreshStockBadges();

    }
    catch (error) {

      console.error(
        "Homepage Firestore catalog error:",
        error
      );

      // Keep the static catalog visible if Firestore cannot be read.
      const staticCards =
        Array.from(
          grid.querySelectorAll(
            ".product-card"
          )
        );

      staticCards.forEach(
        (card) => {
          wireProductCard(card);
        }
      );

      if (noResults) {
        noResults.hidden =
          staticCards.length !== 0;
      }

      await refreshStockBadges();
    }
  }

  // =================================================
  // MOBILE NAV
  // =================================================

  const menuToggle =
    document.getElementById(
      "menuToggle"
    );

  const primaryNav =
    document.getElementById(
      "primaryNav"
    );

  if (
    menuToggle &&
    primaryNav
  ) {

    menuToggle.addEventListener(
      "click",
      () => {

        const isOpen =
          primaryNav.classList.toggle(
            "open"
          );

        menuToggle.setAttribute(
          "aria-expanded",
          String(
            isOpen
          )
        );
      }
    );

    primaryNav
      .querySelectorAll(
        "a"
      )
      .forEach(
        (link) => {

          link.addEventListener(
            "click",
            () => {

              primaryNav.classList.remove(
                "open"
              );

              menuToggle.setAttribute(
                "aria-expanded",
                "false"
              );
            }
          );
        }
      );
  }

  // =================================================
  // CATEGORY TILES
  // Works with button OR anchor
  // =================================================

  document
    .querySelectorAll(
      ".category-tile"
    )
    .forEach(
      (tile) => {

        tile.addEventListener(
          "click",
          (event) => {

            const category =
              tile.dataset.category;

            if (
              !category
            ) {
              return;
            }

            // If anchor has href,
            // allow normal browser navigation.
            if (
              tile.tagName.toLowerCase() ===
              "a"
            ) {
              return;
            }

            event.preventDefault();

            window.location.href =
              "category.html?cat=" +
              encodeURIComponent(
                category
              );
          }
        );
      }
    );

  // =================================================
  // CART EVENTS
  // =================================================

  cartItemsEl?.addEventListener(
    "click",
    (event) => {

      const target =
        event.target.closest(
          "button[data-action]"
        );

      if (
        !target
      ) {
        return;
      }

      const {
        action,
        id
      } =
        target.dataset;

      if (
        action ===
        "increase"
      ) {

        void changeQty(
          id,
          1
        );

      }

      if (
        action ===
        "decrease"
      ) {

        void changeQty(
          id,
          -1
        );

      }

      if (
        action ===
        "remove"
      ) {

        removeItem(
          id
        );
      }
    }
  );

  // =================================================
  // CART SYNC
  // =================================================

  window.addEventListener(
    "storage",
    (event) => {

      if (
        event.key ===
        CART_KEY
      ) {

        cart =
          loadCart();

        renderCart();
      }
    }
  );

  window.addEventListener(
    "pageshow",
    (event) => {

      if (
        event.persisted
      ) {

        cart =
          loadCart();

        renderCart();

        void refreshStockBadges();
      }
    }
  );

  // =================================================
  // CART BUTTONS
  // =================================================

  openCartBtn?.addEventListener(
    "click",
    openCart
  );

  closeCartBtn?.addEventListener(
    "click",
    closeCart
  );

  continueShoppingBtn?.addEventListener(
    "click",
    closeCart
  );

  cartOverlay?.addEventListener(
    "click",
    closeCart
  );

  // =================================================
  // CHECKOUT STEPS
  // =================================================

  const STEP_TITLES = {

    1:
      "Address",

    2:
      "Confirm Details",

    3:
      "Payment"

  };

  function goToStep(
    stepNumber
  ) {

    currentStep =
      stepNumber;

    if (
      checkoutForm
    ) {

      checkoutForm.hidden =
        stepNumber !== 1;
    }

    if (
      checkoutConfirmStep
    ) {

      checkoutConfirmStep.hidden =
        stepNumber !== 2;
    }

    if (
      checkoutPaymentStep
    ) {

      checkoutPaymentStep.hidden =
        stepNumber !== 3;
    }

    if (
      checkoutBack
    ) {

      checkoutBack.hidden =
        stepNumber === 1;
    }

    if (
      checkoutTitle
    ) {

      checkoutTitle.textContent =
        STEP_TITLES[
          stepNumber
        ] || "";
    }

    stepItems.forEach(
      (item) => {

        const number =
          Number(
            item.dataset.step
          );

        item.classList.remove(
          "active",
          "done"
        );

        if (
          number <
          stepNumber
        ) {

          item.classList.add(
            "done"
          );

        }

        else if (
          number ===
          stepNumber
        ) {

          item.classList.add(
            "active"
          );
        }
      }
    );

    checkoutModal?.scrollTo?.({
      top:
        0
    });
  }

  // =================================================
  // OPEN CHECKOUT
  // =================================================

  async function openCheckout(
    items,
    source =
      "cart"
  ) {

    if (
      !items ||
      items.length === 0 ||
      !checkoutForm
    ) {

      return;
    }

    const user =
      await getUser();

    if (
      !user
    ) {

      alert(
        "Please login before checkout."
      );

      window.location.href =
        "login.html";

      return;
    }

    const normalizedItems =
      items.map(
        (item) => ({

          id:
            String(
              item.id ||
              ""
            ),

          name:
            String(
              item.name ||
              ""
            ),

          price:
            Number(
              item.price
            ) || 0,

          image:
            item.image ||
            "",

          qty:
            Number(
              item.qty
            ) || 1
        })
      );

    const stockValidation =
      await validateCheckoutStock(
        normalizedItems
      );

    if (
      !stockValidation.ok
    ) {

      alert(
        stockValidation.message
      );

      return;
    }

    checkoutSource =
      source;

    checkoutItems =
      normalizedItems;

    await prefillForm();

    goToStep(
      1
    );

    closeCart();

    checkoutOverlay?.classList.add(
      "active"
    );

    checkoutModal?.classList.add(
      "open"
    );

    checkoutModal?.setAttribute(
      "aria-hidden",
      "false"
    );
  }

  // =================================================
  // CLOSE CHECKOUT
  // =================================================

  function closeCheckout() {

    checkoutOverlay?.classList.remove(
      "active"
    );

    checkoutModal?.classList.remove(
      "open"
    );

    checkoutModal?.setAttribute(
      "aria-hidden",
      "true"
    );
  }

  // =================================================
  // ESC KEY
  // =================================================

  document.addEventListener(
    "keydown",
    (event) => {

      if (
        event.key ===
        "Escape"
      ) {

        closeCart();
        closeCheckout();
      }
    }
  );

  // =================================================
  // ORDER SUMMARY
  // =================================================

  function renderSummaryInto(
    container,
    totalEl
  ) {

    if (
      !container
    ) {

      return 0;
    }

    container.innerHTML =
      "";

    let total =
      0;

    checkoutItems.forEach(
      (item) => {

        const lineTotal =
          Number(
            item.price
          ) *
          Number(
            item.qty
          );

        total +=
          lineTotal;

        const row =
          document.createElement(
            "div"
          );

        row.className =
          "order-summary-row";

        row.innerHTML = `

          <span>
            ${esc(
              item.name
            )}
            x${item.qty}
          </span>

          <span>
            ${formatRupees(
              lineTotal
            )}
          </span>

        `;

        container.appendChild(
          row
        );
      }
    );

    if (
      totalEl
    ) {

      totalEl.textContent =
        formatRupees(
          total
        );
    }

    return total;
  }

  function renderOrderSummary() {

    return renderSummaryInto(
      orderSummaryEl,
      orderTotalEl
    );
  }

  // =================================================
  // STEP 1 -> STEP 2
  // =================================================

  checkoutForm?.addEventListener(
    "submit",
    (event) => {

      event.preventDefault();

      if (
        !checkoutForm.checkValidity()
      ) {

        checkoutForm.reportValidity();

        return;
      }

      const info = {

        name:
          checkoutForm.custName.value.trim(),

        mobile:
          checkoutForm.custMobile.value.trim(),

        address:
          checkoutForm.custAddress.value.trim(),

        landmark:
          checkoutForm.custLandmark.value.trim(),

        city:
          checkoutForm.custCity.value.trim(),

        state:
          checkoutForm.custState.value.trim(),

        pin:
          checkoutForm.custPin.value.trim(),

        country:
          checkoutForm.custCountry.value.trim()
      };

      if (
        saveInfoCheckbox?.checked
      ) {

        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify(
            info
          )
        );

      }

      else {

        localStorage.removeItem(
          STORAGE_KEY
        );
      }

      checkoutForm.dataset.pendingInfo =
        JSON.stringify(
          info
        );

      if (
        confirmNameEl
      ) {

        confirmNameEl.textContent =
          info.name;
      }

      if (
        confirmAddressLineEl
      ) {

        confirmAddressLineEl.textContent =
          info.address +
          (
            info.landmark
              ? ` (${info.landmark})`
              : ""
          ) +
          ", " +
          info.city +
          ", " +
          info.state +
          " - " +
          info.pin +
          ", " +
          info.country;
      }

      if (
        confirmPhoneLineEl
      ) {

        confirmPhoneLineEl.textContent =
          info.mobile;
      }

      renderSummaryInto(
        confirmOrderSummaryEl,
        confirmOrderTotalEl
      );

      goToStep(
        2
      );
    }
  );

  // =================================================
  // CHANGE ADDRESS
  // =================================================

  changeAddressBtn?.addEventListener(
    "click",
    () => {

      goToStep(
        1
      );
    }
  );

  // =================================================
  // STEP 2 -> STEP 3
  // =================================================

  confirmContinueBtn?.addEventListener(
    "click",
    () => {

      renderOrderSummary();

      goToStep(
        3
      );
    }
  );

  // =================================================
  // BACK
  // =================================================

  checkoutBack?.addEventListener(
    "click",
    () => {

      if (
        currentStep ===
        3
      ) {

        goToStep(
          2
        );

      }

      else if (
        currentStep ===
        2
      ) {

        goToStep(
          1
        );
      }
    }
  );

  // =================================================
  // CLOSE
  // =================================================

  checkoutClose?.addEventListener(
    "click",
    closeCheckout
  );

  checkoutOverlay?.addEventListener(
    "click",
    (event) => {

      if (
        event.target ===
        checkoutOverlay
      ) {

        closeCheckout();
      }
    }
  );

  // =================================================
  // PAY NOW -> PHONEPE
  // =================================================

  placeOrderBtn?.addEventListener(
    "click",
    async () => {

      const user =
        await getUser();

      if (
        !user
      ) {

        alert(
          "Please login before payment."
        );

        window.location.href =
          "login.html";

        return;
      }

      if (
        !checkoutItems.length
      ) {

        alert(
          "Your cart is empty."
        );

        return;
      }

      let info =
        {};

      try {

        info =
          JSON.parse(
            checkoutForm?.dataset.pendingInfo ||
            "{}"
          );

      }

      catch (
        error
      ) {

        console.error(
          "Customer info parse error:",
          error
        );

        alert(
          "Customer details could not be read."
        );

        return;
      }

      // -----------------------------------------------
      // ADDRESS
      // -----------------------------------------------

      if (
        !info.name ||
        !info.mobile ||
        !info.address ||
        !info.city ||
        !info.state ||
        !info.pin
      ) {

        alert(
          "Please complete your delivery address first."
        );

        goToStep(
          1
        );

        return;
      }

      // -----------------------------------------------
      // STOCK
      // -----------------------------------------------

      const stockValidation =
        await validateCheckoutStock(
          checkoutItems
        );

      if (
        !stockValidation.ok
      ) {

        alert(
          stockValidation.message
        );

        await refreshStockBadges();

        return;
      }

      // -----------------------------------------------
      // TOTAL
      // -----------------------------------------------

      const total =
        checkoutItems.reduce(
          (
            sum,
            item
          ) =>
            sum +
            Number(
              item.price
            ) *
            Number(
              item.qty
            ),
          0
        );

      if (
        !Number.isFinite(
          total
        ) ||
        total <= 0
      ) {

        alert(
          "Invalid order amount."
        );

        return;
      }

      placeOrderBtn.disabled =
        true;

      placeOrderBtn.textContent =
        "Opening PhonePe...";

      // -----------------------------------------------
      // UNIQUE ORDER NUMBER
      // -----------------------------------------------

      const now =
        new Date();

      const datePart =
        now
          .toISOString()
          .slice(
            0,
            10
          )
          .replace(
            /-/g,
            ""
          );

      const randomPart =
        Math.floor(
          1000 +
          Math.random() * 9000
        );

      const orderNumber =
        `AYZ${datePart}${randomPart}`;

      try {

        // =================================================
        // SAVE CUSTOMER PROFILE
        // =================================================

        if (
          saveInfoCheckbox?.checked
        ) {

          try {

            await setDoc(
              doc(
                firestore,
                "users",
                user.uid
              ),
              {
                uid:
                  user.uid,

                fullName:
                  info.name ||
                  "",

                email:
                  user.email ||
                  "",

                phone:
                  info.mobile ||
                  "",

                address:
                  info.address ||
                  "",

                landmark:
                  info.landmark ||
                  "",

                city:
                  info.city ||
                  "",

                state:
                  info.state ||
                  "",

                pincode:
                  info.pin ||
                  "",

                country:
                  info.country ||
                  "India",

                updatedAt:
                  serverTimestamp()
              },
              {
                merge:
                  true
              }
            );

          }

          catch (
            profileError
          ) {

            console.error(
              "Profile update error:",
              profileError
            );
          }
        }

        // =================================================
        // ORDER ITEMS
        // =================================================

        const orderItems =
          checkoutItems.map(
            (item) => ({
              productId:
                item.id ||
                "",

              productName:
                item.name ||
                "",

              price:
                Number(
                  item.price
                ) || 0,

              quantity:
                Number(
                  item.qty
                ) || 1,

              image:
                item.image ||
                "",

              lineTotal:
                (
                  Number(
                    item.price
                  ) || 0
                ) *
                (
                  Number(
                    item.qty
                  ) || 1
                )
            })
          );

        // =================================================
        // CREATE ORDER
        // =================================================

        const orderData = {
          orderId:
            orderNumber,

          userId:
            user.uid,

          customerName:
            info.name ||
            "",

          email:
            user.email ||
            "",

          phone:
            info.mobile ||
            "",

          address:
            info.address ||
            "",

          landmark:
            info.landmark ||
            "",

          city:
            info.city ||
            "",

          state:
            info.state ||
            "",

          pincode:
            info.pin ||
            "",

          country:
            info.country ||
            "India",

          items:
            orderItems,

          subtotal:
            total,

          total:
            total,

          gstIncluded:
            true,

          paymentMethod:
            "PHONEPE",

          paymentProvider:
            "PHONEPE",

          paymentStatus:
            "INITIATED",

          orderStatus:
            "NEW",

          courier:
            "",

          trackingNumber:
            "",

          createdAt:
            serverTimestamp(),

          updatedAt:
            serverTimestamp()
        };

        await setDoc(
          doc(
            firestore,
            "orders",
            orderNumber
          ),
          orderData
        );

        // =================================================
        // CREATE PHONEPE PAYMENT
        // =================================================

        const paymentResponse =
          await fetch(
            `${PHONEPE_WORKER_URL}/create-payment`,
            {
              method:
                "POST",

              headers: {
                "Content-Type":
                  "application/json"
              },

              body:
                JSON.stringify({
                  merchantOrderId:
                    orderNumber,

                  amount:
                    total,

                  redirectUrl:
                    `${PAYMENT_RESULT_URL}?orderId=${encodeURIComponent(
                      orderNumber
                    )}`
                })
            }
          );

        let paymentData =
          {};

        try {

          paymentData =
            await paymentResponse.json();

        }

        catch (
          parseError
        ) {

          console.error(
            "PhonePe JSON parse error:",
            parseError
          );
        }

        console.log(
          "PhonePe create-payment response:",
          paymentData
        );

        if (
          !paymentResponse.ok
        ) {

          throw new Error(
            paymentData?.error ||
            paymentData?.message ||
            "PhonePe payment could not be created."
          );
        }

        if (
          !paymentData?.success ||
          !paymentData?.redirectUrl
        ) {

          throw new Error(
            "PhonePe checkout URL was not received."
          );
        }

        // =================================================
        // SAVE PHONEPE METADATA
        // =================================================

        try {

          await setDoc(
            doc(
              firestore,
              "orders",
              orderNumber
            ),
            {
              phonePeOrderId:
                paymentData.phonePeOrderId ||
                "",

              paymentStatus:
                "INITIATED",

              paymentProvider:
                "PHONEPE",

              updatedAt:
                serverTimestamp()
            },
            {
              merge:
                true
            }
          );

        }

        catch (
          updateError
        ) {

          console.error(
            "Could not update PhonePe order metadata:",
            updateError
          );
        }

        // =================================================
        // LOCAL PAYMENT INFO
        // =================================================

        localStorage.setItem(
          "ayonizaPendingPaymentOrderId",
          orderNumber
        );

        localStorage.setItem(
          "ayonizaPendingPaymentSource",
          checkoutSource
        );

        // =================================================
        // REDIRECT TO PHONEPE
        // =================================================

        window.location.href =
          paymentData.redirectUrl;

      }

      catch (
        error
      ) {

        console.error(
          "Payment initialization error:",
          error
        );

        try {

          await setDoc(
            doc(
              firestore,
              "orders",
              orderNumber
            ),
            {
              paymentStatus:
                "INITIATION_FAILED",

              paymentError:
                error?.message ||
                "Unknown payment error",

              updatedAt:
                serverTimestamp()
            },
            {
              merge:
                true
            }
          );

        }

        catch (
          updateError
        ) {

          console.error(
            "Could not mark payment failure:",
            updateError
          );
        }

        alert(
          "Payment could not be started.\n\n" +
          (
            error?.message ||
            "Please try again."
          )
        );

      }

      finally {

        placeOrderBtn.disabled =
          false;

        placeOrderBtn.textContent =
          "Pay Now";
      }
    }
  );

  // =================================================
  // CART -> CHECKOUT
  // =================================================

  checkoutBtn?.addEventListener(
    "click",
    async () => {

      if (
        cart.length ===
        0
      ) {

        return;
      }

      const user =
        await getUser();

      if (
        !user
      ) {

        alert(
          "Please login before checkout."
        );

        window.location.href =
          "login.html";

        return;
      }

      await openCheckout(
        cart.map(
          (item) => ({
            ...item
          })
        ),
        "cart"
      );
    }
  );

  // =================================================
  // PRODUCT BUTTONS
  // =================================================

  document
    .querySelectorAll(
      ".product-card"
    )
    .forEach(
      wireProductCard
    );

  document
    .querySelectorAll(
      ".add-cart-btn"
    )
    .forEach(
      (button) =>
        void wireAddButton(
          button
        )
    );

  document
    .querySelectorAll(
      ".buy-now-btn"
    )
    .forEach(
      (button) =>
        void wireBuyButton(
          button
        )
    );

  // =================================================
  // CATEGORY PAGE
  // =================================================

  if (
    isCategoryPage
  ) {

    const grid =
      document.getElementById(
        "productsGrid"
      );

    const noResults =
      document.getElementById(
        "noResults"
      );

    const titleEl =
      document.getElementById(
        "selectedCategoryTitle"
      );

    const params =
      new URLSearchParams(
        window.location.search
      );

    const cat =
      params.get("cat") ||
      "all";

    let allCards =
      [];

    let currentSearch =
      (
        params.get("q") ||
        ""
      ).toLowerCase();

    if (
      titleEl
    ) {

      titleEl.textContent =
        CATEGORY_LABELS[
          cat
        ] || cat;
    }

    function createFirestoreProductCard(product) {

      const card =
        document.createElement(
          "article"
        );

      const productId =
        String(
          product.productId ||
          product.firebaseId ||
          ""
        );

      const stock =
        Number.isFinite(
          Number(product.stock)
        )
          ? Number(product.stock)
          : 0;

      const discount =
        Number.isFinite(
          Number(product.discount)
        )
          ? Number(product.discount)
          : 0;

      const price =
        Number(product.price || 0);

      const category =
        String(
          product.category ||
          ""
        );

      card.className =
        "product-card";

      card.dataset.category =
        category;

      card.dataset.discount =
        String(discount);

      card.dataset.stock =
        String(stock);

      card.innerHTML = `
        <div class="product-image">
          <img
            src="${esc(product.image || "")}" 
            alt="${esc(product.name || "Product")}" 
            loading="lazy"
          >
        </div>

        <div class="product-info">
          <p class="product-category">
            ${esc(
              CATEGORY_LABELS[category] ||
              category ||
              "Jewellery"
            )}
          </p>

          <h3>
            ${esc(
              product.name ||
              "Unnamed Product"
            )}
          </h3>

          <p class="product-description">
            ${esc(
              product.description ||
              ""
            )}
          </p>

          <div class="product-bottom">
            <span
              class="product-price"
              data-price="${esc(price)}"
            >
              ${formatRupees(price)}
            </span>

            <div class="product-actions">
              <button
                class="add-cart-btn"
                data-id="${esc(productId)}"
                data-name="${esc(product.name || "Product")}" 
                data-price="${esc(price)}"
                data-image="${esc(product.image || "")}" 
              >
                Add to Cart
              </button>

              <button
                class="product-button buy-now-btn"
                data-id="${esc(productId)}"
                data-name="${esc(product.name || "Product")}" 
                data-price="${esc(price)}"
                data-image="${esc(product.image || "")}" 
              >
                Buy Now
              </button>
            </div>
          </div>
        </div>
      `;

      return card;
    }

    function getCardSearchText(card) {
      const name =
        (
          card.querySelector(
            "h3"
          )?.textContent ||
          ""
        ).toLowerCase();

      const desc =
        (
          card.querySelector(
            ".product-description"
          )?.textContent ||
          ""
        ).toLowerCase();

      return `${name} ${desc}`;
    }

    function cleanClone(clone) {

      clone.removeAttribute(
        "data-badge-done"
      );

      clone.removeAttribute(
        "data-stock-badge-done"
      );

      clone
        .querySelectorAll(
          "[data-wired]"
        )
        .forEach(
          (element) =>
            element.removeAttribute(
              "data-wired"
            )
        );

      clone
        .querySelectorAll(
          ".discount-badge, .low-stock-badge"
        )
        .forEach(
          (badge) =>
            badge.remove()
        );

      clone.classList.remove(
        "out-of-stock"
      );

      return clone;
    }

    function renderList() {

      if (
        !grid
      ) {

        return;
      }

      grid.innerHTML =
        "";

      let shown =
        0;

      allCards.forEach(
        (original) => {

          const categoryMatch =
            cat === "all" ||
            original.dataset.category ===
              cat;

          const searchText =
            getCardSearchText(
              original
            );

          const searchMatch =
            !currentSearch ||
            searchText.includes(
              currentSearch
            );

          if (
            !categoryMatch ||
            !searchMatch
          ) {

            return;
          }

          const clone =
            cleanClone(
              original.cloneNode(
                true
              )
            );

          grid.appendChild(
            clone
          );

          wireProductCard(
            clone
          );

          shown +=
            1;
        }
      );

      if (
        noResults
      ) {

        noResults.hidden =
          shown !== 0;
      }

      void refreshStockBadges();
    }

    async function loadCategoryCatalog() {

      if (
        !grid
      ) {

        return;
      }

      grid.innerHTML = `
        <p class="no-results">
          Loading products...
        </p>
      `;

      try {
        const snapshot =
          await getDocs(
            collection(
              firestore,
              "products"
            )
          );

        const firestoreProducts =
          snapshot.docs.map(
            (item) => ({
              firebaseId:
                item.id,
              ...item.data()
            })
          );

        if (
          firestoreProducts.length > 0
        ) {
          allCards =
            firestoreProducts
              .filter(
                (product) =>
                  product.listed !== false
              )
              .map(
                createFirestoreProductCard
              );

          renderList();
          return;
        }

        // First-time fallback: load the static cards from index.html.
        const response =
          await fetch(
            "index.html",
            {
              cache:
                "no-store"
            }
          );

        if (
          !response.ok
        ) {

          throw new Error(
            "Could not load index.html"
          );
        }

        const html =
          await response.text();

        const parsedDoc =
          new DOMParser()
            .parseFromString(
              html,
              "text/html"
            );

        allCards =
          Array.from(
            parsedDoc.querySelectorAll(
              ".product-card"
            )
          );

        renderList();
      }
      catch (
        firestoreError
      ) {

        console.error(
          "Firestore catalog load error:",
          firestoreError
        );

        // Fallback to static index.html so the shop does not go blank.
        try {
          const response =
            await fetch(
              "index.html",
              {
                cache:
                  "no-store"
              }
            );

          if (!response.ok) {
            throw new Error(
              "Could not load index.html"
            );
          }

          const html =
            await response.text();

          const parsedDoc =
            new DOMParser()
              .parseFromString(
                html,
                "text/html"
              );

          allCards =
            Array.from(
              parsedDoc.querySelectorAll(
                ".product-card"
              )
            );

          renderList();
        }
        catch (fallbackError) {

          console.error(
            "Static catalog fallback error:",
            fallbackError
          );

          grid.innerHTML =
            '<p class="no-results">Products load nahi ho paaye. Page refresh karke dekhein.</p>';
        }
      }
    }

    loadCategoryCatalog();

    const searchInputCP =
      document.getElementById(
        "searchInput"
      );

    if (
      searchInputCP
    ) {

      searchInputCP.value =
        params.get("q") ||
        "";

      searchInputCP.addEventListener(
        "input",
        () => {

          currentSearch =
            searchInputCP
              .value
              .trim()
              .toLowerCase();

          renderList();
        }
      );
    }
  }

  // =================================================
  // SEARCH
  // =================================================

  const openSearchBtn =
    document.getElementById(
      "openSearchBtn"
    );

  const searchBar =
    document.getElementById(
      "searchBar"
    );

  const searchInput =
    document.getElementById(
      "searchInput"
    );

  openSearchBtn?.addEventListener(
    "click",
    () => {

      searchBar?.classList.toggle(
        "open"
      );

      if (
        searchBar?.classList.contains(
          "open"
        )
      ) {

        searchInput?.focus();
      }
    }
  );

  if (
    !isCategoryPage
  ) {

    searchInput?.addEventListener(
      "keydown",
      (event) => {

        if (
          event.key ===
            "Enter" &&
          searchInput.value.trim()
        ) {

          window.location.href =
            "category.html?cat=all&q=" +
            encodeURIComponent(
              searchInput.value.trim()
            );
        }
      }
    );
  }

  document.addEventListener(
    "keydown",
    (event) => {

      if (
        event.key ===
          "Escape" &&
        searchBar?.classList.contains(
          "open"
        )
      ) {

        searchBar.classList.remove(
          "open"
        );
      }
    }
  );

  // =================================================
  // HERO SLIDER
  // =================================================

  const heroSlider =
    document.getElementById(
      "heroBannerSlider"
    );

  if (
    heroSlider
  ) {

    const heroSlides =
      heroSlider.querySelectorAll(
        ".hero-banner-slide"
      );

    if (
      heroSlides.length > 1
    ) {

      let heroCurrent =
        0;

      let heroTimer =
        null;

      const HERO_INTERVAL_MS =
        4000;

      const showHeroSlide =
        (number) => {

          heroSlides[
            heroCurrent
          ]?.classList.remove(
            "active"
          );

          heroCurrent =
            (
              number +
              heroSlides.length
            ) %
            heroSlides.length;

          heroSlides[
            heroCurrent
          ]?.classList.add(
            "active"
          );
        };

      const startHero =
        () => {

          if (
            heroTimer
          ) {
            return;
          }

          heroTimer =
            setInterval(
              () => {

                showHeroSlide(
                  heroCurrent +
                  1
                );

              },
              HERO_INTERVAL_MS
            );
        };

      const stopHero =
        () => {

          clearInterval(
            heroTimer
          );

          heroTimer =
            null;
        };

      startHero();

      document.addEventListener(
        "visibilitychange",
        () => {

          if (
            document.hidden
          ) {

            stopHero();

          } else {

            startHero();
          }
        }
      );
    }
  }

  // =================================================
  // REFRESH STOCK BADGES
  // =================================================

  async function refreshStockBadges() {

    const cards =
      document.querySelectorAll(
        ".product-card"
      );

    for (
      const card of cards
    ) {

      const button =
        card.querySelector(
          ".add-cart-btn, .buy-now-btn"
        );

      if (
        !button
      ) {

        continue;
      }

      const productId =
        button.dataset.id;

      if (
        !productId
      ) {

        continue;
      }

      const stock =
        await getProductStock(
          productId,
          button
        );

      if (
        !Number.isFinite(
          stock
        )
      ) {

        continue;
      }

      card.dataset.stock =
        String(
          stock
        );

      applyLowStockBadge(
        card
      );
    }
  }

  // =================================================
  // INITIAL CART
  // =================================================

  renderCart();

  // Load products from Firestore so Admin List/Unlist/Add
  // changes are reflected on the homepage automatically.
  void loadHomepageCatalog();

  // Load latest Firestore stock
  void refreshStockBadges();

  // =================================================
  // PENDING BUY NOW
  // =================================================

  let pendingBuyNow =
    null;

  try {

    pendingBuyNow =
      JSON.parse(
        localStorage.getItem(
          BUY_NOW_KEY
        ) ||
        "null"
      );

  }

  catch (
    error
  ) {

    console.error(
      "Buy Now restore error:",
      error
    );
  }

  localStorage.removeItem(
    BUY_NOW_KEY
  );

  // =================================================
  // OPEN PENDING BUY NOW
  // =================================================

  if (
    pendingBuyNow &&
    pendingBuyNow.id &&
    checkoutForm
  ) {

    void openCheckout(
      [pendingBuyNow],
      "buynow"
    );

  }

  // =================================================
  // OPEN CART FROM PRODUCT PAGE
  // =================================================

  else if (
    localStorage.getItem(
      OPEN_CART_FLAG
    ) === "1"
  ) {

    localStorage.removeItem(
      OPEN_CART_FLAG
    );

    if (
      cart.length > 0
    ) {

      openCart();
    }
  }
}

// =====================================================
// RUN APP
// =====================================================

if (
  document.readyState ===
  "loading"
) {

  document.addEventListener(
    "DOMContentLoaded",
    initApp
  );

} else {

  initApp();

}
