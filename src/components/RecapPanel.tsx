import React from "react";

interface RecapProps {
  recap: any;
  onClose: () => void;
}

export default function RecapPanel({ recap, onClose }: RecapProps) {
  if (!recap) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        background: "rgba(0,0,0,0.8)",
        color: "white",
        zIndex: 5000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        padding: 20,
      }}
    >
      <h2>Quick Recap</h2>
      <p><strong>Drone:</strong> {recap.scene.drone.location}, battery {recap.scene.drone.battery}%</p>

      <ul style={{ maxHeight: "60vh", overflowY: "auto", marginTop: 20 }}>
        {recap.scene.timeline.map((line: string, i: number) => (
          <li key={i}>{line}</li>
        ))}
      </ul>

      <button
        onClick={onClose}
        style={{
          marginTop: 20,
          padding: "8px 16px",
          background: "#16a34a",
          border: "none",
          borderRadius: 8,
          cursor: "pointer",
          fontWeight: 600,
          color: "white",
        }}
      >
        Close
      </button>
    </div>
  );
}
