"use client";

import { useState, useRef } from "react";

type Job = { key: string; jobId: string };

// Runs silently in the background — polls fashn.ai and uploads to Blob.
// Never touches React state, so the UI stays fully responsive.
async function pollInBackground(jobs: Job[], submittedStyle: string) {
  const pending = new Set<string>(jobs.map((j) => j.key));
  let retries = 0;
  const MAX_RETRIES = 40; // ~160 s total

  while (pending.size > 0 && retries < MAX_RETRIES) {
    await new Promise((r) => setTimeout(r, 4000));
    retries++;

    try {
      const res = await fetch(
        `/api/status?style=${encodeURIComponent(submittedStyle)}&jobs=${encodeURIComponent(JSON.stringify(jobs))}`
      );
      if (!res.ok) continue;
      const { results } = await res.json();

      for (const r of results as { key: string; status: string }[]) {
        if ((r.status === "completed" || r.status === "failed") && pending.has(r.key)) {
          pending.delete(r.key);
        }
      }
    } catch {
      // silently retry
    }
  }
}

export default function Generator() {
  const [style, setStyle] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setSent(false);
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

    setSubmitting(true);
    setError(null);

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

      // Fire-and-forget: poll & upload to Blob without blocking the UI
      void pollInBackground(jobs, submittedStyle);

      // Immediately reset the form and show confirmation
      setSent(true);
      setStyle("");
      setPreview(null);
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      if (cameraRef.current) cameraRef.current.value = "";

    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-neutral-950 text-white flex flex-col items-center px-4 py-10">
      <h1 className="text-2xl font-bold tracking-tight mb-1">fashn.ai</h1>
      <p className="text-neutral-400 text-sm mb-8">Flat lay → 5 fotos e-commerce</p>

      {/* Success banner */}
      {sent && (
        <div className="w-full max-w-md mb-6 bg-green-950 border border-green-700 rounded-xl px-4 py-4 text-center">
          <p className="text-green-400 font-semibold text-sm mb-1">
            ✓ Imágenes enviadas a la base de datos
          </p>
          <p className="text-green-600 text-xs">
            Ya puedes subir otra imagen
          </p>
        </div>
      )}

      {/* Style input */}
      <div className="w-full max-w-md mb-4">
        <label className="block text-xs text-neutral-400 mb-1 uppercase tracking-widest">
          Nombre del estilo
        </label>
        <input
          type="text"
          value={style}
          onChange={(e) => { setStyle(e.target.value); setSent(false); }}
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
        {/* Preview area */}
        <div className="w-full border-2 border-dashed border-neutral-700 rounded-xl overflow-hidden aspect-square flex items-center justify-center bg-neutral-900 mb-3">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="Preview" className="w-full h-full object-cover" />
          ) : (
            <div className="text-center text-neutral-500 px-4">
              <div className="text-4xl mb-2">🖼️</div>
              <div className="text-sm">La foto aparecerá aquí</div>
            </div>
          )}
        </div>

        {/* Camera / Gallery buttons */}
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => cameraRef.current?.click()}
            className="flex items-center justify-center gap-2 bg-neutral-800 border border-neutral-700 rounded-xl py-3 text-sm font-medium"
          >
            📷 Tomar foto
          </button>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex items-center justify-center gap-2 bg-neutral-800 border border-neutral-700 rounded-xl py-3 text-sm font-medium"
          >
            🖼️ Galería
          </button>
        </div>

        <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFileChange} />
        <input ref={fileRef}   type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
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
        disabled={submitting}
        className="w-full max-w-md bg-white text-black font-semibold rounded-xl py-4 text-base disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {submitting ? "Enviando…" : "Generar 5 fotos →"}
      </button>
    </main>
  );
}
