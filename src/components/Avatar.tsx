import { useEffect, useState } from "react";
import { signedUrl, useSession, type Profile } from "@/lib/session";

type Props = {
  profile: Pick<Profile, "id" | "display_name" | "username" | "avatar_url"> | null;
  size?: number;
  showStatus?: boolean;
  className?: string;
};

export function Avatar({ profile, size = 44, showStatus = false, className = "" }: Props) {
  const { onlineIds } = useSession();
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void signedUrl("avatars", profile?.avatar_url).then((u) => {
      if (alive) setUrl(u);
    });
    return () => {
      alive = false;
    };
  }, [profile?.avatar_url]);

  const label = (profile?.display_name || profile?.username || "?").trim().charAt(0).toUpperCase();
  const online = !!profile?.id && onlineIds.has(profile.id);

  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center overflow-visible ${className}`}
      style={{ width: size, height: size }}
    >
      <span
        className="glossy flex h-full w-full items-center justify-center overflow-hidden rounded-full bg-accent text-accent-foreground"
        style={{ fontSize: size * 0.4, fontWeight: 700 }}
      >
        {url ? (
          <img src={url} alt={profile?.display_name || profile?.username || "Perfil"} className="h-full w-full object-cover" />
        ) : (
          label
        )}
      </span>
      {showStatus ? (
        <span
          className={`absolute bottom-0 right-0 rounded-full border-2 border-card ${online ? "bg-online" : "bg-muted-foreground/50"}`}
          style={{ width: size * 0.27, height: size * 0.27 }}
        />
      ) : null}
    </span>
  );
}
