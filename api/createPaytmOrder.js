// /api/createPaytmOrder.js
const crypto = require("crypto");

// ENV expected (set in Vercel > Project > Settings > Environment Variables)
// PAYTM_ENV = "STAGE" or "PROD"
// PAYTM_MID = your MID
// PAYTM_KEY = your merchant key
// (Optional) CORS_ORIGIN = "https://yourdomain.com" (or leave empty to allow any in dev)

const allowedEnv = new Set(["STAGE", "PROD"]);
const hostByEnv = {
  STAGE: "https://securegw-stage.paytm.in",
  PROD: "https://securegw.paytm.in",
};

function cors(res) {
  const origin = process.env.CORS_ORIGIN || "*";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function checksum(payload, key) {
  // Paytm v3 checksum = HMAC-SHA256 over JSON string + key? No — v3 uses signature over body with key.
  // Spec: signature = base64(HMAC-SHA256(body, merchantKey))
  const hmac = crypto.createHmac("sha256", key);
  hmac.update(payload);
  return hmac.digest("base64");
}

async function initiateTransaction({ mid, key, env, orderId, amount, customerId, customerEmail }) {
  const body = {
    requestType: "Payment",
    mid,
    websiteName: env === "PROD" ? "DEFAULT" : "WEBSTAGING",
    orderId,
    callbackUrl: `${hostByEnv[env]}/theia/paytmCallback?ORDER_ID=${orderId}`,
    txnAmount: { value: String(amount), currency: "INR" },
    userInfo: { custId: customerId, email: customerEmail || "" }
  };

  const bodyStr = JSON.stringify(body);
  const signature = checksum(bodyStr, key);

  const res = await fetch(`${hostByEnv[env]}/theia/api/v1/initiateTransaction?mid=${mid}&orderId=${orderId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ body, head: { signature } })
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Paytm init failed: ${res.status} ${text}`);
  }

  const data = await res.json();
  if (!data?.body?.txnToken) {
    throw new Error(`Paytm init response missing txnToken: ${JSON.stringify(data)}`);
  }
  return data.body.txnToken;
}

module.exports = async (req, res) => {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { amount, planKey, customerId, customerEmail } = req.body || {};
    if (!amount || !customerId) return res.status(400).json({ error: "amount and customerId are required" });

    const env = process.env.PAYTM_ENV || "STAGE";
    if (!allowedEnv.has(env)) return res.status(500).json({ error: "Invalid PAYTM_ENV" });

    const mid = process.env.PAYTM_MID;
    const key = process.env.PAYTM_KEY;
    if (!mid || !key) return res.status(500).json({ error: "Paytm credentials not configured" });

    const orderId = `ORD_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

    const txnToken = await initiateTransaction({
      mid, key, env, orderId, amount, customerId, customerEmail
    });

    res.status(200).json({ orderId, txnToken, mid, env });
  } catch (err) {
    console.error("createPaytmOrder error:", err);
    res.status(500).json({ error: err.message || "Internal error" });
  }
};
