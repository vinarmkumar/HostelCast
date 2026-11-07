import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Room, RoomEvent, Track, VideoQuality } from "livekit-client";
import HomeSidebar from "../HomePage/HomeSidebar.jsx";
import LiveUserSearch from "../HomePage/LiveUserSearch.jsx";
import useLiveRooms from "./useLiveRooms.js";
import LiveProfileBar from "../MyProfile/LiveProfileBar.jsx";
import LIVE_AUDIO_CAPTURE_OPTIONS from "./audioCaptureOptions.js";
import { VIDEO_FILTERS } from "./videoEffects.js";
import { apiUrl } from "../apiUrl.js";
import burgerGift from "./img/burger50rs.png";
import cakeGift from "./img/cake300rs.png";
import cameraLogo from "./img/cameralogo.png";
import kinderJoyGift from "./img/kinderjoy30rs.png";
import microphoneLogo from "./img/miclogo.png";
import mojitoGift from "./img/mojito100rs.png";
import pizzaGift from "./img/pizza200rs.png";
import roseGift from "./img/rose1000rs.png";
import teddyBearGift from "./img/teddybear500rs.png";

const SUPERCHAT_GIFTS = [
  { name: "Kinder Joy", price: 30, image: kinderJoyGift },
  { name: "Burger", price: 50, image: burgerGift },
  { name: "Mojito", price: 100, image: mojitoGift },
  { name: "Pizza", price: 200, image: pizzaGift },
  { name: "Cake", price: 300, image: cakeGift },
  { name: "Teddy bear", price: 500, image: teddyBearGift },
  { name: "Rose", price: 1000, image: roseGift },
];

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
  if (!response.ok) throw new Error(result.message || "Live cast request failed.");
  return result;
}

function isLoopbackHostname(hostname) {
  return hostname === "localhost"
    || hostname.endsWith(".localhost")
    || hostname === "127.0.0.1"
    || hostname === "0.0.0.0"
    || hostname === "::1"
    || hostname === "[::1]";
}

function attachRemoteTrack(track, stageRef, filterId = "natural", identity, hostId, audioMutedRef, guestFilterId = "natural") {
  if (!stageRef.current) return;
  const element = track.attach();
  element.classList.add("live-remote-media");
  if (track.kind === Track.Kind.Video && identity) {
    element.classList.add(identity === hostId ? "live-host-video" : "live-cohost-video");
  }
  element.autoplay = true;
  element.playsInline = true;
  if (track.kind === Track.Kind.Audio) element.muted = Boolean(audioMutedRef?.current);
  if (track.kind === Track.Kind.Video) {
    const activeFilterId = identity === hostId ? filterId : guestFilterId;
    element.style.filter = VIDEO_FILTERS.find((item) => item.id === activeFilterId)?.css || "none";
  }
  stageRef.current.appendChild(element);
  if (track.kind === Track.Kind.Video) {
    const updateAspectRatio = () => updateStageAspectRatio(element, stageRef.current);
    element.addEventListener("loadedmetadata", updateAspectRatio, { once: true });
    element.addEventListener("resize", updateAspectRatio);
    updateAspectRatio();
    element.muted = true;
    element.play().then(() => { element.muted = false; }).catch(() => {});
  }
}

function detachRemoteStageGuest(room, stageRef, identity) {
  const participant = room?.remoteParticipants.get(identity);
  participant?.trackPublications.forEach((publication) => {
    publication.track?.detach().forEach((element) => element.remove());
  });
  stageRef.current?.querySelectorAll("video.live-remote-media.live-cohost-video").forEach((video) => video.remove());
}

function applyStageVideoFilter(stageRef, filterId, videoClass = "live-host-video") {
  const filter = VIDEO_FILTERS.find((item) => item.id === filterId);
  if (!filter || !stageRef.current) return;
  stageRef.current.querySelectorAll(`video.${videoClass}`).forEach((video) => {
    video.style.filter = filter.css;
  });
}

function updateStageAspectRatio(video, stage) {
  if (video.videoWidth && video.videoHeight) {
    stage.style.aspectRatio = `${video.videoWidth} / ${video.videoHeight}`;
  }
}

function formatLiveCount(count) {
  return new Intl.NumberFormat(undefined, {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(Math.max(0, Number(count) || 0));
}

function setRoomVideoQuality(room, quality) {
  room?.remoteParticipants.forEach((participant) => {
    participant.trackPublications.forEach((publication) => {
      if (publication.kind === Track.Kind.Video) {
        publication.setVideoQuality(quality.level);
        publication.setVideoDimensions(quality.dimensions);
      }
    });
  });
}

function shuffleRooms(rooms, seed) {
  const shuffled = [...rooms];
  let state = Math.floor(seed * 0x7fffffff);
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const swapIndex = state % (index + 1);
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

function attachExistingTracks(room, stageRef, filterId, hostId, audioMutedRef, guestFilterId) {
  room.remoteParticipants.forEach((participant) => {
    participant.trackPublications.forEach((publication) => {
      if (publication.track) {
        attachRemoteTrack(publication.track, stageRef, filterId, participant.identity, hostId, audioMutedRef, guestFilterId);
      }
    });
  });
}

function drawPreviewVideo(context, video, x, y, width, height, filterId) {
  if (!video || video.readyState < 2 || video.videoWidth < 16) return false;
  const sourceRatio = video.videoWidth / video.videoHeight;
  const targetRatio = width / height;
  let sourceX = 0;
  let sourceY = 0;
  let sourceWidth = video.videoWidth;
  let sourceHeight = video.videoHeight;
  if (sourceRatio > targetRatio) {
    sourceWidth = video.videoHeight * targetRatio;
    sourceX = (video.videoWidth - sourceWidth) / 2;
  } else {
    sourceHeight = video.videoWidth / targetRatio;
    sourceY = (video.videoHeight - sourceHeight) / 2;
  }

  context.save();
  context.filter = VIDEO_FILTERS.find((item) => item.id === filterId)?.css || "none";
  context.translate(x + width, y);
  context.scale(-1, 1);
  context.drawImage(video, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, width, height);
  context.restore();
  return true;
}

function captureLivePreview(hostVideo, guestVideo, hostFilter, guestFilter, stage) {
  if (!hostVideo || hostVideo.readyState < 2 || hostVideo.videoWidth < 16) return "";
  const hasGuestVideo = guestVideo?.readyState >= 2 && guestVideo.videoWidth >= 16;
  const stageBounds = stage?.getBoundingClientRect();
  const width = 320;
  const height = Math.max(1, Math.round(
    width * (stageBounds?.width && stageBounds.height
      ? stageBounds.height / stageBounds.width
      : hostVideo.videoHeight / hostVideo.videoWidth)
  ));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return "";
  context.fillStyle = "#08090b";
  context.fillRect(0, 0, width, height);
  if (hasGuestVideo) {
    drawPreviewVideo(context, hostVideo, 0, 0, width / 2, height, hostFilter);
    drawPreviewVideo(context, guestVideo, width / 2, 0, width / 2, height, guestFilter);
    context.fillStyle = "rgba(201, 157, 72, .9)";
    context.fillRect(width / 2 - 1, 0, 2, height);
  } else {
    drawPreviewVideo(context, hostVideo, 0, 0, width, height, hostFilter);
  }
  return canvas.toDataURL("image/jpeg", 0.45);
}

function bindRoomEvents(room, stageRef, hostId, onMessage, onFilterChange, filterRef, guestFilterRef, stageGuestRef, onStageSignal, onParticipantDisconnected, audioMutedRef) {
  const onTrackSubscribed = (track, _publication, participant) => {
    attachRemoteTrack(
      track,
      stageRef,
      filterRef.current,
      participant?.identity,
      hostId,
      audioMutedRef,
      guestFilterRef.current
    );
  };
  const onTrackUnsubscribed = (track) => track.detach().forEach((element) => element.remove());
  const onParticipantDisconnectedEvent = (participant) => {
    onParticipantDisconnected?.(participant.identity);
  };
  const onDataReceived = (payload, participant) => {
    try {
      const data = JSON.parse(new TextDecoder().decode(payload));
      if (typeof data.type === "string" && data.type.startsWith("stage-")) {
        if (!participant) onStageSignal(data);
        return;
      }
      if (
        data.type === "filter"
        && (participant?.identity === hostId || participant?.identity === stageGuestRef.current?.identity)
      ) {
        const filter = VIDEO_FILTERS.find((item) => item.id === data.filterId);
        if (filter) {
          onFilterChange(filter.id, participant.identity);
          applyStageVideoFilter(stageRef, filter.id, participant.identity === hostId ? "live-host-video" : "live-cohost-video");
        }
        return;
      }
      if (data.type !== "chat" || typeof data.message !== "string") return;
      const identity = participant?.identity || String(data.identity || "");
      onMessage({
        id: typeof data.id === "string" ? data.id : `${Date.now()}-${Math.random()}`,
        identity,
        name: String(participant?.name || data.name || "Student").slice(0, 60),
        university: String(data.university || "").slice(0, 80),
        avatarUrl: String(data.avatarUrl || "").slice(0, 2048),
        message: data.message.slice(0, 300),
        role: identity === hostId || data.role === "host" ? "host" : "viewer",
        isOwn: identity === room.localParticipant.identity,
      });
    } catch (error) {
      console.error("Could not read live chat message:", error);
    }
  };

  room.on(RoomEvent.TrackSubscribed, onTrackSubscribed);
  room.on(RoomEvent.TrackUnsubscribed, onTrackUnsubscribed);
  room.on(RoomEvent.DataReceived, onDataReceived);
  room.on(RoomEvent.ParticipantDisconnected, onParticipantDisconnectedEvent);
  return () => {
    room.off(RoomEvent.TrackSubscribed, onTrackSubscribed);
    room.off(RoomEvent.TrackUnsubscribed, onTrackUnsubscribed);
    room.off(RoomEvent.DataReceived, onDataReceived);
    room.off(RoomEvent.ParticipantDisconnected, onParticipantDisconnectedEvent);
  };
}

function mergeChatMessages(current, incoming, ownIdentity) {
  const messagesById = new Map(current.map((message) => [message.id, message]));
  incoming.forEach((message) => {
    if (message?.id) {
      messagesById.set(message.id, {
        ...message,
        isOwn: message.identity === ownIdentity,
      });
    }
  });
  return [...messagesById.values()].slice(-100);
}

function getChatAuthorUserId(message, hostId) {
  if (message.identity === hostId && /^[a-f\d]{24}$/i.test(hostId || "")) return hostId;
  return /^viewer-([a-f\d]{24})-/i.exec(message.identity || "")?.[1] || null;
}

export default function LiveRoomPage({ session, currentUser, theme, onToggleTheme, onExit, onWatchLive, onOpenProfile, onPreviewFrame, isMinimized, onMinimize, onExpand, onSignOut }) {
  function openProfileFromLive(userId, tab) {
    if (!userId) return;
    onMinimize?.();
    onOpenProfile?.(userId, tab);
  }

  const [roomInfo, setRoomInfo] = useState(session.roomInfo || session.room || null);
  const [status, setStatus] = useState(
    session.mode === "host" && !session.room
      ? "Could not connect"
      : session.mode === "host" ? "You are live now" : "Connecting..."
  );
  const [error, setError] = useState(session.mode === "host" && !session.room ? "The live room could not be connected." : "");
  const [messages, setMessages] = useState(() => (session.chatHistory || []).map((message) => ({
    ...message,
    isOwn: message.identity === (session.roomInfo?.hostId || session.room?.hostId),
  })));
  const [comment, setComment] = useState("");
  const [cameraOn, setCameraOn] = useState(true);
  const [microphoneOn, setMicrophoneOn] = useState(true);
  const [activeFilter, setActiveFilter] = useState(session.roomInfo?.activeFilter || "natural");
  const [stageGuest, setStageGuest] = useState(session.room?.stageGuest || session.roomInfo?.stageGuest || null);
  const [guestFilter, setGuestFilter] = useState(
    session.room?.stageGuest?.activeFilter || session.roomInfo?.stageGuest?.activeFilter || "natural"
  );
  const [pendingStageInvite, setPendingStageInvite] = useState(null);
  const [inviteSecondsRemaining, setInviteSecondsRemaining] = useState(30);
  const [selectedViewer, setSelectedViewer] = useState(null);
  const [navigationMenuOpen, setNavigationMenuOpen] = useState(false);
  const [sidebarCategory, setSidebarCategory] = useState(() => session.roomInfo?.category || session.room?.category || "Engineering");
  const [sidebarCollege, setSidebarCollege] = useState("All");
  const [stageNotice, setStageNotice] = useState("");
  const [stageActionLoading, setStageActionLoading] = useState(false);
  const [isStageGuest, setIsStageGuest] = useState(false);
  const [guestCameraReady, setGuestCameraReady] = useState(false);
  const [viewerStats, setViewerStats] = useState({ viewers: 0, likes: 0, liked: false });
  const [statsError, setStatsError] = useState("");
  const [likeLoading, setLikeLoading] = useState(false);
  const [videoQuality, setVideoQuality] = useState("1080");
  const [remoteAudioMuted, setRemoteAudioMuted] = useState(false);
  const [playerControlsVisible, setPlayerControlsVisible] = useState(false);
  const [playerError, setPlayerError] = useState("");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [floatingDragEnabled, setFloatingDragEnabled] = useState(false);
  const [floatingDragPosition, setFloatingDragPosition] = useState(null);
  const [isFloatingDragging, setIsFloatingDragging] = useState(false);
  const [recommendationSeed] = useState(() => Math.random());
  const { rooms, loading: roomsLoading, error: roomsError } = useLiveRooms();
  const stageRef = useRef(null);
  const floatingCardRef = useRef(null);
  const lastFloatingTapRef = useRef(null);
  const floatingDragRef = useRef(null);
  const localVideoRef = useRef(null);
  const guestVideoRef = useRef(null);
  const messagesRef = useRef(null);
  const roomRef = useRef(session.mode === "host" ? session.room : null);
  const liveRoomNameRef = useRef(session.roomInfo?.roomName || session.room?.roomName || "");
  const videoQualityRef = useRef({
    level: VideoQuality.HIGH,
    dimensions: { width: 1920, height: 1080 },
  });
  const remoteAudioMutedRef = useRef(false);
  const playerControlsTimerRef = useRef(null);
  const statsRoomName = session.roomInfo?.roomName || session.room?.roomName || "";
  const lastCommentAtRef = useRef(0);
  const currentRoomName = session.roomInfo?.roomName || session.room?.roomName || "";
  const activeFilterRef = useRef(activeFilter);
  const guestFilterRef = useRef(guestFilter);
  const stageGuestRef = useRef(stageGuest);
  const hostIdentity = session.roomInfo?.hostId || session.room?.hostId || "";
  const recommendations = useMemo(
    () => shuffleRooms(
      rooms.filter((room) => room.roomName !== currentRoomName
        && room.category === sidebarCategory
        && (sidebarCollege === "All" || room.college === sidebarCollege)),
      recommendationSeed
    ).slice(0, 20),
    [rooms, currentRoomName, recommendationSeed, sidebarCategory, sidebarCollege]
  );

  const handleRemoteFilterChange = useCallback((filterId, identity) => {
    if (identity === hostIdentity) {
      activeFilterRef.current = filterId;
      setActiveFilter(filterId);
      return;
    }
    if (identity === stageGuestRef.current?.identity) {
      guestFilterRef.current = filterId;
      setGuestFilter(filterId);
    }
  }, [hostIdentity]);

  const handleStageSignal = useCallback((signal) => {
    if (signal.type === "stage-invite" && session.mode === "viewer") {
      setPendingStageInvite({
        name: String(signal.name || "The host"),
        expiresAt: Number(signal.expiresAt) || Date.now() + 30_000,
      });
      setInviteSecondsRemaining(30);
      return;
    }
    if (signal.type === "stage-invite-cancelled" && session.mode === "viewer") {
      setPendingStageInvite(null);
      setStageNotice("The host cancelled the stage invite.");
      return;
    }
    if (signal.type === "stage-invite-declined") {
      setPendingStageInvite(null);
      setStageNotice(`${signal.name || "The viewer"} declined the stage invite. You can invite them again.`);
      return;
    }
    if (signal.type === "stage-invite-expired") {
      setPendingStageInvite((current) => (
        session.mode !== "host" || current?.identity === signal.identity ? null : current
      ));
      setStageNotice(`${signal.name || "The viewer"}'s 30-second stage invitation expired. You can invite them again.`);
      return;
    }
    if (signal.type === "stage-guest-started") {
      const guest = {
        identity: signal.identity,
        name: signal.name || "Guest",
        activeFilter: signal.activeFilter || "natural",
      };
      stageGuestRef.current = guest;
      setStageGuest(guest);
      guestFilterRef.current = signal.activeFilter || "natural";
      setGuestFilter(signal.activeFilter || "natural");
      setPendingStageInvite(null);
      setStageNotice(`${signal.name || "A viewer"} joined the live stage.`);
      if (session.mode === "viewer" && roomRef.current?.localParticipant.identity === signal.identity) {
        setIsStageGuest(true);
      }
      return;
    }
    if (signal.type === "stage-guest-ended") {
      if (stageGuestRef.current?.identity === signal.identity) stageGuestRef.current = null;
      setStageGuest((current) => current?.identity === signal.identity ? null : current);
      if (session.mode === "host") {
        detachRemoteStageGuest(roomRef.current, stageRef, signal.identity);
      }
      if (session.mode === "viewer" && roomRef.current?.localParticipant.identity === signal.identity) {
        setIsStageGuest(false);
        setGuestCameraReady(false);
        setCameraOn(false);
        setMicrophoneOn(false);
        Promise.all([
          roomRef.current.localParticipant.setCameraEnabled(false),
          roomRef.current.localParticipant.setMicrophoneEnabled(false),
        ]).catch((mediaError) => console.error("Could not stop guest camera and microphone:", mediaError.message));
      }
      setStageNotice(`${signal.name || "The guest"} left the live stage.`);
    }
  }, [session.mode]);

  useEffect(() => {
    let disposed = false;
    let heartbeat;
    let previewTimer;
    let previewUploadInFlight = false;
    let handlePreviewVisibilityChange;
    let unbindRoomEvents;
    let viewerRoom;

    async function connectViewer() {
      try {
        const authToken = localStorage.getItem("hostelcast_token");
        if (!authToken) throw new Error("Please sign in again to use live casts.");

        const result = await requestJson(`/api/live/${encodeURIComponent(session.room.roomName)}/token`, authToken, { method: "POST" });
        if (disposed) return;
        const liveKitHostname = new URL(result.url).hostname;
        if (isLoopbackHostname(liveKitHostname) && !isLoopbackHostname(window.location.hostname)) {
          throw new Error("The LiveKit server is configured for localhost, so other devices cannot receive the video. Ask the administrator to set LIVEKIT_URL to a reachable LiveKit address.");
        }
        setRoomInfo(result.room);
        stageGuestRef.current = result.room.stageGuest || null;
        setStageGuest(result.room.stageGuest || null);
        const initialGuestFilter = VIDEO_FILTERS.some((item) => item.id === result.room.stageGuest?.activeFilter)
          ? result.room.stageGuest.activeFilter
          : "natural";
        guestFilterRef.current = initialGuestFilter;
        setGuestFilter(initialGuestFilter);
        setMessages((current) => mergeChatMessages(current, result.chatHistory || [], ""));
        liveRoomNameRef.current = result.room.roomName;
        const initialFilter = VIDEO_FILTERS.some((item) => item.id === result.room.activeFilter)
          ? result.room.activeFilter
          : "natural";
        setActiveFilter(initialFilter);
        activeFilterRef.current = initialFilter;

        viewerRoom = new Room({
          adaptiveStream: { pauseVideoInBackground: false },
          dynacast: true,
        });
        roomRef.current = viewerRoom;
        unbindRoomEvents = bindRoomEvents(
          viewerRoom,
          stageRef,
          result.room.hostId,
          (message) => {
            setMessages((current) => current.some((item) => item.id === message.id) ? current : [...current.slice(-99), message]);
          },
          handleRemoteFilterChange,
          activeFilterRef,
          guestFilterRef,
          stageGuestRef,
          handleStageSignal,
          undefined,
          remoteAudioMutedRef
        );
        await viewerRoom.connect(result.url, result.token);
        attachExistingTracks(
          viewerRoom,
          stageRef,
          initialFilter,
          result.room.hostId,
          remoteAudioMutedRef,
          initialGuestFilter
        );
        setRoomVideoQuality(viewerRoom, videoQualityRef.current);
        viewerRoom.on(RoomEvent.TrackSubscribed, (_track, publication) => {
          if (publication.kind === Track.Kind.Video) {
            publication.setVideoQuality(videoQualityRef.current.level);
            publication.setVideoDimensions(videoQualityRef.current.dimensions);
          }
        });
        applyStageVideoFilter(stageRef, initialFilter);
        applyStageVideoFilter(stageRef, initialGuestFilter, "live-cohost-video");
        if (!disposed) setStatus("Watching live");
        try {
          const chatResult = await requestJson(`/api/live/${encodeURIComponent(result.room.roomName)}/chat`, authToken);
          setMessages((current) => mergeChatMessages(current, chatResult.messages || [], viewerRoom.localParticipant.identity));
        } catch (chatError) {
          if (!disposed) setError(`Live chat history could not be loaded: ${chatError.message}`);
        }
      } catch (connectionError) {
        if (!disposed) {
          setError(connectionError.message);
          setStatus("Could not connect");
        }
      }
    }

    if (session.mode === "host") {
      const room = session.room;
      if (room) {
        roomRef.current = room;
        unbindRoomEvents = bindRoomEvents(
          room,
          stageRef,
          session.roomInfo?.hostId,
          (message) => {
            setMessages((current) => current.some((item) => item.id === message.id) ? current : [...current.slice(-99), message]);
          },
          handleRemoteFilterChange,
          activeFilterRef,
          guestFilterRef,
          stageGuestRef,
          handleStageSignal,
          async (identity) => {
            try {
              const authToken = localStorage.getItem("hostelcast_token");
              await requestJson(`/api/live/stage/${encodeURIComponent(liveRoomNameRef.current)}/disconnected`, authToken, {
                method: "POST",
                body: JSON.stringify({ identity }),
              });
            } catch (disconnectError) {
              console.error("Disconnected stage guest could not be cleared:", disconnectError.message);
            }
          }
        );
      }
      if (localVideoRef.current && session.broadcastStream) {
        localVideoRef.current.srcObject = session.broadcastStream;
        localVideoRef.current.play().catch((error) => console.error("Local video preview failed:", error));
      }

      const authToken = localStorage.getItem("hostelcast_token");
      heartbeat = window.setInterval(async () => {
        try {
          await requestJson(`/api/live/${encodeURIComponent(liveRoomNameRef.current)}/heartbeat`, authToken, { method: "POST" });
        } catch (heartbeatError) {
          console.error("Live cast heartbeat failed:", heartbeatError.message);
          setError("Connection to the live cast was lost. Please end and restart your cast.");
        }
      }, 25_000);

      async function uploadPreview() {
        if (disposed || previewUploadInFlight) return;
        const preview = captureLivePreview(
          localVideoRef.current,
          stageRef.current?.querySelector("video.live-cohost-video"),
          activeFilterRef.current,
          guestFilterRef.current,
          stageRef.current
        );
        if (!preview) return;
        previewUploadInFlight = true;
        try {
          await requestJson(`/api/live/${encodeURIComponent(liveRoomNameRef.current)}/preview`, authToken, {
            method: "POST",
            body: JSON.stringify({ preview }),
          });
        } catch (previewError) {
          console.error("Live homepage preview could not be updated:", previewError.message);
        } finally {
          previewUploadInFlight = false;
        }
      }

      handlePreviewVisibilityChange = () => {
        if (document.visibilityState === "visible") uploadPreview();
      };
      document.addEventListener("visibilitychange", handlePreviewVisibilityChange);
      uploadPreview();
      previewTimer = window.setInterval(uploadPreview, 10_000);
    } else {
      connectViewer();
    }

    return () => {
      disposed = true;
      window.clearInterval(heartbeat);
      window.clearInterval(previewTimer);
      if (handlePreviewVisibilityChange) {
        document.removeEventListener("visibilitychange", handlePreviewVisibilityChange);
      }
      unbindRoomEvents?.();
      viewerRoom?.disconnect();
      if (session.mode === "viewer") roomRef.current = null;
    };
  }, [handleRemoteFilterChange, handleStageSignal, session]);

  useEffect(() => {
    if (!statsRoomName || !["You are live now", "Watching live"].includes(status)) return undefined;
    let disposed = false;
    let loadingStats = false;
    const loadStats = async () => {
      if (disposed || loadingStats || document.visibilityState !== "visible") return;
      loadingStats = true;
      try {
        const authToken = localStorage.getItem("hostelcast_token");
        const result = await requestJson(`/api/live/${encodeURIComponent(statsRoomName)}/stats`, authToken);
        if (!disposed) {
          setViewerStats((current) => ({
            viewers: result.viewers,
            likes: Math.max(current.likes, result.likes),
            liked: current.liked || result.liked,
          }));
          setStatsError("");
        }
      } catch (statsLoadError) {
        if (!disposed) {
          console.error("Live audience stats could not be refreshed:", statsLoadError.message);
          setStatsError(statsLoadError.message);
        }
      } finally {
        loadingStats = false;
      }
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") loadStats();
    };
    loadStats();
    const interval = window.setInterval(loadStats, 15_000);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      disposed = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [statsRoomName, status]);

  useEffect(() => {
    if (session.mode !== "viewer" || !isMinimized || !onPreviewFrame) return undefined;
    const roomName = session.room?.roomName;
    if (!roomName) return undefined;

    const captureViewerFrame = () => {
      const stage = stageRef.current;
      const preview = captureLivePreview(
        stage?.querySelector("video.live-host-video"),
        stage?.querySelector("video.live-cohost-video"),
        activeFilterRef.current,
        guestFilterRef.current,
        stage
      );
      if (preview) onPreviewFrame(roomName, preview);
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") captureViewerFrame();
    };

    captureViewerFrame();
    const interval = window.setInterval(captureViewerFrame, 10_000);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [isMinimized, onPreviewFrame, session.mode, session.room?.roomName]);

  useEffect(() => {
    const updateFullscreenState = () => setIsFullscreen(document.fullscreenElement === stageRef.current);
    document.addEventListener("fullscreenchange", updateFullscreenState);
    return () => document.removeEventListener("fullscreenchange", updateFullscreenState);
  }, []);

  useEffect(() => () => window.clearTimeout(playerControlsTimerRef.current), []);

  useEffect(() => {
    messagesRef.current?.scrollTo({ top: messagesRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (session.mode !== "viewer" || !isStageGuest || !guestCameraReady || !guestVideoRef.current) return undefined;
    const track = roomRef.current?.localParticipant
      .getTrackPublication(Track.Source.Camera)?.track?.mediaStreamTrack;
    if (!track) return undefined;
    const video = guestVideoRef.current;
    video.srcObject = new MediaStream([track]);
    video.play().catch((playError) => console.error("Guest camera preview failed:", playError.message));
    return () => {
      video.pause();
      video.srcObject = null;
    };
  }, [cameraOn, guestCameraReady, isStageGuest, session.mode]);

  async function sendComment(event) {
    event.preventDefault();
    const message = comment.trim().slice(0, 300);
    const room = roomRef.current;
    if (!message || !room || Date.now() - lastCommentAtRef.current < 1000) return;

    try {
      const authToken = localStorage.getItem("hostelcast_token");
      const result = await requestJson(`/api/live/${encodeURIComponent(liveRoomNameRef.current)}/chat`, authToken, {
        method: "POST",
        body: JSON.stringify({ identity: room.localParticipant.identity, message }),
      });
      setMessages((current) => mergeChatMessages(current, [result.message], room.localParticipant.identity));
      lastCommentAtRef.current = Date.now();
      setComment("");
    } catch (sendError) {
      setError(`Comment could not be sent: ${sendError.message}`);
    }
  }

  async function toggleFullscreen() {
    const stage = stageRef.current;
    if (!stage) return;
    setPlayerError("");
    try {
      if (document.fullscreenElement === stage) await document.exitFullscreen();
      else await stage.requestFullscreen();
    } catch (fullscreenError) {
      setPlayerError(`Fullscreen could not be changed: ${fullscreenError.message}`);
    }
  }

  function showPlayerControls() {
    setPlayerControlsVisible(true);
    window.clearTimeout(playerControlsTimerRef.current);
    playerControlsTimerRef.current = window.setTimeout(() => {
      setPlayerControlsVisible(false);
    }, 4000);
  }

  function toggleRemoteAudio() {
    const nextMuted = !remoteAudioMutedRef.current;
    remoteAudioMutedRef.current = nextMuted;
    setRemoteAudioMuted(nextMuted);
    stageRef.current?.querySelectorAll("audio.live-remote-media").forEach((audio) => {
      audio.muted = nextMuted;
    });
  }

  function changeViewerQuality(value) {
    const qualityOptions = {
      1080: { level: VideoQuality.HIGH, dimensions: { width: 1920, height: 1080 } },
      480: { level: VideoQuality.MEDIUM, dimensions: { width: 854, height: 480 } },
      360: { level: VideoQuality.LOW, dimensions: { width: 640, height: 360 } },
    };
    const quality = qualityOptions[value];
    if (!quality) return;
    videoQualityRef.current = quality;
    setVideoQuality(value);
    setRoomVideoQuality(roomRef.current, quality);
  }

  async function likeLiveCast() {
    if (likeLoading || viewerStats.liked || session.mode !== "viewer") return;
    setLikeLoading(true);
    setPlayerError("");
    try {
      const authToken = localStorage.getItem("hostelcast_token");
      const result = await requestJson(`/api/live/${encodeURIComponent(liveRoomNameRef.current)}/like`, authToken, {
        method: "POST",
      });
      setViewerStats((current) => ({
        ...current,
        likes: Math.max(current.likes, result.likes),
        liked: current.liked || result.liked,
      }));
    } catch (likeError) {
      setPlayerError(`Could not like this live cast: ${likeError.message}`);
    } finally {
      setLikeLoading(false);
    }
  }

  function toggleTrack(kind) {
    const stream = session.mediaStream;
    const tracks = kind === "video" ? stream?.getVideoTracks() : stream?.getAudioTracks();
    if (!tracks?.length) return;
    const nextEnabled = !tracks[0].enabled;
    tracks.forEach((track) => { track.enabled = nextEnabled; });
    if (kind === "video" && session.mode === "host") {
      const publishedTrack = roomRef.current?.localParticipant
        .getTrackPublication(Track.Source.Camera)?.track?.mediaStreamTrack;
      if (publishedTrack && !tracks.includes(publishedTrack)) publishedTrack.enabled = nextEnabled;
    }
    if (kind === "video") setCameraOn(nextEnabled);
    else setMicrophoneOn(nextEnabled);
  }

  async function toggleGuestTrack(kind) {
    const participant = roomRef.current?.localParticipant;
    if (!participant || !isStageGuest) return;
    const nextEnabled = kind === "video" ? !cameraOn : !microphoneOn;
    try {
      if (kind === "video") await participant.setCameraEnabled(nextEnabled);
      else await participant.setMicrophoneEnabled(nextEnabled);
      if (kind === "video") setCameraOn(nextEnabled);
      else setMicrophoneOn(nextEnabled);
    } catch (mediaError) {
      setError(`Could not ${nextEnabled ? "enable" : "disable"} your ${kind === "video" ? "camera" : "microphone"}: ${mediaError.message}`);
    }
  }

  async function changeVideoFilter(filterId) {
    try {
      if (session.mode === "host") {
        session.videoEffects?.setFilter(filterId);
        const authToken = localStorage.getItem("hostelcast_token");
        await requestJson(`/api/live/${encodeURIComponent(liveRoomNameRef.current)}/filter`, authToken, {
          method: "POST",
          body: JSON.stringify({ filterId }),
        });
        await roomRef.current.localParticipant.publishData(
          new TextEncoder().encode(JSON.stringify({ type: "filter", filterId })),
          { reliable: true, topic: "hostelcast-filter" }
        );
        activeFilterRef.current = filterId;
        applyStageVideoFilter(stageRef, filterId);
        setActiveFilter(filterId);
      } else if (isStageGuest) {
        const room = roomRef.current;
        if (!room) throw new Error("The live stage connection is not ready.");
        const authToken = localStorage.getItem("hostelcast_token");
        await requestJson(`/api/live/stage/${encodeURIComponent(liveRoomNameRef.current)}/filter`, authToken, {
          method: "POST",
          body: JSON.stringify({ identity: room.localParticipant.identity, filterId }),
        });
        await room.localParticipant.publishData(
          new TextEncoder().encode(JSON.stringify({ type: "filter", filterId })),
          { reliable: true, topic: "hostelcast-filter" }
        );
        guestFilterRef.current = filterId;
        applyStageVideoFilter(stageRef, filterId, "live-cohost-video");
        setGuestFilter(filterId);
      }
    } catch (filterError) {
      setError(filterError.message);
    }
  }

  async function inviteViewer(identity) {
    setStageActionLoading(true);
    setError("");
    try {
      const authToken = localStorage.getItem("hostelcast_token");
      const result = await requestJson(`/api/live/stage/${encodeURIComponent(liveRoomNameRef.current)}/invite`, authToken, {
        method: "POST",
        body: JSON.stringify({ identity }),
      });
      setPendingStageInvite(result.invite);
      setInviteSecondsRemaining(30);
      setSelectedViewer(null);
      setStageNotice(`Stage invite sent to ${result.invite.name}.`);
    } catch (inviteError) {
      setError(inviteError.message);
    } finally {
      setStageActionLoading(false);
    }
  }

  async function respondToStageInvite(accepted) {
    const room = roomRef.current;
    if (!room || stageActionLoading) return;
    setStageActionLoading(true);
    setError("");
    try {
      const authToken = localStorage.getItem("hostelcast_token");
      await requestJson(`/api/live/stage/${encodeURIComponent(liveRoomNameRef.current)}/respond`, authToken, {
        method: "POST",
        body: JSON.stringify({
          identity: room.localParticipant.identity,
          accepted,
        }),
      });
      setPendingStageInvite(null);
      if (!accepted) return;

      try {
        await room.localParticipant.setCameraEnabled(true, { frameRate: 30 }, { source: Track.Source.Camera });
        await room.localParticipant.setMicrophoneEnabled(true, LIVE_AUDIO_CAPTURE_OPTIONS, { source: Track.Source.Microphone });
        setCameraOn(true);
        setMicrophoneOn(true);
        setIsStageGuest(true);
        setGuestCameraReady(true);
        setStageNotice("You joined the live stage. You can leave the stage at any time.");
      } catch (mediaError) {
        const cleanupResults = await Promise.allSettled([
          room.localParticipant.setCameraEnabled(false),
          room.localParticipant.setMicrophoneEnabled(false),
        ]);
        cleanupResults.forEach((result) => {
          if (result.status === "rejected") {
            console.error("Could not stop guest camera and microphone:", result.reason);
          }
        });
        await requestJson(`/api/live/stage/${encodeURIComponent(liveRoomNameRef.current)}/leave`, authToken, {
          method: "POST",
          body: JSON.stringify({ identity: room.localParticipant.identity }),
        });
        setIsStageGuest(false);
        setGuestCameraReady(false);
        setCameraOn(false);
        setMicrophoneOn(false);
        throw new Error(`Camera and microphone could not be started: ${mediaError.message}`);
      }
    } catch (responseError) {
      setError(responseError.message);
    } finally {
      setStageActionLoading(false);
    }
  }

  async function leaveStage() {
    const room = roomRef.current;
    if (!room || stageActionLoading) return;
    setStageActionLoading(true);
    setError("");
    try {
      const authToken = localStorage.getItem("hostelcast_token");
      await requestJson(`/api/live/stage/${encodeURIComponent(liveRoomNameRef.current)}/leave`, authToken, {
        method: "POST",
        body: JSON.stringify({ identity: room.localParticipant.identity }),
      });
      await Promise.all([
        room.localParticipant.setCameraEnabled(false),
        room.localParticipant.setMicrophoneEnabled(false),
      ]);
      setIsStageGuest(false);
      setGuestCameraReady(false);
      setCameraOn(false);
      setMicrophoneOn(false);
    } catch (leaveError) {
      setError(leaveError.message);
    } finally {
      setStageActionLoading(false);
    }
  }

  async function endGuestStage() {
    if (stageActionLoading) return;
    setStageActionLoading(true);
    setError("");
    try {
      const authToken = localStorage.getItem("hostelcast_token");
      await requestJson(`/api/live/stage/${encodeURIComponent(liveRoomNameRef.current)}/end`, authToken, {
        method: "POST",
      });
      stageGuestRef.current = null;
      setStageGuest(null);
      setStageNotice("The guest has left the live stage. Your live cast continues.");
    } catch (endError) {
      setError(endError.message);
    } finally {
      setStageActionLoading(false);
    }
  }

  async function banViewer(identity, name) {
    if (!window.confirm(`Block ${name} from this live cast? They can join your future live casts.`)) return;
    setStageActionLoading(true);
    setError("");
    try {
      const authToken = localStorage.getItem("hostelcast_token");
      await requestJson(`/api/live/stage/${encodeURIComponent(liveRoomNameRef.current)}/ban`, authToken, {
        method: "POST",
        body: JSON.stringify({ identity }),
      });
      setSelectedViewer(null);
      setStageNotice(`${name} was blocked from this live cast.`);
      setPendingStageInvite((current) => current?.identity === identity ? null : current);
      if (stageGuestRef.current?.identity === identity) {
        stageGuestRef.current = null;
        setStageGuest(null);
      }
    } catch (banError) {
      setError(banError.message);
    } finally {
      setStageActionLoading(false);
    }
  }

  async function leaveRoom() {
    if (stopping) return;
    setStopping(true);
    if (session.mode === "host" && liveRoomNameRef.current) {
      try {
        const authToken = localStorage.getItem("hostelcast_token");
        if (!authToken) throw new Error("Your session expired. Sign in again before ending the live cast.");
        await requestJson(`/api/live/${encodeURIComponent(liveRoomNameRef.current)}`, authToken, { method: "DELETE" });
      } catch (stopError) {
        setError(stopError.message);
        setStopping(false);
        return;
      }
      session.mediaStream?.getTracks().forEach((track) => track.stop());
      session.videoEffects?.stop();
    } else if (session.mode === "viewer" && isStageGuest) {
      try {
        const authToken = localStorage.getItem("hostelcast_token");
        await requestJson(`/api/live/stage/${encodeURIComponent(liveRoomNameRef.current)}/leave`, authToken, {
          method: "POST",
          body: JSON.stringify({ identity: roomRef.current?.localParticipant.identity }),
        });
      } catch (leaveError) {
        setError(leaveError.message);
        setStopping(false);
        return;
      }
    }
    roomRef.current?.disconnect();
    onExit();
  }

  useEffect(() => {
    if (!pendingStageInvite) return undefined;
    const expiresAt = Number(pendingStageInvite.expiresAt) || Date.now() + 30_000;
    const updateRemaining = () => {
      const remaining = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
      setInviteSecondsRemaining(remaining);
      if (remaining === 0) {
        setPendingStageInvite(null);
        setStageNotice("The 30-second stage invitation expired.");
      }
    };
    updateRemaining();
    const timer = window.setInterval(updateRemaining, 1000);
    return () => window.clearInterval(timer);
  }, [pendingStageInvite, session.mode]);

  function startFloatingCardDrag(event) {
    const card = floatingCardRef.current;
    if (!card) return;
    const bounds = card.getBoundingClientRect();
    setFloatingDragEnabled(true);
    setFloatingDragPosition((current) => current || { left: bounds.left, top: bounds.top });
    floatingDragRef.current = {
      pointerId: event.pointerId,
      offsetX: event.clientX - bounds.left,
      offsetY: event.clientY - bounds.top,
    };
    setIsFloatingDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  function enableFloatingCardDrag() {
    const bounds = floatingCardRef.current?.getBoundingClientRect();
    if (bounds) {
      setFloatingDragPosition((current) => current || { left: bounds.left, top: bounds.top });
    }
    setFloatingDragEnabled(true);
  }

  function handleFloatingCardPointerDown(event) {
    if (!isMinimized || event.target.closest("button, input, select, textarea, a, .live-player-overlay-controls")) return;
    if (floatingDragEnabled) {
      startFloatingCardDrag(event);
      return;
    }

    const now = Date.now();
    const previousTap = lastFloatingTapRef.current;
    const isTouch = event.pointerType === "touch";
    const isDoubleTap = previousTap
      && now - previousTap.time < (isTouch ? 900 : 600)
      && Math.hypot(event.clientX - previousTap.x, event.clientY - previousTap.y) < (isTouch ? 100 : 48);
    if (isDoubleTap) {
      lastFloatingTapRef.current = null;
      enableFloatingCardDrag();
      startFloatingCardDrag(event);
      return;
    }
    lastFloatingTapRef.current = { time: now, x: event.clientX, y: event.clientY };
  }

  function handleFloatingCardDoubleClick(event) {
    if (!isMinimized || event.target.closest("button, input, select, textarea, a, .live-player-overlay-controls")) return;
    enableFloatingCardDrag();
  }

  function handleFloatingCardPointerMove(event) {
    const drag = floatingDragRef.current;
    const card = floatingCardRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !card) return;
    const bounds = card.getBoundingClientRect();
    const left = Math.max(0, Math.min(window.innerWidth - bounds.width, event.clientX - drag.offsetX));
    const top = Math.max(0, Math.min(window.innerHeight - bounds.height, event.clientY - drag.offsetY));
    setFloatingDragPosition({ left, top });
  }

  function stopFloatingCardDrag(event) {
    if (floatingDragRef.current?.pointerId !== event.pointerId) return;
    floatingDragRef.current = null;
    setIsFloatingDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  return (
    <main
      ref={floatingCardRef}
      className={`live-room-page ${session.mode === "host" ? "is-host-mode" : ""} ${isMinimized ? "is-minimized" : ""} ${floatingDragEnabled ? "is-drag-enabled" : ""} ${isFloatingDragging ? "is-dragging" : ""}`}
      style={floatingDragPosition ? {
        left: `${floatingDragPosition.left}px`,
        top: `${floatingDragPosition.top}px`,
        right: "auto",
        bottom: "auto",
      } : undefined}
      onPointerDown={handleFloatingCardPointerDown}
      onPointerMove={handleFloatingCardPointerMove}
      onPointerUp={stopFloatingCardDrag}
      onPointerCancel={stopFloatingCardDrag}
      onDoubleClick={handleFloatingCardDoubleClick}
    >
      <header className="live-room-header">
        {!isMinimized && (
          <div className="live-navigation-menu">
            <button
              className="live-menu-button"
              type="button"
              onClick={() => setNavigationMenuOpen(true)}
              aria-label="Toggle navigation menu"
              aria-expanded={navigationMenuOpen}
              aria-controls="live-discover-sidebar"
            >
              <span />
              <span />
              <span />
            </button>
          </div>
        )}
        <button
          className="live-room-brand"
          onClick={isMinimized ? onExpand : onMinimize}
          aria-label={isMinimized ? "Expand live cast" : "Minimize live cast and return to home"}
        >
          {isMinimized ? "Expand live" : "↓ Minimize"}
        </button>
        <LiveUserSearch onJoinLive={onWatchLive} onOpenProfile={openProfileFromLive} currentUser={currentUser} />
        <button
          className="theme-toggle live-theme-toggle"
          onClick={onToggleTheme}
          aria-label={`Switch to ${theme === "light" ? "dark" : "light"} theme`}
          title={`${theme === "light" ? "Dark" : "Light"} mode`}
        >
          {theme === "light" ? "☾" : "☀"}
        </button>
        <div className="live-room-profile">
          <span className="live-profile-avatar">
            {currentUser.avatarUrl
              ? <img src={currentUser.avatarUrl} alt="" />
              : currentUser.name?.charAt(0)?.toUpperCase() || "U"}
          </span>
          <span><strong>{currentUser.name}</strong><small>{currentUser.college || "Campus"}</small></span>
        </div>
        <span className={`live-status ${status === "You are live now" || status === "Watching live" ? "is-live" : ""}`}>● {status}</span>
        {isMinimized && <button className="live-mini-expand" onClick={onExpand}>Expand</button>}
      </header>

      <div className="live-sidebar-layer" id="live-discover-sidebar">
        <HomeSidebar
          open={navigationMenuOpen}
          collapsed={false}
          category={sidebarCategory}
          college={sidebarCollege}
          onSignOut={onSignOut}
          onCategoryChange={(category) => {
            setSidebarCategory(category);
            setSidebarCollege("All");
          }}
          onCollegeChange={setSidebarCollege}
          onClose={() => setNavigationMenuOpen(false)}
        />
      </div>

      <div className="live-room-layout">
        <div className="live-profile-slot">
          <LiveProfileBar
            hostId={hostIdentity}
            hostName={roomInfo?.host}
            currentUserId={currentUser.id}
            onOpenProfile={openProfileFromLive}
          />
        </div>
        <div className="live-superchat-options" aria-label="Superchat options">
          {SUPERCHAT_GIFTS.map((gift) => (
            <button
              className="live-superchat-option"
              key={gift.name}
              type="button"
              aria-label={`${gift.name}, ₹${gift.price} superchat`}
              title={`${gift.name} · ₹${gift.price}`}
            >
              <img src={gift.image} alt="" />
              <span>₹{gift.price}</span>
            </button>
          ))}
        </div>
        <section className="live-broadcast-column">
          <div
            className={`live-stage ${stageGuest ? "is-cohosting" : ""}`}
            ref={stageRef}
            onClick={session.mode === "viewer" ? showPlayerControls : undefined}
          >
            {session.mode === "host"
              ? <video ref={localVideoRef} className="live-local-video live-host-video" style={{ filter: VIDEO_FILTERS.find((item) => item.id === activeFilter)?.css || "none" }} onLoadedMetadata={(event) => updateStageAspectRatio(event.currentTarget, stageRef.current)} autoPlay playsInline muted />
                    : isStageGuest
                      ? <video ref={guestVideoRef} className="live-local-video live-cohost-video" style={{ filter: VIDEO_FILTERS.find((item) => item.id === guestFilter)?.css || "none" }} autoPlay playsInline muted />
                      : <div className="live-stage-placeholder">{status === "Connecting..." ? "Connecting to live cast..." : "Waiting for the host video..."}</div>}
            {stageGuest && (
              <>
                <span className="live-stage-person-label is-host">{roomInfo?.host || "Host"} <small>HOST</small></span>
                <span className="live-stage-person-label is-guest">{stageGuest.name} <small>GUEST</small></span>
              </>
            )}
            {error && <div className="live-stage-error" role="alert">{error}</div>}
            {stageGuest && (
              <span className="live-stage-guest-label">
                {stageGuest.name} {session.mode === "host" ? "is on stage" : "joined the stage"}
              </span>
            )}
            {session.mode === "viewer" && playerControlsVisible && (
              <div
                className="live-player-overlay-controls"
                onPointerDown={showPlayerControls}
                onClick={(event) => event.stopPropagation()}
              >
                <button
                  type="button"
                  className="live-player-overlay-button live-player-icon-button live-audio-toggle"
                  onClick={toggleRemoteAudio}
                  aria-label={remoteAudioMuted ? "Unmute live audio" : "Mute live audio"}
                  title={remoteAudioMuted ? "Unmute live audio" : "Mute live audio"}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    {remoteAudioMuted
                      ? <><path d="M11 5 6 9H3v6h3l5 4V5Z" /><path d="m16 9 5 6m0-6-5 6" /></>
                      : <><path d="M11 5 6 9H3v6h3l5 4V5Z" /><path d="M15.5 8.5a5 5 0 0 1 0 7m3-10a9 9 0 0 1 0 13" /></>}
                  </svg>
                </button>
                <div className="live-player-quality-menu">
                  <button
                    type="button"
                    className="live-player-overlay-button live-player-icon-button"
                    aria-label={`Video quality ${videoQuality}p`}
                    title={`Video quality ${videoQuality}p`}
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M4 7h5m5 0h6M4 17h3m5 0h8M4 12h9m5 0h2" />
                      <circle cx="11" cy="7" r="2" />
                      <circle cx="9" cy="17" r="2" />
                      <circle cx="15" cy="12" r="2" />
                    </svg>
                  </button>
                  <select
                    id="live-video-quality"
                    className="live-player-quality-select"
                    value={videoQuality}
                    onChange={(event) => changeViewerQuality(event.target.value)}
                    disabled={status !== "Watching live"}
                    aria-label="Video quality"
                    title="Video quality"
                  >
                    <option value="1080">1080p</option>
                    <option value="480">480p</option>
                    <option value="360">360p</option>
                  </select>
                </div>
                <button
                  type="button"
                  className="live-player-overlay-button live-player-icon-button"
                  onClick={toggleFullscreen}
                  aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
                  title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    {isFullscreen
                      ? <path d="M8 3v5H3m13-5v5h5M8 21v-5H3m13 5v-5h5" />
                      : <path d="M3 8V3h5m8 0h5v5M3 16v5h5m8 0h5v-5" />}
                  </svg>
                </button>
              </div>
            )}
          </div>
          <div className="live-player-toolbar">
            {stageGuest && (
              <span className="live-stage-guest-status" role="status">
                {stageGuest.name} {session.mode === "host" ? "is on stage" : "joined the stage"}
              </span>
            )}
            <span className="live-viewer-count" aria-label={`${viewerStats.viewers} viewers watching`}>
              <span aria-hidden="true">●</span> {formatLiveCount(viewerStats.viewers)} watching
            </span>
            {session.mode === "host" && (
              <span className="live-like-count" aria-label={`${viewerStats.likes} likes`}>
                <span aria-hidden="true">♥</span> {formatLiveCount(viewerStats.likes)} likes
              </span>
            )}
            {session.mode === "viewer" && (
              <>
                <button
                  type="button"
                  className={`live-like-button ${viewerStats.liked ? "is-liked" : ""}`}
                  onClick={likeLiveCast}
                  disabled={likeLoading || viewerStats.liked || status !== "Watching live"}
                  aria-pressed={viewerStats.liked}
                >
                  <span aria-hidden="true">♥</span> {viewerStats.liked ? "Liked" : "Like"} · {formatLiveCount(viewerStats.likes)}
                </button>
              </>
            )}
            {statsError && <span className="live-player-error" role="status">Stats unavailable: {statsError}</span>}
            {playerError && <span className="live-player-error" role="alert">{playerError}</span>}
            {(session.mode === "host" || isStageGuest) && (
              <div className="live-host-controls">
                <button
                  className={`live-media-toggle ${cameraOn ? "is-enabled" : "is-disabled"}`}
                  onClick={() => session.mode === "host" ? toggleTrack("video") : toggleGuestTrack("video")}
                  disabled={session.mode === "host" ? status !== "You are live now" : status !== "Watching live" || !guestCameraReady}
                  aria-label={cameraOn ? "Turn camera off" : "Turn camera on"}
                  aria-pressed={!cameraOn}
                  title={cameraOn ? "Turn camera off" : "Turn camera on"}
                >
                  <img src={cameraLogo} alt="" />
                  {!cameraOn && <span className="live-media-toggle-slash" aria-hidden="true" />}
                </button>
                <button
                  className={`live-media-toggle ${microphoneOn ? "is-enabled" : "is-disabled"}`}
                  onClick={() => session.mode === "host" ? toggleTrack("audio") : toggleGuestTrack("audio")}
                  disabled={session.mode === "host" ? status !== "You are live now" : status !== "Watching live" || !guestCameraReady}
                  aria-label={microphoneOn ? "Mute microphone" : "Unmute microphone"}
                  aria-pressed={!microphoneOn}
                  title={microphoneOn ? "Mute microphone" : "Unmute microphone"}
                >
                  <img src={microphoneLogo} alt="" />
                  {!microphoneOn && <span className="live-media-toggle-slash" aria-hidden="true" />}
                </button>
                <label className="live-filter-control">
                  Live filter
                  <select
                    value={session.mode === "host" ? activeFilter : guestFilter}
                    onChange={(event) => changeVideoFilter(event.target.value)}
                    disabled={session.mode === "host" ? status !== "You are live now" : status !== "Watching live" || !guestCameraReady}
                  >
                    {VIDEO_FILTERS.map((filter) => <option key={filter.id} value={filter.id}>{filter.label}</option>)}
                  </select>
                </label>
                {session.mode === "host" && session.videoResolution && (
                  <span className="live-camera-resolution">
                    Camera · {session.videoResolution} · up to 30 FPS
                  </span>
                )}
              </div>
            )}
          </div>
          <div className="live-broadcast-details">
            <div><span className="live-detail-category">{roomInfo?.category || "Campus"}</span><h1>{roomInfo?.title || "Campus live cast"}</h1><p>{roomInfo?.host || currentUser.name} · {roomInfo?.college || currentUser.college}</p></div>
            <div className="live-stage-actions">
              {session.mode === "host" && stageGuest && (
                <button className="live-stage-end-guest" onClick={endGuestStage} disabled={stageActionLoading}>
                  {stageActionLoading ? "Ending guest..." : "End guest stage"}
                </button>
              )}
              {session.mode === "viewer" && isStageGuest && (
                <button className="live-stage-end-guest" onClick={leaveStage} disabled={stageActionLoading}>
                  {stageActionLoading ? "Leaving stage..." : "Leave stage"}
                </button>
              )}
              <button className="live-leave-button" onClick={leaveRoom} disabled={stopping}>{stopping ? "Leaving..." : session.mode === "host" ? "End live cast" : "Leave live"}</button>
            </div>
          </div>
        </section>

        <aside className="live-chat-column">
          <section className="live-chat-panel">
            <h2>Live comments <span>{messages.length}</span></h2>
            <div className="live-chat-messages" ref={messagesRef} aria-live="polite">
            {stageNotice && <p className="live-stage-notice" role="status">{stageNotice}</p>}
            {messages.length === 0 && <p className="live-chat-empty">Comments will appear here when the cast is connected.</p>}
            {messages.map((item) => {
              const authorUserId = getChatAuthorUserId(item, roomInfo?.hostId || session.roomInfo?.hostId || session.room?.hostId);
              const avatarUrl = String(authorUserId || "") === String(currentUser.id)
                ? currentUser.avatarUrl
                : item.avatarUrl;
              return (
                <article
                  className={`live-chat-message ${item.role === "host" ? "is-host" : ""} ${item.isOwn ? "is-own" : ""}`}
                  key={item.id}
                >
                <header className="live-chat-message-header">
                  <span className="live-chat-avatar" aria-hidden="true">
                    {avatarUrl
                      ? <img src={avatarUrl} alt="" />
                      : item.name?.trim().charAt(0)?.toUpperCase() || "?"}
                  </span>
                  <button
                    className="live-chat-author"
                    type="button"
                    onClick={() => authorUserId && openProfileFromLive(authorUserId)}
                    disabled={!authorUserId}
                    aria-label={`Open ${item.name}'s profile`}
                  >{item.name}</button>
                  {item.role === "viewer" && session.mode === "host" && item.identity.startsWith("viewer-") && (
                      <button
                        className={`live-chat-live-action ${selectedViewer?.messageId === item.id ? "is-active" : ""}`}
                        type="button"
                        aria-label={`Actions for ${item.name}`}
                        aria-expanded={selectedViewer?.messageId === item.id}
                        onClick={() => setSelectedViewer((current) => current?.messageId === item.id ? null : {
                          identity: item.identity,
                          name: item.name,
                          messageId: item.id,
                        })}
                      >
                        <span aria-hidden="true" />
                        LIVE
                      </button>
                  )}
                  {item.university && (
                    <span className="live-chat-university" title={item.university}>
                      ({item.university})
                    </span>
                  )}
                  {item.role === "host" && <span className="live-chat-host-badge">✦ HOST</span>}
                </header>
                <span className="live-chat-message-content">{item.message}</span>
                {session.mode === "host" && selectedViewer?.messageId === item.id && (
                  <div className="live-chat-user-actions">
                    <button
                      type="button"
                      onClick={() => inviteViewer(selectedViewer.identity)}
                      disabled={stageActionLoading || Boolean(stageGuest) || Boolean(pendingStageInvite)}
                    >
                      {pendingStageInvite?.identity === item.identity ? "Invite pending" : "Invite to live stage"}
                    </button>
                    <button type="button" onClick={() => banViewer(selectedViewer.identity, selectedViewer.name)} disabled={stageActionLoading}>
                      Block from this live
                    </button>
                  </div>
                )}
              </article>
              );
            })}
            </div>
            <form className="live-chat-form" onSubmit={sendComment}>
              <label className="sr-only" htmlFor="live-comment">Write a comment</label>
              <input id="live-comment" value={comment} onChange={(event) => setComment(event.target.value)} maxLength={300} placeholder="Write a comment..." />
              <button type="submit" disabled={!comment.trim()}>Send</button>
            </form>
          </section>
        </aside>
      </div>
      {pendingStageInvite && session.mode === "viewer" && (
        <div className="live-stage-invite-overlay" role="presentation">
          <section className="live-stage-invite-card" role="dialog" aria-modal="true" aria-labelledby="live-stage-invite-title">
            <span className="live-stage-invite-icon">●</span>
            <h2 id="live-stage-invite-title">{pendingStageInvite.name} invited you on stage</h2>
            <p>Accept to share your camera and microphone with the live audience.</p>
            <p className="live-stage-invite-countdown" role="timer" aria-live="polite">
              Accept within <strong>{inviteSecondsRemaining}</strong> seconds
            </p>
            {error && <p className="live-stage-invite-error" role="alert">{error}</p>}
            <div className="live-stage-invite-actions">
              <button type="button" onClick={() => respondToStageInvite(true)} disabled={stageActionLoading}>
                {stageActionLoading ? "Joining..." : "Accept and join"}
              </button>
              <button type="button" onClick={() => respondToStageInvite(false)} disabled={stageActionLoading}>
                Decline
              </button>
            </div>
          </section>
        </div>
      )}
      {session.mode === "viewer" && (
        <section className="live-recommendations" aria-labelledby="live-recommendations-title">
          <div className="live-recommendations-heading">
            <div>
              <span>Discover more</span>
              <h2 id="live-recommendations-title">More campus live</h2>
            </div>
            <p>{recommendations.length} live {recommendations.length === 1 ? "cast" : "casts"}</p>
          </div>
          {roomsError ? (
            <p className="live-recommendations-message" role="alert">Live recommendations could not be loaded: {roomsError}</p>
          ) : roomsLoading && recommendations.length === 0 ? (
            <p className="live-recommendations-message">Finding more live campus casts...</p>
          ) : recommendations.length === 0 ? (
            <p className="live-recommendations-message">No other campus casts are live right now. Check back soon.</p>
          ) : (
            <div className="live-recommendations-grid">
              {recommendations.map((room) => (
                <button className="live-recommendation-card" key={room.roomName} type="button" onClick={() => onWatchLive(room)} aria-label={`Watch ${room.title}`}>
                  <span className="live-recommendation-preview">
                    {room.preview
                      ? <img src={room.preview} alt="" />
                      : <span className="live-recommendation-placeholder">{room.host?.charAt(0)?.toUpperCase() || "H"}</span>}
                    <span className="live-recommendation-badge"><span /> LIVE</span>
                  </span>
                  <span className="live-recommendation-copy">
                    <strong>{room.title}</strong>
                    <span>{room.host} · {room.college}</span>
                    <span>{room.category}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>
      )}
    </main>
  );
}
