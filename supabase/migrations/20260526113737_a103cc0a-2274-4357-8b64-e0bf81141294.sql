
-- Wipe app data
TRUNCATE TABLE public.ticket_feedback, public.ticket_notes, public.ticket_assignments, public.tickets, public.pending_activations, public.user_roles, public.profiles RESTART IDENTITY CASCADE;

-- Remove all auth users
DELETE FROM auth.users;

-- Create super admin
DO $$
DECLARE
  new_user_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO auth.users (
    instance_id, id, aud, role, email,
    encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token,
    email_change, email_change_token_new, recovery_token
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    new_user_id,
    'authenticated',
    'authenticated',
    'admin@opsassist.local',
    crypt('OpsAdmin@2026', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Super Admin"}'::jsonb,
    now(), now(), '', '', '', ''
  );

  INSERT INTO public.profiles (id, full_name, email, username, department)
  VALUES (new_user_id, 'Super Admin', 'admin@opsassist.local', 'Admin', NULL);

  INSERT INTO public.user_roles (user_id, role)
  VALUES (new_user_id, 'admin');
END $$;
