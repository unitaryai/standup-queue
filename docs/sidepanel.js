import { createMeetSession, inMeet } from "./sync.js";

const startButton = document.getElementById("start");
const status = document.getElementById("status");
// Resolving against the page URL drops Meet's query parameters.
const mainStageUrl = new URL("mainstage.html", location.href).href;

async function init() {
  if (!inMeet()) {
    status.textContent = "Test mode: the button opens the queue in a new tab.";
    startButton.disabled = false;
    startButton.addEventListener("click", () => window.open(mainStageUrl, "_blank"));
    return;
  }

  try {
    const session = await createMeetSession();
    const client = await session.createSidePanelClient();
    startButton.disabled = false;
    startButton.addEventListener("click", async () => {
      startButton.disabled = true;
      try {
        // Everyone else in the call gets a prompt to join the activity, which
        // opens the same main stage page for them.
        await client.startActivity({ mainStageUrl });
        status.textContent = "Started. You can close this panel.";
      } catch (error) {
        console.error(error);
        status.textContent = "Could not start. Try again.";
        startButton.disabled = false;
      }
    });
  } catch (error) {
    console.error(error);
    status.textContent = "Could not connect to Meet. Reload the add-on.";
  }
}

init();
