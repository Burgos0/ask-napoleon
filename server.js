const express = require("express");
require("dotenv").config();
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const AUDIO_DIRECTORY = path.join(__dirname, "public", "audio");
const DUKE_AUDIO_DIRECTORY = path.join(AUDIO_DIRECTORY, "duke");
const DUKE_AUDIO_MANIFEST = path.join(__dirname, "duke-audio.json");
const GROQ_MODEL = "openai/gpt-oss-20b";
const WAV_EXTENSION = ".wav";
const RESPONSE_WEIGHTS = [0.35, 0.25, 0.18, 0.13, 0.09];
let previousAudioFile;

app.use(express.json());
app.use(express.static("public"));

function getWavFiles(directory, urlPrefix) {
  if (!fs.existsSync(directory)) {
    return [];
  }

  return fs.readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && path.extname(entry.name).toLowerCase() === WAV_EXTENSION)
    .map((entry) => `${urlPrefix}/${entry.name}`);
}

function getAvailableResponses() {
  const manifest = JSON.parse(fs.readFileSync(DUKE_AUDIO_MANIFEST, "utf8"));

  return manifest
    .filter((entry) =>
      entry &&
      typeof entry.file === "string" &&
      typeof entry.quote === "string" &&
      fs.existsSync(path.join(DUKE_AUDIO_DIRECTORY, entry.file)) &&
      path.extname(entry.file).toLowerCase() === WAV_EXTENSION
    )
    .map((entry, index) => ({
      id: index + 1,
      file: entry.file,
      quote: entry.quote
    }));
}

function chooseRandomResponse(responses) {
  const availableResponses =
    responses.length > 1 ? responses.filter((entry) => entry.file !== previousAudioFile) : responses;
  return availableResponses[Math.floor(Math.random() * availableResponses.length)];
}

function chooseWeightedResponse(responses) {
  const candidates = responses
    .map((entry, index) => ({ entry, weight: RESPONSE_WEIGHTS[index] }))
    .filter(({ entry }) => entry.file !== previousAudioFile);
  const totalWeight = candidates.reduce((total, candidate) => total + candidate.weight, 0);
  let position = Math.random() * totalWeight;

  for (const candidate of candidates) {
    position -= candidate.weight;
    if (position < 0) {
      return candidate.entry;
    }
  }

  return candidates[candidates.length - 1].entry;
}

function parseRankedIds(content, responses) {
  try {
    const ids = JSON.parse(content);
    if (!Array.isArray(ids) || ids.length < 5) {
      return [];
    }

    const validIds = new Set(responses.map((entry) => entry.id));
    const uniqueIds = ids.filter((id) => Number.isInteger(id) && validIds.has(id));
    return uniqueIds.length >= 5 ? uniqueIds.slice(0, 5) : [];
  } catch {
    return [];
  }
}

const SYSTEM_MESSAGE = `You are selecting a response from a fixed list of real Duke Nukem audio quotes.

Your job is NOT to write a response. Your ONLY job is to select the single existing quote that most naturally, humorously, or appropriately responds to the user's message.

You may ONLY choose from the supplied list. Prefer semantic relevance over randomness. Consider conversational intent such as agreement, rejection, greeting, readiness, encouragement, impatience, insult, anger, success, failure, surprise, challenge, threat, confusion, celebration, or goodbye.

Return ONLY a JSON array containing the five numeric IDs in ranked order, for example [12, 4, 27, 8, 19]. Never generate new Duke dialogue.`;

app.post("/api/chat", async (req, res) => {
  const message = typeof req.body.message === "string" ? req.body.message.trim() : "";

  if (!message) {
    return res.status(400).json({ error: "Please enter a question first." });
  }

  try {
    const responses = getAvailableResponses();

    if (responses.length === 0) {
      return res.status(404).json({ error: "No Duke audio files found." });
    }

    let selectedResponse;

    if (process.env.GROQ_API_KEY) {
      try {
        const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model: GROQ_MODEL,
            messages: [
              { role: "system", content: SYSTEM_MESSAGE },
              {
                role: "user",
                content: `User message:\n${message}\n\nPrevious response file to avoid when another response fits: ${previousAudioFile || "none"}\n\nAvailable responses:\n${JSON.stringify(responses)}`
              }
            ]
          })
        });

        if (groqResponse.ok) {
          const data = await groqResponse.json();
          const rankedIds = parseRankedIds(data.choices?.[0]?.message?.content?.trim() || "", responses);
          const rankedResponses = rankedIds
            .map((id) => responses.find((entry) => entry.id === id))
            .filter(Boolean);
          if (rankedResponses.length === 5) {
            selectedResponse = chooseWeightedResponse(rankedResponses);
          }
        } else {
          console.error("Groq API error:", groqResponse.status, await groqResponse.text());
        }
      } catch (error) {
        console.error("Groq request failed:", error);
      }
    }

    selectedResponse ||= chooseRandomResponse(responses);
    previousAudioFile = selectedResponse.file;

    res.json({
      audio: `/audio/duke/${encodeURIComponent(selectedResponse.file)}`,
      quote: selectedResponse.quote
    });
  } catch (error) {
    console.error("Chat request failed:", error);
    res.status(500).json({
      error: "Unable to select a Duke audio response. Please try again."
    });
  }
});

app.listen(PORT, () => {
  console.log(`Ask Duke is running at http://localhost:${PORT}`);
});