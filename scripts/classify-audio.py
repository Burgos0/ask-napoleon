import json
import re
import shutil
from difflib import SequenceMatcher
from pathlib import Path

import whisper

ROOT = Path(__file__).resolve().parent.parent
AUDIO_DIRECTORY = ROOT / "public" / "audio"
DUKE_DIRECTORY = AUDIO_DIRECTORY / "duke"
QUOTE_BANK = ROOT / "duke-quotes.json"
REPORT = AUDIO_DIRECTORY / "classification-report.json"
MAX_ACCEPTED = 116


def normalize(text):
    text = text.lower().replace("'", "")
    return " ".join(re.sub(r"[^\w\s]", " ", text).split())


def match_quote(transcription, quotes):
    normalized_transcription = normalize(transcription)
    best_quote = ""
    best_score = 0.0

    for quote, normalized_quote in quotes:
        score = SequenceMatcher(None, normalized_transcription, normalized_quote).ratio()
        if score > best_score:
            best_quote = quote
            best_score = score

    return best_quote, best_score


quotes = json.loads(QUOTE_BANK.read_text())
if not isinstance(quotes, list) or len(quotes) != MAX_ACCEPTED:
    raise SystemExit(f"Expected exactly {MAX_ACCEPTED} quotes in duke-quotes.json.")

audio_files = sorted(
    file for file in AUDIO_DIRECTORY.glob("*.wav") if file.is_file()
)
normalized_quotes = [(quote, normalize(quote)) for quote in quotes]
model = whisper.load_model("base.en")
results = []

for index, audio_file in enumerate(audio_files, start=1):
    print(f"Transcribing {index}/{len(audio_files)}: {audio_file.name}")
    transcription = model.transcribe(str(audio_file), fp16=False, verbose=False)
    text = transcription["text"].strip()
    quote, score = match_quote(text, normalized_quotes)

    if score >= 0.9:
        category = "CONFIRMED_DUKE"
    elif score >= 0.75 and text:
        category = "PROBABLE_DUKE"
    elif text:
        category = "UNCERTAIN"
    else:
        category = "NOT_DUKE"

    results.append(
        {
            "file": audio_file.name,
            "category": category,
            "transcription": text,
            "matchedQuote": quote,
            "score": round(score, 3),
        }
    )

counts = {
    category: sum(result["category"] == category for result in results)
    for category in ("CONFIRMED_DUKE", "PROBABLE_DUKE", "UNCERTAIN", "NOT_DUKE")
}
accepted_count = counts["CONFIRMED_DUKE"] + counts["PROBABLE_DUKE"]
report = {
    "totalWav": len(audio_files),
    "knownDukeQuotes": len(quotes),
    "counts": counts,
    "results": results,
}
REPORT.write_text(json.dumps(report, indent=2) + "\n")

if accepted_count > MAX_ACCEPTED:
    raise SystemExit(
        f"Classification stopped: {accepted_count} confirmed/probable files exceeds {MAX_ACCEPTED}."
    )

DUKE_DIRECTORY.mkdir(parents=True, exist_ok=True)
for audio_file in DUKE_DIRECTORY.glob("*.wav"):
    audio_file.unlink()

for result in results:
    if result["category"] == "CONFIRMED_DUKE":
        shutil.copy2(AUDIO_DIRECTORY / result["file"], DUKE_DIRECTORY / result["file"])

print(f"Total WAV: {len(audio_files)}")
print(f"Known Duke quotes: {len(quotes)}")
print(f"Confirmed Duke: {counts['CONFIRMED_DUKE']}")
print(f"Probable Duke: {counts['PROBABLE_DUKE']}")
print(f"Uncertain: {counts['UNCERTAIN']}")
print(f"Not Duke: {counts['NOT_DUKE']}")