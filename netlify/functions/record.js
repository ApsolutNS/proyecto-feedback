// record.js - Netlify Function para registrar en Excel
const fetch = global.fetch || require('node-fetch');
const msal = require('@azure/msal-node');

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const TENANT_ID = process.env.TENANT_ID;
const EXCEL_SHARE_URL = process.env.EXCEL_SHARE_URL || '';
const SCOPES = ['https://graph.microsoft.com/.default'];

const msalConfig = {
  auth: {
    clientId: CLIENT_ID,
    authority: `https://login.microsoftonline.com/${TENANT_ID}`,
    clientSecret: CLIENT_SECRET
  }
};

const cca = new msal.ConfidentialClientApplication(msalConfig);

// Obtener token MS Graph
async function getAppToken() {
  try {
    const resp = await cca.acquireTokenByClientCredential({ scopes: SCOPES });
    return resp.accessToken;
  } catch (e) {
    console.error('Error obteniendo token MSAL:', e);
    throw new Error('Error obteniendo token de Microsoft Graph');
  }
}

// Convertir URL de compartir a ShareId
function urlToShareId(url) {
  const b64 = Buffer.from(url).toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/,'');
  return `u!${b64}`;
}

// Obtener driveItem desde share URL
async function getDriveItemFromShare(shareUrl, token) {
  const shareId = urlToShareId(shareUrl);
  console.log('ShareId generado:', shareId);
  const url = `https://graph.microsoft.com/v1.0/shares/${shareId}/driveItem`;
  const res = await fetch(url, { headers:{ Authorization: `Bearer ${token}` } });
  const text = await res.text();
  if(!res.ok) throw new Error(`Graph API error getDriveItem: ${text}`);
  return JSON.parse(text);
}

// Agregar fila a tabla Excel
async function addTableRow(driveId, itemId, tableName, rowValues, token) {
  const url = `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}/workbook/tables('${tableName}')/rows/add`;
  const body = { values: [rowValues] };
  const res = await fetch(url, {
    method:'POST',
    headers:{ Authorization:`Bearer ${token}`, 'Content-Type':'application/json' },
    body: JSON.stringify(body)
  });
  const text = await res.text();
  if(!res.ok) throw new Error(`Graph API error addTableRow: ${text}`);
  return JSON.parse(text);
}

// Convierte objeto a JSON seguro
function safeJsonStringify(obj) {
  try { return JSON.stringify(obj || []); } catch { return '[]'; }
}

// ------------------- HANDLER -------------------
exports.handler = async (event) => {
  try {
    if(event.httpMethod !== 'POST') {
      return { statusCode:405, body: JSON.stringify({ ok:false, message:'Método no permitido' }) };
    }

    const data = JSON.parse(event.body || '{}');

    if(!data.idLlamada || !data.idContacto) {
      return { statusCode:400, body: JSON.strin
