const baseUrl = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const sessionToken = "OpZCDbacxDoOBWrPV7AeZTJoJ1oA1vP6QGwhGbtg45Y";
const runDate = "2026-03-21";
const reminderFee = 50;
const partialPayment = 5000;

type JsonObject = Record<string, any>;

const authHeader = `Basic ${Buffer.from(`0:${sessionToken}`).toString("base64")}`;

let callCount = 0;

function buildUrl(path: string, query?: Record<string, string>): string {
  const trimmedBase = baseUrl.replace(/\/+$/, "");
  const trimmedPath = path.replace(/^\/+/, "");
  const url = new URL(`${trimmedBase}/${trimmedPath}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      url.searchParams.set(key, value);
    }
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
): Promise<T> {
  callCount += 1;
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
    if (
      response.status === 403 &&
      (bodyText.includes("Invalid or expired token") ||
        bodyText.includes("Invalid or expired proxy token"))
    ) {
      throw new Error(`Blocked credentials on call ${callCount}: ${bodyText}`);
    }
    throw new Error(`HTTP ${response.status} on ${method} ${path}: ${bodyText}`);
  }

  if (!text) return null as T;
  return unwrapJson<T>(parsed);
}

async function createFeeInvoice(customerId: number): Promise<JsonObject> {
  const payload = {
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
  };

  try {
    return await api<JsonObject>("POST", "invoice", { body: payload });
  } catch (error) {
    const message = String(error);
    if (!message.includes("bankkontonummer")) throw error;

    const bankAccounts = await api<JsonObject[]>("GET", "ledger/account", {
      query: { isBankAccount: "true", fields: "*" },
    });
    const bankAccount =
      bankAccounts.find((account) => Number(account.number) === 1920) ?? bankAccounts[0];
    if (!bankAccount?.id) {
      throw new Error("Fee invoice failed on bank account validation and no bank account row found");
    }

    await api<JsonObject>("PUT", `ledger/account/${bankAccount.id}`, {
      body: { bankAccountNumber: "12345678903" },
    });
    return await api<JsonObject>("POST", "invoice", { body: payload });
  }
}

async function main() {
  const invoices = await api<JsonObject[]>("GET", "invoice", {
    query: {
      invoiceDateFrom: "1900-01-01",
      invoiceDateTo: "2100-12-31",
      count: "1000",
      sorting: "-invoiceDate",
      fields: "*,customer(*)",
    },
  });

  const overdueInvoices = invoices.filter((invoice) => {
    return (
      typeof invoice.invoiceDueDate === "string" &&
      invoice.invoiceDueDate < runDate &&
      outstandingAmount(invoice) > 0
    );
  });

  if (overdueInvoices.length !== 1) {
    throw new Error(`Expected exactly one overdue invoice, found ${overdueInvoices.length}`);
  }

  const overdueInvoice = overdueInvoices[0];
  const overdueOutstanding = outstandingAmount(overdueInvoice);
  const customerId = Number(overdueInvoice?.customer?.id);
  if (!customerId) throw new Error("Overdue invoice missing customer.id");
  if (overdueOutstanding < partialPayment) {
    throw new Error(
      `Overdue invoice outstanding ${overdueOutstanding} is below partial payment ${partialPayment}`,
    );
  }

  const paymentTypes = await api<JsonObject[]>("GET", "invoice/paymentType", {
    query: {
      count: "1000",
      fields: "*,debitAccount(*),creditAccount(*)",
    },
  });
  const paymentType = [...paymentTypes].sort((a, b) => scorePaymentType(b) - scorePaymentType(a))[0];
  if (!paymentType?.id) throw new Error("No usable invoice payment type found");

  const accounts = await api<JsonObject[]>("GET", "ledger/account", {
    query: { number: "1500,3400", fields: "*" },
  });
  const account1500 = accounts.find((account) => Number(account.number) === 1500);
  const account3400 = accounts.find((account) => Number(account.number) === 3400);
  if (!account1500?.id || !account3400?.id) {
    throw new Error("Could not resolve required ledger accounts 1500 and 3400");
  }

  const description = `Purregebyr ${overdueInvoice.invoiceNumber ?? overdueInvoice.id}`;
  const voucher = await api<JsonObject>("POST", "ledger/voucher", {
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

  const feeInvoice = await createFeeInvoice(customerId);

  const payment = await api<JsonObject>("PUT", `invoice/${overdueInvoice.id}/:payment`, {
    query: {
      paymentDate: runDate,
      paymentTypeId: String(paymentType.id),
      paidAmount: String(partialPayment),
    },
  });

  const remainingOutstanding = outstandingAmount(payment);
  const summary = {
    callCount,
    overdueInvoiceId: overdueInvoice.id,
    overdueInvoiceNumber: overdueInvoice.invoiceNumber,
    overdueOutstandingBefore: overdueOutstanding,
    customerId,
    voucherId: voucher.id,
    voucherNumber: voucher.number,
    feeInvoiceId: feeInvoice.id,
    feeInvoiceNumber: feeInvoice.invoiceNumber,
    feeInvoiceAmount: feeInvoice.amountCurrency ?? feeInvoice.amountIncludingVatCurrency,
    paymentTypeId: paymentType.id,
    remainingOutstanding,
  };

  console.log(JSON.stringify(summary, null, 2));
}

await main();
