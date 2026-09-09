import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  emailForUsername,
  normalizePhone,
  normalizeUsername,
  useSession,
} from "@/lib/session";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Entrar no SunChat" },
      {
        name: "description",
        content: "Entre ou crie sua conta SunChat com @usuário ou telefone e senha.",
      },
      { property: "og:title", content: "Entrar no SunChat" },
      { property: "og:description", content: "Acesse suas conversas com @usuário ou telefone." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const { session, loading } = useSession();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [identifier, setIdentifier] = useState("");
  const [username, setUsername] = useState("");
  const [phone, setPhone] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && session) void navigate({ to: "/chat", replace: true });
  }, [loading, session, navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 6) {
      setError("A senha precisa ter pelo menos 6 caracteres.");
      return;
    }
    setBusy(true);
    try {
      if (mode === "register") {
        const user = normalizeUsername(username);
        if (user.length < 3) throw new Error("Escolha um @usuário com 3 letras ou mais.");
        const digits = phone ? normalizePhone(phone) : null;
        if (digits) {
          const { data: taken } = await supabase.rpc("username_for_identifier", { _identifier: digits });
          if (taken) throw new Error("Esse telefone já está em outra conta.");
        }
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: emailForUsername(user),
          password,
        });
        if (signUpError) throw signUpError;
        const id = data.user?.id;
        if (!id) throw new Error("Não foi possível criar a conta.");
        const { error: profileError } = await supabase.from("profiles").insert({
          id,
          username: user,
          phone: digits,
          display_name: displayName.trim() || user,
        });
        if (profileError) {
          throw new Error(
            profileError.message.includes("profiles_phone_unique")
              ? "Esse telefone já está em outra conta."
              : "Esse @usuário já existe.",
          );
        }
      } else {
        const raw = identifier.trim();
        let user = normalizeUsername(raw);
        if (/^[+\d\s().-]+$/.test(raw)) {
          const { data } = await supabase.rpc("username_for_identifier", { _identifier: raw });
          if (!data) throw new Error("Não encontramos essa conta.");
          user = data as string;
        }
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: emailForUsername(user),
          password,
        });
        if (signInError) throw new Error("Usuário ou senha incorretos.");
      }
      void navigate({ to: "/chat", replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Algo deu errado.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-[100dvh] items-center justify-center px-5 py-12">
      <div className="neu-card w-full max-w-sm rounded-[2.5rem] p-8">
        <img src="/logo.jpg" alt="SunChat" width={56} height={56} className="mx-auto h-14 w-14 rounded-2xl object-cover" />
        <h1 className="mt-4 text-center text-2xl font-extrabold tracking-tight">
          {mode === "login" ? "Entrar" : "Criar conta"}
        </h1>
        <p className="mt-1 text-center text-sm text-muted-foreground">
          {mode === "login" ? "Use seu @usuário ou telefone." : "Escolha um @usuário e uma senha."}
        </p>

        <form onSubmit={submit} className="mt-7 space-y-3.5">
          {mode === "login" ? (
            <Field
              value={identifier}
              onChange={setIdentifier}
              placeholder="@usuário ou telefone"
              autoComplete="username"
            />
          ) : (
            <>
              <Field value={username} onChange={setUsername} placeholder="@usuário" />
              <Field value={displayName} onChange={setDisplayName} placeholder="Seu nome" />
              <Field value={phone} onChange={setPhone} placeholder="Telefone (opcional)" inputMode="tel" />
            </>
          )}
          <Field
            value={password}
            onChange={setPassword}
            type="password"
            placeholder="Senha"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
          />

          {error ? <p className="px-1 text-sm font-semibold text-destructive">{error}</p> : null}

          <button
            type="submit"
            disabled={busy}
            className="mt-3 w-full rounded-full bg-foreground py-4 text-sm font-bold uppercase tracking-[0.14em] text-background shadow-[0_12px_26px_oklch(0.24_0.03_265_/_28%)] transition-transform active:scale-[0.98] disabled:opacity-60"
          >
            {busy ? "Aguarde…" : mode === "login" ? "Entrar" : "Criar conta"}
          </button>
        </form>

        <button
          onClick={() => {
            setMode(mode === "login" ? "register" : "login");
            setError(null);
          }}
          className="mt-6 w-full text-center text-sm font-semibold text-muted-foreground"
        >
          {mode === "login" ? "Não tenho conta — criar agora" : "Já tenho conta — entrar"}
        </button>
      </div>
    </main>
  );
}

function Field({
  value,
  onChange,
  ...rest
}: {
  value: string;
  onChange: (v: string) => void;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  return (
    <input
      {...rest}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="neu-input w-full rounded-full px-6 py-4 text-sm text-foreground outline-none placeholder:text-muted-foreground/70 focus:ring-2 focus:ring-ring"
    />
  );
}
