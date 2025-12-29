"use strict";

import { db } from "./firebase.js";
import {
  collection,
  getDocs,
  updateDoc,
  doc
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

/* ==============================
   MIGRACIÓN REFUERZOS ANTIGUOS
   ============================== */

async function migrarRefuerzosAntiguos() {
  console.log("🚀 Iniciando migración de refuerzos antiguos...");

  /* 1️⃣ Obtener Líder de Calidad activo */
  const snapRegs = await getDocs(collection(db, "registradores"));

  const lider = snapRegs.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .find(r =>
      r.activo === true &&
      r.cargo === "Líder de Calidad y Formación" &&
      r.firmaUrl
    );

  if (!lider) {
    console.error("❌ No existe Líder de Calidad activo con firma");
    return;
  }

  console.log("✅ Líder detectado:", lider.registradoPorNombre);

  /* 2️⃣ Obtener refuerzos */
  const snapRef = await getDocs(collection(db, "refuerzos_calidad"));

  let migrados = 0;

  for (const d of snapRef.docs) {
    const data = d.data();

    // ⛔ Saltar si ya tiene firma
    if (data.responsableFirmaUrl) continue;

    // ⛔ Saltar si es un refuerzo incompleto muy antiguo (opcional)
    if (!data.fechaRefuerzo) continue;

    const ref = doc(db, "refuerzos_calidad", d.id);

    await updateDoc(ref, {
      responsable: `${lider.registradoPorNombre} - ${lider.cargo}`,
      responsableId: lider.registradorId || lider.id,
      responsableNombre: lider.registradoPorNombre,
      responsableCargo: lider.cargo,
      responsableFirmaUrl: lider.firmaUrl,
      migradoResponsable: true
    });

    migrados++;
    console.log(`✔ Migrado refuerzo ${d.id}`);
  }

  console.log(`🎉 Migración finalizada. Refuerzos actualizados: ${migrados}`);
}

/* EJECUTAR */
migrarRefuerzosAntiguos()
  .then(() => console.log("✅ Script terminado"))
  .catch(err => console.error("❌ Error en migración:", err));
