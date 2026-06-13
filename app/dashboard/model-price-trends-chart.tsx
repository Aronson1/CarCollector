"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Title,
  Tooltip,
} from "chart.js";
import { Line } from "react-chartjs-2";
import type { DashboardModelPriceTrend } from "@/lib/services/dashboard";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
);

export default function ModelPriceTrendsChart({
  trendDays,
  trends,
}: {
  trendDays: number;
  trends: DashboardModelPriceTrend[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selectedKey, setSelectedKey] = useState(trends[0]?.key || "");
  const [trendDaysInput, setTrendDaysInput] = useState(String(trendDays));
  const selectedTrend =
    trends.find((trend) => trend.key === selectedKey) || trends[0];
  const chartData = useMemo(() => {
    const points = selectedTrend?.points || [];

    return {
      labels: points.map((point) => formatShortDate(point.date)),
      datasets: [
        {
          label: selectedTrend?.label || "Średnia cena",
          data: points.map((point) => point.averagePrice),
          borderColor: "rgb(34, 211, 238)",
          backgroundColor: "rgba(34, 211, 238, 0.18)",
          pointBackgroundColor: "rgb(34, 211, 238)",
          pointBorderColor: "#0f172a",
          pointRadius: 3,
          pointHoverRadius: 5,
          tension: 0.28,
        },
      ],
    };
  }, [selectedTrend]);

  function applyTrendDays(nextValue = trendDaysInput) {
    const nextTrendDays = Number(nextValue);

    if (!Number.isInteger(nextTrendDays)) {
      setTrendDaysInput(String(trendDays));
      return;
    }

    const clampedTrendDays = Math.min(Math.max(nextTrendDays, 7), 365);
    const params = new URLSearchParams(searchParams.toString());

    if (clampedTrendDays === 90) {
      params.delete("trendDays");
    } else {
      params.set("trendDays", String(clampedTrendDays));
    }

    setTrendDaysInput(String(clampedTrendDays));
    router.replace(params.size > 0 ? `/dashboard?${params.toString()}` : "/dashboard");
  }

  const latestPoint = selectedTrend?.points.at(-1);

  return (
    <div className="rounded border border-slate-800 bg-slate-900 p-4">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-white">
            Trend średniej ceny modelu
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Średnia cena z zapisanych pomiarów dla marki, modelu i typu oferty.
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-[1fr_auto] xl:min-w-[34rem]">
          {trends.length > 0 && (
            <label className="grid gap-1 text-xs font-semibold text-slate-500">
              Model
              <select
                className="h-10 rounded border border-slate-700 bg-slate-950 px-3 text-sm font-medium text-slate-100 outline-none transition focus:border-cyan-400"
                onChange={(event) => setSelectedKey(event.target.value)}
                value={selectedTrend?.key || ""}
              >
                {trends.map((trend) => (
                  <option key={trend.key} value={trend.key}>
                    {trend.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="grid gap-1 text-xs font-semibold text-slate-500">
            Ostatnie dni
            <input
              className="h-10 w-full rounded border border-slate-700 bg-slate-950 px-3 text-sm font-medium text-slate-100 outline-none transition focus:border-cyan-400 md:w-28"
              inputMode="numeric"
              max={365}
              min={7}
              onBlur={() => applyTrendDays()}
              onChange={(event) => setTrendDaysInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.currentTarget.blur();
                }
              }}
              type="number"
              value={trendDaysInput}
            />
          </label>
        </div>
      </div>

      {trends.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">
          Brak wystarczającej historii cen dla modeli.
        </p>
      ) : (
        <>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <TrendMetric
          label="Ostatnia średnia"
          value={formatPrice(latestPoint?.averagePrice)}
        />
        <TrendMetric
          label="Pomiary"
          value={formatNumber(selectedTrend?.observations || 0)}
        />
        <TrendMetric
          label="Punkty trendu"
          value={formatNumber(selectedTrend?.points.length || 0)}
        />
      </div>

      <div className="mt-4 h-80 w-full">
        <Line
          data={chartData}
          options={{
            maintainAspectRatio: false,
            responsive: true,
            interaction: {
              intersect: false,
              mode: "index",
            },
            plugins: {
              legend: { labels: { color: "#cbd5e1" } },
              title: { display: false },
              tooltip: {
                callbacks: {
                  afterLabel(context) {
                    const point = selectedTrend?.points[context.dataIndex];
                    return point
                      ? `${formatNumber(point.count)} pomiarów w dniu`
                      : "";
                  },
                  label(context) {
                    return `Średnia: ${formatPrice(Number(context.raw))}`;
                  },
                },
              },
            },
            scales: {
              x: {
                grid: { color: "rgba(51, 65, 85, 0.45)" },
                ticks: { color: "#94a3b8", maxRotation: 0 },
              },
              y: {
                grid: { color: "rgba(51, 65, 85, 0.45)" },
                ticks: {
                  callback(value) {
                    return formatCompactPrice(Number(value));
                  },
                  color: "#94a3b8",
                },
              },
            },
          }}
        />
      </div>
        </>
      )}
    </div>
  );
}

function TrendMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-slate-800 bg-slate-950 px-3 py-2">
      <p className="text-xs font-semibold uppercase text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-100">{value}</p>
    </div>
  );
}

function formatPrice(value?: number) {
  if (!value) return "-";
  return new Intl.NumberFormat("pl-PL", {
    currency: "PLN",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(value);
}

function formatCompactPrice(value: number) {
  if (!Number.isFinite(value)) return "";
  return new Intl.NumberFormat("pl-PL", {
    maximumFractionDigits: 0,
    notation: "compact",
    style: "currency",
    currency: "PLN",
  }).format(value);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("pl-PL").format(value);
}

function formatShortDate(value: string) {
  return new Intl.DateTimeFormat("pl-PL", {
    day: "2-digit",
    month: "2-digit",
  }).format(new Date(value));
}
