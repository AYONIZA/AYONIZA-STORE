// =====================================================
// AYONIZA — ORDER MANAGEMENT
// Flow: NEW -> PACKED -> SHIPMENT_CREATED
//       -> PICKED_UP -> IN_TRANSIT -> DELIVERED
//       CANCELLED + Razorpay refund
// =====================================================

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
    getDocs,
    getDoc,
    updateDoc,
    doc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import { firebaseConfig } from "./firebase-config.js";

// ---------------- CONFIG ----------------

const app = getApps().length
    ? getApps()[0]
    : initializeApp(firebaseConfig);

const auth = getAuth(app);
const db = getFirestore(app);

const ADMIN_UIDS = [
    "t8lcx1r7jdSXowv4EPgxJA8FXKn1",
    "ZWCoYQo4EwN6T58bYcxbw27KN4D3"
];

const WORKER =
    "https://ayoniza-payment.ayoniza-support.workers.dev";

const WAREHOUSE_ID = "347486";

const TRACK_BASE_URL =
    "https://ayoniza.shop/track-order.html?orderId=";

const PAID_STATUSES = [
    "PAID",
    "SUCCESS",
    "VERIFIED"
];

const DEFAULT_PARCEL = {
    weightKg: 0.2,
    lengthCm: 20,
    widthCm: 15,
    heightCm: 5
};

const CANCEL_REASONS = [
    "Out of stock",
    "Unable to fulfil order",
    "Customer requested cancellation",
    "Payment issue",
    "Address not serviceable",
    "Other"
];

const STATUS_RANK = {
    SHIPMENT_CREATED: 1,
    PICKED_UP: 2,
    IN_TRANSIT: 3,
    DELIVERED: 4
};

const ordersContainer =
    document.getElementById("ordersContainer");

const loadingEl =
    document.getElementById("loading");

const orderMap = new Map();

let currentOrder = null;
let isAdminAuthenticated = false;

// ---------------- HELPERS ----------------

const $ = (id) => document.getElementById(id);

const esc = (value) =>
    String(value ?? "").replace(/[&<>"']/g, (char) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    }[char]));

const money = (value) =>
    "₹" + Number(value || 0).toLocaleString("en-IN");

function fmtDate(timestamp) {
    try {
        if (!timestamp) return "—";

        if (typeof timestamp.toDate === "function") {
            return timestamp.toDate().toLocaleString("en-IN");
        }

        const date = new Date(timestamp);

        return Number.isNaN(date.getTime())
            ? "—"
            : date.toLocaleString("en-IN");
    } catch {
        return "—";
    }
}

function isPaid(order) {
    return PAID_STATUSES.includes(
        String(order.paymentStatus || "").trim().toUpperCase()
    );
}

function stageOf(order) {
    const status = String(
        order.orderStatus || "NEW"
    ).trim().toUpperCase();

    if (status === "CANCELLED") return "CANCELLED";
    if (status === "DELIVERED") return "DELIVERED";
    if (status === "IN_TRANSIT") return "IN_TRANSIT";

    if (status === "PICKED_UP") return "PICKED_UP";

    if (status === "SHIPMENT_CREATED") {
        return "SHIPMENT_CREATED";
    }

    // Older orders may use SHIPPED or ACCEPTED.
    if (status === "SHIPPED") {
        return order.awb || order.trackingNumber
            ? "SHIPMENT_CREATED"
            : "ACCEPTED";
    }

    if (order.awb || order.trackingNumber) {
        return "SHIPMENT_CREATED";
    }

    if (order.parcel) {
        return "PACKED";
    }

    if (status === "PACKED" || status === "READY_TO_SHIP") {
        return order.parcel ? "PACKED" : "ACCEPTED";
    }

    if (status === "ACCEPTED" || status === "READY_TO_PACK") {
        return "ACCEPTED";
    }

    if (status === "NEW" || !order.orderStatus) {
        return "NEW";
    }

    return "NEW";
}

function showError(message) {
    alert(String(message || "Kuch galat hua."));
}

async function busy(button, text, callback) {
    const originalText = button.textContent;

    button.disabled = true;
    button.textContent = text;

    try {
        return await callback();
    } finally {
        button.disabled = false;
        button.textContent = originalText;
    }
}

async function freshOrder(order) {
    const snapshot = await getDoc(
        doc(db, "orders", order.firebaseId)
    );

    if (!snapshot.exists()) {
        throw new Error("Order Firestore mein nahi mila.");
    }

    return {
        firebaseId: snapshot.id,
        ...snapshot.data()
    };
}

async function patchOrder(order, fields) {
    await updateDoc(
        doc(db, "orders", order.firebaseId),
        {
            ...fields,
            updatedAt: serverTimestamp()
        }
    );
}

async function adminFetch(path, body = {}, method = "POST") {
    const user = auth.currentUser;

    if (!user) {
        throw new Error("Admin login expire ho gaya. Dobara login karein.");
    }

    if (!isAdminAuthenticated || !ADMIN_UIDS.includes(user.uid)) {
        throw new Error("Aapko admin access nahi hai.");
    }

    const token = await user.getIdToken();

    const options = {
        method,
        headers: {
            Authorization: `Bearer ${token}`
        }
    };

    if (method !== "GET") {
        options.headers["Content-Type"] = "application/json";
        options.body = JSON.stringify(body || {});
    }

    const response = await fetch(WORKER + path, options);

    const data = await response.json().catch(() => ({}));

    if (!response.ok || data.success === false) {
        throw new Error(
            data.message ||
            data.error ||
            `Worker request fail hui (HTTP ${response.status}).`
        );
    }

    return data;
}

// ---------------- STYLES AND MODALS ----------------

document.head.insertAdjacentHTML("beforeend", `
<style>
.ord-btn {
    border: 0;
    padding: 10px 14px;
    border-radius: 8px;
    cursor: pointer;
    font-weight: 600;
    background: #f1f1f1;
    color: #222;
    margin: 3px;
}
.ord-btn.primary {
    background: #111;
    color: #fff;
}
.ord-btn:disabled {
    opacity: .55;
    cursor: not-allowed;
}
.ord-warn {
    margin: 10px 0;
    padding: 10px 12px;
    border-radius: 8px;
    background: #fff2cc;
    color: #8a6200;
    font-size: 13px;
}
.ord-info {
    margin: 10px 0;
    padding: 10px 12px;
    border-radius: 8px;
    background: #f8f3f5;
    border: 1px solid #eadde2;
    font-size: 13px;
    line-height: 1.7;
    overflow-wrap: anywhere;
}
.ord-pill {
    display: inline-block;
    padding: 4px 9px;
    border-radius: 999px;
    font-size: 12px;
    font-weight: 700;
    background: #f2f2f2;
}
.ord-pill.ok {
    background: #d9f7df;
    color: #1c6b2b;
}
.ord-pill.wait {
    background: #fff2cc;
    color: #8a6200;
}
.ord-pill.bad {
    background: #fde4e1;
    color: #b42318;
}
.ord-grid2 {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
}
#dimModal label,
#cxlModal label {
    display: block;
    margin: 12px 0;
}
#dimModal input,
#cxlModal textarea,
#cxlModal select,
#dimModal select {
    box-sizing: border-box;
    width: 100%;
    margin-top: 6px;
    padding: 10px;
    border: 1px solid #ccc;
    border-radius: 7px;
    font: inherit;
}
@media(max-width:600px) {
    .ord-grid2 {
        grid-template-columns: 1fr;
    }
}
</style>
`);

document.body.insertAdjacentHTML("beforeend", `
<div class="modal-backdrop" id="dimModal">
  <div class="modal">
    <h2>Parcel Dimensions</h2>
    <p id="dimOrderLabel"></p>

    <div class="ord-grid2">
      <label>Weight (kg)
        <input id="dimWeight" type="number" min="0.01" step="0.01">
      </label>
      <label>Length (cm)
        <input id="dimLength" type="number" min="1" step="0.1">
      </label>
      <label>Width (cm)
        <input id="dimWidth" type="number" min="1" step="0.1">
      </label>
      <label>Height (cm)
        <input id="dimHeight" type="number" min="1" step="0.1">
      </label>
    </div>

    <label>Shipping mode
      <select id="dimExpress">
        <option value="surface">Surface</option>
        <option value="air">Air</option>
      </select>
    </label>

    <div class="modal-actions">
      <button type="button" class="modal-close" id="dimCloseBtn">Close</button>
      <button type="button" class="modal-confirm" id="dimSaveBtn">Save Dimensions</button>
    </div>
  </div>
</div>

<div class="modal-backdrop" id="cxlModal">
  <div class="modal">
    <h2>Cancel Order</h2>
    <p id="cxlOrderLabel"></p>
    <div id="cxlRefundNote" class="ord-info"></div>

    <label>Reason
      <select id="cxlReasonSelect">
        ${CANCEL_REASONS.map((reason) =>
            `<option value="${esc(reason)}">${esc(reason)}</option>`
        ).join("")}
      </select>
    </label>

    <label>Note (optional)
      <textarea id="cxlNote" placeholder="Extra details"></textarea>
    </label>

    <div class="modal-actions">
      <button type="button" class="modal-close" id="cxlCloseBtn">Back</button>
      <button type="button" class="modal-confirm" id="cxlConfirmBtn">Confirm Cancel</button>
    </div>
  </div>
</div>
`);

function closeDim() {
    currentOrder = null;
    $("dimModal").classList.remove("show");
}

function closeCancel() {
    currentOrder = null;
    $("cxlModal").classList.remove("show");
}

$("dimCloseBtn").addEventListener("click", closeDim);
$("cxlCloseBtn").addEventListener("click", closeCancel);

$("dimModal").addEventListener("click", (event) => {
    if (event.target === $("dimModal")) closeDim();
});

$("cxlModal").addEventListener("click", (event) => {
    if (event.target === $("cxlModal")) closeCancel();
});

// ---------------- CUSTOMER MESSAGES ----------------

function confirmMessage(order, awb) {
    return `AYONIZA Order Confirmed

Hi ${order.customerName || "Customer"},

Your order ${order.orderId || order.firebaseId} has been confirmed.

Amount: ${money(order.total)}
Tracking ID: ${awb}
Courier: FShip

Track your order:
${TRACK_BASE_URL + encodeURIComponent(order.orderId || order.firebaseId)}

Thank you for shopping with AYONIZA.`;
}

function cancelMessage(order, reason, refundStatus) {
    let refundLine = "";

    if (isPaid(order)) {
        if (refundStatus === "FAILED") {
            refundLine = "\n\nYour refund could not be processed automatically. Our team will review it.";
        } else {
            refundLine = "\n\nYour refund status: " + (refundStatus || "PENDING") +
                ". Please allow your payment provider time to process it.";
        }
    }

    return `AYONIZA Order Update

Hi ${order.customerName || "Customer"},

Your order ${order.orderId || order.firebaseId} has been cancelled.

Reason: ${reason}${refundLine}

Thank you for your understanding.`;
}

// ---------------- ORDER ACTIONS ----------------

function pickupPill(order) {
    const status = order.pickupStatus || "NOT_REQUESTED";

    const labels = {
        NOT_REQUESTED: ["Not requested", "wait"],
        REQUESTED: ["Requested", "wait"],
        SCHEDULED: ["Scheduled", "ok"],
        PICKED_UP: ["Picked up", "ok"]
    };

    const [label, css] = labels[status] || [status, ""];

    return `<span class="ord-pill ${css}">${esc(label)}</span>`;
}

function refundBlock(order) {
    const status = order.refundStatus || (isPaid(order) ? "PENDING" : "NONE");

    const labels = {
        NONE: ["No refund needed", ""],
        PENDING: ["Pending", "wait"],
        PROCESSING: ["Processing", "wait"],
        REFUNDED: ["Refunded", "ok"],
        FAILED: ["Failed", "bad"]
    };

    const [label, css] = labels[status] || [status, ""];

    let html = `
      <div class="ord-info">
        <strong>Cancel reason:</strong> ${esc(order.cancelReason || "—")}<br>
        <strong>Refund:</strong>
        <span class="ord-pill ${css}">${esc(label)}</span>
    `;

    if (order.razorpayRefundId) {
        html += `<br><strong>Refund ID:</strong> ${esc(order.razorpayRefundId)}`;
    }

    if (order.refundError) {
        html += `<br><span style="color:#b42318">${esc(order.refundError)}</span>`;
    }

    html += `</div>`;

    if (isPaid(order)) {
        if (status === "FAILED" || status === "PENDING") {
            html += `
              <button class="ord-btn primary" data-action="retryrefund">
                Retry Refund
              </button>`;
        } else if (status === "PROCESSING") {
            html += `
              <button class="ord-btn" data-action="refundstatus">
                Check Refund Status
              </button>`;
        }
    }

    return html;
}

function actionsFor(order, stage) {
    const paid = isPaid(order);
    const awb = order.awb || order.trackingNumber;

    const awbBox = awb ? `
      <div class="ord-info">
        <strong>AWB:</strong> ${esc(awb)}
        (${esc(order.courier || "FShip")})<br>
        <strong>Pickup:</strong> ${pickupPill(order)}
        ${order.lastTrackingStatus
            ? `<br><strong>Last tracking:</strong> ${esc(order.lastTrackingStatus)}`
            : ""}
      </div>` : "";

    const parcelBox = order.parcel ? `
      <div class="ord-info">
        <strong>Parcel:</strong>
        ${esc(order.parcel.weightKg)} kg |
        ${esc(order.parcel.lengthCm)} ×
        ${esc(order.parcel.widthCm)} ×
        ${esc(order.parcel.heightCm)} cm |
        ${esc(order.expressType || "surface")}
      </div>` : "";

    switch (stage) {
        case "NEW":
            return `
              ${!paid ? `
                <div class="ord-warn">
                  Payment ${esc(order.paymentStatus || "PENDING")} hai.
                  Payment verify hone tak order accept nahi kar sakte.
                </div>` : ""}
              <div class="admin-actions">
                <button class="accept-btn" data-action="accept" ${paid ? "" : "disabled"}>
                  Accept Order
                </button>
                <button class="cancel-btn" data-action="cancel">Cancel Order</button>
              </div>`;

        case "ACCEPTED":
            return `
              <div class="admin-actions">
                <button class="ord-btn primary" data-action="editdims">
                  Enter Parcel Dimensions
                </button>
                <button class="cancel-btn" data-action="cancel">Cancel Order</button>
              </div>`;

        case "PACKED":
            return `
              ${parcelBox}
              <div class="admin-actions">
                <button class="ord-btn primary" data-action="ship">Create FShip Shipment</button>
                <button class="ord-btn" data-action="editdims">Edit Dimensions</button>
                <button class="cancel-btn" data-action="cancel">Cancel Order</button>
              </div>`;

        case "SHIPMENT_CREATED":
            return `
              ${awbBox}
              ${parcelBox}
              <div class="admin-actions">
                <button class="ord-btn primary" data-action="label">Print Label</button>
                <button class="ord-btn" data-action="pickup"
                  ${["REQUESTED", "SCHEDULED", "PICKED_UP"].includes(order.pickupStatus)
                    ? "disabled" : ""}>
                  Request Pickup
                </button>
                <button class="ord-btn" data-action="track">Check Tracking</button>
                <button class="ord-btn" data-action="markpicked">Mark Picked Up</button>
                <button class="cancel-btn" data-action="cancel">Cancel Order</button>
              </div>`;

        case "PICKED_UP":
            return `
              ${awbBox}
              <div class="admin-actions">
                <button class="ord-btn" data-action="label">Print Label</button>
                <button class="ord-btn" data-action="track">Check Tracking</button>
                <button class="ord-btn" data-action="markintransit">Mark In Transit</button>
                <button class="ord-btn" data-action="markdelivered">Mark Delivered</button>
              </div>`;

        case "IN_TRANSIT":
            return `
              ${awbBox}
              <div class="admin-actions">
                <button class="ord-btn" data-action="track">Check Tracking</button>
                <button class="ord-btn" data-action="markdelivered">Mark Delivered</button>
              </div>`;

        case "DELIVERED":
            return awbBox;

        case "CANCELLED":
            return refundBlock(order);

        default:
            return `<div class="ord-info">Status: ${esc(stage)}</div>`;
    }
}

// ---------------- RENDER ORDER CARD ----------------

function createOrderCard(order) {
    const stage = stageOf(order);

    const card = document.createElement("article");
    card.className = "order-card";
    card.dataset.id = order.firebaseId;

    const items = (
        Array.isArray(order.items) ? order.items : []
    ).map((item) => {
        const quantity = Number(item.quantity || 1);
        const price = Number(item.price || 0);
        const lineTotal = Number(item.lineTotal ?? price * quantity);

        return `
          <div class="item">
            <img src="${esc(item.image || item.imageUrl || "")}"
                 alt="${esc(item.productName || item.name || "Product")}"
                 onerror="this.style.display='none'">
            <div class="item-info">
              <div class="item-name">
                ${esc(item.productName || item.name || "Product")}
              </div>
              <div class="item-meta">
                Qty: ${quantity} | Price: ${money(price)}
              </div>
              <div class="item-meta">Total: ${money(lineTotal)}</div>
            </div>
          </div>`;
    }).join("");

    const paymentClass = isPaid(order)
        ? "payment-status verified"
        : "payment-status pending";

    const orderId = order.orderId || order.firebaseId;

    card.innerHTML = `
      <div class="order-header">
        <div>
          <div class="order-id">${esc(orderId)}</div>
          <div class="order-date">${esc(fmtDate(order.createdAt))}</div>
        </div>
        <div class="order-status">${esc(stage)}</div>
      </div>

      <div class="order-grid">
        <section class="section">
          <h3>Customer</h3>
          <p><strong>Name:</strong> ${esc(order.customerName || order.name || "—")}</p>
          <p><strong>Email:</strong> ${esc(order.email || "—")}</p>
          <p><strong>Phone:</strong> ${esc(order.phone || order.mobile || "—")}</p>

          <h3>Delivery Address</h3>
          <p>
            ${esc(order.address || order.addressLine1 || "—")}
            ${order.addressLine2 ? "<br>" + esc(order.addressLine2) : ""}
            ${order.landmark ? "<br>" + esc(order.landmark) : ""}
            <br>${esc(order.city || "")},
            ${esc(order.state || "")} -
            ${esc(order.pincode || order.pinCode || "")}
            <br>${esc(order.country || "India")}
          </p>
        </section>

        <section class="section">
          <h3>Order Items</h3>
          <div class="items">
            ${items || "<p>No item details found.</p>"}
          </div>

          <div class="amount-box">Total: ${money(order.total ?? order.amount)}</div>

          <p>
            <strong>Payment:</strong>
            <span class="${paymentClass}">${esc(order.paymentStatus || "UNKNOWN")}</span>
          </p>

          <p><strong>Method:</strong> ${esc(order.paymentMethod || "—")}</p>

          ${order.razorpayOrderId
              ? `<p><strong>Razorpay Order:</strong> ${esc(order.razorpayOrderId)}</p>`
              : ""}

          ${order.razorpayPaymentId
              ? `<p><strong>Payment ID:</strong> ${esc(order.razorpayPaymentId)}</p>`
              : ""}
        </section>

        <section class="section" style="grid-column:1/-1">
          <h3>Order Actions</h3>
          ${actionsFor(order, stage)}

          ${order.trackingUrl ? `
            <div class="ord-info">
              <strong>Customer tracking link</strong><br>
              <a href="${esc(order.trackingUrl)}"
                 target="_blank" rel="noopener noreferrer">
                ${esc(order.trackingUrl)}
              </a>
            </div>` : ""}

          ${order.notificationMessage ? `
            <div class="notification-box">
              <strong>Customer Message</strong>
              <div>${esc(order.notificationMessage).replace(/\n/g, "<br>")}</div>
            </div>` : ""}
        </section>
      </div>`;

    return card;
}

// ---------------- LOAD ORDERS ----------------

async function loadOrders() {
    if (!ordersContainer) {
        console.error("HTML element #ordersContainer nahi mila.");
        return;
    }

    try {
        if (loadingEl) loadingEl.hidden = false;

        ordersContainer.innerHTML = "";

        const snapshot = await getDocs(collection(db, "orders"));

        const orders = snapshot.docs
            .map((document) => ({
                firebaseId: document.id,
                ...document.data()
            }))
            .sort((a, b) => {
                const timeA = a.createdAt?.toMillis?.() || 0;
                const timeB = b.createdAt?.toMillis?.() || 0;
                return timeB - timeA;
            });

        orderMap.clear();

        orders.forEach((order) => {
            orderMap.set(order.firebaseId, order);
        });

        const setText = (id, value) => {
            const element = $(id);
            if (element) element.textContent = String(value);
        };

        setText("totalOrders", orders.length);
        setText(
            "newOrders",
            orders.filter((o) => stageOf(o) === "NEW").length
        );
        setText(
            "shippedOrders",
            orders.filter((o) =>
                ["SHIPMENT_CREATED", "PICKED_UP", "IN_TRANSIT"].includes(stageOf(o))
            ).length
        );
        setText(
            "deliveredOrders",
            orders.filter((o) => stageOf(o) === "DELIVERED").length
        );

        if (!orders.length) {
            ordersContainer.innerHTML =
                `<div class="empty">No orders found.</div>`;
            return;
        }

        orders.forEach((order) => {
            ordersContainer.appendChild(createOrderCard(order));
        });

    } catch (error) {
        console.error("Order loading error:", error);

        ordersContainer.innerHTML = `
          <div class="empty">
            <strong>Orders load nahi ho paaye.</strong>
            <br><br>${esc(error.message)}
            <br><br>
            Firestore Rules, admin login aur orders collection check karein.
          </div>`;
    } finally {
        if (loadingEl) loadingEl.hidden = true;
    }
}

// ---------------- ACCEPT + SAVE DIMENSIONS ----------------

function openDimensionsModal(order) {
    currentOrder = order;

    const parcel = {
        ...DEFAULT_PARCEL,
        ...(order.parcel || {})
    };

    $("dimOrderLabel").textContent =
        `Order: ${order.orderId || order.firebaseId}`;

    $("dimWeight").value = parcel.weightKg;
    $("dimLength").value = parcel.lengthCm;
    $("dimWidth").value = parcel.widthCm;
    $("dimHeight").value = parcel.heightCm;
    $("dimExpress").value = order.expressType || "surface";

    $("dimModal").classList.add("show");
}

$("dimSaveBtn").addEventListener("click", async (event) => {
    const order = currentOrder;
    if (!order) return;

    const parcel = {
        weightKg: Number($("dimWeight").value),
        lengthCm: Number($("dimLength").value),
        widthCm: Number($("dimWidth").value),
        heightCm: Number($("dimHeight").value)
    };

    if (Object.values(parcel).some(
        (value) => !Number.isFinite(value) || value <= 0
    )) {
        showError("Weight, length, width aur height 0 se zyada hone chahiye.");
        return;
    }

    try {
        await busy(event.currentTarget, "Saving...", async () => {
            const fresh = await freshOrder(order);

            if (stageOf(fresh) === "CANCELLED") {
                throw new Error("Cancelled order accept nahi ho sakta.");
            }

            if (!isPaid(fresh)) {
                throw new Error("Payment verified nahi hai.");
            }

            if (fresh.awb || fresh.trackingNumber || fresh.fshipOrderId) {
                throw new Error("Shipment already created hai.");
            }

            await patchOrder(order, {
                parcel,
                expressType: $("dimExpress").value,
                orderStatus: "PACKED",
                acceptedAt: fresh.acceptedAt || serverTimestamp()
            });
        });

        closeDim();
        await loadOrders();

    } catch (error) {
        showError("Dimensions save nahi hui:\n" + error.message);
    }
});

// ---------------- CREATE FSHIP SHIPMENT ----------------

async function shipOrder(order, button) {
    await busy(button, "Creating shipment...", async () => {
        const fresh = await freshOrder(order);

        if (stageOf(fresh) === "CANCELLED") {
            throw new Error("Cancelled order ki shipment nahi bana sakte.");
        }

        if (!isPaid(fresh)) {
            throw new Error("Payment verified nahi hai.");
        }

        if (fresh.awb || fresh.trackingNumber || fresh.fshipOrderId) {
            throw new Error("Shipment already created hai. Duplicate request roki gayi.");
        }

        if (!fresh.parcel) {
            throw new Error("Pehle parcel dimensions save karein.");
        }

        const parcel = fresh.parcel;

        const payload = {
            orderId: String(fresh.orderId || fresh.firebaseId).trim(),
            razorpayOrderId: String(fresh.razorpayOrderId || "").trim(),
            razorpayPaymentId: String(fresh.razorpayPaymentId || "").trim(),

            warehouseId: WAREHOUSE_ID,

            customerName: String(
                fresh.customerName || fresh.name || ""
            ).trim(),

            customerPhone: String(
                fresh.phone || fresh.mobile || ""
            ).trim(),

            customerEmail: String(fresh.email || "").trim(),

            addressLine1: String(
                fresh.address || fresh.addressLine1 || ""
            ).trim(),

            addressLine2: String(fresh.addressLine2 || "").trim(),
            landmark: String(fresh.landmark || "").trim(),

            pincode: String(
                fresh.pincode || fresh.pinCode || ""
            ).trim(),

            city: String(fresh.city || "").trim(),
            state: String(fresh.state || "").trim(),
            country: String(fresh.country || "India").trim(),

            amount: Number(fresh.total ?? fresh.amount ?? 0),
            paymentMode: "PREPAID",

            weightKg: parcel.weightKg,
            lengthCm: parcel.lengthCm,
            widthCm: parcel.widthCm,
            heightCm: parcel.heightCm,

            expressType: fresh.expressType || "surface",
            items: Array.isArray(fresh.items) ? fresh.items : []
        };

        const missing = [];

        if (!payload.razorpayOrderId) missing.push("Razorpay Order ID");
        if (!payload.razorpayPaymentId) missing.push("Razorpay Payment ID");
        if (!payload.customerName) missing.push("Customer name");
        if (!payload.customerPhone) missing.push("Phone");
        if (!payload.addressLine1) missing.push("Address");
        if (!/^\d{6}$/.test(payload.pincode)) missing.push("Valid 6-digit pincode");
        if (!payload.city) missing.push("City");
        if (!payload.state) missing.push("State");
        if (!payload.items.length) missing.push("Order items");

        if (missing.length) {
            throw new Error("Missing order details: " + missing.join(", "));
        }

        const response = await adminFetch(
            "/fship/create-shipment",
            payload
        );

        const awb = response.awb || response.awbNumber;

        if (!awb) {
            throw new Error(
                "Worker response mein AWB nahi mila. Worker response check karein."
            );
        }

        const trackingUrl =
            TRACK_BASE_URL +
            encodeURIComponent(fresh.orderId || fresh.firebaseId);

        try {
            await patchOrder(order, {
                orderStatus: "SHIPMENT_CREATED",
                courier: "FShip",
                awb: String(awb),
                trackingNumber: String(awb),
                fshipOrderId: response.fshipOrderId
                    ? String(response.fshipOrderId)
                    : "",
                trackingUrl,
                shippingWarehouseId: WAREHOUSE_ID,
                shippingCreatedAt: serverTimestamp(),
                pickupStatus: "NOT_REQUESTED",
                notificationType: "ORDER_CONFIRMED",
                notificationTitle: "Order Confirmed",
                notificationMessage: confirmMessage(fresh, awb),
                notificationCreatedAt: serverTimestamp(),
                notificationSent: false
            });
        } catch (saveError) {
            alert(
                `IMPORTANT: FShip shipment create ho gayi.\n` +
                `AWB: ${awb}\n\n` +
                `Firestore save fail hua: ${saveError.message}\n\n` +
                `Shipment dobara create na karein. AWB note karke ` +
                `Firestore mein order update karein.`
            );
            throw saveError;
        }
    });

    await loadOrders();
}

// ---------------- PRINT LABEL ----------------

async function printLabel(order, button) {
    const awb = order.awb || order.trackingNumber;

    if (!awb) {
        throw new Error("AWB available nahi hai.");
    }

    // Open immediately to reduce popup-blocker problems.
    const popup = window.open("about:blank", "_blank");

    try {
        await busy(button, "Loading label...", async () => {
            const response = await adminFetch("/fship/label", {
                awb,
                orderId: order.orderId || order.firebaseId,
                fshipOrderId: order.fshipOrderId || ""
            });

            if (response.labelUrl) {
                await patchOrder(order, {
                    labelUrl: response.labelUrl
                });

                if (popup) {
                    popup.location.href = response.labelUrl;
                } else {
                    window.location.href = response.labelUrl;
                }

                return;
            }

            if (response.labelBase64) {
                const binary = atob(response.labelBase64);
                const bytes = Uint8Array.from(
                    binary,
                    (character) => character.charCodeAt(0)
                );

                const url = URL.createObjectURL(
                    new Blob([bytes], { type: "application/pdf" })
                );

                if (popup) {
                    popup.location.href = url;
                } else {
                    window.location.href = url;
                }

                return;
            }

            throw new Error(
                "Worker ne label URL ya PDF data return nahi kiya."
            );
        });
    } catch (error) {
        if (popup && !popup.closed) popup.close();
        throw error;
    }
}

// ---------------- REQUEST PICKUP ----------------

async function requestPickup(order, button) {
    const awb = order.awb || order.trackingNumber;

    if (!awb) {
        throw new Error("AWB available nahi hai.");
    }

    await busy(button, "Requesting pickup...", async () => {
        const fresh = await freshOrder(order);

        if (fresh.pickupStatus === "REQUESTED" ||
            fresh.pickupStatus === "SCHEDULED" ||
            fresh.pickupStatus === "PICKED_UP") {
            throw new Error("Pickup request already submitted hai.");
        }

        const response = await adminFetch("/fship/pickup", {
            awb,
            orderId: fresh.orderId || fresh.firebaseId,
            fshipOrderId: fresh.fshipOrderId || ""
        });

        await patchOrder(order, {
            pickupStatus: "REQUESTED",
            pickupRequestedAt: serverTimestamp(),
            pickupMessage: String(response.message || "")
        });
    });

    await loadOrders();
}

// ---------------- CHECK FSHIP TRACKING ----------------

async function checkTracking(order, button) {
    const awb = order.awb || order.trackingNumber;

    if (!awb) {
        throw new Error("AWB available nahi hai.");
    }

    await busy(button, "Checking tracking...", async () => {
        const response = await adminFetch("/fship/track", {
            awb,
            orderId: order.orderId || order.firebaseId
        });

        const fields = {
            lastTrackingStatus: String(response.trackingStatus || ""),
            lastTrackedAt: serverTimestamp()
        };

        const mapped = String(
            response.mappedStatus || ""
        ).toUpperCase();

        const currentRank = STATUS_RANK[stageOf(order)] || 0;
        const nextRank = STATUS_RANK[mapped] || 0;

        if (nextRank > currentRank) {
            fields.orderStatus = mapped;
            fields.statusSource = "FSHIP_TRACKING";

            if (mapped === "PICKED_UP" ||
                mapped === "IN_TRANSIT" ||
                mapped === "DELIVERED") {
                fields.pickupStatus = "PICKED_UP";
            }
        }

        await patchOrder(order, fields);
    });

    await loadOrders();
}

// ---------------- MANUAL STATUS ----------------

async function manualStatus(order, status, label) {
    const confirmed = confirm(
        `"${label}" manually mark kar rahe hain. ` +
        `Yeh FShip se verify nahi hua. Kya continue karein?`
    );

    if (!confirmed) return;

    await patchOrder(order, {
        orderStatus: status,
        statusSource: "ADMIN_MANUAL",
        ...(status === "PICKED_UP"
            ? { pickupStatus: "PICKED_UP" }
            : {})
    });

    await loadOrders();
}

// ---------------- CANCEL + RAZORPAY REFUND ----------------

function openCancelModal(order) {
    currentOrder = order;

    $("cxlOrderLabel").textContent =
        `Order: ${order.orderId || order.firebaseId}`;

    $("cxlReasonSelect").value = CANCEL_REASONS[0];
    $("cxlNote").value = "";

    const note = $("cxlRefundNote");

    note.hidden = false;

    note.textContent = isPaid(order)
        ? `Paid amount ${money(order.total ?? order.amount)} hai. ` +
          `Cancel karne par refund request bhejne ki koshish hogi. ` +
          `Refund ki final status Razorpay response se confirm karein.`
        : "Payment paid status mein nahi hai. Refund request nahi bheji jayegi.";

    $("cxlModal").classList.add("show");
}

async function startRefund(order) {
    if (!order.razorpayPaymentId) {
        return {
            refundStatus: "FAILED",
            refundError: "Razorpay Payment ID missing hai.",
            refundUpdatedAt: serverTimestamp()
        };
    }

    try {
        const response = await adminFetch("/razorpay/refund", {
            orderId: order.orderId || order.firebaseId,
            razorpayPaymentId: order.razorpayPaymentId,
            razorpayOrderId: order.razorpayOrderId || ""
        });

        return {
            refundStatus: String(
                response.refundStatus || "PROCESSING"
            ).toUpperCase(),

            razorpayRefundId: response.refundId || "",
            refundAmount: Number(response.amountPaise || 0) / 100,
            refundError: "",
            refundUpdatedAt: serverTimestamp()
        };
    } catch (error) {
        return {
            refundStatus: "FAILED",
            refundError: error.message,
            refundUpdatedAt: serverTimestamp()
        };
    }
}

$("cxlConfirmBtn").addEventListener("click", async (event) => {
    const order = currentOrder;
    if (!order) return;

    const baseReason = $("cxlReasonSelect").value;
    const note = $("cxlNote").value.trim();

    const reason = note
        ? `${baseReason} — ${note}`
        : baseReason;

    try {
        await busy(event.currentTarget, "Cancelling...", async () => {
            const fresh = await freshOrder(order);
            const stage = stageOf(fresh);

            if (stage === "CANCELLED") {
                throw new Error("Order pehle se cancelled hai.");
            }

            if (["PICKED_UP", "IN_TRANSIT", "DELIVERED"].includes(stage)) {
                throw new Error(
                    "Parcel dispatch ho chuka hai. Normal cancellation ki jagah " +
                    "FShip return/RTO process check karein."
                );
            }

            let shipmentCancelled = false;
            const awb = fresh.awb || fresh.trackingNumber;

            if (awb) {
                try {
                    await adminFetch("/fship/cancel", {
                        awb,
                        orderId: fresh.orderId || fresh.firebaseId,
                        reason
                    });

                    shipmentCancelled = true;
                } catch (error) {
                    const proceed = confirm(
                        `FShip shipment cancel nahi hui:\n${error.message}\n\n` +
                        `Agar continue karte hain, to FShip panel mein AWB ` +
                        `${awb} manually cancel karna pad sakta hai.\n\nContinue?`
                    );

                    if (!proceed) {
                        throw new Error("Cancel roka gaya.");
                    }
                }
            }

            let refund = { refundStatus: "NONE" };

            if (isPaid(fresh)) {
                refund = await startRefund(fresh);
            }

            await patchOrder(order, {
                orderStatus: "CANCELLED",
                cancelReason: reason,
                cancelledAt: serverTimestamp(),
                shipmentCancelled,
                ...refund,
                notificationType: "ORDER_CANCELLED",
                notificationTitle: "Order Cancelled",
                notificationMessage: cancelMessage(
                    fresh,
                    reason,
                    refund.refundStatus
                ),
                notificationCreatedAt: serverTimestamp(),
                notificationSent: false
            });

            if (refund.refundStatus === "FAILED") {
                alert(
                    "Order cancel ho gaya, lekin refund automatic process nahi hua.\n\n" +
                    refund.refundError +
                    "\n\nRazorpay dashboard mein refund verify karein."
                );
            }
        });

        closeCancel();
        await loadOrders();

    } catch (error) {
        if (error.message !== "Cancel roka gaya.") {
            showError("Cancel nahi hua:\n" + error.message);
        }
    }
});

// ---------------- RETRY REFUND ----------------

async function retryRefund(order, button) {
    await busy(button, "Processing refund...", async () => {
        const fresh = await freshOrder(order);

        if (fresh.refundStatus === "REFUNDED") {
            throw new Error("Refund already marked as refunded hai.");
        }

        const refund = await startRefund(fresh);

        await patchOrder(order, refund);

        if (refund.refundStatus === "FAILED") {
            throw new Error(refund.refundError);
        }
    });

    await loadOrders();
}

// ---------------- CHECK REFUND STATUS ----------------

async function checkRefundStatus(order, button) {
    await busy(button, "Checking refund...", async () => {
        const fresh = await freshOrder(order);

        if (!fresh.razorpayRefundId) {
            throw new Error("Razorpay Refund ID nahi mila.");
        }

        const response = await adminFetch(
            "/razorpay/refund-status?refundId=" +
                encodeURIComponent(fresh.razorpayRefundId),
            {},
            "GET"
        );

        await patchOrder(order, {
            refundStatus: String(
                response.refundStatus || "PROCESSING"
            ).toUpperCase(),
            refundUpdatedAt: serverTimestamp()
        });
    });

    await loadOrders();
}

// ---------------- CLICK HANDLER ----------------

if (ordersContainer) {
    ordersContainer.addEventListener("click", async (event) => {
        const button = event.target.closest("[data-action]");

        if (!button || button.disabled) return;

        const card = button.closest("[data-id]");
        const order = card && orderMap.get(card.dataset.id);

        if (!order) return;

        try {
            switch (button.dataset.action) {
                case "accept":
                case "editdims":
                    openDimensionsModal(order);
                    break;

                case "cancel":
                    openCancelModal(order);
                    break;

                case "ship":
                    await shipOrder(order, button);
                    break;

                case "label":
                    await printLabel(order, button);
                    break;

                case "pickup":
                    await requestPickup(order, button);
                    break;

                case "track":
                    await checkTracking(order, button);
                    break;

                case "markpicked":
                    await manualStatus(order, "PICKED_UP", "Picked Up");
                    break;

                case "markintransit":
                    await manualStatus(order, "IN_TRANSIT", "In Transit");
                    break;

                case "markdelivered":
                    await manualStatus(order, "DELIVERED", "Delivered");
                    break;

                case "retryrefund":
                    await retryRefund(order, button);
                    break;

                case "refundstatus":
                    await checkRefundStatus(order, button);
                    break;

                default:
                    console.warn("Unknown order action:", button.dataset.action);
            }
        } catch (error) {
            console.error("Order action error:", error);
            showError(error.message || "Action complete nahi hui.");
        }
    });
}

// ---------------- AUTHENTICATION + START ----------------

onAuthStateChanged(auth, async (user) => {
    isAdminAuthenticated = Boolean(
        user && ADMIN_UIDS.includes(user.uid)
    );

    if (!user) {
        if (ordersContainer) {
            ordersContainer.innerHTML =
                `<div class="empty">Please login to access admin orders.</div>`;
        }

        if (loadingEl) loadingEl.hidden = true;
        return;
    }

    if (!isAdminAuthenticated) {
        if (ordersContainer) {
            ordersContainer.innerHTML =
                `<div class="empty">Access denied. This account is not an admin.</div>`;
        }

        if (loadingEl) loadingEl.hidden = true;
        console.error("Admin access denied for UID:", user.uid);
        return;
    }

    await loadOrders();
});
