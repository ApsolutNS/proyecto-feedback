// records.js - GET: devuelve todas las filas de la tabla 'Registros'
const fetch = global.fetch || require('node-fetch');
const msal = require('@azure/msal-node');

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const TENANT_ID = process.env.TENANT_ID;
const EXCEL_SHARE_URL = process.env.EXCEL_SHARE_URL || '';
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
async function listTableRows(driveId, itemId, tableName, token){
  const url = `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}/workbook/tables('${tableName}')/rows`;
  const res = await fetch(url, { headers:{ Authorization:`Bearer ${token}` }});
  if(!res.ok) throw new Error(await res.text());
  return res.json();
}
function safeJsonParse(s){ try{ return JSON.parse(s || '[]'); }catch(e){ return []; } }

exports.handler = async () => {
  try{
    const token = await getAppToken();
    if(!EXCEL_SHARE_URL) return { statusCode:400, body: JSON.stringify({ ok:false, message:'Falta EXCEL_SHARE_URL' }) };

    const driveItem = await getDriveItemFromShare(EXCEL_SHARE_URL, token);
    const driveId = driveItem.parentReference.driveId;
    const itemId = driveItem.id;
    const rowsObj = await listTableRows(driveId, itemId, 'Registros', token);

    const records = (rowsObj.value || []).map(r => {
      const v = r.values && r.values[0];
      return {
        id: v[0], fechaHora:v[1], asesor:v[2], cargo:v[3], idLlamada:v[4], idContacto:v[5], tipo:v[6],
        cliente:{dni:v[7], nombre:v[8], tel:v[9]},
        tipificacion:v[10], observacionCliente:v[11], resumen:v[12], nota:v[13],
        reincidencia:v[14], items: safeJsonParse(v[15]), images: safeJsonParse(v[16]),
        estado:v[17], compromiso:v[18], firmaUrl:v[19]
      };
    });

    return { statusCode:200, body: JSON.stringify({ ok:true, count:records.length, records }) };
  }catch(err){
    console.error(err);
    return { statusCode:500, body: JSON.stringify({ ok:false, message:err.message }) };
  }
};
