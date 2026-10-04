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
    updateDoc,
    doc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import { firebaseConfig } from "./firebase-config.js";


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
//
// YAHAN APNE DONO ADMIN UID PASTE KARO
//

const ADMIN_UIDS = [
    "ADMIN_UID_1",
    "ADMIN_UID_2"
];


// =====================================================
// CHECK ADMIN
// =====================================================

function isAdmin(user) {

    return (
        user &&
        ADMIN_UIDS.includes(user.uid)
    );

}


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
// STATUS OPTIONS
// =====================================================

const ORDER_STATUSES = [

    "NEW",

    "ACCEPTED",

    "READY_TO_PACK",

    "PACKED",

    "READY_TO_SHIP",

    "SHIPPED",

    "IN_TRANSIT",

    "DELIVERED"

];


// =====================================================
// FORMAT DATE
// =====================================================

function formatDate(timestamp) {

    if (!timestamp) {
        return "—";
    }

    try {

        const date =
            timestamp.toDate();

        return date.toLocaleString(
            "en-IN"
        );

    } catch {

        return "—";

    }

}


// =====================================================
// FORMAT PRICE
// =====================================================

function formatPrice(amount) {

    return (
        "₹" +
        Number(amount || 0)
            .toLocaleString("en-IN")
    );

}


// =====================================================
// PAYMENT STATUS CLASS
// =====================================================

function getPaymentClass(status) {

    if (
        status ===
        "VERIFIED"
    ) {

        return "payment-status verified";

    }

    return "payment-status pending";

}


// =====================================================
// LOAD ORDERS
// =====================================================

async function loadOrders() {

    try {

        loading.hidden =
            false;

        ordersContainer.innerHTML =
            "";


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


        // Sort latest first
        orders.sort(
            (a, b) => {

                const aTime =
                    a.createdAt?.toMillis?.() ||
                    0;

                const bTime =
                    b.createdAt?.toMillis?.() ||
                    0;

                return bTime - aTime;

            }
        );


        // =================================================
        // STATS
        // =================================================

        totalOrders.textContent =
            orders.length;


        newOrders.textContent =
            orders.filter(
                (order) =>
                    order.orderStatus ===
                    "NEW"
            ).length;


        shippedOrders.textContent =
            orders.filter(
                (order) =>
                    order.orderStatus ===
                    "SHIPPED"
            ).length;


        deliveredOrders.textContent =
            orders.filter(
                (order) =>
                    order.orderStatus ===
                    "DELIVERED"
            ).length;


        // =================================================
        // EMPTY
        // =================================================

        if (
            orders.length === 0
        ) {

            ordersContainer.innerHTML = `
                <div class="empty">
                    No orders found.
                </div>
            `;

            return;

        }


        // =================================================
        // RENDER
        // =================================================

        orders.forEach(
            (order) => {

                ordersContainer.appendChild(
                    createOrderCard(
                        order
                    )
                );

            }
        );

    }

    catch (error) {

        console.error(
            "Order loading error:",
            error
        );


        ordersContainer.innerHTML = `
            <div class="empty">
                <strong>Orders load nahi ho paaye.</strong>
                <br><br>
                ${error.message}
            </div>
        `;

    }

    finally {

        loading.hidden =
            true;

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
    // ITEMS HTML
    // =================================================

    const itemsHTML =
        Array.isArray(order.items)

            ? order.items.map(
                (item) => `

                    <div class="item">

                        <img
                            src="${item.image || ""}"
                            alt="${item.productName || "Product"}"
                        >

                        <div class="item-info">

                            <div class="item-name">
                                ${item.productName || "Product"}
                            </div>

                            <div class="item-meta">
                                Qty: ${item.quantity || 1}
                                |
                                Price:
                                ${formatPrice(item.price)}
                            </div>

                            <div class="item-meta">
                                Total:
                                ${formatPrice(item.lineTotal)}
                            </div>

                        </div>

                    </div>

                `
            ).join("")

            : "";


    // =================================================
    // STATUS OPTIONS
    // =================================================

    const statusOptions =
        ORDER_STATUSES.map(
            (status) => `

                <option
                    value="${status}"
                    ${
                        order.orderStatus === status
                            ? "selected"
                            : ""
                    }
                >
                    ${status}
                </option>

            `
        ).join("");


    const paymentClass =
        getPaymentClass(
            order.paymentStatus
        );


    // =================================================
    // CARD HTML
    // =================================================

    card.innerHTML = `

        <div class="order-header">

            <div>

                <div class="order-id">
                    ${order.orderId || "No Order ID"}
                </div>

                <div class="order-date">
                    ${formatDate(order.createdAt)}
                </div>

            </div>


            <div>

                <select
                    class="status-select"
                    data-field="status"
                >

                    ${statusOptions}

                </select>

            </div>

        </div>


        <div class="order-grid">

            <!-- CUSTOMER -->

            <section class="section">

                <h3>Customer</h3>

                <p>
                    <strong>Name:</strong>
                    ${order.customerName || "—"}
                </p>

                <p>
                    <strong>Email:</strong>
                    ${order.email || "—"}
                </p>

                <p>
                    <strong>Phone:</strong>
                    ${order.phone || "—"}
                </p>

                <h3>Delivery Address</h3>

                <p>
                    ${order.address || "—"}
                    ${order.landmark
                        ? "<br>" + order.landmark
                        : ""
                    }
                    <br>
                    ${order.city || ""}
                    ,
                    ${order.state || ""}
                    -
                    ${order.pincode || ""}
                    <br>
                    ${order.country || "India"}
                </p>

            </section>


            <!-- ORDER -->

            <section class="section">

                <h3>Order</h3>

                <div class="items">
                    ${itemsHTML}
                </div>

                <div class="amount-box">

                    Total:
                    ${formatPrice(order.total)}

                </div>

                <p>

                    <strong>
                        Payment:
                    </strong>

                    <span
                        class="${paymentClass}"
                    >
                        ${
                            order.paymentStatus ||
                            "UNKNOWN"
                        }
                    </span>

                </p>

                <p>

                    <strong>
                        Method:
                    </strong>

                    ${
                        order.paymentMethod ||
                        "—"
                    }

                </p>

            </section>


            <!-- SHIPPING -->

            <section class="section">

                <h3>Shipping</h3>

                <div class="shipping-box">

                    <input
                        type="text"
                        class="courier-input"
                        placeholder="Courier name"
                        value="${
                            order.courier || ""
                        }"
                    >

                    <input
                        type="text"
                        class="tracking-input"
                        placeholder="Tracking number"
                        value="${
                            order.trackingNumber || ""
                        }"
                    >

                    <button
                        class="save-btn"
                        data-action="save"
                    >
                        Save Order Update
                    </button>

                </div>

            </section>

        </div>

    `;


    // =================================================
    // SAVE UPDATE
    // =================================================

    const saveBtn =
        card.querySelector(
            '[data-action="save"]'
        );

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


    saveBtn.addEventListener(
        "click",
        async () => {

            try {

                saveBtn.disabled =
                    true;

                saveBtn.textContent =
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
                            new Date()

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

                saveBtn.disabled =
                    false;

                saveBtn.textContent =
                    "Save Order Update";

            }

        }
    );


    return card;

}


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


        await loadOrders();

    }
);


// =====================================================
// LOGOUT
// =====================================================

logoutBtn.addEventListener(
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
                error
            );

            alert(
                "Logout failed."
            );

        }

    }
);
