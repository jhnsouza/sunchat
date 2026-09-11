/** Microphone capture that always produces a complete, decodable WAV file. */
export type Recorder = {
  stop: () => Promise<Blob | null>;
  cancel: () => void;
};

const TARGET_RATE = 16000;

function encodeWav(chunks: Float32Array[], sampleRate: number): Blob {
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const flat = new Float32Array(total);
  let offset = 0;
  for (const c of chunks) {
    flat.set(c, offset);
    offset += c.length;
  }
  const ratio = Math.max(1, Math.round(sampleRate / TARGET_RATE));
  const outLen = Math.floor(flat.length / ratio);
  const rate = Math.round(sampleRate / ratio);
  const buffer = new ArrayBuffer(44 + outLen * 2);
  const view = new DataView(buffer);
  const writeStr = (pos: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(pos + i, s.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + outLen * 2, true);
  writeStr(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, outLen * 2, true);
  for (let i = 0; i < outLen; i++) {
    let sum = 0;
    for (let j = 0; j < ratio; j++) sum += flat[i * ratio + j] ?? 0;
    const s = Math.max(-1, Math.min(1, sum / ratio));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buffer], { type: "audio/wav" });
}

export async function startRecording(): Promise<Recorder> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx();
  const source = ctx.createMediaStreamSource(stream);
  const node = ctx.createScriptProcessor(4096, 1, 1);
  const chunks: Float32Array[] = [];
  node.onaudioprocess = (e) => chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
  source.connect(node);
  node.connect(ctx.destination);

  const teardown = () => {
    stream.getTracks().forEach((t) => t.stop());
    node.disconnect();
    source.disconnect();
  };

  return {
    stop: async () => {
      teardown();
      const blob = encodeWav(chunks, ctx.sampleRate);
      await ctx.close();
      return blob.size < 2048 ? null : blob;
    },
    cancel: () => {
      teardown();
      void ctx.close();
    },
  };
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

export function playBase64Wav(base64: string, volume = 1) {
  const audio = new Audio(`data:audio/wav;base64,${base64}`);
  audio.volume = Math.max(0, Math.min(1, volume));
  void audio.play().catch(() => {});
}
