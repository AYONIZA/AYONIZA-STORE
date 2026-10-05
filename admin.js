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
// CHECK ADMIN
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
// ACCEPT MODAL
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
// CANCEL MODAL
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


let selectedOrder = null;


// =====================================================
// HELPERS
// =====================================================

function formatDate(timestamp) {

    if (!timestamp) {
        return "—";
    }

    try {

        return timestamp
            .toDate()
            .toLocaleString(
                "en-IN"
            );

    } catch {

        return "—";

    }
}


function formatPrice(amount) {

    return (
        "₹" +
        Number(amount || 0)
            .toLocaleString("en-IN")
    );

}


function escapeHTML(value) {

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


function getPaymentClass(
    status
) {

    return status === "VERIFIED"
        ? "payment-status verified"
        : "payment-status pending";

}


// =====================================================
// MODALS
// =====================================================

function openAcceptModal(order) {

    selectedOrder =
        order;

    acceptOrderLabel.textContent =
        `Order: ${order.orderId}`;

    acceptCourier.value =
        order.courier || "";

    acceptTracking.value =
        order.trackingNumber || "";

    acceptModal.classList.add(
        "show"
    );

}


function closeAcceptModal() {

    selectedOrder =
        null;

    acceptModal.classList.remove(
        "show"
    );

}


function openCancelModal(order) {

    selectedOrder =
        order;

    cancelOrderLabel.textContent =
        `Order: ${order.orderId}`;

    cancelReason.value =
        "";

    cancelModal.classList.add(
        "show"
    );

}


function closeCancelModal() {

    selectedOrder =
        null;

    cancelModal.classList.remove(
        "show"
    );

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

        `Hi ${order.customerName || "Customer"},\n\n` +

        `Your order ${order.orderId} has been confirmed.\n\n` +

        `Amount: ${formatPrice(order.total)}\n` +

        `Tracking ID: ${order.trackingNumber}\n` +

        `Courier: ${order.courier}\n\n` +

        `Track your order:\n` +

        trackingUrl +

        `\n\nThank you for shopping with AYONIZA.`
    );

}


function makeCancellationMessage(
    order,
    reason
) {

    return (

        `AYONIZA Order Update\n\n` +

        `Hi ${order.customerName || "Customer"},\n\n` +

        `Your order ${order.orderId} has been cancelled.\n\n` +

        `Reason: ${reason}\n\n` +

        `For help, please contact AYONIZA support.`
    );

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


        orders.sort(
            (a, b) => {

                const aTime =
                    a.createdAt?.toMillis?.() || 0;

                const bTime =
                    b.createdAt?.toMillis?.() || 0;

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

            ordersContainer.innerHTML =
                `
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

        ordersContainer.innerHTML =
            `
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
    // ITEMS
    // =================================================

    const itemsHTML =
        Array.isArray(order.items)

            ? order.items.map(
                (item) => `

                    <div class="item">

                        <img
                            src="${escapeHTML(
                                item.image || ""
                            )}"
                            alt="${escapeHTML(
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
                                    item.quantity || 1
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
            ).join("")

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
    // ACCEPTED / SHIPPING STATUS
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
                )
                .join("");


        actionHTML = `

            <div class="shipping-box">

                <select
                    class="status-select"
                    data-field="status"
                >

                    <option
                        value="${escapeHTML(
                            order.orderStatus
                        )}"
                        selected
                    >
                        ${escapeHTML(
                            order.orderStatus
                        )}
                    </option>

                    ${options}

                </select>


                <input
                    type="text"
                    class="courier-input"
                    placeholder="Courier name"
                    value="${escapeHTML(
                        order.courier || ""
                    )}"
                >


                <input
                    type="text"
                    class="tracking-input"
                    placeholder="Tracking number"
                    value="${escapeHTML(
                        order.trackingNumber || ""
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
    // TRACKING LINK
    // =================================================

    let trackingHTML =
        "";


    if (
        order.trackingUrl
    ) {

        trackingHTML = `

            <div class="notification-box">

                <strong>
                    Tracking Link
                </strong>

                <a
                    class="tracking-link"
                    href="${escapeHTML(
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
    // LAST NOTIFICATION
    // =================================================

    let notificationHTML =
        "";


    if (
        order.notificationMessage
    ) {

        notificationHTML = `

            <div class="notification-box">

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
                    <strong>Name:</strong>
                    ${escapeHTML(
                        order.customerName ||
                        "—"
                    )}
                </p>

                <p>
                    <strong>Email:</strong>
                    ${escapeHTML(
                        order.email ||
                        "—"
                    )}
                </p>

                <p>
                    <strong>Phone:</strong>
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
    // ACCEPT
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
    // CANCEL
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
                        "Update error:",
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

acceptConfirmBtn.addEventListener(
    "click",
    async () => {

        if (!selectedOrder) {
            return;
        }


        const courier =
            acceptCourier.value.trim();

        const trackingNumber =
            acceptTracking.value.trim();


        if (!courier) {

            alert(
                "Courier name enter karo."
            );

            acceptCourier.focus();

            return;

        }


        if (!trackingNumber) {

            alert(
                "Tracking ID enter karo."
            );

            acceptTracking.focus();

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

cancelConfirmBtn.addEventListener(
    "click",
    async () => {

        if (!selectedOrder) {
            return;
        }


        const reason =
            cancelReason.value.trim();


        if (!reason) {

            alert(
                "Cancellation reason enter karo."
            );

            cancelReason.focus();

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
// MODAL CLOSE BUTTONS
// =====================================================

acceptCloseBtn.addEventListener(
    "click",
    closeAcceptModal
);

cancelCloseBtn.addEventListener(
    "click",
    closeCancelModal
);


acceptModal.addEventListener(
    "click",
    (e) => {

        if (
            e.target ===
            acceptModal
        ) {

            closeAcceptModal();

        }

    }
);


cancelModal.addEventListener(
    "click",
    (e) => {

        if (
            e.target ===
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


        if (!isAdmin(user)) {

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
                "Logout error:",
                error
            );

            alert(
                "Logout failed."
            );

        }

    }
);
