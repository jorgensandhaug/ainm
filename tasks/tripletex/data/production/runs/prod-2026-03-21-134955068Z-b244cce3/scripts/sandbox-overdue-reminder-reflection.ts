const baseUrl = "https://kkpqfuj-amager.tripletex.dev/v2";
const sessionToken =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const runDate = "2026-03-21";

type JsonObject = Record<string, any>;

const authHeader = `Basic ${Buffer.from(`0:${sessionToken}`).toString("base64")}`;

function buildUrl(path: string, query?: Record<string, string>): string {
  const trimmedBase = baseUrl.replace(/\/+$/, "");
  const trimmedPath = path.replace(/^\/+/, "");
  const url = new URL(`${trimmedBase}/${trimmedPath}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
  }
  return url.toString();
}

function unwrapJson<T>(json: any): T {
  if (json?.values !== undefined) return json.values as T;
  if (json?.value !== undefined) return json.value as T;
  return json as T;
}

function outstandingAmount(invoice: JsonObject): number {
  return Number(invoice.amountCurrencyOutstanding ?? invoice.amountOutstanding ?? 0);
}

function scorePaymentType(paymentType: JsonObject): number {
  const debitNumber = String(paymentType?.debitAccount?.number ?? "");
  const creditNumber = String(paymentType?.creditAccount?.number ?? "");
  let score = 0;
  if (debitNumber.startsWith("19")) score += 8;
  if (paymentType?.debitAccount?.isBankAccount) score += 5;
  if (paymentType?.debitAccount?.isInvoiceAccount) score += 3;
  if (creditNumber === "1500") score += 2;
  return score;
}

async function api<T>(
  method: string,
  path: string,
  options: { query?: Record<string, string>; body?: JsonObject } = {},
): Promise<{ data: T; status: number; raw: any }> {
  const response = await fetch(buildUrl(path, options.query), {
    method,
    headers: {
      Authorization: authHeader,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const text = await response.text();
  let parsed: any = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }

  if (!response.ok) {
    const bodyText = typeof parsed === "string" ? parsed : JSON.stringify(parsed);
    throw new Error(`HTTP ${response.status} on ${method} ${path}: ${bodyText}`);
  }

  return {
    data: text ? unwrapJson<T>(parsed) : (null as T),
    status: response.status,
    raw: parsed,
  };
}

async function inspectOverdue() {
  const { data: invoices } = await api<JsonObject[]>("GET", "invoice", {
    query: {
      invoiceDateFrom: "1900-01-01",
      invoiceDateTo: "2100-12-31",
      count: "1000",
      sorting: "-invoiceDate",
      fields: "*,customer(*)",
    },
  });

  const overdue = invoices
    .filter(
      (invoice) =>
        typeof invoice.invoiceDueDate === "string" &&
        invoice.invoiceDueDate < runDate &&
        outstandingAmount(invoice) > 0,
    )
    .map((invoice) => ({
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      dueDate: invoice.invoiceDueDate,
      outstanding: outstandingAmount(invoice),
      customerId: invoice.customer?.id,
      customerName: invoice.customer?.name,
    }));

  console.log(JSON.stringify({ overdueCount: overdue.length, overdue }, null, 2));
}

async function createFixture(customerId: number, amount: number) {
  const { data: invoice } = await api<JsonObject>("POST", "invoice", {
    body: {
      invoiceDate: "2026-03-01",
      invoiceDueDate: "2026-03-05",
      customer: { id: customerId },
      orders: [
        {
          customer: { id: customerId },
          orderDate: "2026-03-01",
          deliveryDate: "2026-03-01",
          orderLines: [
            {
              description: "Reflection overdue fixture",
              count: 1,
              unitPriceExcludingVatCurrency: amount,
            },
          ],
        },
      ],
    },
  });

  console.log(
    JSON.stringify(
      {
        fixtureInvoiceId: invoice.id,
        fixtureInvoiceNumber: invoice.invoiceNumber,
        customerId,
        amountCurrency: invoice.amountCurrency ?? invoice.amountIncludingVatCurrency,
        invoiceDueDate: invoice.invoiceDueDate,
      },
      null,
      2,
    ),
  );
}

async function proveSixCall(invoiceId: number, reminderFee: number, paymentAmount: number) {
  let callCount = 0;
  const countedApi = async <T>(
    method: string,
    path: string,
    options: { query?: Record<string, string>; body?: JsonObject } = {},
  ) => {
    callCount += 1;
    return api<T>(method, path, options);
  };

  const { data: invoices } = await countedApi<JsonObject[]>("GET", "invoice", {
    query: {
      invoiceDateFrom: "1900-01-01",
      invoiceDateTo: "2100-12-31",
      count: "1000",
      sorting: "-invoiceDate",
      fields: "*,customer(*)",
    },
  });
  const invoice = invoices.find((item) => Number(item.id) === invoiceId);
  if (!invoice) throw new Error(`Invoice ${invoiceId} not found in locate read`);
  if (invoice.invoiceDueDate >= runDate) throw new Error(`Invoice ${invoiceId} is not overdue`);
  if (outstandingAmount(invoice) < paymentAmount) {
    throw new Error(`Invoice ${invoiceId} outstanding ${outstandingAmount(invoice)} < ${paymentAmount}`);
  }
  const customerId = Number(invoice.customer?.id);
  if (!customerId) throw new Error(`Invoice ${invoiceId} missing customer.id`);

  const { data: paymentTypes } = await countedApi<JsonObject[]>("GET", "invoice/paymentType", {
    query: { count: "1000", fields: "*,debitAccount(*),creditAccount(*)" },
  });
  const paymentType = [...paymentTypes].sort((a, b) => scorePaymentType(b) - scorePaymentType(a))[0];
  if (!paymentType?.id) throw new Error("No payment type found");

  const { data: accounts } = await countedApi<JsonObject[]>("GET", "ledger/account", {
    query: { number: "1500,3400", fields: "*" },
  });
  const account1500 = accounts.find((account) => Number(account.number) === 1500);
  const account3400 = accounts.find((account) => Number(account.number) === 3400);
  if (!account1500?.id || !account3400?.id) throw new Error("Missing 1500/3400");

  const description = `Reflection reminder fee ${invoice.invoiceNumber ?? invoice.id}`;
  const { data: voucher } = await countedApi<JsonObject>("POST", "ledger/voucher", {
    body: {
      date: runDate,
      description,
      voucherType: null,
      postings: [
        {
          row: 1,
          date: runDate,
          description,
          account: { id: account1500.id },
          customer: { id: customerId },
          currency: { id: 1 },
          amount: reminderFee,
          amountCurrency: reminderFee,
          amountGross: reminderFee,
          amountGrossCurrency: reminderFee,
        },
        {
          row: 2,
          date: runDate,
          description,
          account: { id: account3400.id },
          currency: { id: 1 },
          amount: -reminderFee,
          amountCurrency: -reminderFee,
          amountGross: -reminderFee,
          amountGrossCurrency: -reminderFee,
        },
      ],
    },
  });

  const { data: feeInvoice } = await countedApi<JsonObject>("POST", "invoice", {
    body: {
      invoiceDate: runDate,
      invoiceDueDate: runDate,
      customer: { id: customerId },
      orders: [
        {
          customer: { id: customerId },
          orderDate: runDate,
          deliveryDate: runDate,
          orderLines: [
            {
              description: "Purregebyr",
              count: 1,
              unitPriceExcludingVatCurrency: reminderFee,
            },
          ],
        },
      ],
    },
  });

  const { data: payment } = await countedApi<JsonObject>("PUT", `invoice/${invoiceId}/:payment`, {
    query: {
      paymentDate: runDate,
      paymentTypeId: String(paymentType.id),
      paidAmount: String(paymentAmount),
    },
  });

  console.log(
    JSON.stringify(
      {
        callCount,
        invoiceId,
        invoiceNumber: invoice.invoiceNumber,
        outstandingBefore: outstandingAmount(invoice),
        paymentTypeId: paymentType.id,
        account1500Id: account1500.id,
        account3400Id: account3400.id,
        voucherId: voucher.id,
        voucherNumber: voucher.number,
        feeInvoiceId: feeInvoice.id,
        feeInvoiceNumber: feeInvoice.invoiceNumber,
        feeInvoiceAmount: feeInvoice.amountCurrency ?? feeInvoice.amountIncludingVatCurrency,
        remainingOutstanding: outstandingAmount(payment),
      },
      null,
      2,
    ),
  );
}

async function testPaymentWithoutPaymentType(invoiceId: number, paymentAmount: number) {
  try {
    const { data: payment } = await api<JsonObject>("PUT", `invoice/${invoiceId}/:payment`, {
      query: {
        paymentDate: runDate,
        paidAmount: String(paymentAmount),
      },
    });
    console.log(
      JSON.stringify(
        {
          outcome: "unexpected-success",
          invoiceId,
          paymentAmount,
          remainingOutstanding: outstandingAmount(payment),
        },
        null,
        2,
      ),
    );
  } catch (error) {
    console.log(
      JSON.stringify(
        {
          outcome: "expected-failure",
          invoiceId,
          paymentAmount,
          error: String(error),
        },
        null,
        2,
      ),
    );
  }
}

const [mode, ...rest] = Bun.argv.slice(2);

if (mode === "inspect") {
  await inspectOverdue();
} else if (mode === "create-fixture") {
  const customerId = Number(rest[0]);
  const amount = Number(rest[1] ?? "9000");
  if (!customerId) throw new Error("Usage: create-fixture <customerId> [amount]");
  await createFixture(customerId, amount);
} else if (mode === "prove") {
  const invoiceId = Number(rest[0]);
  const reminderFee = Number(rest[1] ?? "45");
  const paymentAmount = Number(rest[2] ?? "5000");
  if (!invoiceId) throw new Error("Usage: prove <invoiceId> [reminderFee] [paymentAmount]");
  await proveSixCall(invoiceId, reminderFee, paymentAmount);
} else if (mode === "test-no-payment-type") {
  const invoiceId = Number(rest[0]);
  const paymentAmount = Number(rest[1] ?? "1");
  if (!invoiceId) throw new Error("Usage: test-no-payment-type <invoiceId> [paymentAmount]");
  await testPaymentWithoutPaymentType(invoiceId, paymentAmount);
} else {
  throw new Error(
    "Usage: inspect | create-fixture <customerId> [amount] | prove <invoiceId> [reminderFee] [paymentAmount] | test-no-payment-type <invoiceId> [paymentAmount]",
  );
}
