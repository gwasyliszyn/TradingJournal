// seed.spec.ts — E2E convention exemplar. Every generated test models this file.
// Risk: #6 — Dashboard shows wrong session status (context/foundation/test-plan.md)
//
// Four conventions demonstrated:
//   1. getByRole / getByLabel as default locators — no CSS selectors, no XPath
//   2. waitForURL / waitForResponse / toBeVisible — never waitForTimeout
//   3. beforeEach + afterEach for date-based isolation (teardown-before-setup pattern)
//   4. Test name bound to a risk from test-plan.md, not to the implementation

import { test, expect } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const TEST_USER = { email: process.env.TEST_USER_EMAIL ?? "", password: process.env.TEST_USER_PASSWORD ?? "" };

// Untyped schema, same as the service layer (see src/lib/services/checkin.ts).
let db: SupabaseClient;
let userId: string;

// Cleanup runs as the signed-in test user — the "Users can delete own check_ins"
// RLS policy covers it, so no service-role key is needed.
async function clearTodayCheckIn() {
  const today = new Date().toISOString().split("T")[0];
  const { data: session } = await db
    .from("sessions")
    .select("id")
    .eq("user_id", userId)
    .eq("session_date", today)
    .maybeSingle();
  if (session) {
    await db.from("check_ins").delete().eq("session_id", session.id);
  }
}

test.beforeAll(async () => {
  // Sign in once to avoid repeated roundtrips per test.
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  db = createClient(process.env.SUPABASE_URL ?? "", process.env.SUPABASE_ANON_KEY ?? "");
  const { data, error } = await db.auth.signInWithPassword(TEST_USER);
  if (error ?? !data.user) throw new Error(`Test user setup failed: ${error?.message}`);
  userId = data.user.id;
});

test.beforeEach(async () => {
  // Teardown-before-setup: clear stale data from a previous crashed run so each
  // test starts from a known state regardless of prior failures.
  await clearTodayCheckIn();
});

test.afterEach(async () => {
  await clearTodayCheckIn();
});

test("dashboard marks Pre-market Check-in complete after check-in submitted — Risk #6", async ({ page }) => {
  // Session comes from storageState (playwright/.auth/user.json) written by the
  // auth.setup.ts project — no UI sign-in step needed.

  // Step 1: confirm starting state — check-in is pending, next step is Check-in.
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Next: Check-in" })).toBeVisible();

  // Step 2: complete the check-in form via the dashboard CTA.
  await page.getByRole("link", { name: "Start Check-in" }).click();
  await page.waitForURL("/checkin");

  // Physical State — each RatingGroup renders a role="group" wrapping numbered buttons.
  // Hydration barrier: CheckinForm is a React island and clicks before hydration
  // are silently lost. Re-click the first rating until React acknowledges it via
  // aria-pressed; after that the island is interactive and plain clicks are safe.
  const sleepFour = page.getByRole("group", { name: "Sleep quality" }).getByRole("button", { name: "4" });
  await expect(async () => {
    await sleepFour.click();
    await expect(sleepFour).toHaveAttribute("aria-pressed", "true", { timeout: 1000 });
  }).toPass();
  await page.getByRole("group", { name: "Energy level" }).getByRole("button", { name: "3" }).click();
  await page.getByRole("group", { name: "Stress level" }).getByRole("button", { name: "2" }).click();
  await page.getByRole("group", { name: "Focus" }).getByRole("button", { name: "4" }).click();
  await page.getByRole("button", { name: "Next" }).click();

  // Mental State — OptionSelector also renders role="group" with capitalized option buttons.
  await page.getByRole("group", { name: "Current emotion" }).getByRole("button", { name: "Calm" }).click();
  await page.getByRole("group", { name: "Market bias" }).getByRole("button", { name: "Bullish" }).click();
  await page.getByRole("group", { name: "Risk mode" }).getByRole("button", { name: "Normal" }).click();

  // Capture the response promise before clicking — avoids a missed-event race condition.
  const checkinResponse = page.waitForResponse("**/api/checkin");
  await page.getByRole("button", { name: "Submit" }).click();
  await checkinResponse;

  // Result screen confirms the write landed before we assert the dashboard.
  // CardTitle renders as <div>, not a heading — assert the Edit button from ScoreDisplay instead.
  await expect(page.getByRole("button", { name: "Edit check-in" })).toBeVisible();

  // Step 3: assert the risk — dashboard must advance its next-step to Plan.
  // This test fails if Risk #6 materializes: aggregation query returns wrong completion state.
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Next: Plan" })).toBeVisible();
});
