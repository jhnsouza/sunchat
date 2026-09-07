import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Avatar } from "@/components/Avatar";
import { normalizePhone, useSession } from "@/lib/session";

export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [
      { title: "Meu perfil · Borá" },
      { name: "description", content: "Ajuste seu nome, foto e telefone, ou saia da conta." },
      { property: "og:title", content: "Meu perfil · Borá" },
      { property: "og:description", content: "Informações básicas da sua conta Borá." },
    ],
  }),
  component: ProfilePage,
});

function ProfilePage() {
  const navigate = useNavigate();
  const { session, profile, loading, refreshProfile } = useSession();
  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!loading && !session) void navigate({ to: "/auth", replace: true });
  }, [loading, session, navigate]);

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.display_name);
      setPhone(profile.phone ?? "");
    }
  }, [profile?.id]);

  async function save() {
    if (!profile) return;
    setBusy(true);
    await supabase
      .from("profiles")
      .update({ display_name: displayName.trim() || profile.username, phone: phone ? normalizePhone(phone) : null })
      .eq("id", profile.id);
    await refreshProfile();
    setBusy(false);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1800);
  }

  async function uploadAvatar(file: File) {
    if (!profile) return;
    setBusy(true);
    const path = `${profile.id}/avatar-${Date.now()}`;
    const { error } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
    if (!error) {
      await supabase.from("profiles").update({ avatar_url: path }).eq("id", profile.id);
      await refreshProfile();
    }
    setBusy(false);
  }

  async function signOut() {
    await supabase.auth.signOut();
    void navigate({ to: "/", replace: true });
  }

  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-sm flex-col justify-center px-5 py-10">
      <div className="glass-panel-strong rounded-4xl p-7">
        <div className="flex items-center gap-4">
          <button onClick={() => fileRef.current?.click()} aria-label="Trocar foto">
            <Avatar profile={profile} size={72} showStatus />
          </button>
          <div className="min-w-0">
            <p className="truncate text-lg font-extrabold">{profile?.display_name || profile?.username}</p>
            <p className="truncate text-sm text-muted-foreground">@{profile?.username}</p>
            <button onClick={() => fileRef.current?.click()} className="mt-1 text-xs font-bold text-primary">
              Trocar foto
            </button>
          </div>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void uploadAvatar(file);
            e.target.value = "";
          }}
        />

        <div className="mt-6 space-y-3">
          <label className="block">
            <span className="ml-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">Nome</span>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="glossy mt-1.5 w-full rounded-full bg-card px-5 py-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </label>
          <label className="block">
            <span className="ml-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">Telefone</span>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              inputMode="tel"
              className="glossy mt-1.5 w-full rounded-full bg-card px-5 py-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </label>
        </div>

        <button
          onClick={() => void save()}
          disabled={busy}
          className="mt-5 w-full rounded-full bg-primary py-3.5 text-sm font-bold text-primary-foreground shadow-[0_10px_24px_oklch(0.58_0.196_258_/_35%)] active:scale-[0.98] disabled:opacity-60"
        >
          {saved ? "Salvo" : busy ? "Aguarde…" : "Salvar"}
        </button>

        <div className="mt-3 flex gap-2">
          <button
            onClick={() => navigate({ to: "/chat" })}
            className="glossy flex-1 rounded-full bg-card py-3 text-sm font-bold"
          >
            Voltar
          </button>
          <button
            onClick={() => void signOut()}
            className="flex-1 rounded-full border border-destructive/30 py-3 text-sm font-bold text-destructive"
          >
            Sair
          </button>
        </div>
      </div>
    </main>
  );
}
