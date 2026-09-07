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
      { title: "Entrar no Borá" },
      {
        name: "description",
        content: "Entre ou crie sua conta Borá com @usuário ou telefone e senha.",
      },
      { property: "og:title", content: "Entrar no Borá" },
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
          phone: phone ? normalizePhone(phone) : null,
          display_name: displayName.trim() || user,
        });
        if (profileError) throw profileError;
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
      <div className="glass-panel-strong w-full max-w-sm rounded-4xl p-7">
        <h1 className="text-2xl font-extrabold tracking-tight">
          {mode === "login" ? "Bem-vindo de volta" : "Criar conta"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {mode === "login"
            ? "Use seu @usuário ou telefone."
            : "Escolha um @usuário e uma senha."}
        </p>

        <form onSubmit={submit} className="mt-6 space-y-3">
          {mode === "login" ? (
            <Field
              label="@usuário ou telefone"
              value={identifier}
              onChange={setIdentifier}
              placeholder="@maria ou 11999998888"
              autoComplete="username"
            />
          ) : (
            <>
              <Field label="@usuário" value={username} onChange={setUsername} placeholder="@maria" />
              <Field label="Nome" value={displayName} onChange={setDisplayName} placeholder="Maria Silva" />
              <Field
                label="Telefone (opcional)"
                value={phone}
                onChange={setPhone}
                placeholder="11999998888"
                inputMode="tel"
              />
            </>
          )}
          <Field
            label="Senha"
            value={password}
            onChange={setPassword}
            type="password"
            placeholder="••••••"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
          />

          {error ? <p className="text-sm font-semibold text-destructive">{error}</p> : null}

          <button
            type="submit"
            disabled={busy}
            className="mt-2 w-full rounded-full bg-primary py-3.5 text-sm font-bold text-primary-foreground shadow-[0_10px_24px_oklch(0.58_0.196_258_/_35%)] transition-transform active:scale-[0.98] disabled:opacity-60"
          >
            {busy ? "Aguarde…" : mode === "login" ? "Entrar" : "Criar conta"}
          </button>
        </form>

        <button
          onClick={() => {
            setMode(mode === "login" ? "register" : "login");
            setError(null);
          }}
          className="mt-5 w-full text-center text-sm font-semibold text-primary"
        >
          {mode === "login" ? "Não tenho conta — criar agora" : "Já tenho conta — entrar"}
        </button>
      </div>
    </main>
  );
}

function Field({
  label,
  value,
  onChange,
  ...rest
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  return (
    <label className="block">
      <span className="ml-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <input
        {...rest}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="glossy mt-1.5 w-full rounded-full bg-card px-5 py-3 text-sm text-foreground outline-none placeholder:text-muted-foreground/60 focus:ring-2 focus:ring-ring"
      />
    </label>
  );
}
