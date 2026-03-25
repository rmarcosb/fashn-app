import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";

const API_BASE = "https://api.fashn.ai/v1";
const API_KEY = process.env.FASHN_API_KEY!;

function slugify(text: string) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const style = searchParams.get("style") || "sin-estilo";
  const jobsParam = searchParams.get("jobs");

  if (!jobsParam) {
    return NextResponse.json({ error: "Missing jobs param" }, { status: 400 });
  }

  const jobs: { key: string; jobId: string }[] = JSON.parse(jobsParam);
  const slug = slugify(style);

  const results = await Promise.all(
    jobs.map(async ({ key, jobId }) => {
      const res = await fetch(`${API_BASE}/status/${jobId}`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
        // Disable Next.js cache so polling always gets fresh data
        cache: "no-store",
      });

      const data = await res.json();

      if (data.status === "completed" && data.output?.[0]) {
        const imageUrl = data.output[0];

        // Download the image from fashn.ai
        const imgRes = await fetch(imageUrl);
        const imgBuffer = await imgRes.arrayBuffer();

        // Upload to Vercel Blob
        const filename = `${slug}/${key}.jpg`;
        const blob = await put(filename, imgBuffer, {
          access: "public",
          contentType: "image/jpeg",
          addRandomSuffix: false,
        });

        return { key, status: "completed", url: blob.url };
      }

      return { key, status: data.status ?? "processing", url: null };
    })
  );

  return NextResponse.json({ results });
}
