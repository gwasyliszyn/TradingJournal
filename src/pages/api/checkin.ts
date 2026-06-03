import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { EMOTIONS, MARKET_BIASES, RISK_MODES } from "@/types";
import type { CheckInFormData } from "@/types";
import { calculateReadinessScore, getScoreBand } from "@/lib/services/readiness-score";
import { getOrCreateTodaySession, upsertCheckin } from "@/lib/services/checkin";

function validateCheckinData(
  body: unknown,
): { data: CheckInFormData; error?: never } | { data?: never; error: string } {
  if (!body || typeof body !== "object") {
    return { error: "Request body must be a JSON object" };
  }

  const b = body as Record<string, unknown>;

  const ratings = ["sleep", "energy", "stress", "focus"] as const;
  for (const field of ratings) {
    const val = b[field];
    if (typeof val !== "number" || !Number.isInteger(val) || val < 1 || val > 5) {
      return { error: `${field} must be an integer between 1 and 5` };
    }
  }

  if (typeof b.emotion !== "string" || !(EMOTIONS as readonly string[]).includes(b.emotion)) {
    return { error: `emotion must be one of: ${EMOTIONS.join(", ")}` };
  }

  if (typeof b.market_bias !== "string" || !(MARKET_BIASES as readonly string[]).includes(b.market_bias)) {
    return { error: `market_bias must be one of: ${MARKET_BIASES.join(", ")}` };
  }

  if (typeof b.risk_mode !== "string" || !(RISK_MODES as readonly string[]).includes(b.risk_mode)) {
    return { error: `risk_mode must be one of: ${RISK_MODES.join(", ")}` };
  }

  return {
    data: {
      sleep: b.sleep as number,
      energy: b.energy as number,
      stress: b.stress as number,
      focus: b.focus as number,
      emotion: b.emotion,
      market_bias: b.market_bias,
      risk_mode: b.risk_mode,
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

  const validation = validateCheckinData(body);
  if (validation.error) {
    return new Response(JSON.stringify({ error: validation.error }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { data: formData } = validation;
  const readinessScore = calculateReadinessScore(formData.sleep, formData.energy, formData.stress, formData.focus);
  const scoreBand = getScoreBand(readinessScore);

  try {
    const session = await getOrCreateTodaySession(supabase, user.id);
    const checkin = await upsertCheckin(supabase, session.id, user.id, formData, readinessScore);

    return new Response(
      JSON.stringify({
        session,
        checkin,
        readiness_score: readinessScore,
        score_band: scoreBand,
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
