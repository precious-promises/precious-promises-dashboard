"use client";

import { useState } from "react";

/** Exact CSS viewport widths for inspecting the real, authenticated route. */
export function ResponsiveInspector() {
  const [width, setWidth] = useState(390);
  const [height, setHeight] = useState(844);
  return (
    <main style={{ padding: 12 }}>
      <div
        style={{
          display: "flex",
          gap: 10,
          alignItems: "center",
          marginBottom: 12,
          flexWrap: "wrap",
        }}
      >
        <strong>Preview layout inspection</strong>
        <label>
          Viewport width{" "}
          <select
            aria-label="Viewport width"
            value={width}
            onChange={(e) => setWidth(Number(e.target.value))}
          >
            {[320, 360, 390, 430, 768, 1024, 1199, 1200, 1440, 1536].map(
              (value) => (
                <option key={value} value={value}>
                  {value}px
                </option>
              ),
            )}
          </select>
        </label>
        <label>
          Viewport height{" "}
          <select
            aria-label="Viewport height"
            value={height}
            onChange={(e) => setHeight(Number(e.target.value))}
          >
            {[844, 900, 1024].map((value) => (
              <option key={value} value={value}>
                {value}px
              </option>
            ))}
          </select>
        </label>
        <span>Actual dashboard, existing session, no test data.</span>
      </div>
      <iframe
        title="Dashboard viewport"
        src="/dashboard"
        style={{
          display: "block",
          boxSizing: "content-box",
          width,
          height,
          border: "1px solid #344056",
          maxWidth: "none",
          background: "#080d15",
        }}
      />
    </main>
  );
}
