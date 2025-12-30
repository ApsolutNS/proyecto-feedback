import { db } from "./firebase.js";
import {
  collection,
  getDocs,
  updateDoc,
  doc
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import {
  getAuth,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";

const log = (msg) => {
  document.getElementById("log").textContent += msg + "\n";
};

const auth = getAuth();

async function migrarRefuerzos() {
  log("🔄 Iniciando migración...");

  // 1️⃣ Obtener líder activo con firma
  const snapRegs = await getDocs(collection(db, "registradores"));
  const lider = snapRegs.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .find(r =>
      r.activo === true &&
      r.cargo === "Líder de Calidad y Formación" &&
      r.firmaUrl
    );

  if (!lider) {
    log("❌ No hay Líder de Calidad activo con firma");
    return;
  }

  log(`✅ Líder encontrado: ${lider.registradoPorNombre}`);

  // 2️⃣ Migrar refuerzos
  const snapRef = await getDocs(collection(db, "refuerzos_calidad"));
  let total = 0;

  for (const d of snapRef.docs) {
    const data = d.data();

    if (!data.responsableFirmaUrl || !data.responsableNombre) {
      await updateDoc(doc(db, "refuerzos_calidad", d.id), {
        responsable: `${lider.registradoPorNombre} - ${lider.cargo}`,
        responsableId: lider.id,
        responsableNombre: lider.registradoPorNombre,
        responsableCargo: lider.cargo,
        responsableFirmaUrl: lider.firmaUrl
      });

      log(`✔ Migrado: ${d.id}`);
      total++;
    }
  }

  log(`🎉 Migración completa. Total: ${total}`);
}

onAuthStateChanged(auth, (user) => {
  if (!user) {
    alert("Debes iniciar sesión como ADMIN");
    location.href = "login.html";
    return;
  }

  document.getElementById("btnMigrar")
    .addEventListener("click", migrarRefuerzos);
});
