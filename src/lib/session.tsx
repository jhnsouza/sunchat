import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type Profile = {
  id: string;
  username: string;
  phone: string | null;
  display_name: string;
  avatar_url: string | null;
  last_seen: string;
};

type SessionState = {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
};

const SessionContext = createContext<SessionState>({
  session: null,
  profile: null,
  loading: true,
  refreshProfile: async () => {},
});

export const AUTH_EMAIL_DOMAIN = "borachat.app";

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

export function isOnline(lastSeen: string | null | undefined) {
  if (!lastSeen) return false;
  return Date.now() - new Date(lastSeen).getTime() < 70_000;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadProfile(userId: string) {
    const { data } = await supabase
      .from("profiles")
      .select("id, username, phone, display_name, avatar_url, last_seen")
      .eq("id", userId)
      .maybeSingle();
    setProfile((data as Profile) ?? null);
  }

  useEffect(() => {
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

    return () => sub.subscription.unsubscribe();
  }, []);

  // Keep the online status fresh while the app is open.
  useEffect(() => {
    if (!session?.user) return;
    const ping = () => {
      void supabase
        .from("profiles")
        .update({ last_seen: new Date().toISOString() })
        .eq("id", session.user.id);
    };
    ping();
    const timer = setInterval(ping, 45_000);
    return () => clearInterval(timer);
  }, [session?.user?.id]);

  return (
    <SessionContext.Provider
      value={{
        session,
        profile,
        loading,
        refreshProfile: async () => {
          if (session?.user) await loadProfile(session.user.id);
        },
      }}
    >
      {children}
    </SessionContext.Provider>
  );
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
