import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import skyCapsule from "@/assets/sky-capsule.jpg";
import { useSession } from "@/lib/session";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Borá — arraste o sol para conversar" },
      {
        name: "description",
        content:
          "Uma tela, um gesto: arraste o sol e entre direto nas suas conversas em tempo real.",
      },
      { property: "og:title", content: "Borá — arraste o sol para conversar" },
      {
        property: "og:description",
        content: "Mensageiro minimalista: arraste o sol e comece a conversar.",
      },
    ],
  }),
  component: Home,
});

function Home() {
  const navigate = useNavigate();
  const { session, loading } = useSession();
  const trackRef = useRef<HTMLDivElement>(null);
  const [x, setX] = useState(0);
  const [max, setMax] = useState(1);
  const [dragging, setDragging] = useState(false);
  const [done, setDone] = useState(false);

  const measure = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    const knob = track.clientHeight - 16;
    setMax(Math.max(1, track.clientWidth - knob - 16));
  }, []);

  useEffect(() => {
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [measure]);

  const complete = useCallback(() => {
    if (done) return;
    setDone(true);
    setX(max);
    window.setTimeout(() => {
      void navigate({ to: session ? "/chat" : "/auth" });
    }, 260);
  }, [done, max, navigate, session]);

  function pointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (done || loading) return;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    setDragging(true);
  }

  function pointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragging || done) return;
    const track = trackRef.current;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    const knob = track.clientHeight - 16;
    const next = Math.min(max, Math.max(0, e.clientX - rect.left - 8 - knob / 2));
    setX(next);
    if (next >= max * 0.97) complete();
  }

  function pointerUp() {
    if (!dragging) return;
    setDragging(false);
    if (x >= max * 0.8) complete();
    else setX(0);
  }

  const progress = x / max;

  return (
    <main className="flex min-h-[100dvh] flex-col items-center justify-center px-6 py-16">
      <div className="w-full max-w-md">
        <div
          ref={trackRef}
          onPointerDown={pointerDown}
          onPointerMove={pointerMove}
          onPointerUp={pointerUp}
          onPointerCancel={pointerUp}
          role="button"
          tabIndex={0}
          aria-label="Arraste o sol para abrir suas conversas"
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") complete();
          }}
          className="glossy relative h-32 w-full touch-none select-none overflow-hidden rounded-full sm:h-36"
          style={{ background: "oklch(0.97 0.005 265)" }}
        >
          <img
            src={skyCapsule}
            alt=""
            width={1536}
            height={640}
            className="pointer-events-none absolute inset-0 h-full w-full object-cover"
            style={{ opacity: 0.35 + progress * 0.65 }}
          />
          <div
            className="pointer-events-none absolute inset-0 rounded-full"
            style={{ boxShadow: "inset 0 3px 10px oklch(0.4 0.05 265 / 18%)" }}
          />
          <div
            className="absolute top-2 rounded-full"
            style={{
              left: 8,
              width: "calc(100% - 16px)",
              height: "calc(100% - 16px)",
              pointerEvents: "none",
            }}
          />
          <div
            className="absolute top-2 aspect-square rounded-full"
            style={{
              height: "calc(100% - 16px)",
              transform: `translateX(${x + 8}px)`,
              transition: dragging ? "none" : "transform 260ms cubic-bezier(.22,1,.36,1)",
              background:
                "radial-gradient(circle at 34% 30%, oklch(0.97 0.09 98) 0%, oklch(0.88 0.16 92) 62%, oklch(0.82 0.16 84) 100%)",
              boxShadow:
                "0 10px 22px oklch(0.78 0.15 85 / 45%), inset 0 2px 3px oklch(1 0 0 / 70%), inset 0 -4px 8px oklch(0.7 0.14 70 / 35%)",
            }}
          />
        </div>

        <p
          className="mt-8 text-center text-sm font-extrabold uppercase tracking-[0.32em] text-muted-foreground/70"
          style={{ textShadow: "0 1px 0 oklch(1 0 0)" }}
        >
          {done ? "Abrindo" : "Arraste o sol"}
        </p>
      </div>
    </main>
  );
}
