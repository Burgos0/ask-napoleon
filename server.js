require("dotenv").config();

const express = require("express");

const app = express();
const PORT = process.env.PORT || 3000;
const GROQ_MODEL = "openai/gpt-oss-20b";
const SYSTEM_MESSAGE =
  "You are an awkward, deadpan small-town teenager inspired by the comedic vibe of Napoleon Dynamite. Answer the user's actual question correctly, but use short sentences, awkward confidence, mild annoyance, strange observations, and phrases like 'Gosh', 'Whatever', and 'Seriously?' occasionally. Do not claim to actually be Napoleon Dynamite. Keep answers relatively short and funny.";

app.use(express.json());
app.use(express.static("public"));

app.post("/api/chat", async (req, res) => {
  const message = typeof req.body.message === "string" ? req.body.message.trim() : "";

  if (!message) {
    return res.status(400).json({ error: "Please enter a question first." });
  }

  if (!process.env.GROQ_API_KEY) {
    return res.status(500).json({ error: "The Groq API key is not configured." });
  }

  try {
    const groqResponse = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: GROQ_MODEL,
          messages: [
            { role: "system", content: SYSTEM_MESSAGE },
            { role: "user", content: message }
          ]
        })
      }
    );

    if (!groqResponse.ok) {
      const errorDetails = await groqResponse.text();
      console.error("Groq API error:", groqResponse.status, errorDetails);
      return res.status(502).json({
        error: "Groq could not answer that right now. Please try again."
      });
    }

    const data = await groqResponse.json();
    const reply = data.choices?.[0]?.message?.content;

    if (!reply) {
      return res.status(502).json({
        error: "Groq returned an empty answer. Please try again."
      });
    }

    res.json({ reply });
  } catch (error) {
    console.error("Chat request failed:", error);
    res.status(500).json({
      error: "Something went wrong while asking Groq. Please try again."
    });
  }
});

app.listen(PORT, () => {
  console.log(`Ask Napoleon is running at http://localhost:${PORT}`);
});