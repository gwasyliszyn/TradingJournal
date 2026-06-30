import { config } from "dotenv";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAuthenticatedClient, createAdminClient } from "../helpers/supabase";
import { TEST_USER_A, TEST_USER_B, ensureTestUsers, createTestSession, cleanupUserData } from "../helpers/setup";
import { upsertCheckin, getCheckinBySession } from "@/lib/services/checkin";
import { upsertPlan, getPlanBySession } from "@/lib/services/plan";
import { createTrade, getTradesBySession, updateTrade, deleteTrade } from "@/lib/services/trades";
import { upsertReview, getReviewBySession, completeSession } from "@/lib/services/review";

config({ path: ".env.test" });

let clientA: SupabaseClient;
let clientB: SupabaseClient;
let adminClient: SupabaseClient;
let userAId: string;
let userBId: string;
let sessionAId: string;
let tradeAId: string;

describe("Risk #5: Access control (IDOR)", () => {
  beforeAll(async () => {
    await ensureTestUsers();
    clientA = await createAuthenticatedClient(TEST_USER_A.email, TEST_USER_A.password);
    clientB = await createAuthenticatedClient(TEST_USER_B.email, TEST_USER_B.password);
    adminClient = createAdminClient();

    const {
      data: { user: userA },
    } = await clientA.auth.getUser();
    if (!userA) throw new Error("Failed to resolve test user A");
    userAId = userA.id;

    const {
      data: { user: userB },
    } = await clientB.auth.getUser();
    if (!userB) throw new Error("Failed to resolve test user B");
    userBId = userB.id;

    const session = await createTestSession(clientA, userAId, "2020-06-01");
    sessionAId = session.id;

    await upsertCheckin(
      clientA,
      sessionAId,
      userAId,
      {
        sleep: 7,
        energy: 8,
        stress: 3,
        focus: 9,
        emotion: "confident",
        market_bias: "bullish",
        risk_mode: "normal",
      },
      82,
    );

    await upsertPlan(clientA, sessionAId, userAId, {
      goal: "Follow the plan",
      max_trades: 3,
      max_daily_loss_r: 2.0,
    });

    const trade = await createTrade(clientA, sessionAId, userAId, {
      instrument: "EURUSD",
      setup_name: "Breakout",
      result_r: 1.5,
      plan_compliance: "yes",
      main_mistake: "No mistake",
    });
    tradeAId = trade.id;

    await upsertReview(
      clientA,
      sessionAId,
      userAId,
      {
        plan_adherence: "yes",
        what_went_wrong: "Nothing",
        rule_broken: false,
        goal_next_session: "Stay disciplined",
      },
      90,
    );
  });

  afterAll(async () => {
    await cleanupUserData(adminClient, userAId);
    await cleanupUserData(adminClient, userBId);
  });

  it("User B cannot read User A's sessions", async () => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const { data: ownerResult } = await clientA.from("sessions").select().eq("id", sessionAId).single();
    expect(ownerResult).not.toBeNull();

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const { data: intruderResult } = await clientB.from("sessions").select().eq("id", sessionAId).maybeSingle();
    expect(intruderResult).toBeNull();
  });

  it("User B cannot read User A's check-in", async () => {
    const ownerCheckin = await getCheckinBySession(clientA, sessionAId);
    expect(ownerCheckin).not.toBeNull();

    const intruderCheckin = await getCheckinBySession(clientB, sessionAId);
    expect(intruderCheckin).toBeNull();
  });

  it("User B cannot read User A's plan, trades, or review", async () => {
    const ownerPlan = await getPlanBySession(clientA, sessionAId);
    expect(ownerPlan).not.toBeNull();
    const intruderPlan = await getPlanBySession(clientB, sessionAId);
    expect(intruderPlan).toBeNull();

    const ownerTrades = await getTradesBySession(clientA, sessionAId);
    expect(ownerTrades.length).toBeGreaterThan(0);
    const intruderTrades = await getTradesBySession(clientB, sessionAId);
    expect(intruderTrades).toHaveLength(0);

    const ownerReview = await getReviewBySession(clientA, sessionAId);
    expect(ownerReview).not.toBeNull();
    const intruderReview = await getReviewBySession(clientB, sessionAId);
    expect(intruderReview).toBeNull();
  });

  it("User B cannot update User A's trade", async () => {
    await expect(
      updateTrade(clientB, tradeAId, userBId, {
        instrument: "GBPUSD",
        setup_name: "Fake",
        result_r: -5,
        plan_compliance: "no",
        main_mistake: "Hacked",
      }),
    ).rejects.toThrow();

    const trades = await getTradesBySession(clientA, sessionAId);
    const original = trades.find((t) => t.id === tradeAId);
    expect(original?.instrument).toBe("EURUSD");
  });

  it("User B cannot delete User A's trade", async () => {
    await expect(deleteTrade(clientB, tradeAId, userBId)).rejects.toThrow();

    const trades = await getTradesBySession(clientA, sessionAId);
    expect(trades.some((t) => t.id === tradeAId)).toBe(true);
  });

  it("User B cannot complete User A's session", async () => {
    await expect(completeSession(clientB, sessionAId, userBId)).rejects.toThrow();

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const { data } = await clientA.from("sessions").select().eq("id", sessionAId).single();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect(data.status).toBe("active");
  });
});
