import { 
  getAuth, 
  signInWithEmailAndPassword 
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";

import { 
  getFirestore, 
  doc, 
  getDoc 
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

const auth = getAuth();
const db = getFirestore();

document.getElementById("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const email = document.getElementById("email").value.trim();
  const pass  = document.getElementById("password").value.trim();

  try {
    const cred = await signInWithEmailAndPassword(auth, email, pass);

    const uid = cred.user.uid;
    const ref = doc(db, "usuarios", uid);
    const snap = await getDoc(ref);

    if (!snap.exists()) {
      alert("Tu usuario no está registrado en el sistema.");
      return;
    }

    const rol = snap.data().rol;

    if (rol === "admin" || rol === "supervisor") {
      location.href = "index.html";
    } else if (rol === "agente") {
      location.href = "portal_agente.html";
    } else {
      alert("Rol no reconocido");
    }

  } catch (err) {
    console.error(err);
    alert("Credenciales incorrectas");
  }
});
