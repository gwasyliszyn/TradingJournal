import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { PLAN_COMPLIANCES } from "@/types";
import type { ReviewFormData } from "@/types";
import { getOrCreateTodaySession, getCheckinBySession } from "@/lib/services/checkin";
import { getPlanBySession } from "@/lib/services/plan";
import { getTradesBySession } from "@/lib/services/trades";
import { calculateProcessScore } from "@/lib/services/process-score";
import { upsertReview, completeSession } from "@/lib/services/review";

function validateReviewData(body: unknown): { data: ReviewFormData; error?: never } | { data?: never; error: string } {
  if (!body || typeof body !== "object") {
    return { error: "Request body must be a JSON object" };
  }

  const b = body as Record<string, unknown>;

  if (typeof b.plan_adherence !== "string" || !(PLAN_COMPLIANCES as readonly string[]).includes(b.plan_adherence)) {
    return { error: `plan_adherence must be one of: ${PLAN_COMPLIANCES.join(", ")}` };
  }

  if (typeof b.what_went_wrong !== "string") {
    return { error: "what_went_wrong must be a string" };
  }

  if (typeof b.rule_broken !== "boolean") {
    return { error: "rule_broken must be a boolean" };
  }

  if (typeof b.goal_next_session !== "string" || b.goal_next_session.trim() === "") {
    return { error: "goal_next_session must be a non-empty string" };
  }

  return {
    data: {
      plan_adherence: b.plan_adherence,
      what_went_wrong: b.what_went_wrong,
      rule_broken: b.rule_broken,
      goal_next_session: b.goal_next_session,
    },
  };
}

export const POST: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user) {
    return new Response(JSON.stringify({ error: "Authentication required" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return new Response(JSON.stringify({ error: "Database not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const validation = validateReviewData(body);
  if (validation.error) {
    return new Response(JSON.stringify({ error: validation.error }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { data: formData } = validation;

  try {
    const session = await getOrCreateTodaySession(supabase, user.id);

    const [checkin, plan, trades] = await Promise.all([
      getCheckinBySession(supabase, session.id),
      getPlanBySession(supabase, session.id),
      getTradesBySession(supabase, session.id),
    ]);

    const processScoreResult = calculateProcessScore({
      checkinExists: checkin !== null,
      planExists: plan !== null,
      trades,
      maxDailyLossR: plan?.max_daily_loss_r ?? null,
      ruleBroken: formData.rule_broken,
    });

    const review = await upsertReview(supabase, session.id, user.id, formData, processScoreResult.score);
    await completeSession(supabase, session.id, user.id);

    return new Response(
      JSON.stringify({
        session,
        review,
        process_score_result: processScoreResult,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
