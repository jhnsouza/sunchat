import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import skyDay from "@/assets/sky-day.jpg";
import skyNight from "@/assets/sky-night.jpg";
import { hashPin, useSession } from "@/lib/session";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SunChat — arraste o sol para conversar" },
      {
        name: "description",
        content: "Uma tela, um gesto: arraste o sol e entre direto nas suas conversas em tempo real.",
      },
      { property: "og:title", content: "SunChat — arraste o sol para conversar" },
      { property: "og:description", content: "Mensageiro minimalista: arraste o sol e comece a conversar." },
    ],
  }),
  component: Home,
});

function Home() {
  const navigate = useNavigate();
  const { session, profile, loading } = useSession();
  const trackRef = useRef<HTMLDivElement>(null);
  const [x, setX] = useState(0);
  const [max, setMax] = useState(1);
  const [dragging, setDragging] = useState(false);
  const [done, setDone] = useState(false);
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState(false);
  const [unlocked, setUnlocked] = useState(false);

  const needsPin = !!profile?.sun_pin && !unlocked;

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

  useEffect(() => {
    if (pin.length !== 4 || !profile?.sun_pin) return;
    void hashPin(pin).then((h) => {
      if (h === profile.sun_pin) {
        setUnlocked(true);
        setPinError(false);
      } else {
        setPinError(true);
      }
      setPin("");
    });
  }, [pin, profile?.sun_pin]);

  const complete = useCallback(() => {
    if (done) return;
    setDone(true);
    setX(max);
    window.setTimeout(() => {
      void navigate({ to: session ? "/chat" : "/auth" });
    }, 520);
  }, [done, max, navigate, session]);

  function pointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (done || loading || needsPin) return;
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

  const progress = Math.min(1, x / max);
  const night = progress > 0.55;

  return (
    <main className="flex min-h-[100dvh] flex-col items-center justify-center px-6 py-16">
      <div className="w-full max-w-md">
        {needsPin ? (
          <div className="glass-panel mb-8 rounded-4xl p-5">
            <p className="text-center text-xs font-bold uppercase tracking-[0.24em] text-muted-foreground">
              {pinError ? "Senha incorreta" : "Digite sua senha"}
            </p>
            <div className="mt-4 flex justify-center gap-3">
              {[0, 1, 2, 3].map((i) => (
                <span
                  key={i}
                  className={`h-3.5 w-3.5 rounded-full ${i < pin.length ? "bg-primary" : "bg-muted-foreground/25"}`}
                />
              ))}
            </div>
            <div className="mt-5 grid grid-cols-3 gap-2.5">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"].map((k, i) =>
                k === "" ? (
                  <span key={i} />
                ) : (
                  <button
                    key={i}
                    onClick={() => {
                      setPinError(false);
                      if (k === "⌫") setPin((p) => p.slice(0, -1));
                      else setPin((p) => (p.length < 4 ? p + k : p));
                    }}
                    className="glossy rounded-2xl bg-card py-3 text-lg font-bold active:scale-95"
                  >
                    {k}
                  </button>
                ),
              )}
            </div>
          </div>
        ) : null}

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
            if ((e.key === "Enter" || e.key === " ") && !needsPin) complete();
          }}
          className="relative h-32 w-full touch-none select-none overflow-hidden rounded-full sm:h-36"
          style={{
            background: "oklch(0.97 0.005 265)",
            boxShadow:
              "0 12px 30px oklch(0.4 0.05 265 / 14%), 0 2px 4px oklch(0.4 0.05 265 / 10%), inset 0 2px 3px oklch(1 0 0 / 90%)",
            border: "6px solid oklch(0.99 0.002 265)",
            opacity: needsPin ? 0.55 : 1,
          }}
        >
          <img
            src={skyDay}
            alt=""
            width={1536}
            height={640}
            className="pointer-events-none absolute inset-0 h-full w-full object-cover"
          />
          <img
            src={skyNight}
            alt=""
            width={1536}
            height={640}
            loading="lazy"
            className="pointer-events-none absolute inset-0 h-full w-full object-cover transition-opacity duration-500"
            style={{ opacity: night ? 1 : 0 }}
          />
          <div
            className="pointer-events-none absolute inset-0 rounded-full"
            style={{ boxShadow: "inset 0 4px 12px oklch(0.4 0.05 265 / 22%)" }}
          />
          <span
            className="pointer-events-none absolute inset-0 flex items-center justify-center text-2xl font-extrabold tracking-tight text-white transition-opacity duration-500"
            style={{ opacity: night ? 1 : 0, textShadow: "0 2px 12px oklch(0.2 0.05 265 / 60%)" }}
          >
            SunChat
          </span>
          <div
            className="absolute top-2 aspect-square rounded-full"
            style={{
              height: "calc(100% - 16px)",
              transform: `translateX(${x + 8}px)`,
              transition: dragging ? "none" : "transform 420ms cubic-bezier(.22,1,.36,1)",
              background:
                "radial-gradient(circle at 34% 30%, oklch(0.97 0.09 98) 0%, oklch(0.9 0.15 95) 60%, oklch(0.85 0.15 88) 100%)",
              boxShadow:
                "0 10px 22px oklch(0.7 0.14 80 / 45%), inset 0 2px 3px oklch(1 0 0 / 70%), inset 0 -4px 8px oklch(0.7 0.14 70 / 35%)",
            }}
          />
        </div>
      </div>
    </main>
  );
}
