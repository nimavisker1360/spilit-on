export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { finalizeProPlanActivation } from "@/features/billing/billing-payment.service";
import type { JsonObject } from "@/features/payment/payment.types";
import { routeErrorMessage } from "@/lib/errors";
import { getPublicAppBaseUrl } from "@/lib/public-url";

type ParsedCallbackRequest = {
  bodyPayload: JsonObject;
  payload: JsonObject;
  queryPayload: JsonObject;
};

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
  } catch {
    return {};
  }
}

async function callbackPayloadFromRequest(request: Request): Promise<ParsedCallbackRequest> {
  const queryPayload = jsonObjectFromEntries(new URL(request.url).searchParams.entries());
  const bodyPayload = await bodyPayloadFromRequest(request);

  return {
    bodyPayload,
    payload: mergeCallbackPayload(queryPayload, bodyPayload),
    queryPayload
  };
}

function billingSuccessRedirectUrl(): URL {
  const url = new URL("/admin", getPublicAppBaseUrl());
  url.searchParams.set("billing", "pro-activated");
  return url;
}

function billingFailureRedirectUrl(error?: string): URL {
  const url = new URL("/admin/billing", getPublicAppBaseUrl());
  url.searchParams.set("activation", "failed");

  if (error) {
    url.searchParams.set("error", error);
  }

  return url;
}

async function redirectForCallback(request: Request, payload: JsonObject) {
  try {
    const result = await finalizeProPlanActivation({
      token: tokenFromPayload(payload),
      callbackPayload: payload
    });

    if (result.status === "SUCCEEDED") {
      return NextResponse.redirect(billingSuccessRedirectUrl(), { status: 303 });
    }

    return NextResponse.redirect(
      billingFailureRedirectUrl("Odeme tamamlanamadi. Lutfen tekrar deneyin."),
      { status: 303 }
    );
  } catch (error) {
    return NextResponse.redirect(
      billingFailureRedirectUrl(routeErrorMessage(error)),
      { status: 303 }
    );
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
