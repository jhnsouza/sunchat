import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Suspense, lazy, useCallback, useEffect, useRef, useState } from "react";
import { ArrowUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/session";
import type { MoveState, Peer } from "@/components/UniverseScene";

const UniverseScene = lazy(() =>
  import("@/components/UniverseScene").then((m) => ({ default: m.UniverseScene })),
);

export const Route = createFileRoute("/universo")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Universo 3D · SunChat" },
      {
        name: "description",
        content: "Um pasto 3D aberto com céu azul e nuvens: ande livremente e converse por proximidade.",
      },
      { property: "og:title", content: "Universo 3D · SunChat" },
      { property: "og:description", content: "Ande pelo pasto 3D e converse com quem estiver por perto." },
    ],
  }),
  component: UniversePage,
});

const NEAR = 16;
const BUBBLE_MS = 7000;

function UniversePage() {
  const navigate = useNavigate();
  const { session, profile, loading } = useSession();
  const me = session?.user?.id;
  const name = profile?.display_name || profile?.username || "visitante";

  const moveRef = useRef<MoveState>({ x: 0, z: 0, angle: 0 });
  const inputRef = useRef({ x: 0, z: 0 });
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const [peers, setPeers] = useState<Record<string, Peer>>({});
  const [text, setText] = useState("");
  const [myMessage, setMyMessage] = useState<string | null>(null);
  const [log, setLog] = useState<{ id: string; name: string; text: string; at: number }[]>([]);

  useEffect(() => {
    if (!loading && !session) void navigate({ to: "/auth", replace: true });
  }, [loading, session, navigate]);

  useEffect(() => {
    if (!me) return;
    const channel = supabase.channel("universe:pasto", { config: { presence: { key: me } } });
    channelRef.current = channel;

    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState<{ name: string }>();
        setPeers((prev) => {
          const next: Record<string, Peer> = {};
          for (const id of Object.keys(state)) {
            if (id === me) continue;
            const meta = state[id]?.[0];
            next[id] = prev[id] ?? { id, name: meta?.name ?? "visitante", x: 0, z: 0 };
            if (meta?.name) next[id] = { ...next[id]!, name: meta.name };
          }
          return next;
        });
      })
      .on("broadcast", { event: "move" }, ({ payload }) => {
        const p = payload as { id: string; name: string; x: number; z: number };
        if (p.id === me) return;
        setPeers((prev) => ({ ...prev, [p.id]: { ...(prev[p.id] ?? { id: p.id }), ...p } as Peer }));
      })
      .on("broadcast", { event: "say" }, ({ payload }) => {
        const p = payload as { id: string; name: string; text: string; x: number; z: number };
        if (p.id === me) return;
        const dist = Math.hypot(p.x - moveRef.current.x, p.z - moveRef.current.z);
        if (dist > NEAR) return;
        setPeers((prev) => ({
          ...prev,
          [p.id]: { ...(prev[p.id] ?? { id: p.id, x: p.x, z: p.z, name: p.name }), message: p.text } as Peer,
        }));
        setLog((prev) => [...prev.slice(-14), { id: p.id, name: p.name, text: p.text, at: Date.now() }]);
        window.setTimeout(() => {
          setPeers((prev) => (prev[p.id] ? { ...prev, [p.id]: { ...prev[p.id]!, message: null } } : prev));
        }, BUBBLE_MS);
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") void channel.track({ name });
      });

    return () => {
      channelRef.current = null;
      void supabase.removeChannel(channel);
    };
  }, [me, name]);

  const onMove = useCallback(
    (state: MoveState) => {
      if (!me) return;
      void channelRef.current?.send({
        type: "broadcast",
        event: "move",
        payload: { id: me, name, x: state.x, z: state.z },
      });
    },
    [me, name],
  );

  function say() {
    const body = text.trim().slice(0, 140);
    if (!body || !me) return;
    setText("");
    setMyMessage(body);
    setLog((prev) => [...prev.slice(-14), { id: me, name, text: body, at: Date.now() }]);
    void channelRef.current?.send({
      type: "broadcast",
      event: "say",
      payload: { id: me, name, text: body, x: moveRef.current.x, z: moveRef.current.z },
    });
    window.setTimeout(() => setMyMessage(null), BUBBLE_MS);
  }

  const nearby = Object.values(peers).filter(
    (p) => Math.hypot(p.x - moveRef.current.x, p.z - moveRef.current.z) <= NEAR,
  );

  if (loading || !session) return <main className="min-h-[100dvh]" />;

  return (
    <main className="fixed inset-0 overflow-hidden">
      <Suspense fallback={<div className="grid h-full place-items-center text-sm font-bold">Carregando o pasto...</div>}>
        <UniverseScene
          moveRef={moveRef}
          inputRef={inputRef}
          name={name}
          myMessage={myMessage}
          peers={Object.values(peers)}
          onMove={onMove}
        />
      </Suspense>

      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-3">
        <button
          onClick={() => navigate({ to: "/chat" })}
          className="glass-panel-strong pointer-events-auto rounded-full px-4 py-2 text-sm font-extrabold"
        >
          ‹ Voltar
        </button>
        <div className="glass-panel-strong rounded-3xl px-4 py-2 text-right">
          <p className="text-xs font-extrabold">Pasto aberto</p>
          <p className="text-[11px] font-bold text-muted-foreground">
            {nearby.length} por perto · {Object.keys(peers).length} no universo
          </p>
        </div>
      </div>

      {log.length > 0 ? (
        <div className="pointer-events-none absolute bottom-40 left-3 max-w-[70%] space-y-1">
          {log.slice(-5).map((l, i) => (
            <p key={`${l.id}-${l.at}-${i}`} className="glass-panel inline-block rounded-2xl px-3 py-1.5 text-xs font-bold">
              <span className="text-primary">{l.name}</span> {l.text}
            </p>
          ))}
        </div>
      ) : null}

      <Joystick inputRef={inputRef} />

      <div className="absolute inset-x-0 bottom-0 p-3">
        <div className="glass-panel-strong flex items-center gap-2 rounded-full p-1.5">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") say();
            }}
            placeholder="Falar com quem está por perto..."
            className="min-w-0 flex-1 bg-transparent px-4 py-2.5 text-sm outline-none"
          />
          <button
            onClick={say}
            aria-label="Falar"
            className="send-pill grid h-10 w-14 shrink-0 place-items-center rounded-full active:scale-95"
          >
            <ArrowUp className="h-5 w-5 text-white" />
          </button>
        </div>
        <p className="mt-1.5 text-center text-[11px] font-bold text-muted-foreground">
          Use o direcional ou W A S D para andar
        </p>
      </div>
    </main>
  );
}

/** Touch/mouse stick that feeds normalized movement into the scene. */
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
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        update(e.clientX, e.clientY);
      }}
      onPointerMove={(e) => {
        if (active.current) update(e.clientX, e.clientY);
      }}
      onPointerUp={stop}
      onPointerCancel={stop}
      className="glass-panel absolute bottom-24 left-4 grid h-32 w-32 touch-none place-items-center rounded-full"
    >
      <div
        className="send-pill h-14 w-14 rounded-full"
        style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }}
      />
    </div>
  );
}
