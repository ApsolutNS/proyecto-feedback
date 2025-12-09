import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { 
  getAuth, signInWithEmailAndPassword, onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";

// -----------------------------
// CONFIG FIREBASE
// -----------------------------
const firebaseConfig = {
  apiKey: "TU_API_KEY",
  authDomain: "feedback-app-ac30e.firebaseapp.com",
  projectId: "feedback-app-ac30e"
};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// -----------------------------
// LISTA DE CORREOS AUTORIZADOS
// -----------------------------
const allowedEmails = [
  "alex@ejemplo.com",
  "lidercalidad@empresa.com",
  "supervisor@empresa.com"
];

// -----------------------------
// LOGIN
// -----------------------------
document.getElementById("loginBtn").onclick = async () => {
  const email = emailInput.value.trim();
  const pass = password.value;

  if (!allowedEmails.includes(email)) {
    showError("❌ Este correo no está autorizado.");
    return;
  }

  try {
    await signInWithEmailAndPassword(auth, email, pass);
    location.href = "index.html"; // dashboard
  } catch (err) {
    showError("Credenciales inválidas.");
  }
};

function showError(msg){
  const e = document.getElementById("error");
  e.style.display = "block";
  e.textContent = msg;
}

// -----------------------------
// SI YA ESTÁ LOGUEADO → ENTRA DIRECTO
// -----------------------------
onAuthStateChanged(auth, user => {
  if (user) location.href = "index.html";
});
