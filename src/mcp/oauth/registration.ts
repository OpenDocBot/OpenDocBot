/** OAuth client registration: dynamic (RFC 7591) or a pre-registered client. */

export interface RegisteredClient {
  clientId: string;
  clientSecret?: string;
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** OAuth client metadata used for both DCR and Client ID Metadata Documents. */
export function buildClientMetadata(
  redirectUri: string,
  clientName = "OpenDocBot",
): Record<string, unknown> {
  return {
    client_name: clientName,
    redirect_uris: [redirectUri],
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    token_endpoint_auth_method: "none",
  };
}

/** Register a public client dynamically (RFC 7591). */
export async function registerClient(
  registrationEndpoint: string,
  redirectUri: string,
  fetchImpl: FetchLike = fetch,
): Promise<RegisteredClient> {
  const res = await fetchImpl(registrationEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(buildClientMetadata(redirectUri)),
  });
  if (!res.ok) throw new Error(`Client registration failed (HTTP ${res.status}).`);
  const json = (await res.json()) as { client_id?: string; client_secret?: string };
  if (!json.client_id) throw new Error("Client registration did not return a client_id.");
  return { clientId: json.client_id, clientSecret: json.client_secret };
}
