"use client";

import { useEffect, useState } from "react";
import Autocomplete from "@mui/material/Autocomplete";
import LinearProgress from "@mui/material/LinearProgress";
import TextField from "@mui/material/TextField";
import { Line } from "react-chartjs-2";
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
import type { CarOfferView } from "@/lib/types";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
);

type LoadState = "idle" | "loading" | "error";
type PageSizeValue = "10" | "30" | "60" | "100" | "all";

interface FilterOptions {
  brands: string[];
  models: string[];
}

export default function Home() {
  const [cars, setCars] = useState<CarOfferView[]>([]);
  const [selectedCarId, setSelectedCarId] = useState<string | null>(null);
  const [canScroll, setCanScroll] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [previewImage, setPreviewImage] = useState<{
    alt: string;
    src: string;
  } | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [collectorState, setCollectorState] = useState<LoadState>("idle");
  const [collectorMessage, setCollectorMessage] = useState("");
  const [listUpdatedAt, setListUpdatedAt] = useState<string | null>(null);
  const [filterOptions, setFilterOptions] = useState<FilterOptions>({
    brands: [],
    models: [],
  });
  const [pagination, setPagination] = useState<{
    page: number;
    pageSize: PageSizeValue;
    total: number;
    totalPages: number;
  }>({
    page: 1,
    pageSize: "30",
    total: 0,
    totalPages: 1,
  });
  const [filters, setFilters] = useState({
    id: "",
    brand: "",
    model: "",
    changedOnly: false,
    sort: "newest",
  });

  async function loadCars(
    nextFilters = filters,
    nextPage = pagination.page,
    nextPageSize = pagination.pageSize,
  ) {
    setLoadState("loading");
    setCollectorMessage("");

    const params = new URLSearchParams();
    if (nextFilters.id) params.set("id", nextFilters.id);
    if (nextFilters.brand) params.set("brand", nextFilters.brand);
    if (nextFilters.model) params.set("model", nextFilters.model);
    if (nextFilters.changedOnly) params.set("changedOnly", "true");
    params.set("sort", nextFilters.sort);
    params.set("page", String(nextPage));
    params.set("pageSize", nextPageSize);

    try {
      const response = await fetch(`/api/cars?${params.toString()}`, {
        cache: "no-store",
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.message || "Could not load cars.");
      }

      setCars(payload.cars || []);
      setPagination({
        page: payload.page || nextPage,
        pageSize: normalizePageSize(payload.pageSize, nextPageSize),
        total: payload.total || 0,
        totalPages: payload.totalPages || 1,
      });
      setListUpdatedAt(payload.listUpdatedAt || null);
      setSelectedCarId((current) =>
        payload.cars?.some((car: CarOfferView) => car.id === current)
          ? current
          : null,
      );
      setLoadState("idle");
    } catch (error) {
      console.error(error);
      setCollectorMessage(
        error instanceof Error ? error.message : "Nie udało się pobrać danych.",
      );
      setLoadState("error");
    }
  }

  async function loadFilterOptions(brand = filters.brand) {
    const params = new URLSearchParams();
    if (brand) params.set("brand", brand);

    try {
      const response = await fetch(`/api/cars/filters?${params.toString()}`, {
        cache: "no-store",
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.message || "Could not load filters.");
      }

      setFilterOptions({
        brands: payload.brands || [],
        models: payload.models || [],
      });
    } catch (error) {
      console.error(error);
      setCollectorMessage(
        error instanceof Error
          ? error.message
          : "Nie udało się pobrać filtrów.",
      );
    }
  }

  async function runCollector() {
    setCollectorState("loading");
    setCollectorMessage("");

    try {
      const response = await fetch("/api/collector/run", {
        method: "POST",
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.message || "Collector run failed.");
      }

      setCollectorMessage(
        `Fetched ${payload.fetched}, snapshots ${payload.snapshotsCreated}, unchanged ${payload.skippedUnchanged}.`,
      );
      setCollectorState("idle");
      await loadCars(filters, pagination.page, pagination.pageSize);
    } catch (error) {
      console.error(error);
      setCollectorMessage(
        error instanceof Error ? error.message : "Collector run failed.",
      );
      setCollectorState("error");
    }
  }

  function resetFilters() {
    const nextFilters = {
      id: "",
      brand: "",
      model: "",
      changedOnly: false,
      sort: "newest",
    };
    setFilters(nextFilters);
    setPagination((current) => ({ ...current, page: 1 }));
    void loadFilterOptions("");
    void loadCars(nextFilters, 1, pagination.pageSize);
  }

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadFilterOptions();
      void loadCars();
    }, 0);
    return () => window.clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!previewImage) return undefined;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setPreviewImage(null);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [previewImage]);

  useEffect(() => {
    function updateScrollTopVisibility() {
      const hasScrollableContent =
        document.documentElement.scrollHeight > window.innerHeight + 8;

      setCanScroll(hasScrollableContent);
      setShowScrollTop(hasScrollableContent && window.scrollY > 240);
    }

    updateScrollTopVisibility();
    window.addEventListener("resize", updateScrollTopVisibility);
    window.addEventListener("scroll", updateScrollTopVisibility, {
      passive: true,
    });

    return () => {
      window.removeEventListener("resize", updateScrollTopVisibility);
      window.removeEventListener("scroll", updateScrollTopVisibility);
    };
  }, [cars, selectedCarId, pagination.pageSize]);

  const paginationControls = (
    <div className="flex flex-wrap items-center gap-2">
      <label className="flex h-10 items-center gap-2 rounded border border-slate-700 bg-slate-900 px-3 text-sm text-slate-200">
        Na stronie
        <select
          className="bg-slate-900 text-white outline-none"
          onChange={(event) => {
            const nextPageSize = event.target.value as PageSizeValue;
            setPagination((current) => ({
              ...current,
              page: 1,
              pageSize: nextPageSize,
            }));
            void loadCars(filters, 1, nextPageSize);
          }}
          value={pagination.pageSize}
        >
          <option value="10">10</option>
          <option value="30">30</option>
          <option value="60">60</option>
          <option value="100">100</option>
          <option value="all">Wszystkie</option>
        </select>
      </label>
      <button
        className="h-10 rounded border border-slate-700 px-3 text-sm font-semibold text-slate-100 transition hover:border-slate-500 disabled:cursor-not-allowed disabled:opacity-50"
        disabled={pagination.page <= 1 || pagination.pageSize === "all"}
        onClick={() => {
          const nextPage = Math.max(1, pagination.page - 1);
          void loadCars(filters, nextPage, pagination.pageSize);
        }}
        type="button"
      >
        Poprzednia
      </button>
      <span className="text-sm text-slate-400">
        {pagination.pageSize === "all"
          ? "Wszystkie"
          : `${pagination.page} / ${pagination.totalPages}`}
      </span>
      <button
        className="h-10 rounded border border-slate-700 px-3 text-sm font-semibold text-slate-100 transition hover:border-slate-500 disabled:cursor-not-allowed disabled:opacity-50"
        disabled={
          pagination.page >= pagination.totalPages ||
          pagination.pageSize === "all"
        }
        onClick={() => {
          const nextPage = Math.min(pagination.totalPages, pagination.page + 1);
          void loadCars(filters, nextPage, pagination.pageSize);
        }}
        type="button"
      >
        Następna
      </button>
    </div>
  );

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-5 py-6 lg:px-8">
        <header className="flex flex-col gap-4 border-b border-slate-800 pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-medium uppercase tracking-wide text-cyan-300">
              Car Collector
            </p>
            <h1 className="mt-2 text-3xl font-semibold text-white">
              Panel monitorowania cen
            </h1>
          </div>
          <div>
            <button
              className="h-10 rounded bg-cyan-400 px-4 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={collectorState === "loading"}
              onClick={runCollector}
              type="button"
            >
              {collectorState === "loading" ? "Pobieranie..." : "Run collector"}
            </button>
          </div>
        </header>

        <section className="grid gap-3 border-b border-slate-800 pb-5 md:grid-cols-[1fr_1fr_1fr_auto_auto_auto]">
          <input
            className="h-10 rounded border border-slate-700 bg-slate-900 px-3 text-sm text-white outline-none focus:border-cyan-400"
            onChange={(event) =>
              setFilters((current) => ({ ...current, id: event.target.value }))
            }
            placeholder="ID"
            type="search"
            value={filters.id}
          />
          <Autocomplete
            freeSolo
            inputValue={filters.brand}
            onInputChange={(_, value) => {
              setFilters((current) => ({
                ...current,
                brand: value,
                model: "",
              }));
              void loadFilterOptions(value);
            }}
            options={filterOptions.brands}
            renderInput={(params) => (
              <TextField {...params} label="Marka" sx={autocompleteSx} />
            )}
            size="small"
            slotProps={autocompleteSlotProps}
            value={filters.brand || null}
          />
          <Autocomplete
            freeSolo
            inputValue={filters.model}
            onInputChange={(_, value) =>
              setFilters((current) => ({
                ...current,
                model: value,
              }))
            }
            options={filterOptions.models}
            renderInput={(params) => (
              <TextField {...params} label="Model" sx={autocompleteSx} />
            )}
            size="small"
            slotProps={autocompleteSlotProps}
            value={filters.model || null}
          />
          <label className="flex h-10 items-center gap-2 rounded border border-slate-700 bg-slate-900 px-3 text-sm text-slate-200">
            <input
              checked={filters.changedOnly}
              className="h-4 w-4 accent-cyan-400"
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  changedOnly: event.target.checked,
                }))
              }
              type="checkbox"
            />
            Zmiany ceny
          </label>
          <select
            aria-label="Sortowanie"
            className="h-10 rounded border border-slate-700 bg-slate-900 px-3 text-sm text-white outline-none focus:border-cyan-400"
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                sort: event.target.value,
              }))
            }
            value={filters.sort}
          >
            <option value="newest">Najnowszy wpis</option>
            <option value="oldest">Najstarszy wpis</option>
            <option value="priceAsc">Cena rosnąco</option>
            <option value="priceDesc">Cena malejąco</option>
          </select>
          <div className="flex gap-2">
            <button
              className="h-10 rounded bg-white px-4 text-sm font-semibold text-slate-950 transition hover:bg-slate-200"
              onClick={() => loadCars(filters, 1, pagination.pageSize)}
              type="button"
            >
              Filtruj
            </button>
            <button
              className="h-10 rounded border border-slate-700 px-4 text-sm font-semibold text-slate-100 transition hover:border-slate-500"
              onClick={resetFilters}
              type="button"
            >
              Reset
            </button>
          </div>
        </section>

        {(collectorMessage || loadState === "error") && (
          <div
            className={`rounded border px-4 py-3 text-sm ${
              collectorState === "error" || loadState === "error"
                ? "border-red-500/40 bg-red-500/10 text-red-100"
                : "border-cyan-400/40 bg-cyan-400/10 text-cyan-100"
            }`}
          >
            {collectorMessage}
          </div>
        )}
        {loadState === "loading" && (
          <div aria-label="Ładowanie danych">
            <LinearProgress
              aria-label="Loading..."
              sx={loadingProgressSx}
            />
          </div>
        )}

        <section className="flex flex-col gap-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-white">
                Auta ({pagination.total})
              </h2>
              {listUpdatedAt && (
                <p className="mt-1 text-sm text-slate-400">
                  Ostatnia aktualizacja: {formatDateTime(listUpdatedAt)}
                </p>
              )}
            </div>
            {paginationControls}
          </div>

          {cars.length === 0 && loadState !== "loading" ? (
            <div className="rounded border border-slate-800 bg-slate-900 p-6 text-sm text-slate-400">
              Brak wyników.
            </div>
          ) : (
            <div className="grid gap-3">
              {cars.map((car) => {
                const isSelected = selectedCarId === car.id;
                const hasChart = car.priceHistory.length > 1;

                return (
                  <article
                    className={`rounded border bg-slate-900 p-4 ${
                      isSelected ? "border-cyan-400" : "border-slate-800"
                    }`}
                    key={car.id}
                  >
                    <div className="grid gap-4 md:grid-cols-[120px_1fr_auto]">
                      <div className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded bg-slate-800">
                        {car.imageUrl ? (
                          <button
                            aria-label={`Powiększ zdjęcie: ${car.fullName}`}
                            className="h-full w-full cursor-zoom-in"
                            onClick={() =>
                              setPreviewImage({
                                alt: car.fullName,
                                src: car.imageUrl as string,
                              })
                            }
                            type="button"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              alt={car.fullName}
                              className="h-full w-full object-cover transition duration-200 hover:scale-105"
                              src={car.imageUrl}
                            />
                          </button>
                        ) : (
                          <div className="px-3 text-center text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Brak zdjęcia
                          </div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="truncate text-base font-semibold text-white">
                            {car.fullName}
                          </h3>
                          {car.hasPriceChanged && (
                            <span className="rounded bg-amber-300 px-2 py-1 text-xs font-semibold text-slate-950">
                              cena zmieniona
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-sm text-slate-400">
                          {car.brand} / {car.model} / ID {car.externalId}
                        </p>
                        <dl className="mt-3 grid gap-2 text-sm text-slate-300 sm:grid-cols-4">
                          <div>
                            <dt className="text-slate-500">Data ogłoszenia</dt>
                            <dd>{formatDate(car.announcementCreatedAt)}</dd>
                          </div>
                          <div>
                            <dt className="text-slate-500">Cena netto</dt>
                            <dd className="font-semibold text-white">
                              {formatPrice(car.latestPrices[0])}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-slate-500">Przebieg</dt>
                            <dd>{formatMileage(car.details.mileage)}</dd>
                          </div>
                          <div>
                            <dt className="text-slate-500">Historia</dt>
                            <dd>{car.priceHistory.length} punktów</dd>
                          </div>
                        </dl>
                      </div>
                      <div className="flex items-start gap-2 md:flex-col">
                        {hasChart && (
                          <button
                            className="h-9 rounded bg-slate-100 px-3 text-sm font-semibold text-slate-950 transition hover:bg-white"
                            onClick={() =>
                              setSelectedCarId((current) =>
                                current === car.id ? null : car.id,
                              )
                            }
                            type="button"
                          >
                            {isSelected ? "Ukryj" : "Wykres"}
                          </button>
                        )}
                        {car.offerUrl && (
                          <a
                            className="h-9 rounded border border-slate-700 px-3 py-2 text-sm font-semibold text-slate-100 transition hover:border-slate-500"
                            href={car.offerUrl}
                            rel="noopener noreferrer"
                            target="_blank"
                          >
                            Oferta
                          </a>
                        )}
                      </div>
                    </div>

                    {isSelected && hasChart && (
                      <div className="mt-4 border-t border-slate-800 pt-4">
                        <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
                          <h4 className="text-sm font-semibold text-white">
                            Historia ceny
                          </h4>
                          <span className="text-xs text-slate-500">
                            {car.priceHistory.length} punktów pomiaru
                          </span>
                        </div>
                        <div className="h-72 w-full">
                          <Line
                            data={{
                              labels: car.priceHistory.map((snapshot) =>
                                new Date(snapshot.fetchedAt).toLocaleDateString(
                                  "pl-PL",
                                ),
                              ),
                              datasets: [
                                {
                                  label: "Cena netto",
                                  data: car.priceHistory.map(
                                    (snapshot) => snapshot.prices[0] || null,
                                  ),
                                  borderColor: "rgb(34, 211, 238)",
                                  backgroundColor: "rgba(34, 211, 238, 0.2)",
                                  tension: 0.25,
                                },
                              ],
                            }}
                            options={{
                              maintainAspectRatio: false,
                              responsive: true,
                              plugins: {
                                legend: { labels: { color: "#cbd5e1" } },
                                title: { display: false },
                              },
                              scales: {
                                x: { ticks: { color: "#94a3b8" } },
                                y: { ticks: { color: "#94a3b8" } },
                              },
                            }}
                          />
                        </div>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
          {cars.length > 0 && (
            <div className="flex justify-end border-t border-slate-800 pt-3">
              {paginationControls}
            </div>
          )}
        </section>
      </div>
      {previewImage && (
        <div
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4"
          onClick={() => setPreviewImage(null)}
          role="dialog"
        >
          <div
            className="flex max-h-full w-full max-w-6xl flex-col gap-3"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3">
              <p className="truncate text-sm font-semibold text-white">
                {previewImage.alt}
              </p>
              <button
                className="h-10 rounded bg-white px-4 text-sm font-semibold text-slate-950 transition hover:bg-slate-200"
                onClick={() => setPreviewImage(null)}
                type="button"
              >
                Zamknij
              </button>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              alt={previewImage.alt}
              className="max-h-[calc(100vh-6rem)] w-full rounded object-contain"
              src={previewImage.src}
            />
          </div>
        </div>
      )}
      {canScroll && showScrollTop && (
        <button
          aria-label="Przewiń na górę"
          className="fixed bottom-6 right-6 z-40 h-12 rounded-full border border-cyan-300/60 bg-cyan-400 px-5 text-sm font-semibold text-slate-950 shadow-lg shadow-cyan-950/40 transition hover:bg-cyan-300"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          type="button"
        >
          Do góry
        </button>
      )}
    </main>
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

function formatMileage(value?: number) {
  if (!value) return "-";
  return `${new Intl.NumberFormat("pl-PL").format(value)} km`;
}

function formatDate(value?: string) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("pl-PL").format(new Date(value));
}

function formatDateTime(value?: string) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("pl-PL", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function normalizePageSize(
  value: number | "all" | undefined,
  fallback: PageSizeValue,
): PageSizeValue {
  if (value === "all") return "all";
  const normalized = String(value || fallback);
  return ["10", "30", "60", "100"].includes(normalized)
    ? (normalized as PageSizeValue)
    : fallback;
}

const autocompleteSx = {
  "& .MuiInputBase-root": {
    backgroundColor: "#0f172a",
    color: "#fff",
    height: "40px",
  },
  "& .MuiInputLabel-root": {
    color: "#94a3b8",
  },
  "& .MuiInputLabel-root.Mui-focused": {
    color: "#22d3ee",
  },
  "& .MuiOutlinedInput-notchedOutline": {
    borderColor: "#334155",
  },
  "& .MuiOutlinedInput-root:hover .MuiOutlinedInput-notchedOutline": {
    borderColor: "#64748b",
  },
  "& .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-notchedOutline": {
    borderColor: "#22d3ee",
  },
  "& .MuiSvgIcon-root": {
    color: "#cbd5e1",
  },
};

const autocompleteSlotProps = {
  paper: {
    sx: {
      backgroundColor: "#0f172a",
      border: "1px solid #334155",
      color: "#e2e8f0",
    },
  },
  listbox: {
    sx: {
      "& .MuiAutocomplete-option.Mui-focused": {
        backgroundColor: "#1e293b",
      },
      "& .MuiAutocomplete-option[aria-selected='true']": {
        backgroundColor: "#164e63",
      },
    },
  },
};

const loadingProgressSx = {
  height: 6,
  borderRadius: 999,
  backgroundColor: "#1e293b",
  "& .MuiLinearProgress-bar": {
    borderRadius: 999,
    backgroundColor: "#22d3ee",
  },
};
