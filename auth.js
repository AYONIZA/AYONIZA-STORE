import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";

import {
  getAuth,
  onAuthStateChanged,
  signOut,
  signInWithPopup,
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import { firebaseConfig } from "./firebase-config.js";


// =====================================================
// FIREBASE START
// =====================================================

const app = initializeApp(firebaseConfig);

const auth = getAuth(app);

const db = getFirestore(app);


// =====================================================
// GLOBAL AUTH STATE
// =====================================================

let currentUser = null;
let authReady = false;


// =====================================================
// FIRESTORE USER PROFILE
// =====================================================

async function saveUserToFirestore(user) {

  if (!user) {
    throw new Error("Firebase user not found.");
  }

  const userRef = doc(
    db,
    "users",
    user.uid
  );

  try {

    const existingUser =
      await getDoc(userRef);


    // ---------------------------------------------
    // NEW USER
    // ---------------------------------------------

    if (!existingUser.exists()) {

      await setDoc(userRef, {

        uid: user.uid,

        fullName:
          user.displayName || "",

        email:
          user.email || "",

        phone: "",

        address: "",

        city: "",

        state: "",

        pincode: "",

        createdAt:
          serverTimestamp(),

        updatedAt:
          serverTimestamp()

      });

      console.log(
        "Firestore: NEW USER SAVED",
        user.uid
      );

    }


    // ---------------------------------------------
    // EXISTING USER
    // ---------------------------------------------

    else {

      await setDoc(
        userRef,
        {

          uid: user.uid,

          email:
            user.email || "",

          fullName:
            user.displayName ||
            existingUser.data().fullName ||
            "",

          updatedAt:
            serverTimestamp()

        },
        {
          merge: true
        }
      );

      console.log(
        "Firestore: USER UPDATED",
        user.uid
      );

    }

  } catch (error) {

    console.error(
      "Firestore save error:",
      error
    );

    throw error;
  }
}


// =====================================================
// NAVBAR LOGIN / LOGOUT
// =====================================================

const authLink =
  document.getElementById("authLink");

const authLinkMobile =
  document.getElementById(
    "authLinkMobile"
  );


function setAuthLink(
  element,
  user
) {

  if (!element) return;


  // USER LOGGED IN
  if (user) {

    const firstName =
      (
        user.displayName ||
        user.email?.split("@")[0] ||
        "Account"
      )
      .split(" ")[0];


    element.textContent =
      "Logout (" +
      firstName +
      ")";


    element.href = "#";


    element.onclick =
      async function (event) {

        event.preventDefault();

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

      };

  }


  // USER NOT LOGGED IN
  else {

    element.textContent =
      "Login";

    element.href =
      "login.html";

    element.onclick =
      null;

  }
}


// =====================================================
// AUTH STATE LISTENER
// =====================================================

onAuthStateChanged(
  auth,
  (user) => {

    currentUser = user;

    authReady = true;

    setAuthLink(
      authLink,
      user
    );

    setAuthLink(
      authLinkMobile,
      user
    );

  }
);


// =====================================================
// LOGIN PAGE
// =====================================================

const authForm =
  document.getElementById(
    "authForm"
  );


if (authForm) {

  const authMsg =
    document.getElementById(
      "authMsg"
    );

  const nameField =
    document.getElementById(
      "nameField"
    );

  const submitBtn =
    document.getElementById(
      "submitBtn"
    );

  const tabs =
    document.querySelectorAll(
      ".tab"
    );

  const googleBtn =
    document.getElementById(
      "googleBtn"
    );

  const forgotBtn =
    document.getElementById(
      "forgotBtn"
    );


  let mode = "login";


  // ---------------------------------------------
  // MESSAGE
  // ---------------------------------------------

  function showMessage(
    message,
    success = false
  ) {

    if (!authMsg) return;

    authMsg.textContent =
      message;

    authMsg.className =
      success
        ? "msg ok"
        : "msg err";
  }


  // ---------------------------------------------
  // FRIENDLY FIREBASE ERRORS
  // ---------------------------------------------

  function firebaseError(
    code
  ) {

    const errors = {

      "auth/invalid-email":
        "Please enter a valid email address.",

      "auth/missing-password":
        "Please enter your password.",

      "auth/weak-password":
        "Password must be at least 6 characters.",

      "auth/email-already-in-use":
        "This email already has an account. Please login.",

      "auth/invalid-credential":
        "Email or password is incorrect.",

      "auth/user-not-found":
        "No account found with this email.",

      "auth/wrong-password":
        "Email or password is incorrect.",

      "auth/too-many-requests":
        "Too many attempts. Please wait and try again.",

      "auth/popup-closed-by-user":
        "Google login window was closed.",

      "auth/unauthorized-domain":
        "This domain is not authorized in Firebase.",

      "auth/api-key-not-valid.-please-pass-a-valid-api-key.":
        "Firebase API key is invalid.",

      "permission-denied":
        "Firestore permission denied. Please check Firestore Rules.",

      "failed-precondition":
        "Firestore configuration is incomplete.",

      "unavailable":
        "Firebase service is temporarily unavailable."

    };

    return (
      errors[code] ||
      "Something went wrong: " +
      code
    );
  }


  // ---------------------------------------------
  // LOGIN / SIGNUP TAB
  // ---------------------------------------------

  tabs.forEach(
    (tab) => {

      tab.addEventListener(
        "click",
        () => {

          mode =
            tab.dataset.mode;


          tabs.forEach(
            (item) => {

              item.classList.toggle(
                "active",
                item === tab
              );

            }
          );


          if (nameField) {

            nameField.hidden =
              mode !== "signup";

          }


          if (submitBtn) {

            submitBtn.textContent =
              mode === "signup"
                ? "Create account"
                : "Log in";

          }


          if (authMsg) {

            authMsg.textContent =
              "";

            authMsg.className =
              "msg";

          }

        }
      );

    }
  );


  // ---------------------------------------------
  // OPEN SIGNUP MODE
  // ---------------------------------------------

  const urlMode =
    new URLSearchParams(
      window.location.search
    ).get("mode");


  if (urlMode === "signup") {

    const signupTab =
      [...tabs].find(
        (tab) =>
          tab.dataset.mode ===
          "signup"
      );


    if (signupTab) {

      signupTab.click();

    }

  }


  // ---------------------------------------------
  // HOME
  // ---------------------------------------------

  function goHome() {

    window.location.href =
      "index.html";

  }


  // =================================================
  // EMAIL LOGIN / SIGNUP
  // =================================================

  authForm.addEventListener(
    "submit",
    async (event) => {

      event.preventDefault();


      const email =
        authForm.email.value.trim();

      const password =
        authForm.password.value;


      if (!email) {

        showMessage(
          "Please enter your email."
        );

        return;

      }


      if (!password) {

        showMessage(
          "Please enter your password."
        );

        return;

      }


      if (submitBtn) {

        submitBtn.disabled = true;

      }


      try {


        // =========================================
        // SIGN UP
        // =========================================

        if (mode === "signup") {

          const fullName =
            authForm.fullname
              ? authForm.fullname.value.trim()
              : "";


          if (!fullName) {

            showMessage(
              "Please enter your full name."
            );

            if (submitBtn) {
              submitBtn.disabled = false;
            }

            return;

          }


          // CREATE FIREBASE AUTH USER

          const credential =
            await createUserWithEmailAndPassword(
              auth,
              email,
              password
            );


          const user =
            credential.user;


          // SAVE NAME IN FIREBASE AUTH

          await updateProfile(
            user,
            {
              displayName:
                fullName
            }
          );


          // SAVE USER IN FIRESTORE

          try {

            await saveUserToFirestore(
              user
            );

          } catch (firestoreError) {

            console.error(
              "Firestore ERROR:",
              firestoreError
            );


            showMessage(
              "Account created, but profile could not be saved. Error: " +
              (
                firestoreError.code ||
                firestoreError.message
              )
            );


            if (submitBtn) {
              submitBtn.disabled = false;
            }

            return;

          }


          showMessage(
            "Account created successfully!",
            true
          );


          setTimeout(
            goHome,
            800
          );

        }


        // =========================================
        // LOGIN
        // =========================================

        else {

          const credential =
            await signInWithEmailAndPassword(
              auth,
              email,
              password
            );


          const user =
            credential.user;


          // MAKE SURE FIRESTORE PROFILE EXISTS

          try {

            await saveUserToFirestore(
              user
            );

          } catch (firestoreError) {

            console.error(
              "Firestore login save error:",
              firestoreError
            );


            showMessage(
              "Login successful, but Firestore profile could not be saved. Error: " +
              (
                firestoreError.code ||
                firestoreError.message
              )
            );


            if (submitBtn) {
              submitBtn.disabled = false;
            }

            return;

          }


          goHome();

        }

      } catch (error) {

        console.error(
          "Authentication error:",
          error
        );


        showMessage(
          firebaseError(
            error.code
          )
        );

      } finally {

        if (submitBtn) {

          submitBtn.disabled =
            false;

        }

      }

    }
  );


  // =================================================
  // GOOGLE LOGIN
  // =================================================

  if (googleBtn) {

    googleBtn.addEventListener(
      "click",
      async () => {

        googleBtn.disabled = true;


        try {

          const provider =
            new GoogleAuthProvider();


          const result =
            await signInWithPopup(
              auth,
              provider
            );


          // SAVE GOOGLE USER TO FIRESTORE

          try {

            await saveUserToFirestore(
              result.user
            );

          } catch (firestoreError) {

            console.error(
              "Google Firestore error:",
              firestoreError
            );


            showMessage(
              "Google login successful, but profile could not be saved. Error: " +
              (
                firestoreError.code ||
                firestoreError.message
              )
            );


            googleBtn.disabled = false;

            return;

          }


          goHome();

        } catch (error) {

          console.error(
            "Google login error:",
            error
          );


          showMessage(
            firebaseError(
              error.code
            )
          );

        } finally {

          googleBtn.disabled = false;

        }

      }
    );

  }


  // =================================================
  // FORGOT PASSWORD
  // =================================================

  if (forgotBtn) {

    forgotBtn.addEventListener(
      "click",
      async () => {

        const email =
          authForm.email.value.trim();


        if (!email) {

          showMessage(
            "Enter your email first."
          );

          return;

        }


        try {

          await sendPasswordResetEmail(
            auth,
            email
          );


          showMessage(
            "Password reset link sent to " +
            email +
            ". Check your inbox and spam folder.",
            true
          );

        } catch (error) {

          console.error(
            "Password reset error:",
            error
          );


          showMessage(
            firebaseError(
              error.code
            )
          );

        }

      }
    );

  }

}


// =====================================================
// LOGIN REQUIRED FOR PURCHASE
// =====================================================

const PROTECTED_SELECTOR =
  ".add-cart-btn, .product-button, #checkoutBtn";


function showLoginToast(
  message
) {

  const oldToast =
    document.getElementById(
      "loginToast"
    );


  if (oldToast) {

    oldToast.remove();

  }


  const toast =
    document.createElement(
      "div"
    );


  toast.id =
    "loginToast";


  toast.textContent =
    message;


  toast.style.cssText =
    "position:fixed;" +
    "left:50%;" +
    "bottom:28px;" +
    "transform:translateX(-50%);" +
    "background:#3a2530;" +
    "color:#fff;" +
    "padding:12px 20px;" +
    "border-radius:8px;" +
    "font-size:15px;" +
    "z-index:99999;" +
    "max-width:90%;" +
    "text-align:center;";


  document.body.appendChild(
    toast
  );

}


document.addEventListener(
  "click",
  (event) => {

    const target =
      event.target.closest(
        PROTECTED_SELECTOR
      );


    if (!target) return;


    // User logged in
    if (
      authReady &&
      currentUser
    ) {

      return;

    }


    // Prevent action
    event.preventDefault();

    event.stopImmediatePropagation();


    // Auth still loading
    if (!authReady) {

      return;

    }


    showLoginToast(
      "Please login or create an account before purchasing."
    );


    setTimeout(
      () => {

        window.location.href =
          "login.html?mode=signup";

      },
      1200
    );

  },
  true
);


// =====================================================
// PRODUCT CARD → PRODUCT PAGE
// =====================================================

(function () {

  const style =
    document.createElement(
      "style"
    );


  style.textContent =
    ".product-card{cursor:pointer}";


  document.head.appendChild(
    style
  );


  document.addEventListener(
    "click",
    (event) => {

      const card =
        event.target.closest(
          ".product-card"
        );


      if (!card) return;


      // Buttons / links ko product page par mat bhejo

      if (
        event.target.closest(
          "button, a"
        )
      ) {

        return;

      }


      const cartButton =
        card.querySelector(
          ".add-cart-btn"
        );


      if (!cartButton) {

        return;

      }


      const getText =
        (selector) => {

          const element =
            card.querySelector(
              selector
            );

          return element
            ? element.textContent.trim()
            : "";

        };


      const params =
        new URLSearchParams({

          id:
            cartButton.dataset.id ||
            "",

          name:
            cartButton.dataset.name ||
            "",

          price:
            cartButton.dataset.price ||
            "",

          img:
            cartButton.dataset.image ||
            "",

          cat:
            getText(
              ".product-category"
            ),

          desc:
            getText(
              ".product-description"
            ),

          ptxt:
            getText(
              ".product-price"
            )

        });


      window.location.href =
        "product.html?" +
        params.toString();

    }
  );

})();
