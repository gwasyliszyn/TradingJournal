import type { SupabaseClient } from "@supabase/supabase-js";
import type { CheckIn, CheckInFormData, Session } from "@/types";

export async function getOrCreateTodaySession(supabase: SupabaseClient, userId: string): Promise<Session> {
  const today = new Date().toISOString().split("T")[0];

  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const { data: existing, error: selectError } = await supabase
    .from("sessions")
    .select()
    .eq("user_id", userId)
    .eq("session_date", today)
    .maybeSingle();

  if (selectError) throw selectError;
  if (existing) return existing as Session;

  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const { data, error } = await supabase
    .from("sessions")
    .insert({ user_id: userId, session_date: today, status: "active" })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const { data: retry, error: retryError } = await supabase
        .from("sessions")
        .select()
        .eq("user_id", userId)
        .eq("session_date", today)
        .single();
      if (retryError) throw retryError;
      return retry as Session;
    }
    throw error;
  }
  return data as Session;
}

export async function getCheckinBySession(supabase: SupabaseClient, sessionId: string): Promise<CheckIn | null> {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const { data, error } = await supabase.from("check_ins").select().eq("session_id", sessionId).maybeSingle();

  if (error) throw error;
  return data as CheckIn | null;
}

export async function upsertCheckin(
  supabase: SupabaseClient,
  sessionId: string,
  userId: string,
  formData: CheckInFormData,
  readinessScore: number,
): Promise<CheckIn> {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const { data, error } = await supabase
    .from("check_ins")
    .upsert(
      {
        session_id: sessionId,
        user_id: userId,
        ...formData,
        readiness_score: readinessScore,
      },
      { onConflict: "session_id" },
    )
    .select()
    .single();

  if (error) throw error;
  return data as CheckIn;
}

export async function getTodayCheckin(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ session: Session; checkin: CheckIn | null } | null> {
  const today = new Date().toISOString().split("T")[0];

  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const { data: session, error } = await supabase
    .from("sessions")
    .select()
    .eq("user_id", userId)
    .eq("session_date", today)
    .maybeSingle();

  if (error) throw error;
  if (!session) return null;

  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
  const checkin = await getCheckinBySession(supabase, session.id);
  return { session: session as Session, checkin };
}
