import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, File as FileIcon, ImageIcon, ArrowUp, ArrowRight, Plus, Timer } from "lucide-react";
import cloudLogo from "@/assets/cloud-logo.png.asset.json";
import { supabase } from "@/integrations/supabase/client";
import { Avatar } from "@/components/Avatar";
import {
  PROFILE_COLUMNS,
  normalizePhone,
  normalizeUsername,
  playPing,
  signedUrl,
  useSession,
  type Profile,
} from "@/lib/session";

export const Route = createFileRoute("/chat")({
  head: () => ({
    meta: [
      { title: "Conversas · SunChat" },
      {
        name: "description",
        content: "Converse em tempo real, envie imagens e arquivos e adicione pessoas por @ ou telefone.",
      },
      { property: "og:title", content: "Conversas · SunChat" },
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
  read_at: string | null;
  ephemeral: boolean;
};

const EPHEMERAL_MS = 10_000;

function ChatPage() {
  const navigate = useNavigate();
  const { session, profile, loading, onlineIds } = useSession();
  const me = session?.user?.id;

  const [contacts, setContacts] = useState<Profile[]>([]);
  const [unread, setUnread] = useState<Record<string, number>>({});
  const [active, setActive] = useState<Profile | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [addQuery, setAddQuery] = useState("");
  const [addResults, setAddResults] = useState<Profile[]>([]);
  const [addNote, setAddNote] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<Profile | null>(null);
  activeRef.current = active;

  useEffect(() => {
    if (!loading && !session) void navigate({ to: "/auth", replace: true });
  }, [loading, session, navigate]);

  const loadContacts = useCallback(async () => {
    if (!me) return;
    const { data: rows } = await supabase.from("contacts").select("contact_id").eq("owner_id", me);
    const ids = (rows ?? []).map((r) => r.contact_id as string);
    if (ids.length === 0) {
      setContacts([]);
      return;
    }
    const { data: profiles } = await supabase.from("profiles").select(PROFILE_COLUMNS).in("id", ids);
    setContacts((profiles ?? []) as Profile[]);
  }, [me]);

  const loadUnread = useCallback(async () => {
    if (!me) return;
    const { data } = await supabase
      .from("messages")
      .select("sender_id")
      .eq("recipient_id", me)
      .is("read_at", null);
    const counts: Record<string, number> = {};
    for (const row of data ?? []) {
      const from = row.sender_id as string;
      counts[from] = (counts[from] ?? 0) + 1;
    }
    setUnread(counts);
  }, [me]);

  useEffect(() => {
    void loadContacts();
    void loadUnread();
  }, [loadContacts, loadUnread]);

  const scheduleBurn = useCallback((id: string) => {
    window.setTimeout(() => {
      setMessages((prev) => prev.filter((m) => m.id !== id));
    }, EPHEMERAL_MS);
  }, []);

  const markRead = useCallback(
    async (rows: Message[]) => {
      if (!me) return;
      const pending = rows.filter((m) => m.recipient_id === me && !m.read_at);
      if (pending.length === 0) return;
      const stamp = new Date().toISOString();
      await supabase
        .from("messages")
        .update({ read_at: stamp })
        .in("id", pending.map((m) => m.id));
      setMessages((prev) => prev.map((m) => (pending.some((p) => p.id === m.id) ? { ...m, read_at: stamp } : m)));
      void loadUnread();
      for (const m of pending) {
        if (!m.ephemeral) continue;
        scheduleBurn(m.id);
        window.setTimeout(() => {
          void supabase.from("messages").delete().eq("id", m.id);
        }, EPHEMERAL_MS);
      }
    },
    [me, loadUnread, scheduleBurn],
  );

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
      const rows = (data ?? []) as Message[];
      setMessages(rows);
      void markRead(rows);
    },
    [me, markRead],
  );

  useEffect(() => {
    if (active) void loadMessages(active.id);
    else setMessages([]);
  }, [active, loadMessages]);

  // Realtime: incoming messages, read receipts and profile updates.
  useEffect(() => {
    if (!me) return;
    const channel = supabase
      .channel("chat-stream")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload) => {
        const msg = payload.new as Message;
        if (msg.sender_id !== me && msg.recipient_id !== me) return;
        const current = activeRef.current;
        if (msg.sender_id !== me) {
          if (profile?.sound_enabled !== false) playPing();
          void loadUnread();
        }
        if (current && (msg.sender_id === current.id || msg.recipient_id === current.id)) {
          setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
          if (msg.recipient_id === me) void markRead([msg]);
        }
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages" }, (payload) => {
        const msg = payload.new as Message;
        if (msg.sender_id !== me && msg.recipient_id !== me) return;
        setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, ...msg } : m)));
        if (msg.sender_id === me && msg.ephemeral && msg.read_at) scheduleBurn(msg.id);
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
  }, [me, profile?.sound_enabled, loadUnread, markRead, scheduleBurn]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, active?.id]);

  // "Adicionar pessoa": the only place where new people can be discovered.
  useEffect(() => {
    const raw = addQuery.trim();
    if (raw.length < 2) {
      setAddResults([]);
      return;
    }
    const timer = window.setTimeout(async () => {
      const user = normalizeUsername(raw);
      const digits = normalizePhone(raw);
      const filters = [`username.ilike.%${user}%`];
      if (digits.length >= 3) filters.push(`phone.ilike.%${digits}%`);
      const { data } = await supabase
        .from("profiles")
        .select(PROFILE_COLUMNS)
        .or(filters.join(","))
        .neq("id", me ?? "")
        .limit(12);
      setAddResults((data ?? []) as Profile[]);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [addQuery, me]);

  async function addContact(person: Profile) {
    if (!me) return;
    const { error } = await supabase.from("contacts").insert({ owner_id: me, contact_id: person.id });
    if (error && !error.message.includes("duplicate")) {
      setAddNote("Não foi possível adicionar.");
      return;
    }
    await loadContacts();
    setAddNote(`${person.display_name || person.username} foi adicionado.`);
    setAddQuery("");
    setAddResults([]);
  }

  async function send() {
    const body = text.trim();
    if (!body || !active || !me) return;
    setText("");
    const { data } = await supabase
      .from("messages")
      .insert({
        sender_id: me,
        recipient_id: active.id,
        content: body,
        ephemeral: profile?.ephemeral_enabled ?? false,
      })
      .select("*")
      .single();
    if (data) setMessages((prev) => [...prev, data as Message]);
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
          ephemeral: profile?.ephemeral_enabled ?? false,
        })
        .select("*")
        .single();
      if (data) setMessages((prev) => [...prev, data as Message]);
    } finally {
      setUploading(false);
    }
  }

  const term = query.trim().toLowerCase().replace(/^@/, "");
  const list = term
    ? contacts.filter(
        (c) =>
          c.username.includes(term) ||
          c.display_name.toLowerCase().includes(term) ||
          (c.phone ?? "").includes(normalizePhone(term)),
      )
    : contacts;

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
                  @{active.username} · {onlineIds.has(active.id) ? "online" : "offline"}
                </p>
              </div>
            </div>
            <button onClick={() => navigate({ to: "/profile" })} aria-label="Meu perfil" className="shrink-0">
              <Avatar profile={profile} size={38} />
            </button>
          </header>

          {profile?.ephemeral_enabled ? (
            <p className="flex items-center justify-center gap-1.5 border-b border-white/50 py-1.5 text-[11px] font-bold text-muted-foreground">
              <Timer className="h-3.5 w-3.5" /> Mensagens temporárias ativas
            </p>
          ) : null}

          <div className="no-scrollbar flex-1 space-y-2.5 overflow-y-auto px-4 py-4">
            {messages.map((m) => (
              <Bubble key={m.id} message={m} mine={m.sender_id === me} />
            ))}
            <div ref={bottomRef} />
          </div>

          <footer className="p-3">
            <div className="glass-panel-strong rounded-4xl">
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void send();
                }}
                placeholder={`Mensagem para ${active.display_name || active.username}...`}
                className="w-full bg-transparent px-5 py-4 text-sm outline-none placeholder:text-muted-foreground/70"
              />
              <div className="flex items-center justify-between border-t border-white/60 px-4 py-2.5">
                <div className="flex items-center gap-4 text-muted-foreground">
                  <button onClick={() => cameraRef.current?.click()} aria-label="Câmera" disabled={uploading}>
                    <Camera className="h-5 w-5" />
                  </button>
                  <button onClick={() => imageRef.current?.click()} aria-label="Foto" disabled={uploading}>
                    <ImageIcon className="h-5 w-5" />
                  </button>
                  <button onClick={() => fileRef.current?.click()} aria-label="Arquivo" disabled={uploading}>
                    <FileIcon className="h-5 w-5" />
                  </button>
                </div>
                <button
                  onClick={() => void send()}
                  aria-label="Enviar"
                  className="send-pill grid h-10 w-16 place-items-center rounded-full active:scale-95"
                >
                  <ArrowUp className="h-5 w-5 text-white" />
                </button>
              </div>
            </div>
            <input
              ref={cameraRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void sendFile(file);
                e.target.value = "";
              }}
            />
            <input
              ref={imageRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void sendFile(file);
                e.target.value = "";
              }}
            />
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

          <div className="flex items-center gap-2 px-5 pb-3">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar nos seus contatos"
              className="glossy min-w-0 flex-1 rounded-full bg-card px-5 py-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            <button
              onClick={() => {
                setAdding((v) => !v);
                setAddNote(null);
              }}
              aria-label="Adicionar pessoas"
              className="send-pill grid h-11 w-11 shrink-0 place-items-center rounded-full active:scale-95"
            >
              <Plus className="h-5 w-5 text-white" />
            </button>
          </div>

          <div className="px-4 pb-4">
            <button
              onClick={() => navigate({ to: "/universo" })}
              className="neon-pasto flex w-full items-center gap-3 rounded-full px-3 py-3 text-left"
            >
              <img
                src={cloudLogo.url}
                alt=""
                width={54}
                height={54}
                className="h-13 w-13 shrink-0 rounded-full bg-white/85 p-1"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-lg font-extrabold text-white drop-shadow">Entrar no Pasto</span>
                <span className="block truncate text-[10px] font-extrabold uppercase tracking-[0.2em] text-white/85">
                  Converse · Explore · Conecte
                </span>
              </span>
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white/25 ring-1 ring-white/50">
                <ArrowRight className="h-5 w-5 text-white" />
              </span>
            </button>
          </div>

          {adding ? (
            <div className="glass-panel mx-4 mb-3 rounded-3xl p-3">
              <p className="px-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Adicionar pessoas
              </p>
              <input
                value={addQuery}
                onChange={(e) => {
                  setAddQuery(e.target.value);
                  setAddNote(null);
                }}
                placeholder="@usuário ou telefone"
                className="glossy mt-2 w-full rounded-full bg-card px-5 py-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
              {addNote ? <p className="mt-2 px-1 text-xs font-bold text-primary">{addNote}</p> : null}
              <div className="mt-2 space-y-1.5">
                {addResults.map((p) => (
                  <div key={p.id} className="flex items-center gap-3 rounded-2xl bg-card/70 px-3 py-2">
                    <Avatar profile={p} size={36} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold">{p.display_name || p.username}</span>
                      <span className="block truncate text-xs text-muted-foreground">@{p.username}</span>
                    </span>
                    <button
                      onClick={() => void addContact(p)}
                      className="rounded-full bg-primary px-3.5 py-1.5 text-xs font-bold text-primary-foreground"
                    >
                      Adicionar
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="no-scrollbar flex-1 space-y-1.5 overflow-y-auto px-3 pb-4">
            {list.length === 0 ? (
              <p className="px-3 py-10 text-center text-sm text-muted-foreground">
                {contacts.length === 0
                  ? "Toque em + para adicionar pessoas por @ ou telefone."
                  : "Nenhum contato com esse nome."}
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
                    <span className="block truncate text-xs text-muted-foreground">
                      @{c.username} · {onlineIds.has(c.id) ? "online" : "offline"}
                    </span>
                  </span>
                  {unread[c.id] ? (
                    <span className="grid h-6 min-w-6 place-items-center rounded-full bg-primary px-1.5 text-xs font-bold text-primary-foreground">
                      {unread[c.id]}
                    </span>
                  ) : null}
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
        <p className={`mt-1 flex items-center gap-1 text-[10px] font-semibold ${mine ? "opacity-70" : "text-muted-foreground"}`}>
          {message.ephemeral ? <Timer className="h-3 w-3" /> : null}
          {time}
          {mine && message.read_at ? " · lida" : ""}
        </p>
      </div>
    </div>
  );
}
