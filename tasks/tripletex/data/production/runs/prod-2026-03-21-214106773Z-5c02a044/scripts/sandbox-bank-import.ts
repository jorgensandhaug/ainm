const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const hdrs: Record<string, string> = { Authorization: AUTH, "Content-Type": "application/json" };

async function get(path: string) {
  const url = `${BASE}/${path}`;
  console.log("GET", url);
  const r = await fetch(url, { headers: hdrs });
  const j = await r.json();
  console.log("  ->", r.status, JSON.stringify(j).slice(0, 600));
  return j;
}

async function main() {
  // First, delete the existing reconciliation we created
  console.log("=== Cleanup: delete test reconciliation ===");
  const delUrl = `${BASE}/bank/reconciliation/12705463`;
  const delRes = await fetch(delUrl, { method: "DELETE", headers: hdrs });
  console.log("DELETE recon:", delRes.status);

  // Get the bank account details (1920)
  const acctRes = await get("ledger/account?number=1920&fields=*");
  const acct = acctRes.values[0];
  console.log("\nAccount 1920:", acct.id, "bankAccountNumber:", acct.bankAccountNumber, "isBankAccount:", acct.isBankAccount);

  // Create a test CSV file
  const csv = `Dato;Forklaring;Inn;Ut;Saldo
2026-01-18;Innbetaling fra Costa Lda / Faktura 1001;11300.00;;111300.00
2026-01-20;Innbetaling fra Martins Lda / Faktura 1002;18437.50;;129737.50
2026-01-21;Innbetaling fra Santos Lda / Faktura 1003;22375.00;;152112.50
2026-01-23;Innbetaling fra Santos Lda / Faktura 1004;9187.50;;161300.00
2026-01-24;Innbetaling fra Rodrigues Lda / Faktura 1005;30437.50;;191737.50
2026-01-25;Betaling Fornecedor Pereira Lda;;-13100.00;178637.50
2026-01-26;Betaling Fornecedor Ferreira Lda;;-12150.00;166487.50
2026-01-28;Betaling Fornecedor Pereira Lda;;-6550.00;159937.50
2026-01-30;Bankgebyr;1634.39;;161571.89
2026-01-31;Skattetrekk;;-318.44;161253.45
2026-02-01;Renteinntekter;95.14;;161348.59`;

  // Try uploading as different formats to see which works
  const formats = ["DNB_CSV", "NORDEA_CSV", "DANSKE_BANK_CSV", "SBANKEN_BEDRIFT_CSV", "SBANKEN_PRIVAT_CSV", "HAUGESUND_SPAREBANK_CSV"];

  for (const fmt of formats) {
    console.log(`\n=== Try import with format: ${fmt} ===`);
    const formData = new FormData();
    const blob = new Blob([csv], { type: "text/csv" });
    formData.append("file", blob, "bankutskrift.csv");

    const url = `${BASE}/bank/statement/import?bankId=3&accountId=${acct.id}&fromDate=2026-01-18&toDate=2026-02-01&fileFormat=${fmt}`;
    console.log("POST", url);
    const r = await fetch(url, {
      method: "POST",
      headers: { Authorization: AUTH },
      body: formData,
    });
    const j = await r.json();
    console.log("  ->", r.status, JSON.stringify(j).slice(0, 500));
    if (r.ok) {
      console.log("SUCCESS with format:", fmt);
      break;
    }
  }
}

main().catch(e => console.error("FATAL:", e.message));
