#!/usr/bin/env node
// Create (or find) the admin auth user and add them to public.admins.
//
// Usage:
//   node --env-file=.env scripts/seed-admin.mjs you@example.com
//
// Requires PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.

import { createClient } from "@supabase/supabase-js";

const email = process.argv[2];
if (!email) {
  console.error("Error: pass the admin email, e.g. node scripts/seed-admin.mjs you@example.com");
  process.exit(1);
}

const { PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!PUBLIC_SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Error: PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (run with --env-file=.env).");
  process.exit(1);
}

const supabase = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

let userId;
const { data: created, error: createError } = await supabase.auth.admin.createUser({
  email,
  email_confirm: true,
});

if (createError) {
  if (!/already/i.test(createError.message)) {
    console.error(`createUser failed: ${createError.message}`);
    process.exit(1);
  }
  const { data: list, error: listError } = await supabase.auth.admin.listUsers();
  if (listError) {
    console.error(`listUsers failed: ${listError.message}`);
    process.exit(1);
  }
  userId = list.users.find((user) => user.email?.toLowerCase() === email.toLowerCase())?.id;
  if (!userId) {
    console.error(`User ${email} exists but could not be found.`);
    process.exit(1);
  }
  console.log(`User already exists (${userId}); making sure they are an admin.`);
} else {
  userId = created.user?.id;
  console.log(`Created auth user ${email} (${userId}).`);
}

const { error: upsertError } = await supabase
  .from("admins")
  .upsert({ user_id: userId, email }, { onConflict: "user_id" });

if (upsertError) {
  console.error(`admins upsert failed: ${upsertError.message}`);
  process.exit(1);
}

console.log(`OK — ${email} is now an admin.`);
