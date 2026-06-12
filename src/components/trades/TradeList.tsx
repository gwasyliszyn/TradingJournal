import type { Trade } from "@/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface TradeListProps {
  trades: Trade[];
  onEdit: (trade: Trade) => void;
  onDelete: (tradeId: string) => void;
}

const complianceLabels: Record<string, string> = {
  yes: "Yes",
  no: "No",
  partial: "Partial",
};

export function TradeList({ trades, onEdit, onDelete }: TradeListProps) {
  if (trades.length === 0) {
    return <p className="text-muted-foreground py-8 text-center">No trades yet</p>;
  }

  return (
    <div className="space-y-3">
      {trades.map((trade) => {
        const resultPositive = trade.result_r >= 0;
        return (
          <div key={trade.id} className="bg-card rounded-xl border p-4 shadow-sm">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{trade.instrument}</span>
                  <span className="text-muted-foreground text-sm">{trade.setup_name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-medium ${resultPositive ? "text-green-600" : "text-red-600"}`}>
                    {resultPositive ? "+" : ""}
                    {trade.result_r.toFixed(2)} R
                  </span>
                  <Badge variant="outline">{complianceLabels[trade.plan_compliance] ?? trade.plan_compliance}</Badge>
                </div>
                {trade.main_mistake !== "No mistake" && (
                  <p className="text-muted-foreground text-sm">{trade.main_mistake}</p>
                )}
              </div>
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    onEdit(trade);
                  }}
                >
                  Edit
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive"
                  onClick={() => {
                    onDelete(trade.id);
                  }}
                >
                  Delete
                </Button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
