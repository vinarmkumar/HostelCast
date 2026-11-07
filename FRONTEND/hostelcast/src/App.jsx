// This state controls which authentication modal is currently open.
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import Home from "./Home.jsx";
import LiveStartModal from "./Live/LiveStartModal.jsx";
import { apiUrl } from "./apiUrl.js";

const SignIn = lazy(() => import("../SIGNIN_SIGNUP/src/Components/SignIn.jsx"));
const SignUp = lazy(() => import("../SIGNIN_SIGNUP/src/Components/SignUp.jsx"));
const LiveRoomPage = lazy(() => import("./Live/LiveRoomPage.jsx"));
const ProfilePage = lazy(() => import("./MyProfile/ProfilePage.jsx"));
const ACTIVE_HOST_LIVE_KEY = "hostelcast_active_live_host";
const PROFILE_TARGET_KEY = "hostelcast_profile_target";

export default function App() {
  const [panel, setPanel] = useState(null); // null=modal closed, signin=SignIn, signup=SignUp.
  const [showLiveConfirmation, setShowLiveConfirmation] = useState(false);
  const [showSignOutConfirmation, setShowSignOutConfirmation] = useState(false);
  const [liveSession, setLiveSession] = useState(null);
  const [viewerPreview, setViewerPreview] = useState(null);
  const [profileTarget, setProfileTarget] = useState(() => {
    const savedProfile = localStorage.getItem(PROFILE_TARGET_KEY);
    if (!savedProfile) return null;
    try {
      const parsed = JSON.parse(savedProfile);
      return parsed && parsed.userId ? parsed : null;
    } catch {
      localStorage.removeItem(PROFILE_TARGET_KEY);
      return null;
    }
  });
  const [isRestoringLive, setIsRestoringLive] = useState(() => {
    const savedLive = localStorage.getItem(ACTIVE_HOST_LIVE_KEY);
    const savedUser = localStorage.getItem("hostelcast_user");
    if (!savedLive || !savedUser || !localStorage.getItem("hostelcast_token")) return false;
    try {
      const liveState = JSON.parse(savedLive);
      const user = JSON.parse(savedUser);
      return Boolean(liveState.roomName && user);
    } catch {
      return false;
    }
  });
  const [restoreError, setRestoreError] = useState("");
  const [liveMinimized, setLiveMinimized] = useState(false);
  const [liveCategory, setLiveCategory] = useState("Other");
  const [theme, setTheme] = useState(() => localStorage.getItem("hostelcast_theme") || "light"); // Theme preference browser mein persist hoti hai.
  const [currentUser, setCurrentUser] = useState(() => {
    // Browser refresh par saved user ko restore karte hain, isliye login persist rehta hai.
    const savedUser = localStorage.getItem("hostelcast_user");
    const token = localStorage.getItem("hostelcast_token");
    if (!savedUser || !token) return null;
    try {
      return JSON.parse(savedUser);
    } catch {
      localStorage.removeItem("hostelcast_user");
      localStorage.removeItem("hostelcast_token");
      return null;
    }
  });
  const restoreAttempted = useRef(false);
  const updateViewerPreview = useCallback((roomName, preview) => {
    setViewerPreview({ roomName, preview });
  }, []);

  function handleAuthenticated(user) {
    // OTP ya password login successful hone par modal band aur user ko home par set kiya jaata hai.
    setCurrentUser(user);
    setPanel(null);
  }

  const updateCurrentUser = useCallback((updates) => {
    setCurrentUser((user) => user ? { ...user, ...updates } : user);
  }, []);

  useEffect(() => {
    if (currentUser) localStorage.setItem("hostelcast_user", JSON.stringify(currentUser));
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser && profileTarget) {
      setProfileTarget(null);
      return;
    }
    if (profileTarget) {
      localStorage.setItem(PROFILE_TARGET_KEY, JSON.stringify(profileTarget));
      return;
    }
    localStorage.removeItem(PROFILE_TARGET_KEY);
  }, [currentUser, profileTarget]);

  function handleSignOut() {
    // Sign out par token aur user dono browser session storage se remove hote hain.
    localStorage.removeItem("hostelcast_token");
    localStorage.removeItem("hostelcast_user");
    localStorage.removeItem(PROFILE_TARGET_KEY);
    setCurrentUser(null);
    setPanel(null);
    setShowLiveConfirmation(false);
    setProfileTarget(null);
    setRestoreError("");
    setIsRestoringLive(false);
    if (liveSession) setLiveMinimized(true);
  }

  function requestSignOut() {
    setShowSignOutConfirmation(true);
  }

  function openProfile(userId, tab = "all") {
    if (!userId) return;
    setProfileTarget({ userId: String(userId), tab });
  }

  function toggleTheme() {
    const nextTheme = theme === "light" ? "dark" : "light"; // Light aur dark mode ke beech instant switch.
    setTheme(nextTheme);
    localStorage.setItem("hostelcast_theme", nextTheme);
    document.documentElement.dataset.theme = nextTheme;
  }

  if (typeof document !== "undefined") document.documentElement.dataset.theme = theme;

  useEffect(() => {
    if (!currentUser || restoreAttempted.current) return;
    const savedLive = localStorage.getItem(ACTIVE_HOST_LIVE_KEY);
    if (!savedLive) return;
    restoreAttempted.current = true;

    let activeLive;
    try {
      activeLive = JSON.parse(savedLive);
      if (!activeLive?.roomName) throw new Error("Saved live cast information is invalid.");
    } catch (error) {
      console.error("Saved live cast could not be restored:", error);
      localStorage.removeItem(ACTIVE_HOST_LIVE_KEY);
      return;
    }

    async function restoreBroadcast() {
      try {
        const { resumeHostBroadcast } = await import("./Live/startHostBroadcast.js");
        const resumedSession = await resumeHostBroadcast(currentUser, activeLive.roomName, {
          quality: activeLive.quality || "720p",
        });
        if (!resumedSession) {
          localStorage.removeItem(ACTIVE_HOST_LIVE_KEY);
          return;
        }
        setLiveSession(resumedSession);
        setLiveMinimized(false);
      } catch (error) {
        setRestoreError(error.message);
      } finally {
        setIsRestoringLive(false);
      }
    }
    restoreBroadcast();
  }, [currentUser]);

  useEffect(() => {
    if (!liveSession || liveSession.mode !== "host") return undefined;
    const roomName = liveSession.roomInfo?.roomName;
    const historyState = { ...(window.history.state || {}), hostelCastLiveRoom: roomName };
    window.history.pushState(historyState, "", window.location.href);

    function keepBroadcastOpen() {
      setLiveMinimized(true);
      window.history.pushState(
        { ...(window.history.state || {}), hostelCastLiveRoom: roomName },
        "",
        window.location.href
      );
    }

    window.addEventListener("popstate", keepBroadcastOpen);
    return () => window.removeEventListener("popstate", keepBroadcastOpen);
  }, [liveSession]);

  function exitLiveRoom() {
    if (liveSession?.mode === "host") localStorage.removeItem(ACTIVE_HOST_LIVE_KEY);
    setLiveSession(null);
    setLiveMinimized(false);
  }

  async function confirmStartLive(mediaStream, quality) {
    try {
      const { startHostBroadcast } = await import("./Live/startHostBroadcast.js");
      const live = await startHostBroadcast(mediaStream, currentUser, liveCategory, { quality });
      localStorage.setItem(ACTIVE_HOST_LIVE_KEY, JSON.stringify({
        roomName: live.roomInfo.roomName,
        quality: quality || "720p",
      }));
      setLiveSession({ mode: "host", mediaStream, ...live });
      setShowLiveConfirmation(false);
    } catch (error) {
      mediaStream.getTracks().forEach((track) => track.stop());
      throw error;
    }
  }

  async function retryLiveRestore() {
    setRestoreError("");
    setIsRestoringLive(true);
    try {
      const savedLive = JSON.parse(localStorage.getItem(ACTIVE_HOST_LIVE_KEY) || "{}");
      if (!savedLive.roomName) throw new Error("No saved live cast was found.");
      const { resumeHostBroadcast } = await import("./Live/startHostBroadcast.js");
      const resumedSession = await resumeHostBroadcast(currentUser, savedLive.roomName, {
        quality: savedLive.quality || "720p",
      });
      if (!resumedSession) {
        localStorage.removeItem(ACTIVE_HOST_LIVE_KEY);
        setRestoreError("");
        return;
      }
      setLiveSession(resumedSession);
    } catch (error) {
      setRestoreError(error.message);
    } finally {
      setIsRestoringLive(false);
    }
  }

  async function endInterruptedLive() {
    setIsRestoringLive(true);
    setRestoreError("");
    try {
      const token = localStorage.getItem("hostelcast_token");
      const response = await fetch(apiUrl("/api/live/host/active"), {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "Could not end the live cast.");
      localStorage.removeItem(ACTIVE_HOST_LIVE_KEY);
    } catch (error) {
      setRestoreError(error.message);
    } finally {
      setIsRestoringLive(false);
    }
  }

  return (
    <>
      {isRestoringLive && !liveSession && <div className="live-restore-overlay" role="status">Reconnecting to your live cast...</div>}
      {(!liveSession || liveMinimized) && !profileTarget && (
        <Home
          currentUser={currentUser}
          onSignIn={() => setPanel("signin")}
          onCreate={() => setPanel("signup")}
          onSignOut={requestSignOut}
          theme={theme}
          onToggleTheme={toggleTheme}
          onOpenProfile={openProfile}
          previewOverride={liveSession?.mode === "viewer" ? viewerPreview : null}
          onStartLive={(category) => {
            if (!currentUser) return setPanel("signin");
            setLiveCategory(category);
            setShowLiveConfirmation(true);
          }}
          onJoinLive={(room) => {
            if (!currentUser) setPanel("signin");
            else {
              setLiveMinimized(false);
              setLiveSession({ mode: "viewer", room });
            }
          }}
        />
      )}
      {profileTarget && (
        <Suspense fallback={<div className="live-feed-loading">Opening profile...</div>}>
          <ProfilePage
            key={`${profileTarget.userId}-${profileTarget.tab}`}
            profileId={profileTarget.userId}
            currentUser={currentUser}
            theme={theme}
            onToggleTheme={toggleTheme}
            onStartLive={(category) => {
              if (!currentUser) {
                setPanel("signin");
                return;
              }
              setLiveCategory(category || currentUser.category || "Engineering");
              setShowLiveConfirmation(true);
            }}
            onUserProfileUpdate={updateCurrentUser}
            initialTab={profileTarget.tab}
            overlay={true}
            onOpenProfile={openProfile}
            onWatchLive={(room) => {
              if (!currentUser) {
                setPanel("signin");
                return;
              }
              setProfileTarget(null);
              setLiveMinimized(false);
              setLiveSession({ mode: "viewer", room });
            }}
            onBack={() => setProfileTarget(null)}
          />
        </Suspense>
      )}
      {liveSession && (
        <Suspense fallback={<div className="live-feed-loading">Connecting to your live cast...</div>}>
          <LiveRoomPage
            key={liveSession.mode === "host" ? liveSession.roomInfo?.roomName : liveSession.room?.roomName}
            session={liveSession}
            currentUser={currentUser}
            theme={theme}
            onToggleTheme={toggleTheme}
            isMinimized={liveMinimized}
            onMinimize={() => setLiveMinimized(true)}
            onExpand={() => {
              setProfileTarget(null);
              setLiveMinimized(false);
            }}
            onExit={exitLiveRoom}
            onWatchLive={(room) => {
              setProfileTarget(null);
              setLiveMinimized(false);
              setLiveSession({ mode: "viewer", room });
            }}
            onOpenProfile={openProfile}
            onPreviewFrame={liveSession.mode === "viewer" ? updateViewerPreview : undefined}
            onSignOut={requestSignOut}
          />
        </Suspense>
      )}
      {showLiveConfirmation && !liveSession && <LiveStartModal onConfirm={confirmStartLive} onClose={() => setShowLiveConfirmation(false)} />}
      {showSignOutConfirmation && (
        <div className="live-confirm-overlay signout-confirm-overlay">
          <section className="live-confirm-card" role="dialog" aria-modal="true" aria-labelledby="signout-confirm-title">
            <h2 id="signout-confirm-title">Are you sure you want to sign out?</h2>
            <p>You can sign back in anytime.</p>
            <div className="live-confirm-actions">
              <button type="button" className="live-confirm-no" onClick={() => setShowSignOutConfirmation(false)}>No, stay</button>
              <button type="button" className="live-confirm-yes" onClick={() => {
                setShowSignOutConfirmation(false);
                handleSignOut();
              }}>Yes, sign out</button>
            </div>
          </section>
        </div>
      )}
      {restoreError && !liveSession && (
        <div className="live-stage-invite-overlay">
          <section className="live-stage-invite-card" role="dialog" aria-modal="true" aria-labelledby="live-restore-title">
            <h2 id="live-restore-title">Your live cast needs attention</h2>
            <p>{restoreError}</p>
            <div className="live-stage-invite-actions">
              <button type="button" onClick={retryLiveRestore} disabled={isRestoringLive}>Continue live</button>
              <button type="button" onClick={endInterruptedLive} disabled={isRestoringLive}>End live cast</button>
            </div>
          </section>
        </div>
      )}
      <Suspense fallback={null}>
        {panel === "signin" && <SignIn onClose={() => setPanel(null)} onCreate={() => setPanel("signup")} onAuthenticated={handleAuthenticated} />}
        {panel === "signup" && <SignUp onClose={() => setPanel(null)} onSignIn={() => setPanel("signin")} onAuthenticated={handleAuthenticated} />}
      </Suspense>
    </>
  );
}
