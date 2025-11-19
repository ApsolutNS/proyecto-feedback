// register.js - POST: crea fila en tabla 'Registros' y sube evidencias
const fetch = global.fetch || require('node-fetch');
const msal = require('@azure/msal-node');

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const TENANT_ID = process.env.TENANT_ID;
const EXCEL_SHARE_URL = process.env.EXCEL_SHARE_URL || '';
const DEFAULT_FOLDER = process.env.FEEDBACK_FOLDER || 'FeedbackEvidences';
const SCOPES = ['https://graph.microsoft.com/.default'];

const msalConfig = { auth: { clientId: CLIENT_ID, authority: `https://login.microsoftonline.com/${TENANT_ID}`, clientSecret: CLIENT_SECRET } };
const cca = new msal.ConfidentialClientApplication(msalConfig);

async function getAppToken(){ const resp = await cca.acquireTokenByClientCredential({ scopes: SCOPES }); return resp.accessToken; }
function urlToShareId(url){ const b64 = Buffer.from(url).toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''); return `u!${b64}`; }
async function getDriveItemFromShare(shareUrl, token){
  const shareId = urlToShareId(shareUrl);
  const url = `https://graph.microsoft.com/v1.0/shares/${shareId}/driveItem`;
  const res = await fetch(url, { headers:{ Authorization:`Bearer ${token}` }});
  if(!res.ok) throw new Error(await res.text());
  return res.json();
}
async function ensureFolder(driveId, folderName, token){
  const listRes = await fetch(`https://graph.microsoft.com/v1.0/drives/${driveId}/root/children`, { headers:{ Authorization:`Bearer ${token}` }});
  if(!listRes.ok) throw new Error(await listRes.text());
  const listJson = await listRes.json();
  const found = (listJson.value||[]).find(i => i.folder && i.name === folderName);
  if(found) return found.id;
  const createRes = await fetch(`https://graph.microsoft.com/v1.0/drives/${driveId}/root/children`, {
    method:'POST', headers:{ Authorization:`Bearer ${token}`, 'Content-Type':'application/json'},
    body: JSON.stringify({ name: folderName, folder: {}, "@microsoft.graph.conflictBehavior":"rename" })
  });
  if(!createRes.ok) throw new Error(await createRes.text());
  const folderJson = await createRes.json(); return folderJson.id;
}
async function uploadFileToDrive(driveId, parentId, filename, buffer, token){
  const url = `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${parentId}:/${encodeURIComponent(filename)}:/content`;
  const res = await fetch(url, { method:'PUT', headers:{ Authorization:`Bearer ${token}`, 'Content-Type':'application/octet-stream' }, body: buffer });
  if(!res.ok) throw new Error(await res.text());
  return res.json();
}
async function addRowToWorkbook(driveId, itemId, tableName, values, token){
  const url = `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}/workbook/tables('${tableName}')/rows/add`;
  const res = await fetch(url, { method:'POST', headers:{ Authorization:`Bearer ${token}`, 'Content-Type':'application/json'}, body: JSON.stringify({ values }) });
  if(!res.ok) throw new Error(await res.text());
  return res.json();
}
function safeJsonParse(s){ try{ return JSON.parse(s || '[]'); }catch(e){ return []; } }

exports.handler = async (event) => {
  if(event.httpMethod !== 'POST') return { statusCode:405, body: JSON.stringify({ ok:false, message:'Method not allowed' }) };
  try{
    const token = await getAppToken();
    const payload = JSON.parse(event.body || '{}');
    const excelShareUrl = payload.excelShareUrl || EXCEL_SHARE_URL;
    if(!excelShareUrl) return { statusCode:400, body: JSON.stringify({ ok:false, message:'Falta excelShareUrl' }) };

    const driveItem = await getDriveItemFromShare(excelShareUrl, token);
    const driveId = driveItem.parentReference.driveId;
    const itemId = driveItem.id;
    const folderId = await ensureFolder(driveId, DEFAULT_FOLDER, token);

    // upload images (payload.images as [{name,data} with data URL])
    const imagesInfo = [];
    for(const im of (payload.images||[])){
      const m = (im.data||'').match(/^data:(.+);base64,(.+)$/);
      if(!m) continue;
      const buffer = Buffer.from(m[2],'base64');
      const up = await uploadFileToDrive(driveId, folderId, im.name || `img_${Date.now()}.png`, buffer, token);
      imagesInfo.push({ name: up.name, webUrl: up.webUrl, id: up.id });
    }

    // compose row (match server.js order)
    const id = 'FB-'+Date.now();
    const now = new Date().toISOString();
    const itemsJson = JSON.stringify(payload.items || []);
    const imagesJson = JSON.stringify(imagesInfo);
    const nota = (typeof payload.nota === 'number') ? payload.nota : payload.nota || '';
    const tipo = payload.tipo || '';

    const row = [
      id, now, payload.asesor||'', payload.cargo||'', payload.idLlamada||'', payload.idContacto||'', tipo,
      payload.cliente?.dni||'', payload.cliente?.nombre||'', payload.cliente?.tel||'',
      payload.tipificacion||'', payload.observacionCliente||'', payload.resumen||'', nota.toString(),
      payload.reincidencia||'NO', itemsJson, imagesJson, 'PENDIENTE', '', ''
    ];

    await addRowToWorkbook(driveId, itemId, 'Registros', [row], token);
    return { statusCode:200, body: JSON.stringify({ ok:true, id, message:'Registro creado', images: imagesInfo }) };
  }catch(err){
    console.error(err);
    return { statusCode:500, body: JSON.stringify({ ok:false, message: err.message }) };
  }
};
