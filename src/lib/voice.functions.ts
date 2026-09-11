import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const schema = z.object({ audio: z.string().min(100).max(6_000_000) });

/** Transcribes a short WAV clip captured in the pasture. */
export const transcribeVoice = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => schema.parse(data))
  .handler(async ({ data }) => {
    const key = process.env["LOVABLE_API_KEY"];
    if (!key) throw new Error("Transcrição indisponível: chave ausente.");

    const bytes = Uint8Array.from(atob(data.audio), (c) => c.charCodeAt(0));
    const form = new FormData();
    form.append("model", "google/gemini-3.5-transcribe");
    form.append("file", new Blob([bytes], { type: "audio/wav" }), "recording.wav");

    const res = await fetch("https://ai.gateway.lovable.dev/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: form,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Transcrição falhou [${res.status}]: ${body}`);
    }
    const json = (await res.json()) as { text?: string };
    return { text: (json.text ?? "").trim() };
  });
