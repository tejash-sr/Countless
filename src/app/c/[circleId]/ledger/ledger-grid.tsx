"use client";

import { AllCommunityModule, ModuleRegistry, themeQuartz, type ColDef, type ICellRendererParams } from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import Link from "next/link";
import { useMemo, useState } from "react";

ModuleRegistry.registerModules([AllCommunityModule]);

export interface LedgerRow {
  date: string;
  bill: string;
  billHref: string;
  movement: "Charge" | "Payout" | "";
  party: string;
  reference: string;
  amount: number;
  status: string;
  agent: string;
}

// The grid wears the Countless ledger look: paper, ink, thin rules, Public Sans.
const countlessTheme = themeQuartz.withParams({
  fontFamily: "var(--font-public-sans), ui-sans-serif, system-ui, sans-serif",
  fontSize: 14,
  foregroundColor: "#1c1a16",
  backgroundColor: "#ffffff",
  headerBackgroundColor: "#f2efe7",
  headerTextColor: "#4a463e",
  headerFontWeight: 600,
  borderColor: "#e4dfd4",
  rowBorder: { color: "#e4dfd4" },
  oddRowBackgroundColor: "#fdfcf9",
  rowHoverColor: "#e9eef9",
  accentColor: "#1f4fa8",
  wrapperBorderRadius: 12,
  rowHeight: 48,
  headerHeight: 44,
});

const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

const tone: Record<string, string> = {
  COMPLETED: "bg-safe-soft text-safe",
  SUCCESS: "bg-safe-soft text-safe",
  PENDING: "bg-warn-soft text-warn",
  PROCESSING: "bg-warn-soft text-warn",
  SIMULATED: "bg-sunk text-ink-2",
  FAILED: "bg-cost-soft text-cost",
  Verified: "bg-safe-soft text-safe",
  "Needs attention": "bg-warn-soft text-warn",
  "Not checked": "bg-sunk text-ink-3",
};
const label: Record<string, string> = { COMPLETED: "Charged", SUCCESS: "Sent", PENDING: "Sent", PROCESSING: "Sent" };

function Badge({ value }: { value: string }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${tone[value] ?? "bg-sunk text-ink-2"}`}>
      {label[value] ?? value}
    </span>
  );
}

export function LedgerGrid({ rows }: { rows: LedgerRow[] }) {
  const [quick, setQuick] = useState("");

  const columns = useMemo<ColDef<LedgerRow>[]>(
    () => [
      {
        field: "date",
        headerName: "Date",
        width: 130,
        valueFormatter: (p) => (p.value ? new Date(p.value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : ""),
      },
      {
        field: "bill",
        headerName: "Bill",
        flex: 1.3,
        minWidth: 170,
        cellRenderer: (p: ICellRendererParams<LedgerRow>) =>
          p.data?.billHref ? (
            <Link href={p.data.billHref} className="text-action underline-offset-2 hover:underline">
              {p.value}
            </Link>
          ) : (
            <span>{p.value}</span>
          ),
      },
      { field: "movement", headerName: "Type", width: 100 },
      { field: "party", headerName: "From / to", flex: 1.2, minWidth: 170 },
      {
        field: "reference",
        headerName: "Reference",
        flex: 1,
        minWidth: 180,
        cellClass: "font-mono text-[13px] text-ink-2",
      },
      {
        field: "amount",
        headerName: "Amount",
        width: 130,
        type: "rightAligned",
        filter: "agNumberColumnFilter",
        cellClass: (p) => `tabular-nums font-semibold ${p.value < 0 ? "text-cost" : "text-safe"}`,
        valueFormatter: (p) => (p.value < 0 ? `−${usd(-p.value)}` : p.value > 0 ? `+${usd(p.value)}` : usd(0)),
      },
      { field: "status", headerName: "PayPal", width: 115, cellRenderer: (p: ICellRendererParams) => <Badge value={p.value} /> },
      { field: "agent", headerName: "Agent check", width: 135, cellRenderer: (p: ICellRendererParams) => <Badge value={p.value} /> },
    ],
    [],
  );

  const net = rows.reduce((t, r) => t + Math.round(r.amount * 100), 0) / 100;

  return (
    <div className="space-y-3">
      <label className="flex max-w-sm flex-col gap-1 text-sm font-medium text-ink-2">
        Search the ledger
        <input
          type="search"
          value={quick}
          onChange={(e) => setQuick(e.target.value)}
          placeholder="Name, vendor, PayPal reference…"
          className="h-11 rounded-lg border border-rule-strong bg-surface px-3 text-base text-ink"
        />
      </label>
      <div style={{ height: Math.min(560, 140 + rows.length * 48) }}>
        <AgGridReact<LedgerRow>
          theme={countlessTheme}
          rowData={rows}
          columnDefs={columns}
          defaultColDef={{ sortable: true, filter: true, resizable: true }}
          quickFilterText={quick}
          pinnedBottomRowData={[
            { date: "", bill: "Net held", billHref: "", movement: "", party: "", reference: "", amount: net, status: "", agent: "" },
          ]}
          getRowStyle={(p) => (p.node.rowPinned ? { fontWeight: 700, background: "#f2efe7" } : undefined)}
          isFullWidthRow={() => false}
          suppressCellFocus={false}
          ensureDomOrder
          animateRows
        />
      </div>
    </div>
  );
}
