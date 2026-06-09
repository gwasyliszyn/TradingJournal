import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { PLAN_COMPLIANCES } from "@/types";
import type { TradeFormData } from "@/types";
import { getOrCreateTodaySession } from "@/lib/services/checkin";
import { createTrade } from "@/lib/services/trades";

function validateTradeData(body: unknown): { data: TradeFormData; error?: never } | { data?: never; error: string } {
  if (!body || typeof body !== "object") {
    return { error: "Request body must be a JSON object" };
  }

  const b = body as Record<string, unknown>;

  if (typeof b.instrument !== "string" || b.instrument.trim().length === 0) {
    return { error: "instrument must be a non-empty string" };
  }

  if (typeof b.setup_name !== "string" || b.setup_name.trim().length === 0) {
    return { error: "setup_name must be a non-empty string" };
  }

  if (typeof b.result_r !== "number") {
    return { error: "result_r must be a number" };
  }

  if (typeof b.plan_compliance !== "string" || !(PLAN_COMPLIANCES as readonly string[]).includes(b.plan_compliance)) {
    return { error: `plan_compliance must be one of: ${PLAN_COMPLIANCES.join(", ")}` };
  }

  if (typeof b.main_mistake !== "string" || b.main_mistake.trim().length === 0) {
    return { error: "main_mistake must be a non-empty string" };
  }

  return {
    data: {
      instrument: b.instrument.trim(),
      setup_name: b.setup_name.trim(),
      result_r: b.result_r,
      plan_compliance: b.plan_compliance,
      main_mistake: b.main_mistake.trim(),
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

  const validation = validateTradeData(body);
  if (validation.error) {
    return new Response(JSON.stringify({ error: validation.error }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const session = await getOrCreateTodaySession(supabase, user.id);
    const trade = await createTrade(supabase, session.id, user.id, validation.data);

    return new Response(JSON.stringify({ trade }), {
      status: 201,
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
