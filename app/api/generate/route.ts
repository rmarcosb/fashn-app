import { NextRequest, NextResponse } from "next/server";

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
  {
    key: "lifestyle_1",
    prompt: LIFESTYLE_PROMPT,
    aspect_ratio: "4:5",
  },
  {
    key: "product_1",
    prompt: PRODUCT_BASE + "Neutral expression. POSE: standing straight, front-facing, arms relaxed at sides, slight chin up.",
    aspect_ratio: "3:4",
  },
  {
    key: "product_2",
    prompt: PRODUCT_BASE + "Subtle confident smile. POSE: three-quarter turn facing camera left, both hands casually in pockets, weight on back foot.",
    aspect_ratio: "3:4",
  },
  {
    key: "product_3",
    prompt: PRODUCT_BASE + "Strong confident expression. POSE: front-facing, arms crossed over chest, shoulders back, direct gaze at camera.",
    aspect_ratio: "3:4",
  },
  {
    key: "product_4",
    prompt: PRODUCT_BASE + "Relaxed friendly expression. POSE: slight head tilt, one hand casually touching the collar, other arm at side, relaxed stance.",
    aspect_ratio: "3:4",
  },
];

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const style = (formData.get("style") as string)?.trim();
  const file = formData.get("image") as File;

  if (!style || !file) {
    return NextResponse.json({ error: "Faltan campos: style e image." }, { status: 400 });
  }

  // Convert image to base64 data URI
  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);
  const mimeType = file.type || "image/jpeg";
  const b64 = `data:${mimeType};base64,${buffer.toString("base64")}`;

  // Submit all 5 jobs to fashn.ai
  const submissions = await Promise.all(
    JOBS.map(async (job) => {
      const res = await fetch(`${API_BASE}/run`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          "Content-Type": "application/json",
        },
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
        throw new Error(`[${job.key}] Submit failed: ${JSON.stringify(data)}`);
      }

      return { key: job.key, jobId: data.id };
    })
  );

  return NextResponse.json({ jobs: submissions, style });
}
