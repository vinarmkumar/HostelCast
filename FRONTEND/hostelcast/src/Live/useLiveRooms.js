import { useSyncExternalStore } from "react";
import { io } from "socket.io-client";
import { apiOrigin, apiUrl } from "../apiUrl.js";

const EMPTY_ROOMS = [];
const initialSnapshot = { rooms: EMPTY_ROOMS, loading: true, error: "" };
let snapshot = initialSnapshot;
let socket;
let activeConsumers = 0;
let refreshPromise;
let refreshAgain = false;
let refreshTimer;
let refreshInterval;
let abortController;
const listeners = new Set();

function emitSnapshot(nextSnapshot) {
  snapshot = nextSnapshot;
  listeners.forEach((listener) => listener());
}

async function refreshRooms() {
  if (!activeConsumers) return;
  if (refreshPromise) {
    refreshAgain = true;
    return refreshPromise;
  }

  abortController = new AbortController();
  refreshPromise = (async () => {
    try {
      const response = await fetch(apiUrl("/api/live/rooms"), {
        signal: abortController.signal,
        cache: "no-store",
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "Live casts could not be loaded.");
      emitSnapshot({ rooms: result.rooms, loading: false, error: "" });
    } catch (loadError) {
      if (loadError.name !== "AbortError") {
        emitSnapshot({ ...snapshot, loading: false, error: loadError.message });
      }
    } finally {
      refreshPromise = null;
      abortController = null;
      if (refreshAgain && activeConsumers) {
        refreshAgain = false;
        scheduleRefresh();
      }
    }
  })();
  return refreshPromise;
}

function scheduleRefresh() {
  if (refreshTimer || !activeConsumers) return;
  refreshTimer = window.setTimeout(() => {
    refreshTimer = null;
    refreshRooms();
  }, 100);
}

function refreshWhenVisible() {
  if (document.visibilityState === "visible") refreshRooms();
}

function startStore() {
  if (socket) return;
  socket = io(apiOrigin, { path: "/socket.io" });
  socket.on("connect", refreshRooms);
  socket.on("live:rooms:update", scheduleRefresh);
  document.addEventListener("visibilitychange", refreshWhenVisible);
  window.addEventListener("pageshow", refreshRooms);
  refreshRooms();
  refreshInterval = window.setInterval(() => {
    refreshWhenVisible();
  }, 5_000);
}

function stopStore() {
  if (refreshTimer) window.clearTimeout(refreshTimer);
  if (refreshInterval) window.clearInterval(refreshInterval);
  refreshTimer = null;
  refreshInterval = null;
  refreshAgain = false;
  document.removeEventListener("visibilitychange", refreshWhenVisible);
  window.removeEventListener("pageshow", refreshRooms);
  abortController?.abort();
  socket?.disconnect();
  socket = undefined;
}

function subscribe(listener) {
  listeners.add(listener);
  activeConsumers += 1;
  if (activeConsumers === 1) startStore();
  return () => {
    listeners.delete(listener);
    activeConsumers = Math.max(0, activeConsumers - 1);
    if (!activeConsumers) stopStore();
  };
}

function getSnapshot() {
  return snapshot;
}

export default function useLiveRooms() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
