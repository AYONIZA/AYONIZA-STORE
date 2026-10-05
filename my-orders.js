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
    collection,
    query,
    where,
    getDocs
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
// DOM
// =====================================================

const loading =
    document.getElementById(
        "loading"
    );

const loginMessage =
    document.getElementById(
        "loginMessage"
    );

const emptyMessage =
    document.getElementById(
        "emptyMessage"
    );

const errorMessage =
    document.getElementById(
        "errorMessage"
    );

const errorText =
    document.getElementById(
        "errorText"
    );

const ordersList =
    document.getElementById(
        "ordersList"
    );


// =====================================================
// STATUS LABELS
// =====================================================

const STATUS_LABELS = {

    NEW:
        "Order Placed",

    ACCEPTED:
        "Order Confirmed",

    READY_TO_PACK:
        "Ready to Pack",

    PACKED:
        "Packed",

    READY_TO_SHIP:
        "Ready to Ship",

    SHIPPED:
        "Shipped",

    IN_TRANSIT:
        "In Transit",

    DELIVERED:
        "Delivered",

    CANCELLED:
        "Cancelled"

};


// =====================================================
// FORMAT PRICE
// =====================================================

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


// =====================================================
// FORMAT DATE
// =====================================================

function formatDate(
    timestamp
) {

    if (!timestamp) {
        return "Date unavailable";
    }


    try {

        return timestamp
            .toDate()
            .toLocaleString(
                "en-IN",
                {
                    day:
                        "2-digit",

                    month:
                        "short",

                    year:
                        "numeric",

                    hour:
                        "2-digit",

                    minute:
                        "2-digit"

                }
            );

    } catch {

        return "Date unavailable";

    }

}


// =====================================================
// ESCAPE HTML
// =====================================================

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


// =====================================================
// RENDER ITEMS
// =====================================================

function renderItems(
    items
) {

    if (
        !Array.isArray(items) ||
        items.length === 0
    ) {

        return `
            <div class="item-meta">
                No product information available.
            </div>
        `;

    }


    return items.map(
        (item) => {

            const quantity =
                Number(
                    item.quantity || 1
                );


            const price =
                Number(
                    item.price || 0
                );


            const lineTotal =
                Number(
                    item.lineTotal ||
                    (
                        price *
                        quantity
                    )
                );


            return `

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
                            ${quantity}

                            &nbsp; | &nbsp;

                            Price:
                            ${formatPrice(price)}

                            <br>

                            Item Total:
                            ${formatPrice(
                                lineTotal
                            )}

                        </div>

                    </div>

                </div>

            `;

        }
    ).join("");

}


// =====================================================
// RENDER ONE ORDER
// =====================================================

function renderOrder(
    order,
    firestoreDocId
) {

    const status =
        order.orderStatus ||
        "NEW";


    const statusLabel =
        STATUS_LABELS[status] ||
        status;


    let trackButton =
        "";


    /*
     * New orders use AYZ orderNumber
     * as Firestore document ID.
     *
     * Old test orders may still have
     * random Firestore document IDs.
     */

    if (
        order.trackingUrl
    ) {

        trackButton = `

            <a
                class="btn btn-primary"
                href="${escapeHTML(
                    order.trackingUrl
                )}"
            >
                Track Order
            </a>

        `;

    } else if (
        order.orderId ===
        firestoreDocId
    ) {

        trackButton = `

            <a
                class="btn btn-primary"
                href="track-order.html?orderId=${encodeURIComponent(
                    order.orderId
                )}"
            >
                Track Order
            </a>

        `;

    } else {

        trackButton = `

            <span class="unavailable">
                Tracking link will be available
                after order confirmation.
            </span>

        `;

    }


    const card =
        document.createElement(
            "article"
        );


    card.className =
        "order-card";


    card.innerHTML = `

        <div class="order-head">

            <div>

                <div class="order-id">
                    ${escapeHTML(
                        order.orderId ||
                        firestoreDocId
                    )}
                </div>

                <div class="order-date">
                    ${formatDate(
                        order.createdAt
                    )}
                </div>

            </div>


            <div class="status-badge">

                ${escapeHTML(
                    statusLabel
                )}

            </div>

        </div>


        <div class="order-body">


            <div class="items">

                ${renderItems(
                    order.items
                )}

            </div>


            <div class="order-footer">

                <div>

                    <div class="amount">

                        ${formatPrice(
                            order.total
                        )}

                    </div>


                    <div class="payment">

                        Payment:

                        <strong>
                            ${escapeHTML(
                                order.paymentStatus ||
                                "Unknown"
                            )}
                        </strong>

                    </div>

                </div>


                <div class="actions">

                    ${trackButton}

                </div>

            </div>


            ${
                status === "CANCELLED"

                    ? `
                        <div
                            class="message"
                            style="
                                margin-top:18px;
                                color:#9f1c14;
                                background:#fff1f0;
                            "
                        >

                            <strong>
                                Order Cancelled
                            </strong>

                            <br><br>

                            Reason:

                            ${escapeHTML(
                                order.cancelReason ||
                                "Not provided"
                            )}

                        </div>
                    `

                    : ""
            }


        </div>

    `;


    return card;

}


// =====================================================
// LOAD CUSTOMER ORDERS
// =====================================================

async function loadOrders(
    user
) {

    loading.hidden =
        false;


    loginMessage.hidden =
        true;


    emptyMessage.hidden =
        true;


    errorMessage.hidden =
        true;


    ordersList.hidden =
        true;


    ordersList.innerHTML =
        "";


    try {

        /*
         * IMPORTANT:
         *
         * We filter using userId so the
         * customer receives ONLY their
         * own orders.
         */

        const ordersQuery =
            query(
                collection(
                    db,
                    "orders"
                ),
                where(
                    "userId",
                    "==",
                    user.uid
                )
            );


        const snapshot =
            await getDocs(
                ordersQuery
            );


        const orders =
            snapshot.docs.map(
                (item) => ({

                    firestoreDocId:
                        item.id,

                    ...item.data()

                })
            );


        /*
         * Sort latest order first.
         * We do this in JavaScript so we
         * don't need a Firestore composite
         * index for this page.
         */

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


        loading.hidden =
            true;


        if (
            orders.length === 0
        ) {

            emptyMessage.hidden =
                false;

            return;

        }


        orders.forEach(
            (order) => {

                ordersList.appendChild(
                    renderOrder(
                        order,
                        order.firestoreDocId
                    )
                );

            }
        );


        ordersList.hidden =
            false;

    }

    catch (error) {

        console.error(
            "My orders error:",
            error
        );


        loading.hidden =
            true;


        errorMessage.hidden =
            false;


        errorText.textContent =
            error.message ||
            "Unable to load your orders.";

    }

}


// =====================================================
// AUTH
// =====================================================

onAuthStateChanged(
    auth,
    (user) => {

        if (!user) {

            loading.hidden =
                true;

            ordersList.hidden =
                true;

            emptyMessage.hidden =
                true;

            errorMessage.hidden =
                true;

            loginMessage.hidden =
                false;

            return;

        }


        loadOrders(
            user
        );

    }
);
