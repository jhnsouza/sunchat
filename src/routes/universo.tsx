import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Suspense, lazy, useCallback, useEffect, useRef, useState } from "react";
import { ArrowUp, Eye, Mic, Type as TypeIcon, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { signedUrl, useSession } from "@/lib/session";
import { blobToBase64, playBase64Wav, startRecording, type Recorder } from "@/lib/audio";
import { transcribeVoice } from "@/lib/voice.functions";
import type { LookState, MoveState, Peer } from "@/components/UniverseScene";

const UniverseScene = lazy(() =>
  import("@/components/UniverseScene").then((m) => ({ default: m.UniverseScene })),
);

export const Route = createFileRoute("/universo")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Pasto 3D · SunChat" },
      {
        name: "description",
        content: "Pasto 3D ondulado com céu 360°: ande, fale por voz e converse por proximidade.",
      },
      { property: "og:title", content: "Pasto 3D · SunChat" },
      { property: "og:description", content: "Ande pelo pasto 3D e converse com quem estiver por perto." },
    ],
  }),
  component: UniversePage,
});

const NEAR = 18;
const BUBBLE_MS = 9000;
const DRAG = 110;

type VoiceMode = "voz" | "texto";

function UniversePage() {
  const navigate = useNavigate();
  const { session, profile, loading } = useSession();
  const me = session?.user?.id;
  const name = profile?.display_name || profile?.username || "visitante";

  const moveRef = useRef<MoveState>({ x: 0, z: 0, angle: 0 });
  const inputRef = useRef({ x: 0, z: 0 });
  const lookRef = useRef<LookState>({ yaw: 0, pitch: 0.12 });
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const [peers, setPeers] = useState<Record<string, Peer>>({});
  const [text, setText] = useState("");
  const [typing, setTyping] = useState(false);
  const [myMessage, setMyMessage] = useState<string | null>(null);
  const [firstPerson, setFirstPerson] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const inputEl = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!loading && !session) void navigate({ to: "/auth", replace: true });
  }, [loading, session, navigate]);

  useEffect(() => {
    let alive = true;
    void signedUrl("avatars", profile?.avatar_url).then((u) => {
      if (alive) setAvatarUrl(u);
    });
    return () => {
      alive = false;
    };
  }, [profile?.avatar_url]);

  useEffect(() => {
    if (!me) return;
    const channel = supabase.channel("universe:pasto", { config: { presence: { key: me } } });
    channelRef.current = channel;

    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState<{ name: string; avatar?: string | null }>();
        setPeers((prev) => {
          const next: Record<string, Peer> = {};
          for (const id of Object.keys(state)) {
            if (id === me) continue;
            const meta = state[id]?.[0];
            next[id] = prev[id] ?? { id, name: meta?.name ?? "visitante", x: 0, z: 0 };
            next[id] = { ...next[id]!, name: meta?.name ?? next[id]!.name, avatar: meta?.avatar ?? next[id]!.avatar };
          }
          return next;
        });
      })
      .on("broadcast", { event: "move" }, ({ payload }) => {
        const p = payload as Peer;
        if (p.id === me) return;
        setPeers((prev) => ({ ...prev, [p.id]: { ...(prev[p.id] ?? { id: p.id }), ...p } as Peer }));
      })
      .on("broadcast", { event: "say" }, ({ payload }) => {
        const p = payload as { id: string; name: string; text: string; x: number; z: number; avatar?: string | null };
        if (p.id === me) return;
        if (Math.hypot(p.x - moveRef.current.x, p.z - moveRef.current.z) > NEAR) return;
        setPeers((prev) => ({
          ...prev,
          [p.id]: { ...(prev[p.id] ?? { id: p.id, x: p.x, z: p.z, name: p.name }), message: p.text } as Peer,
        }));
        window.setTimeout(() => {
          setPeers((prev) => (prev[p.id] ? { ...prev, [p.id]: { ...prev[p.id]!, message: null } } : prev));
        }, BUBBLE_MS);
      })
      .on("broadcast", { event: "voice" }, ({ payload }) => {
        const p = payload as { id: string; audio: string; x: number; z: number };
        if (p.id === me) return;
        const dist = Math.hypot(p.x - moveRef.current.x, p.z - moveRef.current.z);
        if (dist > NEAR) return;
        playBase64Wav(p.audio, 1 - dist / NEAR / 1.4);
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") void channel.track({ name, avatar: avatarUrl });
      });

    return () => {
      channelRef.current = null;
      void supabase.removeChannel(channel);
    };
  }, [me, name, avatarUrl]);

  const onMove = useCallback(
    (state: MoveState) => {
      if (!me) return;
      void channelRef.current?.send({
        type: "broadcast",
        event: "move",
        payload: { id: me, name, avatar: avatarUrl, x: state.x, z: state.z },
      });
    },
    [me, name, avatarUrl],
  );

  const say = useCallback(
    (body: string) => {
      const clean = body.trim().slice(0, 160);
      if (!clean || !me) return;
      setMyMessage(clean);
      void channelRef.current?.send({
        type: "broadcast",
        event: "say",
        payload: { id: me, name, avatar: avatarUrl, text: clean, x: moveRef.current.x, z: moveRef.current.z },
      });
      window.setTimeout(() => setMyMessage(null), BUBBLE_MS);
    },
    [me, name, avatarUrl],
  );

  const sendVoice = useCallback(
    async (blob: Blob, mode: VoiceMode) => {
      const base64 = await blobToBase64(blob);
      if (mode === "voz") {
        if (base64.length > 900_000) {
          setStatus("Áudio muito longo.");
          return;
        }
        playBase64Wav(base64, 0.35);
        void channelRef.current?.send({
          type: "broadcast",
          event: "voice",
          payload: { id: me, audio: base64, x: moveRef.current.x, z: moveRef.current.z },
        });
        setStatus("Áudio enviado ao pasto");
        return;
      }
      setStatus("Transcrevendo...");
      try {
        const { text: transcript } = await transcribeVoice({ data: { audio: base64 } });
        if (transcript) {
          say(transcript);
          setStatus(null);
        } else {
          setStatus("Não entendi o áudio.");
        }
      } catch {
        setStatus("Falha ao transcrever.");
      }
    },
    [me, say],
  );

  if (loading || !session) return <main className="min-h-[100dvh]" />;

  return (
    <main className="fixed inset-0 touch-none overflow-hidden">
      <Suspense fallback={<div className="grid h-full place-items-center text-sm font-bold">Carregando o pasto...</div>}>
        <UniverseScene
          moveRef={moveRef}
          inputRef={inputRef}
          lookRef={lookRef}
          firstPerson={firstPerson}
          name={name}
          avatar={avatarUrl}
          myMessage={myMessage}
          peers={Object.values(peers)}
          onMove={onMove}
        />
      </Suspense>

      {/* Right half drags the 360° view; left half drives the joystick. */}
      <LookPad
        lookRef={lookRef}
        onDoubleTap={() => {
          setTyping(true);
          window.setTimeout(() => inputEl.current?.focus(), 30);
        }}
      />

      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3">
        <button
          onClick={() => navigate({ to: "/chat" })}
          className="glass-panel-strong pointer-events-auto rounded-full px-4 py-2 text-sm font-extrabold"
        >
          ‹ Voltar
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setFirstPerson((v) => !v)}
            className="glass-panel-strong pointer-events-auto flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-extrabold"
          >
            {firstPerson ? <Eye className="h-4 w-4" /> : <User className="h-4 w-4" />}
            {firstPerson ? "1ª pessoa" : "3ª pessoa"}
          </button>
          <div className="glass-panel-strong rounded-3xl px-3 py-2 text-right">
            <p className="text-[11px] font-extrabold">{Object.keys(peers).length + 1} no pasto</p>
            <p className="text-[10px] font-bold text-muted-foreground">2 dedos: andar + girar</p>
          </div>
        </div>
      </div>

      {status ? (
        <p className="glass-panel-strong absolute left-1/2 top-20 -translate-x-1/2 rounded-full px-4 py-1.5 text-xs font-extrabold">
          {status}
        </p>
      ) : null}

      <Joystick inputRef={inputRef} />

      <VoiceButton onCapture={sendVoice} onStatus={setStatus} />

      {typing ? (
        <div className="absolute inset-x-0 bottom-0 z-20 p-3">
          <div className="glass-panel-strong flex items-center gap-2 rounded-full p-1.5">
            <input
              ref={inputEl}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                say(text);
                setText("");
                setTyping(false);
                inputEl.current?.blur();
              }}
              placeholder="Falar com quem está por perto..."
              className="min-w-0 flex-1 bg-transparent px-4 py-2.5 text-sm outline-none"
            />
            <button
              onClick={() => {
                say(text);
                setText("");
                setTyping(false);
              }}
              aria-label="Falar"
              className="send-pill grid h-10 w-14 shrink-0 place-items-center rounded-full active:scale-95"
            >
              <ArrowUp className="h-5 w-5 text-white" />
            </button>
          </div>
        </div>
      ) : (
        <p className="pointer-events-none absolute inset-x-0 bottom-3 text-center text-[11px] font-bold text-white drop-shadow">
          Toque duas vezes para escrever
        </p>
      )}
    </main>
  );
}

/** Full-screen look layer: right-side drags rotate the camera 360°. */
function LookPad({
  lookRef,
  onDoubleTap,
}: {
  lookRef: React.MutableRefObject<LookState>;
  onDoubleTap: () => void;
}) {
  const last = useRef<{ x: number; y: number } | null>(null);
  const lastTap = useRef(0);
  const moved = useRef(0);

  return (
    <div
      className="absolute inset-y-0 right-0 w-1/2 touch-none"
      onPointerDown={(e) => {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        last.current = { x: e.clientX, y: e.clientY };
        moved.current = 0;
      }}
      onPointerMove={(e) => {
        const prev = last.current;
        if (!prev) return;
        const dx = e.clientX - prev.x;
        const dy = e.clientY - prev.y;
        moved.current += Math.abs(dx) + Math.abs(dy);
        last.current = { x: e.clientX, y: e.clientY };
        const look = lookRef.current;
        look.yaw += dx * 0.006;
        look.pitch = Math.max(-0.5, Math.min(0.6, look.pitch + dy * 0.004));
      }}
      onPointerUp={() => {
        last.current = null;
        if (moved.current > 12) return;
        const now = Date.now();
        if (now - lastTap.current < 320) {
          lastTap.current = 0;
          onDoubleTap();
        } else {
          lastTap.current = now;
        }
      }}
      onPointerCancel={() => {
        last.current = null;
      }}
    />
  );
}

/** Touch stick that feeds normalized movement into the scene. */
function Joystick({ inputRef }: { inputRef: React.MutableRefObject<{ x: number; z: number }> }) {
  const base = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const active = useRef(false);

  function update(clientX: number, clientY: number) {
    const el = base.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const max = r.width / 2 - 14;
    let dx = clientX - cx;
    let dy = clientY - cy;
    const len = Math.hypot(dx, dy) || 1;
    const clamped = Math.min(len, max);
    dx = (dx / len) * clamped;
    dy = (dy / len) * clamped;
    setKnob({ x: dx, y: dy });
    inputRef.current = { x: dx / max, z: dy / max };
  }

  function stop() {
    active.current = false;
    setKnob({ x: 0, y: 0 });
    inputRef.current = { x: 0, z: 0 };
  }

  return (
    <div
      ref={base}
      onPointerDown={(e) => {
        active.current = true;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        update(e.clientX, e.clientY);
      }}
      onPointerMove={(e) => {
        if (active.current) update(e.clientX, e.clientY);
      }}
      onPointerUp={stop}
      onPointerCancel={stop}
      className="glass-panel absolute bottom-24 left-4 z-10 grid h-32 w-32 touch-none place-items-center rounded-full"
    >
      <div className="send-pill h-14 w-14 rounded-full" style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }} />
    </div>
  );
}

/**
 * Press-and-hold reveals two targets; dragging past 50% of the way starts
 * capturing, and releasing sends the audio or its transcript automatically.
 */
function VoiceButton({
  onCapture,
  onStatus,
}: {
  onCapture: (blob: Blob, mode: VoiceMode) => Promise<void>;
  onStatus: (s: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<VoiceMode | null>(null);
  const recorder = useRef<Recorder | null>(null);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const modeRef = useRef<VoiceMode | null>(null);

  async function arm(next: VoiceMode) {
    if (modeRef.current) return;
    modeRef.current = next;
    setMode(next);
    onStatus(next === "voz" ? "Gravando áudio..." : "Ouvindo para transcrever...");
    try {
      recorder.current = await startRecording();
    } catch {
      onStatus("Preciso do microfone para isso.");
      modeRef.current = null;
      setMode(null);
    }
  }

  function reset() {
    setOpen(false);
    setMode(null);
    modeRef.current = null;
    origin.current = null;
  }

  return (
    <div className="absolute bottom-24 right-4 z-10 grid place-items-center">
      {open ? (
        <>
          <span
            className={`glass-panel-strong absolute -top-28 right-16 flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-extrabold ${mode === "voz" ? "ring-2 ring-primary" : ""}`}
          >
            <Mic className="h-4 w-4" /> Gravar
          </span>
          <span
            className={`glass-panel-strong absolute -top-28 right-[-0.25rem] flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-extrabold ${mode === "texto" ? "ring-2 ring-primary" : ""}`}
          >
            <TypeIcon className="h-4 w-4" /> Transcrever
          </span>
        </>
      ) : null}
      <button
        aria-label="Falar"
        className={`send-pill grid h-16 w-16 touch-none place-items-center rounded-full ${mode ? "scale-110 ring-4 ring-primary/50" : ""}`}
        onPointerDown={(e) => {
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          origin.current = { x: e.clientX, y: e.clientY };
          setOpen(true);
        }}
        onPointerMove={(e) => {
          const o = origin.current;
          if (!o || modeRef.current) return;
          const dy = o.y - e.clientY;
          const dx = e.clientX - o.x;
          if (dy < DRAG * 0.5) return;
          void arm(dx < -DRAG * 0.25 ? "voz" : "texto");
        }}
        onPointerUp={() => {
          const rec = recorder.current;
          const current = modeRef.current;
          recorder.current = null;
          reset();
          if (!rec || !current) {
            onStatus(null);
            return;
          }
          void rec.stop().then((blob) => {
            if (!blob) {
              onStatus("Áudio vazio, tente de novo.");
              return;
            }
            void onCapture(blob, current);
          });
        }}
        onPointerCancel={() => {
          recorder.current?.cancel();
          recorder.current = null;
          reset();
          onStatus(null);
        }}
      >
        <Mic className="h-7 w-7 text-white" />
      </button>
    </div>
  );
}
