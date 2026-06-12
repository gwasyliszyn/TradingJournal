import type { SupabaseClient } from "@supabase/supabase-js";
import type { SessionDetail, SessionHistoryItem } from "@/types";
import { getCheckinBySession } from "@/lib/services/checkin";
import { getPlanBySession } from "@/lib/services/plan";
import { getTradesBySession } from "@/lib/services/trades";
import { getReviewBySession } from "@/lib/services/review";

export async function getSessionHistory(supabase: SupabaseClient, userId: string): Promise<SessionHistoryItem[]> {
  const today = new Date().toISOString().split("T")[0];

  const { data, error } = await supabase
    .from("sessions")
    .select("id, session_date, status, check_ins(readiness_score), session_reviews(process_score)")
    .eq("user_id", userId)
    .lt("session_date", today)
    .order("session_date", { ascending: false });

  if (error) throw error;

  return (data as Record<string, unknown>[]).map((row) => {
    const checkIns = row.check_ins as { readiness_score: number }[] | null;
    const reviews = row.session_reviews as { process_score: number }[] | null;

    return {
      id: row.id as string,
      session_date: row.session_date as string,
      status: row.status as SessionHistoryItem["status"],
      readiness_score: checkIns?.[0]?.readiness_score ?? null,
      process_score: reviews?.[0]?.process_score ?? null,
    };
  });
}

export async function getSessionById(
  supabase: SupabaseClient,
  sessionId: string,
  userId: string,
): Promise<SessionDetail | null> {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const { data: session, error } = await supabase
    .from("sessions")
    .select()
    .eq("id", sessionId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  if (!session) return null;

  const typedSession = session as SessionDetail["session"];

  const [checkin, plan, trades, review] = await Promise.all([
    getCheckinBySession(supabase, typedSession.id),
    getPlanBySession(supabase, typedSession.id),
    getTradesBySession(supabase, typedSession.id),
    getReviewBySession(supabase, typedSession.id),
  ]);

  return { session: typedSession, checkin, plan, trades, review };
}
