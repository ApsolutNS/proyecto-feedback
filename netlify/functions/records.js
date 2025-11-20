// records.js - GET ALL desde Google Sheets
const { google } = require("googleapis");

function getAuth() {
  const creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
  return new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
}

exports.handler = async () => {
  try {
    const auth = getAuth();
    const sheets = google.sheets({ version: "v4", auth });

    const SPREADSHEET_ID = process.env.GOOGLE_SHEET_ID;

    if (!SPREADSHEET_ID) {
      return {
        statusCode: 400,
        body: JSON.stringify({ ok: false, message: "Falta GOOGLE_SHEET_ID" }),
      };
    }

    // Leer filas
    const resp = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: "Registros!A2:T",
    });

    const rows = resp.data.values || [];

    // Mapear filas
    const records = rows.map((v) => ({
      id: v[0],
      fechaHora: v[1],
      asesor: v[2],
      cargo: v[3],
      idLlamada: v[4],
      idContacto: v[5],
      tipo: v[6],
      cliente: { dni: v[7], nombre: v[8], tel: v[9] },
      tipificacion: v[10],
      observacionCliente: v[11],
      resumen: v[12],
      nota: v[13],
      reincidencia: v[14],
      items: JSON.parse(v[15] || "[]"),
      images: JSON.parse(v[16] || "[]"),
      estado: v[17],
      compromiso: v[18],
      firmaUrl: v[19],
    }));

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, count: records.length, records }),
    };
  } catch (err) {
    console.error("ERROR en records.js", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false, message: err.message }),
    };
  }
};
