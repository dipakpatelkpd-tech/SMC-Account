/**
 * Screenshot a screen of the running app, through the Chrome DevTools Protocol.
 *
 *   node scripts/shoot.mjs <screen> <output.png> [language]
 *
 * Why not Electron's capturePage
 * ------------------------------
 * `webContents.capturePage()` returns the last COMPOSITED frame. When the
 * window is not focused - another app on top, a tiling WM, a second Electron
 * instance stealing focus - Chromium stops compositing and the call quietly
 * hands back the first frame it ever painted. That produced screenshots of a
 * loading spinner for an app that was fully rendered, and cost an hour of
 * chasing a bug that did not exist.
 *
 * CDP's Page.captureScreenshot forces a fresh frame, so it is honest about what
 * is on screen whether or not the window has focus.
 *
 * The app must already be running with --remote-debugging-port=9222.
 */
import { writeFileSync } from "node:fs";
import net from "node:net";
import crypto from "node:crypto";

const [, , screen = "dashboard", output = "shot.png", language] = process.argv;
const PORT = Number(process.env["CDP_PORT"] ?? 9222);

const targets = await (await fetch(`http://localhost:${PORT}/json`)).json();
const page = targets.find((t) => t.type === "page");
if (!page) throw new Error("no page target; is the app running with --remote-debugging-port?");

const path = new URL(page.webSocketDebuggerUrl).pathname;
const socket = net.createConnection({ host: "localhost", port: PORT });
socket.setTimeout(20_000);

await new Promise((resolve, reject) => {
  socket.once("error", reject);
  socket.once("connect", () => {
    const key = crypto.randomBytes(16).toString("base64");
    socket.write(
      `GET ${path} HTTP/1.1\r\nHost: localhost:${PORT}\r\nUpgrade: websocket\r\n` +
        `Connection: Upgrade\r\nSec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`,
    );
    socket.once("data", () => resolve());
  });
});

let nextId = 1;
const pending = new Map();
let buffer = Buffer.alloc(0);

socket.on("data", (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);
  for (;;) {
    if (buffer.length < 2) return;
    let length = buffer[1] & 127;
    let offset = 2;
    if (length === 126) {
      if (buffer.length < 4) return;
      length = buffer.readUInt16BE(2);
      offset = 4;
    } else if (length === 127) {
      if (buffer.length < 10) return;
      length = Number(buffer.readBigUInt64BE(2));
      offset = 10;
    }
    if (buffer.length < offset + length) return;
    const payload = buffer.subarray(offset, offset + length).toString();
    buffer = buffer.subarray(offset + length);
    try {
      const message = JSON.parse(payload);
      const entry = pending.get(message.id);
      if (entry) {
        pending.delete(message.id);
        // A CDP error arrives as { error }, not as a rejected call. Swallowing
        // it turns a clear protocol message into "cannot destructure undefined".
        if (message.error) entry.reject(new Error(`${message.method ?? "cdp"}: ${message.error.message}`));
        else entry.resolve(message.result);
      }
    } catch {
      /* protocol noise */
    }
  }
});

function send(method, params = {}) {
  const id = nextId++;
  const body = Buffer.from(JSON.stringify({ id, method, params }));
  const header = [0x81];
  if (body.length < 126) header.push(0x80 | body.length);
  else {
    header.push(0x80 | 126, body.length >> 8, body.length & 0xff);
  }
  const mask = crypto.randomBytes(4);
  const masked = Buffer.from(body.map((byte, index) => byte ^ mask[index % 4]));
  socket.write(Buffer.concat([Buffer.from(header), mask, masked]));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

await send("Page.enable");

const evaluate = (expression) =>
  send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });

if (language) {
  await evaluate(`localStorage.setItem("smc.language", ${JSON.stringify(language)})`);
}

// Drive the app the way a person would: change the hash, let React re-render.
await evaluate(`location.hash = ${JSON.stringify(screen)}; location.reload();`);
await new Promise((resolve) => setTimeout(resolve, 2500));

// Wait until the shell has actually rendered something, not just loaded.
for (let attempt = 0; attempt < 40; attempt += 1) {
  const { result } = await evaluate("document.body.innerText.length");
  if ((result?.value ?? 0) > 80) break;
  await new Promise((resolve) => setTimeout(resolve, 250));
}

// A .pdf output goes through printToPDF, which is the exact call the main
// process makes - so this checks the real artefact, not a picture of it.
const { data } = output.endsWith(".pdf")
  ? await send("Page.printToPDF", {
      landscape: false,
      printBackground: true,
      preferCSSPageSize: true,
      marginTop: 0,
      marginBottom: 0,
      marginLeft: 0,
      marginRight: 0,
    })
  : await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });

writeFileSync(output, Buffer.from(data, "base64"));
console.log(`wrote ${output}`);
socket.destroy();
