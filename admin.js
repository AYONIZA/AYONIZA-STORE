import { getApps, initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore,
  collection,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const app =
  getApps().length
    ? getApps()[0]
    : initializeApp(firebaseConfig);

const auth =
  getAuth(app);

const db =
  getFirestore(app);


// =====================================================
// ADMIN UID
// =====================================================

const ADMIN_UIDS = [
  "t8lcx1r7jdSXowv4EPgxJA8FXKn1",
  "ZWCoYQo4EwN6T58bYcxbw27KN4D3"
];


// =====================================================
// CONSTANTS
// =====================================================

const TRACK_BASE_URL =
  "https://ayoniza.shop/track-order.html?orderId=";

const NEXT_STATUSES = [
  "READY_TO_PACK",
  "PACKED",
  "READY_TO_SHIP",
  "SHIPPED",
  "IN_TRANSIT",
  "DELIVERED"
];


// =====================================================
// HELPER
// =====================================================

const $ = (id) =>
  document.getElementById(id);


// =====================================================
// ORDER DOM
// =====================================================

const loading =
  $("loading");

const ordersContainer =
  $("ordersContainer");

const totalOrders =
  $("totalOrders");

const newOrders =
  $("newOrders");

const shippedOrders =
  $("shippedOrders");

const deliveredOrders =
  $("deliveredOrders");

const logoutBtn =
  $("logoutBtn");


// =====================================================
// STOCK DOM
// =====================================================

const stockProductsContainer =
  $("stockProductsContainer");

const syncProductsBtn =
  $("syncProductsBtn");

const stockMessage =
  $("stockMessage");


// =====================================================
// PRODUCT MANAGEMENT DOM
// =====================================================

const productForm =
  $("productForm");

const productFormTitle =
  $("productFormTitle");

const editingProductId =
  $("editingProductId");

const productNameInput =
  $("productNameInput");

const productPriceInput =
  $("productPriceInput");

const productCategoryInput =
  $("productCategoryInput");

const productDiscountInput =
  $("productDiscountInput");

const productStockInput =
  $("productStockInput");

const productImageInput =
  $("productImageInput");

const productDescriptionInput =
  $("productDescriptionInput");

const productListedInput =
  $("productListedInput");

const productSubmitBtn =
  $("productSubmitBtn");

const productCancelEditBtn =
  $("productCancelEditBtn");

const productListContainer =
  $("productListContainer");

const refreshProductListBtn =
  $("refreshProductListBtn");

const productAdminMessage =
  $("productAdminMessage");


// =====================================================
// ACCEPT MODAL
// =====================================================

const acceptModal =
  $("acceptModal");

const acceptOrderLabel =
  $("acceptOrderLabel");

const acceptCourier =
  $("acceptCourier");

const acceptTracking =
  $("acceptTracking");

const acceptCloseBtn =
  $("acceptCloseBtn");

const acceptConfirmBtn =
  $("acceptConfirmBtn");


// =====================================================
// CANCEL MODAL
// =====================================================

const cancelModal =
  $("cancelModal");

const cancelOrderLabel =
  $("cancelOrderLabel");

const cancelReason =
  $("cancelReason");

const cancelCloseBtn =
  $("cancelCloseBtn");

const cancelConfirmBtn =
  $("cancelConfirmBtn");


// =====================================================
// SELECTED ORDER
// =====================================================

let selectedOrder =
  null;


// =====================================================
// ADMIN CHECK
// =====================================================

function isAdmin(
  user
) {

  return (
    !!user &&
    ADMIN_UIDS.includes(
      user.uid
    )
  );

}


// =====================================================
// ESCAPE HTML
// =====================================================

function esc(
  value
) {

  const div =
    document.createElement(
      "div"
    );

  div.textContent =
    value == null
      ? ""
      : String(value);

  return div.innerHTML;

}


// =====================================================
// ESCAPE ATTRIBUTE
// =====================================================

function escAttr(
  value
) {

  return esc(
    value
  );

}


// =====================================================
// FORMAT PRICE
// =====================================================

function formatPrice(
  value
) {

  return (
    "₹" +
    Number(
      value || 0
    ).toLocaleString(
      "en-IN"
    )
  );

}


// =====================================================
// FORMAT DATE
// =====================================================

function formatDate(
  timestamp
) {

  if (!timestamp) {

    return "—";

  }

  try {

    return timestamp
      .toDate()
      .toLocaleString(
        "en-IN"
      );

  }

  catch {

    return "—";

  }

}


// =====================================================
// STOCK STATUS
// =====================================================

function getStockStatus(
  stock
) {

  const value =
    Number(
      stock || 0
    );


  if (
    value <= 0
  ) {

    return {
      text:
        "Out of Stock",

      className:
        "out"
    };

  }


  if (
    value <= 5
  ) {

    return {

      text:
        `Only ${value} piece${
          value === 1
            ? ""
            : "s"
        } remaining`,

      className:
        "low"

    };

  }


  return {

    text:
      `${value} pieces available`,

    className:
      "available"

  };

}


// =====================================================
// MESSAGE
// =====================================================

function showMessage(
  element,
  message,
  type = "success"
) {

  if (!element) {

    return;

  }


  element.textContent =
    message;

  element.hidden =
    false;


  element.classList.remove(
    "success",
    "error"
  );


  element.classList.add(
    type
  );


  clearTimeout(
    element._hideTimer
  );


  element._hideTimer =
    setTimeout(
      () => {

        element.hidden =
          true;

      },
      3500
    );

}


// =====================================================
// STOCK MESSAGE
// =====================================================

function showStockMessage(
  message
) {

  showMessage(
    stockMessage,
    message,
    "success"
  );

}


// =====================================================
// PRODUCT MESSAGE
// =====================================================

function showProductMessage(
  message,
  type = "success"
) {

  showMessage(
    productAdminMessage,
    message,
    type
  );

}


// =====================================================
// LOAD PRODUCTS - STOCK
// =====================================================

async function loadProducts() {

  if (
    !stockProductsContainer
  ) {

    return;

  }


  stockProductsContainer.innerHTML = `
    <div class="empty">
      Loading products...
    </div>
  `;


  try {

    const snapshot =
      await getDocs(
        collection(
          db,
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


        .sort(
          (a, b) =>

            String(
              a.name ||
              ""
            ).localeCompare(

              String(
                b.name ||
                ""
              )

            )
        );


    if (
      !products.length
    ) {

      stockProductsContainer.innerHTML = `
        <div class="empty">
          No products found.
          <br><br>
          Click "Sync Products" first.
        </div>
      `;

      return;

    }


    stockProductsContainer.innerHTML =
      "";


    products.forEach(
      (product) => {

        stockProductsContainer.appendChild(

          createStockCard(
            product
          )

        );

      }
    );

  }

  catch (
    error
  ) {

    console.error(
      "Product loading error:",
      error
    );


    stockProductsContainer.innerHTML = `
      <div class="empty">
        Products load nahi ho paaye.
        <br><br>
        ${esc(
          error.message
        )}
      </div>
    `;

  }

}


// =====================================================
// CREATE STOCK CARD
// =====================================================

function createStockCard(
  product
) {

  const card =
    document.createElement(
      "div"
    );


  card.className =
    "stock-product-card";


  const stock =
    Number(
      product.stock ??
      0
    );


  const status =
    getStockStatus(
      stock
    );


  const listed =
    product.listed !==
    false;


  card.innerHTML = `

    <div class="stock-product-top">

      <img
        class="stock-product-image"
        src="${escAttr(
          product.image ||
          ""
        )}"
        alt="${escAttr(
          product.name ||
          "Product"
        )}"
      >

      <div>

        <h3 class="stock-product-name">

          ${esc(
            product.name ||
            "Unnamed Product"
          )}

        </h3>

        <p class="stock-product-price">

          ${formatPrice(
            product.price
          )}

        </p>

      </div>

    </div>


    <div class="stock-product-stock-row">

      <label>
        Stock
      </label>

      <input
        type="number"
        min="0"
        step="1"
        value="${stock}"
        class="stock-input"
      >

      <button
        type="button"
        class="stock-save-btn"
      >
        Save
      </button>

    </div>


    <div class="stock-current ${status.className}">

      ${status.text}

    </div>


    <div
      style="
        margin-top:8px;
        font-size:12px;
        font-weight:600;
      "
    >

      Website:
      ${listed ? "Listed" : "Unlisted"}

    </div>

  `;


  const input =
    card.querySelector(
      ".stock-input"
    );


  const saveBtn =
    card.querySelector(
      ".stock-save-btn"
    );


  const statusEl =
    card.querySelector(
      ".stock-current"
    );


  saveBtn.addEventListener(
    "click",
    async () => {

      const newStock =
        Number(
          input.value
        );


      if (

        !Number.isInteger(
          newStock
        ) ||

        newStock < 0

      ) {

        alert(
          "Stock must be a whole number 0 or greater."
        );

        return;

      }


      saveBtn.disabled =
        true;


      saveBtn.textContent =
        "Saving...";


      try {

        await updateDoc(

          doc(
            db,
            "products",
            product.firebaseId
          ),

          {

            stock:
              newStock,

            updatedAt:
              serverTimestamp()

          }

        );


        const newStatus =
          getStockStatus(
            newStock
          );


        statusEl.textContent =
          newStatus.text;


        statusEl.className =
          `stock-current ${newStatus.className}`;


        showStockMessage(
          `${
            product.name ||
            "Product"
          } stock updated to ${newStock}.`
        );


        await loadProductManager();

      }

      catch (
        error
      ) {

        console.error(
          "Stock update error:",
          error
        );


        alert(
          "Stock update failed:\n" +
          error.message
        );

      }

      finally {

        saveBtn.disabled =
          false;

        saveBtn.textContent =
          "Save";

      }

    }
  );


  return card;

}


// =====================================================
// SYNC PRODUCTS FROM WEBSITE
// =====================================================

async function syncProductsFromWebsite() {

  if (
    !syncProductsBtn
  ) {

    return;

  }


  syncProductsBtn.disabled =
    true;


  syncProductsBtn.textContent =
    "Syncing...";


  try {

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
        "index.html load nahi hua."
      );

    }


    const html =
      await response.text();


    const parsed =
      new DOMParser()
        .parseFromString(
          html,
          "text/html"
        );


    const cards =
      Array.from(
        parsed.querySelectorAll(
          ".product-card"
        )
      );


    if (
      !cards.length
    ) {

      throw new Error(
        "index.html me products nahi mile."
      );

    }


    let synced =
      0;


    for (
      const card of cards
    ) {

      const button =
        card.querySelector(
          ".add-cart-btn"
        );


      const productId =
        button?.dataset.id;


      if (
        !productId
      ) {

        continue;

      }


      const productName =

        button.dataset.name ||

        card
          .querySelector(
            "h3"
          )
          ?.textContent
          ?.trim() ||

        "";


      const price =
        Number(
          button.dataset.price
        ) || 0;


      const image =

        button.dataset.image ||

        card
          .querySelector(
            "img"
          )
          ?.getAttribute(
            "src"
          ) ||

        "";


      const category =
        card.dataset.category ||
        "";


      const discount =
        Number(
          card.dataset.discount
        ) || 0;


      const htmlStock =
        Number(
          card.dataset.stock
        );


      const ref =
        doc(
          db,
          "products",
          productId
        );


      const existing =
        await getDoc(
          ref
        );


      if (
        existing.exists()
      ) {

        await setDoc(

          ref,

          {

            productId,

            name:
              productName,

            price,

            image,

            category,

            discount,

            updatedAt:
              serverTimestamp()

          },

          {
            merge:
              true
          }

        );

      }

      else {

        const initialStock =

          Number.isInteger(
            htmlStock
          ) &&

          htmlStock >= 0

            ? htmlStock

            : 0;


        await setDoc(

          ref,

          {

            productId,

            name:
              productName,

            price,

            image,

            category,

            description:

              card
                .querySelector(
                  ".product-description"
                )
                ?.textContent
                ?.trim() ||

              "",

            discount,

            stock:
              initialStock,

            listed:
              true,

            createdAt:
              serverTimestamp(),

            updatedAt:
              serverTimestamp()

          }

        );

      }


      synced++;

    }


    showStockMessage(
      `${synced} products synced successfully.`
    );


    await loadProducts();


    await loadProductManager();

  }

  catch (
    error
  ) {

    console.error(
      "Product sync error:",
      error
    );


    alert(
      "Product sync failed:\n" +
      error.message
    );

  }

  finally {

    syncProductsBtn.disabled =
      false;


    syncProductsBtn.textContent =
      "Sync Products";

  }

}


syncProductsBtn?.addEventListener(
  "click",
  syncProductsFromWebsite
);


// =====================================================
// RESET PRODUCT FORM
// =====================================================

function resetProductForm() {

  productForm?.reset();


  if (
    editingProductId
  ) {

    editingProductId.value =
      "";

  }


  if (
    productFormTitle
  ) {

    productFormTitle.textContent =
      "Add New Product";

  }


  if (
    productSubmitBtn
  ) {

    productSubmitBtn.textContent =
      "Add Product";

  }


  if (
    productCancelEditBtn
  ) {

    productCancelEditBtn.hidden =
      true;

  }


  if (
    productListedInput
  ) {

    productListedInput.checked =
      true;

  }


  if (
    productDiscountInput
  ) {

    productDiscountInput.value =
      "0";

  }


  if (
    productStockInput
  ) {

    productStockInput.value =
      "0";

  }

}


// =====================================================
// FILL PRODUCT FORM
// =====================================================

function fillProductForm(
  product
) {

  editingProductId.value =
    product.productId ||
    product.firebaseId ||
    "";


  productNameInput.value =
    product.name ||
    "";


  productPriceInput.value =
    Number(
      product.price ||
      0
    );


  productCategoryInput.value =
    product.category ||
    "earrings";


  productDiscountInput.value =
    Number(
      product.discount ||
      0
    );


  productStockInput.value =
    Number(
      product.stock ||
      0
    );


  productImageInput.value =
    product.image ||
    "";


  productDescriptionInput.value =
    product.description ||
    "";


  productListedInput.checked =
    product.listed !==
    false;


  productFormTitle.textContent =
    "Edit Product";


  productSubmitBtn.textContent =
    "Update Product";


  productCancelEditBtn.hidden =
    false;


  productForm?.scrollIntoView({
    behavior:
      "smooth",

    block:
      "start"
  });

}


// =====================================================
// CREATE PRODUCT MANAGEMENT CARD
// =====================================================

function createProductManageCard(
  product
) {

  const card =
    document.createElement(
      "article"
    );


  card.className =
    "product-manage-card";


  const listed =
    product.listed !==
    false;


  const stock =
    Number(
      product.stock ??
      0
    );


  const status =
    getStockStatus(
      stock
    );


  card.innerHTML = `

    <div class="product-manage-image-wrap">

      <img
        class="product-manage-image"
        src="${escAttr(
          product.image ||
          ""
        )}"
        alt="${escAttr(
          product.name ||
          "Product"
        )}"
      >

    </div>


    <div class="product-manage-info">

      <div class="product-manage-title-row">

        <h3>

          ${esc(
            product.name ||
            "Unnamed Product"
          )}

        </h3>

        <span
          class="
            product-list-status
            ${
              listed
                ? "listed"
                : "unlisted"
            }
          "
        >

          ${
            listed
              ? "Listed"
              : "Unlisted"
          }

        </span>

      </div>


      <p>

        ${esc(
          product.category ||
          ""
        )}

      </p>


      <strong>

        ${formatPrice(
          product.price
        )}

      </strong>


      <small>

        Discount:
        ${
          Number(
            product.discount ||
            0
          )
        }%

        ·

        Stock:
        ${stock}

      </small>


      <small
        class="${status.className}"
      >

        ${esc(
          status.text
        )}

      </small>


      <div class="product-manage-actions">

        <button
          type="button"
          class="save-btn edit-product-btn"
        >
          Edit
        </button>


        <button
          type="button"
          class="save-btn toggle-list-btn"
        >

          ${
            listed
              ? "Unlist"
              : "List"
          }

        </button>


        <button
          type="button"
          class="cancel-btn delete-product-btn"
        >
          Delete
        </button>

      </div>

    </div>

  `;


  card
    .querySelector(
      ".edit-product-btn"
    )
    ?.addEventListener(
      "click",
      () => {

        fillProductForm(
          product
        );

      }
    );


  card
    .querySelector(
      ".toggle-list-btn"
    )
    ?.addEventListener(
      "click",
      async () => {

        const nextListed =
          !listed;


        const button =
          card.querySelector(
            ".toggle-list-btn"
          );


        button.disabled =
          true;


        button.textContent =
          "Saving...";


        try {

          await setDoc(

            doc(
              db,
              "products",
              product.firebaseId
            ),

            {

              listed:
                nextListed,

              updatedAt:
                serverTimestamp()

            },

            {
              merge:
                true
            }

          );


          showProductMessage(

            nextListed

              ? "Product listed on website."

              : "Product hidden from website."

          );


          await loadProductManager();

        }

        catch (
          error
        ) {

          console.error(
            "Listing update error:",
            error
          );


          alert(
            "Could not update listing status:\n" +
            error.message
          );

        }

        finally {

          button.disabled =
            false;

        }

      }
    );


  card
    .querySelector(
      ".delete-product-btn"
    )
    ?.addEventListener(
      "click",
      async () => {

        const ok =
          confirm(
            `Delete "${
              product.name ||
              "this product"
            }" permanently?`
          );


        if (
          !ok
        ) {

          return;

        }


        const button =
          card.querySelector(
            ".delete-product-btn"
          );


        button.disabled =
          true;


        button.textContent =
          "Deleting...";


        try {

          await deleteDoc(

            doc(
              db,
              "products",
              product.firebaseId
            )

          );


          if (

            editingProductId?.value ===
            product.firebaseId

          ) {

            resetProductForm();

          }


          showProductMessage(
            "Product deleted successfully."
          );


          await loadProductManager();


          await loadProducts();

        }

        catch (
          error
        ) {

          console.error(
            "Product delete error:",
            error
          );


          alert(
            "Product delete failed:\n" +
            error.message
          );


          button.disabled =
            false;


          button.textContent =
            "Delete";

        }

      }
    );


  return card;

}


// =====================================================
// LOAD PRODUCT MANAGER
// =====================================================

async function loadProductManager() {

  if (
    !productListContainer
  ) {

    return;

  }


  productListContainer.innerHTML = `
    <div class="empty">
      Loading products...
    </div>
  `;


  try {

    const snapshot =
      await getDocs(
        collection(
          db,
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

        .sort(

          (a, b) =>

            String(
              a.name ||
              ""
            ).localeCompare(

              String(
                b.name ||
                ""
              )

            )

        );


    if (
      !products.length
    ) {

      productListContainer.innerHTML = `
        <div class="empty">
          No products found.
          Add a product or click Sync Products.
        </div>
      `;

      return;

    }


    productListContainer.innerHTML =
      "";


    products.forEach(
      (product) => {

        productListContainer.appendChild(

          createProductManageCard(
            product
          )

        );

      }
    );

  }

  catch (
    error
  ) {

    console.error(
      "Product manager load error:",
      error
    );


    productListContainer.innerHTML = `
      <div class="empty">
        Products load nahi ho paaye.
        <br><br>
        ${esc(
          error.message
        )}
      </div>
    `;

  }

}


// =====================================================
// PRODUCT FORM SUBMIT
// =====================================================

productForm?.addEventListener(
  "submit",
  async (event) => {

    event.preventDefault();


    const name =
      productNameInput.value.trim();


    const price =
      Number(
        productPriceInput.value
      );


    const category =
      productCategoryInput.value.trim();


    const discount =
      Number(
        productDiscountInput.value ||
        0
      );


    const stock =
      Number(
        productStockInput.value ||
        0
      );


    const image =
      productImageInput.value.trim();


    const description =
      productDescriptionInput.value.trim();


    const listed =
      !!productListedInput.checked;


    const editingId =
      editingProductId.value.trim();


    if (
      !name
    ) {

      alert(
        "Product name enter karo."
      );

      return;

    }


    if (
      !Number.isFinite(
        price
      ) ||

      price < 0

    ) {

      alert(
        "Valid price enter karo."
      );

      return;

    }


    if (
      !category
    ) {

      alert(
        "Category select karo."
      );

      return;

    }


    if (

      !Number.isFinite(
        discount
      ) ||

      discount < 0 ||

      discount > 100

    ) {

      alert(
        "Discount 0 se 100 ke beech hona chahiye."
      );

      return;

    }


    if (

      !Number.isInteger(
        stock
      ) ||

      stock < 0

    ) {

      alert(
        "Stock whole number 0 or greater hona chahiye."
      );

      return;

    }


    if (
      !image
    ) {

      alert(
        "Image URL / path enter karo."
      );

      return;

    }


    productSubmitBtn.disabled =
      true;


    productSubmitBtn.textContent =

      editingId
        ? "Updating..."
        : "Adding...";


    try {

      let productId =
        editingId;


      if (
        !productId
      ) {

        const base =

          name

            .toLowerCase()

            .trim()

            .replace(
              /[^a-z0-9]+/g,
              "-"
            )

            .replace(
              /^-+|-+$/g,
              ""
            );


        productId =
          base ||
          `product-${Date.now()}`;


        const existing =
          await getDoc(

            doc(
              db,
              "products",
              productId
            )

          );


        if (
          existing.exists()
        ) {

          productId =
            `${productId}-${Date.now()}`;

        }

      }


      const ref =
        doc(
          db,
          "products",
          productId
        );


      const existing =
        await getDoc(
          ref
        );


      const productData = {

        productId,

        name,

        price,

        image,

        category,

        description,

        discount,

        stock,

        listed,

        updatedAt:
          serverTimestamp()

      };


      if (
        !existing.exists()
      ) {

        productData.createdAt =
          serverTimestamp();

      }


      await setDoc(

        ref,

        productData,

        {
          merge:
            true
        }

      );


      showProductMessage(

        editingId

          ? "Product updated successfully."

          : "Product added successfully."

      );


      resetProductForm();


      await loadProductManager();


      await loadProducts();

    }

    catch (
      error
    ) {

      console.error(
        "Product save error:",
        error
      );


      alert(
        "Product save failed:\n" +
        error.message
      );

    }

    finally {

      productSubmitBtn.disabled =
        false;


      productSubmitBtn.textContent =

        editingId

          ? "Update Product"

          : "Add Product";

    }

  }
);


// =====================================================
// CANCEL EDIT
// =====================================================

productCancelEditBtn?.addEventListener(
  "click",
  resetProductForm
);


// =====================================================
// REFRESH PRODUCTS
// =====================================================

refreshProductListBtn?.addEventListener(
  "click",
  loadProductManager
);


// =====================================================
// PAYMENT CLASS
// =====================================================

function paymentClass(
  status
) {

  return (

    status ===
    "VERIFIED"

  )

    ? "payment-status verified"

    : "payment-status pending";

}


// =====================================================
// CONFIRMATION MESSAGE
// =====================================================

function makeConfirmationMessage(
  order,
  trackingUrl
) {

  return (

    `AYONIZA Order Confirmed ✅\n\n` +

    `Hi ${
      order.customerName ||
      "Customer"
    },\n\n` +

    `Your order ${
      order.orderId
    } has been confirmed.\n\n` +

    `Amount: ${
      formatPrice(
        order.total
      )
    }\n` +

    `Tracking ID: ${
      order.trackingNumber ||
      "—"
    }\n` +

    `Courier: ${
      order.courier ||
      "—"
    }\n\n` +

    `Track your order:\n` +

    trackingUrl +

    `\n\nThank you for shopping with AYONIZA.`

  );

}


// =====================================================
// CANCELLATION MESSAGE
// =====================================================

function makeCancellationMessage(
  order,
  reason
) {

  return (

    `AYONIZA Order Update\n\n` +

    `Hi ${
      order.customerName ||
      "Customer"
    },\n\n` +

    `Your order ${
      order.orderId
    } has been cancelled.\n\n` +

    `Reason: ${
      reason
    }\n\n` +

    `For help, please contact AYONIZA support.`

  );

}


// =====================================================
// OPEN ACCEPT MODAL
// =====================================================

function openAcceptModal(
  order
) {

  selectedOrder =
    order;


  if (
    acceptOrderLabel
  ) {

    acceptOrderLabel.textContent =
      `Order: ${
        order.orderId
      }`;

  }


  if (
    acceptCourier
  ) {

    acceptCourier.value =
      order.courier ||
      "";

  }


  if (
    acceptTracking
  ) {

    acceptTracking.value =
      order.trackingNumber ||
      "";

  }


  acceptModal?.classList.add(
    "show"
  );

}


// =====================================================
// CLOSE ACCEPT MODAL
// =====================================================

function closeAcceptModal() {

  selectedOrder =
    null;


  acceptModal?.classList.remove(
    "show"
  );

}


// =====================================================
// OPEN CANCEL MODAL
// =====================================================

function openCancelModal(
  order
) {

  selectedOrder =
    order;


  if (
    cancelOrderLabel
  ) {

    cancelOrderLabel.textContent =
      `Order: ${
        order.orderId
      }`;

  }


  if (
    cancelReason
  ) {

    cancelReason.value =
      "";

  }


  cancelModal?.classList.add(
    "show"
  );

}


// =====================================================
// CLOSE CANCEL MODAL
// =====================================================

function closeCancelModal() {

  selectedOrder =
    null;


  cancelModal?.classList.remove(
    "show"
  );

}


// =====================================================
// LOAD ORDERS
// =====================================================

async function loadOrders() {

  try {

    if (
      loading
    ) {

      loading.hidden =
        false;

    }


    if (
      ordersContainer
    ) {

      ordersContainer.innerHTML =
        "";

    }


    const snapshot =
      await getDocs(
        collection(
          db,
          "orders"
        )
      );


    const orders =
      snapshot.docs

        .map(
          (item) => ({

            firebaseId:
              item.id,

            ...item.data()

          })
        )

        .sort(

          (a, b) =>

            (
              b.createdAt
                ?.toMillis?.() ||
              0
            ) -

            (
              a.createdAt
                ?.toMillis?.() ||
              0
            )

        );


    if (
      totalOrders
    ) {

      totalOrders.textContent =
        orders.length;

    }


    if (
      newOrders
    ) {

      newOrders.textContent =

        orders.filter(
          (order) =>

            order.orderStatus ===
            "NEW"

        ).length;

    }


    if (
      shippedOrders
    ) {

      shippedOrders.textContent =

        orders.filter(
          (order) =>

            order.orderStatus ===
            "SHIPPED"

        ).length;

    }


    if (
      deliveredOrders
    ) {

      deliveredOrders.textContent =

        orders.filter(
          (order) =>

            order.orderStatus ===
            "DELIVERED"

        ).length;

    }


    if (
      !orders.length
    ) {

      if (
        ordersContainer
      ) {

        ordersContainer.innerHTML = `
          <div class="empty">
            No orders found.
          </div>
        `;

      }


      return;

    }


    orders.forEach(
      (order) => {

        ordersContainer?.appendChild(

          createOrderCard(
            order
          )

        );

      }
    );

  }

  catch (
    error
  ) {

    console.error(
      "Order loading error:",
      error
    );


    if (
      ordersContainer
    ) {

      ordersContainer.innerHTML = `
        <div class="empty">

          <strong>
            Orders load nahi ho paaye.
          </strong>

          <br><br>

          ${esc(
            error.message
          )}

        </div>
      `;

    }

  }

  finally {

    if (
      loading
    ) {

      loading.hidden =
        true;

    }

  }

}


// =====================================================
// CREATE ORDER CARD
// =====================================================

function createOrderCard(
  order
) {

  const card =
    document.createElement(
      "article"
    );


  card.className =
    "order-card";


  const itemsHTML =

    Array.isArray(
      order.items
    )

      ? order.items
          .map(

            (item) => `

              <div class="item">

                <img
                  src="${escAttr(
                    item.image ||
                    ""
                  )}"
                  alt="${escAttr(
                    item.productName ||
                    "Product"
                  )}"
                >

                <div class="item-info">

                  <div class="item-name">

                    ${esc(
                      item.productName ||
                      "Product"
                    )}

                  </div>


                  <div class="item-meta">

                    Qty:
                    ${
                      Number(
                        item.quantity ||
                        1
                      )
                    }

                    |

                    Price:
                    ${
                      formatPrice(
                        item.price
                      )
                    }

                  </div>


                  <div class="item-meta">

                    Total:
                    ${
                      formatPrice(
                        item.lineTotal
                      )
                    }

                  </div>

                </div>

              </div>

            `

          )

          .join("")

      : "";


  let actionHTML =
    "";


  // =================================================
  // NEW ORDER
  // =================================================

  if (
    order.orderStatus ===
    "NEW"
  ) {

    actionHTML = `

      <div class="admin-actions">

        <button
          type="button"
          class="accept-btn"
          data-action="accept"
        >
          Accept Order
        </button>


        <button
          type="button"
          class="cancel-btn"
          data-action="cancel"
        >
          Cancel Order
        </button>

      </div>

    `;

  }


  // =================================================
  // SHIPPING UPDATE
  // =================================================

  else if (

    ![
      "CANCELLED",
      "DELIVERED"
    ].includes(
      order.orderStatus
    )

  ) {

    const options =

      NEXT_STATUSES

        .map(

          (status) => `

            <option
              value="${escAttr(
                status
              )}"

              ${
                order.orderStatus ===
                status
                  ? "selected"
                  : ""
              }
            >

              ${
                status
              }

            </option>

          `

        )

        .join("");


    actionHTML = `

      <div class="shipping-box">

        <select
          class="status-select"
          data-field="status"
        >

          <option
            value="${escAttr(
              order.orderStatus ||
              ""
            )}"
            selected
          >

            ${
              esc(
                order.orderStatus ||
                "UNKNOWN"
              )
            }

          </option>

          ${options}

        </select>


        <input
          type="text"
          class="courier-input"
          placeholder="Courier name"
          value="${escAttr(
            order.courier ||
            ""
          )}"
        >


        <input
          type="text"
          class="tracking-input"
          placeholder="Tracking number"
          value="${escAttr(
            order.trackingNumber ||
            ""
          )}"
        >


        <button
          type="button"
          class="save-btn"
          data-action="save"
        >
          Save Order Update
        </button>

      </div>

    `;

  }


  // =================================================
  // TRACKING
  // =================================================

  const trackingHTML =

    order.trackingUrl

      ? `

        <div class="notification-box">

          <strong>
            Tracking Link
          </strong>


          <a
            class="tracking-link"
            href="${escAttr(
              order.trackingUrl
            )}"
            target="_blank"
            rel="noopener"
          >

            ${esc(
              order.trackingUrl
            )}

          </a>

        </div>

      `

      : "";


  // =================================================
  // NOTIFICATION
  // =================================================

  const notificationHTML =

    order.notificationMessage

      ? `

        <div class="notification-box">

          <strong>
            Customer Message
          </strong>


          <div>

            ${
              esc(
                order.notificationMessage
              ).replace(
                /\n/g,
                "<br>"
              )
            }

          </div>

        </div>

      `

      : "";


  // =================================================
  // CARD HTML
  // =================================================

  card.innerHTML = `

    <div class="order-header">

      <div>

        <div class="order-id">

          ${esc(
            order.orderId ||
            "No Order ID"
          )}

        </div>


        <div class="order-date">

          ${
            formatDate(
              order.createdAt
            )
          }

        </div>

      </div>


      <div class="order-status">

        ${
          esc(
            order.orderStatus ||
            "UNKNOWN"
          )
        }

      </div>

    </div>


    <div class="order-grid">


      <!-- CUSTOMER -->

      <section class="section">

        <h3>
          Customer
        </h3>


        <p>

          <strong>
            Name:
          </strong>

          ${
            esc(
              order.customerName ||
              "—"
            )
          }

        </p>


        <p>

          <strong>
            Email:
          </strong>

          ${
            esc(
              order.email ||
              "—"
            )
          }

        </p>


        <p>

          <strong>
            Phone:
          </strong>

          ${
            esc(
              order.phone ||
              "—"
            )
          }

        </p>


        <h3>
          Delivery Address
        </h3>


        <p>

          ${
            esc(
              order.address ||
              "—"
            )
          }


          ${
            order.landmark

              ? "<br>" +
                esc(
                  order.landmark
                )

              : ""
          }


          <br>


          ${
            esc(
              order.city ||
              ""
            )
          }

          ,

          ${
            esc(
              order.state ||
              ""
            )
          }

          -

          ${
            esc(
              order.pincode ||
              ""
            )
          }


          <br>


          ${
            esc(
              order.country ||
              "India"
            )
          }

        </p>

      </section>


      <!-- ORDER -->

      <section class="section">

        <h3>
          Order
        </h3>


        <div class="items">

          ${itemsHTML}

        </div>


        <div class="amount-box">

          Total:
          ${
            formatPrice(
              order.total
            )
          }

        </div>


        <p>

          <strong>
            Payment:
          </strong>


          <span
            class="${paymentClass(
              order.paymentStatus
            )}"
          >

            ${
              esc(
                order.paymentStatus ||
                "UNKNOWN"
              )
            }

          </span>

        </p>


        <p>

          <strong>
            Method:
          </strong>

          ${
            esc(
              order.paymentMethod ||
              "—"
            )
          }

        </p>


        ${
          order.trackingNumber

            ? `

              <p>

                <strong>
                  Tracking ID:
                </strong>

                ${
                  esc(
                    order.trackingNumber
                  )
                }

              </p>

            `

            : ""
        }

      </section>


      <!-- ACTION -->

      <section class="section">

        <h3>
          Order Action
        </h3>


        ${actionHTML}


        ${trackingHTML}


        ${notificationHTML}

      </section>


    </div>

  `;


  // =================================================
  // ACCEPT
  // =================================================

  card
    .querySelector(
      '[data-action="accept"]'
    )
    ?.addEventListener(

      "click",

      () => {

        openAcceptModal(
          order
        );

      }

    );


  // =================================================
  // CANCEL
  // =================================================

  card
    .querySelector(
      '[data-action="cancel"]'
    )
    ?.addEventListener(

      "click",

      () => {

        openCancelModal(
          order
        );

      }

    );


  // =================================================
  // SAVE SHIPPING UPDATE
  // =================================================

  const saveButton =
    card.querySelector(
      '[data-action="save"]'
    );


  if (
    saveButton
  ) {

    const statusSelect =
      card.querySelector(
        '[data-field="status"]'
      );


    const courierInput =
      card.querySelector(
        ".courier-input"
      );


    const trackingInput =
      card.querySelector(
        ".tracking-input"
      );


    saveButton.addEventListener(
      "click",
      async () => {

        saveButton.disabled =
          true;


        saveButton.textContent =
          "Saving...";


        try {

          await updateDoc(

            doc(
              db,
              "orders",
              order.firebaseId
            ),

            {

              orderStatus:
                statusSelect.value,

              courier:
                courierInput.value.trim(),

              trackingNumber:
                trackingInput.value.trim(),

              updatedAt:
                serverTimestamp()

            }

          );


          alert(
            "Order updated successfully."
          );


          await loadOrders();

        }

        catch (
          error
        ) {

          console.error(
            "Order update error:",
            error
          );


          alert(
            "Order update failed:\n" +
            error.message
          );

        }

        finally {

          saveButton.disabled =
            false;


          saveButton.textContent =
            "Save Order Update";

        }

      }
    );

  }


  return card;

}


// =====================================================
// ACCEPT ORDER
// =====================================================

acceptConfirmBtn?.addEventListener(
  "click",
  async () => {

    if (
      !selectedOrder
    ) {

      return;

    }


    const courier =
      acceptCourier?.value.trim() ||
      "";


    const trackingNumber =
      acceptTracking?.value.trim() ||
      "";


    if (
      !courier
    ) {

      alert(
        "Courier name enter karo."
      );


      acceptCourier?.focus();


      return;

    }


    if (
      !trackingNumber
    ) {

      alert(
        "Tracking ID enter karo."
      );


      acceptTracking?.focus();


      return;

    }


    acceptConfirmBtn.disabled =
      true;


    acceptConfirmBtn.textContent =
      "Confirming...";


    try {

      const trackingUrl =

        TRACK_BASE_URL +

        encodeURIComponent(
          selectedOrder.orderId
        );


      const message =

        makeConfirmationMessage(

          {
            ...selectedOrder,

            courier,

            trackingNumber

          },

          trackingUrl

        );


      await updateDoc(

        doc(
          db,
          "orders",
          selectedOrder.firebaseId
        ),

        {

          orderStatus:
            "ACCEPTED",

          courier,

          trackingNumber,

          trackingUrl,

          notificationType:
            "ORDER_CONFIRMED",

          notificationTitle:
            "Order Confirmed",

          notificationMessage:
            message,

          notificationCreatedAt:
            serverTimestamp(),

          notificationSent:
            false,

          updatedAt:
            serverTimestamp()

        }

      );


      closeAcceptModal();


      alert(
        "Order confirmed successfully."
      );


      await loadOrders();

    }

    catch (
      error
    ) {

      console.error(
        "Accept order error:",
        error
      );


      alert(
        "Order accept nahi ho paya:\n" +
        error.message
      );

    }

    finally {

      acceptConfirmBtn.disabled =
        false;


      acceptConfirmBtn.textContent =
        "Confirm Order";

    }

  }
);


// =====================================================
// CANCEL ORDER
// =====================================================

cancelConfirmBtn?.addEventListener(
  "click",
  async () => {

    if (
      !selectedOrder
    ) {

      return;

    }


    const reason =
      cancelReason?.value.trim() ||
      "";


    if (
      !reason
    ) {

      alert(
        "Cancellation reason enter karo."
      );


      cancelReason?.focus();


      return;

    }


    cancelConfirmBtn.disabled =
      true;


    cancelConfirmBtn.textContent =
      "Cancelling...";


    try {

      const message =
        makeCancellationMessage(

          selectedOrder,

          reason

        );


      await updateDoc(

        doc(
          db,
          "orders",
          selectedOrder.firebaseId
        ),

        {

          orderStatus:
            "CANCELLED",

          cancelReason:
            reason,

          cancelledAt:
            serverTimestamp(),

          notificationType:
            "ORDER_CANCELLED",

          notificationTitle:
            "Order Cancelled",

          notificationMessage:
            message,

          notificationCreatedAt:
            serverTimestamp(),

          notificationSent:
            false,

          updatedAt:
            serverTimestamp()

        }

      );


      closeCancelModal();


      alert(
        "Order cancelled successfully."
      );


      await loadOrders();

    }

    catch (
      error
    ) {

      console.error(
        "Cancel order error:",
        error
      );


      alert(
        "Order cancel nahi ho paya:\n" +
        error.message
      );

    }

    finally {

      cancelConfirmBtn.disabled =
        false;


      cancelConfirmBtn.textContent =
        "Cancel Order";

    }

  }
);


// =====================================================
// MODAL CLOSE
// =====================================================

acceptCloseBtn?.addEventListener(
  "click",
  closeAcceptModal
);


cancelCloseBtn?.addEventListener(
  "click",
  closeCancelModal
);


acceptModal?.addEventListener(
  "click",
  (event) => {

    if (
      event.target ===
      acceptModal
    ) {

      closeAcceptModal();

    }

  }
);


cancelModal?.addEventListener(
  "click",
  (event) => {

    if (
      event.target ===
      cancelModal
    ) {

      closeCancelModal();

    }

  }
);


// =====================================================
// AUTH
// =====================================================

onAuthStateChanged(
  auth,
  async (user) => {

    if (
      !user
    ) {

      alert(
        "Please login as admin."
      );


      window.location.href =
        "login.html";


      return;

    }


    if (
      !isAdmin(
        user
      )
    ) {

      alert(
        "Access denied. Admin account required."
      );


      window.location.href =
        "index.html";


      return;

    }


    await loadOrders();


    await loadProducts();


    await loadProductManager();

  }
);


// =====================================================
// LOGOUT
// =====================================================

logoutBtn?.addEventListener(
  "click",
  async () => {

    try {

      await signOut(
        auth
      );


      window.location.href =
        "login.html";

    }

    catch (
      error
    ) {

      console.error(
        "Logout error:",
        error
      );


      alert(
        "Logout failed."
      );

    }

  }
);


// =====================================================
// INITIAL FORM STATE
// =====================================================

resetProductForm();
