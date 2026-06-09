import type { SupabaseClient } from "@supabase/supabase-js";
import type { PlanFormData, Session, SessionPlan } from "@/types";

export async function upsertPlan(
  supabase: SupabaseClient,
  sessionId: string,
  userId: string,
  data: PlanFormData,
): Promise<SessionPlan> {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const { data: plan, error } = await supabase
    .from("session_plans")
    .upsert(
      {
        session_id: sessionId,
        user_id: userId,
        ...data,
      },
      { onConflict: "session_id" },
    )
    .select()
    .single();

  if (error) throw error;
  return plan as SessionPlan;
}

export async function getPlanBySession(supabase: SupabaseClient, sessionId: string): Promise<SessionPlan | null> {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const { data, error } = await supabase.from("session_plans").select().eq("session_id", sessionId).maybeSingle();

  if (error) throw error;
  return data as SessionPlan | null;
}

export async function getTodayPlan(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ session: Session; plan: SessionPlan | null } | null> {
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
  const plan = await getPlanBySession(supabase, session.id);
  return { session: session as Session, plan };
}
