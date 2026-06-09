import type { SupabaseClient } from "@supabase/supabase-js";
import type { Session, Trade, TradeFormData } from "@/types";

export async function getTradesBySession(supabase: SupabaseClient, sessionId: string): Promise<Trade[]> {
  const { data, error } = await supabase
    .from("trades")
    .select()
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data as Trade[];
}

export async function createTrade(
  supabase: SupabaseClient,
  sessionId: string,
  userId: string,
  data: TradeFormData,
): Promise<Trade> {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const { data: trade, error } = await supabase
    .from("trades")
    .insert({
      session_id: sessionId,
      user_id: userId,
      ...data,
    })
    .select()
    .single();

  if (error) throw error;
  return trade as Trade;
}

export async function updateTrade(
  supabase: SupabaseClient,
  tradeId: string,
  userId: string,
  data: TradeFormData,
): Promise<Trade> {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const { data: trade, error } = await supabase
    .from("trades")
    .update({ ...data })
    .eq("id", tradeId)
    .eq("user_id", userId)
    .select()
    .single();

  if (error) throw error;
  return trade as Trade;
}

export async function deleteTrade(supabase: SupabaseClient, tradeId: string, userId: string): Promise<void> {
  const { error } = await supabase.from("trades").delete().eq("id", tradeId).eq("user_id", userId);

  if (error) throw error;
}

export async function getTodayTrades(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ session: Session; trades: Trade[] } | null> {
  const today = new Date().toISOString().split("T")[0];

  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const { data: session, error } = await supabase
    .from("sessions")
    .select()
    .eq("user_id", userId)
    .eq("session_date", today)
    .maybeSingle();

  if (error) throw error;
  if (!session) return null;

  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
  const trades = await getTradesBySession(supabase, session.id);
  return { session: session as Session, trades };
}
