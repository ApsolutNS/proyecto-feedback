export const handler = async () => {
  return {
    statusCode: 200,
    body: JSON.stringify({ ok: true, ts: new Date().toISOString() })
  };
};
