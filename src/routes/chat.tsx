import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Avatar } from "@/components/Avatar";
import { isOnline, normalizePhone, normalizeUsername, signedUrl, useSession, type Profile } from "@/lib/session";

export const Route = createFileRoute("/chat")({
  head: () => ({
    meta: [
      { title: "Conversas · Borá" },
      {
        name: "description",
        content: "Converse em tempo real, envie imagens e arquivos e encontre pessoas por @ ou telefone.",
      },
      { property: "og:title", content: "Conversas · Borá" },
      { property: "og:description", content: "Mensagens instantâneas, leves e bonitas." },
    ],
  }),
  component: ChatPage,
});

type Message = {
  id: string;
  sender_id: string;
  recipient_id: string;
  content: string | null;
  attachment_url: string | null;
  attachment_name: string | null;
  attachment_type: string | null;
  created_at: string;
};

function ChatPage() {
  const navigate = useNavigate();
  const { session, profile, loading } = useSession();
  const me = session?.user?.id;

  const [contacts, setContacts] = useState<Profile[]>([]);
  const [active, setActive] = useState<Profile | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Profile[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!loading && !session) void navigate({ to: "/auth", replace: true });
  }, [loading, session, navigate]);

  const loadContacts = useCallback(async () => {
    if (!me) return;
    const { data } = await supabase
      .from("messages")
      .select("sender_id, recipient_id, created_at")
      .order("created_at", { ascending: false })
      .limit(300);
    const ids: string[] = [];
    for (const row of data ?? []) {
      const other = row.sender_id === me ? row.recipient_id : row.sender_id;
      if (other !== me && !ids.includes(other)) ids.push(other);
    }
    if (ids.length === 0) {
      setContacts([]);
      return;
    }
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, username, phone, display_name, avatar_url, last_seen")
      .in("id", ids);
    const byId = new Map((profiles ?? []).map((p) => [p.id, p as Profile]));
    setContacts(ids.map((id) => byId.get(id)).filter(Boolean) as Profile[]);
  }, [me]);

  useEffect(() => {
    void loadContacts();
  }, [loadContacts]);

  const loadMessages = useCallback(
    async (partnerId: string) => {
      if (!me) return;
      const { data } = await supabase
        .from("messages")
        .select("*")
        .or(
          `and(sender_id.eq.${me},recipient_id.eq.${partnerId}),and(sender_id.eq.${partnerId},recipient_id.eq.${me})`,
        )
        .order("created_at", { ascending: true })
        .limit(500);
      setMessages((data ?? []) as Message[]);
    },
    [me],
  );

  useEffect(() => {
    if (active) void loadMessages(active.id);
    else setMessages([]);
  }, [active, loadMessages]);

  // Realtime: new messages and presence updates.
  useEffect(() => {
    if (!me) return;
    const channel = supabase
      .channel("chat-stream")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload) => {
        const msg = payload.new as Message;
        if (msg.sender_id !== me && msg.recipient_id !== me) return;
        const partner = msg.sender_id === me ? msg.recipient_id : msg.sender_id;
        if (active && partner === active.id) {
          setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
        }
        void loadContacts();
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles" }, (payload) => {
        const p = payload.new as Profile;
        setContacts((prev) => prev.map((c) => (c.id === p.id ? { ...c, ...p } : c)));
        setActive((prev) => (prev && prev.id === p.id ? { ...prev, ...p } : prev));
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [me, active, loadContacts]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, active?.id]);

  // Search by @username or phone number.
  useEffect(() => {
    const raw = query.trim();
    if (raw.length < 2) {
      setResults([]);
      return;
    }
    const timer = window.setTimeout(async () => {
      const user = normalizeUsername(raw);
      const digits = normalizePhone(raw);
      const filters = [`username.ilike.%${user}%`];
      if (digits.length >= 3) filters.push(`phone.ilike.%${digits}%`);
      const { data } = await supabase
        .from("profiles")
        .select("id, username, phone, display_name, avatar_url, last_seen")
        .or(filters.join(","))
        .neq("id", me ?? "")
        .limit(12);
      setResults((data ?? []) as Profile[]);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query, me]);

  async function send() {
    const body = text.trim();
    if (!body || !active || !me) return;
    setText("");
    const { data } = await supabase
      .from("messages")
      .insert({ sender_id: me, recipient_id: active.id, content: body })
      .select("*")
      .single();
    if (data) setMessages((prev) => [...prev, data as Message]);
    void loadContacts();
  }

  async function sendFile(file: File) {
    if (!active || !me) return;
    setUploading(true);
    try {
      const path = `${me}/${crypto.randomUUID()}-${file.name.replace(/[^\w.-]/g, "_")}`;
      const { error } = await supabase.storage.from("attachments").upload(path, file);
      if (error) throw error;
      const { data } = await supabase
        .from("messages")
        .insert({
          sender_id: me,
          recipient_id: active.id,
          attachment_url: path,
          attachment_name: file.name,
          attachment_type: file.type,
        })
        .select("*")
        .single();
      if (data) setMessages((prev) => [...prev, data as Message]);
      void loadContacts();
    } finally {
      setUploading(false);
    }
  }

  const list = useMemo(() => (query.trim().length >= 2 ? results : contacts), [query, results, contacts]);

  if (loading || !session) {
    return <main className="min-h-[100dvh]" />;
  }

  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-5xl flex-col p-3 sm:p-5">
      {active ? (
        <section className="glass-panel-strong flex min-h-0 flex-1 flex-col overflow-hidden rounded-4xl">
          <header className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-b border-white/60 px-4 py-3">
            <button
              onClick={() => setActive(null)}
              aria-label="Voltar"
              className="glossy grid h-9 w-9 shrink-0 place-items-center rounded-full bg-card text-lg font-bold"
            >
              ‹
            </button>
            <div className="flex min-w-0 items-center gap-3">
              <Avatar profile={active} size={40} showStatus />
              <div className="min-w-0">
                <p className="truncate text-sm font-extrabold">{active.display_name || active.username}</p>
                <p className="truncate text-xs text-muted-foreground">
                  @{active.username} · {isOnline(active.last_seen) ? "online" : "offline"}
                </p>
              </div>
            </div>
            <button
              onClick={() => navigate({ to: "/profile" })}
              aria-label="Meu perfil"
              className="shrink-0"
            >
              <Avatar profile={profile} size={38} />
            </button>
          </header>

          <div className="no-scrollbar flex-1 space-y-2.5 overflow-y-auto px-4 py-4">
            {messages.map((m) => (
              <Bubble key={m.id} message={m} mine={m.sender_id === me} />
            ))}
            <div ref={bottomRef} />
          </div>

          <footer className="flex items-center gap-2 border-t border-white/60 px-3 py-3">
            <input
              ref={fileRef}
              type="file"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void sendFile(file);
                e.target.value = "";
              }}
            />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              aria-label="Enviar imagem ou arquivo"
              className="glossy grid h-11 w-11 shrink-0 place-items-center rounded-full bg-card text-lg"
            >
              {uploading ? "…" : "+"}
            </button>
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void send();
              }}
              placeholder="Mensagem"
              className="glossy min-w-0 flex-1 rounded-full bg-card px-5 py-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            <button
              onClick={() => void send()}
              aria-label="Enviar"
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground shadow-[0_8px_20px_oklch(0.58_0.196_258_/_35%)] active:scale-95"
            >
              ↑
            </button>
          </footer>
        </section>
      ) : (
        <section className="glass-panel-strong flex min-h-0 flex-1 flex-col overflow-hidden rounded-4xl">
          <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-5 pb-3 pt-5">
            <h1 className="truncate text-xl font-extrabold tracking-tight">Conversas</h1>
            <button onClick={() => navigate({ to: "/profile" })} aria-label="Meu perfil">
              <Avatar profile={profile} size={40} showStatus />
            </button>
          </header>

          <div className="px-5 pb-3">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar @usuário ou telefone"
              className="glossy w-full rounded-full bg-card px-5 py-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div className="no-scrollbar flex-1 space-y-1.5 overflow-y-auto px-3 pb-4">
            {list.length === 0 ? (
              <p className="px-3 py-10 text-center text-sm text-muted-foreground">
                {query.trim().length >= 2
                  ? "Ninguém encontrado."
                  : "Busque por @usuário ou telefone para começar."}
              </p>
            ) : (
              list.map((c) => (
                <button
                  key={c.id}
                  onClick={() => {
                    setActive(c);
                    setQuery("");
                  }}
                  className="glass-panel flex w-full items-center gap-3 rounded-3xl px-3.5 py-3 text-left transition-transform active:scale-[0.99]"
                >
                  <Avatar profile={c} size={44} showStatus />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold">{c.display_name || c.username}</span>
                    <span className="block truncate text-xs text-muted-foreground">@{c.username}</span>
                  </span>
                </button>
              ))
            )}
          </div>
        </section>
      )}
    </main>
  );
}

function Bubble({ message, mine }: { message: Message; mine: boolean }) {
  const [url, setUrl] = useState<string | null>(null);
  const isImage = message.attachment_type?.startsWith("image/");

  useEffect(() => {
    let alive = true;
    void signedUrl("attachments", message.attachment_url).then((u) => {
      if (alive) setUrl(u);
    });
    return () => {
      alive = false;
    };
  }, [message.attachment_url]);

  const time = new Date(message.created_at).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div
        className={`${mine ? "bubble-out rounded-br-lg" : "bubble-in rounded-bl-lg"} max-w-[78%] rounded-3xl px-4 py-3`}
      >
        {message.attachment_url ? (
          isImage && url ? (
            <img src={url} alt={message.attachment_name ?? "Imagem"} loading="lazy" className="mb-1 max-h-64 rounded-2xl" />
          ) : (
            <a
              href={url ?? "#"}
              target="_blank"
              rel="noreferrer"
              className="block text-sm font-bold underline underline-offset-2"
            >
              {message.attachment_name ?? "Arquivo"}
            </a>
          )
        ) : null}
        {message.content ? (
          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{message.content}</p>
        ) : null}
        <p className={`mt-1 text-[10px] font-semibold ${mine ? "text-white/70" : "text-muted-foreground"}`}>
          {time}
        </p>
      </div>
    </div>
  );
}
