"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { DealScoreWeights, PurchaseOption } from "@/lib/types";

type LoadState = "idle" | "loading" | "error";

interface SettingsStatus {
  generatedAt: string;
  database: {
    connected: boolean;
    message: string;
  };
  settings: {
    dealPushThreshold: number;
    dealScoreWeights: DealScoreWeights;
    updatedAt?: string;
  };
  collectors: Array<{
    purchaseOption: PurchaseOption;
    label: string;
    updatedAt?: string;
    status?: "success" | "error";
    fetched?: number;
    snapshotsCreated?: number;
    skippedUnchanged?: number;
  }>;
  saleGallery: {
    updatedAt?: string;
    offersWithGallery: number;
  };
  push: {
    configured: boolean;
    enabled: boolean;
    subscriptionCount: number;
    history: Array<{
      id: string;
      externalId: string;
      fullName: string;
      score?: number;
      notifiedAt: string;
      offerUrl?: string;
    }>;
  };
}

const defaultWeights: DealScoreWeights = {
  price: 0.45,
  power: 0.45,
  year: 0.1,
};

export default function SettingsPage() {
  const [status, setStatus] = useState<SettingsStatus | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [message, setMessage] = useState("");
  const [actionKey, setActionKey] = useState<string | null>(null);
  const [threshold, setThreshold] = useState(60);
  const [weights, setWeights] = useState<DealScoreWeights>(defaultWeights);

  async function loadSettings(clearMessage = false) {
    setLoadState("loading");
    if (clearMessage) {
      setMessage("");
    }

    try {
      const payload = await fetchJson<SettingsStatus>("/api/settings", {
        cache: "no-store",
      });
      setStatus(payload);
      setThreshold(payload.settings.dealPushThreshold);
      setWeights(payload.settings.dealScoreWeights);
      setLoadState("idle");
    } catch (error) {
      console.error(error);
      setMessage(getFriendlyErrorMessage(error, "Nie udało się pobrać ustawień."));
      setLoadState("error");
    }
  }

  async function runCollector(purchaseOption: PurchaseOption) {
    setActionKey(`collector:${purchaseOption}`);
    setMessage("");

    try {
      const payload = await fetchJson<{
        fetched?: number;
        snapshotsCreated?: number;
        skippedUnchanged?: number;
      }>("/api/collector/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ purchaseOption }),
      });
      setMessage(
        `${getPurchaseOptionLabel(purchaseOption)}: pobrano ${
          payload.fetched ?? 0
        }, nowe snapshoty ${payload.snapshotsCreated ?? 0}, bez zmian ${
          payload.skippedUnchanged ?? 0
        }.`,
      );
      await loadSettings();
    } catch (error) {
      console.error(error);
      setMessage(getFriendlyErrorMessage(error, "Nie udało się pobrać ofert."));
    } finally {
      setActionKey(null);
    }
  }

  async function backfillSaleImages() {
    setActionKey("sale-gallery");
    setMessage("");

    try {
      const pageSize = 50;
      let pageNumber = 1;
      let fetched = 0;
      let modified = 0;
      let manyImages = 0;
      let withEquipment = 0;
      let hasMore = true;

      while (hasMore) {
        const payload = await fetchJson<{
          fetched?: number;
          modified?: number;
          manyImages?: number;
          withEquipment?: number;
          hasMore?: boolean;
        }>("/api/collector/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: "images",
            purchaseOption: "sale",
            pageNumber,
            pageSize,
          }),
        });

        fetched += payload.fetched ?? 0;
        modified += payload.modified ?? 0;
        manyImages += payload.manyImages ?? 0;
        withEquipment += payload.withEquipment ?? 0;
        hasMore = Boolean(payload.hasMore);
        pageNumber += 1;
      }

      setMessage(
        `Galerie zakupu używanych: sprawdzono ${fetched}, zaktualizowano ${modified}, galerie z wieloma zdjęciami ${manyImages}, wyposażenie ${withEquipment}.`,
      );
      await loadSettings();
    } catch (error) {
      console.error(error);
      setMessage(
        getFriendlyErrorMessage(error, "Nie udało się uzupełnić galerii zdjęć."),
      );
    } finally {
      setActionKey(null);
    }
  }

  async function saveDealSettings() {
    setActionKey("settings");
    setMessage("");

    try {
      const payload = await fetchJson<{
        settings: SettingsStatus["settings"];
      }>("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dealPushThreshold: threshold,
          dealScoreWeights: weights,
        }),
      });
      setThreshold(payload.settings.dealPushThreshold);
      setWeights(payload.settings.dealScoreWeights);
      setMessage("Zapisano konfigurację okazji.");
      await loadSettings();
    } catch (error) {
      console.error(error);
      setMessage(
        getFriendlyErrorMessage(error, "Nie udało się zapisać konfiguracji."),
      );
    } finally {
      setActionKey(null);
    }
  }

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadSettings();
    }, 0);
    return () => window.clearTimeout(timeout);
  }, []);

  const isBusy = Boolean(actionKey);

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-5 py-7 lg:px-8">
        <header className="flex flex-col gap-4 border-b border-slate-800 pb-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-medium uppercase tracking-wide text-cyan-300">
              Car Collector
            </p>
            <h1 className="mt-2 text-3xl font-semibold text-white">
              Ustawienia
            </h1>
            <p className="mt-2 text-sm text-slate-400">
              Status i konfiguracja operacyjna aplikacji.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:self-start lg:self-auto">
            <NavLink href="/">Panel ofert</NavLink>
            <NavLink href="/watchlist">Watchlista</NavLink>
            <NavLink href="/dashboard">Dashboard</NavLink>
            <NavLink href="/help">Pomoc</NavLink>
          </div>
        </header>

        {message && (
          <div
            className={`rounded border px-4 py-3 text-sm ${
              loadState === "error"
                ? "border-red-500/40 bg-red-500/10 text-red-100"
                : "border-cyan-400/40 bg-cyan-400/10 text-cyan-100"
            }`}
          >
            {message}
          </div>
        )}

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatusCard
            label="Baza danych"
            tone={status?.database.connected ? "positive" : "danger"}
            value={status?.database.connected ? "Połączono" : "Brak połączenia"}
            detail={status?.database.message || "Sprawdzanie..."}
          />
          <StatusCard
            label="Push"
            tone={status?.push.enabled ? "positive" : "neutral"}
            value={status?.push.enabled ? "Włączone" : "Wyłączone"}
            detail={
              status
                ? `${status.push.subscriptionCount} subskrypcji, VAPID ${
                    status.push.configured ? "OK" : "brak"
                  }`
                : "Sprawdzanie..."
            }
          />
          <StatusCard
            label="Próg okazji"
            value={`${threshold}/100`}
            detail="Minimalna nota do powiadomienia push."
          />
          <StatusCard
            label="Odświeżono status"
            value={formatDateTime(status?.generatedAt)}
            detail={loadState === "loading" ? "Ładowanie..." : "Gotowe"}
          />
        </section>

        <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded border border-slate-800 bg-slate-900 p-4">
            <div className="flex flex-col gap-1">
              <h2 className="text-lg font-semibold text-white">
                Pobieranie danych
              </h2>
              <p className="text-sm text-slate-400">
                Ręczne uruchamianie collectorów i aktualizacja galerii.
              </p>
            </div>
            <div className="mt-4 grid gap-3">
              {status?.collectors.map((collector) => (
                <ActionRow
                  disabled={isBusy}
                  key={collector.purchaseOption}
                  meta={`Aktualizacja: ${formatDateTime(collector.updatedAt)}${
                    collector.status ? ` / ${formatRunStatus(collector.status)}` : ""
                  }`}
                  onClick={() => runCollector(collector.purchaseOption)}
                  title={collector.label}
                  buttonLabel={
                    actionKey === `collector:${collector.purchaseOption}`
                      ? "Pobieranie..."
                      : "Pobierz"
                  }
                  detail={`Pobrano ${collector.fetched ?? 0}, snapshoty ${
                    collector.snapshotsCreated ?? 0
                  }, bez zmian ${collector.skippedUnchanged ?? 0}.`}
                />
              ))}
              <ActionRow
                disabled={isBusy}
                meta={`Aktualizacja: ${formatDateTime(
                  status?.saleGallery.updatedAt,
                )}`}
                onClick={backfillSaleImages}
                title="Galerie zdjęć zakupu używanych"
                buttonLabel={
                  actionKey === "sale-gallery" ? "Uzupełnianie..." : "Uzupełnij"
                }
                detail={`${formatNumber(
                  status?.saleGallery.offersWithGallery ?? 0,
                )} ofert z zapisaną galerią.`}
              />
            </div>
          </div>

          <div className="rounded border border-slate-800 bg-slate-900 p-4">
            <h2 className="text-lg font-semibold text-white">
              Konfiguracja okazji
            </h2>
            <div className="mt-4 grid gap-4">
              <label className="grid gap-2 text-sm">
                <span className="font-semibold text-slate-200">
                  Próg powiadomienia push
                </span>
                <input
                  className="h-11 rounded border border-slate-700 bg-slate-950 px-3 text-sm text-white outline-none focus:border-cyan-400"
                  max={100}
                  min={1}
                  onChange={(event) => setThreshold(Number(event.target.value))}
                  type="number"
                  value={threshold}
                />
              </label>
              <WeightInput
                label="Cena"
                onChange={(value) => setWeights((current) => ({ ...current, price: value }))}
                value={weights.price}
              />
              <WeightInput
                label="Moc"
                onChange={(value) => setWeights((current) => ({ ...current, power: value }))}
                value={weights.power}
              />
              <WeightInput
                label="Rocznik"
                onChange={(value) => setWeights((current) => ({ ...current, year: value }))}
                value={weights.year}
              />
              <button
                className="min-h-11 rounded bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isBusy}
                onClick={saveDealSettings}
                type="button"
              >
                {actionKey === "settings" ? "Zapisywanie..." : "Zapisz"}
              </button>
              <p className="text-xs text-slate-500">
                Wagi po zapisie są normalizowane do sumy 1. Ostatnia zmiana:{" "}
                {formatDateTime(status?.settings.updatedAt)}
              </p>
              <p className="text-xs leading-5 text-slate-500">
                Waga ceny obejmuje globalną taniość w wynikach oraz porównanie
                do podobnych ofert tej samej marki, modelu i typu finansowania.
              </p>
            </div>
          </div>
        </section>

        {status?.push.enabled && (
          <section className="rounded border border-slate-800 bg-slate-900 p-4">
            <div className="flex flex-col gap-1">
              <h2 className="text-lg font-semibold text-white">
                Historia powiadomień push
              </h2>
              <p className="text-sm text-slate-400">
                Ostatnie oferty oznaczone jako wysłane okazje.
              </p>
            </div>
            <div className="mt-4 grid gap-3">
              {status.push.history.length > 0 ? (
                status.push.history.map((item) => (
                  <div
                    className="grid gap-2 border-t border-slate-800 pt-3 first:border-t-0 first:pt-0 sm:grid-cols-[1fr_auto]"
                    key={item.id}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-100">
                        {item.fullName}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        ID {item.externalId} / {formatDateTime(item.notifiedAt)}
                      </p>
                    </div>
                    <div className="text-sm sm:text-right">
                      <p className="font-semibold text-emerald-200">
                        {item.score ? `Okazja ${item.score}/100` : "-"}
                      </p>
                      {item.offerUrl && (
                        <a
                          className="mt-1 inline-block text-xs text-cyan-200 hover:text-cyan-100"
                          href={item.offerUrl}
                          rel="noreferrer"
                          target="_blank"
                        >
                          Oferta
                        </a>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-500">
                  Brak wysłanych powiadomień.
                </p>
              )}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      className="min-h-12 rounded border border-slate-700 px-4 py-3 text-center text-sm font-semibold leading-tight text-slate-100 transition hover:border-cyan-400 hover:text-cyan-100"
      href={href}
    >
      {children}
    </Link>
  );
}

function StatusCard({
  detail,
  label,
  tone = "neutral",
  value,
}: {
  detail: string;
  label: string;
  tone?: "neutral" | "positive" | "danger";
  value: string;
}) {
  const valueClassName =
    tone === "positive"
      ? "text-emerald-200"
      : tone === "danger"
        ? "text-red-200"
        : "text-white";

  return (
    <div className="rounded border border-slate-800 bg-slate-900 p-4">
      <p className="text-xs font-semibold uppercase text-slate-500">{label}</p>
      <p className={`mt-2 text-xl font-semibold ${valueClassName}`}>{value}</p>
      <p className="mt-2 text-xs leading-5 text-slate-500">{detail}</p>
    </div>
  );
}

function ActionRow({
  buttonLabel,
  detail,
  disabled,
  meta,
  onClick,
  title,
}: {
  buttonLabel: string;
  detail: string;
  disabled: boolean;
  meta: string;
  onClick: () => void;
  title: string;
}) {
  return (
    <div className="grid gap-3 border-t border-slate-800 pt-3 first:border-t-0 first:pt-0 sm:grid-cols-[1fr_auto] sm:items-center">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-100">{title}</p>
        <p className="mt-1 text-xs text-slate-500">{meta}</p>
        <p className="mt-1 text-xs text-slate-400">{detail}</p>
      </div>
      <button
        className="min-h-11 rounded border border-cyan-400 px-4 py-2 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-400/10 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={disabled}
        onClick={onClick}
        type="button"
      >
        {buttonLabel}
      </button>
    </div>
  );
}

function WeightInput({
  label,
  onChange,
  value,
}: {
  label: string;
  onChange: (value: number) => void;
  value: number;
}) {
  return (
    <label className="grid gap-2 text-sm">
      <span className="font-semibold text-slate-200">
        {label}: {formatWeight(value)}
      </span>
      <input
        className="accent-cyan-300"
        max={1}
        min={0}
        onChange={(event) => onChange(Number(event.target.value))}
        step={0.01}
        type="range"
        value={value}
      />
    </label>
  );
}

async function fetchJson<TPayload extends object>(
  url: string,
  init?: RequestInit,
): Promise<TPayload> {
  const response = await fetch(url, init);
  const payload = (await response.json().catch(() => ({}))) as TPayload;

  if (!response.ok) {
    throw new Error(getPayloadMessage(payload) || "Request failed.");
  }

  return payload;
}

function getPayloadMessage(payload: object): string | undefined {
  return "message" in payload && typeof payload.message === "string"
    ? payload.message
    : undefined;
}

function getFriendlyErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function getPurchaseOptionLabel(purchaseOption: PurchaseOption) {
  if (purchaseOption === "sale") return "Zakup używanych";
  if (purchaseOption === "newRelease") return "Najem nowych";
  return "Najem używanych";
}

function formatRunStatus(status: "success" | "error") {
  return status === "error" ? "błąd" : "OK";
}

function formatDateTime(value?: string) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("pl-PL", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("pl-PL").format(value);
}

function formatWeight(value: number) {
  return new Intl.NumberFormat("pl-PL", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(value);
}
