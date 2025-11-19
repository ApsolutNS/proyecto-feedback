// record.js
const fetch = global.fetch || require('node-fetch');
const msal = require('@azure/msal-node');

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const TENANT_ID = process.env.TENANT_ID;
const EXCEL_SHARE_URL = process.env.EXCEL_SHARE_URL || '';
const SCOPES = ['https://graph.microsoft.com/.default'];

if(!CLIENT_ID || !CLIENT_SECRET || !TENANT_ID || !EXCEL_SHARE_URL){
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

async function getAppToken(){
  try{
    const resp = await cca.acquireTokenByClientCredential({ scopes: SCOPES });
    return resp.accessToken;
  } catch(e){
    console.error('Error obteniendo token MSAL:', e);
    throw new Error('Error obteniendo token de Microsoft Graph');
  }
}

// Convierte enlace a ShareId, manejando links 1drv.ms
function urlToShareId(url){
  if(!url) throw new Error('EXCEL_SHARE_URL vacío');
  const b64 = Buffer.from(url).toString('base64')
    .replace(/\+/g,'-')
    .replace(/\//g,'_')
    .replace(/=+$/,'');
  return `u!${b64}`;
}

async function getDriveItemFromShare(shareUrl, token){
  try{
    const shareId = urlToShareId(shareUrl);
    const url = `https://graph.microsoft.com/v1.0/shares/${shareId}/driveItem`;
    const res = await fetch(url, { headers:{ Authorization:`Bearer ${token}` }});
    const text = await res.text();
    if(!res.ok) throw new Error(`Graph API error: ${text}`);
    return JSON.parse(text);
  } catch(e){
    console.error('Error en getDriveItemFromShare:', e);
    throw e;
  }
}

async function listTableRows(driveId, itemId, tableName, token){
  try{
    const url = `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}/workbook/tables('${tableName}')/rows`;
    const res = await fetch(url, { headers:{ Authorization:`Bearer ${token}` }});
    const text = await res.text();
    if(!res.ok) throw new Error(`Graph API error listTableRows: ${text}`);
    return JSON.parse(text);
  } catch(e){
    console.error('Error en listTableRows:', e);
    throw e;
  }
}

function safeJsonParse(s){ try{ return JSON.parse(s || '[]'); }catch(e){ return []; } }

exports.handler = async (event) => {
  try{
    const id = (event.queryStringParameters && event.queryStringParameters.id) || (event.path && event.path.split('/').pop());
    if(!id) return { statusCode:400, body: JSON.stringify({ ok:false, message:'Falta id' }) };

    const token = await getAppToken();
    const driveItem = await getDriveItemFromShare(EXCEL_SHARE_URL, token);

    const driveId = driveItem.parentReference.driveId;
    const itemId = driveItem.id;
    const rowsObj = await listTableRows(driveId, itemId, 'Registros', token);

    const rec = (rowsObj.value||[]).map(r=>r.values[0]).find(v => v && v[0] === id);
    if(!rec) return { statusCode:404, body: JSON.stringify({ ok:false, message:'No encontrado' }) };

    const v = rec;
    const result = {
      id: v[0], fechaHora:v[1], asesor:v[2], cargo:v[3], idLlamada:v[4], idContacto:v[5], tipo:v[6],
      cliente:{dni:v[7], nombre:v[8], tel:v[9]},
      tipificacion:v[10], observacionCliente:v[11], resumen:v[12], nota:v[13],
      reincidencia:v[14], items: safeJsonParse(v[15]), images: safeJsonParse(v[16]),
      estado:v[17], compromiso:v[18], firmaUrl:v[19]
    };

    return { statusCode:200, body: JSON.stringify({ ok:true, record: result }) };

  } catch(err){
    console.error('Error en handler record.js:', err);
    return { statusCode:500, body: JSON.stringify({ ok:false, message: err.message }) };
  }
};
