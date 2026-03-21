const baseUrl = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const token = "0l_sPFKO1tjnLzA_cA-aEKM8kpeP1or_R0p9Zuua9nM";
const auth = "Basic " + btoa("0:" + token);

const res = await fetch(`${baseUrl}/supplier`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: auth },
  body: JSON.stringify({
    name: "Tindra AS",
    organizationNumber: "888286195",
    email: "faktura@tindra.no",
    invoiceEmail: "faktura@tindra.no",
  }),
});

const body = await res.json();
console.log("Status:", res.status);
console.log("Response:", JSON.stringify(body, null, 2));
