// record.js - POST JSON para registrar en Excel
const fetch = global.fetch || require('node-fetch');
const msal = require('@azure/msal-node');

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const TENANT_ID = process.env.TENANT_ID;
const EXCEL_SHARE_URL = process.env.EXCEL_SHARE_URL || '';
const SCOPES = ['https://graph.microsoft.com/.default'];

if (!CLIENT_ID || !CLIENT_SECRET || !TENANT_ID || !EXCEL_SHARE_URL) {
  console.error('Faltan variables de entorno necesarias');
}

const msalConfig = {
  auth: {
    clientId: CLIENT_ID,
    authority: `https://login.microsoftonline.com/${TENANT_ID}`,
    clientSecret: CLIENT_SECRET
  }
};

const cca = new msal.ConfidentialClientApplication(msalConfig);

async function getAppToken() {
  try {
    const resp = await cca.acquireTokenByClientCredential({ scopes: SCOPES });
    return resp.accessToken;
  } catch (e) {
    console.error('Error obteniendo token MSAL:', e);
    throw new Error('Error obteniendo token de Microsoft Graph');
  }
}

// Convierte enlace de OneDrive a ShareId
function urlToShareId(url) {
  if (!url) throw new Error('EXCEL_SHARE_URL vacío');
  const b64 = Buffer.from(url).toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/,'');
  return `u!${b64}`;
}

async function getDriveItemFromShare(shareUrl, token) {
  try {
    const shareId = urlToShareId(shareUrl);
    const url = `https://graph.microsoft.com/v1.0/shares/${shareId}/driveItem`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const text = await res.text();
    if (!res.ok) throw new Error(`Graph API error: ${text}`);
    return JSON.parse(text);
  } catch (e) {
    console.error('Error en getDriveItemFromShare:', e);
    throw e;
  }
}

async function addTableRow(driveId, itemId, tableName, rowValues, token) {
  try {
    const url = `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}/workbook/tables('${tableName}')/rows/add`;
    const body = { values: [rowValues] };
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`Graph API add row error: ${text}`);
    return JSON.parse(text);
  } catch (e) {
    console.error('Error agregando fila:', e);
    throw e;
  }
}

function safeJsonStringify(obj) {
  try { return JSON.stringify(obj || []); } catch { return '[]'; }
}

// ------------------- HANDLER -------------------
exports.handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, body: JSON.stringify({ ok:false, message:'Método no permitido' }) };
    }

    const data = JSON.parse(event.body || '{}');

    // Validación mínima
    if (!data.idLlamada || !data.idContacto) {
      return { statusCode: 400, body: JSON.stringify({ ok:false, message:'Faltan idLlamada o idContacto' }) };
    }

    const token = await getAppToken();
    const driveItem = await getDriveItemFromShare(EXCEL_SHARE_URL, token);
    const driveId = driveItem.parentReference.driveId;
    const itemId = driveItem.id;

    // Preparar fila para Excel
    const rowValues = [
      data.idLlamada || '',
      new Date().toISOString(),        // fechaHora
      data.asesor || '',
      data.cargo || '',
      data.idLlamada || '',            // idLlamada repetido
      data.idContacto || '',           // idContacto
      data.tipo || '',
      data.cliente?.dni || '',
      data.cliente?.nombre || '',
      data.cliente?.tel || '',
      data.tipificacion || '',
      data.observacionCliente || '',
      data.resumen || '',
      '',                               // nota libre opcional
      '',                               // reincidencia automática
      safeJsonStringify(data.items),    // items
      safeJsonStringify(data.images),   // images
      '',                               // estado
      '',                               // compromiso
      ''                                // firmaUrl
    ];

    await addTableRow(driveId, itemId, 'Registros', rowValues, token);

    return { statusCode: 200, body: JSON.stringify({ ok:true, message:'Registro agregado correctamente' }) };

  } catch (err) {
    console.error('Error en handler record.js:', err);
    return { statusCode:500, body: JSON.stringify({ ok:false, message: err.message }) };
  }
};
