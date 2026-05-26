
DO $$
DECLARE
  v_uid uuid;
BEGIN
  SELECT id INTO v_uid FROM auth.users WHERE email = 'admin@opsassist.local';

  IF v_uid IS NULL THEN
    -- Create the super admin if missing
    v_uid := gen_random_uuid();
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data, is_super_admin
    ) VALUES (
      '00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated',
      'admin@opsassist.local', crypt('OpsAdmin@2026', gen_salt('bf')),
      now(), now(), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"Super Admin"}'::jsonb, false
    );
    INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
    VALUES (gen_random_uuid(), v_uid,
      jsonb_build_object('sub', v_uid::text, 'email', 'admin@opsassist.local', 'email_verified', true),
      'email', 'admin@opsassist.local', now(), now(), now());
  ELSE
    UPDATE auth.users
       SET encrypted_password = crypt('OpsAdmin@2026', gen_salt('bf')),
           email_confirmed_at = COALESCE(email_confirmed_at, now()),
           updated_at = now()
     WHERE id = v_uid;
  END IF;

  INSERT INTO public.profiles (id, full_name, email, username, department)
  VALUES (v_uid, 'Super Admin', 'admin@opsassist.local', 'Admin', NULL)
  ON CONFLICT (id) DO UPDATE SET username = COALESCE(public.profiles.username, 'Admin'), department = NULL;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_uid, 'admin')
  ON CONFLICT DO NOTHING;
END $$;
