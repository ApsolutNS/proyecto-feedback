import { auth } from "./firebase.js";
import { 
  signInWithEmailAndPassword 
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";

document.getElementById("btnLogin").addEventListener("click", login);

async function login() {
  const email = document.getElementById("email").value.trim();
  const pass = document.getElementById("password").value.trim();

  const msg = document.getElementById("errorMsg");
  msg.textContent = "";

  try {
    const user = await signInWithEmailAndPassword(auth, email, pass);

    // Redirección automática:
    location.href = "index.html";

  } catch (err) {
    msg.textContent = "Credenciales inválidas";
    console.error(err);
  }
}
