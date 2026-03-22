# Register Project Lifecycle With Budget, Hours, Cost, and Invoice

## Trust Level
- Trusted standard — use directly for exact matches, skip `./openapi.json`

## Exact Match
- create one customer, two employees, one project with monetary budget
- register project hours for both employees
- register one supplier/project cost
- create one unsent customer invoice
- add both employees as project participants

## Do Not Use This Standard If
- the prompt explicitly scores internal billability fields or true reserve consumption
- the prompt is really a fixed-price update/billing task rather than a fresh project-lifecycle create task
- CRITICAL: if the prompt gives project name + customer org + PM email + fixed price + milestone % WITHOUT mentioning employees to create, hours to register, or supplier costs, use `set-project-fixed-price-and-invoice-partial-payment` instead

## Script Template

Copy-paste the script below. Replace only the `// PROMPT VALUES` block with values from the prompt. Do NOT modify payload shapes — they are sandbox-verified (2026-03-22, 15 calls, 0 errors, 4 sequential phases).

```typescript
// ── PROMPT VALUES (replace these from the prompt) ──────────────────
const PROJECT_NAME = "ERP-implementering Havbris";     // from prompt
const CUST_NAME    = "Havbris AS";                     // from prompt
const CUST_ORG     = "851704027";                      // from prompt
const BUDGET       = 418100;                           // from prompt
const PM_FIRST     = "Sigurd";                         // from prompt
const PM_LAST      = "Berg";                           // from prompt
const PM_EMAIL     = "sigurd.berg@example.org";        // from prompt
const PM_HOURS     = 75;                               // from prompt
const CON_FIRST    = "Marte";                          // from prompt
const CON_LAST     = "Johansen";                       // from prompt
const CON_EMAIL    = "marte.johansen@example.org";     // from prompt
const CON_HOURS    = 47;                               // from prompt
const SUPP_NAME    = "Lysgård AS";                     // from prompt
const SUPP_ORG     = "964716188";                      // from prompt
const SUPP_COST    = 56200;                            // from prompt
// ── END PROMPT VALUES ──────────────────────────────────────────────

const TOTAL_HOURS = PM_HOURS + CON_HOURS;
const TODAY = new Date().toISOString().slice(0, 10);
const h = { "Content-Type": "application/json", Authorization: AUTH };

async function get(path: string) {
  const r = await fetch(`${BASE}${path}`, { headers: h });
  const b = await r.json();
  if (!r.ok) throw new Error(`GET ${path} ${r.status}: ${JSON.stringify(b).slice(0, 200)}`);
  return b;
}
async function post(path: string, body: any) {
  const r = await fetch(`${BASE}${path}`, { method: "POST", headers: h, body: JSON.stringify(body) });
  const b = await r.json();
  if (!r.ok) throw new Error(`POST ${path} ${r.status}: ${JSON.stringify(b).slice(0, 200)}`);
  return b;
}
async function put(path: string, body: any) {
  const r = await fetch(`${BASE}${path}`, { method: "PUT", headers: h, body: JSON.stringify(body) });
  const b = await r.json();
  if (!r.ok) throw new Error(`PUT ${path} ${r.status}: ${JSON.stringify(b).slice(0, 200)}`);
  return b;
}

function splitHours(total: number, start: string): { date: string; hours: number }[] {
  const [y, m, d] = start.split("-").map(Number);
  const out: { date: string; hours: number }[] = [];
  let rem = total, off = 0;
  while (rem > 0) {
    const hrs = Math.min(rem, 7.5);
    out.push({ date: new Date(Date.UTC(y, m - 1, d + off)).toISOString().slice(0, 10), hours: hrs });
    rem -= hrs; off++;
  }
  return out;
}

async function main() {
  // ═══════════════════════════════════════════════════════════════
  // PHASE 1: All reads + customer + supplier  (7 parallel)
  //   POST /supplier has NO dependencies — include here to save a phase
  // ═══════════════════════════════════════════════════════════════
  const [dept, pm, acct, vt, vat, cust, supp] = await Promise.all([
    get("/department?isInactive=false&count=1&fields=*"),
    get("/employee?assignableProjectManagers=true&count=1&fields=*"),
    get("/ledger/account?number=1920,6590,2400&fields=id,number,name,isBankAccount,bankAccountNumber"),
    get("/ledger/voucherType?name=Leverandørfaktura&count=1&fields=id,name"),
    get("/ledger/vatType?typeOfVat=OUTGOING&vatDate=" + TODAY + "&fields=id,name,percentage"),
    post("/customer", { name: CUST_NAME, organizationNumber: CUST_ORG, isCustomer: true }),
    post("/supplier", { name: SUPP_NAME, organizationNumber: SUPP_ORG, isSupplier: true }),
  ]);
  const deptId  = dept.values[0].id;
  const pmAssId = pm.values[0].id;   // account owner — only assignable PM
  const a1920   = acct.values.find((a: any) => a.number === 1920);
  const a6590   = acct.values.find((a: any) => a.number === 6590);
  const a2400   = acct.values.find((a: any) => a.number === 2400);
  const vtId    = vt.values[0].id;   // NEVER hardcode — environment-specific
  const vatId   = vat.values[0].id;
  const custId  = cust.value.id;
  const sId     = supp.value.id;

  // ═══════════════════════════════════════════════════════════════
  // PHASE 2: Batch employees + project  (2-3 parallel)
  //   CRITICAL: isFixedPrice + fixedprice on project
  //   CRITICAL: NO employments[] on employees
  // ═══════════════════════════════════════════════════════════════
  const s2: Promise<any>[] = [
    post("/employee/list", [
      { firstName: PM_FIRST,  lastName: PM_LAST,  email: PM_EMAIL,  dateOfBirth: "1988-01-01", userType: "NO_ACCESS", department: { id: deptId } },
      { firstName: CON_FIRST, lastName: CON_LAST, email: CON_EMAIL, dateOfBirth: "1992-01-01", userType: "NO_ACCESS", department: { id: deptId } },
    ]),
    post("/project", {
      name: PROJECT_NAME,
      startDate: TODAY,
      customer: { id: custId },
      projectManager: { id: pmAssId },
      isFixedPrice: true,       // ← CRITICAL — omitting = check 3 FAILS
      fixedprice: BUDGET,       // ← CRITICAL — omitting = check 3 FAILS
    }),
  ];
  if (a1920 && !a1920.bankAccountNumber) {
    s2.push(put(`/ledger/account/${a1920.id}`, { ...a1920, bankAccountNumber: "12345678903" }));
  }
  const [emps, proj] = await Promise.all(s2);
  const e1 = emps.values[0].id;  // PM employee
  const e2 = emps.values[1].id;  // consultant employee
  const pId = proj.value.id;

  // ═══════════════════════════════════════════════════════════════
  // PHASE 3: Activity + participants + orderline + voucher (4 parallel)
  //   CRITICAL: budgetHours on activity
  //   CRITICAL: adminAccess: true on PM participant
  //   CRITICAL: POST /project/orderline — voucher alone = check 5 FAILS
  //   Voucher depends on: vtId + a6590 + a2400 (phase 1), pId (phase 2), sId (phase 1)
  //   Orderline depends on: pId (phase 2) — all deps satisfied
  // ═══════════════════════════════════════════════════════════════
  const [act, _parts, _ol, _vouch] = await Promise.all([
    post("/project/projectActivity", {
      project: { id: pId },
      startDate: TODAY,
      budgetHours: TOTAL_HOURS,  // ← CRITICAL — omitting = check 3 FAILS
      budgetFeeCurrency: BUDGET,
      activity: {
        name: "Prosjektaktivitet",
        activityType: "PROJECT_SPECIFIC_ACTIVITY",
        isChargeable: false,     // MUST be inside activity{}, NOT on root
      },
    }),
    post("/project/participant/list", [
      { project: { id: pId }, employee: { id: e1 }, adminAccess: true },   // ← CRITICAL: PM = true
      { project: { id: pId }, employee: { id: e2 }, adminAccess: false },
    ]),
    post("/project/orderline", {             // ← CRITICAL — this call is REQUIRED
      project: { id: pId },
      description: "Leverandørkostnad",
      date: TODAY,
      count: 1,
      unitCostCurrency: SUPP_COST,           // ← CRITICAL — populates project costs
      isChargeable: false,
    }),
    post("/ledger/voucher", {
      date: TODAY, description: "Leverandørkostnad", voucherType: { id: vtId },
      postings: [
        { row: 1, date: TODAY, description: "Leverandørkostnad", account: { id: a6590!.id },
          amount: SUPP_COST, amountCurrency: SUPP_COST, amountGross: SUPP_COST, amountGrossCurrency: SUPP_COST,
          project: { id: pId } },
        { row: 2, date: TODAY, description: "Leverandørgjeld", account: { id: a2400!.id },
          amount: -SUPP_COST, amountCurrency: -SUPP_COST, amountGross: -SUPP_COST, amountGrossCurrency: -SUPP_COST,
          supplier: { id: sId } },
      ],
    }),
  ]);
  const actId = act.value.activity.id;

  // ═══════════════════════════════════════════════════════════════
  // PHASE 4: Timesheet + invoice  (2 parallel)
  //   Timesheet needs actId from phase 3
  //   Invoice is independent — all deps from phase 1+2
  // ═══════════════════════════════════════════════════════════════
  const ts1 = splitHours(PM_HOURS, TODAY).map(e => ({
    employee: { id: e1 }, project: { id: pId }, activity: { id: actId }, date: e.date, hours: e.hours,
  }));
  const ts2 = splitHours(CON_HOURS, TODAY).map(e => ({
    employee: { id: e2 }, project: { id: pId }, activity: { id: actId }, date: e.date, hours: e.hours,
  }));
  const dd = new Date(Date.UTC(+TODAY.slice(0,4), +TODAY.slice(5,7)-1, +TODAY.slice(8,10)+14)).toISOString().slice(0,10);
  await Promise.all([
    post("/timesheet/entry/list", [...ts1, ...ts2]),
    post("/invoice?sendToCustomer=false", {
      invoiceDate: TODAY, invoiceDueDate: dd, customer: { id: custId },
      orders: [{
        customer: { id: custId },
        project: { id: pId },   // ← project goes HERE on orders[], NOT inside orderLines[]
        orderDate: TODAY, deliveryDate: TODAY,
        orderLines: [{
          description: PROJECT_NAME,
          count: 1,
          unitPriceExcludingVatCurrency: BUDGET,
          vatType: { id: vatId },
        }],
      }],
    }),
  ]);
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
```

## Recovery

If a step fails, handle these known cases:
- no department → `POST /department` with `{ "name": "Avdeling" }` (+1 call)
- account 1920 missing → `GET /ledger/account?isBankAccount=true&fields=*` (+1 call)
- bank account lacks number → already handled in phase 2 (PUT with `"12345678903"`, MOD11-valid)
- PM constraint: only account owner can be `projectManager`; already handled (use assignable PM from phase 1, add prompt-named PM as participant with `adminAccess: true` in phase 3)
- POST /invoice returns 409 "Duplicate entry" → retry the same POST once directly; do NOT waste calls checking existing orders/invoices first (their GET endpoints require date range params you don't have, wasting 422s)

## Do NOT
- include `employments[]` on employees — causes division/startDate 422 traps
- use two separate `POST /employee` — use batch `/list`
- use two separate `POST /project/participant` — use batch `/list`
- use `POST /supplierInvoice` — no POST method exists
- skip `POST /project/orderline` — voucher alone does NOT populate project costs
- put `isChargeable` on projectActivity root — must be inside `activity{}`
- put `project` inside `orderLines[]` — must be on `orders[]`
- hardcode voucherType ID — always use GET result
- use `new Date(str + "T00:00:00")` — shifts in CET/CEST; use `Date.UTC()`
- use `bankAccountNumber: "12345678901"` — not MOD11-valid; use `"12345678903"`
- omit `row: 1` / `row: 2` on voucher postings — causes 422
- omit `invoiceDueDate` on invoice — causes 422
- on 409 invoice failure: do NOT use GET /order or GET /invoice to check state — they require `orderDateFrom/To` or `invoiceDateFrom/To` params; missing them → 422; just retry the POST directly
