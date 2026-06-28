"use client";

import { useEffect, useRef, useState } from "react";
import type { PointerEvent } from "react";
import Link from "next/link";
import LinearProgress from "@mui/material/LinearProgress";
import type {
  CayenneGenerationFilter,
  CayenneOfferView,
  CayenneSearchResult,
  CayenneSort,
} from "@/lib/cayenne";

type LoadState = "idle" | "loading" | "error";
type MaxPriceValue =
  | "150000"
  | "200000"
  | "250000"
  | "300000"
  | "350000"
  | "500000"
  | "750000"
  | "1000000"
  | "all";

export default function CayenneClient({
  initialData,
  initialMessage,
}: {
  initialData: CayenneSearchResult;
  initialMessage?: string;
}) {
  const [data, setData] = useState(initialData);
  const [sort, setSort] = useState<CayenneSort>("recentlyAdded");
  const [maxPrice, setMaxPrice] = useState<MaxPriceValue>("250000");
  const [generation, setGeneration] =
    useState<CayenneGenerationFilter>("currentAndPrevious");
  const [changedOnly, setChangedOnly] = useState(false);
  const [watchlistedOnly, setWatchlistedOnly] = useState(false);
  const [loadState, setLoadState] = useState<LoadState>(
    initialMessage ? "error" : "idle",
  );
  const [message, setMessage] = useState(initialMessage || "");
  const [actionState, setActionState] = useState<"idle" | "running">("idle");
  const [previewImage, setPreviewImage] = useState<{
    alt: string;
    images: string[];
    index: number;
  } | null>(null);
  const previewSwipeStartRef = useRef<{ x: number; y: number } | null>(null);

  async function loadOffers(
    nextSort = sort,
    nextMaxPrice = maxPrice,
    nextGeneration = generation,
    nextWatchlistedOnly = watchlistedOnly,
    nextChangedOnly = changedOnly,
    clearMessage = true,
  ) {
    setLoadState("loading");
    if (clearMessage) {
      setMessage("");
    }

    try {
      const params = new URLSearchParams({
        generation: nextGeneration,
        sort: nextSort,
      });
      if (nextMaxPrice !== "all") {
        params.set("maxPrice", nextMaxPrice);
      }
      if (nextWatchlistedOnly) {
        params.set("watchlistedOnly", "true");
      }
      if (nextChangedOnly) {
        params.set("changedOnly", "true");
      }
      const payload = await fetchJson<CayenneSearchResult>(
        `/api/cayenne?${params.toString()}`,
        { cache: "no-store" },
      );
      setData(payload);
      setLoadState("idle");
      return payload;
    } catch (error) {
      console.error(error);
      setMessage(
        getFriendlyErrorMessage(error, "Nie udało się pobrać ofert Cayenne."),
      );
      setLoadState("error");
      return undefined;
    }
  }

  async function runCollector() {
    setActionState("running");
    setMessage("");

    try {
      const payload = await fetchJson<{
        fetched: number;
        newOffers: number;
        priceChanges: number;
        disappeared: number;
        dealPushNotificationsSent?: number;
      }>("/api/cayenne/collector/run", {
        method: "POST",
      });
      setMessage(
        `OTOMOTO: pobrano ${payload.fetched}, nowe ${payload.newOffers}, zmiany cen ${payload.priceChanges}, zniknięte ${payload.disappeared}, push ${payload.dealPushNotificationsSent ?? 0}.`,
      );
      await loadOffers(
        sort,
        maxPrice,
        generation,
        watchlistedOnly,
        changedOnly,
        false,
      );
    } catch (error) {
      console.error(error);
      setMessage(
        getFriendlyErrorMessage(
          error,
          "Nie udało się odświeżyć ofert z OTOMOTO.",
        ),
      );
      setLoadState("error");
    } finally {
      setActionState("idle");
    }
  }

  function changeSort(nextSort: CayenneSort) {
    setSort(nextSort);
    void loadOffers(nextSort, maxPrice, generation, watchlistedOnly, changedOnly);
  }

  function changeMaxPrice(nextMaxPrice: MaxPriceValue) {
    setMaxPrice(nextMaxPrice);
    void loadOffers(sort, nextMaxPrice, generation, watchlistedOnly, changedOnly);
  }

  function changeGeneration(nextGeneration: CayenneGenerationFilter) {
    setGeneration(nextGeneration);
    void loadOffers(sort, maxPrice, nextGeneration, watchlistedOnly, changedOnly);
  }

  function changeChangedOnly(nextChangedOnly: boolean) {
    setChangedOnly(nextChangedOnly);
    void loadOffers(sort, maxPrice, generation, watchlistedOnly, nextChangedOnly);
  }

  function changeWatchlistedOnly(nextWatchlistedOnly: boolean) {
    setWatchlistedOnly(nextWatchlistedOnly);
    void loadOffers(sort, maxPrice, generation, nextWatchlistedOnly, changedOnly);
  }

  async function toggleWatchlist(offer: CayenneOfferView) {
    const nextIsWatchlisted = !offer.isWatchlisted;
    setData((current) => ({
      ...current,
      offers: current.offers.map((item) =>
        item.id === offer.id
          ? { ...item, isWatchlisted: nextIsWatchlisted }
          : item,
      ),
    }));
    setMessage("");

    try {
      const payload = await fetchJson<{
        id?: string;
        isWatchlisted?: boolean;
      }>(`/api/cayenne/${offer.id}/watchlist`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isWatchlisted: nextIsWatchlisted }),
      });

      setData((current) => {
        const offers =
          watchlistedOnly && !nextIsWatchlisted
            ? current.offers.filter((item) => item.id !== offer.id)
            : current.offers.map((item) =>
                item.id === offer.id && payload.id === offer.id
                  ? { ...item, isWatchlisted: Boolean(payload.isWatchlisted) }
                  : item,
              );

        return {
          ...current,
          offers,
          total:
            watchlistedOnly && !nextIsWatchlisted
              ? Math.max(0, current.total - 1)
              : current.total,
        };
      });
    } catch (error) {
      console.error(error);
      setData((current) => ({
        ...current,
        offers: current.offers.map((item) =>
          item.id === offer.id
            ? { ...item, isWatchlisted: offer.isWatchlisted }
            : item,
        ),
      }));
      setMessage(
        getFriendlyErrorMessage(
          error,
          "Nie udało się zaktualizować watchlisty Cayenne.",
        ),
      );
      setLoadState("error");
    }
  }

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

  function handlePreviewPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (!previewImage || previewImage.images.length < 2) {
      return;
    }

    previewSwipeStartRef.current = {
      x: event.clientX,
      y: event.clientY,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePreviewPointerUp(event: PointerEvent<HTMLDivElement>) {
    const swipeStart = previewSwipeStartRef.current;
    previewSwipeStartRef.current = null;

    if (!swipeStart || !previewImage || previewImage.images.length < 2) {
      return;
    }

    const deltaX = event.clientX - swipeStart.x;
    const deltaY = event.clientY - swipeStart.y;
    const isHorizontalSwipe =
      Math.abs(deltaX) >= 48 && Math.abs(deltaX) > Math.abs(deltaY) * 1.25;

    if (!isHorizontalSwipe) {
      return;
    }

    setPreviewImage((current) =>
      current ? movePreviewImage(current, deltaX > 0 ? -1 : 1) : current,
    );
  }

  function handlePreviewPointerCancel() {
    previewSwipeStartRef.current = null;
  }

  const isBusy = actionState === "running";

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-5 py-7 lg:px-8">
        <header className="flex flex-col gap-4 border-b border-slate-800 pb-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-medium uppercase tracking-wide text-cyan-300">
              Car Collector
            </p>
            <h1 className="mt-2 text-3xl font-semibold text-white">
              Porsche Cayenne
            </h1>
            <p className="mt-2 text-sm text-slate-400">
              POC monitorowania cen z OTOMOTO. Historia zaczyna się od
              pierwszego uruchomienia collectora.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:self-start lg:self-auto">
            <NavLink href="/">Panel ofert</NavLink>
            <NavLink href="/watchlist">Watchlista</NavLink>
            <NavLink href="/dashboard">Dashboard</NavLink>
            <NavLink href="/settings">Ustawienia</NavLink>
            <NavLink href="/help">Pomoc</NavLink>
          </div>
        </header>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard label="Oferty" value={formatNumber(data.total)} />
          <MetricCard
            label="Dostępne"
            value={formatNumber(
              data.offers.filter((offer) => offer.isAvailable).length,
            )}
          />
          <MetricCard
            label="Średnia cena"
            value={formatPrice(average(data.offers.map((offer) => offer.price)))}
          />
          <MetricCard
            label="Ostatni run"
            value={data.lastRun ? formatDateTime(data.lastRun.finishedAt) : "-"}
            detail={
              data.lastRun
                ? `${data.lastRun.fetched} pobrane / ${data.lastRun.status}`
                : "Brak uruchomień"
            }
          />
        </section>

        <section className="flex flex-col gap-4 rounded border border-slate-800 bg-slate-900 p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-white">
                Oferty z OTOMOTO
              </h2>
              <p className="mt-1 text-sm text-slate-400">
                Pokazujemy tylko nieuszkodzone auta, z ceną, rocznikiem,
                generacją, silnikiem, mocą, czasem ogłoszenia i galerią.
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-[minmax(250px,1.1fr)_minmax(210px,0.9fr)_minmax(170px,0.7fr)_minmax(145px,0.55fr)_minmax(145px,0.55fr)_auto]">
              <label className="flex min-h-11 min-w-0 items-center gap-2 rounded border border-slate-700 bg-slate-950 px-3 text-sm text-slate-200">
                Generacja
                <select
                  className="min-w-0 flex-1 bg-slate-950 pr-8 text-white outline-none"
                  disabled={isBusy}
                  onChange={(event) =>
                    changeGeneration(
                      event.target.value as CayenneGenerationFilter,
                    )
                  }
                  value={generation}
                >
                  <option value="currentAndPrevious">Obecna i poprzednia</option>
                  <option value="current">Obecna (2017+)</option>
                  <option value="previous">Poprzednia (2010-2016)</option>
                </select>
              </label>
              <label className="flex min-h-11 min-w-0 items-center gap-2 rounded border border-slate-700 bg-slate-950 px-3 text-sm text-slate-200">
                Sortuj
                <select
                  className="min-w-0 flex-1 bg-slate-950 pr-8 text-white outline-none"
                  disabled={isBusy}
                  onChange={(event) => changeSort(event.target.value as CayenneSort)}
                  value={sort}
                >
                  <option value="recentlyAdded">Ostatnio dodane</option>
                  <option value="dealScoreDesc">Ocena malejąco</option>
                  <option value="priceAsc">Cena rosnąco</option>
                  <option value="priceDesc">Cena malejąco</option>
                  <option value="deltaAsc">Największy spadek ceny</option>
                  <option value="deltaDesc">Największy wzrost ceny</option>
                  <option value="yearDesc">Rocznik malejąco</option>
                </select>
              </label>
              <label className="flex min-h-11 min-w-0 items-center gap-2 rounded border border-slate-700 bg-slate-950 px-3 text-sm text-slate-200">
                Maks. cena
                <select
                  className="min-w-0 flex-1 bg-slate-950 pr-8 text-white outline-none"
                  disabled={isBusy}
                  onChange={(event) =>
                    changeMaxPrice(event.target.value as MaxPriceValue)
                  }
                  value={maxPrice}
                >
                  <option value="150000">150 000 zł</option>
                  <option value="200000">200 000 zł</option>
                  <option value="250000">250 000 zł</option>
                  <option value="300000">300 000 zł</option>
                  <option value="350000">350 000 zł</option>
                  <option value="500000">500 000 zł</option>
                  <option value="750000">750 000 zł</option>
                  <option value="1000000">1 000 000 zł</option>
                  <option value="all">Bez limitu</option>
                </select>
              </label>
              <label className="flex min-h-11 min-w-0 cursor-pointer items-center gap-2 rounded border border-slate-700 bg-slate-950 px-3 text-sm font-medium text-slate-200 transition hover:border-cyan-400/70">
                <input
                  checked={changedOnly}
                  className="h-4 w-4 accent-amber-300"
                  disabled={isBusy}
                  onChange={(event) => changeChangedOnly(event.target.checked)}
                  type="checkbox"
                />
                Zmiany ceny
              </label>
              <label className="flex min-h-11 min-w-0 cursor-pointer items-center gap-2 rounded border border-slate-700 bg-slate-950 px-3 text-sm font-medium text-slate-200 transition hover:border-cyan-400/70">
                <input
                  checked={watchlistedOnly}
                  className="h-4 w-4 accent-cyan-400"
                  disabled={isBusy}
                  onChange={(event) =>
                    changeWatchlistedOnly(event.target.checked)
                  }
                  type="checkbox"
                />
                Watchlista
              </label>
              <button
                className="min-h-11 whitespace-nowrap rounded bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isBusy}
                onClick={runCollector}
                type="button"
              >
                {isBusy ? "Odświeżanie..." : "Odśwież OTOMOTO"}
              </button>
            </div>
          </div>

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
          {(loadState === "loading" || isBusy) && (
            <LinearProgress aria-label="Ładowanie Cayenne" sx={progressSx} />
          )}

          <div className="grid gap-3">
            {data.offers.length === 0 && loadState !== "loading" ? (
              <div className="rounded border border-slate-800 bg-slate-950/50 p-6 text-sm text-slate-400">
                Brak nieuszkodzonych ofert w wybranej generacji i limicie ceny.
              </div>
            ) : (
              data.offers.map((offer) => {
                const images = getOfferImages(offer);

                return (
                  <article
                    className="rounded border border-slate-800 bg-slate-950/50 p-4"
                    key={offer.id}
                  >
                    <div className="grid gap-4 md:grid-cols-[190px_1fr] xl:grid-cols-[190px_1fr_auto]">
                      <CayenneImageGallery
                        images={images}
                        offer={offer}
                        onPreview={(index) =>
                          setPreviewImage({
                            alt: offer.title,
                            images,
                            index,
                          })
                        }
                      />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="truncate text-base font-semibold text-white">
                            {offer.title}
                          </h3>
                          <AvailabilityBadge offer={offer} />
                          <GenerationBadge offer={offer} />
                          {offer.isWatchlisted && <WatchlistBadge />}
                          <RiskBadge offer={offer} />
                          <DealScoreBadge offer={offer} />
                          {offer.hasPriceChanged && (
                            <span className="rounded bg-amber-300 px-2 py-1 text-xs font-semibold text-slate-950">
                              cena zmieniona
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-sm text-slate-400">
                          ID {offer.externalId}
                          {offer.location ? ` / ${offer.location}` : ""}
                          {offer.region ? ` / ${offer.region}` : ""}
                        </p>
                        <dl className="mt-3 grid gap-2 text-sm text-slate-300 sm:grid-cols-4 lg:grid-cols-8">
                          <Detail label="Cena" value={formatPrice(offer.price)} />
                          <Detail
                            label="Zmiana"
                            value={<PriceDeltaBadge offer={offer} />}
                          />
                          <Detail label="Rocznik" value={formatYear(offer.year)} />
                          <Detail
                            label="Generacja"
                            value={formatGeneration(offer)}
                          />
                          <Detail
                            label="Silnik"
                            value={formatEngine(offer)}
                          />
                          <Detail
                            label="Moc"
                            value={formatPowerHp(offer.enginePowerHp)}
                          />
                          <Detail
                            label="Przebieg"
                            value={formatMileage(offer.mileageKm)}
                          />
                          <Detail
                            label="VAT / finans."
                            value={formatVatFinancing(offer)}
                          />
                          <Detail
                            label="Bezwypadkowy"
                            value={formatAccidentFree(offer)}
                          />
                          <Detail
                            label="Czas ogłoszenia"
                            value={offer.listingAgeLabel}
                            title={
                              offer.listingAgeBasis === "published"
                                ? "Od daty publikacji OTOMOTO"
                                : "Od pierwszego wykrycia przez tracker"
                            }
                          />
                          <Detail
                            label="Historia"
                            value={`${offer.priceHistory.length} pkt`}
                          />
                        </dl>
                        {offer.hasDealRisk && offer.dealRiskReason ? (
                          <p className="mt-3 rounded border border-amber-300/30 bg-amber-300/10 px-3 py-2 text-xs font-medium text-amber-100">
                            Do weryfikacji: {offer.dealRiskReason}
                          </p>
                        ) : null}
                        {formatDealReasons(offer) ? (
                          <p className="mt-3 text-xs text-slate-500">
                            {formatDealReasons(offer)}
                          </p>
                        ) : null}
                      </div>
                      <div className="flex items-start gap-2 md:justify-start xl:flex-col">
                        <button
                          className={`inline-flex min-h-10 items-center rounded px-3 py-2 text-sm font-semibold transition ${
                            offer.isWatchlisted
                              ? "bg-cyan-400/15 text-cyan-100 ring-1 ring-cyan-400/40 hover:bg-cyan-400/25"
                              : "bg-slate-800 text-slate-100 ring-1 ring-slate-700 hover:bg-slate-700"
                          }`}
                          disabled={isBusy}
                          onClick={() => toggleWatchlist(offer)}
                          type="button"
                        >
                          {offer.isWatchlisted ? "Obserwowane" : "Obserwuj"}
                        </button>
                        <a
                          className="inline-flex min-h-10 items-center rounded bg-cyan-400 px-3 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300"
                          href={offer.offerUrl}
                          rel="noopener noreferrer"
                          target="_blank"
                        >
                          OTOMOTO
                        </a>
                      </div>
                    </div>
                  </article>
                );
              })
            )}
          </div>
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
            <div
              className="touch-pan-y select-none"
              onPointerCancel={handlePreviewPointerCancel}
              onPointerDown={handlePreviewPointerDown}
              onPointerUp={handlePreviewPointerUp}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                alt={previewImage.alt}
                className="max-h-[calc(100vh-6rem)] w-full rounded object-contain"
                draggable={false}
                src={previewImage.images[previewImage.index]}
              />
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function CayenneImageGallery({
  images,
  offer,
  onPreview,
}: {
  images: string[];
  offer: CayenneOfferView;
  onPreview: (index: number) => void;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const gallerySwipeStartRef = useRef<{ x: number; y: number } | null>(null);
  const ignoreNextClickRef = useRef(false);

  if (images.length === 0) {
    return (
      <div className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded bg-slate-800">
        <div className="px-3 text-center text-xs font-semibold uppercase tracking-wide text-slate-500">
          Brak zdjęcia
        </div>
      </div>
    );
  }

  const safeActiveIndex = Math.min(activeIndex, images.length - 1);
  const activeImage = images[safeActiveIndex] || images[0];

  function moveGalleryImage(direction: -1 | 1) {
    setActiveIndex(
      (current) => (current + direction + images.length) % images.length,
    );
  }

  function handleGalleryPointerDown(event: PointerEvent<HTMLButtonElement>) {
    if (images.length < 2 || event.pointerType === "mouse") {
      return;
    }

    gallerySwipeStartRef.current = {
      x: event.clientX,
      y: event.clientY,
    };
    ignoreNextClickRef.current = false;
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handleGalleryPointerUp(event: PointerEvent<HTMLButtonElement>) {
    const swipeStart = gallerySwipeStartRef.current;
    gallerySwipeStartRef.current = null;

    if (!swipeStart || images.length < 2) {
      return;
    }

    const deltaX = event.clientX - swipeStart.x;
    const deltaY = event.clientY - swipeStart.y;
    const isHorizontalSwipe =
      Math.abs(deltaX) >= 40 && Math.abs(deltaX) > Math.abs(deltaY) * 1.2;

    if (!isHorizontalSwipe) {
      return;
    }

    ignoreNextClickRef.current = true;
    moveGalleryImage(deltaX > 0 ? -1 : 1);
  }

  function handleGalleryPointerCancel() {
    gallerySwipeStartRef.current = null;
  }

  function handleGalleryPreviewClick(index: number) {
    if (ignoreNextClickRef.current) {
      ignoreNextClickRef.current = false;
      return;
    }

    onPreview(index);
  }

  return (
    <div className="grid gap-2">
      <button
        aria-label={`Powiększ zdjęcie: ${offer.title}`}
        className="relative flex aspect-[4/3] touch-pan-y select-none items-center justify-center overflow-hidden rounded bg-slate-800"
        onClick={() => handleGalleryPreviewClick(safeActiveIndex)}
        onPointerCancel={handleGalleryPointerCancel}
        onPointerDown={handleGalleryPointerDown}
        onPointerUp={handleGalleryPointerUp}
        type="button"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          alt={offer.title}
          className="h-full w-full object-cover transition duration-200 hover:scale-105"
          draggable={false}
          src={activeImage}
        />
        {images.length > 1 && (
          <>
            <span className="absolute bottom-1.5 right-1.5 rounded bg-slate-950/85 px-2 py-1 text-xs font-semibold text-white">
              {safeActiveIndex + 1} / {images.length}
            </span>
            <span className="absolute bottom-2 left-2 flex max-w-[55%] gap-1 overflow-hidden">
              {images.slice(0, 8).map((image, index) => (
                <span
                  aria-hidden="true"
                  className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                    index === safeActiveIndex ? "bg-white" : "bg-white/40"
                  }`}
                  key={`${image}-${index}`}
                />
              ))}
            </span>
          </>
        )}
      </button>
      {images.length > 1 && (
        <div className="grid grid-cols-4 gap-1 md:grid-cols-3">
          {images.slice(1, 4).map((image, index) => (
            <button
              aria-label={`Powiększ zdjęcie ${index + 2}: ${offer.title}`}
              className={`relative aspect-[4/3] overflow-hidden rounded bg-slate-800 ring-1 transition hover:ring-cyan-400 ${
                safeActiveIndex === index + 1
                  ? "ring-cyan-400"
                  : "ring-slate-700"
              }`}
              key={image}
              onClick={() => setActiveIndex(index + 1)}
              type="button"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img alt="" className="h-full w-full object-cover" src={image} />
              {index === 2 && images.length > 4 && (
                <span className="absolute inset-0 flex items-center justify-center bg-slate-950/65 text-xs font-semibold text-white">
                  +{images.length - 4}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function NavLink({ children, href }: { children: React.ReactNode; href: string }) {
  return (
    <Link
      className="min-h-12 rounded border border-slate-700 px-4 py-3 text-center text-sm font-semibold leading-tight text-slate-100 transition hover:border-cyan-400 hover:text-cyan-100"
      href={href}
    >
      {children}
    </Link>
  );
}

function MetricCard({
  detail,
  label,
  value,
}: {
  detail?: string;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded border border-slate-800 bg-slate-900 p-4">
      <p className="text-xs font-semibold uppercase text-slate-500">{label}</p>
      <p className="mt-2 text-xl font-semibold text-white">{value}</p>
      {detail && <p className="mt-2 text-xs text-slate-500">{detail}</p>}
    </div>
  );
}

function AvailabilityBadge({ offer }: { offer: CayenneOfferView }) {
  if (!offer.isAvailable) {
    return (
      <span className="inline-flex min-h-6 items-center gap-1.5 rounded bg-amber-300/15 px-2 py-1 text-xs font-semibold text-amber-100 ring-1 ring-amber-300/30">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-300" />
        Zniknęła
      </span>
    );
  }

  return (
    <span className="inline-flex min-h-6 items-center gap-1.5 rounded bg-emerald-400/10 px-2 py-1 text-xs font-semibold text-emerald-100 ring-1 ring-emerald-400/30">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
      Dostępna
    </span>
  );
}

function GenerationBadge({ offer }: { offer: CayenneOfferView }) {
  return (
    <span className="inline-flex min-h-6 items-center rounded bg-slate-700/60 px-2 py-1 text-xs font-semibold text-slate-200 ring-1 ring-slate-600">
      {formatGeneration(offer)}
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

function RiskBadge({ offer }: { offer: CayenneOfferView }) {
  if (!offer.hasDealRisk) {
    return null;
  }

  return (
    <span
      className="inline-flex min-h-6 items-center gap-1.5 rounded bg-amber-300/15 px-2 py-1 text-xs font-semibold text-amber-100 ring-1 ring-amber-300/30"
      title={offer.dealRiskReason || "Oferta wymaga dodatkowej weryfikacji"}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-amber-300" />
      Do weryfikacji
    </span>
  );
}

function DealScoreBadge({ offer }: { offer: CayenneOfferView }) {
  const score = offer.dealScore?.score;

  if (typeof score !== "number") {
    return null;
  }

  const toneClassName =
    score >= 80
      ? "bg-emerald-400/15 text-emerald-100 ring-emerald-400/30"
      : score >= 65
        ? "bg-cyan-400/15 text-cyan-100 ring-cyan-400/30"
        : score >= 50
          ? "bg-amber-300/15 text-amber-100 ring-amber-300/30"
          : "bg-slate-700/60 text-slate-200 ring-slate-600";

  return (
    <span
      className={`inline-flex min-h-6 items-center rounded px-2 py-1 text-xs font-semibold ring-1 ${toneClassName}`}
      title={offer.dealScore?.reasons.join(", ")}
    >
      {score >= 50 ? "Okazja" : "Ocena"} {score}/100
    </span>
  );
}

function PriceDeltaBadge({ offer }: { offer: CayenneOfferView }) {
  if (!offer.priceDelta) {
    return <span className="text-slate-500">-</span>;
  }

  const { amount, percent } = offer.priceDelta;
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
      title={`Poprzednio: ${formatPrice(offer.priceDelta.previousPrice)}`}
    >
      {formatSignedPrice(amount)} ({formatSignedPercent(percent)})
    </span>
  );
}

function Detail({
  label,
  title,
  value,
}: {
  label: string;
  title?: string;
  value: React.ReactNode;
}) {
  return (
    <div title={title}>
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-medium text-slate-100">{value}</dd>
    </div>
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

function getOfferImages(offer: CayenneOfferView): string[] {
  return Array.from(
    new Set([offer.imageUrl || undefined, ...(offer.imageUrls || [])].filter(Boolean)),
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

function average(values: number[]): number | undefined {
  if (values.length === 0) {
    return undefined;
  }

  return Math.round(values.reduce((total, value) => total + value, 0) / values.length);
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
  }).format(Math.abs(value));

  if (value === 0) return `${formatted}%`;
  return `${value > 0 ? "+" : "-"}${formatted}%`;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("pl-PL").format(value);
}

function formatYear(value?: number) {
  return value ? String(value) : "-";
}

function formatMileage(value?: number) {
  if (!value) return "-";
  return `${new Intl.NumberFormat("pl-PL").format(value)} km`;
}

function formatPowerHp(value?: number) {
  if (!value) return "-";
  return `${new Intl.NumberFormat("pl-PL").format(value)} KM`;
}

function formatEngine(offer: CayenneOfferView) {
  const values = [
    offer.engineSizeCc
      ? `${new Intl.NumberFormat("pl-PL").format(offer.engineSizeCc)} cm3`
      : null,
    offer.fuelType,
    offer.transmission,
  ].filter(Boolean);

  return values.length > 0 ? values.join(" / ") : "-";
}

function formatGeneration(offer: CayenneOfferView) {
  if (offer.generation === "current") return "Obecna";
  if (offer.generation === "previous") return "Poprzednia";
  if (offer.generation === "other") return "Starsza";
  return "Nieznana";
}

function formatVatFinancing(offer: CayenneOfferView) {
  const values = [
    offer.hasVatInvoice ? "VAT" : null,
    offer.hasFinancing ? "finans." : null,
  ].filter(Boolean);

  return values.length > 0 ? values.join(" + ") : "-";
}

function formatAccidentFree(offer: CayenneOfferView) {
  if (offer.isAccidentFree === true) return "Tak";
  if (offer.isAccidentFree === false) return "Nie";
  return "Brak danych";
}

function formatDealReasons(offer: CayenneOfferView) {
  return (
    offer.dealScore?.reasons
      .filter((reason) => reason !== offer.dealRiskReason)
      .slice(0, 4)
      .join(" / ") || ""
  );
}

function formatDateTime(value?: string) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("pl-PL", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

const progressSx = {
  height: 6,
  borderRadius: 999,
  backgroundColor: "#1e293b",
  "& .MuiLinearProgress-bar": {
    borderRadius: 999,
    backgroundColor: "#22d3ee",
  },
};
