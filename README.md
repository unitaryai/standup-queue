# Standup queue

A Google Meet add-on that keeps a fair speaking order for daily standups. It
lives in Meet's side panel as a short list, leaving the call itself alone.

- People join the queue with a button, or someone adds them by name.
- **Shuffle** randomises everyone still waiting; otherwise it is join order.
- Talking, asking questions or raising a hand never changes the queue. Only
  **Next** moves it on. **Skip for now** sends the current speaker to the back.
- Anyone can move people up or down, remove them, or clear the queue.
- **Invite everyone** prompts the rest of the call to open the add-on.

## How it works

- `docs/sidepanel.html` is the whole add-on. It runs in each person's Meet side
  panel.
- The queue is one Firestore document per meeting, keyed by Meet's meeting ID.
  Each change runs in a transaction, so simultaneous clicks can't overwrite
  each other, and every open panel updates live.
- People sign in to Firebase anonymously; `firestore.rules` only lets them read
  a meeting's queue by ID and write well-formed queues.
- Recurring meetings keep the same ID, so a queue untouched for 12 hours is
  treated as yesterday's and starts empty.
- Meet does not tell add-ons who is in the call, so people type their name
  once. It is remembered in their browser.

Why not Meet's own Co-Doing API? It needs Google's closed early access
programme; without it, `createCoDoingClient` fails with a permissions error.

### Trade-offs

- Anyone with the add-on open can press any button. Fine for a trusted team.
- Anonymous sign-in means anyone with the public Firebase config could create
  small queue documents. The rules cap their size; add Firebase App Check if
  that ever matters.
- Old meeting documents are never deleted. Add a Firestore TTL policy on
  `updatedAt` if the collection grows.

## Try it locally

```bash
npm run serve
```

- <http://localhost:8080/sidepanel.html> in several tabs: each tab is a
  different person, synced between tabs with no Firebase.
- <http://localhost:8080/sidepanel.html?room=test> in several tabs: the same,
  but through the real Firestore database.

```bash
npm test
```

## Setup

Cloud project: `standup-queue` (number 1009599756050), in the Unitary Google
Workspace organisation.

### Hosting

GitHub Pages serves the `docs/` folder of `main` at
<https://unitaryai.github.io/standup-queue/>. Pushing to `main` updates it
(browsers may keep the old copy for up to 10 minutes). Meet loads it in a
frame, so it must stay public.

### Firebase

1. At <https://console.firebase.google.com>, add Firebase to the existing
   `standup-queue` Cloud project.
2. **Authentication → Sign-in method**: enable **Anonymous**.
3. **Firestore Database**: create a database in production mode, then paste
   `firestore.rules` into the **Rules** tab and publish.
4. **Project settings → Your apps**: register a web app and copy its config
   into `docs/firebase-config.js`.

### Meet

1. Enable *Google Meet REST API* too, for **Add everyone in the call**. In
   *Google Auth Platform*, set the audience to **Internal**, add the
   `meetings.space.readonly` scope, and create a *Web application* client with
   `https://unitaryai.github.io` as an authorised JavaScript origin. Its client
   ID goes in `docs/config.js`.
1. Enable *Google Workspace Marketplace SDK* and *Google Workspace add-ons API*
   in the Cloud project.
2. In *Google Workspace Marketplace SDK → HTTP deployments*, create a
   deployment from `deployment.json` and click **Install**.
3. In a call, open **Activities** and pick *Standup queue* under *Your
   add-ons*.
4. To share with the team, fill in the Marketplace SDK *App configuration* and
   a **Private** *Store listing*; a Workspace admin can then install it for the
   whole domain.

Google's guides: [Meet add-ons](https://developers.google.com/workspace/meet/add-ons/guides/overview),
[deploying](https://developers.google.com/workspace/meet/add-ons/guides/deploy-add-on).
