# Standup queue

A Google Meet add-on that keeps a fair speaking order for daily standups.

- People join the queue with a button, or someone adds them by name.
- **Shuffle** randomises everyone still waiting; otherwise it is join order.
- Talking, asking questions or raising a hand never changes the queue. Only
  **Done, next person** moves it on. **Skip for now** sends the current
  speaker to the back.
- Anyone in the call can move people up or down, remove them, or clear the lot.

## How it works

- `docs/sidepanel.html` is what opens when you pick the add-on in Meet. Its
  button starts a shared *activity*; everyone else in the call is prompted to
  join it.
- `docs/mainstage.html` is the queue itself, shown as a tile in the call.
- The queue is shared using Meet's **Co-Doing API**: every change broadcasts
  the whole queue to everyone, and people who join late get the latest copy.
  There is no server or database; the add-on is plain static files in `docs/`.
- Meet does not tell add-ons who is in the call, so people type their name
  once. It is remembered in their browser.

### Trade-offs

- If two people click at the same instant, Meet picks one winner and the other
  click is lost. Fine for a standup; a click can simply be repeated.
- The queue lives only as long as the activity. Ending it clears the queue.
- There are no permissions: anyone in the activity can press any button.

## Try it locally

```bash
npm run serve
```

Open <http://localhost:8080/mainstage.html> in two or more tabs. Each tab acts
as a different person, and changes show in every tab.

```bash
npm test
```

## Put it into Meet

You need a Google Cloud project in the Unitary Google Workspace organisation.

1. **Hosting.** GitHub Pages serves the `docs/` folder of `main` at
   <https://unitaryai.github.io/standup-queue/>. Pushing to `main` updates it.
   Meet loads it in a frame, so it must stay public.
2. **Project number.** `docs/config.js` holds the Cloud project number
   (988120791854).
3. **Enable the APIs.** In the Cloud console, enable *Google Workspace
   Marketplace SDK* and *Google Workspace add-ons API*.
4. **Create a deployment.** In *Google Workspace Marketplace SDK → HTTP
   deployments*, create a deployment and paste in `deployment.json`.
5. **Install it for yourself.** Click **Install** next to the deployment. Open
   a new Meet, click **Activities** (the shapes icon), and pick *Standup queue*
   under *Your add-ons*.
6. **Share with the team.** In the Marketplace SDK, fill in *App
   configuration* (tick Meet add-on and link the deployment) and the *Store
   listing* with visibility set to **Private**. A Workspace admin can then
   install it for the whole domain.

Google's guides: [overview](https://developers.google.com/workspace/meet/add-ons/guides/overview),
[deploy](https://developers.google.com/workspace/meet/add-ons/guides/deploy-add-on),
[Co-Doing API](https://developers.google.com/workspace/meet/add-ons/guides/use-CoDoingAPI).
