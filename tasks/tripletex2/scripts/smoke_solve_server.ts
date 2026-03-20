#!/usr/bin/env bun

import type {
  TaskUnderstandingResolved,
  TripletexFetch,
  TripletexFetchResponse,
} from "../src/runtime/contracts";
import { startSolveServer } from "../src/server";

const port = Number(process.env.PORT ?? 3101);
const bearerToken = process.env.API_KEY ?? "smoke-token";
const runId =
  process.env.SMOKE_RUN_ID ??
  `sandbox-smoke-run-${new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-")}`;

startSolveServer({
  port,
  bearerToken,
  mode: "sandbox",
  createRunId: () => runId,
  taskUnderstanding: {
    result: {
      status: "resolved",
      taskId: "create-and-send-invoice",
      input: {
        customerName: "Nordhav AS",
        organizationNumber: "876520427",
        lineDescription: "Analyserapport",
        quantity: 1,
        unitPriceExcludingVatNok: 7850,
      },
    } satisfies TaskUnderstandingResolved<Record<string, unknown>, string>,
    taskSource: "manual-label",
    inputSource: "fixture",
    notes: ["Smoke server uses fixture task understanding and fixture Tripletex responses."],
  },
  fetch: createFixtureTripletexFetch(),
});

console.log(`Smoke solve server listening on http://127.0.0.1:${port}/solve`);
console.log(`Bearer token: ${bearerToken}`);
console.log(`Run ID: ${runId}`);
console.log("Example:");
console.log(
  `curl -s -X POST http://127.0.0.1:${port}/solve ` +
    `-H 'Authorization: Bearer ${bearerToken}' ` +
    "-H 'Content-Type: application/json' " +
    `--data-binary @<(cat <<'JSON'
{
  "prompt": "Opprett og send en faktura til kunden Nordhav AS (org.nr 876520427) på 7850 kr eksklusiv MVA. Fakturaen gjelder Analyserapport.",
  "files": [],
  "tripletex_credentials": {
    "base_url": "https://example.invalid",
    "session_token": "redacted-for-smoke",
    "credential_source": "fixture"
  }
}
JSON
)`,
);

function createFixtureTripletexFetch(): TripletexFetch {
  return async (input, init) => {
    const url = new URL(input);
    if (init.method === "GET" && url.pathname === "/customer") {
      return createResponse(200, {
        values: [
          {
            id: 42,
            name: "Nordhav AS",
            organizationNumber: "876520427",
            invoiceSendMethod: "EMAIL",
          },
        ],
      });
    }

    if (init.method === "GET" && url.pathname === "/ledger/vatType") {
      return createResponse(200, {
        values: [
          {
            id: 3,
            percentage: 25,
          },
        ],
      });
    }

    if (init.method === "POST" && url.pathname === "/invoice") {
      return createResponse(200, {
        value: {
          id: 9001,
          invoiceNumber: 110045,
        },
      });
    }

    if (init.method === "PUT" && url.pathname === "/invoice/9001/:send") {
      return createResponse(200, {});
    }

    throw new Error(`Unexpected Tripletex fixture request: ${init.method} ${url.pathname}`);
  };
}

function createResponse(
  status: number,
  body: unknown,
): TripletexFetchResponse {
  return {
    status,
    headers: {
      get() {
        return null;
      },
    },
    async text() {
      return JSON.stringify(body);
    },
  };
}
