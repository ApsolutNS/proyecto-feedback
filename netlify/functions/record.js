// record.js - GET ?id=... desde Google Sheets
const { google } = require("googleapis");

function getAuth() {
  return new google.auth.GoogleAuth({
    credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT),
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
}

exports.handler = async (event) => {
  try {
    const id = event.queryStringParameters?.id;
    if (!id) {
      return { statusCode: 400, body: JSON.stringify({ ok: false, message: "Falta id" }) };
    }

    const auth = getAuth();
    const sheets = google.sheets({ version: "v4", auth });

    const SPREADSHEET_ID = process.env.GOOGLE_SHEET_ID;

    const resp = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: "Registros!A2:T",
    });

    const rows = resp.data.values || [];
    const v = rows.find((r) => r[0] === id);

    if (!v) {
      return { statusCode: 404, body: JSON.stringify({ ok: false, message: "No encontrado" }) };
    }

    const record = {
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
      firmaUrl: v[19]
    };

    return { statusCode: 200, body: JSON.stringify({ ok: true, record }) };

  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false, message: err.message }),
    };
  }
};
