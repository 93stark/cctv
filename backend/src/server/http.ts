import { NextResponse } from "next/server";
import { ZodError, type ZodTypeAny, type z } from "zod";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public extra?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export function json(data: unknown, status = 200, headers?: Record<string, string>) {
  return NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "no-store", ...headers },
  });
}

export function errorResponse(e: unknown) {
  if (e instanceof ApiError) {
    return json({ error: { code: e.code, message: e.message, ...e.extra } }, e.status);
  }
  if (e instanceof ZodError) {
    return json(
      {
        error: {
          code: "validation_error",
          message: "Some fields are invalid.",
          fields: e.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        },
      },
      400,
    );
  }
  console.error("Unhandled API error:", e);
  return json({ error: { code: "internal_error", message: "Something went wrong. Please try again." } }, 500);
}

type Handler<C> = (req: Request, ctx: C) => Promise<Response>;

/** Wrap a route handler so every error becomes a safe JSON response. */
export function handle<C = unknown>(fn: Handler<C>): Handler<C> {
  return async (req, ctx) => {
    try {
      return await fn(req, ctx);
    } catch (e) {
      return errorResponse(e);
    }
  };
}

const MAX_JSON_BYTES = 256 * 1024;

export async function readJson<S extends ZodTypeAny>(req: Request, schema: S): Promise<z.infer<S>> {
  const len = Number(req.headers.get("content-length") ?? "0");
  if (len > MAX_JSON_BYTES) throw new ApiError(413, "payload_too_large", "Request body is too large.");
  const text = await req.text();
  if (text.length > MAX_JSON_BYTES) throw new ApiError(413, "payload_too_large", "Request body is too large.");
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    throw new ApiError(400, "invalid_json", "Request body must be valid JSON.");
  }
  return schema.parse(body);
}

export function clientIp(req: Request): string {
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return "unknown";
}

export function parseQuery<S extends ZodTypeAny>(req: Request, schema: S): z.infer<S> {
  const url = new URL(req.url);
  const obj: Record<string, string> = {};
  url.searchParams.forEach((v, k) => {
    obj[k] = v;
  });
  return schema.parse(obj);
}
