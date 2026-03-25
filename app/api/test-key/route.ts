import { NextResponse } from "next/server";

export async function GET() {
  const key = process.env.FASHN_API_KEY;

  if (!key) {
    return NextResponse.json({ ok: false, error: "FASHN_API_KEY no está definida en las variables de entorno." });
  }

  const res = await fetch("https://api.fashn.ai/v1/status/test", {
    headers: { Authorization: `Bearer ${key}` },
  });

  const text = await res.text();

  return NextResponse.json({
    ok: res.ok,
    status: res.status,
    keyPrefix: key.slice(0, 8) + "...",
    fashnResponse: text,
  });
}
