#!/usr/bin/env bun
// Recapture the Reef docs shots in light theme at 2×.
//
//   bun website/scripts/shots/capture.mjs
//
// Needs system Chrome (`google-chrome`) and ffmpeg (for live-sync.gif).
// Output lands in website/public/reef/.

import { spawn } from "node:child_process";
import { mkdirSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "../../public/reef");
const CHROME = process.env.CHROME ?? "/opt/google/chrome/chrome";

const ALL_SHOTS = [
  { id: "board", file: "board.png", w: 1440, h: 780 },
  { id: "denied-toast", file: "denied-toast.png", w: 1440, h: 780 },
  { id: "issue-detail", file: "issue-detail.png", w: 1440, h: 860 },
  { id: "masked-note", file: "masked-note.png", w: 1440, h: 860 },
  { id: "masked-note-compare", file: "masked-note-compare.png", w: 980, h: 900 },
  { id: "time-travel", file: "time-travel.png", w: 1440, h: 760 },
  { id: "workspaces", file: "workspaces.png", w: 760, h: 820 },
  { id: "workspace-create", file: "workspace-create.png", w: 760, h: 860 },
  { id: "sign-in", file: "sign-in.png", w: 580, h: 760 },
  { id: "invite", file: "invite.png", w: 1440, h: 780 },
  { id: "live-sync-a", file: "live-sync-a.png", w: 900, h: 1180 },
  { id: "live-sync-b", file: "live-sync-b.png", w: 900, h: 1180 },
];
const only = process.argv.slice(2);
const SHOTS = only.length
  ? ALL_SHOTS.filter((s) => only.includes(s.id) || only.includes(s.file))
  : ALL_SHOTS;
if (!SHOTS.length) {
  console.error(`unknown shot: ${only.join(" ")}`);
  process.exit(1);
}

const run = (cmd, args, opts = {}) =>
  new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: "inherit", ...opts });
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`)),
    );
  });

const waitForFile = async (path, timeoutMs = 20_000) => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await Bun.file(path).exists()) {
      const size = Bun.file(path).size;
      if (size > 1000) return;
    }
    await Bun.sleep(100);
  }
  throw new Error(`timed out waiting for ${path}`);
};

const screenshot = async (url, dest, w, h) => {
  const profile = join(OUT, `.chrome-${process.pid}-${Date.now()}`);
  mkdirSync(profile, { recursive: true });
  const child = spawn(
    CHROME,
    [
      "--headless=new",
      "--no-sandbox",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      "--hide-scrollbars",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-background-networking",
      "--disable-sync",
      "--disable-extensions",
      "--disable-component-update",
      "--disable-default-apps",
      "--disable-features=Translate,PaintHolding",
      "--force-device-scale-factor=2",
      "--virtual-time-budget=2000",
      `--user-data-dir=${profile}`,
      `--window-size=${w},${h}`,
      `--screenshot=${dest}`,
      url,
    ],
    { stdio: "inherit" },
  );
  try {
    await waitForFile(dest);
  } finally {
    child.kill("SIGTERM");
    await Bun.sleep(200);
    if (child.exitCode === null) child.kill("SIGKILL");
    await run("rm", ["-rf", profile]);
  }
};

mkdirSync(OUT, { recursive: true });

const server = Bun.serve({
  port: 0,
  fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === "/" || url.pathname === "/reef.html") {
      return new Response(Bun.file(join(HERE, "reef.html")));
    }
    return new Response("not found", { status: 404 });
  },
});

const base = `http://127.0.0.1:${server.port}/reef.html`;
console.log(`serving shots at ${base}`);

for (const shot of SHOTS) {
  const raw = join(OUT, `.raw-${shot.file}`);
  const dest = join(OUT, shot.file);
  const url = `${base}?shot=${shot.id}`;
  console.log(`→ ${shot.file}  ${shot.w}×${shot.h} @2x`);
  await screenshot(url, raw, shot.w, shot.h);
  // Chrome writes a truecolor PNG; re-encode without palette quantization so
  // text stays sharp, and strip the extra viewport chrome if Chrome padded it.
  const img = sharp(raw);
  const meta = await img.metadata();
  const targetW = shot.w * 2;
  const targetH = shot.h * 2;
  let pipeline = img;
  if ((meta.width ?? 0) > targetW || (meta.height ?? 0) > targetH) {
    pipeline = pipeline.extract({
      left: 0,
      top: 0,
      width: Math.min(targetW, meta.width ?? targetW),
      height: Math.min(targetH, meta.height ?? targetH),
    });
  }
  await pipeline.png({ compressionLevel: 9, adaptiveFiltering: true }).toFile(dest);
  unlinkSync(raw);
  const outMeta = await sharp(dest).metadata();
  console.log(`   ${outMeta.width}×${outMeta.height}  ${outMeta.channels}-channel`);
}

const wantGif = SHOTS.some((s) => s.id.startsWith("live-sync"));
if (wantGif) {
  const a = join(OUT, "live-sync-a.png");
  const b = join(OUT, "live-sync-b.png");
  const gif = join(OUT, "live-sync.gif");
  const list = join(OUT, ".frames.txt");
  console.log("→ live-sync.gif");
  await Bun.write(list, `file '${a}'\nduration 1.4\nfile '${b}'\nduration 1.4\nfile '${b}'\n`);
  await run("ffmpeg", [
    "-y",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    list,
    "-vf",
    "fps=2,split[s0][s1];[s0]palettegen=stats_mode=full:max_colors=256[p];[s1][p]paletteuse=dither=sierra2_4a",
    "-loop",
    "0",
    gif,
  ]);
  unlinkSync(list);
  unlinkSync(a);
  unlinkSync(b);
}

server.stop();
console.log("done");
