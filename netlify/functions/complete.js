// complete.js
const { google } = require('googleapis');

function getGoogleAuth() {
  return new google.auth.GoogleAuth({
    credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"]
  });
}

exports.handler = async (event) => {
  try {
    const body = JSON.parse(event.body || "{}");
    const { id, estado, compromiso } = body;

    if (!id) return { statusCode: 400, body: "Falta id" };

    const auth = getGoogleAuth();
    const sheets = google.sheets({ version: "v4", auth });

    // Obtener filas
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: "Registros!A:T"
    });

    const rows = res.data.values || [];

    const rowIndex = rows.findIndex(r => r[0] === id);
    if (rowIndex === -1) return { statusCode: 404, body: "No encontrado" };

    // Actualizar columnas S y T (estado, compromiso)
    const rowNumber = rowIndex + 1;

    await sheets.spreadsheets.values.update({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: `Registros!R${rowNumber}:T${rowNumber}`,
      valueInputOption: "RAW",
      requestBody: { values: [[estado, compromiso]] }
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true })
    };

  } catch (err) {
    return { statusCode: 500, body: err.message };
  }
};
