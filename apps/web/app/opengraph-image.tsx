import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Klipin — AI Video Clipper untuk Creator Indonesia";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OGImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#09090b",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          fontFamily: "sans-serif",
          color: "#fafafa",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            marginBottom: 48,
          }}
        >
          <div
            style={{
              width: 64,
              height: 64,
              background: "#f59e0b",
              borderRadius: 12,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 40,
              fontWeight: 900,
              color: "#18181b",
            }}
          >
            K
          </div>
          <div style={{ fontSize: 36, fontWeight: 700 }}>Klipin</div>
        </div>
        <div
          style={{
            fontSize: 64,
            fontWeight: 800,
            lineHeight: 1.1,
            marginBottom: 24,
            maxWidth: 980,
          }}
        >
          Bikin klip viral dari video panjang,{" "}
          <span style={{ color: "#f59e0b" }}>otomatis dalam menit.</span>
        </div>
        <div style={{ fontSize: 26, color: "#a1a1aa", maxWidth: 900 }}>
          Upload video → AI pilih momen viral → crop 9:16 + subtitle Indonesia.
          Siap upload TikTok, Reels, Shorts.
        </div>
        <div
          style={{
            marginTop: 60,
            display: "flex",
            gap: 24,
            fontSize: 18,
            color: "#71717a",
          }}
        >
          <span>klipin.aldirifai.com</span>
          <span>·</span>
          <span>Lifetime Rp 129K</span>
          <span>·</span>
          <span>No watermark</span>
        </div>
      </div>
    ),
    { ...size },
  );
}
