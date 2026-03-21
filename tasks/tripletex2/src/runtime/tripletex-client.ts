import type {
  HttpMethod,
  QueryValue,
  RunApiCall,
  SerializedQueryValue,
  TripletexCallCapture,
  TripletexCallLogSnapshot,
  TripletexClient,
  TripletexClientConfig,
  TripletexCredentials,
  TripletexFetch,
  TripletexFetchResponse,
  TripletexRequestOptions,
} from "./contracts";

interface NormalizedTripletexQuery {
  logged?: Record<string, SerializedQueryValue>;
  queryString: string;
}

interface NormalizedTripletexRequestBody {
  body?: BodyInit;
  logged?: unknown;
  contentType?: string;
  summary?: string;
}

interface TripletexErrorEnvelope {
  status?: number;
  code?: number | string;
  message?: string;
  link?: string;
  developerMessage?: string;
  validationMessages?: unknown;
  requestId?: string;
}

export interface TripletexCallLog extends TripletexCallCapture {
  snapshot(): TripletexCallLogSnapshot;
}

export class TripletexHttpError extends Error {
  readonly status: number;
  readonly errorCode?: string;
  readonly path: string;
  readonly retryable: boolean;
  readonly requestId?: string;

  constructor(input: {
    status: number;
    path: string;
    message: string;
    errorCode?: string;
    requestId?: string;
  }) {
    super(input.message);
    this.name = "TripletexHttpError";
    this.status = input.status;
    this.path = input.path;
    this.errorCode = input.errorCode;
    this.requestId = input.requestId;
    this.retryable = input.status === 429 || input.status >= 500;
  }
}

export function createTripletexClient(
  config: TripletexClientConfig,
): TripletexClient {
  const fetchImplementation = resolveTripletexFetch(config.fetch);
  const baseUrl = normalizeTripletexBaseUrl(config.baseUrl);
  const defaultHeaders = sanitizeDefaultHeaders(config.defaultHeaders);
  const authorizationHeader = buildTripletexAuthorizationHeader(
    config.credentials,
  );
  let nextCallIndex = 1;

  return {
    get<TResponse>(path: string, options?: TripletexRequestOptions) {
      return request<TResponse>("GET", path, options);
    },
    post<TResponse>(path: string, options?: TripletexRequestOptions) {
      return request<TResponse>("POST", path, options);
    },
    put<TResponse>(path: string, options?: TripletexRequestOptions) {
      return request<TResponse>("PUT", path, options);
    },
    delete<TResponse>(path: string, options?: TripletexRequestOptions) {
      return request<TResponse>("DELETE", path, options);
    },
  };

  async function request<TResponse>(
    method: HttpMethod,
    path: string,
    options?: TripletexRequestOptions,
  ): Promise<TResponse> {
    const normalizedPath = normalizeTripletexPath(path);
    const normalizedQuery = normalizeTripletexQuery(options?.query);
    const normalizedBody = normalizeTripletexRequestBody(options);
    const requestUrl = buildTripletexRequestUrl(
      baseUrl,
      normalizedPath,
      normalizedQuery.queryString,
    );
    const requestSummary = summarizeTripletexRequest(method, normalizedPath, {
      query: normalizedQuery.logged,
      body: normalizedBody.logged,
      bodySummary: normalizedBody.summary,
    });
    const headers: Record<string, string> = {
      Accept: "application/json",
      Authorization: authorizationHeader,
      ...defaultHeaders,
    };

    let requestBody: BodyInit | undefined;
    if (normalizedBody.body !== undefined) {
      requestBody = normalizedBody.body;
      if (normalizedBody.contentType) {
        headers["Content-Type"] = normalizedBody.contentType;
      }
    }

    const startedAt = Date.now();

    let response: TripletexFetchResponse;
    try {
      response = await fetchImplementation(requestUrl, {
        method,
        headers,
        body: requestBody,
      });
    } catch (error) {
      recordCall({
        method,
        path: normalizedPath,
        query: normalizedQuery.logged,
        requestSummary,
        responseSummary: summarizeTripletexErrorMessage(error),
        durationMs: elapsedSince(startedAt),
        errorCode: "network-error",
      });
      throw error;
    }

    const durationMs = elapsedSince(startedAt);
    const responsePayload = await parseTripletexResponseBody(response);
    const responseSummary = summarizeTripletexResponse(
      normalizedPath,
      response.status,
      responsePayload,
    );
    const errorCode =
      response.status >= 400
        ? extractTripletexErrorCode(responsePayload) ?? `http-${response.status}`
        : undefined;

    recordCall({
      method,
      path: normalizedPath,
      query: normalizedQuery.logged,
      requestSummary,
      responseSummary,
      status: response.status,
      durationMs,
      entityIds: extractTripletexEntityIds(normalizedPath, responsePayload),
      errorCode,
    });

    if (response.status >= 400) {
      throw createTripletexHttpError(normalizedPath, response.status, responsePayload);
    }

    return responsePayload as TResponse;
  }

  function recordCall(call: Omit<RunApiCall, "index">): void {
    config.capture?.record({
      ...call,
      index: nextCallIndex,
    });
    nextCallIndex += 1;
  }
}

export function createTripletexCallLog(): TripletexCallLog {
  const apiCalls: RunApiCall[] = [];

  return {
    record(call: RunApiCall) {
      apiCalls.push(call);
    },
    snapshot() {
      return summarizeTripletexCallLog(apiCalls);
    },
  };
}

export function summarizeTripletexCallLog(
  apiCalls: readonly RunApiCall[],
): TripletexCallLogSnapshot {
  return {
    apiCallCount: apiCalls.length,
    api4xxCount: apiCalls.filter(
      (call) => typeof call.status === "number" && call.status >= 400 && call.status < 500,
    ).length,
    api5xxCount: apiCalls.filter(
      (call) => typeof call.status === "number" && call.status >= 500 && call.status < 600,
    ).length,
    apiCalls: apiCalls.map((call) => ({ ...call })),
  };
}

export function normalizeTripletexQuery(
  query?: Record<string, QueryValue>,
): NormalizedTripletexQuery {
  if (!query) {
    return { queryString: "" };
  }

  const logged: Record<string, SerializedQueryValue> = {};
  const pairs: string[] = [];

  for (const [key, rawValue] of Object.entries(query)) {
    if (rawValue === undefined) {
      continue;
    }

    const value = normalizeQueryValue(key, rawValue);
    logged[key] = sanitizeLoggedQueryValue(key, value);
    pairs.push(
      `${encodeURIComponent(key)}=${encodeURIComponent(
        value === null ? "null" : String(value),
      )}`,
    );
  }

  if (pairs.length === 0) {
    return { queryString: "" };
  }

  return {
    logged,
    queryString: pairs.join("&"),
  };
}

export function normalizeTripletexBody(body: unknown): unknown {
  return normalizeJsonValue(body, "$", new Set<object>());
}

function normalizeTripletexRequestBody(
  options?: TripletexRequestOptions,
): NormalizedTripletexRequestBody {
  if (!options) {
    return {};
  }

  if (options.body !== undefined && options.rawBody !== undefined) {
    throw new Error(
      "Tripletex request options cannot include both body and rawBody.",
    );
  }

  if (options.rawBody !== undefined) {
    return {
      body: options.rawBody,
      contentType: options.contentType,
      summary: summarizeRawBody(options.rawBody),
    };
  }

  if (options.body === undefined) {
    return {};
  }

  const normalized = normalizeTripletexBody(options.body);
  return {
    body: JSON.stringify(normalized),
    logged: normalized,
    contentType: "application/json; charset=utf-8",
  };
}

export function sanitizeTripletexValue(value: unknown): unknown {
  return sanitizeValue(value, 0);
}

export function summarizeTripletexRequest(
  method: HttpMethod,
  path: string,
  input: {
    query?: Record<string, SerializedQueryValue>;
    body?: unknown;
    bodySummary?: string;
  },
): string | undefined {
  const resource = describeTripletexResource(path);
  const action = describeTripletexMethod(method);
  const queryKeys = Object.keys(input.query ?? {});
  const bodyKeys = summarizeBodyKeys(input.body);

  if (queryKeys.length > 0 && bodyKeys.length > 0) {
    return `${action} ${resource} by ${queryKeys.join(", ")} with ${bodyKeys.join(", ")}`;
  }

  if (queryKeys.length > 0) {
    return `${action} ${resource} by ${queryKeys.join(", ")}`;
  }

  if (bodyKeys.length > 0) {
    return `${action} ${resource} with ${bodyKeys.join(", ")}`;
  }

  if (input.bodySummary) {
    return `${action} ${resource} with ${input.bodySummary}`;
  }

  return `${action} ${resource}`;
}

export function summarizeTripletexResponse(
  path: string,
  status: number,
  body: unknown,
): string | undefined {
  if (status === 204) {
    return "no content";
  }

  if (isTripletexErrorEnvelope(body)) {
    const code = extractTripletexErrorCode(body);
    const message = sanitizeString(body.message ?? body.developerMessage ?? "request failed");
    return code ? `error ${code}: ${message}` : `error: ${message}`;
  }

  const resource = describeTripletexResource(path);
  if (hasListValues(body)) {
    const itemCount = body.values.length;
    return `${resource} list ${itemCount} item${itemCount === 1 ? "" : "s"}`;
  }

  const entityIds = extractTripletexEntityIds(path, body);
  if (entityIds) {
    const entitySummary = Object.entries(entityIds)
      .map(([key, value]) => `${key} ${value}`)
      .join(", ");
    return entitySummary;
  }

  if (isRecord(body) && "value" in body && isRecord(body.value)) {
    return `${resource} returned`;
  }

  if (typeof body === "string" && body.length > 0) {
    return sanitizeString(body);
  }

  return `${resource} response status ${status}`;
}

export function extractTripletexEntityIds(
  path: string,
  body: unknown,
): Record<string, number> | undefined {
  if (!isRecord(body) || !isRecord(body.value)) {
    return undefined;
  }

  const id = body.value.id;
  if (typeof id !== "number" || !Number.isFinite(id)) {
    return undefined;
  }

  const resource = describeTripletexResource(path);
  return {
    [`${toEntityIdKey(resource)}Id`]: id,
  };
}

export function buildTripletexAuthorizationHeader(
  credentials: TripletexCredentials,
): string {
  const companyId =
    credentials.companyId === undefined ? "0" : String(credentials.companyId);
  const token = `${companyId}:${credentials.sessionToken}`;
  return `Basic ${encodeBase64(token)}`;
}

function normalizeJsonValue(
  value: unknown,
  valuePath: string,
  seen: Set<object>,
): unknown {
  if (value === undefined || value === null) {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "string" || typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error(`Tripletex request body contains a non-finite number at ${valuePath}.`);
    }

    return value;
  }

  if (Array.isArray(value)) {
    return value.map((entry, index) => {
      const normalizedEntry = normalizeJsonValue(
        entry,
        `${valuePath}[${index}]`,
        seen,
      );
      return normalizedEntry === undefined ? null : normalizedEntry;
    });
  }

  if (typeof value === "object") {
    if (seen.has(value)) {
      throw new Error(`Tripletex request body contains a circular reference at ${valuePath}.`);
    }

    seen.add(value);
    const normalized: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      const normalizedEntry = normalizeJsonValue(
        entry,
        `${valuePath}.${key}`,
        seen,
      );
      if (normalizedEntry !== undefined) {
        normalized[key] = normalizedEntry;
      }
    }
    seen.delete(value);
    return normalized;
  }

  throw new Error(
    `Tripletex request body contains an unsupported value at ${valuePath}.`,
  );
}

function normalizeQueryValue(
  key: string,
  value: Exclude<QueryValue, undefined>,
): SerializedQueryValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error(`Tripletex query parameter ${key} must be finite.`);
    }

    return value;
  }

  throw new Error(`Tripletex query parameter ${key} has an unsupported value.`);
}

async function parseTripletexResponseBody(
  response: TripletexFetchResponse,
): Promise<unknown> {
  const rawText = await response.text();
  if (rawText.length === 0) {
    return undefined;
  }

  const contentType = response.headers.get("content-type") ?? "";
  const expectsJson =
    contentType.toLowerCase().includes("json") ||
    rawText.startsWith("{") ||
    rawText.startsWith("[");

  if (!expectsJson) {
    return rawText;
  }

  try {
    return JSON.parse(rawText) as unknown;
  } catch {
    return rawText;
  }
}

function createTripletexHttpError(
  path: string,
  status: number,
  body: unknown,
): TripletexHttpError {
  if (isTripletexErrorEnvelope(body)) {
    return new TripletexHttpError({
      path,
      status,
      errorCode: extractTripletexErrorCode(body),
      requestId: body.requestId,
      message:
        body.message ??
        body.developerMessage ??
        `Tripletex request failed with status ${status}.`,
    });
  }

  const message =
    typeof body === "string" && body.length > 0
      ? sanitizeString(body)
      : `Tripletex request failed with status ${status}.`;

  return new TripletexHttpError({
    path,
    status,
    message,
  });
}

function resolveTripletexFetch(fetchImplementation?: TripletexFetch): TripletexFetch {
  if (fetchImplementation) {
    return fetchImplementation;
  }

  const globalFetch = (globalThis as { fetch?: TripletexFetch }).fetch;
  if (!globalFetch) {
    throw new Error("Tripletex client requires a fetch implementation.");
  }

  return globalFetch;
}

function sanitizeDefaultHeaders(
  headers?: Record<string, string>,
): Record<string, string> {
  if (!headers) {
    return {};
  }

  const sanitized: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === "authorization") {
      continue;
    }

    sanitized[key] = value;
  }

  return sanitized;
}

function buildTripletexRequestUrl(
  baseUrl: string,
  path: string,
  queryString: string,
): string {
  if (queryString.length === 0) {
    return `${baseUrl}${path}`;
  }

  return `${baseUrl}${path}?${queryString}`;
}

function normalizeTripletexBaseUrl(baseUrl: string): string {
  const normalized = baseUrl.trim().replace(/\/+$/, "");
  if (normalized.length === 0) {
    throw new Error("Tripletex client requires a baseUrl.");
  }

  return normalized;
}

function normalizeTripletexPath(path: string): string {
  const normalized = path.trim();
  if (!normalized.startsWith("/")) {
    throw new Error(`Tripletex path must start with "/": ${path}`);
  }

  return normalized.replace(/\/{2,}/g, "/");
}

function encodeBase64(value: string): string {
  const buffer = (globalThis as {
    Buffer?: {
      from(input: string, encoding?: string): { toString(encoding: string): string };
    };
  }).Buffer;

  if (buffer) {
    return buffer.from(value, "utf8").toString("base64");
  }

  if (typeof btoa === "function") {
    return btoa(value);
  }

  throw new Error("Tripletex client could not find a base64 encoder.");
}

function summarizeBodyKeys(body: unknown): string[] {
  if (!isRecord(body)) {
    return [];
  }

  return Object.keys(body).slice(0, 4);
}

function summarizeRawBody(body: BodyInit): string {
  if (typeof FormData !== "undefined" && body instanceof FormData) {
    const keys = Array.from(body.keys());
    if (keys.length === 0) {
      return "multipart form";
    }

    return `multipart form ${keys.join(", ")}`;
  }

  if (typeof Blob !== "undefined" && body instanceof Blob) {
    return "binary body";
  }

  if (typeof body === "string") {
    return "raw string body";
  }

  if (typeof URLSearchParams !== "undefined" && body instanceof URLSearchParams) {
    return "urlencoded form";
  }

  return "raw body";
}

function describeTripletexMethod(method: HttpMethod): string {
  switch (method) {
    case "GET":
      return "lookup";
    case "POST":
      return "create";
    case "PUT":
      return "update";
  }
}

function describeTripletexResource(path: string): string {
  const segments = path
    .split("/")
    .filter(Boolean)
    .filter((segment) => !/^\d+$/.test(segment) && !segment.startsWith("{"));
  const actionSegments = segments.filter((segment) => segment.startsWith(":"));
  if (actionSegments.length > 0) {
    return sanitizeResourceName(actionSegments[actionSegments.length - 1].slice(1));
  }

  const nounSegments = segments.filter(
    (segment) => !segment.startsWith(":") && !segment.startsWith(">"),
  );
  if (nounSegments.length === 0) {
    return "resource";
  }

  return sanitizeResourceName(nounSegments[nounSegments.length - 1]);
}

function sanitizeResourceName(resource: string): string {
  return resource.replace(/[^a-zA-Z0-9]+/g, " ").trim() || "resource";
}

function toEntityIdKey(resource: string): string {
  const parts = resource
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.replace(/[^a-zA-Z0-9]/g, ""));
  if (parts.length === 0) {
    return "entity";
  }

  return [
    parts[0].charAt(0).toLowerCase() + parts[0].slice(1),
    ...parts.slice(1).map((part) => part.charAt(0).toUpperCase() + part.slice(1)),
  ].join("");
}

function extractTripletexErrorCode(body: unknown): string | undefined {
  if (!isTripletexErrorEnvelope(body)) {
    return undefined;
  }

  if (typeof body.code === "number" && Number.isFinite(body.code)) {
    return String(body.code);
  }

  if (typeof body.code === "string" && body.code.length > 0) {
    return body.code;
  }

  return undefined;
}

function isTripletexErrorEnvelope(body: unknown): body is TripletexErrorEnvelope {
  return isRecord(body) && ("message" in body || "developerMessage" in body || "code" in body);
}

function hasListValues(body: unknown): body is { values: unknown[] } {
  return isRecord(body) && Array.isArray(body.values);
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null;
}

function sanitizeValue(value: unknown, depth: number): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === "string") {
    return sanitizeString(value);
  }

  if (
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (depth >= 3) {
    return summarizeShape(value);
  }

  if (Array.isArray(value)) {
    const sanitized = value.slice(0, 4).map((entry) => sanitizeValue(entry, depth + 1));
    if (value.length > 4) {
      sanitized.push(`... +${value.length - 4} more`);
    }
    return sanitized;
  }

  if (isRecord(value)) {
    const sanitized: Record<string, unknown> = {};
    const entries = Object.entries(value);
    for (const [key, entry] of entries.slice(0, 8)) {
      sanitized[key] = isSensitiveKey(key) ? "[redacted]" : sanitizeValue(entry, depth + 1);
    }
    if (entries.length > 8) {
      sanitized["..."] = `+${entries.length - 8} more keys`;
    }
    return sanitized;
  }

  return String(value);
}

function summarizeShape(value: unknown): string {
  if (Array.isArray(value)) {
    return `array(${value.length})`;
  }

  if (isRecord(value)) {
    return `object(${Object.keys(value).length} keys)`;
  }

  return typeof value;
}

function isSensitiveKey(key: string): boolean {
  return /(authorization|token|secret|password|cookie|session|api[-_]?key)/i.test(key);
}

function sanitizeString(value: string): string {
  const trimmed = value.trim();
  if (/^(basic|bearer)\s+[a-z0-9+/_=-]+$/i.test(trimmed)) {
    return "[redacted-auth-header]";
  }

  if (/^[a-z0-9+/_=-]{32,}$/i.test(trimmed)) {
    return "[redacted-token-like-string]";
  }

  if (trimmed.length > 160) {
    return `${trimmed.slice(0, 157)}...`;
  }

  return trimmed;
}

function summarizeTripletexErrorMessage(error: unknown): string {
  return "network error";
}

function elapsedSince(startedAt: number): number {
  return Math.max(0, Date.now() - startedAt);
}

function sanitizeLoggedQueryValue(
  key: string,
  value: SerializedQueryValue,
): SerializedQueryValue {
  if (isSensitiveKey(key)) {
    return "[redacted]";
  }

  if (typeof value === "string") {
    return sanitizeString(value);
  }

  return value;
}
