import Link from "next/link";
import {
  getDashboardStats,
  type DashboardCollectorRun,
  type DashboardStats,
} from "@/lib/services/dashboard";
import type { PurchaseOption } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const stats = await getDashboardStats();

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-5 py-7 lg:px-8">
        <header className="flex flex-col gap-4 border-b border-slate-800 pb-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-medium uppercase tracking-wide text-cyan-300">
              Car Collector
            </p>
            <h1 className="mt-2 text-3xl font-semibold text-white">
              Dashboard trendów
            </h1>
            <p className="mt-2 text-sm text-slate-400">
              Aktualizacja: {formatDateTime(stats.generatedAt)}
            </p>
          </div>
          <Link
            className="min-h-12 rounded border border-slate-700 px-4 py-3 text-center text-sm font-semibold leading-tight text-slate-100 transition hover:border-cyan-400 hover:text-cyan-100 sm:self-start lg:self-auto"
            href="/"
          >
            Panel ofert
          </Link>
        </header>

        <Dashboard stats={stats} />
      </div>
    </main>
  );
}

function Dashboard({ stats }: { stats: DashboardStats }) {
  const averagePrices = {
    release: getPurchaseOptionStats(stats, "release")?.averagePrice,
    sale: getPurchaseOptionStats(stats, "sale")?.averagePrice,
    newRelease: getPurchaseOptionStats(stats, "newRelease")?.averagePrice,
  };

  return (
    <section>
      {stats.lastRun && (
        <div className="mb-4 rounded border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-300">
          <span className="text-slate-500">Ostatni run</span>{" "}
          <span className="font-semibold text-white">
            {formatCollectorPurchaseOption(stats.lastRun.purchaseOption)}
          </span>{" "}
          <span className={getRunStatusClassName(stats.lastRun.status)}>
            {formatRunStatus(stats.lastRun.status)}
          </span>
          <span className="ml-2 text-slate-500">
            {formatDateTime(stats.lastRun.finishedAt)}
          </span>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Oferty" value={formatNumber(stats.totals.offers)} />
        <MetricCard
          label="Nowe dzisiaj"
          value={formatNumber(stats.totals.newToday)}
        />
        <MetricCard
          label={`Nowe ${stats.periodDays} dni`}
          value={formatNumber(stats.totals.newInPeriod)}
        />
        <MetricCard
          label="Spadki cen"
          tone={stats.totals.priceDrops > 0 ? "positive" : "neutral"}
          value={formatNumber(stats.totals.priceDrops)}
        />
        <MetricCard
          label="Śr. najem używane"
          value={formatPrice(averagePrices.release)}
        />
        <MetricCard
          label="Śr. zakup używane"
          value={formatPrice(averagePrices.sale)}
        />
        <MetricCard
          label="Śr. najem nowe"
          value={formatPrice(averagePrices.newRelease)}
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_1.2fr_1.2fr]">
        <div className="rounded border border-slate-800 bg-slate-900 p-4">
          <h2 className="text-sm font-semibold text-white">Typy ofert</h2>
          <div className="mt-3 grid gap-3">
            {stats.byPurchaseOption.map((item) => (
              <div
                className="grid grid-cols-[1fr_auto] gap-3 border-t border-slate-800 pt-3 first:border-t-0 first:pt-0"
                key={item.purchaseOption}
              >
                <div>
                  <p className="text-sm font-semibold text-slate-100">
                    {getPurchaseOptionLabel(item.purchaseOption)}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {formatNumber(item.newInPeriod)} nowych / {stats.periodDays} dni
                  </p>
                </div>
                <div className="text-right text-sm">
                  <p className="font-semibold text-white">
                    {formatNumber(item.offers)}
                  </p>
                  <p className="mt-1 text-xs text-emerald-200">
                    {formatNumber(item.priceDrops)} spadków
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded border border-slate-800 bg-slate-900 p-4">
          <h2 className="text-sm font-semibold text-white">Największe obniżki</h2>
          <div className="mt-3 grid gap-3">
            {stats.largestDrops.length > 0 ? (
              stats.largestDrops.map((drop) => (
                <div
                  className="grid gap-2 border-t border-slate-800 pt-3 first:border-t-0 first:pt-0 sm:grid-cols-[1fr_auto]"
                  key={drop.id}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-100">
                      {drop.brand} {drop.model}
                    </p>
                    <p className="mt-1 truncate text-xs text-slate-500">
                      {getPurchaseOptionLabel(drop.purchaseOption)} / ID{" "}
                      {drop.externalId}
                    </p>
                  </div>
                  <div className="text-sm sm:text-right">
                    <p className="font-semibold text-emerald-200">
                      {formatSignedPrice(drop.amount)}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {formatPrice(drop.previousPrice)} →{" "}
                      {formatPrice(drop.currentPrice)}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-500">Brak spadków cen.</p>
            )}
          </div>
        </div>

        <div className="rounded border border-slate-800 bg-slate-900 p-4">
          <h2 className="text-sm font-semibold text-white">Średnia cena</h2>
          <div className="mt-3 grid gap-3">
            {stats.averagePrices.map((item) => (
              <div
                className="grid grid-cols-[1fr_auto] gap-3 border-t border-slate-800 pt-3 first:border-t-0 first:pt-0"
                key={`${item.purchaseOption}-${item.brand}-${item.model}`}
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-100">
                    {item.brand} {item.model}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {getPurchaseOptionLabel(item.purchaseOption)} /{" "}
                    {formatNumber(item.count)} szt.
                  </p>
                </div>
                <p className="text-right text-sm font-semibold text-white">
                  {formatPrice(item.averagePrice)}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function MetricCard({
  label,
  tone = "neutral",
  value,
}: {
  label: string;
  tone?: "neutral" | "positive";
  value: string;
}) {
  return (
    <div className="rounded border border-slate-800 bg-slate-900 p-4">
      <p className="text-xs font-semibold uppercase text-slate-500">{label}</p>
      <p
        className={`mt-2 text-2xl font-semibold ${
          tone === "positive" ? "text-emerald-200" : "text-white"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function getPurchaseOptionStats(
  stats: DashboardStats,
  purchaseOption: PurchaseOption,
) {
  return stats.byPurchaseOption.find(
    (item) => item.purchaseOption === purchaseOption,
  );
}

function formatPrice(value?: number) {
  if (!value) return "-";
  return new Intl.NumberFormat("pl-PL", {
    maximumFractionDigits: 0,
    style: "currency",
    currency: "PLN",
  }).format(value);
}

function formatSignedPrice(value: number) {
  const formatted = formatPrice(Math.abs(value));
  if (value === 0) return formatted;
  return `${value > 0 ? "+" : "-"}${formatted}`;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("pl-PL").format(value);
}

function formatCollectorPurchaseOption(purchaseOption: PurchaseOption | "all") {
  return purchaseOption === "all"
    ? "Wszystkie"
    : getPurchaseOptionLabel(purchaseOption);
}

function formatRunStatus(status: DashboardCollectorRun["status"]) {
  if (status === "error") return "Błąd";
  if (status === "inferred") return "Z danych";
  return "OK";
}

function getRunStatusClassName(status: DashboardCollectorRun["status"]) {
  if (status === "error") return "ml-2 font-semibold text-red-200";
  if (status === "inferred") return "ml-2 font-semibold text-amber-200";
  return "ml-2 font-semibold text-emerald-200";
}

function getPurchaseOptionLabel(purchaseOption: PurchaseOption) {
  if (purchaseOption === "sale") return "Zakup używane";
  if (purchaseOption === "newRelease") return "Najem nowe";
  return "Najem używane";
}

function formatDateTime(value?: string) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("pl-PL", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}
