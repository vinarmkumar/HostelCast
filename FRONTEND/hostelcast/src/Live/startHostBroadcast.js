import { Room, Track } from "livekit-client";
import LIVE_AUDIO_CAPTURE_OPTIONS from "./audioCaptureOptions.js";
import { createVideoEffects } from "./videoEffects.js";

import { apiUrl } from "../apiUrl.js";

async function requestJson(url, token, options = {}) {
  const response = await fetch(apiUrl(url), {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });
  const result = await response.json();
  if (!response.ok) {
    const error = new Error(result.message || "Live cast request failed.");
    error.status = response.status;
    throw error;
  }
  return result;
}

export async function startHostBroadcast(mediaStream, currentUser, category, { quality } = {}) {
  const authToken = localStorage.getItem("hostelcast_token");
  if (!authToken) throw new Error("Please sign in again to start a live cast.");

  let roomInfo;
  try {
    const result = await requestJson("/api/live/start", authToken, {
      method: "POST",
      body: JSON.stringify({
        title: `${currentUser.name}'s campus live`,
        category: category || currentUser.category || "Other",
      }),
    });
    roomInfo = result.room;
    const connection = await connectHostBroadcast(mediaStream, result.url, result.token, quality);
    return { ...connection, roomInfo, chatHistory: result.chatHistory || [] };
  } catch (error) {
    if (roomInfo) {
      try {
        await requestJson(`/api/live/${encodeURIComponent(roomInfo.roomName)}`, authToken, { method: "DELETE" });
      } catch (cleanupError) {
        console.error("Could not clean up an incomplete live cast:", cleanupError.message);
      }
    }
    throw error;
  }
}

async function connectHostBroadcast(mediaStream, url, token, quality) {
  const videoEffects = await createVideoEffects(mediaStream);
  const room = new Room({
    adaptiveStream: { pauseVideoInBackground: false },
    dynacast: true,
  });
  try {
    await room.connect(url, token);
    const audioTracks = mediaStream.getAudioTracks();
    const tracks = [...videoEffects.stream.getVideoTracks(), ...audioTracks];
    if (!tracks.length || tracks.some((track) => track.readyState !== "live")) {
      throw new Error("Camera or microphone stream is no longer available.");
    }
    const videoPublishOptions = {
      source: Track.Source.Camera,
      videoEncoding: {
        maxBitrate: quality === "1080p" ? 2_500_000 : 1_800_000,
        maxFramerate: 30,
      },
    };
    await Promise.all(tracks.map((track) => room.localParticipant.publishTrack(
      track,
      track.kind === "video" ? videoPublishOptions : undefined
    )));
    return {
      room,
      broadcastStream: new MediaStream([...videoEffects.stream.getVideoTracks(), ...audioTracks]),
      videoEffects,
      videoPublishOptions,
      videoResolution: `${videoEffects.width}×${videoEffects.height}`,
    };
  } catch (error) {
    room.disconnect();
    videoEffects.stop();
    throw error;
  }
}

export async function resumeHostBroadcast(currentUser, roomName, { quality = "720p" } = {}) {
  const authToken = localStorage.getItem("hostelcast_token");
  if (!authToken) throw new Error("Please sign in again to resume your live cast.");

  const result = await requestJson("/api/live/host/active/rejoin", authToken, {
    method: "POST",
    body: JSON.stringify({ roomName }),
  });
  if (!result.active) return null;

  let mediaStream;
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: quality === "1080p" ? 1920 : 1280 },
        height: { ideal: quality === "1080p" ? 1080 : 720 },
        frameRate: { ideal: 30, max: 30 },
      },
      audio: LIVE_AUDIO_CAPTURE_OPTIONS,
    });
    const connection = await connectHostBroadcast(mediaStream, result.url, result.token, quality);
    return {
      mode: "host",
      mediaStream,
      roomInfo: result.room,
      chatHistory: result.chatHistory || [],
      ...connection,
    };
  } catch (error) {
    mediaStream?.getTracks().forEach((track) => track.stop());
    throw error;
  }
}
