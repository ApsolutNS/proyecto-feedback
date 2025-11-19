import fetch from "node-fetch";
import msal from "@azure/msal-node";

export const handler = async () => {
  try {
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

    function urlToShareId(url) {
      const b64 = Buffer.from(url).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
      return `u!${b64}`;
    }

    const shareId = urlToShareId(process.env.EXCEL_SHARE_URL);

    const driveItemRes = await fetch(
      `https://graph.microsoft.com/v1.0/shares/${shareId}/driveItem`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    const driveItem = await driveItemRes.json();
    const driveId = driveItem.parentReference.driveId;
    const itemId = driveItem.id;

    const rowsRes = await fetch(
      `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}/workbook/tables('Registros')/rows`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    const rows = await rowsRes.json();

    return {
      statusCode: 200,
      body: JSON.stringify(rows.value || [])
    };
  } catch (err) {
    return { statusCode: 500, body: err.message };
  }
};
