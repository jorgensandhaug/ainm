const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "-rHVrOGpPem22gl0PCjJW3VneJCtP3U__e1mFKOoJW4";
const AUTH = "Basic " + btoa("0:" + TOKEN);

const ORDER_ID = 402019438;
const TODAY = "2026-03-21";

const headers = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  console.log(`\n>>> ${method} ${url}`);
  if (body) console.log("BODY:", JSON.stringify(body, null, 2));
  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = text; }
  console.log(`<<< ${res.status}`);
  console.log(JSON.stringify(data, null, 2));
  if (!res.ok) throw new Error(`${method} ${path} => ${res.status}: ${JSON.stringify(data)}`);
  return data;
}

async function main() {
  // Step 1: GET bank accounts
  const acctSearch = await api("GET", "/ledger/account?isBankAccount=true&fields=*");
  const accounts = acctSearch.values || [];
  console.log("Bank accounts found:", accounts.length);

  // Find the invoice account (typically 1920)
  const invoiceAcct = accounts.find((a: any) => a.number === 1920) || accounts[0];
  if (!invoiceAcct) throw new Error("No bank account found");

  console.log(`Using account ${invoiceAcct.number} (id=${invoiceAcct.id}), current bankAccountNumber: ${invoiceAcct.bankAccountNumber}`);

  // Step 2: PUT bank account number if missing
  if (!invoiceAcct.bankAccountNumber) {
    const putBody = {
      id: invoiceAcct.id,
      version: invoiceAcct.version,
      number: invoiceAcct.number,
      name: invoiceAcct.name,
      bankAccountNumber: "12345678903",
    };
    await api("PUT", `/ledger/account/${invoiceAcct.id}`, putBody);
  }

  // Step 3: Retry invoice
  const invoiceRes = await api("PUT",
    `/order/${ORDER_ID}/:invoice?invoiceDate=${TODAY}&sendToCustomer=false`);

  console.log("\n=== DONE ===");
  console.log("Invoice ID:", invoiceRes.value?.id);
  console.log("Amount excl VAT:", invoiceRes.value?.amountExcludingVatCurrency);
  console.log("Amount outstanding:", invoiceRes.value?.amountCurrencyOutstanding);
}

main().catch((e) => {
  console.error("FATAL:", e.message || e);
  process.exit(1);
});
