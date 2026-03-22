const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = `Basic ${btoa("0:" + TOKEN)}`;

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const headers: Record<string, string> = { Authorization: AUTH, "Content-Type": "application/json" };
  const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, ok: res.ok, data };
}

async function main() {
  const date = "2026-03-22";
  const gross = 12500;
  const net = 10000;

  // Setup
  const sRes = await api("POST", "/supplier", { name: "AllCombo AS", organizationNumber: "823456786" });
  const supplierId = sRes.data.value.id;
  const supplierLedger = sRes.data.value.ledgerAccount.id;
  const acctRes = await api("GET", "/ledger/account?number=7140&isApplicableForSupplierInvoice=true&fields=id");
  const expAcctId = acctRes.data.values[0].id;
  const vtRes = await api("GET", "/ledger/voucherType?name=Leverand%C3%B8rfaktura&fields=id");
  const vtId = vtRes.data.values[0].id;

  const basePostings = [
    { row: 1, date, description: "test", account: { id: expAcctId }, vatType: { id: 1 }, amount: net, amountCurrency: net, amountGross: gross, amountGrossCurrency: gross },
    { row: 2, date, description: "test", account: { id: supplierLedger }, supplier: { id: supplierId }, amount: -gross, amountCurrency: -gross, amountGross: -gross, amountGrossCurrency: -gross },
  ];

  const tests: Array<{name: string, payload: any}> = [
    // Group 1: orderLine field discovery
    { name: "OL-bare", payload: { invoiceDate: date, invoiceNumber: "T01", supplier: { id: supplierId }, currency: { id: 1 },
      orderLines: [{ description: "test" }],
      voucher: { date, description: "test", voucherType: { id: vtId }, postings: basePostings } } },
    
    { name: "OL-count", payload: { invoiceDate: date, invoiceNumber: "T02", supplier: { id: supplierId }, currency: { id: 1 },
      orderLines: [{ description: "test", count: 1 }],
      voucher: { date, description: "test", voucherType: { id: vtId }, postings: basePostings } } },

    { name: "OL-count-neg", payload: { invoiceDate: date, invoiceNumber: "T03", supplier: { id: supplierId }, currency: { id: 1 },
      orderLines: [{ description: "test", count: -1 }],
      voucher: { date, description: "test", voucherType: { id: vtId }, postings: basePostings } } },

    { name: "OL-amtExVat", payload: { invoiceDate: date, invoiceNumber: "T04", supplier: { id: supplierId }, currency: { id: 1 },
      orderLines: [{ description: "test", count: -1, amountExcludingVatCurrency: -net }],
      voucher: { date, description: "test", voucherType: { id: vtId }, postings: basePostings } } },

    { name: "OL-vatType", payload: { invoiceDate: date, invoiceNumber: "T05", supplier: { id: supplierId }, currency: { id: 1 },
      orderLines: [{ description: "test", count: -1, amountExcludingVatCurrency: -net, vatType: { id: 1 } }],
      voucher: { date, description: "test", voucherType: { id: vtId }, postings: basePostings } } },

    { name: "OL-account", payload: { invoiceDate: date, invoiceNumber: "T06", supplier: { id: supplierId }, currency: { id: 1 },
      orderLines: [{ description: "test", count: -1, amountExcludingVatCurrency: -net, vatType: { id: 1 }, account: { id: expAcctId } }],
      voucher: { date, description: "test", voucherType: { id: vtId }, postings: basePostings } } },

    // Group 2: SI-level amount fields
    { name: "SIamt-pos", payload: { invoiceDate: date, invoiceNumber: "T07", supplier: { id: supplierId }, currency: { id: 1 },
      amount: gross, amountExcludingVat: net,
      voucher: { date, description: "test", voucherType: { id: vtId }, postings: basePostings } } },

    { name: "SIamt-neg", payload: { invoiceDate: date, invoiceNumber: "T08", supplier: { id: supplierId }, currency: { id: 1 },
      amount: -gross, amountExcludingVat: -net,
      voucher: { date, description: "test", voucherType: { id: vtId }, postings: basePostings } } },

    // Group 3: SI-level amount fields + orderLines
    { name: "SIamt+OL", payload: { invoiceDate: date, invoiceNumber: "T09", supplier: { id: supplierId }, currency: { id: 1 },
      amount: -gross, amountExcludingVat: -net,
      orderLines: [{ description: "test", count: -1, amountExcludingVatCurrency: -net, vatType: { id: 1 } }],
      voucher: { date, description: "test", voucherType: { id: vtId }, postings: basePostings } } },

    // Group 4: No voucher (just SI + OL)
    { name: "NoVoucher+OL", payload: { invoiceDate: date, invoiceNumber: "T10", supplier: { id: supplierId }, currency: { id: 1 },
      amount: -gross, amountExcludingVat: -net,
      orderLines: [{ description: "test", count: -1, amountExcludingVatCurrency: -net, vatType: { id: 1 } }] } },

    // Group 5: invoiceDueDate variations (importDoc uses it)
    { name: "invDueDate", payload: { invoiceDate: date, invoiceNumber: "T11", supplier: { id: supplierId }, currency: { id: 1 },
      invoiceDueDate: date,
      voucher: { date, description: "test", voucherType: { id: vtId }, postings: basePostings } } },

    // Group 6: amountCurrency fields
    { name: "amtCurr", payload: { invoiceDate: date, invoiceNumber: "T12", supplier: { id: supplierId }, currency: { id: 1 },
      amount: -gross, amountCurrency: -gross, amountExcludingVat: -net, amountExcludingVatCurrency: -net,
      voucher: { date, description: "test", voucherType: { id: vtId }, postings: basePostings } } },

    // Group 7: kidOrReceiverReference
    { name: "kid", payload: { invoiceDate: date, invoiceNumber: "T13", supplier: { id: supplierId }, currency: { id: 1 },
      kidOrReceiverReference: "123456",
      voucher: { date, description: "test", voucherType: { id: vtId }, postings: basePostings } } },

    // Group 8: OL with unitPrice (try different field name)
    { name: "OL-unitCost", payload: { invoiceDate: date, invoiceNumber: "T14", supplier: { id: supplierId }, currency: { id: 1 },
      orderLines: [{ description: "test", count: -1, unitCostCurrency: net, amountExcludingVatCurrency: -net, vatType: { id: 1 } }],
      voucher: { date, description: "test", voucherType: { id: vtId }, postings: basePostings } } },

    // Group 9: Negative postings in voucher
    { name: "negPostings", payload: { invoiceDate: date, invoiceNumber: "T15", supplier: { id: supplierId }, currency: { id: 1 },
      voucher: { date, description: "test", voucherType: { id: vtId }, postings: [
        { row: 1, date, description: "test", account: { id: expAcctId }, vatType: { id: 1 }, amount: -net, amountCurrency: -net, amountGross: -gross, amountGrossCurrency: -gross },
        { row: 2, date, description: "test", account: { id: supplierLedger }, supplier: { id: supplierId }, amount: gross, amountCurrency: gross, amountGross: gross, amountGrossCurrency: gross },
      ] } } },
  ];

  console.log("=== RESULTS ===\n");
  for (const t of tests) {
    const res = await api("POST", "/supplierInvoice", t.payload);
    if (res.ok) {
      const v = res.data.value;
      console.log(`✓ ${t.name}: id=${v.id} amt=${v.amount} amtExVat=${v.amountExcludingVat} amtCurr=${v.amountCurrency} amtExVatCurr=${v.amountExcludingVatCurrency} outstanding=${v.outstandingAmount||'?'} OL=${v.orderLines?.length||0} dueDate=${v.invoiceDueDate||'null'}`);
    } else {
      const msg = res.data?.validationMessages?.[0]?.message || res.data?.message || '';
      console.log(`✗ ${t.name}: ${res.status} — ${String(msg).substring(0, 120)}`);
    }
  }
}

main().catch(console.error);
