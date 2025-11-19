// server.js
// Backend Express para integración con Microsoft Graph (OneDrive + Excel)
// Requiere: NODE 18+
// Usa client credentials (MSAL) para realizar operaciones en OneDrive/Excel

const express = require('express');
const multer  = require('multer');
const fetch = require('node-fetch');
const msal = require('@azure/msal-node');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const upload = multer({ dest: 'uploads/' });
const app = express();
app.use(express.json({ limit: '10mb' }));

// --- CONFIG via env ---
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const TENANT_ID = process.env.TENANT_ID;
const EXCEL_SHARE_URL = process.env.EXCEL_SHARE_URL || ''; // tu share link
const DEFAULT_FOLDER = process.env.FEEDBACK_FOLDER || 'FeedbackEvidences';
const PORT = process.env.PORT || 3000;
const SCOPES = ['https://graph.microsoft.com/.default'];

// Validate env
if(!CLIENT_ID || !CLIENT_SECRET || !TENANT_ID || !EXCEL_SHARE_URL){
  console.warn('WARNING: faltan variables de entorno. Revisa .env');
}

// MSAL config (client credentials)
const msalConfig = {
  auth: {
    clientId: CLIENT_ID,
    authority: `https://login.microsoftonline.com/${TENANT_ID}`,
    clientSecret: CLIENT_SECRET
  }
};
const cca = new msal.ConfidentialClientApplication(msalConfig);

// Acquire token (client credentials)
async function getAppToken(){
  const resp = await cca.acquireTokenByClientCredential({ scopes: SCOPES });
  return resp.accessToken;
}

// helper: convert share URL -> shareId (u!base64url)
function urlToShareId(url){
  const b64 = Buffer.from(url).toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  return `u!${b64}`;
}

// helper: get driveItem from share URL
async function getDriveItemFromShare(shareUrl, token){
  const shareId = urlToShareId(shareUrl);
  const url = `https://graph.microsoft.com/v1.0/shares/${shareId}/driveItem`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }});
  if(!res.ok) {
    const t = await res.text();
    throw new Error('Error al resolver share -> driveItem: ' + t);
  }
  return await res.json();
}

// helper: ensure folder exists under drive root (create if missing)
async function ensureFolder(driveId, folderName, token){
  // check children
  const listRes = await fetch(`https://graph.microsoft.com/v1.0/drives/${driveId}/root/children`, {
    headers:{ Authorization:`Bearer ${token}` }
  });
  if(!listRes.ok) throw new Error('No se pudo listar children del drive.');
  const listJson = await listRes.json();
  const found = (listJson.value||[]).find(i => i.folder && i.name === folderName);
  if(found) return found.id;
  // create
  const createRes = await fetch(`https://graph.microsoft.com/v1.0/drives/${driveId}/root/children`, {
    method:'POST',
    headers:{ Authorization:`Bearer ${token}`, 'Content-Type':'application/json' },
    body: JSON.stringify({ name: folderName, folder: {}, "@microsoft.graph.conflictBehavior":"rename" })
  });
  if(!createRes.ok) {
    const t = await createRes.text();
    throw new Error('No se pudo crear folder: ' + t);
  }
  const folderJson = await createRes.json();
  return folderJson.id;
}

// helper: upload file to folder
async function uploadFileToDrive(driveId, parentId, filename, buffer, token){
  // small files (<4MB) use this PUT method
  const url = `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${parentId}:/${encodeURIComponent(filename)}:/content`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type':'application/octet-stream' },
    body: buffer
  });
  if(!res.ok) {
    const txt = await res.text();
    throw new Error('Upload failed: ' + txt);
  }
  return await res.json();
}

// helper: add row to workbook table named 'Registros'
async function addRowToWorkbook(driveId, itemId, tableName, values, token){
  const url = `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}/workbook/tables('${tableName}')/rows/add`;
  const res = await fetch(url, {
    method:'POST',
    headers:{ Authorization:`Bearer ${token}`, 'Content-Type':'application/json' },
    body: JSON.stringify({ values })
  });
  if(!res.ok){
    const t = await res.text();
    throw new Error('Add row failed: ' + t);
  }
  return await res.json();
}

// helper: list all rows in the table 'Registros'
async function listTableRows(driveId, itemId, tableName, token){
  const url = `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}/workbook/tables('${tableName}')/rows`;
  const res = await fetch(url, { headers:{ Authorization:`Bearer ${token}` }});
  if(!res.ok) throw new Error('No se pudo obtener filas de tabla');
  return await res.json();
}

// helper: update a specific row index values
async function updateTableRowByIndex(driveId, itemId, tableName, rowIndex, rowValues, token){
  // get range for row index
  const rangeRes = await fetch(`https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}/workbook/tables('${tableName}')/rows/${rowIndex}/range`, {
    headers:{ Authorization:`Bearer ${token}` }
  });
  if(!rangeRes.ok) throw new Error('No se pudo obtener range de row');
  const rangeJson = await rangeRes.json(); // has address like Sheet1!A2:T2
  // patch to worksheet range
  const addr = rangeJson.address.split('!')[1]; // A2:T2
  const patchUrl = `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}/workbook/worksheets('${rangeJson.address.split('!')[0]}')/range(address='${addr}')`;
  const patchRes = await fetch(patchUrl, {
    method:'PATCH',
    headers:{ Authorization:`Bearer ${token}`, 'Content-Type':'application/json' },
    body: JSON.stringify({ values: [ rowValues ] })
  });
  if(!patchRes.ok){
    const t = await patchRes.text();
    throw new Error('Patch range failed: ' + t);
  }
  return await patchRes.json();
}

// ----------------- ENDPOINTS ------------------

// Health
app.get('/api/health', (req,res)=> res.json({ ok:true, ts: new Date().toISOString() }));

/**
 * POST /api/register
 * body: multipart/form-data
 *  - payload (JSON string)
 *  - images[] (files)
 *
 * payload includes:
 *  {
 *    excelShareUrl, idLlamada, idContacto, asesor, cargo, cliente:{dni,nombre,tel}, tipificacion,
 *    observacionCliente, resumen, items:[{name,perc,detail}], nota, reincidencia
 *  }
 */
app.post('/api/register', upload.array('images'), async (req,res) => {
  try{
    const token = await getAppToken();
    const payload = JSON.parse(req.body.payload || '{}');
    const excelShareUrl = payload.excelShareUrl || EXCEL_SHARE_URL;
    if(!excelShareUrl) return res.status(400).json({ ok:false, message:'Falta excelShareUrl' });

    // resolve drive & item
    const driveItem = await getDriveItemFromShare(excelShareUrl, token);
    const driveId = driveItem.parentReference.driveId;
    const itemId = driveItem.id;

    // ensure folder
    const folderId = await ensureFolder(driveId, DEFAULT_FOLDER, token);

    // upload images
    const imagesInfo = [];
    for(const f of req.files || []){
      const buffer = fs.readFileSync(f.path);
      const up = await uploadFileToDrive(driveId, folderId, f.originalname, buffer, token);
      imagesInfo.push({ name: up.name, webUrl: up.webUrl, id: up.id });
      try { fs.unlinkSync(f.path); } catch(e){}
    }

    // prepare row (must match table columns)
    // order expected:
    // ID, FechaHora, Asesor, Cargo, IDLlamada, IDContacto, Tipo, ClienteDNI, ClienteNombre, ClienteTel,
    // Tipificacion, ObservacionCliente, Resumen, Nota, Reincidencia, ItemsJSON, ImagesJSON, Estado, Compromiso, FirmaURL
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

    // add row to table named 'Registros'
    const addRes = await addRowToWorkbook(driveId, itemId, 'Registros', [row], token);

    res.json({ ok:true, id, message:'Registro creado', images: imagesInfo });
  }catch(err){
    console.error(err);
    res.status(500).json({ ok:false, message: err.message });
  }
});

/**
 * GET /api/records
 * optional query: asesor=...
 * returns all rows from table 'Registros' (simple)
 */
app.get('/api/records', async (req,res) => {
  try{
    const token = await getAppToken();
    const excelShareUrl = req.query.excelShareUrl || EXCEL_SHARE_URL;
    const driveItem = await getDriveItemFromShare(excelShareUrl, token);
    const driveId = driveItem.parentReference.driveId;
    const itemId = driveItem.id;
    const rowsObj = await listTableRows(driveId, itemId, 'Registros', token);
    // rowsObj.value is array with {index, values}
    let records = (rowsObj.value || []).map(r => {
      const v = r.values && r.values[0];
      return {
        id: v[0], fechaHora:v[1], asesor:v[2], cargo:v[3], idLlamada:v[4], idContacto:v[5], tipo:v[6],
        cliente:{dni:v[7], nombre:v[8], tel:v[9]},
        tipificacion:v[10], observacionCliente:v[11], resumen:v[12], nota:v[13],
        reincidencia:v[14], items: safeJsonParse(v[15]), images: safeJsonParse(v[16]),
        estado:v[17], compromiso:v[18], firmaUrl:v[19]
      };
    });
    if(req.query.asesor) records = records.filter(r=>r.asesor === req.query.asesor);
    res.json({ ok:true, count:records.length, records });
  }catch(err){
    console.error(err);
    res.status(500).json({ ok:false, message:err.message });
  }
});

/**
 * POST /api/complete
 * body JSON: { id, compromiso, firmaDataUrl, excelShareUrl? }
 * Marks record as COMPLETED, uploads signature image and updates row (Estado, Compromiso, FirmaURL).
 */
app.post('/api/complete', async (req,res) => {
  try{
    const { id, compromiso, firmaDataUrl, excelShareUrl } = req.body;
    if(!id || !compromiso || !firmaDataUrl) return res.status(400).json({ ok:false, message:'Faltan parametros' });
    const token = await getAppToken();
    const share = excelShareUrl || EXCEL_SHARE_URL;
    const driveItem = await getDriveItemFromShare(share, token);
    const driveId = driveItem.parentReference.driveId;
    const itemId = driveItem.id;

    // ensure folder
    const folderId = await ensureFolder(driveId, DEFAULT_FOLDER, token);

    // upload signature
    const matches = (firmaDataUrl || '').match(/^data:(.+);base64,(.+)$/);
    if(!matches) return res.status(400).json({ ok:false, message:'Firma inválida' });
    const buffer = Buffer.from(matches[2], 'base64');
    const fname = `firma_${id}.png`;
    const uploaded = await uploadFileToDrive(driveId, folderId, fname, buffer, token);

    // find row index by scanning rows
    const rowsObj = await listTableRows(driveId, itemId, 'Registros', token);
    let targetIndex = -1;
    for(let i=0;i<(rowsObj.value||[]).length;i++){
      const v = rowsObj.value[i].values && rowsObj.value[i].values[0];
      if(v && v[0] === id){ targetIndex = i; break; }
    }
    if(targetIndex === -1) return res.status(404).json({ ok:false, message:'Registro no encontrado' });

    // load current row values array
    const currentValues = rowsObj.value[targetIndex].values[0];
    // update fields: estado index 17, compromiso index 18, firma index 19
    currentValues[17] = 'COMPLETADO';
    currentValues[18] = compromiso;
    currentValues[19] = uploaded.webUrl;

    await updateTableRowByIndex(driveId, itemId, 'Registros', targetIndex, currentValues, token);

    res.json({ ok:true, message:'Registro completado', uploaded });
  }catch(err){
    console.error(err);
    res.status(500).json({ ok:false, message: err.message });
  }
});

// GET /api/record/:id  -> fetch single record from table
app.get('/api/record/:id', async (req,res) => {
  try{
    const token = await getAppToken();
    const share = req.query.excelShareUrl || EXCEL_SHARE_URL;
    const driveItem = await getDriveItemFromShare(share, token);
    const driveId = driveItem.parentReference.driveId;
    const itemId = driveItem.id;
    const rowsObj = await listTableRows(driveId, itemId, 'Registros', token);
    const rec = (rowsObj.value||[]).map(r=>r.values[0]).find(v => v && v[0] === req.params.id);
    if(!rec) return res.status(404).json({ ok:false, message:'No encontrado' });
    const v = rec;
    const result = {
      id: v[0], fechaHora:v[1], asesor:v[2], cargo:v[3], idLlamada:v[4], idContacto:v[5], tipo:v[6],
      cliente:{dni:v[7], nombre:v[8], tel:v[9]},
      tipificacion:v[10], observacionCliente:v[11], resumen:v[12], nota:v[13],
      reincidencia:v[14], items: safeJsonParse(v[15]), images: safeJsonParse(v[16]),
      estado:v[17], compromiso:v[18], firmaUrl:v[19]
    };
    res.json({ ok:true, record: result });
  }catch(err){
    console.error(err);
    res.status(500).json({ ok:false, message: err.message });
  }
});

// utils
function safeJsonParse(s){
  try{ return JSON.parse(s || '[]'); }catch(e){ return []; }
}

// start
app.listen(PORT, ()=> console.log(`Server listening on ${PORT}`));
