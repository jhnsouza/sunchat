CREATE TABLE public.contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, contact_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.contacts TO authenticated;
GRANT ALL ON public.contacts TO service_role;

ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner reads contacts" ON public.contacts FOR SELECT TO authenticated USING (auth.uid() = owner_id);
CREATE POLICY "Owner adds contacts" ON public.contacts FOR INSERT TO authenticated WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Owner removes contacts" ON public.contacts FOR DELETE TO authenticated USING (auth.uid() = owner_id);

ALTER TABLE public.messages ADD COLUMN read_at timestamptz;
ALTER TABLE public.messages ADD COLUMN expires_at timestamptz;
ALTER TABLE public.messages ADD COLUMN ephemeral boolean NOT NULL DEFAULT false;

CREATE POLICY "Recipient marks read" ON public.messages FOR UPDATE TO authenticated USING (auth.uid() = recipient_id) WITH CHECK (auth.uid() = recipient_id);
CREATE POLICY "Participants delete messages" ON public.messages FOR DELETE TO authenticated USING (auth.uid() = sender_id OR auth.uid() = recipient_id);

ALTER TABLE public.profiles ADD COLUMN sound_enabled boolean NOT NULL DEFAULT true;
ALTER TABLE public.profiles ADD COLUMN ephemeral_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN sun_pin text;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_phone_unique ON public.profiles (phone) WHERE phone IS NOT NULL AND phone <> '';

ALTER PUBLICATION supabase_realtime ADD TABLE public.contacts;