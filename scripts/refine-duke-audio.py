import json
import re
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
AUDIO_DIRECTORY = ROOT / "public" / "audio"
DUKE_DIRECTORY = AUDIO_DIRECTORY / "duke"
CLASSIFICATION_REPORT = AUDIO_DIRECTORY / "classification-report.json"
MANIFEST = ROOT / "duke-audio.json"

# These filenames contain lines whose transcript and naming both identify a Duke line,
# even though the broader, cross-game quote bank did not score them strongly enough.
CONFIRMED_ADDITIONS = {"AMESS06.wav", "DIESOB03.wav", "PARTY03.wav", "RIPEM08.wav", "THSUK13A.wav", "BOOKEM03.wav", "BORN01.wav", "EATSHT01.wav"}
PROBABLE_ADDITIONS = {"COOL01.wav", "NAME01.wav"}

# Audio families that identify effects, ambience, enemies, NPCs, or non-Duke narration.
NON_DUKE_FILENAME = re.compile(
    r"^(?:!|ADOOR|B[23]|BARMUSIC|BL(?:DIE|PAIN|REC|RIP|ROAM|SPIT)|BOMB|BONUS|BOS|BQ|BRUN|BSCORE|BUBBL|BUCKLE|BULIT|CATFIRE|CDOOR|CHAINGUN|CHEER|CHOKN|CLANG|CLIP|COMM|COMPAMB|CTRLRM|DEEPFRY|DEFEATED|DETRUCT|DMDEATH|DOG|DOLPHIN|DOM|DSCREM|DUCT|EDOOR|ENGHUM|EXERT|EXSHOT|FLUSH|FLYBY|FREEZE|FSCRM|GASP|GBELEV|GBLASR|GEAR|GLAS|GOGGLE|GRIND|GRUN|GSCORE|GULP|GUNHIT|H2O|HARTBEAT|HEADRIP|HLIDLE|HYDRO|INTRO|ITEM|JEEP|JET|KICKHIT|KNUCKLE|LAND|LANI|LAVA|LIZ|LSR|MACH|MICE|MONITOR|MONOLITH|MUZAK|OCTA|ONBOARD|OPENDOOR|PAIN|PBOMB|PHON|PIG|PISTOL|POOL|PRED|PROJ|RAIN|REACTOR|RICOCHET|ROAM|RPG|SBELL|SBR|SCUBA|SECRET|SHOT|SHRINK|SKID|SLI|SNAKA|STEAM|SWEET|TCLAP|VAULT|VOCAL|WARAMB|WAVE|WHISTLE|WIND|WPN|ZIPPER)",
    re.IGNORECASE,
)

report = json.loads(CLASSIFICATION_REPORT.read_text())
results = report["results"]
refined = []

for result in results:
    filename = result["file"]
    transcription = result["transcription"].strip()
    original_category = result["category"]

    if original_category == "CONFIRMED_DUKE" or filename in CONFIRMED_ADDITIONS:
        category = "CONFIRMED_DUKE"
    elif filename in PROBABLE_ADDITIONS:
        category = "PROBABLE_DUKE"
    elif original_category == "NOT_DUKE" or NON_DUKE_FILENAME.match(filename):
        category = "REJECTED"
    else:
        category = "STILL_UNCERTAIN"

    refined.append(
        {
            "file": filename,
            "quote": transcription,
            "category": category,
        }
    )

accepted = [
    result
    for result in refined
    if result["category"] in {"CONFIRMED_DUKE", "PROBABLE_DUKE"}
]

DUKE_DIRECTORY.mkdir(parents=True, exist_ok=True)
for audio_file in DUKE_DIRECTORY.glob("*.wav"):
    audio_file.unlink()

for result in accepted:
    shutil.copy2(AUDIO_DIRECTORY / result["file"], DUKE_DIRECTORY / result["file"])

MANIFEST.write_text(
    json.dumps(
        [{"file": result["file"], "quote": result["quote"]} for result in accepted],
        indent=2,
    )
    + "\n"
)

counts = {
    category: sum(result["category"] == category for result in refined)
    for category in ("CONFIRMED_DUKE", "PROBABLE_DUKE", "REJECTED", "STILL_UNCERTAIN")
}

print(f"Total files analyzed: {len(refined)}")
print(f"Confirmed Duke: {counts['CONFIRMED_DUKE']}")
print(f"Probable Duke: {counts['PROBABLE_DUKE']}")
print(f"Rejected: {counts['REJECTED']}")
print(f"Still uncertain: {counts['STILL_UNCERTAIN']}")