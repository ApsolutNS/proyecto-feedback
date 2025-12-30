// js/migracion_refuerzos.js
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
  const el = document.getElementById("log");
  el.textContent += msg + "\n";
};

const btn = document.getElementById("btnMigrar");
const auth = getAuth();

btn.addEventListener("click", async () => {
  btn.disabled = true;
  log("🔄 Iniciando migración...");

  try {
    const snap = await getDocs(collection(db, "refuerzos_calidad"));
    let count = 0;

    for (const d of snap.docs) {
      const data = d.data();

      // ❌ ya migrado → saltar
      if (data.responsableFirmaUrl) continue;

      await updateDoc(doc(db, "refuerzos_calidad", d.id), {
        responsableFirmaUrl: data.responsableFirmaUrl || "",
        responsableNombre: data.responsableNombre || "",
        responsableCargo: data.responsableCargo || "",
      });

      count++;
      log(`✔️ Migrado: ${d.id}`);
    }

    log(`✅ Migración completa. Total: ${count}`);
  } catch (e) {
    console.error(e);
    log("❌ Error: " + e.message);
  } finally {
    btn.disabled = false;
  }
});
