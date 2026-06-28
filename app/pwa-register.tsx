"use client";

import { useEffect, useState } from "react";

const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

export function PwaRegister() {
  const [canSubscribe, setCanSubscribe] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    if (process.env.NODE_ENV !== "production") {
      void cleanupDevelopmentServiceWorkers().catch((error) => {
        console.error("Development service worker cleanup failed", error);
      });
      return;
    }

    const registerServiceWorker = () => {
      navigator.serviceWorker
        .register("/sw.js")
        .then(async (registration) => {
          if (
            !vapidPublicKey ||
            !("PushManager" in window) ||
            !("Notification" in window)
          ) {
            return;
          }
          const existingSubscription =
            await registration.pushManager.getSubscription();

          setCanSubscribe(
            !existingSubscription && Notification.permission !== "denied",
          );
        })
        .catch((error) => {
          console.error("Service worker registration failed", error);
        });
    };

    if (document.readyState === "loading") {
      window.addEventListener("load", registerServiceWorker, { once: true });
      return () => window.removeEventListener("load", registerServiceWorker);
    }

    registerServiceWorker();
  }, []);

  async function subscribeToPush() {
    if (!vapidPublicKey || isSaving || !("Notification" in window)) return;

    setIsSaving(true);

    try {
      const registration = await navigator.serviceWorker.ready;
      const permission = await Notification.requestPermission();

      if (permission !== "granted") {
        setCanSubscribe(false);
        return;
      }

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToArrayBuffer(vapidPublicKey),
      });

      const response = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subscription.toJSON()),
      });

      if (!response.ok) {
        throw new Error("Push subscription save failed");
      }

      setCanSubscribe(false);
    } catch (error) {
      console.error("Push subscription failed", error);
    } finally {
      setIsSaving(false);
    }
  }

  if (!canSubscribe) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={subscribeToPush}
      disabled={isSaving}
      style={{
        position: "fixed",
        right: 16,
        bottom: 16,
        zIndex: 1000,
        border: "1px solid rgba(148, 163, 184, 0.35)",
        borderRadius: 8,
        background: "#020617",
        color: "#f8fafc",
        font: "600 13px/1.2 system-ui, sans-serif",
        padding: "10px 12px",
        boxShadow: "0 12px 30px rgba(2, 6, 23, 0.25)",
        cursor: isSaving ? "wait" : "pointer",
        opacity: isSaving ? 0.7 : 1,
      }}
    >
      {isSaving ? "Włączanie alertów..." : "Włącz alerty okazji"}
    </button>
  );
}

async function cleanupDevelopmentServiceWorkers() {
  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(registrations.map((registration) => registration.unregister()));

  if ("caches" in window) {
    const cacheNames = await window.caches.keys();
    await Promise.all(
      cacheNames
        .filter((cacheName) => cacheName.startsWith("car-collector-"))
        .map((cacheName) => window.caches.delete(cacheName)),
    );
  }
}

function urlBase64ToArrayBuffer(value: string): ArrayBuffer {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = `${value}${padding}`.replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const output = new Uint8Array(new ArrayBuffer(rawData.length));

  for (let index = 0; index < rawData.length; index += 1) {
    output[index] = rawData.charCodeAt(index);
  }

  return output.buffer;
}
