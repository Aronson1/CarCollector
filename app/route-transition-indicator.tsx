"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const showDelayMs = 180;
const fallbackHideMs = 8000;

export function RouteTransitionIndicator() {
  const pathname = usePathname();
  const [isVisible, setIsVisible] = useState(false);
  const showTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function clearTimers() {
      if (showTimerRef.current) {
        clearTimeout(showTimerRef.current);
        showTimerRef.current = null;
      }

      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
    }

    function startIndicator(event: MouseEvent) {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }

      const anchor = (event.target as Element | null)?.closest("a");

      if (!anchor || !shouldTrackNavigation(anchor)) {
        return;
      }

      clearTimers();
      showTimerRef.current = setTimeout(() => setIsVisible(true), showDelayMs);
      hideTimerRef.current = setTimeout(() => setIsVisible(false), fallbackHideMs);
    }

    document.addEventListener("click", startIndicator, true);

    return () => {
      document.removeEventListener("click", startIndicator, true);
      clearTimers();
    };
  }, []);

  useEffect(() => {
    if (showTimerRef.current) {
      clearTimeout(showTimerRef.current);
      showTimerRef.current = null;
    }

    hideTimerRef.current = setTimeout(() => setIsVisible(false), 0);

    return () => {
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
    };
  }, [pathname]);

  if (!isVisible) {
    return null;
  }

  return (
    <div
      aria-live="polite"
      aria-label="Ładowanie strony"
      className="pointer-events-none fixed inset-x-0 top-0 z-50"
      role="status"
    >
      <div className="h-1 w-full overflow-hidden bg-slate-800/80">
        <div className="route-transition-bar h-full bg-cyan-300" />
      </div>
      <div className="mx-auto mt-3 w-fit rounded border border-slate-700 bg-slate-950/95 px-3 py-2 text-xs font-semibold text-slate-100 shadow-lg shadow-black/30">
        Ładowanie...
      </div>
    </div>
  );
}

function shouldTrackNavigation(anchor: HTMLAnchorElement) {
  if (anchor.target && anchor.target !== "_self") {
    return false;
  }

  if (anchor.hasAttribute("download")) {
    return false;
  }

  const url = new URL(anchor.href, window.location.href);

  if (url.origin !== window.location.origin) {
    return false;
  }

  const currentPath = `${window.location.pathname}${window.location.search}`;
  const nextPath = `${url.pathname}${url.search}`;

  return currentPath !== nextPath;
}
