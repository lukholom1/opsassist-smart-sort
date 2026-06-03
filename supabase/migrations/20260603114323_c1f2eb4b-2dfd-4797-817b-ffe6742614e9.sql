CREATE TABLE public.password_resets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL,
  otp_code TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '15 minutes'),
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_password_resets_email ON public.password_resets(email);

GRANT ALL ON public.password_resets TO service_role;

ALTER TABLE public.password_resets ENABLE ROW LEVEL SECURITY;

-- No client policies: server-only access via service role.
