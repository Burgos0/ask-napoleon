const form = document.getElementById("chat-form");
const messageInput = document.getElementById("message");
const sendButton = document.getElementById("send-button");
const loading = document.getElementById("loading");
const response = document.getElementById("response");
const replayButton = document.getElementById("replay-button");
let currentAudio;

function playCurrentAudio() {
  if (!currentAudio) {
    return;
  }

  currentAudio.currentTime = 0;
  currentAudio.play().catch(() => {
    response.textContent = "Audio could not play. Try Replay.";
    response.hidden = false;
  });
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const message = messageInput.value.trim();
  if (!message) {
    return;
  }

  sendButton.disabled = true;
  loading.hidden = false;
  response.hidden = true;

  try {
    const apiResponse = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message })
    });
    const data = await apiResponse.json();

    if (!apiResponse.ok) {
      throw new Error(data.error || "The answer did not work out.");
    }

    currentAudio?.pause();
    currentAudio = new Audio(data.audio);
    response.textContent = "🔊 Duke responds...";
    response.hidden = false;
    replayButton.hidden = false;
    playCurrentAudio();
  } catch (error) {
    response.textContent = `Sorry, something went wrong. ${error.message}`;
    response.hidden = false;
  } finally {
    sendButton.disabled = false;
    loading.hidden = true;
  }
});

replayButton.addEventListener("click", playCurrentAudio);

messageInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    form.requestSubmit();
  }
});