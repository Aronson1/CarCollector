"use client";

import { useEffect, useRef, useState } from "react";
import type { PointerEvent } from "react";
import Link from "next/link";
import LinearProgress from "@mui/material/LinearProgress";
import { formatAvailabilitySummary } from "@/lib/availability-format";
import type { CarOfferView, PurchaseOption } from "@/lib/types";

type LoadState = "idle" | "loading" | "error";

const purchaseOptions: PurchaseOption[] = ["release", "sale", "newRelease"];

export default function WatchlistPage() {
  const [cars, setCars] = useState<CarOfferView[]>([]);
  const [purchaseOption, setPurchaseOption] =
    useState<PurchaseOption>("release");
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [message, setMessage] = useState("");
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<{
    alt: string;
    images: string[];
    index: number;
  } | null>(null);
  const previewSwipeStartRef = useRef<{ x: number; y: number } | null>(null);

  async function loadWatchlist(nextPurchaseOption = purchaseOption) {
    setLoadState("loading");
    setMessage("");

    const params = new URLSearchParams({
      purchaseOption: nextPurchaseOption,
      watchlistedOnly: "true",
      sort: "dealScoreDesc",
      page: "1",
      pageSize: "all",
    });

    try {
      const response = await fetch(`/api/cars?${params.toString()}`, {
        cache: "no-store",
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.message || "Could not load watchlist.");
      }

      setCars(payload.cars || []);
      setUpdatedAt(payload.listUpdatedAt || null);
      setLoadState("idle");
    } catch (error) {
      console.error(error);
      setMessage(
        error instanceof Error
          ? error.message
          : "Nie udało się pobrać watchlisty.",
      );
      setLoadState("error");
    }
  }

  async function removeFromWatchlist(car: CarOfferView) {
    setCars((current) => current.filter((item) => item.id !== car.id));
    setMessage("");

    try {
      const response = await fetch(`/api/cars/${car.id}/watchlist`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isWatchlisted: false }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.message || "Could not update watchlist.");
      }
    } catch (error) {
      console.error(error);
      setCars((current) => [car, ...current]);
      setMessage(
        error instanceof Error
          ? error.message
          : "Nie udało się zdjąć auta z watchlisty.",
      );
      setLoadState("error");
    }
  }

  function changePurchaseOption(nextPurchaseOption: PurchaseOption) {
    if (nextPurchaseOption === purchaseOption) return;
    setPurchaseOption(nextPurchaseOption);
    void loadWatchlist(nextPurchaseOption);
  }

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadWatchlist();
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

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-5 py-7 lg:px-8">
        <header className="flex flex-col gap-4 border-b border-slate-800 pb-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-medium uppercase tracking-wide text-cyan-300">
              Car Collector
            </p>
            <h1 className="mt-2 text-3xl font-semibold text-white">
              Watchlista
            </h1>
            {updatedAt && (
              <p className="mt-2 text-sm text-slate-400">
                Ostatnia aktualizacja ofert: {formatDateTime(updatedAt)}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Link className={navLinkClassName} href="/">
              Panel ofert
            </Link>
            <Link className={navLinkClassName} href="/dashboard">
              Dashboard trendów
            </Link>
            <Link className={navLinkClassName} href="/settings">
              Ustawienia
            </Link>
            <Link className={navLinkClassName} href="/help">
              Pomoc
            </Link>
          </div>
        </header>

        <section className="flex flex-col gap-4">
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
          {loadState === "loading" && (
            <LinearProgress aria-label="Ładowanie watchlisty" sx={progressSx} />
          )}
        </section>

        <section className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-lg font-semibold text-white">
              {getPurchaseOptionLabel(purchaseOption)} ({cars.length})
            </h2>
          </div>

          {cars.length === 0 && loadState !== "loading" ? (
            <div className="rounded border border-slate-800 bg-slate-900 p-6 text-sm text-slate-400">
              Brak obserwowanych aut w tym typie ofert.
            </div>
          ) : (
            <div className="grid gap-3">
              {cars.map((car) => {
                const carImages = getCarImages(car);

                return (
                  <article
                    className="rounded border border-slate-800 bg-slate-900 p-4"
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
                          <AvailabilityBadge car={car} />
                          <DealScoreBadge car={car} />
                        </div>
                        <p className="mt-1 text-sm text-slate-400">
                          {car.brand} / {car.model} / ID {car.externalId}
                        </p>
                        <dl className="mt-3 grid gap-2 text-sm text-slate-300 sm:grid-cols-7">
                          <div>
                            <dt className="text-slate-500">
                              {getPriceLabel(car.purchaseOption)}
                            </dt>
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
                            <dt className="text-slate-500">Rok</dt>
                            <dd>{formatYear(car.details.registrationYear)}</dd>
                          </div>
                          <div>
                            <dt className="text-slate-500">Przebieg</dt>
                            <dd>{formatMileage(car.details.mileage)}</dd>
                          </div>
                          <div>
                            <dt className="text-slate-500">Historia</dt>
                            <dd>{car.priceHistory.length} punktów</dd>
                          </div>
                          <div>
                            <dt className="text-slate-500">Dostępność</dt>
                            <dd>{formatAvailabilitySummary(car)}</dd>
                          </div>
                        </dl>
                      </div>
                      <div className="flex items-start gap-2 md:flex-col">
                        <button
                          className="h-9 rounded bg-cyan-400 px-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300"
                          onClick={() => removeFromWatchlist(car)}
                          type="button"
                        >
                          Usuń
                        </button>
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
                  </article>
                );
              })}
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

function CarImageGallery({
  car,
  images,
  onPreview,
}: {
  car: CarOfferView;
  images: string[];
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
        aria-label={`Powiększ zdjęcie: ${car.fullName}`}
        className="relative flex aspect-[4/3] touch-pan-y select-none items-center justify-center overflow-hidden rounded bg-slate-800"
        onClick={() => handleGalleryPreviewClick(safeActiveIndex)}
        onPointerCancel={handleGalleryPointerCancel}
        onPointerDown={handleGalleryPointerDown}
        onPointerUp={handleGalleryPointerUp}
        type="button"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          alt={car.fullName}
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
        <div className="grid grid-cols-3 gap-1">
          {images.slice(1, 4).map((image, index) => (
            <button
              aria-label={`Powiększ zdjęcie ${index + 2}: ${car.fullName}`}
              className={`aspect-[4/3] overflow-hidden rounded bg-slate-800 ring-1 transition hover:ring-cyan-400 ${
                safeActiveIndex === index + 1
                  ? "ring-cyan-400"
                  : "ring-slate-700"
              }`}
              key={image}
              onClick={() => setActiveIndex(index + 1)}
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

function AvailabilityBadge({ car }: { car: CarOfferView }) {
  const status =
    car.availabilityStatus || (car.isAvailable ? "available" : "disappeared");

  if (status === "reserved") {
    return (
      <span className="inline-flex min-h-6 items-center gap-1.5 rounded bg-orange-300/15 px-2 py-1 text-xs font-semibold text-orange-100 ring-1 ring-orange-300/30">
        <span className="h-1.5 w-1.5 rounded-full bg-orange-300" />
        Zarezerwowana
      </span>
    );
  }

  if (status === "disappeared") {
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
      Dostępny
    </span>
  );
}

function DealScoreBadge({ car }: { car: CarOfferView }) {
  if (!car.dealScore) return null;

  const score = car.dealScore.score;
  const primaryReason = car.dealScore.reasons.find((reason) =>
    reason.includes("tańsza od podobnych"),
  );
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
      className={`inline-flex min-h-6 max-w-full flex-wrap items-center gap-x-1 rounded px-2 py-1 text-xs font-semibold ring-1 ${className}`}
      title={car.dealScore.reasons.join(", ")}
    >
      <span>Okazja {score}/100</span>
      {primaryReason && <span>· {primaryReason}</span>}
    </span>
  );
}

function PriceDeltaBadge({ car }: { car: CarOfferView }) {
  if (!car.priceDelta) {
    return <span className="text-slate-500">-</span>;
  }

  const { amount, percent } = car.priceDelta;
  const className =
    amount < 0
      ? "bg-emerald-400/15 text-emerald-200 ring-emerald-400/30"
      : amount > 0
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

function getPurchaseOptionLabel(purchaseOption: PurchaseOption) {
  if (purchaseOption === "sale") return "Zakup używane";
  if (purchaseOption === "newRelease") return "Najem nowe";
  return "Najem używane";
}

function getPriceLabel(purchaseOption: PurchaseOption) {
  if (purchaseOption === "sale") return "Cena zakupu netto";
  return "Cena najmu netto";
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

function formatDateTime(value?: string) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("pl-PL", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
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

const navLinkClassName =
  "min-h-12 rounded border border-slate-700 px-4 py-3 text-center text-sm font-semibold leading-tight text-slate-100 transition hover:border-cyan-400 hover:text-cyan-100";

const progressSx = {
  height: 6,
  borderRadius: 999,
  backgroundColor: "#1e293b",
  "& .MuiLinearProgress-bar": {
    borderRadius: 999,
    backgroundColor: "#22d3ee",
  },
};
