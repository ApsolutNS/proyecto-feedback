// register.js
const { google } = require('googleapis');

function getGoogleAuth() {
  const creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
  return new google.auth.GoogleAuth({
    credentials: creds,
    scopes: [
      "https://www.googleapis.com/auth/spreadsheets",
      "https://www.googleapis.com/auth/drive"
    ]
  });
}

async function uploadBase64Image(auth, base64, folderId, filename) {
  const drive = google.drive({ version: "v3", auth });

  const buffer = Buffer.from(base64.replace(/^data:image\/\w+;base64,/, ""), "base64");

  const file = await drive.files.create({
    requestBody: {
      name: filename,
      parents: [folderId]
    },
    media: {
      mimeType: "image/png",
      body: buffer
    }
  });

  return `https://drive.google.com/uc?id=${file.data.id}`;
}

exports.handler = async (event) => {
  try {
    const body = JSON.parse(event.body || "{}");

    const auth = getGoogleAuth();
    const sheets = google.sheets({ version: "v4", auth });

    const {
      id, fechaHora, asesor, cargo, idLlamada, idContacto,
      tipo, cliente, tipificacion, observacionCliente,
      resumen, nota, reincidencia, items, images, firma
    } = body;

    // Guardar imágenes
    const folderId = process.env.GOOGLE_FOLDER_ID;
    let uploadedImages = [];
    for (let i = 0; i < images.length; i++) {
      uploadedImages.push(
        await uploadBase64Image(auth, images[i], folderId, `img_${id}_${i}.png`)
      );
    }

    // Guardar firma
    let firmaUrl = "";
    if (firma) {
      firmaUrl = await uploadBase64Image(auth, firma, folderId, `firma_${id}.png`);
    }

    await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: "Registros!A1",
      valueInputOption: "RAW",
      requestBody: {
        values: [[
          id, fechaHora, asesor, cargo, idLlamada, idContacto, tipo,
          cliente.dni, cliente.nombre, cliente.tel,
          tipificacion, observacionCliente, resumen, nota,
          reincidencia, JSON.stringify(items), JSON.stringify(uploadedImages),
          "ABIERTO", "", firmaUrl
        ]]
      }
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true })
    };

  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: err.message }) };
  }
};
