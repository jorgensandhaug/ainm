import type {
  HttpMethod,
  QueryValue,
  TripletexClient,
} from "../runtime/contracts";
import { createTripletexClient } from "../runtime/tripletex-client";

export interface SandboxCredentials {
  base_url: string;
  session_token: string;
}

export function createSandboxClient(
  credentials: SandboxCredentials,
): TripletexClient {
  return createTripletexClient({
    baseUrl: credentials.base_url,
    credentials: {
      sessionToken: credentials.session_token,
      credentialSource: "tripletex2.sandbox-env",
    },
  });
}

export function callSandboxClient<TResponse>(
  client: TripletexClient,
  method: HttpMethod,
  path: string,
  options: {
    query?: Record<string, QueryValue>;
    body?: unknown;
  } = {},
): Promise<TResponse> {
  switch (method) {
    case "GET":
      return client.get<TResponse>(path, options);
    case "POST":
      return client.post<TResponse>(path, options);
    case "PUT":
      return client.put<TResponse>(path, options);
    case "DELETE":
      return client.delete<TResponse>(path, options);
  }
}
