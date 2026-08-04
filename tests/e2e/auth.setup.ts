// auth.setup.ts — setup project: signs in once via the auth API and saves the
// session cookies to playwright/.auth/user.json. Every spec project depends on
// this and starts with storageState, so tests skip the sign-in form entirely.
//
// API login (not the UI form) on purpose: the sign-in form is a React island,
// and filling it before hydration completes races against React state — the
// submit then sees empty fields. The API path is deterministic and faster;
// UI sign-in itself is not a risk under test here.

import { test as setup, expect } from "@playwright/test";

const TEST_USER = { email: process.env.TEST_USER_EMAIL ?? "", password: process.env.TEST_USER_PASSWORD ?? "" };

setup("authenticate", async ({ request, baseURL }) => {
  // Astro's CSRF check (security.checkOrigin) 403s form POSTs without a
  // same-origin Origin header, so send it explicitly.
  const res = await request.post("/api/auth/signin", {
    form: TEST_USER,
    headers: { origin: baseURL ?? "" },
  });

  // On bad credentials the endpoint 302s back to /auth/signin?error=… with a
  // 200 final status — assert the redirect target, not just res.ok().
  expect(res.ok()).toBeTruthy();
  expect(new URL(res.url()).pathname).toBe("/");

  await request.storageState({ path: "playwright/.auth/user.json" });
});
