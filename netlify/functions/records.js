// records.js - Obtener todos
const { google } = require("googleapis");

exports.handler = async () => {
  try {
    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT),
      scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
    });

    const sheets = google.sheets({ version: "v4", auth });
    const sheetId = process.env.GOOGLE_SHEET_ID;

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: "Registros!A:T"
    });

    const rows = res.data.values || [];
    const headers = rows[0];
    const items = rows.slice(1).map(r => {
      const obj = {};
      headers.forEach((h, i) => obj[h] = r[i] || "");
      return obj;
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, count: items.length, records: items })
    };

  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false, error: err.message })
    };
  }
};
