// record.js
const { google } = require('googleapis');

function getGoogleAuth() {
  const creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
  return new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"]
  });
}

exports.handler = async (event) => {
  try {
    const id = event.queryStringParameters?.id;
    if (!id) return { statusCode: 400, body: "Falta id" };

    const auth = getGoogleAuth();
    const sheets = google.sheets({ version: "v4", auth });

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: "Registros!A:T"
    });

    const rows = res.data.values || [];

    const row = rows.find(r => r[0] === id);
    if (!row) return { statusCode: 404, body: "No encontrado" };

    const record = {
      id: row[0],
      fechaHora: row[1],
      asesor: row[2],
      cargo: row[3],
      idLlamada: row[4],
      idContacto: row[5],
      tipo: row[6],
      cliente: {
        dni: row[7],
        nombre: row[8],
        tel: row[9]
      },
      tipificacion: row[10],
      observacionCliente: row[11],
      resumen: row[12],
      nota: row[13],
      reincidencia: row[14],
      items: JSON.parse(row[15] || "[]"),
      images: JSON.parse(row[16] || "[]"),
      estado: row[17],
      compromiso: row[18],
      firmaUrl: row[19]
    };

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, record })
    };

  } catch (err) {
    return { statusCode: 500, body: err.message };
  }
};
