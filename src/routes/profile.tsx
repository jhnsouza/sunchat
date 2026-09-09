import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Avatar } from "@/components/Avatar";
import { hashPin, normalizePhone, useSession } from "@/lib/session";

export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [
      { title: "Meu perfil · SunChat" },
      { name: "description", content: "Ajuste nome, foto, telefone, som, mensagens temporárias e a senha do sol." },
      { property: "og:title", content: "Meu perfil · SunChat" },
      { property: "og:description", content: "Preferências da sua conta SunChat." },
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
  const [error, setError] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [pinNote, setPinNote] = useState<string | null>(null);
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
    setError(null);
    const digits = phone ? normalizePhone(phone) : null;
    const { error: updateError } = await supabase
      .from("profiles")
      .update({ display_name: displayName.trim() || profile.username, phone: digits })
      .eq("id", profile.id);
    setBusy(false);
    if (updateError) {
      setError(
        updateError.message.includes("profiles_phone_unique")
          ? "Esse telefone já está em outra conta."
          : "Não foi possível salvar.",
      );
      return;
    }
    await refreshProfile();
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1800);
  }

  async function toggle(field: "sound_enabled" | "ephemeral_enabled", value: boolean) {
    if (!profile) return;
    await supabase.from("profiles").update({ [field]: value }).eq("id", profile.id);
    await refreshProfile();
  }

  async function savePin() {
    if (!profile) return;
    if (pin.length !== 4) {
      setPinNote("Use 4 números.");
      return;
    }
    const hash = await hashPin(pin);
    await supabase.from("profiles").update({ sun_pin: hash }).eq("id", profile.id);
    await refreshProfile();
    setPin("");
    setPinNote("Senha do sol ativada.");
  }

  async function clearPin() {
    if (!profile) return;
    await supabase.from("profiles").update({ sun_pin: null }).eq("id", profile.id);
    await refreshProfile();
    setPinNote("Senha do sol removida.");
  }

  async function uploadAvatar(file: File) {
    if (!profile) return;
    setBusy(true);
    const path = `${profile.id}/avatar-${Date.now()}`;
    const { error: upErr } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
    if (!upErr) {
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
              className="neu-input mt-1.5 w-full rounded-full px-5 py-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </label>
          <label className="block">
            <span className="ml-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">Telefone</span>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              inputMode="tel"
              className="neu-input mt-1.5 w-full rounded-full px-5 py-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </label>
          {error ? <p className="text-sm font-semibold text-destructive">{error}</p> : null}
        </div>

        <div className="mt-5 space-y-2">
          <Switch
            label="Som ao receber mensagem"
            checked={profile?.sound_enabled ?? true}
            onChange={(v) => void toggle("sound_enabled", v)}
          />
          <Switch
            label="Mensagens temporárias (10s após lidas)"
            checked={profile?.ephemeral_enabled ?? false}
            onChange={(v) => void toggle("ephemeral_enabled", v)}
          />
        </div>

        <div className="glass-panel mt-4 rounded-3xl p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Senha do sol (4 dígitos)</p>
          <div className="mt-2 flex gap-2">
            <input
              value={pin}
              onChange={(e) => {
                setPinNote(null);
                setPin(e.target.value.replace(/\D/g, "").slice(0, 4));
              }}
              inputMode="numeric"
              placeholder="0000"
              className="neu-input min-w-0 flex-1 rounded-full px-5 py-3 text-center text-sm tracking-[0.5em] outline-none"
            />
            <button
              onClick={() => void savePin()}
              className="send-pill rounded-full px-4 text-sm font-bold text-white active:scale-95"
            >
              Ativar
            </button>
          </div>
          {profile?.sun_pin ? (
            <button onClick={() => void clearPin()} className="mt-2 text-xs font-bold text-destructive">
              Remover senha
            </button>
          ) : null}
          {pinNote ? <p className="mt-2 text-xs font-bold text-primary">{pinNote}</p> : null}
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

function Switch({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className="glass-panel flex w-full items-center justify-between gap-3 rounded-3xl px-4 py-3 text-left"
    >
      <span className="text-sm font-bold">{label}</span>
      <span
        aria-hidden
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${checked ? "send-pill" : "bg-muted-foreground/25"}`}
      >
        <span
          className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform"
          style={{ transform: `translateX(${checked ? 22 : 2}px)` }}
        />
      </span>
    </button>
  );
}
