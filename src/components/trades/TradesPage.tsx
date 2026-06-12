import { useState } from "react";
import type { Trade } from "@/types";
import { Button } from "@/components/ui/button";
import { TradeList } from "@/components/trades/TradeList";
import { TradeForm } from "@/components/trades/TradeForm";

type Mode = "list" | "adding" | "editing";

interface TradesPageProps {
  initialTrades: Trade[];
  sessionId: string;
}

export default function TradesPage({ initialTrades, sessionId }: TradesPageProps) {
  const [trades, setTrades] = useState<Trade[]>(initialTrades);
  const [mode, setMode] = useState<Mode>("list");
  const [editingTrade, setEditingTrade] = useState<Trade | null>(null);

  function handleAdd(trade: Trade) {
    setTrades((prev) => [...prev, trade]);
    setMode("list");
  }

  function handleEdit(trade: Trade) {
    setTrades((prev) => prev.map((t) => (t.id === trade.id ? trade : t)));
    setEditingTrade(null);
    setMode("list");
  }

  async function handleDelete(tradeId: string) {
    try {
      const res = await fetch(`/api/trades/${tradeId}`, { method: "DELETE" });
      if (res.ok) {
        setTrades((prev) => prev.filter((t) => t.id !== tradeId));
      }
    } catch {
      // Silently fail — trade stays in list
    }
  }

  return (
    <div className="space-y-6">
      <TradeList
        trades={trades}
        onEdit={(trade) => {
          setEditingTrade(trade);
          setMode("editing");
        }}
        onDelete={(id) => void handleDelete(id)}
      />

      {mode === "adding" && (
        <TradeForm
          sessionId={sessionId}
          onSubmit={handleAdd}
          onCancel={() => {
            setMode("list");
          }}
        />
      )}

      {mode === "editing" && editingTrade && (
        <TradeForm
          existingTrade={editingTrade}
          sessionId={sessionId}
          onSubmit={handleEdit}
          onCancel={() => {
            setEditingTrade(null);
            setMode("list");
          }}
        />
      )}

      {mode === "list" && (
        <Button
          className="w-full"
          onClick={() => {
            setMode("adding");
          }}
        >
          Add trade
        </Button>
      )}

      <div className="text-center">
        <a href="/review" className="text-muted-foreground text-sm underline-offset-4 hover:underline">
          Continue to review
        </a>
      </div>
    </div>
  );
}
