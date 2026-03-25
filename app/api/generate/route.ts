import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";

// Allow up to 60 s (Vercel hobby max) for this function
export const maxDuration = 60;

const API_BASE = "https://api.fashn.ai/v1";
const API_KEY = process.env.FASHN_API_KEY!;

const LIFESTYLE_PROMPT = `Lifestyle photo of a confident Latin male model, mid-30s, athletic build, wearing the garment.
Outdoor urban setting — sunlit city plaza with blurred background.
Golden-hour afternoon light, warm and natural. Relaxed posture, hands in pockets, slight smile.
Editorial fashion photography style. Full upper-body shot.`;

const PRODUCT_BASE = `Professional e-commerce studio photo. Male model, early 30s, medium build, light brown skin.
Clean white seamless background. Soft even diffused studio lighting.
Garment fully visible, well fitted. Upper-body crop. High-end catalog quality. `;

const JOBS = [
  { key: "lifestyle_1", prompt: LIFESTYLE_PROMPT, aspect_ratio: "4:5" },
  { key: "product_1",   prompt: PRODUCT_BASE + "Neutral expression. POSE: standing straight, front-facing, arms relaxed at sides, slight chin up.", aspect_ratio: "3:4" },
  { key: "product_2",   prompt: PRODUCT_BASE + "Subtle confident smile. POSE: three-quarter turn facing camera left, both hands casually in pockets, weight on back foot.", aspect_ratio: "3:4" },
  { key: "product_3",   prompt: PRODUCT_BASE + "Strong confident expression. POSE: front-facing, arms crossed over chest, shoulders back, direct gaze at camera.", aspect_ratio: "3:4" },
  { key: "product_4",   prompt: PRODUCT_BASE + "Relaxed friendly expression. POSE: slight head tilt, one hand casually touching the collar, other arm at side, relaxed stance.", aspect_ratio: "3:4" },
];

function slugify(text: string) {
  return text.toLowerCase().trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const style = (formData.get("style") as string)?.trim();
    const file = formData.get("image") as File;

    if (!style || !file) {
      return NextResponse.json({ error: "Faltan campos: style e image." }, { status: 400 });
    }

    const slug = slugify(style);

    // Convert image to base64 data URI
    const bytes = await file.arrayBuffer();
    const b64 = `data:${file.type || "image/jpeg"};base64,${Buffer.from(bytes).toString("base64")}`;

    // 1. Submit all 5 jobs to fashn.ai in parallel
    const submissions = await Promise.all(
      JOBS.map(async (job) => {
        const res = await fetch(`${API_BASE}/run`, {
          method: "POST",
          headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model_name: "product-to-model",
            inputs: {
              product_image: b64,
              prompt: job.prompt,
              aspect_ratio: job.aspect_ratio,
              resolution: "1k",
              output_format: "jpeg",
            },
          }),
        });
        const data = await res.json();
        if (!res.ok || data.error) {
          throw new Error(`fashn.ai error en ${job.key}: ${data.error ?? data.detail ?? JSON.stringify(data)}`);
        }
        return { key: job.key, jobId: data.id as string };
      })
    );

    // 2. Poll on the SERVER until all jobs finish (max ~55 s to leave buffer for uploads)
    const pending = new Map(submissions.map((s) => [s.key, s.jobId]));
    const saved: string[] = [];
    const deadline = Date.now() + 55_000;

    while (pending.size > 0 && Date.now() < deadline) {
      await sleep(3000);

      // Check all pending jobs in parallel
      await Promise.all(
        [...pending.entries()].map(async ([key, jobId]) => {
          try {
            const res = await fetch(`${API_BASE}/status/${jobId}`, {
              headers: { Authorization: `Bearer ${API_KEY}` },
              cache: "no-store",
            });
            const data = await res.json();

            if (data.status === "completed" && data.output?.[0]) {
              // Download from fashn.ai and upload to Vercel Blob immediately
              const imgRes = await fetch(data.output[0] as string);
              const imgBuffer = await imgRes.arrayBuffer();
              const filename = `${slug}/${slug}_${key}.jpg`;
              await put(filename, imgBuffer, {
                access: "public",
                contentType: "image/jpeg",
                addRandomSuffix: false,
              });
              saved.push(key);
              pending.delete(key);
            } else if (data.status === "failed") {
              pending.delete(key);
            }
          } catch {
            // leave in pending to retry next round
          }
        })
      );
    }

    return NextResponse.json({ saved: saved.length, total: JOBS.length, style });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Error interno del servidor.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
