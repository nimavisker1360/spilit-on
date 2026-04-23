export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import {
  findIyzicoPaymentShareIdByToken,
  handleIyzicoCallback
} from "@/features/payment/iyzico-payment.service";
import type { JsonObject } from "@/features/payment/payment.types";
import { routeErrorMessage } from "@/lib/errors";
import { getPublicAppBaseUrl } from "@/lib/public-url";

const SENSITIVE_HEADER_NAMES = new Set(["authorization", "cookie", "proxy-authorization", "set-cookie"]);

type ParsedCallbackRequest = {
  bodyPayload: JsonObject;
  payload: JsonObject;
  queryPayload: JsonObject;
};

function resultRedirectUrl(paymentShareId: string, status: string, request: Request, error?: string): URL {
  const url = new URL(`/pay/${encodeURIComponent(paymentShareId)}/result`, callbackRedirectBaseUrl(request));
  url.searchParams.set("status", status.toLowerCase());

  if (error) {
    url.searchParams.set("error", error);
  }

  return url;
}

function guestPaymentRedirectUrl(tableCode: string, request: Request, paidGuestId?: string | null): URL {
  const url = new URL(`/guest/${encodeURIComponent(tableCode)}/payment`, callbackRedirectBaseUrl(request));
  url.searchParams.set("handoff", "next");

  if (paidGuestId) {
    url.searchParams.set("guestId", paidGuestId);
  }

  return url;
}

function isLocalhostUrl(value: string): boolean {
  try {
    const { hostname } = new URL(value);
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "0.0.0.0" || hostname === "::1" || hostname === "[::1]";
  } catch {
    return false;
  }
}

function forwardedHeaderValue(value: string | null): string | null {
  return value?.split(",")[0]?.trim() || null;
}

function callbackRedirectBaseUrl(request: Request): string {
  const configuredBaseUrl = getPublicAppBaseUrl();

  if (!isLocalhostUrl(configuredBaseUrl)) {
    return configuredBaseUrl;
  }

  const requestUrl = new URL(request.url);
  const forwardedProto = forwardedHeaderValue(request.headers.get("x-forwarded-proto"));
  const forwardedHost = forwardedHeaderValue(request.headers.get("x-forwarded-host"));
  const host = forwardedHost ?? request.headers.get("host");

  if (!host) {
    return requestUrl.origin;
  }

  return `${forwardedProto ?? requestUrl.protocol.replace(":", "")}://${host}`;
}

function jsonObjectFromEntries(entries: Iterable<[string, FormDataEntryValue | string]>): JsonObject {
  const payload: JsonObject = {};

  for (const [key, value] of entries) {
    payload[key] = typeof value === "string" ? value : value.name;
  }

  return payload;
}

function jsonObjectFromUnknown(value: unknown): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as JsonObject;
}

function tokenFromPayload(payload: JsonObject): string {
  return typeof payload.token === "string" ? payload.token.trim() : "";
}

function mergeCallbackPayload(queryPayload: JsonObject, bodyPayload: JsonObject): JsonObject {
  const payload: JsonObject = {
    ...queryPayload,
    ...bodyPayload
  };
  const bodyToken = tokenFromPayload(bodyPayload);
  const queryToken = tokenFromPayload(queryPayload);
  const token = bodyToken || queryToken;

  if (token) {
    payload.token = token;
  }

  return payload;
}

async function bodyPayloadFromRequest(request: Request): Promise<JsonObject> {
  if (request.method === "GET" || request.method === "HEAD" || request.headers.get("content-length") === "0") {
    return {};
  }

  const contentType = request.headers.get("content-type") ?? "";

  try {
    if (contentType.includes("application/json")) {
      return jsonObjectFromUnknown(await request.json());
    }

    if (contentType.includes("application/x-www-form-urlencoded")) {
      const body = await request.text();
      return jsonObjectFromEntries(new URLSearchParams(body).entries());
    }

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      return jsonObjectFromEntries(formData.entries());
    }

    const body = await request.text();
    return body.includes("=") ? jsonObjectFromEntries(new URLSearchParams(body).entries()) : {};
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.info("[iyzico] callback_body_parse_failed", {
        error: error instanceof Error ? error.message : "Unknown callback body parse error"
      });
    }

    return {};
  }
}

function headersForDevelopmentLog(headers: Headers): Record<string, string> {
  return Object.fromEntries(
    Array.from(headers.entries()).map(([key, value]) => [
      key,
      SENSITIVE_HEADER_NAMES.has(key.toLowerCase()) ? "[redacted]" : value
    ])
  );
}

function logCallbackRequest(request: Request, queryPayload: JsonObject, bodyPayload: JsonObject) {
  if (process.env.NODE_ENV !== "development") {
    return;
  }

  console.info("[iyzico] callback_received", {
    method: request.method,
    headers: headersForDevelopmentLog(request.headers),
    queryKeys: Object.keys(queryPayload),
    bodyKeys: Object.keys(bodyPayload)
  });
}

async function callbackPayloadFromRequest(request: Request): Promise<ParsedCallbackRequest> {
  const queryPayload = jsonObjectFromEntries(new URL(request.url).searchParams.entries());
  const bodyPayload = await bodyPayloadFromRequest(request);
  logCallbackRequest(request, queryPayload, bodyPayload);

  return {
    bodyPayload,
    payload: mergeCallbackPayload(queryPayload, bodyPayload),
    queryPayload
  };
}

async function redirectForCallback(request: Request, payload: JsonObject) {
  try {
    const result = await handleIyzicoCallback(payload);
    const tableCode = result.paymentSession.session?.table?.code;

    if (result.paymentShare.status === "PAID" && tableCode) {
      return NextResponse.redirect(guestPaymentRedirectUrl(tableCode, request, result.paymentShare.guestId), { status: 303 });
    }

    return NextResponse.redirect(resultRedirectUrl(result.paymentShare.id, result.paymentShare.status, request), { status: 303 });
  } catch (error) {
    const token = tokenFromPayload(payload);
    const paymentShareId = token ? await findIyzicoPaymentShareIdByToken(token) : null;

    if (paymentShareId) {
      return NextResponse.redirect(resultRedirectUrl(paymentShareId, "failed", request, routeErrorMessage(error)), { status: 303 });
    }

    return NextResponse.json({ error: routeErrorMessage(error) }, { status: 400 });
  }
}

export async function POST(request: Request) {
  const { payload } = await callbackPayloadFromRequest(request);
  return redirectForCallback(request, payload);
}

export async function GET(request: Request) {
  const { payload } = await callbackPayloadFromRequest(request);
  return redirectForCallback(request, payload);
}
