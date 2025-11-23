// records.js - Obtener todos los registros desde Google Sheets
const { google } = require("googleapis");

exports.handler = async () => {
  try {
    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT),
      scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
    });

    const sheets = google.sheets({ version: "v4", auth });

    const SPREADSHEET_ID = process.env.GOOGLE_SHEET_ID;

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: "Registros!A:T", // A → T = 20 columnas
    });

    const rows = res.data.values || [];
    if (rows.length < 2) {
      return {
        statusCode: 200,
        body: JSON.stringify({ ok: true, count: 0, records: [] })
      };
    }

    // Encabezados EXACTOS según tus 20 columnas
    const headers = [
      "ID","FechaHora","Asesor","Cargo","ID Llamada","ID Contacto","Tipo",
      "DNI Cliente","Nombre Cliente","Tel Cliente","Tipificación","Observación",
      "Resumen","Nota","Reincidencia","Items","Images","Estado","Compromiso","FirmaUrl"
    ];

    const items = rows.slice(1).map(row => {
      const obj = {};

      headers.forEach((header, index) => {
        obj[header] = row[index] ?? "";
      });

      // Parse seguro de JSON
      try {
        obj.Items = obj.Items ? JSON.parse(obj.Items) : [];
      } catch {
        obj.Items = [];
      }

      try {
        obj.Images = obj.Images ? JSON.parse(obj.Images) : [];
      } catch {
        obj.Images = [];
      }

      return obj;
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        count: items.length,
        records: items
      })
    };

  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        ok: false,
        error: err.message
      })
    };
  }
};
