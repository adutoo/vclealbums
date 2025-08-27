// /api/paytmCallback.js
module.exports = async (req, res) => {
  // For now just log incoming callback payload
  if (req.method === "POST") {
    const chunks = [];
    for await (const ch of req) chunks.push(ch);
    const raw = Buffer.concat(chunks).toString("utf8");
    console.log("Paytm callback:", raw);
    res.status(200).json({ ok: true });
    return;
  }
  res.status(200).json({ ok: true });
};
