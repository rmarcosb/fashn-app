"use client";

import { useState, useRef } from "react";

type JobResult = {
  key: string;
  status: string;
  url: string | null;
};

const LABELS: Record<string, string> = {
  lifestyle_1: "Lifestyle",
  product_1: "Producto 1",
  product_2: "Producto 2",
  product_3: "Producto 3",
  product_4: "Producto 4",
};

export default function Generator() {
  const [style, setStyle] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [results, setResults] = useState<JobResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setResults([]);
    setError(null);

    const reader = new FileReader();
    reader.onload = (evt) => {
      const dataUrl = evt.target?.result as string;
      setPreview(dataUrl);

      // Compress via canvas to stay under Vercel's 4.5 MB body limit
      const img = new Image();
      img.onload = () => {
        const MAX = 1024;
        let { width: w, height: h } = img;
        if (w > MAX || h > MAX) {
          if (w > h) { h = Math.round(h * MAX / w); w = MAX; }
          else { w = Math.round(w * MAX / h); h = MAX; }
        }
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
        canvas.toBlob(
          (blob) => { if (blob) setFile(new File([blob], f.name, { type: "image/jpeg" })); },
          "image/jpeg", 0.85
        );
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(f);
  }

  async function handleGenerate() {
    if (!style.trim()) { setError("Escribe un nombre de estilo."); return; }
    if (!file) { setError("Selecciona una foto."); return; }

    setLoading(true);
    setError(null);
    setResults([]);

    try {
      const form = new FormData();
      form.append("style", style.trim());
      form.append("image", file);

      const submitRes = await fetch("/api/generate", { method: "POST", body: form });
      if (!submitRes.ok) {
        const err = await submitRes.json().catch(() => ({}));
        throw new Error(err.error ?? "Error al enviar la imagen.");
      }
      const { jobs, style: submittedStyle } = await submitRes.json();

      // Poll until all 5 complete
      const pending = new Set<string>(jobs.map((j: { key: string }) => j.key));
      const completed: JobResult[] = [];

      while (pending.size > 0) {
        await new Promise((r) => setTimeout(r, 4000));

        const pollRes = await fetch(
          `/api/status?style=${encodeURIComponent(submittedStyle)}&jobs=${encodeURIComponent(JSON.stringify(jobs))}`
        );
        if (!pollRes.ok) continue;
        const { results: polled } = await pollRes.json();

        for (const r of polled as JobResult[]) {
          if ((r.status === "completed" || r.status === "failed") && pending.has(r.key)) {
            pending.delete(r.key);
            completed.push(r);
            setResults([...completed]);
          }
        }
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setLoading(false);
    }
  }

  const done = results.filter((r) => r.url).length;
  const total = 5;

  return (
    <main className="min-h-screen bg-neutral-950 text-white flex flex-col items-center px-4 py-10">
      <h1 className="text-2xl font-bold tracking-tight mb-1">fashn.ai</h1>
      <p className="text-neutral-400 text-sm mb-8">Flat lay → 5 fotos e-commerce</p>

      {/* Style input */}
      <div className="w-full max-w-md mb-4">
        <label className="block text-xs text-neutral-400 mb-1 uppercase tracking-widest">
          Nombre del estilo
        </label>
        <input
          type="text"
          value={style}
          onChange={(e) => setStyle(e.target.value)}
          placeholder="ej. polo-azul-verano"
          className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-white placeholder:text-neutral-600"
        />
        <p className="text-xs text-neutral-600 mt-1">
          Se usará como nombre de los archivos generados
        </p>
      </div>

      {/* Photo upload */}
      <div className="w-full max-w-md mb-6">
        <label className="block text-xs text-neutral-400 mb-1 uppercase tracking-widest">
          Foto de la prenda
        </label>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="w-full border-2 border-dashed border-neutral-700 rounded-xl overflow-hidden aspect-square flex items-center justify-center bg-neutral-900"
        >
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={preview}
              alt="Preview"
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="text-center text-neutral-500 px-4">
              <div className="text-4xl mb-2">📷</div>
              <div className="text-sm">Toca para seleccionar foto</div>
              <div className="text-xs mt-1 text-neutral-600">JPG, PNG, WebP</div>
            </div>
          )}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      {/* Error */}
      {error && (
        <p className="w-full max-w-md text-sm text-red-400 mb-4 bg-red-950 border border-red-900 rounded-xl px-4 py-3">
          {error}
        </p>
      )}

      {/* Generate button */}
      <button
        onClick={handleGenerate}
        disabled={loading}
        className="w-full max-w-md bg-white text-black font-semibold rounded-xl py-4 text-base disabled:opacity-40 disabled:cursor-not-allowed mb-6"
      >
        {loading ? `Generando… ${done}/${total}` : "Generar 5 fotos →"}
      </button>

      {/* Progress bar */}
      {loading && (
        <div className="w-full max-w-md mb-6">
          <div className="h-1 bg-neutral-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-white rounded-full transition-all duration-500"
              style={{ width: `${(done / total) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Results */}
      {results.filter((r) => r.url).length > 0 && (
        <div className="w-full max-w-md">
          <h2 className="text-xs text-neutral-400 uppercase tracking-widest mb-3">
            Resultados — {style}
          </h2>
          <div className="grid grid-cols-2 gap-3">
            {results
              .filter((r) => r.url)
              .map((r) => (
                <a
                  key={r.key}
                  href={r.url!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block rounded-xl overflow-hidden bg-neutral-800"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={r.url!}
                    alt={LABELS[r.key] ?? r.key}
                    className="w-full object-cover"
                  />
                  <div className="px-3 py-2 text-xs text-neutral-400">
                    {LABELS[r.key] ?? r.key}
                  </div>
                </a>
              ))}
          </div>
          {!loading && done === total && (
            <p className="text-center text-sm text-neutral-400 mt-6">
              ✓ {total} fotos guardadas en la nube
            </p>
          )}
        </div>
      )}
    </main>
  );
}
