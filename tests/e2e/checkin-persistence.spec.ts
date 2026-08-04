// checkin-persistence.spec.ts
// Risk: #3 — Session data loss on form submission (context/foundation/test-plan.md)
// What would prove protection: after submitting the check-in form, data is retrievable —
//   on return visit the SSR page passes existingCheckin to CheckinForm, which starts
//   in the result section (Edit check-in visible, Sleep quality group hidden).
// Seed: tests/e2e/seed.spec.ts

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
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  db = createClient(process.env.SUPABASE_URL ?? "", process.env.SUPABASE_ANON_KEY ?? "");
  const { data, error } = await db.auth.signInWithPassword(TEST_USER);
  if (error ?? !data.user) throw new Error(`Test user setup failed: ${error?.message}`);
  userId = data.user.id;
});

test.beforeEach(async () => {
  // Teardown-before-setup: clear stale data from a previous crashed run.
  await clearTodayCheckIn();
});

test.afterEach(async () => {
  await clearTodayCheckIn();
});

test("check-in data survives page reload — Risk #3", async ({ page }) => {
  // Session comes from storageState (playwright/.auth/user.json) written by the
  // auth.setup.ts project — no UI sign-in step needed.

  // Step 1: navigate to check-in — confirm empty starting state (no existing data).
  // CheckinForm initialises section="physical" when existingCheckin is null.
  await page.goto("/checkin");
  await expect(page.getByRole("group", { name: "Sleep quality" })).toBeVisible();

  // Step 2: complete Physical State section.
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

  // Step 3: complete Mental State section and submit.
  await page.getByRole("group", { name: "Current emotion" }).getByRole("button", { name: "Calm" }).click();
  await page.getByRole("group", { name: "Market bias" }).getByRole("button", { name: "Bullish" }).click();
  await page.getByRole("group", { name: "Risk mode" }).getByRole("button", { name: "Normal" }).click();

  // Capture response promise before clicking — avoids a missed-event race condition.
  const checkinResponse = page.waitForResponse("**/api/checkin");
  await page.getByRole("button", { name: "Submit" }).click();
  await checkinResponse;

  // Immediate confirmation: ScoreDisplay rendered (handleSubmit succeeded, section → "result").
  await expect(page.getByRole("button", { name: "Edit check-in" })).toBeVisible();

  // Step 4: navigate away, then return to /checkin via a full SSR page load.
  await page.goto("/dashboard");
  await page.goto("/checkin");

  // Step 5: assert persistence — SSR passes existingCheckin to CheckinForm,
  // which initialises section="result" when data is present.
  //
  // Deliberate-break proof: if /api/checkin returned 200 but skipped the DB insert,
  // getTodayCheckin() would return null on reload → CheckinForm starts at section="physical"
  // → Edit check-in hidden, Sleep quality group visible → both assertions below fail.
  await expect(page.getByRole("button", { name: "Edit check-in" })).toBeVisible();
  await expect(page.getByRole("group", { name: "Sleep quality" })).not.toBeVisible();
});
