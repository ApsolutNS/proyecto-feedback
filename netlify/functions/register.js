import { GoogleSpreadsheet } from "google-spreadsheet";
import { JWT } from "google-auth-library";
import { v4 as uuidv4 } from "uuid";

export const handler = async (event) => {
  try {

    const body = JSON.parse(event.body || "{}");

    // ID único requerido por visualización-feedback
    const uid = uuidv4().split("-")[0].toUpperCase();

    // Formato fecha Perú correcto
    const fechaPeru = new Intl.DateTimeFormat("es-PE", {
      dateStyle: "short",
      timeStyle: "medium",
      hour12: false,
      timeZone: "America/Lima"
    }).format(new Date());

    // Limpieza para Google Sheets
    const fix = (v) => (v === undefined || v === null ? "" : v);

    // Inicializar Google Sheets
    const serviceAccountAuth = new JWT({
      email: process.env.GOOGLE_SERVICE_EMAIL,
      key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
      scopes: ["https://www.googleapis.com/auth/spreadsheets"]
    });

    const doc = new GoogleSpreadsheet(process.env.GOOGLE_SHEET_ID, serviceAccountAuth);
    await doc.loadInfo();
    const sheet = doc.sheetsByTitle["Registros"];

    // Preparar items como texto plano
    const itemsText = (body.items || [])
      .map(i => `${i.name} (${i.perc}%): ${i.detail}`)
      .join("\n");

    // Insertar fila
    await sheet.addRow({
      UID: uid,
      Fecha: fechaPeru,
      Asesor: fix(body.asesor),
      Cargo: fix(body.cargo),

      ID_Llamada: fix(body.idLlamada),
      ID_Contacto: fix(body.idContacto),
      Tipo: fix(body.tipo),

      Cliente_DNI: fix(body.clienteDni),
      Cliente_Nombre: fix(body.clienteNombre),
      Cliente_Tel: fix(body.clienteTel),

      Tipificación: fix(body.tipificacion),
      Observación: fix(body.observacionCliente),
      Resumen: fix(body.resumen),

      Nota: fix(body.nota),
      Compromiso: fix(body.compromiso),
      Firma_URL: fix(body.firmaUrl),

      Items: itemsText,
      Imagenes: (body.images || []).map(i => i.name).join(", ")
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        message: "Registro guardado correctamente",
        uid
      })
    };

  } catch (err) {
    console.error("❌ Error en register:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false, message: err.message })
    };
  }
};
