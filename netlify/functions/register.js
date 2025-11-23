// register.js - Guarda registros en Google Sheets con ID corto UUIDv4
const { google } = require("googleapis");
const crypto = require("crypto");

function uuidShort() {
  return "id_" + crypto.randomUUID().replace(/-/g, "").slice(0, 8);
}

exports.handler = async (event) => {
  try {
    const body = JSON.parse(event.body || "{}");

    // Validación mínima
    if (!body.asesor || !body.idLlamada) {
      return {
        statusCode: 400,
        body: JSON.stringify({ ok: false, error: "Faltan datos obligatorios" }),
      };
    }

    // Google Auth
    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT),
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });

    const sheets = google.sheets({ version: "v4", auth });

    const SPREADSHEET_ID = process.env.GOOGLE_SHEET_ID;

    // 🔥 Solo 1 range, el correcto:
    const RANGE = "Registros!A:T";

    // Generar ID único corto
    const id = uuidShort();

    // Armar fila EXACTA para columnas A–T (20 columnas)
    const row = [
      id,                              // A - ID
      new Date().toISOString(),        // B - FechaHora
      body.asesor || "",               // C - Asesor
      body.cargo || "",                // D - Cargo
      body.idLlamada || "",            // E - ID Llamada
      body.idContacto || "",           // F - ID Contacto
      body.tipo || "",                 // G - Tipo
      body.cliente?.dni || "",         // H - DNI Cliente
      body.cliente?.nombre || "",      // I - Nombre Cliente
      body.cliente?.tel || "",         // J - Tel Cliente
      body.tipificacion || "",         // K - Tipificación
      body.observacionCliente || "",   // L - Observación
      body.resumen || "",              // M - Resumen
      body.nota || "",                 // N - Nota %
      body.reincidencia || "",         // O - Reincidencia
      JSON.stringify(body.items || []),// P - Items
      JSON.stringify(body.images || []),// Q - Images
      body.estado || "",               // R - Estado
      body.compromiso || "",           // S - Compromiso
      body.firmaUrl || ""              // T - FirmaUrl
    ];

    // Escribir fila en Sheets
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
    console.error("ERROR REGISTER:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false, error: err.message }),
    };
  }
};
