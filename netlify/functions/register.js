// register.js - Guarda registros en Google Sheets con ID corto UUIDv4
const { google } = require("googleapis");
const crypto = require("crypto");

function uuidShort() {
  return "id_" + crypto.randomUUID().replace(/-/g, "").slice(0, 8);
}

exports.handler = async (event) => {
  try {
    const body = JSON.parse(event.body || "{}");

    if (!body.asesor || !body.idLlamada) {
      return {
        statusCode: 400,
        body: JSON.stringify({ ok: false, error: "Faltan datos obligatorios" }),
      };
    }

    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT),
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });

    const sheets = google.sheets({ version: "v4", auth });

    const SPREADSHEET_ID = process.env.GOOGLE_SHEET_ID;
    const RANGE = "Registros!A:Z";

    // 🎯 Generar ID corto UUIDv4
    const id = uuidShort();

    // Preparar fila EXACTA para tus columnas:
    // A: ID
    // B: FechaHora
    // C: Asesor
    // D: Cargo
    // E: ID Llamada
    // F: ID Contacto
    // G: Tipo
    // H: DNI Cliente
    // I: Nombre Cliente
    // J: Tel Cliente
    // K: Tipificación
    // L: Observación
    // M: Resumen
    // N: Nota
    // O: Reincidencia
    // P: Items
    // Q: Images
    // R: Estado
    // S: Compromiso
    // T: FirmaUrl

    const row = [
      id,
      new Date().toISOString(),
      body.asesor || "",
      body.cargo || "",
      body.idLlamada || "",
      body.idContacto || "",
      body.tipo || "",
      body.cliente?.dni || "",
      body.cliente?.nombre || "",
      body.cliente?.tel || "",
      body.tipificacion || "",
      body.observacionCliente || "",
      body.resumen || "",
      body.nota || "",
      body.reincidencia || "",
      JSON.stringify(body.items || []),
      JSON.stringify(body.images || []),
      "",           // Estado (vacío al inicio)
      "",           // Compromiso (vacío al inicio)
      ""            // FirmaUrl (vacío al inicio)
    ];

    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: RANGE,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [row] },
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, id }),
    };

  } catch (err) {
    console.error(err);
    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false, error: err.message }),
    };
  }
};
