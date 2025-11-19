// complete.js - POST { id, compromiso, firmaDataUrl }
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
async function listTableRows(driveId, itemId, tableName, token){
  const url = `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}/workbook/tables('${tableName}')/rows`;
  const res = await fetch(url, { headers:{ Authorization:`Bearer ${token}` }});
  if(!res.ok) throw new Error(await res.text());
  return res.json();
}
async function updateTableRowByIndex(driveId, itemId, tableName, rowIndex, rowValues, token){
  const rangeRes = await fetch(`https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}/workbook/tables('${tableName}')/rows/${rowIndex}/range`, {
    headers:{ Authorization:`Bearer ${token}` }
  });
  if(!rangeRes.ok) throw new Error(await rangeRes.text());
  const rangeJson = await rangeRes.json();
  const sheetName = rangeJson.address.split('!')[0];
  const addr = rangeJson.address.split('!')[1];
  const patchUrl = `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}/workbook/worksheets('${sheetName}')/range(address='${addr}')`;
  const patchRes = await fetch(patchUrl, {
    method:'PATCH', headers:{ Authorization:`Bearer ${token}`, 'Content-Type':'application/json'}, body: JSON.stringify({ values: [ rowValues ] })
  });
  if(!patchRes.ok) throw new Error(await patchRes.text());
  return patchRes.json();
}
function safeJsonParse(s){ try{ return JSON.parse(s || '[]'); }catch(e){ return []; } }

exports.handler = async (event) => {
  if(event.httpMethod !== 'POST') return { statusCode:405, body: JSON.stringify({ ok:false, message:'Method not allowed' }) };
  try{
    const { id, compromiso, firmaDataUrl } = JSON.parse(event.body || '{}');
    if(!id || !compromiso || !firmaDataUrl) return { statusCode:400, body: JSON.stringify({ ok:false, message:'Faltan parametros' }) };

    const token = await getAppToken();
    const driveItem = await getDriveItemFromShare(process.env.EXCEL_SHARE_URL, token);
    const driveId = driveItem.parentReference.driveId;
    const itemId = driveItem.id;
    const folderId = await ensureFolder(driveId, DEFAULT_FOLDER, token);

    const matches = (firmaDataUrl||'').match(/^data:(.+);base64,(.+)$/);
    if(!matches) return { statusCode:400, body: JSON.stringify({ ok:false, message:'Firma inválida' }) };
    const buffer = Buffer.from(matches[2], 'base64');
    const fname = `firma_${id}.png`;
    const uploaded = await uploadFileToDrive(driveId, folderId, fname, buffer, token);

    const rowsObj = await listTableRows(driveId, itemId, 'Registros', token);
    let targetIndex = -1;
    for(let i=0;i<(rowsObj.value||[]).length;i++){
      const v = rowsObj.value[i].values && rowsObj.value[i].values[0];
      if(v && v[0] === id){ targetIndex = i; break; }
    }
    if(targetIndex === -1) return { statusCode:404, body: JSON.stringify({ ok:false, message:'Registro no encontrado' }) };

    const currentValues = rowsObj.value[targetIndex].values[0];
    currentValues[17] = 'COMPLETADO';
    currentValues[18] = compromiso;
    currentValues[19] = uploaded.webUrl;

    await updateTableRowByIndex(driveId, itemId, 'Registros', targetIndex, currentValues, token);
    return { statusCode:200, body: JSON.stringify({ ok:true, message:'Registro completado', uploaded }) };
  }catch(err){
    console.error(err);
    return { statusCode:500, body: JSON.stringify({ ok:false, message: err.message }) };
  }
};
