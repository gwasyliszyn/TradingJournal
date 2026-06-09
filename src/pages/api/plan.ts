import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import type { PlanFormData } from "@/types";
import { getOrCreateTodaySession } from "@/lib/services/checkin";
import { upsertPlan } from "@/lib/services/plan";

function validatePlanData(body: unknown): { data: PlanFormData; error?: never } | { data?: never; error: string } {
  if (!body || typeof body !== "object") {
    return { error: "Request body must be a JSON object" };
  }

  const b = body as Record<string, unknown>;

  if (typeof b.goal !== "string" || b.goal.trim().length === 0) {
    return { error: "goal must be a non-empty string" };
  }

  if (typeof b.max_trades !== "number" || !Number.isInteger(b.max_trades) || b.max_trades < 1 || b.max_trades > 50) {
    return { error: "max_trades must be an integer between 1 and 50" };
  }

  if (typeof b.max_daily_loss_r !== "number" || b.max_daily_loss_r <= 0) {
    return { error: "max_daily_loss_r must be a positive number" };
  }

  return {
    data: {
      goal: b.goal.trim(),
      max_trades: b.max_trades,
      max_daily_loss_r: b.max_daily_loss_r,
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

  const validation = validatePlanData(body);
  if (validation.error) {
    return new Response(JSON.stringify({ error: validation.error }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const session = await getOrCreateTodaySession(supabase, user.id);
    const plan = await upsertPlan(supabase, session.id, user.id, validation.data);

    return new Response(JSON.stringify({ session, plan }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
