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
  addDoc,
  collection,
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
// AUTH STATE
// =====================================================

onAuthStateChanged(firebaseAuth, (user) => {
  loggedInUser = user;
});


// =====================================================
// MAIN
// =====================================================

document.addEventListener("DOMContentLoaded", () => {

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
  // FORMAT RUPEES
  // =================================================

  function formatRupees(amount) {
    return "₹" + Number(amount).toLocaleString("en-IN");
  }


  // =================================================
  // DISCOUNT BADGE
  // =================================================

  function applyDiscountBadge(card) {

    if (!card || card.dataset.badgeDone) {
      return;
    }

    card.dataset.badgeDone = "1";

    const discount =
      Number(card.dataset.discount || 0);

    if (!discount) {
      return;
    }

    const priceEl =
      card.querySelector(".product-price");

    const image =
      card.querySelector(".product-image");

    if (!priceEl || !image) {
      return;
    }

    const currentPrice =
      Number(
        priceEl.dataset.price ||
        priceEl.textContent.replace(/[^\d.]/g, "")
      );

    if (!currentPrice) {
      return;
    }

    const originalPrice =
      Math.round(
        currentPrice /
        (1 - discount / 100)
      );

    const badge =
      document.createElement("span");

    badge.className =
      "discount-badge";

    badge.textContent =
      `${discount}% OFF`;

    image.appendChild(badge);

    const group =
      document.createElement("span");

    group.className =
      "price-group";

    const originalSpan =
      document.createElement("span");

    originalSpan.className =
      "price-original";

    originalSpan.textContent =
      "₹" +
      originalPrice.toLocaleString("en-IN");

    priceEl.replaceWith(group);

    group.appendChild(originalSpan);
    group.appendChild(priceEl);
  }


  // =================================================
  // CART
  // =================================================

  const CART_KEY =
    "ayonizaCart";


  function loadCart() {

    try {

      const raw =
        localStorage.getItem(CART_KEY);

      const parsed =
        raw
          ? JSON.parse(raw)
          : [];

      if (!Array.isArray(parsed)) {
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
            id:
              String(item.id),

            name:
              String(item.name),

            price:
              Number(item.price),

            image:
              String(item.image || ""),

            qty:
              Math.floor(
                Number(item.qty)
              )
          })
        );

    } catch (error) {

      console.error(
        "Cart load error:",
        error
      );

      return [];
    }
  }


  function saveCart() {

    try {

      localStorage.setItem(
        CART_KEY,
        JSON.stringify(cart)
      );

    } catch (error) {

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

    if (!cartItemsEl) {
      return;
    }

    cartItemsEl
      .querySelectorAll(".cart-item")
      .forEach(
        (el) => el.remove()
      );


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


    if (cartCountEl) {

      cartCountEl.textContent =
        totalQty;

    }


    if (cartTotalEl) {

      cartTotalEl.textContent =
        formatRupees(
          totalPrice
        );

    }


    if (checkoutBtn) {

      checkoutBtn.disabled =
        cart.length === 0;

    }


    if (cart.length === 0) {

      if (cartEmptyEl) {

        cartEmptyEl.hidden =
          false;

      }

      return;
    }


    if (cartEmptyEl) {

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
            src="${item.image}"
            alt="${item.name}"
          >

          <div>

            <p class="cart-item-name">
              ${item.name}
            </p>

            <p class="cart-item-price">
              ${formatRupees(item.price)}
            </p>

            <div class="cart-item-qty">

              <button
                class="qty-btn"
                data-action="decrease"
                data-id="${item.id}"
                aria-label="Decrease quantity">
                −
              </button>

              <span>
                ${item.qty}
              </span>

              <button
                class="qty-btn"
                data-action="increase"
                data-id="${item.id}"
                aria-label="Increase quantity">
                +
              </button>

            </div>

          </div>

          <button
            class="remove-item"
            data-action="remove"
            data-id="${item.id}">
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

  function addToCart({
    id,
    name,
    price,
    image
  }) {

    const normalizedId =
      String(id || "");


    const existing =
      cart.find(
        (item) =>
          item.id ===
          normalizedId
      );


    if (existing) {

      existing.qty += 1;

    } else {

      cart.push({

        id:
          normalizedId,

        name:
          String(name || ""),

        price:
          Number(price) || 0,

        image:
          String(image || ""),

        qty:
          1

      });

    }


    renderCart();

    openCart();
  }


  // =================================================
  // CHANGE QUANTITY
  // =================================================

  function changeQty(
    id,
    delta
  ) {

    const item =
      cart.find(
        (i) =>
          i.id === id
      );


    if (!item) {
      return;
    }


    item.qty += delta;


    if (item.qty <= 0) {

      cart =
        cart.filter(
          (i) =>
            i.id !== id
        );

    }


    renderCart();
  }


  // =================================================
  // REMOVE ITEM
  // =================================================

  function removeItem(id) {

    cart =
      cart.filter(
        (i) =>
          i.id !== id
      );


    renderCart();
  }


  // =================================================
  // PRODUCT BUTTONS
  // =================================================

  function wireAddButton(btn) {

    if (!btn || btn.dataset.wired) {
      return;
    }

    btn.dataset.wired =
      "1";


    btn.addEventListener(
      "click",
      () => {

        const user =
          loggedInUser ||
          firebaseAuth.currentUser;


        if (!user) {

          alert(
            "Please login before adding products to cart."
          );


          window.location.href =
            "login.html";


          return;
        }


        addToCart({

          id:
            btn.dataset.id,

          name:
            btn.dataset.name,

          price:
            btn.dataset.price,

          image:
            btn.dataset.image

        });

      }
    );
  }


  function wireBuyButton(btn) {

    if (!btn || btn.dataset.wired) {
      return;
    }

    btn.dataset.wired =
      "1";


    btn.addEventListener(
      "click",
      () => {

        const user =
          loggedInUser ||
          firebaseAuth.currentUser;


        if (!user) {

          alert(
            "Please login before buying."
          );


          window.location.href =
            "login.html";


          return;
        }


        openCheckout([

          {

            id:
              btn.dataset.id,

            name:
              btn.dataset.name,

            price:
              Number(
                btn.dataset.price
              ) || 0,

            image:
              btn.dataset.image ||
              "",

            qty:
              1

          }

        ]);

      }
    );
  }


  function wireProductCard(card) {

    applyDiscountBadge(
      card
    );


    wireAddButton(
      card.querySelector(
        ".add-cart-btn"
      )
    );


    wireBuyButton(
      card.querySelector(
        ".buy-now-btn"
      )
    );

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
          String(isOpen)
        );

      }
    );


    primaryNav
      .querySelectorAll("a")
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
  // HOMEPAGE CATEGORY TILES
  // =================================================

  document
    .querySelectorAll(
      ".category-tile[data-category]"
    )
    .forEach(
      (tile) => {

        tile.addEventListener(
          "click",
          () => {

            window.location.href =
              "category.html?cat=" +
              encodeURIComponent(
                tile.dataset.category
              );

          }
        );

      }
    );


  // =================================================
  // CART BUTTON ACTIONS
  // =================================================

  cartItemsEl?.addEventListener(
    "click",
    (e) => {

      const target =
        e.target.closest(
          "button[data-action]"
        );


      if (!target) {
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

        changeQty(
          id,
          1
        );

      }


      if (
        action ===
        "decrease"
      ) {

        changeQty(
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
    (e) => {

      if (
        e.key === CART_KEY
      ) {

        cart =
          loadCart();


        renderCart();

      }

    }
  );


  // =================================================
  // CART EVENTS
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
  // CHECKOUT ELEMENTS
  // =================================================

  const STORAGE_KEY =
    "ayonizaCustomerInfo";


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


  let currentStep =
    1;


  // =================================================
  // SAVED INFO
  // =================================================

  function loadSavedInfo() {

    try {

      const raw =
        localStorage.getItem(
          STORAGE_KEY
        );


      return raw
        ? JSON.parse(raw)
        : null;

    } catch (error) {

      console.error(
        "Saved info load error:",
        error
      );

      return null;
    }
  }


  // =================================================
  // FIREBASE PROFILE → CHECKOUT
  // =================================================

  async function prefillForm() {

    if (!checkoutForm) {
      return;
    }


    let saved =
      loadSavedInfo();


    const user =
      loggedInUser ||
      firebaseAuth.currentUser;


    if (user) {

      try {

        const userRef =
          doc(
            firestore,
            "users",
            user.uid
          );


        const snapshot =
          await getDoc(
            userRef
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

      } catch (error) {

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
  // CHECKOUT STEP TITLES
  // =================================================

  const STEP_TITLES = {

    1:
      "Address",

    2:
      "Confirm Details",

    3:
      "Payment"

  };


  // =================================================
  // GO TO STEP
  // =================================================

  function goToStep(n) {

    currentStep =
      n;


    if (checkoutForm) {

      checkoutForm.hidden =
        n !== 1;

    }


    if (checkoutConfirmStep) {

      checkoutConfirmStep.hidden =
        n !== 2;

    }


    if (checkoutPaymentStep) {

      checkoutPaymentStep.hidden =
        n !== 3;

    }


    if (checkoutBack) {

      checkoutBack.hidden =
        n === 1;

    }


    if (checkoutTitle) {

      checkoutTitle.textContent =
        STEP_TITLES[n] || "";

    }


    stepItems.forEach(
      (item) => {

        const stepNum =
          Number(
            item.dataset.step
          );


        item.classList.remove(
          "active",
          "done"
        );


        if (
          stepNum < n
        ) {

          item.classList.add(
            "done"
          );

        }

        else if (
          stepNum === n
        ) {

          item.classList.add(
            "active"
          );

        }

      }
    );


    checkoutModal?.scrollTo?.({
      top: 0
    });

  }


  // =================================================
  // OPEN CHECKOUT
  // =================================================

  async function openCheckout(
    items
  ) {

    if (
      !items ||
      items.length === 0 ||
      !checkoutForm
    ) {

      return;
    }


    const user =
      loggedInUser ||
      firebaseAuth.currentUser;


    if (!user) {

      alert(
        "Please login before checkout."
      );


      window.location.href =
        "login.html";


      return;
    }


    checkoutItems =
      items.map(
        (item) => ({

          id:
            item.id,

          name:
            item.name,

          price:
            Number(
              item.price
            ) || 0,

          image:
            item.image || "",

          qty:
            Number(
              item.qty
            ) || 1

        })
      );


    await prefillForm();


    goToStep(1);


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
  // UPI
  // =================================================

  const UPI_ID =
    "9589790094-2@ybl";


  const upiCopyBtn =
    document.getElementById(
      "upiCopyBtn"
    );


  const upiPayLink =
    document.getElementById(
      "upiPayLink"
    );


  // =================================================
  // COPY UPI
  // =================================================

  upiCopyBtn?.addEventListener(
    "click",
    async () => {

      try {

        await navigator.clipboard.writeText(
          UPI_ID
        );

      } catch (error) {

        const temp =
          document.createElement(
            "textarea"
          );


        temp.value =
          UPI_ID;


        document.body.appendChild(
          temp
        );


        temp.select();


        document.execCommand(
          "copy"
        );


        document.body.removeChild(
          temp
        );

      }


      upiCopyBtn.textContent =
        "Copied!";


      upiCopyBtn.classList.add(
        "copied"
      );


      setTimeout(
        () => {

          upiCopyBtn.textContent =
            "Copy";


          upiCopyBtn.classList.remove(
            "copied"
          );

        },
        1800
      );

    }
  );


  // =================================================
  // RENDER ORDER SUMMARY
  // =================================================

  function renderSummaryInto(
    container,
    totalEl
  ) {

    if (!container) {
      return 0;
    }


    container.innerHTML =
      "";


    let total =
      0;


    checkoutItems.forEach(
      (item) => {

        const lineTotal =
          Number(item.price) *
          Number(item.qty);


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
            ${item.name} x${item.qty}
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


    if (totalEl) {

      totalEl.textContent =
        formatRupees(total);

    }


    return total;

  }


  // =================================================
  // PAYMENT SUMMARY
  // =================================================

  function renderOrderSummary() {

    const total =
      renderSummaryInto(
        orderSummaryEl,
        orderTotalEl
      );


    if (upiPayLink) {

      const upiParams =
        new URLSearchParams({

          pa:
            UPI_ID,

          pn:
            "AYONIZA",

          am:
            String(total),

          cu:
            "INR",

          tn:
            "AYONIZA order"

        });


      upiPayLink.href =
        `upi://pay?${upiParams.toString()}`;

    }


    return total;

  }


  // =================================================
  // STEP 1 → STEP 2
  // =================================================

  checkoutForm?.addEventListener(
    "submit",
    (e) => {

      e.preventDefault();


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

      } else {

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
              ? " (" +
                info.landmark +
                ")"
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


      goToStep(2);

    }
  );


  // =================================================
  // CHANGE ADDRESS
  // =================================================

  changeAddressBtn?.addEventListener(
    "click",
    () => {

      goToStep(1);

    }
  );


  // =================================================
  // STEP 2 → PAYMENT
  // =================================================

  confirmContinueBtn?.addEventListener(
    "click",
    () => {

      renderOrderSummary();

      goToStep(3);

    }
  );


  // =================================================
  // BACK BUTTON
  // =================================================

  checkoutBack?.addEventListener(
    "click",
    () => {

      if (
        currentStep === 3
      ) {

        goToStep(2);

      }

      else if (
        currentStep === 2
      ) {

        goToStep(1);

      }

    }
  );


  // =================================================
  // CLOSE CHECKOUT
  // =================================================

  checkoutClose?.addEventListener(
    "click",
    closeCheckout
  );


  checkoutOverlay?.addEventListener(
    "click",
    (e) => {

      if (
        e.target ===
        checkoutOverlay
      ) {

        closeCheckout();

      }

    }
  );


  // =================================================
  // PLACE ORDER → FIRESTORE
  // =================================================

  placeOrderBtn?.addEventListener(
    "click",
    async () => {

      const user =
        loggedInUser ||
        firebaseAuth.currentUser;


      // ---------------------------------------------
      // LOGIN CHECK
      // ---------------------------------------------

      if (!user) {

        alert(
          "Please login before placing your order."
        );


        window.location.href =
          "login.html";


        return;

      }


      // ---------------------------------------------
      // CART CHECK
      // ---------------------------------------------

      if (
        !checkoutItems.length
      ) {

        alert(
          "Your cart is empty."
        );


        return;

      }


      // ---------------------------------------------
      // CUSTOMER INFORMATION
      // ---------------------------------------------

      let info = {};


      try {

        info =
          JSON.parse(
            checkoutForm?.dataset.pendingInfo ||
            "{}"
          );

      } catch (error) {

        console.error(
          "Customer info parse error:",
          error
        );

      }


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


        goToStep(1);


        return;

      }


      // ---------------------------------------------
      // TOTAL
      // ---------------------------------------------

      const total =
        checkoutItems.reduce(
          (sum, item) =>
            sum +
            Number(item.price) *
            Number(item.qty),
          0
        );


      placeOrderBtn.disabled =
        true;


      placeOrderBtn.textContent =
        "Placing Order...";


      try {

        // =========================================
        // SAVE CUSTOMER PROFILE
        // =========================================

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
                  info.name || "",

                email:
                  user.email || "",

                phone:
                  info.mobile || "",

                address:
                  info.address || "",

                landmark:
                  info.landmark || "",

                city:
                  info.city || "",

                state:
                  info.state || "",

                pincode:
                  info.pin || "",

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


        // =========================================
        // ORDER NUMBER
        // =========================================

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
            Math.random() *
            9000
          );


        const orderNumber =
          `AYZ${datePart}${randomPart}`;


        // =========================================
        // ORDER ITEMS
        // =========================================

        const orderItems =
          checkoutItems.map(
            (item) => ({

              productId:
                item.id || "",

              productName:
                item.name || "",

              price:
                Number(item.price) || 0,

              quantity:
                Number(item.qty) || 1,

              image:
                item.image || "",

              lineTotal:
                (
                  Number(item.price) || 0
                ) *
                (
                  Number(item.qty) || 1
                )

            })
          );


        // =========================================
        // ORDER DATA
        // =========================================

        const orderData = {

          orderId:
            orderNumber,

          userId:
            user.uid,


          // CUSTOMER
          customerName:
            info.name || "",

          email:
            user.email || "",

          phone:
            info.mobile || "",


          // ADDRESS
          address:
            info.address || "",

          landmark:
            info.landmark || "",

          city:
            info.city || "",

          state:
            info.state || "",

          pincode:
            info.pin || "",

          country:
            info.country ||
            "India",


          // ITEMS
          items:
            orderItems,


          // PRICE
          subtotal:
            total,

          total:
            total,

          gstIncluded:
            true,


          // PAYMENT
          paymentMethod:
            "UPI",

          paymentStatus:
            "PENDING_VERIFICATION",


          // ORDER STATUS
          orderStatus:
            "NEW",


          // SHIPPING
          courier:
            "",

          trackingNumber:
            "",


          // TIME
          createdAt:
            serverTimestamp(),

          updatedAt:
            serverTimestamp()

        };


        // =========================================
        // CREATE FIRESTORE ORDER
        // =========================================

        await addDoc(

          collection(
            firestore,
            "orders"
          ),

          orderData

        );


        // =========================================
        // CLEAR CART
        // =========================================

        cart =
          [];


        localStorage.removeItem(
          CART_KEY
        );


        renderCart();


        localStorage.setItem(
          "ayonizaLastOrderId",
          orderNumber
        );


        // =========================================
        // SUCCESS
        // =========================================

        alert(

          `Order placed successfully!\n\n` +

          `Order ID: ${orderNumber}\n\n` +

          `Payment status: Pending verification`

        );


        closeCheckout();

      }

      catch (error) {

        console.error(
          "Order creation error:",
          error
        );


        alert(

          "We could not place your order right now. " +
          "Please try again.\n\n" +

          (
            error?.message ||
            "Unknown error"
          )

        );

      }


      finally {

        placeOrderBtn.disabled =
          false;


        placeOrderBtn.textContent =
          "Place Order";

      }

    }
  );


  // =================================================
  // CART → CHECKOUT
  // =================================================

  checkoutBtn?.addEventListener(
    "click",
    () => {

      if (
        cart.length === 0
      ) {

        return;

      }


      const user =
        loggedInUser ||
        firebaseAuth.currentUser;


      if (!user) {

        alert(
          "Please login before checkout."
        );


        window.location.href =
          "login.html";


        return;

      }


      openCheckout(
        cart.map(
          (item) => ({
            ...item
          })
        )
      );

    }
  );


  // =================================================
  // PRODUCT CARDS
  // =================================================

  document
    .querySelectorAll(
      ".product-card"
    )
    .forEach(
      wireProductCard
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


    if (titleEl) {

      titleEl.textContent =
        CATEGORY_LABELS[cat] ||
        cat;

    }


    function renderList() {

      if (!grid) {
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


          const name =
            (
              original.querySelector("h3")
                ?.textContent ||
              ""
            )
            .toLowerCase();


          const desc =
            (
              original.querySelector(
                ".product-description"
              )
                ?.textContent ||
              ""
            )
            .toLowerCase();


          const searchMatch =
            !currentSearch ||
            name.includes(
              currentSearch
            ) ||
            desc.includes(
              currentSearch
            );


          if (
            categoryMatch &&
            searchMatch
          ) {

            const clone =
              original.cloneNode(
                true
              );


            grid.appendChild(
              clone
            );


            wireProductCard(
              clone
            );


            shown++;

          }

        }
      );


      if (noResults) {

        noResults.hidden =
          shown !== 0;

      }

    }


    fetch(
      "index.html"
    )

      .then(
        (response) => {

          if (!response.ok) {

            throw new Error(
              "Could not load index.html"
            );

          }


          return response.text();

        }
      )

      .then(
        (html) => {

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
      )

      .catch(
        (error) => {

          console.error(
            "Category product load error:",
            error
          );


          if (grid) {

            grid.innerHTML =
              '<p class="no-results">' +
              'Products load nahi ho paaye. ' +
              'Page refresh karke dekhein.' +
              '</p>';

          }

        }
      );


    const searchInputCP =
      document.getElementById(
        "searchInput"
      );


    if (searchInputCP) {

      searchInputCP.value =
        params.get("q") ||
        "";


      searchInputCP.addEventListener(
        "input",
        () => {

          currentSearch =
            searchInputCP.value
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
      (e) => {

        if (
          e.key === "Enter" &&
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
    (e) => {

      if (
        e.key === "Escape" &&
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


  if (heroSlider) {

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
        (n) => {

          heroSlides[
            heroCurrent
          ]
            ?.classList.remove(
              "active"
            );


          heroCurrent =
            (
              n +
              heroSlides.length
            ) %
            heroSlides.length;


          heroSlides[
            heroCurrent
          ]
            ?.classList.add(
              "active"
            );

        };


      const startHero =
        () => {

          if (heroTimer) {
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

          }

          else {

            startHero();

          }

        }
      );

    }

  }


  // =================================================
  // INITIAL CART
  // =================================================

  renderCart();

});
