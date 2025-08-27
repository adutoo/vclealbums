// /api/createPaytmOrder.js
// POST JSON: { amount: 999, planKey: "premium", customerId: "uid", customerEmail: "a@b.com" }
// Returns: { orderId, txnToken, amount, env, mid }

const PaytmChecksum = require("paytmchecksum");

const {
  PAYTM_ENV = "STAGE",      // "STAGE" or "PROD"
  PAYTM_MID,                // Paytm Merchant ID
  PAYTM_MKEY,               // Paytm Merchant Key (secret)
  PAYTM_WEBSITE = "DEFAULT",
  BASE_URL = ""             // optional - used for callback URL
} = process.env;

const send = (res, status, data) => {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(data));
};

const allowCors = (fn) => async (req, res) => {
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS,POST");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return send(res, 200, { ok: true });
  return await fn(req, res);
};

module.exports = allowCors(async (req, res) => {
  try {
    if (req.method !== "POST") return send(res, 405, { error: "Method not allowed" });
    if (!PAYTM_MID || !PAYTM_MKEY) return send(res, 500, { error: "Paytm not configured" });

    const { amount, customerId, customerEmail } = await readBody(req);
    if (!amount || isNaN(Number(amount))) return send(res, 400, { error: "Invalid amount" });

    const orderId = `ORD_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
    const host = PAYTM_ENV === "PROD" ? "https://securegw.paytm.in" : "https://securegw-stage.paytm.in";

    const body = {
      requestType: "Payment",
      mid: PAYTM_MID,
      websiteName: PAYTM_WEBSITE,
      orderId,
      callbackUrl: BASE_URL ? `${BASE_URL}/api/paytmCallback` : undefined, // optional
      txnAmount: { value: String(Number(amount).toFixed(2)), currency: "INR" },
      userInfo: {
        custId: String(customerId || customerEmail || "guest"),
        email: customerEmail || undefined,
      },
    };

    const signature = await PaytmChecksum.generateSignature(JSON.stringify(body), PAYTM_MKEY);

    const initUrl = `${host}/theia/api/v1/initiateTransaction?mid=${PAYTM_MID}&orderId=${orderId}`;
    const resp = await fetch(initUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "signature": signature },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      return send(res, 502, { error: "Failed to reach Paytm", detail: text });
    }
    const data = await resp.json();
    const resultStatus = data?.body?.resultInfo?.resultStatus;
    const txnToken = data?.body?.txnToken;

    if (resultStatus !== "S" || !txnToken) {
      return send(res, 400, {
        error: "Paytm initiateTransaction failed",
        result: data?.body?.resultInfo
      });
    }

    send(res, 200, { orderId, txnToken, amount: Number(amount).toFixed(2), env: PAYTM_ENV, mid: PAYTM_MID });
  } catch (err) {
    console.error("createPaytmOrder error:", err);
    send(res, 500, { error: "Server error", detail: err.message });
  }
});

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      try { resolve(data ? JSON.parse(data) : {}); }
      catch (e) { reject(e); }
    });
  });
}
