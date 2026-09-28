import * as queue from "./queue.js";
import { isConfigured, listCurrentParticipants } from "./meet-api.js";
import { connect, createMeetSession, inMeet, testRoom } from "./sync.js";

const $ = (id) => document.getElementById(id);

let state = queue.emptyState();
let transport = null;
const me = loadMe();

// Inside Meet each person has their own browser, so their ID lives in
// localStorage. Locally, tabs share localStorage, so use sessionStorage to
// make every tab a different "person" for testing.
function identityStore() {
  return inMeet() ? localStorage : sessionStorage;
}

function loadMe() {
  try {
    const saved = JSON.parse(identityStore().getItem("standup-queue:me") ?? "null");
    if (saved?.id) return saved;
  } catch {
    // Fall through to a fresh identity.
  }
  const fresh = { id: crypto.randomUUID(), name: "" };
  saveMe(fresh);
  return fresh;
}

function saveMe(value) {
  try {
    identityStore().setItem("standup-queue:me", JSON.stringify(value));
  } catch {
    // Name is simply not remembered next time.
  }
}

function apply(action) {
  // Until connected, a local change would be overwritten by the first update.
  if (!transport) return;
  const updated = action(state);
  if (updated === state) return;
  state = updated;
  render();
  transport.update(action, updated).catch((error) => {
    console.error(error);
    $("status").textContent = "That change didn't save. Try again.";
  });
}

function onRemoteState(raw) {
  const parsed = queue.parseState(raw);
  if (!parsed) return;
  state = parsed;
  $("status").textContent = "";
  render();
}

function iconButton(label, title, entry, onClick, disabled = false) {
  const b = document.createElement("button");
  b.className = "icon";
  b.textContent = label;
  b.title = title;
  b.setAttribute("aria-label", `${title}: ${entry.name}`);
  b.disabled = disabled;
  b.addEventListener("click", onClick);
  return b;
}

function waitingItem(entry, position) {
  const li = document.createElement("li");
  if (entry.id === me.id) li.classList.add("me");
  const name = document.createElement("span");
  name.className = "name";
  name.textContent = entry.name + (entry.id === me.id ? " (you)" : "");
  const actions = document.createElement("span");
  actions.className = "item-actions";
  actions.append(
    iconButton("↑", "Move up", entry, () => apply((s) => queue.move(s, entry.id, -1)), position === 0),
    iconButton("↓", "Move down", entry, () => apply((s) => queue.move(s, entry.id, 1)), position === state.waiting.length - 1),
    iconButton("×", "Remove", entry, () => apply((s) => queue.remove(s, entry.id))),
  );
  li.append(name, actions);
  return li;
}

function render() {
  const { speaking, waiting, done } = state;

  $("speaking-name").textContent = speaking ? speaking.name : "Nobody yet";
  $("speaking-name").classList.toggle("placeholder", !speaking);
  $("next").textContent = speaking ? (waiting.length ? "Next" : "Finish") : "Start";
  $("next").disabled = !speaking && !waiting.length;
  $("skip").hidden = !speaking || !waiting.length;

  $("waiting").replaceChildren(...waiting.map(waitingItem));
  $("waiting-count").textContent = waiting.length ? `(${waiting.length})` : "";
  $("waiting-empty").hidden = waiting.length > 0;
  $("shuffle").hidden = waiting.length < 2;
  $("done-count").textContent = done.length ? `${done.length} done` : "";

  const myPlace = waiting.findIndex((e) => e.id === me.id);
  const queued = speaking?.id === me.id || myPlace >= 0;
  $("join-form").hidden = queued;
  $("joined").hidden = !queued;
  $("joined-text").textContent = speaking?.id === me.id ? "You're speaking." : `You're number ${myPlace + 1}.`;
}

function wire() {
  $("my-name").value = me.name;

  $("join-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const name = queue.cleanName($("my-name").value);
    if (!name) return $("my-name").focus();
    me.name = name;
    saveMe(me);
    apply((s) => queue.join(s, me));
  });

  $("show-add").addEventListener("click", () => {
    $("add-form").hidden = !$("add-form").hidden;
    if (!$("add-form").hidden) $("other-name").focus();
  });

  $("add-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const name = queue.cleanName($("other-name").value);
    if (!name) return;
    const entry = { id: crypto.randomUUID(), name };
    apply((s) => queue.join(s, entry));
    $("other-name").value = "";
  });

  $("leave").addEventListener("click", () => apply((s) => queue.remove(s, me.id)));
  $("next").addEventListener("click", () => apply(queue.next));
  $("skip").addEventListener("click", () => apply(queue.skip));
  $("shuffle").addEventListener("click", () => apply((s) => queue.shuffle(s)));

  // confirm() is blocked inside the Meet iframe, so confirm with a second click.
  let resetTimer = null;
  $("reset").addEventListener("click", (event) => {
    const button = event.currentTarget;
    if (!resetTimer) {
      button.textContent = "Click again to clear";
      resetTimer = setTimeout(() => {
        button.textContent = "Clear";
        resetTimer = null;
      }, 3000);
      return;
    }
    clearTimeout(resetTimer);
    resetTimer = null;
    button.textContent = "Clear";
    apply(queue.reset);
  });
}

// Prompts everyone else in the call to open this same side panel.
function wireInvite(client) {
  const invite = $("invite");
  invite.hidden = false;
  invite.addEventListener("click", async () => {
    invite.disabled = true;
    try {
      await client.startActivity({ sidePanelUrl: new URL("sidepanel.html", location.href).href });
      invite.textContent = "Invited";
    } catch (error) {
      console.error(error);
      invite.disabled = false;
      $("status").textContent = "Couldn't send the invite. Ask people to open Standup queue from Activities.";
    }
  });
}

// Host-only shortcut: fetch everyone in the call and queue them in one go.
function wireAddCall(meetingCode) {
  const button = $("add-call");
  if (!isConfigured()) return;
  button.hidden = false;
  button.addEventListener("click", async () => {
    button.disabled = true;
    button.textContent = "Adding…";
    try {
      const names = await listCurrentParticipants(meetingCode);
      const before = state.waiting.length;
      apply((s) => queue.addMany(s, names));
      const added = state.waiting.length - before;
      $("status").textContent = added ? `Added ${added} from the call.` : "Everyone in the call is already on the list.";
    } catch (error) {
      console.error(error);
      $("status").textContent = error.message;
    } finally {
      button.disabled = false;
      button.textContent = "Add everyone in the call";
    }
  });
}

async function start() {
  wire();
  render();
  try {
    let room = testRoom();
    if (inMeet()) {
      const session = await createMeetSession();
      const client = await session.createSidePanelClient();
      const meeting = await client.getMeetingInfo();
      room = meeting.meetingId;
      wireInvite(client);
      wireAddCall(meeting.meetingCode);
    } else if (!room) {
      $("status").textContent = "Test mode: open this page in more tabs to act as other people.";
    }
    $("status").textContent ||= "Connecting…";
    transport = await connect(onRemoteState, room);
    if ($("status").textContent === "Connecting…") $("status").textContent = "";
  } catch (error) {
    console.error(error);
    $("status").textContent = "Couldn't connect. Changes will only show for you.";
    transport = { update: async () => {} };
  }
}

start();
