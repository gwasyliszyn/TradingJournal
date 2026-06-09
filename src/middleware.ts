import { defineMiddleware } from "astro:middleware";
import { createClient } from "@/lib/supabase";

const PROTECTED_ROUTES = ["/dashboard", "/checkin", "/api"];
const PUBLIC_API_ROUTES = ["/api/auth"];

export const onRequest = defineMiddleware(async (context, next) => {
  const supabase = createClient(context.request.headers, context.cookies);

  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    context.locals.user = user ?? null;
  } else {
    context.locals.user = null;
  }

  if (
    PROTECTED_ROUTES.some((route) => context.url.pathname.startsWith(route)) &&
    !PUBLIC_API_ROUTES.some((route) => context.url.pathname.startsWith(route))
  ) {
    if (!context.locals.user) {
      return context.redirect("/auth/signin");
    }
  }

  return next();
});
