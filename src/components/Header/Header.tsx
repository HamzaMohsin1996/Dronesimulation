import React, { useState, useEffect } from "react";
import { NavLink } from "react-router-dom";
import "./Header.scss";
import logo from "../../assets/images/logo.svg";
import NotificationIcon from "../../assets/images/icons/notification.svg";
import UserIcon from "../../assets/images/icons/user.svg";
import type { DetectionEvent } from "../../shared/DetectionEvent";
import Papa from "papaparse";
import { saveAs } from "file-saver";

// ✅ Your Google Sheets API URL
const GOOGLE_SHEETS_API =
  "https://script.google.com/macros/s/AKfycbzC1mDQLzOdUos_VS1BvzErNYdwd1hagh7Y7dHhS98Lwx9Ko2QNpOuP7AjWm3Wi9uyv/exec";

type HeaderProps = {
  notifications: DetectionEvent[];
  onSelectNotification: (e: DetectionEvent) => void;
  tabs?: { title: string; path: string; icon?: string }[];
  connectionStatus?: "connected" | "connecting" | "disconnected";
};

const Header: React.FC<HeaderProps> = ({
  notifications,
  onSelectNotification,
  tabs,
  connectionStatus,
}) => {
  const [open, setOpen] = useState(false);
  const [participantSession, setParticipantSession] = useState<any>(null);
  const [uploadStatus, setUploadStatus] = useState<
    "idle" | "uploading" | "success" | "error"
  >("idle");

  // ✅ Watch for participant updates
  useEffect(() => {
    const loadFromStorage = () => {
      const sessionData = localStorage.getItem("participantSession");
      if (sessionData) {
        const parsed = JSON.parse(sessionData);
        setParticipantSession(parsed);
        console.log("🧠 Loaded participant:", parsed);
      } else {
        setParticipantSession(null);
        console.log("🧹 Cleared participant data");
      }
    };
  
    // ✅ Load immediately on mount
    loadFromStorage();
  
    // ✅ Listen for changes from ExperimentLogger
    window.addEventListener("storage", loadFromStorage);
  
    return () => window.removeEventListener("storage", loadFromStorage);
  }, []);
  

  /** ✅ Upload logs to Google Sheets */
  const uploadToGoogleSheets = async () => {
    try {
      const logs = JSON.parse(localStorage.getItem("cachedLogs") || "[]");
      if (!participantSession || logs.length === 0) {
        alert("⚠️ No participant session or logs found.");
        return;
      }
      setUploadStatus("uploading");
      const response = await fetch(GOOGLE_SHEETS_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session: participantSession, logs }),
      });
      if (!response.ok) throw new Error("Upload failed");
      setUploadStatus("success");
      alert("✅ Logs successfully uploaded to Google Sheets!");
    } catch (err) {
      console.error("❌ Upload error:", err);
      setUploadStatus("error");
      alert("❌ Failed to upload logs. Check console for details.");
    }
  };

  /** ✅ Export logs as CSV */
  const exportLogsLocally = () => {
    try {
      const logs = JSON.parse(localStorage.getItem("cachedLogs") || "[]");
      if (!participantSession || logs.length === 0) {
        alert("⚠️ No participant session or logs found.");
        return;
      }
      const csv = Papa.unparse(logs);
      const filename = `${participantSession.participantId}_${participantSession.scenario}_${participantSession.condition}.csv`;
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      saveAs(blob, filename);
      alert("✅ CSV exported successfully.");
    } catch (err) {
      console.error("❌ Export error:", err);
      alert("❌ Failed to export CSV.");
    }
  };

  /** ✅ Reset participant session manually */
  const resetParticipantSession = () => {
    localStorage.removeItem("participantSession");
    localStorage.removeItem("cachedLogs");
    setParticipantSession(null);
    alert("🔁 Participant session reset. Ready for a new participant.");
  };

  return (
    <header className="header">
      <div className="container-fluid">
        <div className="row align-items-center">
          {/* --- Left: Logo --- */}
          <div className="col d-flex align-items-center">
            <NavLink to="/" aria-label="Go to home" className="logo-link">
              <img src={logo} alt="Logo" className="logo" draggable={false} />
            </NavLink>

            <div className="ms-3 d-flex flex-column">
              <span className="title">ILS Ingolstadt</span>
              <div className="d-flex align-items-center text-white small gap-2">
                <span className="breadcrumb-separator">›</span>
                <span>Overview</span>
              </div>
            </div>
          </div>

          {/* --- Center: Tabs --- */}
          {tabs && tabs.length > 0 && (
            <div className="col-auto d-flex justify-content-center">
              <nav className="d-flex gap-3">
                {tabs.map((tab) => (
                  <NavLink
                    key={tab.path}
                    to={tab.path}
                    className={({ isActive }) =>
                      `nav-tab ${isActive ? "active" : ""}`
                    }
                  >
                    <span
                      style={{ fontSize: "1.2rem", marginRight: "0.3rem" }}
                    >
                      {tab.icon}
                    </span>
                    {tab.title}
                  </NavLink>
                ))}
              </nav>
            </div>
          )}

          {/* --- Right: Tools --- */}
          <div className="col d-flex justify-content-end align-items-center gap-3">
            {/* ✅ Show participant info only if exists */}
            {participantSession ? (
              <>
                <div className="bg-white text-blue-800 px-3 py-2 rounded-lg shadow-sm small">
                  <b>{participantSession.participantId}</b> —{" "}
                  {participantSession.scenario} (
                  {participantSession.condition})
                </div>

                {/* ✅ Upload + Export buttons only appear after login */}
                <button
                  className="btn btn-sm btn-light fw-semibold text-blue-700"
                  onClick={uploadToGoogleSheets}
                  disabled={uploadStatus === "uploading"}
                >
                  ☁️{" "}
                  {uploadStatus === "uploading"
                    ? "Uploading..."
                    : "Upload Logs"}
                </button>

                <button
                  className="btn btn-sm btn-outline-light fw-semibold"
                  onClick={exportLogsLocally}
                >
                  ⬇️ Export CSV
                </button>

                <button
                  className="btn btn-sm btn-danger fw-semibold text-white"
                  onClick={resetParticipantSession}
                >
                  🔁 Reset
                </button>
              </>
            ) : (
              <div className="text-white small opacity-75">
                No active participant (please log in)
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
