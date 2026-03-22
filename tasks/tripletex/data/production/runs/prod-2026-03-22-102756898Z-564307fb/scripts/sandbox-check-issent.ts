// Check what field name represents the "sent" status on an invoice
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function main() {
  // Read back the invoice we just created (603) with fields=*
  const r = await fetch(`${BASE}/invoice/2147694983?fields=*`, { headers: H });
  const j = await r.json();
  const inv = j.value;

  // Print all keys that might relate to sending
  const sendKeys = Object.keys(inv).filter(k =>
    k.toLowerCase().includes("sent") ||
    k.toLowerCase().includes("send") ||
    k.toLowerCase().includes("dispatch")
  );
  console.log("Send-related keys:", sendKeys);
  for (const k of sendKeys) {
    console.log(`  ${k}: ${inv[k]}`);
  }

  // Also print the ehfSendStatus if present
  console.log("\nAll keys on invoice:", Object.keys(inv).join(", "));
}

main().catch(e => console.error(e));
