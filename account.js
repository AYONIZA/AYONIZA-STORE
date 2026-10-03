import {
    initializeApp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";


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



/* ================= FIREBASE ================= */

const app =
    initializeApp(firebaseConfig);


const auth =
    getAuth(app);


const db =
    getFirestore(app);



/* ================= ELEMENTS ================= */

const form =
    document.getElementById("accountForm");

const fullName =
    document.getElementById("fullName");

const email =
    document.getElementById("email");

const phone =
    document.getElementById("phone");

const address =
    document.getElementById("address");

const landmark =
    document.getElementById("landmark");

const city =
    document.getElementById("city");

const state =
    document.getElementById("state");

const pincode =
    document.getElementById("pincode");

const country =
    document.getElementById("country");

const message =
    document.getElementById("accountMessage");

const logoutBtn =
    document.getElementById("logoutBtn");



/* ================= MESSAGE ================= */

function showMessage(
    text,
    success = false
) {

    message.textContent =
        text;

    message.style.color =
        success
            ? "#1e7a46"
            : "#b3261e";

}



/* ================= AUTH STATE ================= */

onAuthStateChanged(
    auth,
    async (user) => {

        if (!user) {

            window.location.href =
                "login.html?mode=signup";

            return;

        }


        email.value =
            user.email || "";


        fullName.value =
            user.displayName || "";


        try {

            const userRef =
                doc(
                    db,
                    "users",
                    user.uid
                );


            const snapshot =
                await getDoc(userRef);


            if (snapshot.exists()) {

                const data =
                    snapshot.data();


                fullName.value =
                    data.fullName ||
                    user.displayName ||
                    "";


                phone.value =
                    data.phone || "";


                address.value =
                    data.address || "";


                landmark.value =
                    data.landmark || "";


                city.value =
                    data.city || "";


                state.value =
                    data.state || "";


                pincode.value =
                    data.pincode || "";


                country.value =
                    data.country ||
                    "India";

            }

        } catch (error) {

            console.error(
                "Profile loading error:",
                error
            );

            showMessage(
                "Profile could not be loaded."
            );

        }

    }
);



/* ================= SAVE PROFILE ================= */

form.addEventListener(
    "submit",
    async (event) => {

        event.preventDefault();


        const user =
            auth.currentUser;


        if (!user) {

            window.location.href =
                "login.html";

            return;

        }


        const mobile =
            phone.value.trim();


        const pin =
            pincode.value.trim();


        /* MOBILE VALIDATION */

        if (
            mobile &&
            !/^[0-9]{10}$/.test(mobile)
        ) {

            showMessage(
                "Please enter a valid 10-digit mobile number."
            );

            return;

        }


        /* PIN VALIDATION */

        if (
            pin &&
            !/^[0-9]{6}$/.test(pin)
        ) {

            showMessage(
                "Please enter a valid 6-digit PIN code."
            );

            return;

        }


        try {

            const userRef =
                doc(
                    db,
                    "users",
                    user.uid
                );


            await setDoc(
                userRef,
                {

                    uid:
                        user.uid,

                    fullName:
                        fullName.value.trim(),

                    email:
                        user.email || "",

                    phone:
                        mobile,

                    address:
                        address.value.trim(),

                    landmark:
                        landmark.value.trim(),

                    city:
                        city.value.trim(),

                    state:
                        state.value.trim(),

                    pincode:
                        pin,

                    country:
                        country.value.trim() ||
                        "India",

                    updatedAt:
                        serverTimestamp()

                },
                {
                    merge: true
                }
            );


            showMessage(
                "Profile saved successfully.",
                true
            );


        } catch (error) {

            console.error(
                "Profile save error:",
                error
            );


            showMessage(
                "Profile could not be saved. Please try again."
            );

        }

    }
);



/* ================= LOGOUT ================= */

logoutBtn.addEventListener(
    "click",
    async () => {

        try {

            await signOut(auth);

            window.location.href =
                "index.html";

        } catch (error) {

            console.error(
                "Logout error:",
                error
            );

        }

    }
);
