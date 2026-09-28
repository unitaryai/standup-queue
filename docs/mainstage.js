import * as queue from "./queue.js";
import { connect, createMeetSession, inMeet } from "./sync.js";

const $ = (id) => document.getElementById(id);

let state = queue.emptyState();
let transport = null;
const me = loadMe();

// Inside Meet each person has their own browser, so their ID lives in
// localStorage. Locally, tabs share localStorage, so use sessionStorage to
// make every tab a different "person" for testing.
function loadMe() {
  const store = inMeet() ? localStorage : sessionStorage;
  try {
    const saved = JSON.parse(store.getItem("standup-queue:me") ?? "null");
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
    (inMeet() ? localStorage : sessionStorage).setItem("standup-queue:me", JSON.stringify(value));
  } catch {
    // Name is simply not remembered next time.
  }
}

function apply(action) {
  const updated = action(state);
  if (updated === state) return;
  state = updated;
  render();
  transport?.send(state);
}

function onRemoteState(raw) {
  const parsed = queue.parseState(raw);
  if (!parsed) return;
  state = parsed;
  render();
}

function entryItem(entry, { position, controls }) {
  const li = document.createElement("li");
  if (entry.id === me.id) li.classList.add("me");
  const name = document.createElement("span");
  name.className = "name";
  name.textContent = entry.name + (entry.id === me.id ? " (you)" : "");
  li.append(name);
  if (!controls) return li;

  const buttons = document.createElement("span");
  buttons.className = "item-actions";
  const button = (label, title, onClick, disabled = false) => {
    const b = document.createElement("button");
    b.className = "icon";
    b.textContent = label;
    b.title = title;
    b.setAttribute("aria-label", `${title}: ${entry.name}`);
    b.disabled = disabled;
    b.addEventListener("click", onClick);
    buttons.append(b);
  };
  button("↑", "Move up", () => apply((s) => queue.move(s, entry.id, -1)), position === 0);
  button("↓", "Move down", () => apply((s) => queue.move(s, entry.id, 1)), position === state.waiting.length - 1);
  button("×", "Remove", () => apply((s) => queue.remove(s, entry.id)));
  li.append(buttons);
  return li;
}

function render() {
  const { speaking, waiting, done } = state;
  const total = done.length + waiting.length + (speaking ? 1 : 0);

  $("progress").textContent = total ? `${done.length} of ${total} done` : "";
  $("speaking-name").textContent = speaking ? speaking.name : waiting.length ? "Ready when you are" : "Nobody yet";
  $("speaking-name").classList.toggle("placeholder", !speaking);
  $("next").textContent = speaking ? (waiting.length ? "Done, next person" : "Done, finish") : "Start";
  $("next").disabled = !speaking && !waiting.length;
  $("skip").hidden = !speaking || !waiting.length;

  $("waiting").replaceChildren(...waiting.map((e, i) => entryItem(e, { position: i, controls: true })));
  $("waiting-empty").hidden = waiting.length > 0;
  $("shuffle").disabled = waiting.length < 2;

  $("done").replaceChildren(...done.map((e) => entryItem(e, { controls: false })));
  $("done-summary").textContent = `Finished (${done.length})`;

  const myPlace = waiting.findIndex((e) => e.id === me.id);
  const queued = speaking?.id === me.id || myPlace >= 0;
  $("join-form").hidden = queued;
  $("joined").hidden = !queued;
  $("joined-text").textContent =
    speaking?.id === me.id ? "You're speaking now." : `You're number ${myPlace + 1} in the queue.`;
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

  $("add-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const name = queue.cleanName($("other-name").value);
    if (!name) return;
    apply((s) => queue.join(s, { id: crypto.randomUUID(), name }));
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
        button.textContent = "Clear everything";
        resetTimer = null;
      }, 3000);
      return;
    }
    clearTimeout(resetTimer);
    resetTimer = null;
    button.textContent = "Clear everything";
    apply(queue.reset);
  });
}

async function start() {
  wire();
  render();
  try {
    let session = null;
    if (inMeet()) {
      session = await createMeetSession();
      await session.createMainStageClient();
    } else {
      $("status").textContent = "Test mode: open this page in more tabs to act as other people.";
    }
    transport = await connect(onRemoteState, session);
  } catch (error) {
    console.error(error);
    $("status").textContent = "Could not connect to the call. Changes will only show for you.";
  }
}

start();
