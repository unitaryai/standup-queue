// Shares the queue between everyone in the call.
//
// Inside Meet the queue is one Firestore document per meeting. Every change
// runs in a transaction, so two people clicking at once can't overwrite each
// other, and everyone gets live updates from a snapshot listener.
// Outside Meet (local testing) it falls back to a BroadcastChannel, so several
// browser tabs on one machine behave like several people in a call. Add
// `?room=anything` to test against Firestore from ordinary browser tabs.

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import {
  doc,
  getFirestore,
  onSnapshot,
  runTransaction,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { CLOUD_PROJECT_NUMBER } from "./config.js";
import { FIREBASE_CONFIG } from "./firebase-config.js";
import { emptyState, parseState } from "./queue.js";

// A recurring meeting keeps the same ID every day, so a queue that hasn't
// changed for this long is treated as yesterday's and starts empty.
const STALE_AFTER_MS = 12 * 60 * 60 * 1000;

export function inMeet() {
  return new URLSearchParams(location.search).has("meet_sdk");
}

export function testRoom() {
  return new URLSearchParams(location.search).get("room");
}

export async function createMeetSession() {
  return window.meet.addon.createAddonSession({ cloudProjectNumber: CLOUD_PROJECT_NUMBER });
}

/**
 * @typedef {{ update: (action: (state: object) => object, optimistic: object) => Promise<void> }} Transport
 * @param {(raw: unknown) => void} onRemoteState called whenever the shared queue changes
 * @param {string | null} room the meeting to share a queue with, or null for local tabs only
 * @returns {Promise<Transport>}
 */
export async function connect(onRemoteState, room) {
  return room ? connectFirestore(onRemoteState, room) : connectLocal(onRemoteState);
}

function readDoc(snapshot) {
  if (!snapshot.exists()) return emptyState();
  const data = snapshot.data();
  const updatedAt = data.updatedAt?.toMillis?.();
  // A pending local write has no server timestamp yet, and is fresh by definition.
  if (updatedAt && Date.now() - updatedAt > STALE_AFTER_MS) return { ...emptyState(), rev: data.rev ?? 0 };
  return parseState(data) ?? emptyState();
}

async function connectFirestore(onRemoteState, room) {
  const app = initializeApp(FIREBASE_CONFIG);
  await signInAnonymously(getAuth(app));
  const db = getFirestore(app);
  const ref = doc(db, "meetings", room.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 200));

  onSnapshot(
    ref,
    (snapshot) => onRemoteState(readDoc(snapshot)),
    (error) => console.error("Standup queue: live updates stopped", error),
  );

  return {
    async update(action) {
      await runTransaction(db, async (tx) => {
        const current = readDoc(await tx.get(ref));
        const next = action(current);
        if (next === current) return;
        tx.set(ref, { ...next, updatedAt: serverTimestamp() });
      });
    },
  };
}

const LOCAL_KEY = "standup-queue:local-state";

function connectLocal(onRemoteState) {
  const channel = new BroadcastChannel("standup-queue");
  channel.onmessage = (event) => onRemoteState(event.data);
  try {
    const saved = localStorage.getItem(LOCAL_KEY);
    if (saved) queueMicrotask(() => onRemoteState(JSON.parse(saved)));
  } catch {
    // Storage unavailable: start empty.
  }
  return {
    async update(_action, optimistic) {
      channel.postMessage(optimistic);
      try {
        localStorage.setItem(LOCAL_KEY, JSON.stringify(optimistic));
      } catch {
        // Storage unavailable: tabs opened later start empty.
      }
    },
  };
}
