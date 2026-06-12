import type { SupabaseClient } from "@supabase/supabase-js";
import type { ReviewFormData, Session, SessionReview } from "@/types";

export async function upsertReview(
  supabase: SupabaseClient,
  sessionId: string,
  userId: string,
  data: ReviewFormData,
  processScore: number,
): Promise<SessionReview> {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const { data: review, error } = await supabase
    .from("session_reviews")
    .upsert(
      {
        session_id: sessionId,
        user_id: userId,
        ...data,
        process_score: processScore,
      },
      { onConflict: "session_id" },
    )
    .select()
    .single();

  if (error) throw error;
  return review as SessionReview;
}

export async function getReviewBySession(supabase: SupabaseClient, sessionId: string): Promise<SessionReview | null> {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const { data, error } = await supabase.from("session_reviews").select().eq("session_id", sessionId).maybeSingle();

  if (error) throw error;
  return data as SessionReview | null;
}

export async function getTodayReview(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ session: Session; review: SessionReview | null } | null> {
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
  const review = await getReviewBySession(supabase, session.id);
  return { session: session as Session, review };
}

export async function completeSession(supabase: SupabaseClient, sessionId: string): Promise<void> {
  const { error } = await supabase.from("sessions").update({ status: "complete" }).eq("id", sessionId);

  if (error) throw error;
}
