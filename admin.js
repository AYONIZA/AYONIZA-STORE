import {
    getApps,
    initializeApp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";

import {
    getAuth,
    onAuthStateChanged,
    signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
    getFirestore,
    collection,
    getDocs,
    getDoc,
    updateDoc,
    setDoc,
    doc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import {
    firebaseConfig
} from "./firebase-config.js";


// =====================================================
// FIREBASE
// =====================================================

const firebaseApp =
    getApps().length > 0
        ? getApps()[0]
        : initializeApp(firebaseConfig);

const auth =
    getAuth(firebaseApp);

const db =
    getFirestore(firebaseApp);


// =====================================================
// ADMIN UID
// =====================================================

const ADMIN_UIDS = [
    "t8lcx1r7jdSXowv4EPgxJA8FXKn1",
    "ZWCoYQo4EwN6T58bYcxbw27KN4D3"
];


// =====================================================
// ADMIN CHECK
// =====================================================

function isAdmin(user) {

    return (
        user &&
        ADMIN_UIDS.includes(user.uid)
    );

}


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
// DOM
// =====================================================

const loading =
    document.getElementById(
        "loading"
    );

const ordersContainer =
    document.getElementById(
        "ordersContainer"
    );

const totalOrders =
    document.getElementById(
        "totalOrders"
    );

const newOrders =
    document.getElementById(
        "newOrders"
    );

const shippedOrders =
    document.getElementById(
        "shippedOrders"
    );

const deliveredOrders =
    document.getElementById(
        "deliveredOrders"
    );

const logoutBtn =
    document.getElementById(
        "logoutBtn"
    );


// =====================================================
// STOCK DOM
// =====================================================

const stockProductsContainer =
    document.getElementById(
        "stockProductsContainer"
    );

const syncProductsBtn =
    document.getElementById(
        "syncProductsBtn"
    );

const stockMessage =
    document.getElementById(
        "stockMessage"
    );


// =====================================================
// ACCEPT MODAL DOM
// =====================================================

const acceptModal =
    document.getElementById(
        "acceptModal"
    );

const acceptOrderLabel =
    document.getElementById(
        "acceptOrderLabel"
    );

const acceptCourier =
    document.getElementById(
        "acceptCourier"
    );

const acceptTracking =
    document.getElementById(
        "acceptTracking"
    );

const acceptCloseBtn =
    document.getElementById(
        "acceptCloseBtn"
    );

const acceptConfirmBtn =
    document.getElementById(
        "acceptConfirmBtn"
    );


// =====================================================
// CANCEL MODAL DOM
// =====================================================

const cancelModal =
    document.getElementById(
        "cancelModal"
    );

const cancelOrderLabel =
    document.getElementById(
        "cancelOrderLabel"
    );

const cancelReason =
    document.getElementById(
        "cancelReason"
    );

const cancelCloseBtn =
    document.getElementById(
        "cancelCloseBtn"
    );

const cancelConfirmBtn =
    document.getElementById(
        "cancelConfirmBtn"
    );


// =====================================================
// SELECTED ORDER
// =====================================================

let selectedOrder = null;


// =====================================================
// STOCK MESSAGE
// =====================================================

function showStockMessage(
    message
) {

    if (!stockMessage) {
        return;
    }

    stockMessage.textContent =
        message;

    stockMessage.hidden =
        false;

    clearTimeout(
        window.ayonizaStockMessageTimer
    );

    window.ayonizaStockMessageTimer =
        setTimeout(
            () => {
                stockMessage.hidden =
                    true;
            },
            3000
        );
}


// =====================================================
// STOCK STATUS
// =====================================================

function getStockStatus(
    stock
) {

    const value =
        Number(stock || 0);

    if (value <= 0) {

        return {
            text:
                "Out of Stock",

            className:
                "out"
        };
    }

    if (value <= 5) {

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
// LOAD PRODUCTS
// =====================================================

async function loadProducts() {

    if (!stockProductsContainer) {
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
            snapshot.docs.map(
                (item) => ({
                    firebaseId:
                        item.id,

                    ...item.data()
                })
            );

        products.sort(
            (a, b) =>
                String(
                    a.name || ""
                ).localeCompare(
                    String(
                        b.name || ""
                    )
                )
        );

        if (
            products.length === 0
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

    catch (error) {

        console.error(
            "Product loading error:",
            error
        );

        stockProductsContainer.innerHTML = `
            <div class="empty">
                Products load nahi ho paaye.
                <br><br>
                ${escapeHTML(
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
            product.stock ?? 0
        );

    const status =
        getStockStatus(
            stock
        );

    card.innerHTML = `

        <div class="stock-product-top">

            <img
                class="stock-product-image"
                src="${escapeAttribute(
                    product.image || ""
                )}"
                alt="${escapeAttribute(
                    product.name || "Product"
                )}"
            >

            <div>

                <h3
                    class="stock-product-name"
                >
                    ${escapeHTML(
                        product.name ||
                        "Unnamed Product"
                    )}
                </h3>

                <p
                    class="stock-product-price"
                >
                    ${formatPrice(
                        product.price
                    )}
                </p>

            </div>

        </div>


        <div
            class="stock-product-stock-row"
        >

            <label>
                Stock
            </label>

            <input
                type="number"
                min="0"
                step="1"
                value="${stock}"
                class="stock-input"
                data-product-id="${escapeAttribute(
                    product.firebaseId
                )}"
            >

            <button
                type="button"
                class="stock-save-btn"
                data-product-id="${escapeAttribute(
                    product.firebaseId
                )}"
            >
                Save
            </button>

        </div>


        <div
            class="stock-current ${status.className}"
        >
            ${status.text}
        </div>

    `;


    const saveButton =
        card.querySelector(
            ".stock-save-btn"
        );

    const input =
        card.querySelector(
            ".stock-input"
        );

    const currentStatus =
        card.querySelector(
            ".stock-current"
        );


    saveButton?.addEventListener(
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

            const productId =
                saveButton.dataset.productId;

            saveButton.disabled =
                true;

            saveButton.textContent =
                "Saving...";

            try {

                await setDoc(

                    doc(
                        db,
                        "products",
                        productId
                    ),

                    {
                        stock:
                            newStock,

                        updatedAt:
                            serverTimestamp()
                    },

                    {
                        merge:
                            true
                    }
                );


                const newStatus =
                    getStockStatus(
                        newStock
                    );

                currentStatus.textContent =
                    newStatus.text;

                currentStatus.className =
                    "stock-current " +
                    newStatus.className;


                showStockMessage(
                    `${
                        product.name ||
                        "Product"
                    } stock updated to ${newStock}.`
                );

            }

            catch (error) {

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

                saveButton.disabled =
                    false;

                saveButton.textContent =
                    "Save";
            }
        }
    );


    return card;
}


// =====================================================
// SYNC PRODUCTS FROM INDEX.HTML
// =====================================================

async function syncProductsFromWebsite() {

    if (!syncProductsBtn) {
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

        if (!response.ok) {

            throw new Error(
                "index.html load nahi hua."
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

        const cards =
            Array.from(
                parsedDoc.querySelectorAll(
                    ".product-card"
                )
            );

        if (
            cards.length === 0
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

            const addButton =
                card.querySelector(
                    ".add-cart-btn"
                );

            const productId =
                addButton?.dataset.id;

            if (!productId) {
                continue;
            }

            const productName =
                addButton.dataset.name ||
                card.querySelector(
                    "h3"
                )?.textContent?.trim() ||
                "";

            const price =
                Number(
                    addButton.dataset.price
                ) || 0;

            const image =
                addButton.dataset.image ||
                card.querySelector(
                    "img"
                )?.getAttribute(
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


            // ------------------------------------------
            // IMPORTANT:
            // Existing Firestore stock preserve karo
            // ------------------------------------------

            const productRef =
                doc(
                    db,
                    "products",
                    productId
                );

            const existingSnapshot =
                await getDoc(
                    productRef
                );


            if (
                existingSnapshot.exists()
            ) {

                // Product already exists.
                // Stock overwrite NAHI karenge.

                await setDoc(

                    productRef,

                    {
                        productId:
                            productId,

                        name:
                            productName,

                        price:
                            price,

                        image:
                            image,

                        category:
                            category,

                        discount:
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

                // First time product create ho raha hai.

                const initialStock =
                    Number.isInteger(
                        htmlStock
                    ) &&
                    htmlStock >= 0
                        ? htmlStock
                        : 0;

                await setDoc(

                    productRef,

                    {
                        productId:
                            productId,

                        name:
                            productName,

                        price:
                            price,

                        image:
                            image,

                        category:
                            category,

                        discount:
                            discount,

                        stock:
                            initialStock,

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

    }

    catch (error) {

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


// =====================================================
// SYNC BUTTON
// =====================================================

syncProductsBtn?.addEventListener(
    "click",
    syncProductsFromWebsite
);


// =====================================================
// HELPERS
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


function formatPrice(
    amount
) {

    return (
        "₹" +
        Number(
            amount || 0
        ).toLocaleString(
            "en-IN"
        )
    );
}


function escapeHTML(
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


function escapeAttribute(
    value
) {

    return escapeHTML(
        value
    );
}


function getPaymentClass(
    status
) {

    return status ===
        "VERIFIED"
        ? "payment-status verified"
        : "payment-status pending";
}


// =====================================================
// CUSTOMER CONFIRMATION MESSAGE
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
// ACCEPT MODAL
// =====================================================

function openAcceptModal(
    order
) {

    selectedOrder =
        order;

    if (acceptOrderLabel) {

        acceptOrderLabel.textContent =
            `Order: ${
                order.orderId
            }`;
    }

    if (acceptCourier) {

        acceptCourier.value =
            order.courier ||
            "";
    }

    if (acceptTracking) {

        acceptTracking.value =
            order.trackingNumber ||
            "";
    }

    acceptModal?.classList.add(
        "show"
    );
}


function closeAcceptModal() {

    selectedOrder =
        null;

    acceptModal?.classList.remove(
        "show"
    );
}


// =====================================================
// CANCEL MODAL
// =====================================================

function openCancelModal(
    order
) {

    selectedOrder =
        order;

    if (cancelOrderLabel) {

        cancelOrderLabel.textContent =
            `Order: ${
                order.orderId
            }`;
    }

    if (cancelReason) {

        cancelReason.value =
            "";
    }

    cancelModal?.classList.add(
        "show"
    );
}


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

        if (loading) {
            loading.hidden =
                false;
        }

        if (ordersContainer) {
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
            snapshot.docs.map(
                (item) => ({

                    firebaseId:
                        item.id,

                    ...item.data()
                })
            );


        orders.sort(
            (a, b) => {

                const aTime =
                    a.createdAt
                        ?.toMillis?.() ||
                    0;

                const bTime =
                    b.createdAt
                        ?.toMillis?.() ||
                    0;

                return (
                    bTime -
                    aTime
                );
            }
        );


        // =================================================
        // STATS
        // =================================================

        if (totalOrders) {

            totalOrders.textContent =
                orders.length;
        }

        if (newOrders) {

            newOrders.textContent =
                orders.filter(
                    (order) =>
                        order.orderStatus ===
                        "NEW"
                ).length;
        }

        if (shippedOrders) {

            shippedOrders.textContent =
                orders.filter(
                    (order) =>
                        order.orderStatus ===
                        "SHIPPED"
                ).length;
        }

        if (deliveredOrders) {

            deliveredOrders.textContent =
                orders.filter(
                    (order) =>
                        order.orderStatus ===
                        "DELIVERED"
                ).length;
        }


        // =================================================
        // EMPTY
        // =================================================

        if (
            orders.length ===
            0
        ) {

            if (ordersContainer) {

                ordersContainer.innerHTML = `
                    <div class="empty">
                        No orders found.
                    </div>
                `;
            }

            return;
        }


        // =================================================
        // RENDER ORDERS
        // =================================================

        orders.forEach(
            (order) => {

                if (ordersContainer) {

                    ordersContainer.appendChild(
                        createOrderCard(
                            order
                        )
                    );
                }
            }
        );

    }

    catch (error) {

        console.error(
            "Order loading error:",
            error
        );

        if (ordersContainer) {

            ordersContainer.innerHTML = `
                <div class="empty">

                    <strong>
                        Orders load nahi ho paaye.
                    </strong>

                    <br><br>

                    ${escapeHTML(
                        error.message
                    )}

                </div>
            `;
        }

    }

    finally {

        if (loading) {

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


    // =================================================
    // ITEMS
    // =================================================

    const itemsHTML =
        Array.isArray(
            order.items
        )

            ? order.items
                .map(
                    (item) => `

                        <div class="item">

                            <img
                                src="${escapeAttribute(
                                    item.image ||
                                    ""
                                )}"
                                alt="${escapeAttribute(
                                    item.productName ||
                                    "Product"
                                )}"
                            >

                            <div class="item-info">

                                <div class="item-name">

                                    ${escapeHTML(
                                        item.productName ||
                                        "Product"
                                    )}

                                </div>

                                <div class="item-meta">

                                    Qty:
                                    ${Number(
                                        item.quantity ||
                                        1
                                    )}

                                    |

                                    Price:
                                    ${formatPrice(
                                        item.price
                                    )}

                                </div>

                                <div class="item-meta">

                                    Total:
                                    ${formatPrice(
                                        item.lineTotal
                                    )}

                                </div>

                            </div>

                        </div>

                    `
                )
                .join("")

            : "";


    const paymentClass =
        getPaymentClass(
            order.paymentStatus
        );


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
    // SHIPPING STATUS
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
                            value="${escapeAttribute(
                                status
                            )}"
                            ${
                                order.orderStatus ===
                                status
                                    ? "selected"
                                    : ""
                            }
                        >
                            ${status}
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
                        value="${escapeAttribute(
                            order.orderStatus ||
                            ""
                        )}"
                        selected
                    >
                        ${escapeHTML(
                            order.orderStatus ||
                            "UNKNOWN"
                        )}
                    </option>

                    ${options}

                </select>


                <input
                    type="text"
                    class="courier-input"
                    placeholder="Courier name"
                    value="${escapeAttribute(
                        order.courier ||
                        ""
                    )}"
                >


                <input
                    type="text"
                    class="tracking-input"
                    placeholder="Tracking number"
                    value="${escapeAttribute(
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

    let trackingHTML =
        "";

    if (
        order.trackingUrl
    ) {

        trackingHTML = `

            <div
                class="notification-box"
            >

                <strong>
                    Tracking Link
                </strong>

                <a
                    class="tracking-link"
                    href="${escapeAttribute(
                        order.trackingUrl
                    )}"
                    target="_blank"
                    rel="noopener"
                >
                    ${escapeHTML(
                        order.trackingUrl
                    )}
                </a>

            </div>

        `;
    }


    // =================================================
    // NOTIFICATION
    // =================================================

    let notificationHTML =
        "";

    if (
        order.notificationMessage
    ) {

        notificationHTML = `

            <div
                class="notification-box"
            >

                <strong>
                    Customer Message
                </strong>

                <div>

                    ${escapeHTML(
                        order.notificationMessage
                    ).replace(
                        /\n/g,
                        "<br>"
                    )}

                </div>

            </div>

        `;
    }


    // =================================================
    // CARD HTML
    // =================================================

    card.innerHTML = `

        <div class="order-header">

            <div>

                <div class="order-id">

                    ${escapeHTML(
                        order.orderId ||
                        "No Order ID"
                    )}

                </div>

                <div class="order-date">

                    ${formatDate(
                        order.createdAt
                    )}

                </div>

            </div>


            <div class="order-status">

                ${escapeHTML(
                    order.orderStatus ||
                    "UNKNOWN"
                )}

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

                    ${escapeHTML(
                        order.customerName ||
                        "—"
                    )}

                </p>

                <p>

                    <strong>
                        Email:
                    </strong>

                    ${escapeHTML(
                        order.email ||
                        "—"
                    )}

                </p>

                <p>

                    <strong>
                        Phone:
                    </strong>

                    ${escapeHTML(
                        order.phone ||
                        "—"
                    )}

                </p>


                <h3>
                    Delivery Address
                </h3>

                <p>

                    ${escapeHTML(
                        order.address ||
                        "—"
                    )}

                    ${
                        order.landmark
                            ? "<br>" +
                              escapeHTML(
                                  order.landmark
                              )
                            : ""
                    }

                    <br>

                    ${escapeHTML(
                        order.city ||
                        ""
                    )}

                    ,

                    ${escapeHTML(
                        order.state ||
                        ""
                    )}

                    -

                    ${escapeHTML(
                        order.pincode ||
                        ""
                    )}

                    <br>

                    ${escapeHTML(
                        order.country ||
                        "India"
                    )}

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
                    ${formatPrice(
                        order.total
                    )}

                </div>


                <p>

                    <strong>
                        Payment:
                    </strong>

                    <span
                        class="${paymentClass}"
                    >

                        ${escapeHTML(
                            order.paymentStatus ||
                            "UNKNOWN"
                        )}

                    </span>

                </p>


                <p>

                    <strong>
                        Method:
                    </strong>

                    ${escapeHTML(
                        order.paymentMethod ||
                        "—"
                    )}

                </p>


                ${
                    order.trackingNumber
                        ? `
                            <p>

                                <strong>
                                    Tracking ID:
                                </strong>

                                ${escapeHTML(
                                    order.trackingNumber
                                )}

                            </p>
                        `
                        : ""
                }

            </section>


            <!-- ACTIONS -->

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
    // ACCEPT BUTTON
    // =================================================

    const acceptButton =
        card.querySelector(
            '[data-action="accept"]'
        );

    acceptButton?.addEventListener(
        "click",
        () => {

            openAcceptModal(
                order
            );
        }
    );


    // =================================================
    // CANCEL BUTTON
    // =================================================

    const cancelButton =
        card.querySelector(
            '[data-action="cancel"]'
        );

    cancelButton?.addEventListener(
        "click",
        () => {

            openCancelModal(
                order
            );
        }
    );


    // =================================================
    // SHIPPING UPDATE
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

                try {

                    saveButton.disabled =
                        true;

                    saveButton.textContent =
                        "Saving...";


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

                catch (error) {

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

        if (!selectedOrder) {
            return;
        }

        const courier =
            acceptCourier?.value.trim() ||
            "";

        const trackingNumber =
            acceptTracking?.value.trim() ||
            "";


        if (!courier) {

            alert(
                "Courier name enter karo."
            );

            acceptCourier?.focus();

            return;
        }


        if (!trackingNumber) {

            alert(
                "Tracking ID enter karo."
            );

            acceptTracking?.focus();

            return;
        }


        try {

            acceptConfirmBtn.disabled =
                true;

            acceptConfirmBtn.textContent =
                "Confirming...";


            const trackingUrl =
                TRACK_BASE_URL +
                encodeURIComponent(
                    selectedOrder.orderId
                );


            const orderForMessage = {

                ...selectedOrder,

                courier:
                    courier,

                trackingNumber:
                    trackingNumber
            };


            const message =
                makeConfirmationMessage(
                    orderForMessage,
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

                    courier:
                        courier,

                    trackingNumber:
                        trackingNumber,

                    trackingUrl:
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

        catch (error) {

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

        if (!selectedOrder) {
            return;
        }

        const reason =
            cancelReason?.value.trim() ||
            "";


        if (!reason) {

            alert(
                "Cancellation reason enter karo."
            );

            cancelReason?.focus();

            return;
        }


        try {

            cancelConfirmBtn.disabled =
                true;

            cancelConfirmBtn.textContent =
                "Cancelling...";


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

        catch (error) {

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

        if (!user) {

            alert(
                "Please login as admin."
            );

            window.location.href =
                "login.html";

            return;
        }


        if (
            !isAdmin(user)
        ) {

            alert(
                "Access denied. Admin account required."
            );

            window.location.href =
                "index.html";

            return;
        }


        // Orders load
        await loadOrders();

        // Stock products load
        await loadProducts();

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

        catch (error) {

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
