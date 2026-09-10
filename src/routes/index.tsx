import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import cloudLogo from "@/assets/cloud-logo.png.asset.json";
import { useSession } from "@/lib/session";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SunChat — mensagens leves e um pasto 3D" },
      {
        name: "description",
        content: "Converse em tempo real com quem você adicionou e entre no pasto 3D para falar por proximidade.",
      },
      { property: "og:title", content: "SunChat — mensagens leves e um pasto 3D" },
      { property: "og:description", content: "Mensagens instantâneas e um universo 3D aberto com chat por proximidade." },
    ],
  }),
  component: Home,
});

function Home() {
  const navigate = useNavigate();
  const { session, loading } = useSession();

  useEffect(() => {
    if (loading) return;
    void navigate({ to: session ? "/chat" : "/auth", replace: true });
  }, [loading, session, navigate]);

  return (
    <main className="flex min-h-[100dvh] flex-col items-center justify-center gap-5 px-6">
      <img src={cloudLogo.url} alt="SunChat" width={96} height={96} className="h-24 w-24 animate-pulse" />
      <p className="text-sm font-bold text-muted-foreground">Abrindo o SunChat...</p>
    </main>
  );
}
