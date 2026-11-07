import { useState } from "react";
import LIVE_AUDIO_CAPTURE_OPTIONS from "./audioCaptureOptions.js";
import { CAMERA_QUALITIES } from "./videoEffects.js";

import { apiUrl } from "../apiUrl.js";

export default function LiveStartModal({ onConfirm, onClose }) {
  const [loading, setLoading] = useState(false);
  const [endingExisting, setEndingExisting] = useState(false);
  const [error, setError] = useState("");
  const [canEndExisting, setCanEndExisting] = useState(false);
  const [quality, setQuality] = useState("720p");

  async function confirmStart() {
    setLoading(true);
    setError("");
    setCanEndExisting(false);
    let stream;
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Camera and microphone need a secure connection (HTTPS or localhost).");
      }
      const selectedQuality = CAMERA_QUALITIES.find((item) => item.id === quality);
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: selectedQuality.width },
          height: { ideal: selectedQuality.height },
          frameRate: { ideal: 30, max: 30 },
        },
        audio: LIVE_AUDIO_CAPTURE_OPTIONS,
      });
      await onConfirm(stream, quality);
    } catch (startError) {
      stream?.getTracks().forEach((track) => track.stop());
      setError(startError.message || "Camera and microphone permission is required.");
      setCanEndExisting(startError.status === 409);
      setLoading(false);
    }
  }

  async function endExistingCast() {
    if (!window.confirm("This will end the live cast already running on your account. Continue?")) return;
    setEndingExisting(true);
    setError("");
    try {
      const token = localStorage.getItem("hostelcast_token");
      const response = await fetch(apiUrl("/api/live/host/active"), {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "Could not end the existing live cast.");
      setCanEndExisting(false);
      setError("Your previous live cast has ended. Select “Yes, start” to try again.");
    } catch (stopError) {
      setError(stopError.message || "Could not end the existing live cast.");
    } finally {
      setEndingExisting(false);
    }
  }

  return (
    <div className="live-confirm-overlay" role="presentation">
      <section className="live-confirm-card" role="dialog" aria-modal="true" aria-labelledby="live-confirm-title">
        <button className="live-confirm-close" onClick={onClose} aria-label="Close dialog" disabled={loading || endingExisting}>×</button>
        <span className="live-confirm-icon">●</span>
        <h2 id="live-confirm-title">Do you want to start your live cast?</h2>
        <p>Choose your camera quality. Your device and internet connection determine the final stream quality.</p>
        <label className="live-quality-select" htmlFor="live-camera-quality">
          Camera quality
          <select id="live-camera-quality" value={quality} onChange={(event) => setQuality(event.target.value)} disabled={loading || endingExisting}>
            {CAMERA_QUALITIES.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
          </select>
        </label>
        {error && <p className="live-error-message" role="alert">{error}</p>}
        <div className="live-confirm-actions">
          <button className="live-confirm-yes" onClick={confirmStart} disabled={loading || endingExisting}>
            {loading ? "Starting your live cast..." : "Yes, start"}
          </button>
          {canEndExisting && (
            <button className="live-confirm-no" onClick={endExistingCast} disabled={loading || endingExisting}>
              {endingExisting ? "Ending previous cast..." : "End existing cast"}
            </button>
          )}
          {!canEndExisting && <button className="live-confirm-no" onClick={onClose} disabled={loading || endingExisting}>No</button>}
        </div>
      </section>
    </div>
  );
}
