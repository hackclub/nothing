import { auth } from "~/lib/auth";

export type HcaAddress = {
  line1: string | null;
  line2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
};

export type HcaProfile = {
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  // Raw YYYY-MM-DD, as returned by HCA — callers convert to whatever shape they need.
  birthday: string | null;
  address: HcaAddress | null;
};

type HcaMeResponse = {
  identity?: {
    first_name?: string | null;
    last_name?: string | null;
    primary_email?: string | null;
    birthday?: string | null;
    addresses?: {
      line_1?: string | null;
      line_2?: string | null;
      city?: string | null;
      state?: string | null;
      postal_code?: string | null;
      country?: string | null;
      primary?: boolean;
    }[];
  };
};

// No request/session available here (this runs from a scheduled task, not a
// request handler) — getAccessToken is called with an explicit userId instead
// of headers, and better-auth transparently refreshes the stored token if
// it's expired.
export async function fetchHcaProfile(userId: string): Promise<HcaProfile | null> {
  const { accessToken } = await auth.api.getAccessToken({ body: { providerId: "hca", userId } });
  if (!accessToken) return null;

  const res = await fetch("https://auth.hackclub.com/api/v1/me", {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!res.ok) return null;

  const { identity }: HcaMeResponse = await res.json();
  if (!identity) return null;

  // Use the user's default address — the one HCA marks `primary` — falling
  // back to the first if none is marked (e.g. only one address on file).
  const address = identity.addresses?.find(a => a.primary) ?? identity.addresses?.[0];

  return {
    firstName: identity.first_name ?? null,
    lastName: identity.last_name ?? null,
    email: identity.primary_email ?? null,
    birthday: identity.birthday ?? null,
    address: address
      ? {
          line1: address.line_1 ?? null,
          line2: address.line_2 ?? null,
          city: address.city ?? null,
          state: address.state ?? null,
          postalCode: address.postal_code ?? null,
          country: address.country ?? null
        }
      : null
  };
}
