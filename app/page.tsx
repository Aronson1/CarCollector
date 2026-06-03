"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
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
import type { CarOfferView, PurchaseOption } from "@/lib/types";

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
const purchaseOptions: PurchaseOption[] = ["release", "sale", "newRelease"];

interface FilterOptions {
  brands: string[];
  models: string[];
  fuelTypes: string[];
  gearboxes: string[];
}

export default function Home() {
  const [cars, setCars] = useState<CarOfferView[]>([]);
  const [purchaseOption, setPurchaseOption] =
    useState<PurchaseOption>("release");
  const [selectedCarId, setSelectedCarId] = useState<string | null>(null);
  const [canScroll, setCanScroll] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [showParameterFilters, setShowParameterFilters] = useState(false);
  const [previewImage, setPreviewImage] = useState<{
    alt: string;
    images: string[];
    index: number;
  } | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [collectorState, setCollectorState] = useState<LoadState>("idle");
  const [collectorPurchaseOption, setCollectorPurchaseOption] =
    useState<PurchaseOption | null>(null);
  const [collectorMessage, setCollectorMessage] = useState("");
  const [listUpdatedAt, setListUpdatedAt] = useState<string | null>(null);
  const [filterOptions, setFilterOptions] = useState<FilterOptions>({
    brands: [],
    models: [],
    fuelTypes: [],
    gearboxes: [],
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
    ...createDefaultFilters(),
  });

  async function loadCars(
    nextFilters = filters,
    nextPage = pagination.page,
    nextPageSize = pagination.pageSize,
    nextPurchaseOption = purchaseOption,
    options: { clearMessage?: boolean; reportError?: boolean } = {},
  ) {
    const { clearMessage = true, reportError = true } = options;
    setLoadState("loading");
    if (clearMessage) {
      setCollectorMessage("");
    }

    const params = new URLSearchParams();
    params.set("purchaseOption", nextPurchaseOption);
    if (nextFilters.id) params.set("id", nextFilters.id);
    if (nextFilters.brand) params.set("brand", nextFilters.brand);
    if (nextFilters.model) params.set("model", nextFilters.model);
    if (nextFilters.changedOnly) params.set("changedOnly", "true");
    if (nextFilters.availableOnly) params.set("availableOnly", "true");
    if (nextFilters.watchlistedOnly) params.set("watchlistedOnly", "true");
    appendParam(params, "yearFrom", nextFilters.yearFrom);
    appendParam(params, "yearTo", nextFilters.yearTo);
    appendParam(params, "mileageFrom", nextFilters.mileageFrom);
    appendParam(params, "mileageTo", nextFilters.mileageTo);
    if (nextFilters.fuelType) params.set("fuelType", nextFilters.fuelType);
    if (nextFilters.gearbox) params.set("gearbox", nextFilters.gearbox);
    appendParam(params, "contractMonthsFrom", nextFilters.contractMonthsFrom);
    appendParam(params, "contractMonthsTo", nextFilters.contractMonthsTo);
    appendParam(params, "annualMileageFrom", nextFilters.annualMileageFrom);
    appendParam(params, "annualMileageTo", nextFilters.annualMileageTo);
    appendParam(params, "downPaymentFrom", nextFilters.downPaymentFrom);
    appendParam(params, "downPaymentTo", nextFilters.downPaymentTo);
    params.set("sort", nextFilters.sort);
    params.set("page", String(nextPage));
    params.set("pageSize", nextPageSize);

    try {
      const payload = await fetchJson<{
        cars?: CarOfferView[];
        listUpdatedAt?: string;
        page?: number;
        pageSize?: number | "all";
        total?: number;
        totalPages?: number;
      }>(`/api/cars?${params.toString()}`, { cache: "no-store" });

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
      return true;
    } catch (error) {
      console.error(error);
      if (reportError) {
        setCollectorMessage(
          getFriendlyErrorMessage(error, "Nie udało się pobrać danych."),
        );
      }
      setLoadState("error");
      return false;
    }
  }

  async function loadFilterOptions(
    brand = filters.brand,
    nextPurchaseOption = purchaseOption,
  ) {
    const params = new URLSearchParams();
    params.set("purchaseOption", nextPurchaseOption);
    if (brand) params.set("brand", brand);

    try {
      const payload = await fetchJson<{
        brands?: string[];
        gearboxes?: string[];
        fuelTypes?: string[];
        models?: string[];
      }>(`/api/cars/filters?${params.toString()}`, { cache: "no-store" });

      setFilterOptions({
        brands: payload.brands || [],
        models: payload.models || [],
        fuelTypes: payload.fuelTypes || [],
        gearboxes: payload.gearboxes || [],
      });
    } catch (error) {
      console.error(error);
      setCollectorMessage(
        getFriendlyErrorMessage(error, "Nie udało się pobrać filtrów."),
      );
    }
  }

  async function runCollector(nextPurchaseOption: PurchaseOption) {
    setCollectorState("loading");
    setCollectorPurchaseOption(nextPurchaseOption);
    setCollectorMessage("");

    try {
      const payload = await fetchJson<{
        fetched?: number;
        snapshotsCreated?: number;
        skippedUnchanged?: number;
      }>("/api/collector/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ purchaseOption: nextPurchaseOption }),
      });
      setCollectorState("idle");
      setCollectorPurchaseOption(null);

      let refreshed = true;
      if (nextPurchaseOption === purchaseOption) {
        refreshed = await loadCars(
          filters,
          pagination.page,
          pagination.pageSize,
          purchaseOption,
          { clearMessage: false, reportError: false },
        );
      }

      const label = getPurchaseOptionLabel(nextPurchaseOption).toLowerCase();
      setCollectorMessage(
        `${label}: pobrano ${payload.fetched ?? 0}, nowe snapshoty ${
          payload.snapshotsCreated ?? 0
        }, bez zmian ${payload.skippedUnchanged ?? 0}.${
          refreshed ? "" : " Dane pobrane, ale odświeżenie listy nie powiodło się."
        }`,
      );
    } catch (error) {
      console.error(error);
      setCollectorMessage(
        getFriendlyErrorMessage(error, "Nie udało się pobrać ofert."),
      );
      setCollectorState("error");
      setCollectorPurchaseOption(null);
    }
  }

  async function toggleWatchlist(car: CarOfferView) {
    const nextIsWatchlisted = !car.isWatchlisted;
    setCars((current) =>
      current.map((item) =>
        item.id === car.id
          ? { ...item, isWatchlisted: nextIsWatchlisted }
          : item,
      ),
    );
    setCollectorMessage("");

    try {
      const payload = await fetchJson<{
        id?: string;
        isWatchlisted?: boolean;
      }>(`/api/cars/${car.id}/watchlist`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isWatchlisted: nextIsWatchlisted }),
      });

      if (filters.watchlistedOnly && !nextIsWatchlisted) {
        setCars((current) => current.filter((item) => item.id !== car.id));
        setPagination((current) => {
          const total = Math.max(0, current.total - 1);
          const totalPages = getTotalPages(total, current.pageSize);

          return {
            ...current,
            page: Math.min(current.page, totalPages),
            total,
            totalPages,
          };
        });
      } else if (payload.id === car.id) {
        setCars((current) =>
          current.map((item) =>
            item.id === car.id
              ? { ...item, isWatchlisted: Boolean(payload.isWatchlisted) }
              : item,
          ),
        );
      }
    } catch (error) {
      console.error(error);
      setCars((current) =>
        current.map((item) =>
          item.id === car.id
            ? { ...item, isWatchlisted: car.isWatchlisted }
            : item,
        ),
      );
      setCollectorMessage(
        getFriendlyErrorMessage(
          error,
          "Nie udało się zaktualizować watchlisty.",
        ),
      );
    }
  }

  function resetFilters() {
    const nextFilters = createDefaultFilters();
    setFilters(nextFilters);
    setPagination((current) => ({ ...current, page: 1 }));
    void loadFilterOptions("", purchaseOption);
    void loadCars(nextFilters, 1, pagination.pageSize, purchaseOption);
  }

  function changePurchaseOption(nextPurchaseOption: PurchaseOption) {
    if (nextPurchaseOption === purchaseOption) {
      return;
    }

    const nextFilters = createDefaultFilters();
    setPurchaseOption(nextPurchaseOption);
    setFilters(nextFilters);
    setSelectedCarId(null);
    setPagination((current) => ({
      ...current,
      page: 1,
      total: 0,
      totalPages: 1,
    }));
    void loadFilterOptions("", nextPurchaseOption);
    void loadCars(nextFilters, 1, pagination.pageSize, nextPurchaseOption);
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

      if (event.key === "ArrowLeft") {
        setPreviewImage((current) =>
          current ? movePreviewImage(current, -1) : current,
        );
      }

      if (event.key === "ArrowRight") {
        setPreviewImage((current) =>
          current ? movePreviewImage(current, 1) : current,
        );
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
  const priceLabel = getPriceLabel(purchaseOption);

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-7 px-5 py-7 lg:gap-6 lg:px-8">
        <header className="flex flex-col gap-5 border-b border-slate-800 pb-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-medium uppercase tracking-wide text-cyan-300">
              Car Collector
            </p>
            <h1 className="mt-2 text-3xl font-semibold text-white">
              Panel monitorowania cen
            </h1>
          </div>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:self-end">
              <Link
                className="min-h-12 rounded border border-slate-700 px-4 py-3 text-center text-sm font-semibold leading-tight text-slate-100 transition hover:border-cyan-400 hover:text-cyan-100"
                href="/watchlist"
              >
                Watchlista
              </Link>
              <Link
                className="min-h-12 rounded border border-slate-700 px-4 py-3 text-center text-sm font-semibold leading-tight text-slate-100 transition hover:border-cyan-400 hover:text-cyan-100"
                href="/dashboard"
              >
                Dashboard trendów
              </Link>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:gap-2">
              {purchaseOptions.map((option) => (
                <button
                  className={`min-h-12 rounded px-4 py-3 text-sm font-semibold leading-tight transition disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-10 sm:py-2 ${
                    purchaseOption === option
                      ? "bg-cyan-400 text-slate-950 hover:bg-cyan-300"
                      : "border border-cyan-400 text-cyan-100 hover:bg-cyan-400/10"
                  }`}
                  disabled={collectorState === "loading"}
                  key={option}
                  onClick={() => runCollector(option)}
                  type="button"
                >
                  {collectorPurchaseOption === option
                    ? `Pobieranie ${getPurchaseOptionShortLabel(option).toLowerCase()}...`
                    : `Pobierz ${getPurchaseOptionShortLabel(option).toLowerCase()}`}
                </button>
              ))}
            </div>
          </div>
        </header>

        <section className="flex flex-col gap-4 border-b border-slate-800 pb-6 lg:gap-3 lg:pb-5">
          <div className="grid w-full grid-cols-3 gap-1 rounded border border-slate-700 bg-slate-900 p-1 sm:inline-grid sm:w-fit">
            {purchaseOptions.map((option) => (
              <button
                className={`min-h-12 rounded px-2 py-2 text-center text-sm font-semibold leading-tight transition sm:min-h-9 sm:px-4 ${
                  purchaseOption === option
                    ? "bg-cyan-400 text-slate-950"
                    : "text-slate-300 hover:bg-slate-800"
                }`}
                key={option}
                onClick={() => changePurchaseOption(option)}
                type="button"
              >
                {getPurchaseOptionLabel(option)}
              </button>
            ))}
          </div>

          <div className="grid gap-x-3 gap-y-4 lg:grid-cols-[1fr_1fr_1fr_auto_auto_auto_auto_auto]">
            <input
              className="h-12 rounded border border-slate-700 bg-slate-900 px-3 text-sm text-white outline-none focus:border-cyan-400 sm:h-10"
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  id: event.target.value,
                }))
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
            <label className="flex min-h-12 items-center gap-2 rounded border border-slate-700 bg-slate-900 px-3 py-3 text-sm text-slate-200 sm:min-h-10 sm:py-2">
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
            <label className="flex min-h-12 items-center gap-2 rounded border border-slate-700 bg-slate-900 px-3 py-3 text-sm text-slate-200 sm:min-h-10 sm:py-2">
              <input
                checked={filters.availableOnly}
                className="h-4 w-4 accent-emerald-400"
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    availableOnly: event.target.checked,
                  }))
                }
                type="checkbox"
              />
              Dostępne
            </label>
            <label className="flex min-h-12 items-center gap-2 rounded border border-slate-700 bg-slate-900 px-3 py-3 text-sm text-slate-200 sm:min-h-10 sm:py-2">
              <input
                checked={filters.watchlistedOnly}
                className="h-4 w-4 accent-cyan-400"
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    watchlistedOnly: event.target.checked,
                  }))
                }
                type="checkbox"
              />
              Watchlista
            </label>
            <select
              aria-label="Sortowanie"
              className="h-12 rounded border border-slate-700 bg-slate-900 px-3 text-sm text-white outline-none focus:border-cyan-400 sm:h-10"
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
              <option value="deltaAsc">Największy spadek ceny</option>
              <option value="deltaDesc">Największy wzrost ceny</option>
              <option value="dealScoreDesc">Najlepsze okazje</option>
            </select>
            <div className="flex gap-3 pt-1 sm:gap-2 sm:pt-0">
              <button
                className={`min-h-12 rounded border px-5 py-3 text-sm font-semibold leading-tight transition sm:min-h-10 sm:px-4 sm:py-2 ${
                  showParameterFilters
                    ? "border-cyan-400 bg-cyan-400/10 text-cyan-100"
                    : "border-slate-700 text-slate-100 hover:border-slate-500"
                }`}
                onClick={() => setShowParameterFilters((current) => !current)}
                type="button"
              >
                Parametry
              </button>
              <button
                className="min-h-12 rounded bg-white px-5 py-3 text-sm font-semibold leading-tight text-slate-950 transition hover:bg-slate-200 sm:min-h-10 sm:px-4 sm:py-2"
                onClick={() => loadCars(filters, 1, pagination.pageSize)}
                type="button"
              >
                Filtruj
              </button>
              <button
                className="min-h-12 rounded border border-slate-700 px-5 py-3 text-sm font-semibold leading-tight text-slate-100 transition hover:border-slate-500 sm:min-h-10 sm:px-4 sm:py-2"
                onClick={resetFilters}
                type="button"
              >
                Reset
              </button>
            </div>
          </div>
          {showParameterFilters && (
            <div className="grid gap-3 rounded border border-slate-800 bg-slate-900/50 p-3 md:grid-cols-2 xl:grid-cols-4">
              <RangeInputs
                fromLabel="Rocznik od"
                fromValue={filters.yearFrom}
                onFromChange={(value) =>
                  setFilters((current) => ({ ...current, yearFrom: value }))
                }
                onToChange={(value) =>
                  setFilters((current) => ({ ...current, yearTo: value }))
                }
                toLabel="Rocznik do"
                toValue={filters.yearTo}
              />
              <RangeInputs
                fromLabel="Przebieg od"
                fromValue={filters.mileageFrom}
                onFromChange={(value) =>
                  setFilters((current) => ({ ...current, mileageFrom: value }))
                }
                onToChange={(value) =>
                  setFilters((current) => ({ ...current, mileageTo: value }))
                }
                toLabel="Przebieg do"
                toValue={filters.mileageTo}
              />
              <Autocomplete
                freeSolo
                inputValue={filters.fuelType}
                onInputChange={(_, value) =>
                  setFilters((current) => ({ ...current, fuelType: value }))
                }
                options={filterOptions.fuelTypes}
                renderInput={(params) => (
                  <TextField {...params} label="Paliwo" sx={autocompleteSx} />
                )}
                size="small"
                slotProps={autocompleteSlotProps}
                value={filters.fuelType || null}
              />
              <Autocomplete
                freeSolo
                inputValue={filters.gearbox}
                onInputChange={(_, value) =>
                  setFilters((current) => ({ ...current, gearbox: value }))
                }
                options={filterOptions.gearboxes}
                renderInput={(params) => (
                  <TextField {...params} label="Skrzynia" sx={autocompleteSx} />
                )}
                size="small"
                slotProps={autocompleteSlotProps}
                value={filters.gearbox || null}
              />
              <RangeInputs
                fromLabel="Kontrakt od"
                fromValue={filters.contractMonthsFrom}
                onFromChange={(value) =>
                  setFilters((current) => ({
                    ...current,
                    contractMonthsFrom: value,
                  }))
                }
                onToChange={(value) =>
                  setFilters((current) => ({
                    ...current,
                    contractMonthsTo: value,
                  }))
                }
                toLabel="Kontrakt do"
                toValue={filters.contractMonthsTo}
              />
              <RangeInputs
                fromLabel="Km/rok od"
                fromValue={filters.annualMileageFrom}
                onFromChange={(value) =>
                  setFilters((current) => ({
                    ...current,
                    annualMileageFrom: value,
                  }))
                }
                onToChange={(value) =>
                  setFilters((current) => ({
                    ...current,
                    annualMileageTo: value,
                  }))
                }
                toLabel="Km/rok do"
                toValue={filters.annualMileageTo}
              />
              <RangeInputs
                fromLabel="Wpłata od"
                fromValue={filters.downPaymentFrom}
                onFromChange={(value) =>
                  setFilters((current) => ({
                    ...current,
                    downPaymentFrom: value,
                  }))
                }
                onToChange={(value) =>
                  setFilters((current) => ({
                    ...current,
                    downPaymentTo: value,
                  }))
                }
                toLabel="Wpłata do"
                toValue={filters.downPaymentTo}
              />
            </div>
          )}
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
                Auta - {getPurchaseOptionLabel(purchaseOption).toLowerCase()} (
                {pagination.total})
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
                const carImages = getCarImages(car);

                return (
                  <article
                    className={`rounded border bg-slate-900 p-4 ${
                      isSelected ? "border-cyan-400" : "border-slate-800"
                    }`}
                    key={car.id}
                  >
                    <div className="grid gap-4 md:grid-cols-[150px_1fr_auto]">
                      <CarImageGallery
                        car={car}
                        images={carImages}
                        onPreview={(index) =>
                          setPreviewImage({
                            alt: car.fullName,
                            images: carImages,
                            index,
                          })
                        }
                      />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="truncate text-base font-semibold text-white">
                            {car.fullName}
                          </h3>
                          {car.isAvailable && <AvailableBadge />}
                          <DealScoreBadge car={car} />
                          {car.isWatchlisted && <WatchlistBadge />}
                          {car.hasPriceChanged && (
                            <span className="rounded bg-amber-300 px-2 py-1 text-xs font-semibold text-slate-950">
                              cena zmieniona
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-sm text-slate-400">
                          {car.brand} / {car.model} / ID {car.externalId}
                        </p>
                        <dl className="mt-3 grid gap-2 text-sm text-slate-300 sm:grid-cols-7">
                          <div>
                            <dt className="text-slate-500">{priceLabel}</dt>
                            <dd className="font-semibold text-white">
                              {formatPrice(car.latestPrices[0])}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-slate-500">Moc</dt>
                            <dd>{formatPowerHp(car.details.powerHp)}</dd>
                          </div>
                          <div>
                            <dt className="text-slate-500">Zmiana</dt>
                            <dd>
                              <PriceDeltaBadge car={car} />
                            </dd>
                          </div>
                          <div>
                            <dt className="text-slate-500">Rok produkcji</dt>
                            <dd>{formatYear(car.details.registrationYear)}</dd>
                          </div>
                          <div>
                            <dt className="text-slate-500">Data ogłoszenia</dt>
                            <dd>{formatDate(car.announcementCreatedAt)}</dd>
                          </div>
                          {purchaseOption === "newRelease" ? (
                            <div>
                              <dt className="text-slate-500">Parametry</dt>
                              <dd>{formatNewRentalDetails(car.details)}</dd>
                            </div>
                          ) : (
                            <div>
                              <dt className="text-slate-500">Przebieg</dt>
                              <dd>{formatMileage(car.details.mileage)}</dd>
                            </div>
                          )}
                          <div>
                            <dt className="text-slate-500">Historia</dt>
                            <dd>{car.priceHistory.length} punktów</dd>
                          </div>
                        </dl>
                      </div>
                      <div className="flex items-start gap-2 md:flex-col">
                        <button
                          className={`h-9 rounded px-3 text-sm font-semibold transition ${
                            car.isWatchlisted
                              ? "bg-cyan-400 text-slate-950 hover:bg-cyan-300"
                              : "border border-slate-700 text-slate-100 hover:border-cyan-300"
                          }`}
                          onClick={() => toggleWatchlist(car)}
                          type="button"
                        >
                          {car.isWatchlisted ? "Obserwowane" : "Obserwuj"}
                        </button>
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
                                  label: priceLabel,
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
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-white">
                  {previewImage.alt}
                </p>
                {previewImage.images.length > 1 && (
                  <p className="mt-1 text-xs text-slate-400">
                    {previewImage.index + 1} / {previewImage.images.length}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                {previewImage.images.length > 1 && (
                  <>
                    <button
                      aria-label="Poprzednie zdjęcie"
                      className="h-10 rounded border border-slate-700 px-3 text-sm font-semibold text-slate-100 transition hover:border-slate-500"
                      onClick={() =>
                        setPreviewImage((current) =>
                          current ? movePreviewImage(current, -1) : current,
                        )
                      }
                      type="button"
                    >
                      Poprzednie
                    </button>
                    <button
                      aria-label="Następne zdjęcie"
                      className="h-10 rounded border border-slate-700 px-3 text-sm font-semibold text-slate-100 transition hover:border-slate-500"
                      onClick={() =>
                        setPreviewImage((current) =>
                          current ? movePreviewImage(current, 1) : current,
                        )
                      }
                      type="button"
                    >
                      Następne
                    </button>
                  </>
                )}
                <button
                  className="h-10 rounded bg-white px-4 text-sm font-semibold text-slate-950 transition hover:bg-slate-200"
                  onClick={() => setPreviewImage(null)}
                  type="button"
                >
                  Zamknij
                </button>
              </div>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              alt={previewImage.alt}
              className="max-h-[calc(100vh-6rem)] w-full rounded object-contain"
              src={previewImage.images[previewImage.index]}
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

function AvailableBadge() {
  return (
    <span className="inline-flex min-h-6 items-center gap-1.5 rounded bg-emerald-400/10 px-2 py-1 text-xs font-semibold text-emerald-100 ring-1 ring-emerald-400/30">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
      Dostępny
    </span>
  );
}

function WatchlistBadge() {
  return (
    <span className="inline-flex min-h-6 items-center rounded bg-cyan-400/15 px-2 py-1 text-xs font-semibold text-cyan-100 ring-1 ring-cyan-400/30">
      Watchlista
    </span>
  );
}

function RangeInputs({
  fromLabel,
  fromValue,
  onFromChange,
  onToChange,
  toLabel,
  toValue,
}: {
  fromLabel: string;
  fromValue: string;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
  toLabel: string;
  toValue: string;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <input
        className="h-12 rounded border border-slate-700 bg-slate-900 px-3 text-sm text-white outline-none focus:border-cyan-400 sm:h-10"
        inputMode="numeric"
        onChange={(event) => onFromChange(event.target.value)}
        placeholder={fromLabel}
        type="number"
        value={fromValue}
      />
      <input
        className="h-12 rounded border border-slate-700 bg-slate-900 px-3 text-sm text-white outline-none focus:border-cyan-400 sm:h-10"
        inputMode="numeric"
        onChange={(event) => onToChange(event.target.value)}
        placeholder={toLabel}
        type="number"
        value={toValue}
      />
    </div>
  );
}

function CarImageGallery({
  car,
  images,
  onPreview,
}: {
  car: CarOfferView;
  images: string[];
  onPreview: (index: number) => void;
}) {
  if (images.length === 0) {
    return (
      <div className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded bg-slate-800">
        <div className="px-3 text-center text-xs font-semibold uppercase tracking-wide text-slate-500">
          Brak zdjęcia
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-2">
      <button
        aria-label={`Powiększ zdjęcie: ${car.fullName}`}
        className="relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded bg-slate-800"
        onClick={() => onPreview(0)}
        type="button"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          alt={car.fullName}
          className="h-full w-full object-cover transition duration-200 hover:scale-105"
          src={images[0]}
        />
        {images.length > 1 && (
          <span className="absolute bottom-1.5 right-1.5 rounded bg-slate-950/85 px-2 py-1 text-xs font-semibold text-white">
            {images.length} zdj.
          </span>
        )}
      </button>
      {images.length > 1 && (
        <div className="grid grid-cols-3 gap-1">
          {images.slice(1, 4).map((image, index) => (
            <button
              aria-label={`Powiększ zdjęcie ${index + 2}: ${car.fullName}`}
              className="aspect-[4/3] overflow-hidden rounded bg-slate-800 ring-1 ring-slate-700 transition hover:ring-cyan-400"
              key={image}
              onClick={() => onPreview(index + 1)}
              type="button"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                alt=""
                className="h-full w-full object-cover"
                src={image}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function DealScoreBadge({ car }: { car: CarOfferView }) {
  if (!car.dealScore) {
    return null;
  }

  const score = car.dealScore.score;
  const className =
    score >= 80
      ? "bg-emerald-400/15 text-emerald-100 ring-emerald-400/30"
      : score >= 65
        ? "bg-cyan-400/15 text-cyan-100 ring-cyan-400/30"
        : score >= 50
          ? "bg-amber-300/15 text-amber-100 ring-amber-300/30"
          : "bg-slate-700/60 text-slate-200 ring-slate-600";

  return (
    <span
      className={`inline-flex min-h-6 items-center rounded px-2 py-1 text-xs font-semibold ring-1 ${className}`}
      title={car.dealScore.reasons.join(", ")}
    >
      Okazja {score}/100
    </span>
  );
}

function PriceDeltaBadge({ car }: { car: CarOfferView }) {
  if (!car.priceDelta) {
    return <span className="text-slate-500">-</span>;
  }

  const { amount, percent } = car.priceDelta;
  const isDrop = amount < 0;
  const isIncrease = amount > 0;
  const className = isDrop
    ? "bg-emerald-400/15 text-emerald-200 ring-emerald-400/30"
    : isIncrease
      ? "bg-red-400/15 text-red-200 ring-red-400/30"
      : "bg-slate-700/60 text-slate-200 ring-slate-600";

  return (
    <span
      className={`inline-flex min-h-6 items-center rounded px-2 py-1 text-xs font-semibold ring-1 ${className}`}
      title={`Poprzednio: ${formatPrice(car.priceDelta.previousPrice)}`}
    >
      {formatSignedPrice(amount)} ({formatSignedPercent(percent)})
    </span>
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

function formatSignedPercent(value: number) {
  const formatted = new Intl.NumberFormat("pl-PL", {
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
  }).format(Math.abs(value));

  if (value === 0) return "0,0%";
  return `${value > 0 ? "+" : "-"}${formatted}%`;
}

function createDefaultFilters() {
  return {
    id: "",
    brand: "",
    model: "",
    changedOnly: false,
    availableOnly: false,
    watchlistedOnly: false,
    yearFrom: "",
    yearTo: "",
    mileageFrom: "",
    mileageTo: "",
    fuelType: "",
    gearbox: "",
    contractMonthsFrom: "",
    contractMonthsTo: "",
    annualMileageFrom: "",
    annualMileageTo: "",
    downPaymentFrom: "",
    downPaymentTo: "",
    sort: "newest",
  };
}

async function fetchJson<TPayload extends { message?: string }>(
  url: string,
  init?: RequestInit,
): Promise<TPayload> {
  const response = await fetchWithRetry(url, init);
  const payload = (await response.json().catch(() => ({}))) as TPayload;

  if (!response.ok) {
    throw new Error(payload.message || "Request failed.");
  }

  return payload;
}

async function fetchWithRetry(
  url: string,
  init?: RequestInit,
): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (error) {
    if (!isTransientFetchError(error)) {
      throw error;
    }

    await wait(700);
    return fetch(url, init);
  }
}

function isTransientFetchError(error: unknown): boolean {
  return (
    error instanceof TypeError &&
    /fetch|network|load failed/i.test(error.message)
  );
}

function getFriendlyErrorMessage(error: unknown, fallback: string): string {
  if (isTransientFetchError(error)) {
    return "Nie udało się połączyć z serwerem. Spróbuj ponownie za chwilę.";
  }

  return error instanceof Error ? error.message : fallback;
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function appendParam(params: URLSearchParams, key: string, value: string) {
  if (value.trim()) {
    params.set(key, value.trim());
  }
}

function getCarImages(car: CarOfferView): string[] {
  return Array.from(
    new Set([car.imageUrl || undefined, ...(car.imageUrls || [])].filter(Boolean)),
  ) as string[];
}

function movePreviewImage(
  previewImage: { alt: string; images: string[]; index: number },
  direction: -1 | 1,
) {
  const nextIndex =
    (previewImage.index + direction + previewImage.images.length) %
    previewImage.images.length;

  return {
    ...previewImage,
    index: nextIndex,
  };
}

function getPurchaseOptionLabel(purchaseOption: PurchaseOption) {
  if (purchaseOption === "sale") return "Zakup używane";
  if (purchaseOption === "newRelease") return "Najem nowe";
  return "Najem używane";
}

function getPurchaseOptionShortLabel(purchaseOption: PurchaseOption) {
  if (purchaseOption === "sale") return "zakup używane";
  if (purchaseOption === "newRelease") return "najem nowe";
  return "najem używane";
}

function getPriceLabel(purchaseOption: PurchaseOption) {
  if (purchaseOption === "sale") return "Cena zakupu netto";
  if (purchaseOption === "newRelease") return "Cena najmu netto";
  return "Cena najmu netto";
}

function formatMileage(value?: number) {
  if (!value) return "-";
  return `${new Intl.NumberFormat("pl-PL").format(value)} km`;
}

function formatPowerHp(value?: number) {
  if (!value) return "-";
  return `${new Intl.NumberFormat("pl-PL").format(value)} KM`;
}

function formatYear(value?: number) {
  return value ? String(value) : "-";
}

function formatNewRentalDetails(details: CarOfferView["details"]) {
  const values = [
    details.contractMonths ? `${details.contractMonths} mies.` : null,
    details.annualMileage
      ? `${new Intl.NumberFormat("pl-PL").format(details.annualMileage)} km/rok`
      : null,
    details.downPayment
      ? `${formatPrice(details.downPayment)} wpłaty`
      : null,
  ].filter(Boolean);

  return values.length > 0 ? values.join(" / ") : "-";
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

function getTotalPages(total: number, pageSize: PageSizeValue) {
  if (pageSize === "all") return 1;
  return Math.max(1, Math.ceil(total / Number(pageSize)));
}

const autocompleteSx = {
  "& .MuiInputBase-root": {
    backgroundColor: "#0f172a",
    color: "#fff",
    height: "48px",
    minHeight: "48px",
    "@media (min-width: 640px)": {
      height: "40px",
      minHeight: "40px",
    },
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
