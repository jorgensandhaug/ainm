const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "pnEpix3m_SL7V_F4kwB_-meIVo49yllqvsdEX1TR6CE";
const AUTH = "Basic " + btoa("0:" + TOKEN);

const res = await fetch(`${BASE}/supplier`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: AUTH },
  body: JSON.stringify({
    name: "Luz do Sol Lda",
    organizationNumber: "962006930",
    email: "faktura@luzdosollda.no",
    invoiceEmail: "faktura@luzdosollda.no",
  }),
});

const body = await res.json();
console.log("STATUS:", res.status);
console.log("BODY:", JSON.stringify(body, null, 2));
