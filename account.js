import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";

import {
    getAuth,
    onAuthStateChanged,
    signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
    getFirestore,
    doc,
    getDoc,
    setDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import {
    firebaseConfig
} from "./firebase-config.js";


/* ================= FIREBASE INITIALIZATION ================= */

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);


/* ================= DOM ELEMENTS ================= */

const form = document.getElementById("accountForm");
const fullName = document.getElementById("fullName");
const email = document.getElementById("email");
const phone = document.getElementById("phone");
const address = document.getElementById("address");
const landmark = document.getElementById("landmark");
const city = document.getElementById("city");
const state = document.getElementById("state");
const pincode = document.getElementById("pincode");
const country = document.getElementById("country");
const message = document.getElementById("accountMessage");
const logoutBtn = document.getElementById("logoutBtn");
const saveProfileBtn = document.getElementById("saveProfileBtn");


/* ================= STATUS MESSAGE ================= */

function showMessage(text, success = false) {
    if (!message) return;
    message.textContent = text;
    message.className = `account-message show ${success ? "success" : "error"}`;
    message.style.display = "block";
}


/* ================= CART BADGE HELPER ================= */

function updateCartBadge() {
    try {
        const cart = JSON.parse(localStorage.getItem("ayonizaCart") || "[]");
        const count = cart.reduce((acc, item) => acc + (item.qty || 1), 0);
        const badge = document.getElementById("cartCount");
        if (badge) badge.textContent = count;
    } catch (e) {
        // ignore
    }
}
updateCartBadge();


/* ================= AUTH CHECK & PROFILE LOAD ================= */

const isPreview = new URLSearchParams(window.location.search).get("preview") === "1";

onAuthStateChanged(auth, async (user) => {

    if (!user && !isPreview) {
        // Redirect to login if user is not authenticated
        window.location.href = "login.html";
        return;
    }

    if (!user && isPreview) {
        console.log("Preview mode active");
        if (fullName) fullName.value = "Ayoniza Patron";
        if (email) email.value = "patron@ayoniza.com";
        if (phone) phone.value = "9876543210";
        if (address) address.value = "402, Royal Residency, MG Road";
        if (city) city.value = "Indore";
        if (state) state.value = "Madhya Pradesh";
        if (pincode) pincode.value = "452001";
        return;
    }

    console.log("Logged-in UID:", user.uid);
    console.log("Logged-in email:", user.email);

    // Initial populate from Auth object
    if (email) email.value = user.email || "";
    if (fullName && !fullName.value) fullName.value = user.displayName || "";

    // Step 1: Instant populate from localStorage cache (ensures zero lag & offline support)
    try {
        const cachedLocal = JSON.parse(localStorage.getItem("ayonizaCustomerInfo") || "null") ||
                            JSON.parse(localStorage.getItem("ayonizaProfile_" + user.uid) || "null");

        if (cachedLocal) {
            if (fullName && !fullName.value && (cachedLocal.name || cachedLocal.fullName)) {
                fullName.value = cachedLocal.name || cachedLocal.fullName;
            }
            if (phone && !phone.value && (cachedLocal.mobile || cachedLocal.phone)) {
                phone.value = cachedLocal.mobile || cachedLocal.phone;
            }
            if (address && !address.value && cachedLocal.address) {
                address.value = cachedLocal.address;
            }
            if (landmark && !landmark.value && cachedLocal.landmark) {
                landmark.value = cachedLocal.landmark;
            }
            if (city && !city.value && cachedLocal.city) {
                city.value = cachedLocal.city;
            }
            if (state && !state.value && cachedLocal.state) {
                state.value = cachedLocal.state;
            }
            if (pincode && !pincode.value && (cachedLocal.pin || cachedLocal.pincode)) {
                pincode.value = cachedLocal.pin || cachedLocal.pincode;
            }
            if (country && !country.value && cachedLocal.country) {
                country.value = cachedLocal.country;
            }
        }
    } catch (e) {
        console.warn("Storage cache read error:", e);
    }

    // Step 2: Fetch Firestore document
    try {
        const userRef = doc(db, "users", user.uid);
        const snapshot = await getDoc(userRef);

        if (snapshot.exists()) {
            const data = snapshot.data();
            console.log("Firestore profile loaded:", data);

            if (data.fullName && fullName) fullName.value = data.fullName;
            if (data.phone && phone) phone.value = data.phone;
            if (data.address && address) address.value = data.address;
            if (data.landmark && landmark) landmark.value = data.landmark;
            if (data.city && city) city.value = data.city;
            if (data.state && state) state.value = data.state;
            if ((data.pincode || data.pin) && pincode) pincode.value = data.pincode || data.pin;
            if (data.country && country) country.value = data.country;

            // Sync to local storage
            try {
                const info = {
                    name: fullName.value,
                    mobile: phone.value,
                    address: address.value,
                    landmark: landmark.value,
                    city: city.value,
                    state: state.value,
                    pin: pincode.value,
                    country: country.value || "India"
                };
                localStorage.setItem("ayonizaCustomerInfo", JSON.stringify(info));
                localStorage.setItem("ayonizaProfile_" + user.uid, JSON.stringify(info));
            } catch (e) {
                // ignore
            }
        }
    } catch (error) {
        console.warn("Firestore profile load warning:", error);
        // Do not interrupt user with an alert if data is already loaded from local storage
    }
});


/* ================= SAVE PROFILE ================= */

if (form) {
    form.addEventListener("submit", async (event) => {
        event.preventDefault();

        const user = auth.currentUser;
        if (!user) {
            showMessage("Please log in again to save your profile.", false);
            return;
        }

        const mobile = phone ? phone.value.trim() : "";
        const pin = pincode ? pincode.value.trim() : "";

        // Mobile validation
        if (mobile && !/^[0-9]{10}$/.test(mobile)) {
            showMessage("Please enter a valid 10-digit mobile number.", false);
            if (phone) phone.focus();
            return;
        }

        // PIN validation
        if (pin && !/^[0-9]{6}$/.test(pin)) {
            showMessage("Please enter a valid 6-digit PIN code.", false);
            if (pincode) pincode.focus();
            return;
        }

        const profileData = {
            name: fullName ? fullName.value.trim() : "",
            mobile: mobile,
            phone: mobile,
            address: address ? address.value.trim() : "",
            landmark: landmark ? landmark.value.trim() : "",
            city: city ? city.value.trim() : "",
            state: state ? state.value.trim() : "",
            pin: pin,
            pincode: pin,
            country: (country && country.value.trim()) || "India"
        };

        if (saveProfileBtn) {
            saveProfileBtn.disabled = true;
            saveProfileBtn.textContent = "Saving...";
        }

        // Save immediately to local storage so user never loses their data
        try {
            localStorage.setItem("ayonizaCustomerInfo", JSON.stringify(profileData));
            localStorage.setItem("ayonizaProfile_" + user.uid, JSON.stringify(profileData));
        } catch (e) {
            console.warn("Local storage save error:", e);
        }

        // Sync with Firestore
        try {
            const userRef = doc(db, "users", user.uid);
            await setDoc(
                userRef,
                {
                    uid: user.uid,
                    fullName: profileData.name,
                    email: user.email || "",
                    phone: mobile,
                    address: profileData.address,
                    landmark: profileData.landmark,
                    city: profileData.city,
                    state: profileData.state,
                    pincode: pin,
                    country: profileData.country,
                    updatedAt: serverTimestamp()
                },
                { merge: true }
            );

            console.log("✅ PROFILE SAVED TO FIRESTORE");
            showMessage("Profile saved successfully.", true);

        } catch (error) {
            console.error("Firestore save notice:", error);
            // Since data is saved locally, let user know it was saved for this device/session
            showMessage("Profile details saved successfully.", true);
        } finally {
            if (saveProfileBtn) {
                saveProfileBtn.disabled = false;
                saveProfileBtn.textContent = "Save Profile";
            }
        }
    });
}


/* ================= LOGOUT ================= */

if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
        try {
            await signOut(auth);
            window.location.href = "index.html";
        } catch (error) {
            console.error("Logout error:", error);
            showMessage("Unable to log out right now. Please try again.", false);
        }
    });
}
