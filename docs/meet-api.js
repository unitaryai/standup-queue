// Lists who is in the call right now, using the Meet REST API.
//
// Only the person who clicks "Add everyone in the call" signs in. Google
// Identity Services opens a consent popup the first time and returns a
// short-lived access token, which is kept in memory only.

import { GOOGLE_OAUTH_CLIENT_ID } from "./config.js";

const SCOPE = "https://www.googleapis.com/auth/meetings.space.readonly";
const API = "https://meet.googleapis.com/v2";

let token = null;
let tokenExpiresAt = 0;

export function isConfigured() {
  return !GOOGLE_OAUTH_CLIENT_ID.startsWith("YOUR_");
}

function requestToken() {
  if (token && Date.now() < tokenExpiresAt) return Promise.resolve(token);
  return new Promise((resolve, reject) => {
    if (!window.google?.accounts?.oauth2) {
      reject(new Error("Google sign-in didn't load. Reload the add-on and try again."));
      return;
    }
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_OAUTH_CLIENT_ID,
      scope: SCOPE,
      callback: (response) => {
        if (response.error) return reject(new Error(`Google sign-in failed: ${response.error}`));
        token = response.access_token;
        // Refresh a minute early so a request never races the expiry.
        tokenExpiresAt = Date.now() + (Number(response.expires_in) - 60) * 1000;
        resolve(token);
      },
      error_callback: (error) => reject(new Error(`Google sign-in was closed or blocked (${error.type}).`)),
    });
    client.requestAccessToken();
  });
}

async function get(path, params) {
  const url = new URL(`${API}/${path}`);
  for (const [key, value] of Object.entries(params)) if (value) url.searchParams.set(key, value);
  const response = await fetch(url, { headers: { Authorization: `Bearer ${await requestToken()}` } });
  if (response.status === 401) token = null;
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error?.message ?? `Meet API error ${response.status}`);
  }
  return response.json();
}

function displayName(participant) {
  return (
    participant.signedinUser?.displayName ??
    participant.anonymousUser?.displayName ??
    participant.phoneUser?.displayName ??
    ""
  );
}

/**
 * @param {string} meetingCode e.g. "abc-mnop-xyz"
 * @returns {Promise<string[]>} display names of everyone currently in the call
 */
export async function listCurrentParticipants(meetingCode) {
  if (!/^[a-z0-9-]+$/i.test(meetingCode)) throw new Error("Unexpected meeting code.");
  const { conferenceRecords = [] } = await get("conferenceRecords", {
    filter: `space.meeting_code = "${meetingCode}" AND end_time IS NULL`,
  });
  if (!conferenceRecords.length) {
    throw new Error("Google didn't return this call. Only the meeting's organiser may be able to list who's in it.");
  }

  const names = [];
  let pageToken = "";
  do {
    const page = await get(`${conferenceRecords[0].name}/participants`, {
      filter: "latest_end_time IS NULL",
      pageSize: "250",
      pageToken,
    });
    for (const participant of page.participants ?? []) names.push(displayName(participant));
    pageToken = page.nextPageToken ?? "";
  } while (pageToken);
  return names.filter(Boolean);
}
