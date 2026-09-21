#!/usr/bin/env node
// Set (or reset) a password for an existing admin auth user.
//
// Usage:
//   node --env-file=.env scripts/set-password.mjs you@example.com 'new-password'
//
// Requires PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.

import { createClient } from "@supabase/supabase-js";

const [email, password] = process.argv.slice(2);
if (!email || !password) {
  console.error("Error: usage: node scripts/set-password.mjs you@example.com 'new-password'");
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

const { data: list, error: listError } = await supabase.auth.admin.listUsers();
if (listError) {
  console.error(`listUsers failed: ${listError.message}`);
  process.exit(1);
}

const user = list.users.find((candidate) => candidate.email?.toLowerCase() === email.toLowerCase());
if (!user) {
  console.error(`No auth user found for ${email}. Run seed-admin.mjs first.`);
  process.exit(1);
}

const { error } = await supabase.auth.admin.updateUserById(user.id, { password });
if (error) {
  console.error(`updateUser failed: ${error.message}`);
  process.exit(1);
}

console.log(`OK — password set for ${email}.`);
