import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type Profile = {
  id: string;
  username: string;
  phone: string | null;
  display_name: string;
  avatar_url: string | null;
  last_seen: string;
  sound_enabled: boolean;
  ephemeral_enabled: boolean;
  sun_pin: string | null;
};

type SessionState = {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  onlineIds: Set<string>;
  refreshProfile: () => Promise<void>;
};

const SessionContext = createContext<SessionState>({
  session: null,
  profile: null,
  loading: true,
  onlineIds: new Set(),
  refreshProfile: async () => {},
});

export const AUTH_EMAIL_DOMAIN = "borachat.app";
export const PROFILE_COLUMNS =
  "id, username, phone, display_name, avatar_url, last_seen, sound_enabled, ephemeral_enabled, sun_pin";

export function normalizeUsername(raw: string) {
  return raw
    .trim()
    .replace(/^@/, "")
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "");
}

export function normalizePhone(raw: string) {
  return raw.replace(/[^0-9]/g, "");
}

export function emailForUsername(username: string) {
  return `${username}@${AUTH_EMAIL_DOMAIN}`;
}

/** Plays a short chime for incoming messages. */
export function playPing() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const now = ctx.currentTime;
    [880, 1320].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now + i * 0.12);
      gain.gain.exponentialRampToValueAtTime(0.16, now + i * 0.12 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.12 + 0.22);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + i * 0.12);
      osc.stop(now + i * 0.12 + 0.24);
    });
    window.setTimeout(() => void ctx.close(), 700);
  } catch {
    /* som indisponível */
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [onlineIds, setOnlineIds] = useState<Set<string>>(new Set());
  const userId = session?.user?.id;
  const mounted = useRef(true);

  async function loadProfile(id: string) {
    const { data } = await supabase.from("profiles").select(PROFILE_COLUMNS).eq("id", id).maybeSingle();
    if (mounted.current) setProfile((data as Profile) ?? null);
  }

  useEffect(() => {
    mounted.current = true;
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      if (next?.user) void loadProfile(next.user.id);
      else setProfile(null);
    });

    void supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      if (data.session?.user) await loadProfile(data.session.user.id);
      setLoading(false);
    });

    return () => {
      mounted.current = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  // Live presence: everyone connected shares one channel keyed by user id.
  useEffect(() => {
    if (!userId) {
      setOnlineIds(new Set());
      return;
    }
    const channel = supabase.channel("presence:sunchat", {
      config: { presence: { key: userId } },
    });

    const sync = () => {
      const state = channel.presenceState();
      setOnlineIds(new Set(Object.keys(state)));
    };

    channel
      .on("presence", { event: "sync" }, sync)
      .on("presence", { event: "join" }, sync)
      .on("presence", { event: "leave" }, sync)
      .subscribe((status) => {
        if (status === "SUBSCRIBED") void channel.track({ at: Date.now() });
      });

    const ping = () => {
      void supabase.from("profiles").update({ last_seen: new Date().toISOString() }).eq("id", userId);
    };
    ping();
    const timer = window.setInterval(ping, 45_000);

    return () => {
      window.clearInterval(timer);
      void supabase.removeChannel(channel);
    };
  }, [userId]);

  const value = useMemo<SessionState>(
    () => ({
      session,
      profile,
      loading,
      onlineIds,
      refreshProfile: async () => {
        if (userId) await loadProfile(userId);
      },
    }),
    [session, profile, loading, onlineIds, userId],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  return useContext(SessionContext);
}

const signedUrlCache = new Map<string, string>();

export async function signedUrl(bucket: string, path: string | null | undefined) {
  if (!path) return null;
  const key = `${bucket}/${path}`;
  const cached = signedUrlCache.get(key);
  if (cached) return cached;
  const { data } = await supabase.storage.from(bucket).createSignedUrl(path, 60 * 60);
  if (!data?.signedUrl) return null;
  signedUrlCache.set(key, data.signedUrl);
  return data.signedUrl;
}
