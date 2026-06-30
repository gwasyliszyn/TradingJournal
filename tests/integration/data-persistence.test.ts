import { config } from "dotenv";
import { describe, it, expect, beforeAll, afterEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAuthenticatedClient, createAdminClient } from "../helpers/supabase";
import { TEST_USER_A, ensureTestUsers, createTestSession, cleanupUserData } from "../helpers/setup";
import { upsertCheckin, getCheckinBySession } from "@/lib/services/checkin";
import { upsertPlan, getPlanBySession } from "@/lib/services/plan";
import { createTrade, getTradesBySession } from "@/lib/services/trades";
import { upsertReview, getReviewBySession, completeSession } from "@/lib/services/review";
import type { CheckInFormData, PlanFormData, TradeFormData, ReviewFormData } from "@/types";

config({ path: ".env.test" });

let clientA: SupabaseClient;
let adminClient: SupabaseClient;
let userAId: string;

describe("Risk #3: Data persistence", () => {
  beforeAll(async () => {
    await ensureTestUsers();
    clientA = await createAuthenticatedClient(TEST_USER_A.email, TEST_USER_A.password);
    adminClient = createAdminClient();
    const {
      data: { user },
    } = await clientA.auth.getUser();
    if (!user) throw new Error("Failed to resolve test user A");
    userAId = user.id;
  });

  afterEach(async () => {
    await cleanupUserData(adminClient, userAId);
  });

  it("check-in persists after upsert", async () => {
    const session = await createTestSession(clientA, userAId, "2020-01-01");
    const formData: CheckInFormData = {
      sleep: 7,
      energy: 8,
      stress: 3,
      focus: 9,
      emotion: "confident",
      market_bias: "bullish",
      risk_mode: "normal",
    };
    const readinessScore = 82;

    await upsertCheckin(clientA, session.id, userAId, formData, readinessScore);

    const saved = await getCheckinBySession(clientA, session.id);
    expect(saved).not.toBeNull();
    expect(saved?.sleep).toBe(7);
    expect(saved?.energy).toBe(8);
    expect(saved?.stress).toBe(3);
    expect(saved?.focus).toBe(9);
    expect(saved?.emotion).toBe("confident");
    expect(saved?.market_bias).toBe("bullish");
    expect(saved?.risk_mode).toBe("normal");
    expect(saved?.readiness_score).toBe(82);
  });

  it("plan persists after upsert", async () => {
    const session = await createTestSession(clientA, userAId, "2020-01-02");
    const formData: PlanFormData = {
      goal: "Follow the plan",
      max_trades: 3,
      max_daily_loss_r: 2.5,
    };

    await upsertPlan(clientA, session.id, userAId, formData);

    const saved = await getPlanBySession(clientA, session.id);
    expect(saved).not.toBeNull();
    expect(saved?.goal).toBe("Follow the plan");
    expect(saved?.max_trades).toBe(3);
    expect(saved?.max_daily_loss_r).toBe(2.5);
  });

  it("trade persists after insert", async () => {
    const session = await createTestSession(clientA, userAId, "2020-01-03");
    const formData: TradeFormData = {
      instrument: "EURUSD",
      setup_name: "Breakout",
      result_r: 1.5,
      plan_compliance: "yes",
      main_mistake: "No mistake",
    };

    await createTrade(clientA, session.id, userAId, formData);

    const trades = await getTradesBySession(clientA, session.id);
    expect(trades).toHaveLength(1);
    expect(trades[0].instrument).toBe("EURUSD");
    expect(trades[0].setup_name).toBe("Breakout");
    expect(trades[0].result_r).toBe(1.5);
    expect(trades[0].plan_compliance).toBe("yes");
    expect(trades[0].main_mistake).toBe("No mistake");
  });

  it("review persists and session completes", async () => {
    const session = await createTestSession(clientA, userAId, "2020-01-04");
    const formData: ReviewFormData = {
      plan_adherence: "yes",
      what_went_wrong: "Nothing major",
      rule_broken: false,
      goal_next_session: "Keep following the plan",
    };
    const processScore = 90;

    await upsertReview(clientA, session.id, userAId, formData, processScore);
    await completeSession(clientA, session.id, userAId);

    const review = await getReviewBySession(clientA, session.id);
    expect(review).not.toBeNull();
    expect(review?.plan_adherence).toBe("yes");
    expect(review?.what_went_wrong).toBe("Nothing major");
    expect(review?.rule_broken).toBe(false);
    expect(review?.goal_next_session).toBe("Keep following the plan");
    expect(review?.process_score).toBe(90);

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const { data: updated } = await clientA.from("sessions").select().eq("id", session.id).single();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect(updated.status).toBe("complete");
  });

  it("completeSession throws on non-existent session", async () => {
    const fakeId = "00000000-0000-0000-0000-000000000000";
    await expect(completeSession(clientA, fakeId, userAId)).rejects.toThrow();
  });

  it("upsert is idempotent — second call overwrites, no duplicate", async () => {
    const session = await createTestSession(clientA, userAId, "2020-01-05");
    const first: CheckInFormData = {
      sleep: 5,
      energy: 5,
      stress: 5,
      focus: 5,
      emotion: "calm",
      market_bias: "neutral",
      risk_mode: "normal",
    };
    const second: CheckInFormData = {
      sleep: 9,
      energy: 9,
      stress: 1,
      focus: 10,
      emotion: "excited",
      market_bias: "bullish",
      risk_mode: "normal",
    };

    await upsertCheckin(clientA, session.id, userAId, first, 50);
    await upsertCheckin(clientA, session.id, userAId, second, 95);

    const { data: rows } = await clientA.from("check_ins").select().eq("session_id", session.id);
    expect(rows).toHaveLength(1);

    const saved = await getCheckinBySession(clientA, session.id);
    expect(saved?.sleep).toBe(9);
    expect(saved?.readiness_score).toBe(95);
    expect(saved?.emotion).toBe("excited");
  });
});
