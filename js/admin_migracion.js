"use strict";

import { db } from "./firebase.js";
import {
  collection,
  getDocs,
  updateDoc,
  doc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

async function migrarRefuerzos() {
  const log = document.getElementById("log");
  const refuerzosRef = collection(db, "refuerzos_calidad");
  const snap = await getDocs(refuerzosRef);

  let total = 0;

  for (const d of snap.docs) {
    const r = d.data();

    // SOLO refuerzos antiguos
    if (r.responsableFirmaUrl) continue;

    await updateDoc(doc(db, "refuerzos_calidad", d.id), {
      responsableFirmaUrl: r.responsableFirmaUrl || r.responsableFirma || "",
      responsableNombre: r.responsableNombre || r.responsable?.split(" - ")[0] || "",
      responsableCargo: r.responsableCargo || "Líder de Calidad y Formación",
      migratedAt: serverTimestamp()
    });

    total++;
    log.innerHTML += `✅ Migrado: ${d.id}<br>`;
  }

  log.innerHTML += `<br><b>✔ Migración completa. Total: ${total}</b>`;
}

document.getElementById("btnMigrar").addEventListener("click", migrarRefuerzos);
