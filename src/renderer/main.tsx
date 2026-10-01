import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
// The Gujarati face, shipped inside the app rather than borrowed from the PC.
// Windows has no Noto Sans Gujarati (it would fall back to Shruti, with other
// widths), and the printed forms are laid out - and paged - by the width of the
// text, so every PC must print with the same font. SIL Open Font License; the
// licence travels with the package in node_modules/@fontsource/noto-sans-gujarati.
import "@fontsource/noto-sans-gujarati/400.css";
import "@fontsource/noto-sans-gujarati/700.css";
// The other faces a school may choose for its reports (LAYOUT_FONTS in
// shared/report-layout.ts), bundled for the same reason and under the same
// licence. The browser fetches one only when a report actually uses it.
import "@fontsource/noto-serif-gujarati/400.css";
import "@fontsource/noto-serif-gujarati/700.css";
import "@fontsource/hind-vadodara/400.css";
import "@fontsource/hind-vadodara/700.css";
import "@fontsource/mukta-vaani/400.css";
import "@fontsource/mukta-vaani/700.css";
import "@fontsource/anek-gujarati/400.css";
import "@fontsource/anek-gujarati/700.css";
import "@fontsource/baloo-bhai-2/400.css";
import "@fontsource/baloo-bhai-2/700.css";
import "@fontsource/rasa/400.css";
import "@fontsource/rasa/700.css";
// Display faces, one weight each: a bold title is drawn bold by the browser.
import "@fontsource/mogra/400.css";
import "@fontsource/farsan/400.css";
import "@fontsource/kumar-one/400.css";
import "@fontsource/kumar-one-outline/400.css";
import "@fontsource/shrikhand/400.css";
import "./styles.css";

const container = document.getElementById("root");
if (!container) throw new Error("no #root element in index.html");

createRoot(container).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
