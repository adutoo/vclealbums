import https from "https";

export default function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { mid, amount, planKey, customerId, customerEmail } = req.body;

  // 👇 Replace with your own Paytm merchant key
  const merchantKey = process.env.PAYTM_MKEY;

  const orderId = "ORDER" + Date.now();

  const paytmParams = {
    requestType: "Payment",
    mid,
    websiteName: "DEFAULT",
    orderId,
    callbackUrl: "https://securegw-stage.paytm.in/theia/paytmCallback?ORDER_ID=" + orderId,
    txnAmount: { value: String(amount), currency: "INR" },
    userInfo: { custId: customerId, email: customerEmail }
  };

  const post_data = JSON.stringify(paytmParams);

  const options = {
    hostname: "securegw-stage.paytm.in",
    port: 443,
    path: `/theia/api/v1/initiateTransaction?mid=${mid}&orderId=${orderId}`,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": post_data.length,
    },
  };

  const request = https.request(options, function (response) {
    let data = "";
    response.on("data", chunk => { data += chunk; });
    response.on("end", () => {
      try {
        const result = JSON.parse(data);
        res.status(200).json({ orderId, txnToken: result.body.txnToken });
      } catch (err) {
        res.status(500).json({ error: "Failed to parse Paytm response" });
      }
    });
  });

  request.on("error", (err) => {
    console.error(err);
    res.status(500).json({ error: "Paytm API request failed" });
  });

  request.write(post_data);
  request.end();
}
