import { ImageResponse } from "next/og";

export const alt = "DYData 抖音数据日报平台";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          alignItems: "center",
          background: "#fafaf9",
          color: "#1c1917",
          display: "flex",
          height: "100%",
          justifyContent: "center",
          width: "100%",
        }}
      >
        <div
          style={{
            alignItems: "flex-start",
            display: "flex",
            flexDirection: "column",
            gap: 22,
            padding: "72px 96px",
            width: "100%",
          }}
        >
          <div style={{ color: "#d97757", display: "flex", fontSize: 34, fontWeight: 600 }}>
            DYData
          </div>
          <div style={{ display: "flex", fontSize: 68, fontWeight: 600, letterSpacing: "-2px" }}>
            抖音数据日报平台
          </div>
          <div style={{ color: "#78716c", display: "flex", fontSize: 30 }}>
            数据记录 · 运营分析 · 成长复盘
          </div>
        </div>
      </div>
    ),
    size,
  );
}
