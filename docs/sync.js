// Shares the queue between everyone in the call.
//
// Inside Meet this uses the Co-Doing API: each broadcast replaces the shared
// state for all participants, and late joiners receive the latest state.
// Outside Meet (local testing) it falls back to a BroadcastChannel, so several
// browser tabs on one machine behave like several people in a call.

import { ACTIVITY_TITLE, CLOUD_PROJECT_NUMBER } from "./config.js";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function inMeet() {
  return new URLSearchParams(location.search).has("meet_sdk");
}

export async function createMeetSession() {
  return window.meet.addon.createAddonSession({ cloudProjectNumber: CLOUD_PROJECT_NUMBER });
}

/**
 * @param {(raw: unknown) => void} onRemoteState called with states from other participants
 * @returns {Promise<{ send: (state: object) => void }>}
 */
export async function connect(onRemoteState, session) {
  if (session) {
    const client = await session.createCoDoingClient({
      activityTitle: ACTIVITY_TITLE,
      onCoDoingStateChanged(update) {
        try {
          onRemoteState(JSON.parse(decoder.decode(update.bytes)));
        } catch (error) {
          console.warn("Ignoring unreadable queue update", error);
        }
      },
    });
    return {
      send: (state) => client.broadcastStateUpdate({ bytes: encoder.encode(JSON.stringify(state)) }),
    };
  }
  return connectLocal(onRemoteState);
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
    send(state) {
      channel.postMessage(state);
      try {
        localStorage.setItem(LOCAL_KEY, JSON.stringify(state));
      } catch {
        // Storage unavailable: tabs opened later start empty.
      }
    },
  };
}
