"use client";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import {
  Wallet,
  Download,
  ShieldCheck,
  ArrowUpRight,
  LockKeyhole,
} from "lucide-react";
import { Heading, Field, Note, Empty, SectionTitle } from "./shared";
import { useStudio, api } from "./studio-context";
import { Button } from "./ui/button";
import { usd, myr } from "@/lib/utils";
export function BudgetPage() {
  const { data, report, refresh, notify } = useStudio();
  const params = useSearchParams();
  const [client, setClient] = useState(params.get("client") || "global");
  const selected = data.budgets.find(
    (b) => b.client_id === (client === "global" ? null : client),
  );
  const [limit, setLimit] = useState("");
  const [hard, setHard] = useState(true);
  const [busy, setBusy] = useState(false);
  const b = report.budgets.find((b) => b.client_id === null);
  const spent = Number(b?.spent || 0),
    reserved = Number(b?.reserved || 0),
    available = Number(b?.limit || 0) - spent - reserved;
  const utilization = b?.limit
    ? ((spent + reserved) / Number(b.limit)) * 100
    : 0;
  async function save() {
    setBusy(true);
    try {
      if (limit === "" || !Number.isFinite(Number(limit)))
        throw new Error("Enter a monthly USD limit.");
      await api("/api/manage", {
        action: "budget",
        values: {
          client_id: client === "global" ? null : client,
          limit_micros: Math.round(Number(limit) * 1_000_000),
          hard_stop: hard,
        },
      });
      await refresh();
      notify("Monthly budget updated and audited.");
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  function exportReport() {
    const rows = [
      [
        "Monthly report (UTC billing period)",
        new Date().toISOString().slice(0, 7),
      ],
      ["Client", "Confirmed spend USD"],
      ...report.by_client.map((c) => [
        c.name,
        (Number(c.amount) / 1_000_000).toFixed(6),
      ]),
      ["Global reserved USD", (reserved / 1_000_000).toFixed(6)],
      ["Global available USD", (available / 1_000_000).toFixed(6)],
    ];
    const csv = rows
      .map((row) =>
        row
          .map(
            (cell) =>
              '"' +
              String(cell)
                .replaceAll('"', '""')
                .replace(/^[=+@-]/, "'") +
              '"',
          )
          .join(","),
      )
      .join("\r\n");
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8;" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "nexify-monthly-spending.csv";
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <>
      <Heading
        eyebrow="Budget & spending"
        title="Creative freedom. Financial clarity."
        description="Keep your team’s generation costs visible, reserved, and under control."
      >
        <Button
          variant="outline"
          disabled={!data.configured}
          onClick={exportReport}
        >
          <Download />
          Export monthly report
        </Button>
      </Heading>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          {
            label: "Monthly studio limit",
            value: b ? usd(Number(b.limit)) : "—",
            detail: "Configured hard limit",
            icon: ShieldCheck,
          },
          {
            label: "Confirmed spending",
            value: data.configured ? usd(spent) : "—",
            detail: "Append-only usage ledger",
            icon: Wallet,
          },
          {
            label: "Reserved for jobs",
            value: data.configured ? usd(reserved) : "—",
            detail: "Includes unfinished prior-month jobs",
            icon: LockKeyhole,
          },
          {
            label: "Available to create",
            value: b ? usd(available) : "—",
            detail: b
              ? myr(available, Number(data.settings.usd_myr_rate)) + " display"
              : "Set your budget first",
            icon: ArrowUpRight,
          },
        ].map((s) => (
          <div key={s.label} className="panel p-5">
            <div className="flex justify-between">
              <span className="text-xs text-muted-foreground">{s.label}</span>
              <s.icon size={16} className="text-slate-500" />
            </div>
            <p className="mt-5 text-2xl font-semibold">{s.value}</p>
            <p className="mt-3 text-[10px] leading-5 text-muted-foreground">
              {s.detail}
            </p>
          </div>
        ))}
      </div>
      <section className="panel my-6 p-5">
        <div className="flex justify-between text-xs">
          <span>Monthly utilization including reservations</span>
          <span className="text-orange-300">
            {b ? utilization.toFixed(1) + "%" : "Not configured"}
          </span>
        </div>
        <div className="relative mt-4 h-3 overflow-hidden rounded-full bg-secondary">
          <div
            className="h-full bg-primary"
            style={{ width: `${Math.min(100, utilization)}%` }}
          />
        </div>
        <div className="mt-3 flex justify-between text-[10px] text-muted-foreground">
          <span>0%</span>
          <span>70% warning</span>
          <span>85% warning</span>
          <span>100% hard stop</span>
        </div>
        {utilization >= 70 && (
          <div className="mt-4">
            <Note tone={utilization >= 100 ? "red" : "orange"}>
              Studio spending and reservations have reached{" "}
              {utilization >= 100 ? "100%" : utilization >= 85 ? "85%" : "70%"}{" "}
              of the monthly budget.{" "}
              {utilization >= 100
                ? "Further generation is blocked when the hard limit is enabled."
                : "Review your planned generations."}
            </Note>
          </div>
        )}
      </section>
      <div className="mb-6">
        <Note tone="slate">
          Application budgets cover submissions made through this studio. They
          cannot prevent spending made directly through the external Higgsfield
          account. Unfinished reservations never reset automatically at month
          boundaries.
        </Note>
      </div>
      <div className="grid gap-6 xl:grid-cols-[1.3fr_1fr]">
        <section className="panel">
          <SectionTitle
            title="Client spending"
            detail="Current UTC billing month · confirmed USD charges"
          />
          {report.by_client.length ? (
            <div className="divide-y divide-border">
              {report.by_client.map((c) => {
                const cb = report.budgets.find((b) => b.client_id === c.id);
                return (
                  <div
                    key={c.id}
                    className="flex items-center justify-between p-5"
                  >
                    <div>
                      <p className="text-sm font-medium">{c.name}</p>
                      <p className="mt-2 text-[10px] text-muted-foreground">
                        {cb
                          ? `${usd(Number(cb.reserved))} reserved · ${usd(Number(cb.limit))} client limit`
                          : "Studio budget applies · no client-specific limit"}
                      </p>
                    </div>
                    <span className="text-sm font-semibold">
                      {usd(Number(c.amount))}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <Empty
              title="Your costs, organized by client"
              description="Client spending is aggregated directly from the financial ledger."
              icon={<Wallet size={24} />}
            />
          )}
        </section>
        <section className="panel">
          <SectionTitle
            title="Budget controls"
            detail="Administrator-only settings"
          />
          <div className="space-y-5 p-5">
            {data.profile?.role === "admin" ? (
              <>
                <Field label="Budget scope">
                  <select
                    className="field"
                    value={client}
                    onChange={(e) => {
                      const value = e.target.value;
                      setClient(value);
                      const budget = data.budgets.find(
                        (b) =>
                          b.client_id === (value === "global" ? null : value),
                      );
                      setLimit(
                        budget
                          ? String(budget.monthly_limit_micros / 1_000_000)
                          : "",
                      );
                      setHard(budget?.hard_stop ?? true);
                    }}
                  >
                    <option value="global">Global studio</option>
                    {data.clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field
                  label="Monthly limit (USD)"
                  hint={
                    selected
                      ? `Current limit: ${usd(Number(selected.monthly_limit_micros))}`
                      : "No budget configured for this scope."
                  }
                >
                  <input
                    className="field"
                    type="number"
                    min="0"
                    step="0.01"
                    value={limit}
                    placeholder="Enter monthly limit"
                    onChange={(e) => setLimit(e.target.value)}
                  />
                </Field>
                <label className="flex items-center gap-3 text-xs">
                  <input
                    type="checkbox"
                    checked={hard}
                    onChange={(e) => setHard(e.target.checked)}
                    className="accent-orange-500"
                  />
                  Enforce hard spending limit
                </label>
                {!hard && (
                  <Note tone="red">
                    Administrator override: new jobs may exceed this scope’s
                    monthly limit. Other active hard limits still apply. This
                    change is audited.
                  </Note>
                )}
                <Button
                  className="w-full"
                  disabled={busy || limit === ""}
                  onClick={save}
                >
                  {busy ? "Saving…" : "Save budget settings"}
                </Button>
              </>
            ) : (
              <Empty
                title="Admin access required"
                description="Your administrator can set budgets and review spending overrides."
                icon={<LockKeyhole size={24} />}
              />
            )}
          </div>
        </section>
      </div>
      <section className="panel mt-6">
        <SectionTitle
          title="Usage ledger"
          detail="Most recent 100 immutable financial records"
        />
        {data.ledger.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-border text-muted-foreground">
                <tr>
                  {[
                    "Generation",
                    "Billing period",
                    "Final cost",
                    "Evidence",
                  ].map((h) => (
                    <th key={h} className="p-4 font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.ledger.map((l) => (
                  <tr key={l.generation_id}>
                    <td className="p-4 font-mono">
                      {l.generation_id.slice(0, 8)}
                    </td>
                    <td className="p-4">{l.billing_period}</td>
                    <td className="p-4">{usd(Number(l.amount_micros))}</td>
                    <td className="max-w-lg p-4 text-muted-foreground">
                      {l.evidence}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title="No confirmed charges yet"
            description="Final provider charges are recorded here once supported by billing evidence. Estimated costs stay reserved separately."
          />
        )}
      </section>
    </>
  );
}
