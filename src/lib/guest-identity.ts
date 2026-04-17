const GUEST_IDENTITY_STORAGE_PREFIX = "split-table:guest";

export type GuestIdentityRecord = {
  guestId: string;
  guestName: string;
  sessionId: string | null;
  updatedAt: string;
};

export type GuestIdentityInput = {
  guestId: string;
  guestName?: string | null;
  sessionId?: string | null;
};

function buildGuestIdentityKey(tableCode: string): string {
  return `${GUEST_IDENTITY_STORAGE_PREFIX}:${tableCode.trim().toUpperCase()}`;
}

function normalizeGuestIdentityInput(input: GuestIdentityInput | null): GuestIdentityRecord | null {
  const normalizedGuestId = input?.guestId?.trim() ?? "";

  if (!normalizedGuestId) {
    return null;
  }

  return {
    guestId: normalizedGuestId,
    guestName: input?.guestName?.trim() ?? "",
    sessionId: input?.sessionId?.trim() || null,
    updatedAt: new Date().toISOString()
  };
}

function parseStoredGuestIdentity(value: string | null): GuestIdentityRecord | null {
  const trimmed = value?.trim() ?? "";

  if (!trimmed) {
    return null;
  }

  try {
    const parsed = JSON.parse(trimmed) as Partial<GuestIdentityRecord>;
    const guestId = parsed.guestId?.trim() ?? "";

    if (!guestId) {
      return null;
    }

    return {
      guestId,
      guestName: parsed.guestName?.trim() ?? "",
      sessionId: parsed.sessionId?.trim() || null,
      updatedAt: parsed.updatedAt?.trim() ?? ""
    };
  } catch {
    return {
      guestId: trimmed,
      guestName: "",
      sessionId: null,
      updatedAt: ""
    };
  }
}

export function readGuestIdentity(tableCode: string): GuestIdentityRecord | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return parseStoredGuestIdentity(window.localStorage.getItem(buildGuestIdentityKey(tableCode)));
  } catch {
    return null;
  }
}

export function writeGuestIdentity(tableCode: string, identity: GuestIdentityInput | null): void {
  if (typeof window === "undefined") {
    return;
  }

  const normalizedIdentity = normalizeGuestIdentityInput(identity);

  try {
    if (!normalizedIdentity) {
      window.localStorage.removeItem(buildGuestIdentityKey(tableCode));
      return;
    }

    window.localStorage.setItem(buildGuestIdentityKey(tableCode), JSON.stringify(normalizedIdentity));
  } catch {
    // Ignore localStorage write errors for private browsing / disabled storage.
  }
}

export function clearGuestIdentity(tableCode: string): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.removeItem(buildGuestIdentityKey(tableCode));
  } catch {
    // Ignore localStorage write errors for private browsing / disabled storage.
  }
}
