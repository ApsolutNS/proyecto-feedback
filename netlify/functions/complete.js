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
    const { id, estado, compromiso, firmaUrl } = body;

    if (!id) return { statusCode: 400, body: "Falta id" };

    const auth = getGoogleAuth();
    const sheets = google.sheets({ version: "v4", auth });

    const sheetId = process.env.GOOGLE_SHEET_ID;

    // Leer registros
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: "Registros!A:T" // incluye columnas A–T
    });

    const rows = res.data.values || [];
    const headerOffset = 1;

    // Buscar ID
    const index = rows.findIndex(r => r[0] === id);
    if (index === -1) return { statusCode: 404, body: "No encontrado" };

    const rowNumber = index + 1;

    // R = 18 → índice 17
    // S = 19 → índice 18
    // T = 20 → índice 19

    await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: `Registros!R${rowNumber}:T${rowNumber}`,
      valueInputOption: "RAW",
      requestBody: { values: [[estado || "", compromiso || "", firmaUrl || ""]] }
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true })
    };

  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: err.message };
  }
};
