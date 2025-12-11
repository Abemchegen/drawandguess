const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..", "..");
// Try several possible locations for the words directory (repo root, server/words, server relative)
const candidateSrcs = [
  path.join(repoRoot, "words"),
  path.join(repoRoot, "server", "words"),
  path.join(__dirname, "..", "words"),
  path.join(process.cwd(), "words"),
];
const src = candidateSrcs.find((p) => fs.existsSync(p));
const dest = path.join(__dirname, "..", "dist", "words");

function copyRecursive(srcDir, destDir) {
  if (!fs.existsSync(srcDir)) {
    console.error("Source words directory does not exist:", srcDir);
    process.exit(1);
  }
  fs.mkdirSync(destDir, { recursive: true });
  const items = fs.readdirSync(srcDir);
  for (const item of items) {
    const s = path.join(srcDir, item);
    const d = path.join(destDir, item);
    const stat = fs.statSync(s);
    if (stat.isDirectory()) {
      copyRecursive(s, d);
    } else {
      fs.copyFileSync(s, d);
    }
  }
}

try {
  copyRecursive(src, dest);
  console.log("Copied words to", dest);
} catch (err) {
  console.error("Failed to copy words:", err);
  process.exit(1);
}
