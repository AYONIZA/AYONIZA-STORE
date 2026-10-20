// =====================================================
// AYONIZA — ADMIN (admin.js)
// Part 1: Order management
//   Flow: NEW -> PACKED -> SHIPMENT_CREATED -> PICKED_UP -> IN_TRANSIT -> DELIVERED
//         (+ CANCELLED with refundStatus)
// Part 2: Product + Stock management (Firestore collection "products")
// =====================================================

import { getApps, initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
    getFirestore, collection, getDocs, getDoc, addDoc, updateDoc, deleteDoc, doc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const ADMIN_UIDS = [
    "t8lcx1r7jdSXowv4EPgxJA8FXKn1",
    "ZWCoYQo4EwN6T58bYcxbw27KN4D3"   // <-- Worker wale UID se match karo
];

const WORKER = "https://ayoniza-payment.ayoniza-support.workers.dev";
const WAREHOUSE_ID = "347486";
const TRACK_BASE_URL = "https://ayoniza.shop/track-order.html?orderId=";
const PAID_STATUSES = ["PAID", "SUCCESS", "VERIFIED"];
const DEFAULT_PARCEL = { weightKg: 0.2, lengthCm: 20, widthCm: 15, heightCm: 5 };
const CANCEL_REASONS = [
    "Out of stock",
    "Unable to fulfil order",
    "Customer requested cancellation",
    "Payment issue",
    "Address not serviceable",
    "Other"
];
const STATUS_RANK = { SHIPMENT_CREATED: 1, PICKED_UP: 2, IN_TRANSIT: 3, DELIVERED: 4 };

const ordersContainer = document.getElementById("ordersContainer");
const loadingEl = document.getElementById("loading");

const orderMap = new Map();
let current = null; // order currently open in a modal

// =====================================================
// HELPERS
// =====================================================

const $ = (id) => document.getElementById(id);

const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[c]));

const money = (n) => "₹" + Number(n || 0).toLocaleString("en-IN");

function fmtDate(ts) {
    try { return ts ? ts.toDate().toLocaleString("en-IN") : "—"; }
    catch { return "—"; }
}

const isPaid = (o) => PAID_STATUSES.includes(String(o.paymentStatus || "").toUpperCase());

function stageOf(o) {
    const s = String(o.orderStatus || "").toUpperCase();
    if (s === "CANCELLED" || s === "DELIVERED") return s;
    if (s === "IN_TRANSIT") return "IN_TRANSIT";
    if (s === "PICKED_UP" || s === "SHIPPED") return "PICKED_UP";
    if (o.awb || o.trackingNumber) return "SHIPMENT_CREATED"; // legacy ACCEPTED orders bhi yahin aayenge
    if (o.parcel) return "PACKED";
    if (s === "NEW" || !s) return "NEW";
    return "ACCEPTED"; // legacy: accepted par dimensions nahi bhari
}

async function adminFetch(path, body, method = "POST") {
    const user = auth.currentUser;
    if (!user) throw new Error("Admin session expire ho gayi. Dobara login karein.");
    const token = await user.getIdToken();
    const res = await fetch(WORKER + path, {
        method,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: method === "GET" ? undefined : JSON.stringify(body || {})
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.success === false) {
        throw new Error(data.message || `Request failed (HTTP ${res.status})`);
    }
    return data;
}

async function busy(btn, text, fn) {
    const old = btn.textContent;
    btn.disabled = true;
    btn.textContent = text;
    try { return await fn(); }
    finally { btn.disabled = false; btn.textContent = old; }
}

const freshOrder = async (o) => {
    const snap = await getDoc(doc(db, "orders", o.firebaseId));
    if (!snap.exists()) throw new Error("Order Firestore me nahi mila.");
    return { firebaseId: snap.id, ...snap.data() };
};

const patchOrder = (o, fields) =>
    updateDoc(doc(db, "orders", o.firebaseId), { ...fields, updatedAt: serverTimestamp() });

// =====================================================
// EXTRA STYLES + MODALS (JS se inject, HTML change nahi chahiye)
// =====================================================

document.head.insertAdjacentHTML("beforeend", `<style>
.ord-btn{border:0;padding:11px 16px;border-radius:8px;cursor:pointer;font-weight:600;background:#f2f2f2;color:#222}
.ord-btn.primary{background:#111;color:#fff}
.ord-btn:disabled{opacity:.55;cursor:not-allowed}
.ord-warn{margin:10px 0;padding:10px 12px;border-radius:8px;background:#fff2cc;color:#8a6200;font-size:13px;font-weight:600}
.ord-info{margin:10px 0;padding:10px 12px;border-radius:8px;background:#f8f3f5;border:1px solid #eadde2;font-size:13px;line-height:1.6}
.ord-pill{display:inline-block;padding:4px 9px;border-radius:999px;font-size:12px;font-weight:700;background:#f2f2f2}
.ord-pill.ok{background:#d9f7df;color:#1c6b2b}.ord-pill.wait{background:#fff2cc;color:#8a6200}.ord-pill.bad{background:#fde4e1;color:#b42318}
.ord-grid2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.modal select{width:100%;margin-top:7px;padding:11px;border:1px solid #ccc;border-radius:7px;font:inherit;background:#fff}
</style>`);

document.body.insertAdjacentHTML("beforeend", `
<div class="modal-backdrop" id="dimModal"><div class="modal">
  <h2>Parcel Dimensions</h2>
  <p id="dimOrderLabel"></p>
  <div class="ord-grid2">
    <label>Weight (kg)<input id="dimWeight" type="number" min="0.01" step="0.01"></label>
    <label>Length (cm)<input id="dimLength" type="number" min="1" step="0.1"></label>
    <label>Width (cm)<input id="dimWidth" type="number" min="1" step="0.1"></label>
    <label>Height (cm)<input id="dimHeight" type="number" min="1" step="0.1"></label>
  </div>
  <label>Shipping mode
    <select id="dimExpress"><option value="surface">Surface</option><option value="air">Air</option></select>
  </label>
  <div class="modal-actions">
    <button type="button" class="modal-close" id="dimCloseBtn">Close</button>
    <button type="button" class="modal-confirm" id="dimSaveBtn">Save Dimensions</button>
  </div>
</div></div>

<div class="modal-backdrop" id="cxlModal"><div class="modal">
  <h2>Cancel Order</h2>
  <p id="cxlOrderLabel"></p>
  <div id="cxlRefundNote" class="ord-info" hidden></div>
  <label>Reason
    <select id="cxlReasonSelect">${CANCEL_REASONS.map((r) => `<option>${esc(r)}</option>`).join("")}</select>
  </label>
  <label>Note (optional)<textarea id="cxlNote" placeholder="Extra details"></textarea></label>
  <div class="modal-actions">
    <button type="button" class="modal-close" id="cxlCloseBtn">Back</button>
    <button type="button" class="modal-confirm" id="cxlConfirmBtn">Confirm Cancel</button>
  </div>
</div></div>`);

const closeDim = () => { current = null; $("dimModal").classList.remove("show"); };
const closeCxl = () => { current = null; $("cxlModal").classList.remove("show"); };

$("dimCloseBtn").addEventListener("click", closeDim);
$("cxlCloseBtn").addEventListener("click", closeCxl);
$("dimModal").addEventListener("click", (e) => { if (e.target === $("dimModal")) closeDim(); });
$("cxlModal").addEventListener("click", (e) => { if (e.target === $("cxlModal")) closeCxl(); });

// =====================================================
// MESSAGES
// =====================================================

function confirmMessage(o, awb) {
    return `AYONIZA Order Confirmed ✅\n\nHi ${o.customerName || "Customer"},\n\n` +
        `Your order ${o.orderId} has been confirmed and shipment is created.\n\n` +
        `Amount: ${money(o.total)}\nTracking ID: ${awb}\nCourier: Fship\n\n` +
        `Track your order:\n${TRACK_BASE_URL + encodeURIComponent(o.orderId || o.firebaseId)}\n\n` +
        `Thank you for shopping with AYONIZA.`;
}

function cancelMessage(o, reason, refundStatus) {
    const refundLine = refundStatus && refundStatus !== "NONE"
        ? `\n\nRefund of ${money(o.total)} has been initiated to your original payment method. ` +
          `It usually reflects in 5-7 working days.`
        : "";
    return `AYONIZA Order Update\n\nHi ${o.customerName || "Customer"},\n\n` +
        `Your order ${o.orderId} has been cancelled.\n\nReason: ${reason}${refundLine}\n\n` +
        `For help, please contact AYONIZA support.`;
}

// =====================================================
// RENDER ORDERS
// =====================================================

const PICKUP_LABELS = {
    NOT_REQUESTED: ["Not requested", "wait"],
    REQUESTED: ["Requested", "wait"],
    SCHEDULED: ["Scheduled", "ok"],
    PICKED_UP: ["Picked up", "ok"]
};

const REFUND_LABELS = {
    NONE: ["No refund needed", ""],
    PENDING: ["Pending", "wait"],
    PROCESSING: ["Processing", "wait"],
    REFUNDED: ["Refunded", "ok"],
    FAILED: ["Failed", "bad"]
};

function pickupPill(o) {
    const [text, cls] = PICKUP_LABELS[o.pickupStatus || "NOT_REQUESTED"] || PICKUP_LABELS.NOT_REQUESTED;
    return `<span class="ord-pill ${cls}">${text}</span>`;
}

function refundBlock(o) {
    const st = o.refundStatus || (isPaid(o) ? "PENDING" : "NONE");
    const [text, cls] = REFUND_LABELS[st] || [st, ""];
    let html = `<div class="ord-info"><strong>Cancel reason:</strong> ${esc(o.cancelReason || "—")}<br>
        <strong>Refund:</strong> <span class="ord-pill ${cls}">${esc(text)}</span>`;
    if (o.razorpayRefundId) html += `<br><strong>Refund ID:</strong> ${esc(o.razorpayRefundId)}`;
    if (o.refundError) html += `<br><span style="color:#b42318">${esc(o.refundError)}</span>`;
    html += `</div>`;

    if (isPaid(o)) {
        if (st === "FAILED" || st === "PENDING") {
            html += `<div class="admin-actions"><button class="ord-btn primary" data-action="retryrefund">Retry Refund</button></div>`;
        } else if (st === "PROCESSING") {
            html += `<div class="admin-actions"><button class="ord-btn" data-action="refundstatus">Check Refund Status</button></div>`;
        }
    }
    return html;
}

function actionsFor(o, stage) {
    const paid = isPaid(o);
    const awb = o.awb || o.trackingNumber;
    const awbBox = awb
        ? `<div class="ord-info"><strong>AWB:</strong> ${esc(awb)} (${esc(o.courier || "Fship")})<br>
           <strong>Pickup:</strong> ${pickupPill(o)}
           ${o.lastTrackingStatus ? `<br><strong>Last tracking:</strong> ${esc(o.lastTrackingStatus)}` : ""}</div>`
        : "";
    const parcel = o.parcel
        ? `<div class="ord-info"><strong>Parcel:</strong> ${o.parcel.weightKg} kg | ${o.parcel.lengthCm} × ${o.parcel.widthCm} × ${o.parcel.heightCm} cm | ${esc(o.expressType || "surface")}</div>`
        : "";

    switch (stage) {
        case "NEW":
            return `${paid ? "" : `<div class="ord-warn">Payment ${esc(o.paymentStatus || "PENDING")} hai. Ye order paid order ki tarah process nahi hoga. Sirf cancel kar sakte hain.</div>`}
              <div class="admin-actions">
                <button class="accept-btn" data-action="accept" ${paid ? "" : "disabled"}>Accept Order</button>
                <button class="cancel-btn" data-action="cancel">Cancel Order</button>
              </div>`;

        case "ACCEPTED":
            return `<div class="admin-actions">
                <button class="ord-btn primary" data-action="editdims">Enter Parcel Dimensions</button>
                <button class="cancel-btn" data-action="cancel">Cancel Order</button></div>`;

        case "PACKED":
            return `${parcel}<div class="admin-actions">
                <button class="accept-btn" data-action="ship">Ready to Ship</button>
                <button class="ord-btn" data-action="editdims">Edit Dimensions</button>
                <button class="cancel-btn" data-action="cancel">Cancel Order</button></div>`;

        case "SHIPMENT_CREATED":
            return `${awbBox}<div class="admin-actions">
                <button class="ord-btn primary" data-action="label">Print Label</button>
                <button class="ord-btn" data-action="pickup" ${["REQUESTED", "SCHEDULED"].includes(o.pickupStatus) ? "disabled" : ""}>Request Pickup</button>
                <button class="ord-btn" data-action="track">Check Tracking</button>
                <button class="ord-btn" data-action="markpicked">Mark Picked Up</button>
                <button class="cancel-btn" data-action="cancel">Cancel Order</button></div>`;

        case "PICKED_UP":
            return `${awbBox}<div class="admin-actions">
                <button class="ord-btn primary" data-action="label">Print Label</button>
                <button class="ord-btn" data-action="track">Check Tracking</button>
                <button class="ord-btn" data-action="markintransit">Mark In Transit</button>
                <button class="ord-btn" data-action="markdelivered">Mark Delivered</button></div>`;

        case "IN_TRANSIT":
            return `${awbBox}<div class="admin-actions">
                <button class="ord-btn" data-action="track">Check Tracking</button>
                <button class="ord-btn" data-action="markdelivered">Mark Delivered</button></div>`;

        case "DELIVERED":
            return awbBox;

        case "CANCELLED":
            return refundBlock(o);

        default:
            return "";
    }
}

function createOrderCard(o) {
    const stage = stageOf(o);
    const card = document.createElement("article");
    card.className = "order-card";
    card.dataset.id = o.firebaseId;

    const items = (Array.isArray(o.items) ? o.items : []).map((i) => `
        <div class="item">
          <img src="${esc(i.image || "")}" alt="${esc(i.productName || "Product")}">
          <div class="item-info">
            <div class="item-name">${esc(i.productName || "Product")}</div>
            <div class="item-meta">Qty: ${Number(i.quantity || 1)} | Price: ${money(i.price)}</div>
            <div class="item-meta">Total: ${money(i.lineTotal)}</div>
          </div>
        </div>`).join("");

    const payClass = isPaid(o) ? "payment-status verified" : "payment-status pending";

    card.innerHTML = `
      <div class="order-header">
        <div>
          <div class="order-id">${esc(o.orderId || "No Order ID")}</div>
          <div class="order-date">${fmtDate(o.createdAt)}</div>
        </div>
        <div class="order-status">${esc(stage === "NEW" ? "NEW" : (o.orderStatus || stage))}</div>
      </div>
      <div class="order-grid">
        <section class="section">
          <h3>Customer</h3>
          <p><strong>Name:</strong> ${esc(o.customerName || "—")}</p>
          <p><strong>Email:</strong> ${esc(o.email || "—")}</p>
          <p><strong>Phone:</strong> ${esc(o.phone || "—")}</p>
          <h3>Delivery Address</h3>
          <p>${esc(o.address || "—")}${o.landmark ? "<br>" + esc(o.landmark) : ""}<br>
          ${esc(o.city || "")}, ${esc(o.state || "")} - ${esc(o.pincode || "")}<br>${esc(o.country || "India")}</p>
        </section>
        <section class="section">
          <h3>Order</h3>
          <div class="items">${items}</div>
          <div class="amount-box">Total: ${money(o.total)}</div>
          <p><strong>Payment:</strong> <span class="${payClass}">${esc(o.paymentStatus || "UNKNOWN")}</span></p>
          <p><strong>Method:</strong> ${esc(o.paymentMethod || "—")}</p>
          ${o.razorpayPaymentId ? `<p><strong>Payment ID:</strong> ${esc(o.razorpayPaymentId)}</p>` : ""}
        </section>
        <section class="section" style="grid-column:1/-1">
          <h3>Order Action</h3>
          ${actionsFor(o, stage)}
          ${o.trackingUrl ? `<div class="ord-info"><strong>Customer tracking link</strong><br><a class="tracking-link" href="${esc(o.trackingUrl)}" target="_blank" rel="noopener">${esc(o.trackingUrl)}</a></div>` : ""}
          ${o.notificationMessage ? `<div class="notification-box"><strong>Customer Message</strong><div>${esc(o.notificationMessage).replace(/\n/g, "<br>")}</div></div>` : ""}
        </section>
      </div>`;
    return card;
}

// =====================================================
// LOAD ORDERS
// =====================================================

async function loadOrders() {
    try {
        if (loadingEl) loadingEl.hidden = false;
        if (ordersContainer) ordersContainer.innerHTML = "";

        const snap = await getDocs(collection(db, "orders"));
        const orders = snap.docs.map((d) => ({ firebaseId: d.id, ...d.data() }))
            .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));

        orderMap.clear();
        orders.forEach((o) => orderMap.set(o.firebaseId, o));

        const setText = (id, v) => { const el = $(id); if (el) el.textContent = v; };
        setText("totalOrders", orders.length);
        setText("newOrders", orders.filter((o) => stageOf(o) === "NEW").length);
        setText("shippedOrders", orders.filter((o) => ["PICKED_UP", "IN_TRANSIT"].includes(stageOf(o))).length);
        setText("deliveredOrders", orders.filter((o) => stageOf(o) === "DELIVERED").length);

        if (!orders.length) {
            ordersContainer.innerHTML = `<div class="empty">No orders found.</div>`;
            return;
        }
        orders.forEach((o) => ordersContainer.appendChild(createOrderCard(o)));
    } catch (err) {
        console.error("Order loading error:", err);
        ordersContainer.innerHTML = `<div class="empty"><strong>Orders load nahi ho paaye.</strong><br><br>${esc(err.message)}</div>`;
    } finally {
        if (loadingEl) loadingEl.hidden = true;
    }
}

// =====================================================
// STEP 2: ACCEPT -> DIMENSIONS
// =====================================================

function openDimModal(o) {
    current = o;
    const p = { ...DEFAULT_PARCEL, ...(o.parcel || {}) };
    $("dimOrderLabel").textContent = `Order: ${o.orderId}`;
    $("dimWeight").value = p.weightKg;
    $("dimLength").value = p.lengthCm;
    $("dimWidth").value = p.widthCm;
    $("dimHeight").value = p.heightCm;
    $("dimExpress").value = o.expressType || "surface";
    $("dimModal").classList.add("show");
}

$("dimSaveBtn").addEventListener("click", async (e) => {
    const o = current;
    if (!o) return;

    const parcel = {
        weightKg: Number($("dimWeight").value),
        lengthCm: Number($("dimLength").value),
        widthCm: Number($("dimWidth").value),
        heightCm: Number($("dimHeight").value)
    };
    if (Object.values(parcel).some((v) => !Number.isFinite(v) || v <= 0)) {
        alert("Weight, length, width aur height sab 0 se bade hone chahiye.");
        return;
    }

    try {
        await busy(e.target, "Saving...", async () => {
            const fresh = await freshOrder(o);
            if (!isPaid(fresh)) throw new Error("Payment verified nahi hai. Order accept nahi ho sakta.");
            if (fresh.awb || fresh.trackingNumber) throw new Error("Shipment pehle se bani hui hai.");

            const fields = {
                parcel,
                expressType: $("dimExpress").value,
                orderStatus: "PACKED"
            };
            if (!fresh.acceptedAt) fields.acceptedAt = serverTimestamp();
            await patchOrder(o, fields);
        });
        closeDim();
        await loadOrders();
    } catch (err) {
        alert("Dimensions save nahi hui:\n" + err.message);
    }
});

// =====================================================
// STEP 3: READY TO SHIP -> FSHIP SHIPMENT
// =====================================================

async function shipOrder(o, btn) {
    await busy(btn, "Shipment creation is in progress...", async () => {
        const fresh = await freshOrder(o); // double click / stale UI se duplicate rokne ke liye

        if (fresh.awb || fresh.trackingNumber || fresh.fshipOrderId) {
            throw new Error("Is order ki shipment pehle se bani hui hai.");
        }
        if (!isPaid(fresh)) throw new Error("Payment verified nahi hai.");
        if (!fresh.parcel) throw new Error("Pehle parcel dimensions save karein.");

        const p = fresh.parcel;
        const payload = {
            orderId: String(fresh.orderId || fresh.firebaseId || "").trim(),
            razorpayOrderId: String(fresh.razorpayOrderId || "").trim(),
            razorpayPaymentId: String(fresh.razorpayPaymentId || "").trim(),
            warehouseId: WAREHOUSE_ID,
            customerName: String(fresh.customerName || fresh.name || "").trim(),
            customerPhone: String(fresh.phone || fresh.mobile || "").trim(),
            customerEmail: String(fresh.email || "").trim(),
            addressLine1: String(fresh.address || "").trim(),
            addressLine2: String(fresh.addressLine2 || "").trim(),
            landmark: String(fresh.landmark || "").trim(),
            pincode: String(fresh.pincode || fresh.pinCode || "").trim(),
            city: String(fresh.city || "").trim(),
            state: String(fresh.state || "").trim(),
            country: String(fresh.country || "India").trim(),
            amount: Number(fresh.total ?? fresh.amount ?? 0),
            paymentMode: "PREPAID",
            weightKg: p.weightKg,
            lengthCm: p.lengthCm,
            widthCm: p.widthCm,
            heightCm: p.heightCm,
            expressType: fresh.expressType || "surface",
            items: Array.isArray(fresh.items) ? fresh.items : []
        };

        const missing = [];
        if (!payload.razorpayOrderId) missing.push("Razorpay Order ID");
        if (!payload.razorpayPaymentId) missing.push("Razorpay Payment ID");
        if (!payload.customerName) missing.push("customer name");
        if (!payload.customerPhone) missing.push("phone");
        if (!payload.addressLine1) missing.push("address");
        if (!/^\d{6}$/.test(payload.pincode)) missing.push("6-digit pincode");
        if (!payload.city) missing.push("city");
        if (!payload.items.length) missing.push("products");
        if (missing.length) throw new Error("Order me missing/invalid: " + missing.join(", "));

        const r = await adminFetch("/fship/create-shipment", payload);
        if (!r.awb) throw new Error("FShip ne AWB return nahi kiya.");

        const trackingUrl = TRACK_BASE_URL + encodeURIComponent(fresh.orderId || fresh.firebaseId);
        try {
            await patchOrder(o, {
                orderStatus: "SHIPMENT_CREATED",
                courier: "Fship",
                awb: String(r.awb),
                trackingNumber: String(r.awb),
                fshipOrderId: r.fshipOrderId ? String(r.fshipOrderId) : "",
                trackingUrl,
                shippingWarehouseId: WAREHOUSE_ID,
                shippingCreatedAt: serverTimestamp(),
                pickupStatus: "NOT_REQUESTED",
                notificationType: "ORDER_CONFIRMED",
                notificationTitle: "Order Confirmed",
                notificationMessage: confirmMessage(fresh, r.awb),
                notificationCreatedAt: serverTimestamp(),
                notificationSent: false
            });
        } catch (saveErr) {
            // Shipment FShip par ban chuki hai, isliye AWB kho na jaye.
            alert(`IMPORTANT: FShip shipment created successfully (AWB: ${r.awb}) lekin Firestore save fail hua.\nAWB note kar lo aur dobara "Ready to Ship" mat dabana.\n\n${saveErr.message}`);
            throw saveErr;
        }
    });
    await loadOrders();
}

// =====================================================
// STEP 4: LABEL / PICKUP / TRACKING
// =====================================================

async function printLabel(o, btn) {
    const win = window.open("", "_blank"); // popup blocker se bachne ke liye pehle khol do
    try {
        await busy(btn, "Label la raha hai...", async () => {
            const r = await adminFetch("/fship/label", {
                awb: o.awb || o.trackingNumber,
                orderId: o.orderId,
                fshipOrderId: o.fshipOrderId || "",
                pickupOrderId: o.pickupOrderId || ""
            });

            if (r.labelUrl) {
                if (win) win.location.href = r.labelUrl;
                await patchOrder(o, { labelUrl: r.labelUrl });
            } else if (r.labelBase64) {
                const bytes = Uint8Array.from(atob(r.labelBase64), (c) => c.charCodeAt(0));
                const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
                if (win) win.location.href = url;
            } else {
                throw new Error("FShip ne label return nahi kiya. FShip panel se label download karein.");
            }
        });
    } catch (err) {
        if (win) win.close();
        throw err;
    }
}

async function requestPickup(o, btn) {
    await busy(btn, "Pickup request ho raha hai...", async () => {
        const r = await adminFetch("/fship/pickup", {
            awb: o.awb || o.trackingNumber,
            orderId: o.orderId,
            fshipOrderId: o.fshipOrderId || ""
        });
        await patchOrder(o, {
            pickupStatus: "REQUESTED",
            pickupRequestedAt: serverTimestamp(),
            pickupOrderId: r.pickupOrderId ? String(r.pickupOrderId) : "",
            pickupMessage: String(r.message || "")
        });
    });
    await loadOrders();
}

async function checkTracking(o, btn) {
    await busy(btn, "Checking...", async () => {
        const r = await adminFetch("/fship/track", {
            awb: o.awb || o.trackingNumber,
            orderId: o.orderId
        });

        const fields = { lastTrackingStatus: String(r.trackingStatus || ""), lastTrackedAt: serverTimestamp() };
        const mapped = r.mappedStatus;
        const currentRank = STATUS_RANK[stageOf(o)] || 0;

        // Sirf aage badhne wale status apply karo, peeche nahi.
        if (mapped && (STATUS_RANK[mapped] || 0) > currentRank) {
            fields.orderStatus = mapped;
            fields.statusSource = "FSHIP_TRACKING";
            if (mapped === "PICKED_UP") fields.pickupStatus = "PICKED_UP";
            if (mapped === "IN_TRANSIT" || mapped === "DELIVERED") fields.pickupStatus = "PICKED_UP";
        }
        await patchOrder(o, fields);
    });
    await loadOrders();
}

async function manualStatus(o, status, label) {
    const ok = confirm(`"${label}" manually mark kar rahe ho (FShip se confirm nahi hua). Continue?`);
    if (!ok) return;
    const fields = { orderStatus: status, statusSource: "ADMIN_MANUAL" };
    if (status !== "SHIPMENT_CREATED") fields.pickupStatus = "PICKED_UP";
    await patchOrder(o, fields);
    await loadOrders();
}

// =====================================================
// STEP 5: CANCEL + RAZORPAY REFUND
// =====================================================

function openCancelModal(o) {
    current = o;
    $("cxlOrderLabel").textContent = `Order: ${o.orderId}`;
    $("cxlReasonSelect").value = CANCEL_REASONS[0];
    $("cxlNote").value = "";

    const note = $("cxlRefundNote");
    if (isPaid(o)) {
        note.hidden = false;
        note.textContent = `Customer ne ${money(o.total)} pay kiya hai. Cancel confirm karne par poori paid amount Razorpay se refund hone ke liye bheji jayegi.`;
    } else {
        note.hidden = false;
        note.textContent = "Payment complete nahi hai, isliye refund nahi bheja jayega.";
    }
    $("cxlModal").classList.add("show");
}

async function startRefund(o) {
    try {
        const r = await adminFetch("/razorpay/refund", {
            orderId: o.orderId || o.firebaseId,
            razorpayPaymentId: o.razorpayPaymentId,
            razorpayOrderId: o.razorpayOrderId
        });
        return {
            refundStatus: r.refundStatus,
            razorpayRefundId: r.refundId || "",
            refundAmount: Number(r.amountPaise || 0) / 100,
            refundError: "",
            refundUpdatedAt: serverTimestamp()
        };
    } catch (err) {
        return { refundStatus: "FAILED", refundError: err.message, refundUpdatedAt: serverTimestamp() };
    }
}

$("cxlConfirmBtn").addEventListener("click", async (e) => {
    const o = current;
    if (!o) return;

    const reasonBase = $("cxlReasonSelect").value;
    const note = $("cxlNote").value.trim();
    const reason = note ? `${reasonBase} — ${note}` : reasonBase;

    try {
        await busy(e.target, "Cancelling...", async () => {
            const fresh = await freshOrder(o);
            const stage = stageOf(fresh);

            if (stage === "CANCELLED") throw new Error("Order pehle se cancelled hai.");
            if (["PICKED_UP", "IN_TRANSIT", "DELIVERED"].includes(stage)) {
                throw new Error("Parcel pickup ho chuka hai. Ab cancel nahi ho sakta (return/RTO process alag hoga).");
            }

            // 1) Shipment bani hui hai to pehle FShip par cancel
            const awb = fresh.awb || fresh.trackingNumber;
            let shipmentCancelled = false;
            if (awb) {
                try {
                    await adminFetch("/fship/cancel", { awb, orderId: fresh.orderId, reason });
                    shipmentCancelled = true;
                } catch (err) {
                    const go = confirm(
                        `FShip par shipment cancel nahi hui:\n${err.message}\n\n` +
                        `Phir bhi order cancel karein? (FShip panel se AWB ${awb} manually cancel karna padega)`
                    );
                    if (!go) throw new Error("Cancel roka gaya.");
                }
            }

            // 2) Paid hai to Razorpay refund
            let refund = { refundStatus: "NONE" };
            if (isPaid(fresh)) refund = await startRefund(fresh);

            // 3) Firestore update
            await patchOrder(o, {
                orderStatus: "CANCELLED",
                cancelReason: reason,
                cancelledAt: serverTimestamp(),
                shipmentCancelled,
                ...refund,
                notificationType: "ORDER_CANCELLED",
                notificationTitle: "Order Cancelled",
                notificationMessage: cancelMessage(fresh, reason, refund.refundStatus === "FAILED" ? "NONE" : refund.refundStatus),
                notificationCreatedAt: serverTimestamp(),
                notificationSent: false
            });

            if (refund.refundStatus === "FAILED") {
                alert("Order cancel ho gaya, lekin refund fail hua:\n" + refund.refundError + "\n\nOrder card me 'Retry Refund' dabayein.");
            }
        });
        closeCxl();
        await loadOrders();
    } catch (err) {
        if (err.message !== "Cancel roka gaya.") alert("Cancel nahi hua:\n" + err.message);
    }
});

async function retryRefund(o, btn) {
    await busy(btn, "Refund bhej raha hai...", async () => {
        const fresh = await freshOrder(o);
        if (fresh.refundStatus === "REFUNDED") throw new Error("Refund pehle hi complete hai.");
        const refund = await startRefund(fresh);
        await patchOrder(o, refund);
        if (refund.refundStatus === "FAILED") throw new Error(refund.refundError);
    });
    await loadOrders();
}

async function checkRefundStatus(o, btn) {
    await busy(btn, "Checking...", async () => {
        if (!o.razorpayRefundId) throw new Error("Refund ID nahi mila.");
        const r = await adminFetch(
            `/razorpay/refund-status?refundId=${encodeURIComponent(o.razorpayRefundId)}`,
            null, "GET"
        );
        await patchOrder(o, { refundStatus: r.refundStatus, refundUpdatedAt: serverTimestamp() });
    });
    await loadOrders();
}

// =====================================================
// ORDERS CLICK HANDLER (event delegation)
// =====================================================

ordersContainer?.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn || btn.disabled) return;
    const card = btn.closest("[data-id]");
    const o = card && orderMap.get(card.dataset.id);
    if (!o) return;

    try {
        switch (btn.dataset.action) {
            case "accept":
            case "editdims": openDimModal(o); break;
            case "cancel": openCancelModal(o); break;
            case "ship": await shipOrder(o, btn); break;
            case "label": await printLabel(o, btn); break;
            case "pickup": await requestPickup(o, btn); break;
            case "track": await checkTracking(o, btn); break;
            case "markpicked": await manualStatus(o, "PICKED_UP", "Picked Up"); break;
            case "markintransit": await manualStatus(o, "IN_TRANSIT", "In Transit"); break;
            case "markdelivered": await manualStatus(o, "DELIVERED", "Delivered"); break;
            case "retryrefund": await retryRefund(o, btn); break;
            case "refundstatus": await checkRefundStatus(o, btn); break;
        }
    } catch (err) {
        console.error(err);
        alert(err.message || "Kuch galat hua.");
    }
});

// =====================================================
// =====================================================
// PART 2: PRODUCTS + STOCK
// Collection: "products"
// Fields: name, price, category, discount, stock, image, description, listed
// =====================================================
// =====================================================

const CATEGORY_LABELS = {
    earrings: "Earrings", bracelets: "Bracelets", sets: "Jewellery Sets",
    kamarbandh: "Kamarbandh", necklaces: "Necklaces", hathphool: "Hathphool",
    "hair-accessories": "Hair Accessories", anklets: "Anklets", rings: "Rings"
};

let products = [];

// Purane documents me field names thode alag ho sakte hain, isliye fallbacks
const pName = (p) => p.name || p.title || p.productName || "Unnamed";
const pImage = (p) => p.image || p.img || p.imageUrl || p.imagePath || "";
const pListed = (p) => (p.listed ?? p.isListed ?? p.active ?? true) !== false;

function flash(id, text, isError = false) {
    const el = $(id);
    if (!el) return;
    el.textContent = text;
    el.hidden = false;
    el.style.background = isError ? "#fde4e1" : "#f2f7f3";
    el.style.color = isError ? "#b42318" : "#1c6b2b";
    clearTimeout(el._t);
    el._t = setTimeout(() => { el.hidden = true; }, 5000);
}

async function loadProducts() {
    const manage = $("productListContainer");
    const stock = $("stockProductsContainer");
    if (manage) manage.innerHTML = `<div class="product-manager-empty">Loading products...</div>`;
    if (stock) stock.innerHTML = `<div class="empty">Loading products...</div>`;

    try {
        const snap = await getDocs(collection(db, "products"));
        products = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
            .sort((a, b) => pName(a).localeCompare(pName(b)));
        renderManage();
        renderStock();
    } catch (err) {
        console.error("Products load error:", err);
        const msg = err.code === "permission-denied"
            ? "Firestore rules me 'products' collection ka read/write permission nahi hai."
            : err.message;
        const html = `<strong>Products load nahi ho paaye.</strong><br><br>${esc(msg)}`;
        if (manage) manage.innerHTML = `<div class="product-manager-empty">${html}</div>`;
        if (stock) stock.innerHTML = `<div class="empty">${html}</div>`;
    }
}

function renderManage() {
    const box = $("productListContainer");
    if (!box) return;
    if (!products.length) {
        box.innerHTML = `<div class="product-manager-empty">Abhi koi product nahi hai. Upar form se pehla product add karein.</div>`;
        return;
    }
    box.innerHTML = products.map((p) => {
        const listed = pListed(p);
        return `
        <div class="product-manage-card" data-id="${esc(p.id)}">
          <div class="product-manage-top">
            <img class="product-manage-image" src="${esc(pImage(p))}" alt="${esc(pName(p))}">
            <div>
              <h4 class="product-manage-name">${esc(pName(p))}</h4>
              <p class="product-manage-meta">${money(p.price)}${Number(p.discount) ? ` | ${Number(p.discount)}% off` : ""}</p>
              <p class="product-manage-meta">${esc(CATEGORY_LABELS[p.category] || p.category || "—")} | Stock: ${Number(p.stock || 0)}</p>
              <span class="product-list-status ${listed ? "listed" : "unlisted"}">${listed ? "Listed" : "Unlisted"}</span>
            </div>
          </div>
          <div class="product-manage-actions">
            <button type="button" class="product-edit-btn" data-action="edit">Edit</button>
            <button type="button" class="product-toggle-btn" data-action="toggle">${listed ? "Unlist" : "List"}</button>
            <button type="button" class="product-delete-btn" data-action="delete">Delete</button>
          </div>
        </div>`;
    }).join("");
}

function renderStock() {
    const box = $("stockProductsContainer");
    if (!box) return;
    if (!products.length) {
        box.innerHTML = `<div class="empty">Koi product nahi mila.</div>`;
        return;
    }
    box.innerHTML = products.map((p) => {
        const s = Number(p.stock || 0);
        const cls = s <= 0 ? "out" : s <= 5 ? "low" : "available";
        const txt = s <= 0 ? "Out of stock" : s <= 5 ? `Low stock: ${s}` : `In stock: ${s}`;
        return `
        <div class="stock-product-card" data-id="${esc(p.id)}">
          <div class="stock-product-top">
            <img class="stock-product-image" src="${esc(pImage(p))}" alt="${esc(pName(p))}">
            <div>
              <h4 class="stock-product-name">${esc(pName(p))}</h4>
              <p class="stock-product-price">${money(p.price)}</p>
            </div>
          </div>
          <div class="stock-product-stock-row">
            <label>Stock</label>
            <input class="stock-input" type="number" min="0" step="1" value="${s}">
            <button type="button" class="stock-save-btn" data-action="savestock">Save</button>
          </div>
          <div class="stock-current ${cls}">${txt}</div>
        </div>`;
    }).join("");
}

// ---------- Add / Edit form ----------

function resetProductForm() {
    $("productForm").reset();
    $("editingProductId").value = "";
    $("productDiscountInput").value = 0;
    $("productStockInput").value = 0;
    $("productListedInput").checked = true;
    $("productFormTitle").textContent = "Add New Product";
    $("productSubmitBtn").textContent = "Add Product";
    $("productCancelEditBtn").hidden = true;
}

function startEditProduct(p) {
    $("editingProductId").value = p.id;
    $("productNameInput").value = p.name || p.title || p.productName || "";
    $("productPriceInput").value = p.price ?? 0;
    $("productCategoryInput").value = p.category || "earrings";
    $("productDiscountInput").value = p.discount ?? 0;
    $("productStockInput").value = p.stock ?? 0;
    $("productImageInput").value = pImage(p);
    $("productDescriptionInput").value = p.description || "";
    $("productListedInput").checked = pListed(p);
    $("productFormTitle").textContent = "Edit Product";
    $("productSubmitBtn").textContent = "Update Product";
    $("productCancelEditBtn").hidden = false;
    $("productForm").scrollIntoView({ behavior: "smooth", block: "start" });
}

$("productForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = $("productSubmitBtn");
    const editingId = $("editingProductId").value;

    const data = {
        name: $("productNameInput").value.trim(),
        price: Number($("productPriceInput").value),
        category: $("productCategoryInput").value,
        discount: Number($("productDiscountInput").value || 0),
        stock: Math.max(0, Math.floor(Number($("productStockInput").value || 0))),
        image: $("productImageInput").value.trim(),
        description: $("productDescriptionInput").value.trim(),
        listed: $("productListedInput").checked,
        updatedAt: serverTimestamp()
    };

    if (!data.name || !Number.isFinite(data.price) || data.price < 0 || !data.image) {
        flash("productAdminMessage", "Name, valid price aur image zaroori hain.", true);
        return;
    }

    btn.disabled = true;
    btn.textContent = "Saving...";
    try {
        if (editingId) {
            await updateDoc(doc(db, "products", editingId), data);
            flash("productAdminMessage", "Product update ho gaya.");
        } else {
            await addDoc(collection(db, "products"), { ...data, createdAt: serverTimestamp() });
            flash("productAdminMessage", "Product add ho gaya.");
        }
        resetProductForm();
        await loadProducts();
    } catch (err) {
        console.error(err);
        flash("productAdminMessage", "Save nahi hua: " + err.message, true);
    } finally {
        btn.disabled = false;
        btn.textContent = $("editingProductId").value ? "Update Product" : "Add Product";
    }
});

$("productCancelEditBtn")?.addEventListener("click", resetProductForm);

// ---------- Product list actions ----------

$("productListContainer")?.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn || btn.disabled) return;
    const card = btn.closest("[data-id]");
    const p = card && products.find((x) => x.id === card.dataset.id);
    if (!p) return;

    try {
        if (btn.dataset.action === "edit") {
            startEditProduct(p);
        } else if (btn.dataset.action === "toggle") {
            btn.disabled = true;
            const nowListed = pListed(p);
            await updateDoc(doc(db, "products", p.id), { listed: !nowListed, updatedAt: serverTimestamp() });
            flash("productAdminMessage", nowListed ? "Product unlist ho gaya." : "Product list ho gaya.");
            await loadProducts();
        } else if (btn.dataset.action === "delete") {
            if (!confirm(`"${pName(p)}" ko permanently delete karna hai?`)) return;
            btn.disabled = true;
            await deleteDoc(doc(db, "products", p.id));
            flash("productAdminMessage", "Product delete ho gaya.");
            await loadProducts();
        }
    } catch (err) {
        console.error(err);
        flash("productAdminMessage", "Action fail hua: " + err.message, true);
        btn.disabled = false;
    }
});

// ---------- Stock actions ----------

$("stockProductsContainer")?.addEventListener("click", async (e) => {
    const btn = e.target.closest('[data-action="savestock"]');
    if (!btn || btn.disabled) return;
    const card = btn.closest("[data-id]");
    const p = card && products.find((x) => x.id === card.dataset.id);
    if (!p) return;

    const val = Number(card.querySelector(".stock-input").value);
    if (!Number.isFinite(val) || val < 0) {
        flash("stockMessage", "Valid stock number daalein.", true);
        return;
    }

    btn.disabled = true;
    btn.textContent = "Saving...";
    try {
        await updateDoc(doc(db, "products", p.id), { stock: Math.floor(val), updatedAt: serverTimestamp() });
        flash("stockMessage", `${pName(p)}: stock ${Math.floor(val)} save ho gaya.`);
        await loadProducts();
    } catch (err) {
        console.error(err);
        flash("stockMessage", "Stock save nahi hua: " + err.message, true);
        btn.disabled = false;
        btn.textContent = "Save";
    }
});

["refreshProductListBtn", "syncProductsBtn"].forEach((id) => {
    $(id)?.addEventListener("click", loadProducts);
});

// "Refresh Data" (top nav) orders aur products dono reload kare
$("refreshAdminData")?.addEventListener("click", () => {
    loadOrders();
    loadProducts();
});

// =====================================================
// START
// =====================================================

onAuthStateChanged(auth, (user) => {
    if (user && ADMIN_UIDS.includes(user.uid)) {
        loadOrders();
        loadProducts();
    }
});
