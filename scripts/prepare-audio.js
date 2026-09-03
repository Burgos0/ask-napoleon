const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const sourceDirectory = path.join(__dirname, "..", "source-audio");
const outputDirectory = path.join(__dirname, "..", "public", "audio");

function findFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      return findFiles(entryPath);
    }

    return entry.isFile() ? [entryPath] : [];
  });
}

function getOutputFile(sourceFile, usedOutputNames) {
  const baseName = path.basename(sourceFile, path.extname(sourceFile));
  let outputName = `${baseName}.wav`;

  if (usedOutputNames.has(outputName.toLowerCase())) {
    const relativeDirectory = path.dirname(path.relative(sourceDirectory, sourceFile));
    const prefix = relativeDirectory === "." ? "" : `${relativeDirectory.replace(/[\\/]/g, "-")}-`;
    outputName = `${prefix}${baseName}.wav`;
  }

  usedOutputNames.add(outputName.toLowerCase());
  return path.join(outputDirectory, outputName);
}

if (!fs.existsSync(sourceDirectory)) {
  console.error("No source-audio folder found.");
  process.exit(1);
}

fs.mkdirSync(outputDirectory, { recursive: true });
const sourceFiles = findFiles(sourceDirectory).sort();
const filesByExtension = sourceFiles.reduce((counts, file) => {
  const extension = path.extname(file).toLowerCase() || "[no extension]";
  counts[extension] = (counts[extension] || 0) + 1;
  return counts;
}, {});
const vocFiles = sourceFiles.filter((file) => path.extname(file).toLowerCase() === ".voc");
const midCount = filesByExtension[".mid"] || 0;
const mapCount = filesByExtension[".map"] || 0;
const otherCount = sourceFiles.length - vocFiles.length - midCount - mapCount;
const reportLines = ["VOC files:", ...vocFiles.map((file) => path.relative(sourceDirectory, file))];
fs.writeFileSync(path.join(outputDirectory, "voc-report.txt"), `${reportLines.join("\n")}\n`);

console.log(`VOC found: ${vocFiles.length}`);

if (vocFiles.length > 0) {
  const ffmpegCheck = spawnSync("ffmpeg", ["-version"], { stdio: "ignore" });
  if (ffmpegCheck.error || ffmpegCheck.status !== 0) {
    console.error("ffmpeg is required to convert .VOC files. Install ffmpeg, then run npm run prepare-audio again.");
    console.log("Converted: 0");
    console.log("Skipped: 0");
    console.log(`Failed: ${vocFiles.length}`);
    console.log(`MID ignored: ${midCount}`);
    console.log(`MAP ignored: ${mapCount}`);
    console.log(`Other files ignored: ${otherCount}`);
    process.exit(1);
  }
}

let converted = 0;
let skipped = 0;
let failed = 0;
const usedOutputNames = new Set();

vocFiles.forEach((sourceFile, index) => {
  const outputFile = getOutputFile(sourceFile, usedOutputNames);
  const displayName = path.relative(sourceDirectory, sourceFile);

  if (fs.existsSync(outputFile)) {
    console.log(`Skipping ${index + 1}/${vocFiles.length}: ${displayName}`);
    skipped += 1;
    return;
  }

  console.log(`Converting ${index + 1}/${vocFiles.length}: ${displayName}`);
  const result = spawnSync("ffmpeg", ["-y", "-i", sourceFile, outputFile], { stdio: "inherit" });

  if (result.status === 0) {
    converted += 1;
  } else {
    console.error(`Failed: ${displayName}`);
    failed += 1;
  }
});

console.log(`Converted: ${converted}`);
console.log(`Skipped: ${skipped}`);
console.log(`Failed: ${failed}`);
console.log(`MID ignored: ${midCount}`);
console.log(`MAP ignored: ${mapCount}`);
console.log(`Other files ignored: ${otherCount}`);

if (failed > 0) {
  process.exit(1);
}