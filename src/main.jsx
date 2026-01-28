import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import { Buffer } from "buffer";
import process from "process";

const root = createRoot(document.getElementById("root"));
if (typeof window !== "undefined") {
  if (!window.Buffer) window.Buffer = Buffer;
  if (!window.process) window.process = process;
}
root.render(
  <BrowserRouter>
    <App />
  </BrowserRouter>
);
