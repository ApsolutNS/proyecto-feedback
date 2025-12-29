import { db } from "./firebase.js";
import {
  collection,
  getDocs,
  updateDoc,
  doc
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

async function migrarRefuerzosAntiguos() {
  // 1. Obtener líder actual
  const regSnap = await getDocs(collection(db, "registradores"));
  const lider = regSnap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .find(r =>
      r.activo === true &&
      r.cargo === "Líder de Calidad y Formación" &&
      r.firmaUrl
    );

  if (!lider) {
    alert("No hay líder con firma");
    return;
  }

  // 2. Refuerzos
  const refSnap = await getDocs(collection(db, "refuerzos_calidad"));

  let count = 0;

  for (const d of refSnap.docs) {
    const data = d.data();

    // solo refuerzos viejos
    if (!data.responsableFirmaUrl) {
      await updateDoc(doc(db, "refuerzos_calidad", d.id), {
        responsableFirmaUrl: lider.firmaUrl,
        responsableNombre: lider.registradoPorNombre,
        responsableCargo: lider.cargo,
        responsableId: lider.id
      });
      count++;
    }
  }

  alert(`✅ Migración completada: ${count} refuerzos actualizados`);
}

migrarRefuerzosAntiguos();
