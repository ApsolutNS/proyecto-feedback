import { app, db } from "./firebase.js";
import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-storage.js";

import {
  collection,
  getDocs,
  updateDoc,
  doc
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

const storage = getStorage(app);

async function obtenerLiderActivo() {
  const snap = await getDocs(collection(db, "registradores"));
  const lider = snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .find(r =>
      r.activo === true &&
      r.cargo === "Líder de Calidad y Formación"
    );

  if (!lider) {
    throw new Error("No existe Líder de Calidad activo");
  }
  return lider;
}

document.getElementById("btnSubir").addEventListener("click", async () => {
  const file = document.getElementById("firma").files[0];
  const msg = document.getElementById("msg");

  if (!file) {
    msg.textContent = "Selecciona una imagen";
    return;
  }

  try {
    msg.textContent = "Subiendo…";

    const lider = await obtenerLiderActivo();

    const fileRef = ref(
      storage,
      `firmas/lider_calidad_${lider.id}.png`
    );

    await uploadBytes(fileRef, file);
    const url = await getDownloadURL(fileRef);

    await updateDoc(doc(db, "registradores", lider.id), {
      firmaUrl: url
    });

    msg.textContent = "✅ Firma cargada correctamente";
  } catch (e) {
    console.error(e);
    msg.textContent = e.message;
  }
});
