import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Session } from "@/types";

export const TEST_USER_A = { email: "test-user-a@test.local", password: "test-password-a-2026" };
export const TEST_USER_B = { email: "test-user-b@test.local", password: "test-password-b-2026" };

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env var: ${name}`);
  return value;
}

export async function ensureTestUsers(): Promise<void> {
  for (const user of [TEST_USER_A, TEST_USER_B]) {
    const client = createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_ANON_KEY"));
    const { error } = await client.auth.signUp({ email: user.email, password: user.password });
    if (error && !error.message.includes("already been registered")) {
      throw new Error(`Failed to create ${user.email}: ${error.message}`);
    }
  }
}

export async function createTestSession(client: SupabaseClient, userId: string, dateString: string): Promise<Session> {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const { data, error } = await client
    .from("sessions")
    .insert({ user_id: userId, session_date: dateString, status: "active" })
    .select()
    .single();

  if (error) throw new Error(`Failed to create test session: ${error.message}`);
  return data as Session;
}

export async function cleanupUserData(adminClient: SupabaseClient, userId: string): Promise<void> {
  await adminClient.from("session_reviews").delete().eq("user_id", userId);
  await adminClient.from("trades").delete().eq("user_id", userId);
  await adminClient.from("session_plans").delete().eq("user_id", userId);
  await adminClient.from("check_ins").delete().eq("user_id", userId);
  await adminClient.from("sessions").delete().eq("user_id", userId);
}
