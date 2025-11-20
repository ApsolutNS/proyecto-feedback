// complete.js - Actualiza Estado y Compromiso en columnas R y S
const { google } = require("googleapis");

function getAuth() {
  return new google.auth.GoogleAuth({
    credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
}

exports.handler = async (event) => {
  try {
    const body = JSON.parse(event.body || "{}");
    const { id, estado, compromiso } = body;

    if (!id) return { statusCode: 400, body: "Falta id" };

    const auth = getAuth();
    const sheets = google.sheets({ version: "v4", auth });

    const SPREADSHEET_ID = process.env.GOOGLE_SHEET_ID;

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: "Registros!A:T",
    });

    const rows = res.data.values || [];
    const idx = rows.findIndex(r => r[0] === id);

    if (idx === -1) return { statusCode: 404, body: "No encontrado" };

    const rowNumber = idx + 1;

    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `Registros!R${rowNumber}:S${rowNumber}`,
      valueInputOption: "RAW",
      requestBody: { values: [[estado, compromiso]] }
    });

    return { statusCode: 200, body: JSON.stringify({ ok: true }) };

  } catch (err) {
    return { statusCode: 500, body: err.message };
  }
};
