import fetch from "node-fetch";
import msal from "@azure/msal-node";

export const handler = async (event) => {
  try {
    const body = JSON.parse(event.body);

    const {
      idLlamada,
      idContacto,
      asesor,
      cargo,
      tipificacion,
      resumen,
      items = [],
      nota,
      observacionCliente,
      cliente = {},
      tipo,
      reincidencia,
      images = []
    } = body;

    // ===== MSAL TOKEN =====
    const cca = new msal.ConfidentialClientApplication({
      auth: {
        clientId: process.env.CLIENT_ID,
        authority: `https://login.microsoftonline.com/${process.env.TENANT_ID}`,
        clientSecret: process.env.CLIENT_SECRET
      }
    });

    const tokenResp = await cca.acquireTokenByClientCredential({
      scopes: ["https://graph.microsoft.com/.default"]
    });

    const token = tokenResp.accessToken;

    // ===== RESOLVE SHARE URL =====
    function urlToShareId(url) {
      const b64 = Buffer.from(url).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
      return `u!${b64}`;
    }

    const shareId = urlToShareId(process.env.EXCEL_SHARE_URL);

    const driveItemRes = await fetch(`https://graph.microsoft.com/v1.0/shares/${shareId}/driveItem`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    const driveItem = await driveItemRes.json();
    const driveId = driveItem.parentReference.driveId;
    const itemId = driveItem.id;

    // ===== PREPARE ROW =====
    const id = "FB-" + Date.now();
    const now = new Date().toISOString();

    const row = [
      id, now, asesor, cargo, idLlamada, idContacto, tipo,
      cliente.dni, cliente.nombre, cliente.tel,
      tipificacion, observacionCliente, resumen, nota,
      reincidencia, JSON.stringify(items), JSON.stringify(images),
      "PENDIENTE", "", ""
    ];

    // ===== INSERT ROW =====
    const insert = await fetch(
      `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}/workbook/tables('Registros')/rows/add`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ values: [row] })
      }
    );

    if (!insert.ok) {
      return { statusCode: 500, body: await insert.text() };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, id })
    };
  } catch (err) {
    return { statusCode: 500, body: err.message };
  }
};
