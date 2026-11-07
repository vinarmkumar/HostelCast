import { useCallback, useEffect, useRef, useState } from "react";
import "./ProfilePage.css";
import { profileRequest } from "./profileApi.js";

const WEEK_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const MAX_BIO_WORDS = 80;
const MAX_PROFILE_PHOTOS = 10;
const MAX_PROFILE_VIDEOS = 1;
const MAX_PROFILE_PHOTO_BYTES = 50 * 1024 * 1024;
const MAX_PROFILE_VIDEO_BYTES = 200 * 1024 * 1024;
const BIO_EMOJIS = ["😀", "😁", "😂", "😊", "😍", "🥰", "😎", "🤗", "🥳", "🤩", "😇", "🙂", "🙌", "👏", "🙏", "💪", "❤️", "💚", "✨", "⭐", "🔥", "🎉", "🎓", "📚", "🏫", "🎥", "🎮", "🎵", "☕", "🌟", "🌈", "💯"];

function getLocalTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

function countWords(value) {
  return value.trim().split(/\s+/).filter((word) => /[\p{L}\p{N}]/u.test(word)).length;
}

export default function ProfilePage({
  profileId,
  currentUser,
  theme,
  onToggleTheme,
  onStartLive,
  onUserProfileUpdate,
  initialTab = "all",
  onBack,
  onOpenProfile,
  onWatchLive,
  overlay = false,
}) {
  const [profile, setProfile] = useState(null);
  const [following, setFollowing] = useState(false);
  const [activeTab, setActiveTab] = useState(initialTab);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState(false);
  const [editingBio, setEditingBio] = useState(false);
  const [bioDraft, setBioDraft] = useState("");
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [scheduleEditorOpen, setScheduleEditorOpen] = useState(false);
  const [scheduleDraft, setScheduleDraft] = useState({
    days: [],
    startTime: "18:00",
    endTime: "20:00",
    timezone: getLocalTimeZone(),
  });
  const [caption, setCaption] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [avatarCropSource, setAvatarCropSource] = useState("");
  const [editingExistingAvatar, setEditingExistingAvatar] = useState(false);
  const [avatarCropZoom, setAvatarCropZoom] = useState(1);
  const [avatarCropMinZoom, setAvatarCropMinZoom] = useState(1);
  const [avatarCropOffset, setAvatarCropOffset] = useState({ x: 0, y: 0 });
  const [avatarCropSize, setAvatarCropSize] = useState(null);
  const [avatarCropViewportSize, setAvatarCropViewportSize] = useState(280);
  const [lightboxPost, setLightboxPost] = useState(null);
  const [followingUsers, setFollowingUsers] = useState([]);
  const [followingListOpen, setFollowingListOpen] = useState(false);
  const [connectionListType, setConnectionListType] = useState("following");
  const [followingListLoading, setFollowingListLoading] = useState(false);
  const [followingListError, setFollowingListError] = useState("");
  const [followingStates, setFollowingStates] = useState({});
  const [followingActionId, setFollowingActionId] = useState("");
  const [hookupSettings, setHookupSettings] = useState({ enabled: false, instagram: "", whatsapp: "", snapchat: "" });
  const [hookupEditing, setHookupEditing] = useState(false);
  const [hookupRequestOpen, setHookupRequestOpen] = useState(false);
  const [hookupRequestDraft, setHookupRequestDraft] = useState("");
  const [hookupStatus, setHookupStatus] = useState({
    status: "none",
    canSend: false,
    requestId: "",
    instagram: "",
    whatsapp: "",
    snapchat: "",
  });
  const [hookupRequests, setHookupRequests] = useState([]);
  const [sentHookupRequests, setSentHookupRequests] = useState([]);
  const [expandedHookupMessages, setExpandedHookupMessages] = useState({});
  const [hookupInfoOpen, setHookupInfoOpen] = useState(false);
  const profileMenuRef = useRef(null);
  const avatarInputRef = useRef(null);
  const avatarCropViewportRef = useRef(null);
  const avatarCropImageRef = useRef(null);
  const avatarCropDragRef = useRef(null);
  const postInputRef = useRef(null);
  const bioInputRef = useRef(null);
  const isOwnProfile = String(currentUser?.id || "") === String(profileId);

  const loadProfile = useCallback(async (signal) => {
    const result = await profileRequest(`/api/profiles/${encodeURIComponent(profileId)}`, {
      signal,
      cache: "no-store",
    });
    setProfile(result.profile);
    setBioDraft(result.profile.bio || "");
    if (String(currentUser?.id || "") === String(profileId)) {
      onUserProfileUpdate?.({ avatarUrl: result.profile.avatarUrl || "" });
    }
  }, [currentUser?.id, onUserProfileUpdate, profileId]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    async function initializeProfile() {
      setLoading(true);
      setError("");
      setFollowing(false);
      let loaded = false;
      try {
        await loadProfile(controller.signal);
        loaded = true;
      } catch (loadError) {
        if (active && loadError.name !== "AbortError") setError(loadError.message);
      } finally {
        if (active) setLoading(false);
      }
      if (active && loaded && currentUser?.id && String(currentUser.id) !== String(profileId)) {
        try {
          const result = await profileRequest(`/api/profiles/${encodeURIComponent(profileId)}/follow-status`);
          if (active) setFollowing(result.following);
        } catch (followError) {
          if (active) setActionError(followError.message);
        }
      }
    }
    initializeProfile();
    return () => {
      active = false;
      controller.abort();
    };
  }, [currentUser?.id, loadProfile, profileId]);

  useEffect(() => {
    async function loadHookupState() {
      if (!currentUser?.id) return;
      if (isOwnProfile) {
        setHookupSettings({
          enabled: Boolean(profile?.hookup?.enabled),
          instagram: profile?.hookup?.instagram || "",
          whatsapp: profile?.hookup?.whatsapp || "",
          snapchat: profile?.hookup?.snapchat || "",
        });
        setHookupEditing(false);
        try {
          const [incomingResult, sentResult] = await Promise.all([
            profileRequest(`/api/profiles/${encodeURIComponent(profileId)}/hookup-requests`),
            profileRequest(`/api/profiles/${encodeURIComponent(profileId)}/hookup-sent-requests`),
          ]);
          setHookupRequests(incomingResult.requests || []);
          setSentHookupRequests(sentResult.requests || []);
        } catch (hookupError) {
          setActionError(hookupError.message);
        }
        return;
      }

      try {
        const result = await profileRequest(`/api/profiles/${encodeURIComponent(profileId)}/hookup`);
        setHookupStatus({
          status: result.hookup?.status || "none",
          canSend: Boolean(result.hookup?.canSend),
          requestId: result.hookup?.requestId || "",
          instagram: result.hookup?.instagram || "",
          whatsapp: result.hookup?.whatsapp || "",
          snapchat: result.hookup?.snapchat || "",
        });
      } catch (hookupError) {
        setActionError(hookupError.message);
      }
    }

    if (profile) loadHookupState();
  }, [currentUser?.id, isOwnProfile, profile, profileId]);

  useEffect(() => {
    if (!profile || !isOwnProfile) return;
    setHookupSettings({
      enabled: Boolean(profile?.hookup?.enabled),
      instagram: profile?.hookup?.instagram || "",
      whatsapp: profile?.hookup?.whatsapp || "",
      snapchat: profile?.hookup?.snapchat || "",
    });
  }, [isOwnProfile, profile]);

  useEffect(() => {
    function closeOnEscape(event) {
      if (event.key === "Escape") {
        setLightboxPost(null);
        setFollowingListOpen(false);
        setScheduleEditorOpen(false);
        setProfileMenuOpen(false);
        setHookupRequestOpen(false);
        setHookupInfoOpen(false);
      }
    }
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, []);

  useEffect(() => {
    function closeProfileMenu(event) {
      if (!profileMenuRef.current?.contains(event.target)) setProfileMenuOpen(false);
    }
    document.addEventListener("pointerdown", closeProfileMenu);
    return () => document.removeEventListener("pointerdown", closeProfileMenu);
  }, []);

  useEffect(() => {
    if (!avatarCropSource) return undefined;
    return () => URL.revokeObjectURL(avatarCropSource);
  }, [avatarCropSource]);

  async function toggleFollow() {
    if (busy) return;
    setBusy(true);
    setActionError("");
    try {
      const result = await profileRequest(`/api/profiles/${encodeURIComponent(profileId)}/follow`, {
        method: following ? "DELETE" : "POST",
      });
      setFollowing(result.following);
      setProfile((current) => ({
        ...current,
        counts: { ...current.counts, followers: result.followers },
      }));
    } catch (followError) {
      setActionError(followError.message);
    } finally {
      setBusy(false);
    }
  }

  async function saveHookupSettings(nextEnabled = hookupSettings.enabled) {
    if (!currentUser || !isOwnProfile) return;
    const payload = {
      enabled: Boolean(nextEnabled),
      instagram: hookupSettings.instagram || "",
      whatsapp: hookupSettings.whatsapp || "",
      snapchat: hookupSettings.snapchat || "",
    };
    if (payload.enabled && !(payload.instagram || payload.whatsapp || payload.snapchat)) {
      setActionError("Add at least one social profile before turning Hookup on.");
      return;
    }
    setBusy(true);
    setActionError("");
    try {
      const result = await profileRequest(`/api/profiles/${encodeURIComponent(profileId)}/hookup-settings`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      setHookupSettings({
        enabled: Boolean(result.hookup.enabled),
        instagram: result.hookup.instagram || "",
        whatsapp: result.hookup.whatsapp || "",
        snapchat: result.hookup.snapchat || "",
      });
      setProfile((current) => ({ ...current, hookup: { ...current.hookup, ...result.hookup } }));
      setHookupEditing(false);
    } catch (hookupError) {
      setActionError(hookupError.message);
    } finally {
      setBusy(false);
    }
  }

  async function sendHookupRequest() {
    if (!currentUser || isOwnProfile) return;
    const trimmedMessage = hookupRequestDraft.trim();
    if (countWords(trimmedMessage) > 60) {
      setActionError("Your hookup message cannot exceed 60 words.");
      return;
    }
    setBusy(true);
    setActionError("");
    try {
      const result = await profileRequest(`/api/profiles/${encodeURIComponent(profileId)}/hookup-request`, {
        method: "POST",
        body: JSON.stringify({ message: trimmedMessage }),
      });
      setHookupStatus({ status: "pending", canSend: false, requestId: result.request.id || "" });
      setHookupRequestOpen(false);
      setHookupRequestDraft("");
    } catch (hookupError) {
      setActionError(hookupError.message);
    } finally {
      setBusy(false);
    }
  }

  async function respondToHookupRequest(requestId, nextStatus) {
    setBusy(true);
    setActionError("");
    try {
      const result = await profileRequest(`/api/profiles/hookup-requests/${encodeURIComponent(requestId)}`, {
        method: "PATCH",
        body: JSON.stringify({ status: nextStatus }),
      });
      setHookupRequests((current) => current.map((request) => request.id === requestId
        ? { ...request, status: result.request.status, sender: { ...request.sender, ...result.request.sender } }
        : request));
      if (nextStatus === "accepted") {
        setActionError("Hookup request accepted. The contact details are now visible to both profiles.");
      }
    } catch (hookupError) {
      setActionError(hookupError.message);
    } finally {
      setBusy(false);
    }
  }

  async function openConnectionList(type) {
    if (type === "following" && !isOwnProfile) return;
    if (followingListOpen && connectionListType === type) {
      setFollowingListOpen(false);
      return;
    }
    setConnectionListType(type);
    setFollowingListOpen(true);
    setFollowingListLoading(true);
    setFollowingListError("");
    try {
      const result = await profileRequest(`/api/profiles/${encodeURIComponent(profileId)}/${type}`);
      setFollowingUsers(result.users);
      if (type === "following") {
        setFollowingStates(Object.fromEntries(result.users.map((user) => [user.id, true])));
      }
    } catch (listError) {
      setFollowingListError(listError.message);
    } finally {
      setFollowingListLoading(false);
    }
  }

  async function toggleFollowingUser(user) {
    if (followingActionId) return;
    const isFollowingUser = Boolean(followingStates[user.id]);
    setFollowingActionId(user.id);
    setFollowingListError("");
    try {
      const result = await profileRequest(`/api/profiles/${encodeURIComponent(user.id)}/follow`, {
        method: isFollowingUser ? "DELETE" : "POST",
      });
      setFollowingStates((current) => ({ ...current, [user.id]: result.following }));
      setProfile((current) => ({
        ...current,
        counts: {
          ...current.counts,
          following: Math.max(0, current.counts.following + (result.following ? 1 : -1)),
        },
      }));
    } catch (followError) {
      setFollowingListError(followError.message);
    } finally {
      setFollowingActionId("");
    }
  }

  function chooseAvatar(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setEditingExistingAvatar(false);
    setAvatarCropSource(URL.createObjectURL(file));
    setAvatarCropZoom(1);
    setAvatarCropMinZoom(1);
    setAvatarCropOffset({ x: 0, y: 0 });
    setAvatarCropSize(null);
    setAvatarCropViewportSize(avatarCropViewportRef.current?.clientWidth || 280);
  }

  async function editExistingAvatar() {
    setProfileMenuOpen(false);
    if (!profile.avatarUrl) {
      avatarInputRef.current?.click();
      return;
    }
    setActionError("");
    try {
      const response = await fetch(profile.avatarUrl, { cache: "no-store" });
      if (!response.ok) throw new Error("The current profile photo could not be loaded.");
      const imageBlob = await response.blob();
      if (!imageBlob.type.startsWith("image/")) {
        throw new Error("The current profile photo is not available for editing.");
      }
      setEditingExistingAvatar(true);
      setAvatarCropSource(URL.createObjectURL(imageBlob));
      setAvatarCropZoom(1);
      setAvatarCropMinZoom(1);
      setAvatarCropOffset({ x: 0, y: 0 });
      setAvatarCropSize(null);
      setAvatarCropViewportSize(avatarCropViewportRef.current?.clientWidth || 280);
    } catch (cropError) {
      setActionError(`${cropError.message} You can still choose a new photo using the + button.`);
    }
  }

  function insertBioEmoji(emoji) {
    const input = bioInputRef.current;
    if (!input) return;
    const start = input.selectionStart;
    const end = input.selectionEnd;
    const nextBio = `${bioDraft.slice(0, start)}${emoji}${bioDraft.slice(end)}`;
    if (countWords(nextBio) > MAX_BIO_WORDS) return;
    setBioDraft(nextBio);
    setEmojiPickerOpen(false);
    requestAnimationFrame(() => {
      input.focus();
      input.setSelectionRange(start + emoji.length, start + emoji.length);
    });
  }

  function getClampedAvatarCropOffset(offset, zoom = avatarCropZoom) {
    if (!avatarCropSize) return offset;
    const scale = (avatarCropViewportSize / Math.min(avatarCropSize.width, avatarCropSize.height)) * zoom;
    const maxX = Math.max(0, (avatarCropSize.width * scale - avatarCropViewportSize) / 2);
    const maxY = Math.max(0, (avatarCropSize.height * scale - avatarCropViewportSize) / 2);
    return {
      x: Math.max(-maxX, Math.min(maxX, offset.x)),
      y: Math.max(-maxY, Math.min(maxY, offset.y)),
    };
  }

  function startAvatarCropDrag(event) {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    avatarCropDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      offset: avatarCropOffset,
    };
  }

  function moveAvatarCrop(event) {
    const drag = avatarCropDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setAvatarCropOffset(getClampedAvatarCropOffset({
      x: drag.offset.x + event.clientX - drag.startX,
      y: drag.offset.y + event.clientY - drag.startY,
    }));
  }

  function endAvatarCropDrag(event) {
    if (avatarCropDragRef.current?.pointerId === event.pointerId) avatarCropDragRef.current = null;
  }

  function cancelAvatarCrop() {
    setAvatarCropSource("");
    setAvatarCropSize(null);
    setEditingExistingAvatar(false);
  }

  async function uploadAvatar(file) {
    const formData = new FormData();
    formData.append("avatar", file, "profile-photo.jpg");
    setUploading(true);
    setActionError("");
    try {
      const result = await profileRequest(`/api/profiles/${encodeURIComponent(profileId)}/avatar`, {
        method: "POST",
        body: formData,
      });
      setProfile((current) => ({ ...current, avatarUrl: result.avatarUrl }));
      onUserProfileUpdate?.({ avatarUrl: result.avatarUrl });
      if (result.cleanupPending) {
        setActionError("Your new photo is saved. Cloudinary couldn't remove an older photo yet; it will retry when you next update your photo.");
      }
    } catch (uploadError) {
      setActionError(uploadError.message);
    } finally {
      setUploading(false);
    }
  }

  async function saveAvatarCrop() {
    const image = avatarCropImageRef.current;
    if (!image || !avatarCropSize || uploading) return;
    const offset = getClampedAvatarCropOffset(avatarCropOffset);
    const displayedScale = (avatarCropViewportSize / Math.min(avatarCropSize.width, avatarCropSize.height)) * avatarCropZoom;
    const canvas = document.createElement("canvas");
    canvas.width = 800;
    canvas.height = 800;
    const context = canvas.getContext("2d");
    if (!context) {
      setActionError("Could not prepare the cropped profile photo. Please try another image.");
      return;
    }
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    const outputScale = canvas.width / avatarCropViewportSize;
    const imageWidth = avatarCropSize.width * displayedScale * outputScale;
    const imageHeight = avatarCropSize.height * displayedScale * outputScale;
    context.drawImage(
      image,
      (canvas.width - imageWidth) / 2 + offset.x * outputScale,
      (canvas.height - imageHeight) / 2 + offset.y * outputScale,
      imageWidth,
      imageHeight
    );
    const croppedBlob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
    if (!croppedBlob) {
      setActionError("Could not prepare the cropped profile photo. Please try another image.");
      return;
    }
    cancelAvatarCrop();
    await uploadAvatar(new File([croppedBlob], "profile-photo.jpg", { type: "image/jpeg" }));
  }

  async function uploadPost(event) {
    event.preventDefault();
    if (!selectedFile || uploading) return;
    const formData = new FormData();
    formData.append("media", selectedFile);
    formData.append("caption", caption);
    setUploading(true);
    setActionError("");
    try {
      const result = await profileRequest(`/api/profiles/${encodeURIComponent(profileId)}/posts`, {
        method: "POST",
        body: formData,
      });
      setProfile((current) => ({
        ...current,
        posts: [result.post, ...current.posts],
        counts: {
          ...current.counts,
          posts: current.counts.posts + 1,
          [result.post.mediaType === "image" ? "photos" : "videos"]:
            current.counts[result.post.mediaType === "image" ? "photos" : "videos"] + 1,
        },
      }));
      setSelectedFile(null);
      setCaption("");
      if (postInputRef.current) postInputRef.current.value = "";
      setActiveTab(result.post.mediaType === "image" ? "photos" : "videos");
    } catch (uploadError) {
      setActionError(uploadError.message);
    } finally {
      setUploading(false);
    }
  }

  async function saveBio() {
    setBusy(true);
    setActionError("");
    try {
      const result = await profileRequest(`/api/profiles/${encodeURIComponent(profileId)}`, {
        method: "PUT",
        body: JSON.stringify({ bio: bioDraft }),
      });
      setProfile((current) => ({ ...current, bio: result.bio }));
      setEditingBio(false);
    } catch (saveError) {
      setActionError(saveError.message);
    } finally {
      setBusy(false);
    }
  }

  async function saveLiveSchedule(event) {
    event.preventDefault();
    setBusy(true);
    setActionError("");
    try {
      const result = await profileRequest(`/api/profiles/${encodeURIComponent(profileId)}`, {
        method: "PUT",
        body: JSON.stringify({ liveSchedule: scheduleDraft }),
      });
      setProfile((current) => ({ ...current, liveSchedule: result.liveSchedule }));
      setScheduleEditorOpen(false);
      setProfileMenuOpen(false);
    } catch (saveError) {
      setActionError(saveError.message);
    } finally {
      setBusy(false);
    }
  }

  async function clearLiveSchedule() {
    setBusy(true);
    setActionError("");
    try {
      const result = await profileRequest(`/api/profiles/${encodeURIComponent(profileId)}`, {
        method: "PUT",
        body: JSON.stringify({ liveSchedule: null }),
      });
      setProfile((current) => ({ ...current, liveSchedule: result.liveSchedule }));
      setScheduleEditorOpen(false);
      setProfileMenuOpen(false);
    } catch (saveError) {
      setActionError(saveError.message);
    } finally {
      setBusy(false);
    }
  }

  function openScheduleEditor() {
    const schedule = profile.liveSchedule;
    setScheduleDraft({
      days: schedule?.days || [],
      startTime: schedule?.startTime || "18:00",
      endTime: schedule?.endTime || "20:00",
      timezone: schedule?.timezone || getLocalTimeZone(),
    });
    setScheduleEditorOpen(true);
    setProfileMenuOpen(false);
  }

  function openFollowingUser(userId) {
    setFollowingListOpen(false);
    onOpenProfile?.(userId, "all");
  }

  function choosePostMedia(event) {
    const file = event.target.files?.[0] || null;
    setSelectedFile(null);
    if (!file) return;
    const isVideo = file.type.startsWith("video/");
    const isImage = file.type.startsWith("image/");
    if (!isVideo && !isImage) {
      setActionError("Choose a supported image or video file.");
      event.target.value = "";
      return;
    }
    if (isImage && profile.counts.photos >= MAX_PROFILE_PHOTOS) {
      setActionError("You can post up to 10 photos on your profile. Delete a photo to post another.");
      event.target.value = "";
      return;
    }
    if (isVideo && profile.counts.videos >= MAX_PROFILE_VIDEOS) {
      setActionError("You can post only 1 video on your profile. Delete your current video to post another.");
      event.target.value = "";
      return;
    }
    const maxBytes = isVideo ? MAX_PROFILE_VIDEO_BYTES : MAX_PROFILE_PHOTO_BYTES;
    if (file.size > maxBytes) {
      setActionError(isVideo ? "Videos can be up to 200 MB." : "Photos can be up to 50 MB each.");
      event.target.value = "";
      return;
    }
    setActionError("");
    setSelectedFile(file);
  }

  async function deletePost(post) {
    if (!window.confirm("Delete this post from your profile?")) return;
    setActionError("");
    try {
      await profileRequest(`/api/profiles/${encodeURIComponent(profileId)}/posts/${encodeURIComponent(post.id)}`, {
        method: "DELETE",
      });
      setProfile((current) => ({
        ...current,
        posts: current.posts.filter((item) => item.id !== post.id),
        counts: {
          ...current.counts,
          posts: current.counts.posts - 1,
          [post.mediaType === "image" ? "photos" : "videos"]:
            current.counts[post.mediaType === "image" ? "photos" : "videos"] - 1,
        },
      }));
      setLightboxPost(null);
    } catch (deleteError) {
      setActionError(deleteError.message);
    }
  }

  const visiblePosts = profile?.posts?.filter((post) => (
    activeTab === "all" || (activeTab === "photos" ? post.mediaType === "image" : post.mediaType === "video")
  )) || [];
  const hookUpRequestsList = hookupRequests.length ? (
    <div className="profile-hookup-request-list">
      {hookupRequests.map((request) => {
        const isExpanded = Boolean(expandedHookupMessages[request.id]);
        return (
          <div key={request.id} className="profile-hookup-request-item">
            <div className="profile-hookup-request-user">
              <img src={request.sender.avatarUrl || ""} alt="" />
              <div>
                <strong>{request.sender.name}</strong>
                {request.message ? (
                  <div className="profile-hookup-message-block">
                    <button
                      type="button"
                      className="profile-hookup-message-toggle"
                      onClick={() => setExpandedHookupMessages((current) => ({
                        ...current,
                        [request.id]: !current[request.id],
                      }))}
                    >
                      {isExpanded ? "Hide text" : "See text"}
                    </button>
                    {isExpanded && <span className="profile-hookup-message-text">{request.message}</span>}
                  </div>
                ) : <span>No message provided.</span>}
              </div>
            </div>
            <div className="profile-hookup-request-actions">
              {request.status === "pending" ? (
                <>
                  <button type="button" className="profile-primary-action" onClick={() => respondToHookupRequest(request.id, "accepted")}>Accept</button>
                  <button type="button" className="profile-secondary-action" onClick={() => respondToHookupRequest(request.id, "rejected")}>Reject</button>
                </>
              ) : (
                <span className={`profile-hookup-state ${request.status}`}>{request.status}</span>
              )}
            </div>
            {request.status === "accepted" && (
              <div className="profile-hookup-contact-list">
                {request.sender.instagram && <a href={`https://instagram.com/${request.sender.instagram.replace(/^@/, "")}`} target="_blank" rel="noreferrer">Instagram: @{request.sender.instagram.replace(/^@/, "")}</a>}
                {request.sender.whatsapp && <a href={`https://wa.me/${request.sender.whatsapp.replace(/\D/g, "")}`} target="_blank" rel="noreferrer">WhatsApp: {request.sender.whatsapp}</a>}
                {request.sender.snapchat && <span>Snapchat: @{request.sender.snapchat.replace(/^@/, "")}</span>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  ) : <p>No new requests yet.</p>;

  const sentHookupRequestsList = sentHookupRequests.length ? (
    <div className="profile-hookup-request-list">
      {sentHookupRequests.map((request) => {
        const isExpanded = Boolean(expandedHookupMessages[request.id]);
        return (
          <div key={request.id} className="profile-hookup-request-item">
            <div className="profile-hookup-request-user">
              <img src={request.recipient.avatarUrl || ""} alt="" />
              <div>
                <strong>{request.recipient.name}</strong>
                {request.message ? (
                  <div className="profile-hookup-message-block">
                    <button
                      type="button"
                      className="profile-hookup-message-toggle"
                      onClick={() => setExpandedHookupMessages((current) => ({
                        ...current,
                        [request.id]: !current[request.id],
                      }))}
                    >
                      {isExpanded ? "Hide text" : "See text"}
                    </button>
                    {isExpanded && <span className="profile-hookup-message-text">{request.message}</span>}
                  </div>
                ) : <span>No message provided.</span>}
              </div>
            </div>
            <div className="profile-hookup-request-actions">
              <span className={`profile-hookup-state ${request.status}`}>{request.status}</span>
            </div>
            {request.status === "accepted" && (
              <div className="profile-hookup-contact-list">
                {request.recipient.instagram && <a href={`https://instagram.com/${request.recipient.instagram.replace(/^@/, "")}`} target="_blank" rel="noreferrer">Instagram: @{request.recipient.instagram.replace(/^@/, "")}</a>}
                {request.recipient.whatsapp && <a href={`https://wa.me/${request.recipient.whatsapp.replace(/\D/g, "")}`} target="_blank" rel="noreferrer">WhatsApp: {request.recipient.whatsapp}</a>}
                {request.recipient.snapchat && <span>Snapchat: @{request.recipient.snapchat.replace(/^@/, "")}</span>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  ) : <p>No sent requests yet.</p>;
  const pageClass = `profile-page ${overlay ? "is-overlay" : ""}`;

  if (loading) {
    return <main className={pageClass}><div className="profile-page-state">Opening profile...</div></main>;
  }
  if (error || !profile) {
    return (
      <main className={pageClass}>
        <header className="profile-page-nav">
          <button type="button" className="profile-back-button" onClick={onBack}>← Back</button>
          <div className="profile-page-brand"><span className="profile-brand-mark">H</span> HostelCast</div>
          <span />
        </header>
        <p className="profile-action-error" role="alert">{error || "Profile could not be loaded."}</p>
      </main>
    );
  }

  return (
    <main className={pageClass}>
      <header className="profile-page-nav">
        <button type="button" className="profile-back-button" onClick={onBack}>← <span>Back</span></button>
        <div className="profile-page-brand"><span className="profile-brand-mark">H</span> HostelCast</div>
        <div className="profile-nav-actions">
          <span className="profile-nav-name">{profile.name}</span>
          <button
            type="button"
            className="theme-toggle profile-theme-toggle"
            onClick={onToggleTheme}
            aria-label={`Switch to ${theme === "light" ? "dark" : "light"} theme`}
            title={`${theme === "light" ? "Dark" : "Light"} mode`}
          >{theme === "light" ? "☾" : "☀"}</button>
          <button
            type="button"
            className="profile-nav-live"
            onClick={() => onStartLive?.(profile.category)}
          >Start your live cast</button>
        </div>
      </header>
      <div className="profile-page-content">
        <nav className="profile-section-tabs" aria-label="Profile sections">
          <button type="button" className={activeTab === "all" ? "active" : ""} onClick={() => setActiveTab("all")}>Profile</button>
          <button type="button" className={activeTab === "videos" ? "active" : ""} onClick={() => setActiveTab("videos")}>Videos <span>{profile.counts.videos}</span></button>
          <button type="button" className={activeTab === "photos" ? "active" : ""} onClick={() => setActiveTab("photos")}>Photos <span>{profile.counts.photos}</span></button>
        </nav>

        <section className="profile-identity-card">
          <div className="profile-identity-main">
            <div className="profile-avatar-wrap">
              {profile.avatarUrl
                ? <img className="profile-page-avatar" src={profile.avatarUrl} alt={`${profile.name}'s profile`} />
                : <div className="profile-page-avatar is-placeholder">{String(profile.name || "U").charAt(0).toUpperCase()}</div>}
              {isOwnProfile && (
                <button className="profile-avatar-edit" type="button" onClick={() => avatarInputRef.current?.click()} aria-label="Change profile photo">
                  {uploading ? "…" : "＋"}
                </button>
              )}
              <input ref={avatarInputRef} className="profile-hidden-input" type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={chooseAvatar} />
            </div>
            <div className="profile-identity-details">
              <div className="profile-name-row">
                <div><h1>{profile.name}</h1><p>{profile.college || "Campus community"}{profile.category ? ` · ${profile.category}` : ""}</p></div>
                <div className="profile-name-actions">
                  <span className={`profile-online-pill ${profile.isOnline ? "is-online" : "is-offline"}`}>
                    <i /> {profile.isOnline ? "Online" : "Offline"}
                  </span>
                  {isOwnProfile && (
                    <div className="profile-menu-wrap" ref={profileMenuRef}>
                      <button
                        type="button"
                        className="profile-menu-trigger"
                        aria-label="Profile options"
                        aria-haspopup="menu"
                        aria-expanded={profileMenuOpen}
                        onClick={() => setProfileMenuOpen((open) => !open)}
                      >⋮</button>
                      {profileMenuOpen && (
                        <div className="profile-options-menu" role="menu">
                          <button type="button" role="menuitem" onClick={editExistingAvatar}>Edit DP</button>
                          <button type="button" role="menuitem" onClick={openScheduleEditor}>Set live streaming time</button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <div className="profile-counts">
                <span><strong>{profile.counts.posts}</strong> posts</span>
                <button className="profile-followers-count" type="button" onClick={() => openConnectionList("followers")} aria-expanded={followingListOpen && connectionListType === "followers"}>
                  <strong>{profile.counts.followers}</strong> followers
                </button>
                {isOwnProfile
                  ? <button className="profile-following-count" type="button" onClick={() => openConnectionList("following")} aria-expanded={followingListOpen && connectionListType === "following"}>
                    <strong>{profile.counts.following}</strong> following
                  </button>
                  : <span className="profile-following-count-static"><strong>{profile.counts.following}</strong> following</span>}
              </div>
              {editingBio
                ? <div className="profile-bio-editor">
                  <textarea ref={bioInputRef} value={bioDraft} onChange={(event) => {
                    if (countWords(event.target.value) <= MAX_BIO_WORDS) setBioDraft(event.target.value);
                  }} placeholder="Write a little about yourself..." />
                  <div className="profile-bio-emoji-tools">
                    <button type="button" aria-expanded={emojiPickerOpen} onClick={() => setEmojiPickerOpen((open) => !open)}>😊 Add emoji</button>
                    {emojiPickerOpen && (
                      <div className="profile-bio-emoji-picker" role="group" aria-label="Choose an emoji">
                        {BIO_EMOJIS.map((emoji) => (
                          <button key={emoji} type="button" onClick={() => insertBioEmoji(emoji)} aria-label={`Insert ${emoji}`}>{emoji}</button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="profile-bio-editor-footer">
                    <span>{countWords(bioDraft)}/{MAX_BIO_WORDS} words</span>
                    <div><button type="button" onClick={saveBio} disabled={busy || countWords(bioDraft) > MAX_BIO_WORDS}>Save bio</button><button type="button" onClick={() => { setEditingBio(false); setBioDraft(profile.bio); setEmojiPickerOpen(false); }}>Cancel</button></div>
                  </div>
                </div>
                : <p className="profile-bio">{profile.bio || (isOwnProfile ? "Add a short bio and let your campus know you." : "No bio yet.")}</p>}
              {profile.liveSchedule?.days?.length > 0 && (
                <div className="profile-live-schedule">
                  <strong>Live schedule</strong>
                  <span>{profile.liveSchedule.days.join(" · ")}</span>
                  <span>{profile.liveSchedule.startTime}–{profile.liveSchedule.endTime} ({profile.liveSchedule.timezone})</span>
                </div>
              )}
              <div className="profile-action-row">
                {isOwnProfile
                  ? <button className="profile-primary-action" type="button" onClick={() => setEditingBio(true)}>Add bio</button>
                  : <button className="profile-primary-action" type="button" onClick={toggleFollow} disabled={busy || !currentUser}>{following ? "Following" : "Follow"}</button>}
                {isOwnProfile && <button className="profile-secondary-action" type="button" disabled={profile.counts.photos >= MAX_PROFILE_PHOTOS && profile.counts.videos >= MAX_PROFILE_VIDEOS} onClick={() => postInputRef.current?.click()}>＋ Add post</button>}
              </div>

              {!isOwnProfile && profile.liveRoom && (
                <button className="profile-live-cta" type="button" onClick={() => onWatchLive?.(profile.liveRoom)}>
                  <span aria-hidden="true">▶</span> See live streaming
                </button>
              )}
            </div>
          </div>
        </section>

        {actionError && <p className="profile-action-error" role="alert">{actionError}</p>}
        <form className="profile-upload-panel" onSubmit={uploadPost}>
          <input ref={postInputRef} className="profile-hidden-input" type="file" accept="image/*,video/*" onChange={choosePostMedia} />
          <div className="profile-upload-copy"><strong>Share a campus moment</strong><span>Photos: {profile.counts.photos}/{MAX_PROFILE_PHOTOS} (up to 50 MB each) · Videos: {profile.counts.videos}/{MAX_PROFILE_VIDEOS} (up to 200 MB)</span></div>
          {selectedFile && <span className="profile-selected-file">{selectedFile.name}</span>}
          <input className="profile-caption-input" maxLength={500} value={caption} onChange={(event) => setCaption(event.target.value)} placeholder="Add a caption..." />
          <button type="button" className="profile-secondary-action" disabled={profile.counts.photos >= MAX_PROFILE_PHOTOS && profile.counts.videos >= MAX_PROFILE_VIDEOS} onClick={() => postInputRef.current?.click()}>Choose media</button>
          {selectedFile && <button className="profile-primary-action" type="submit" disabled={uploading}>{uploading ? "Uploading..." : "Post"}</button>}
        </form>

        <section className="profile-posts-section">
          <div className="profile-posts-heading">
            <div><span className="profile-eyebrow">THE CAMPUS GRID</span><h2>{activeTab === "videos" ? "Videos" : activeTab === "photos" ? "Photos" : "Posts"}</h2></div>
            <span>{activeTab === "all" ? profile.counts.posts : activeTab === "photos" ? profile.counts.photos : profile.counts.videos} posts</span>
          </div>
          {visiblePosts.length
            ? <div className="profile-post-grid">{visiblePosts.map((post) => (
              <button className="profile-post-tile" key={post.id} type="button" onClick={() => setLightboxPost(post)} aria-label={`Open ${post.mediaType} post`}>
                {post.mediaType === "video"
                  ? <video src={post.mediaUrl} muted playsInline preload="metadata" />
                  : <img src={post.mediaUrl} alt={post.caption || "Profile post"} loading="lazy" />}
                {post.mediaType === "video" && <span className="profile-post-video-mark">▶</span>}
              </button>
            ))}</div>
            : <div className="profile-empty-posts"><span>✦</span><h3>{isOwnProfile ? "Your story starts here" : "No posts yet"}</h3><p>{isOwnProfile ? "Upload a photo or video to build your campus grid." : "No uploaded photos or videos yet."}</p>{isOwnProfile && (profile.counts.photos < MAX_PROFILE_PHOTOS || profile.counts.videos < MAX_PROFILE_VIDEOS) && <button type="button" onClick={() => postInputRef.current?.click()}>Create your first post</button>}</div>}
        </section>

        {!isOwnProfile && (
          <section className="profile-hookup-panel profile-hookup-panel--viewer">
            <div className="profile-hookup-header">
              <strong>Hookup</strong>
              <span className={`profile-hookup-badge ${profile.hookup?.enabled ? "is-enabled" : "is-disabled"}`}>
                {profile.hookup?.enabled ? "On" : "Off"}
              </span>
            </div>
            {!profile.hookup?.enabled ? (
              <p className="profile-hookup-copy">This profile is not accepting hookup requests right now.</p>
            ) : hookupStatus.status === "pending" ? (
              <div className="profile-hookup-status">Request pending</div>
            ) : hookupStatus.status === "accepted" ? (
              <>
                <div className="profile-hookup-status success">Accepted</div>
                <div className="profile-hookup-contact-list">
                  {hookupStatus.instagram && <a href={`https://instagram.com/${hookupStatus.instagram.replace(/^@/, "")}`} target="_blank" rel="noreferrer">Instagram: @{hookupStatus.instagram.replace(/^@/, "")}</a>}
                  {hookupStatus.whatsapp && <a href={`https://wa.me/${hookupStatus.whatsapp.replace(/\D/g, "")}`} target="_blank" rel="noreferrer">WhatsApp: {hookupStatus.whatsapp}</a>}
                  {hookupStatus.snapchat && <span>Snapchat: @{hookupStatus.snapchat.replace(/^@/, "")}</span>}
                </div>
              </>
            ) : hookupStatus.status === "rejected" ? (
              <div className="profile-hookup-status rejected">Rejected</div>
            ) : (
              <>
                <p className="profile-hookup-copy">This profile is open to a hookup request. Send a short note and if they accept, you can see their social details.</p>
                <button type="button" className="profile-primary-action" onClick={() => setHookupRequestOpen(true)} disabled={busy || !currentUser}>Send hookup request</button>
              </>
            )}
            {profile.hookup?.enabled && hookupRequestOpen && (
              <div className="profile-hookup-modal">
                <label>
                  <span>Request message (up to 60 words)</span>
                  <textarea value={hookupRequestDraft} maxLength={500} onChange={(event) => setHookupRequestDraft(event.target.value)} placeholder="Hi, I’d love to connect and know your Instagram or WhatsApp for a quick chat." />
                </label>
                <div className="profile-hookup-actions">
                  <button type="button" className="profile-primary-action" onClick={sendHookupRequest} disabled={busy}>Send request</button>
                  <button type="button" className="profile-secondary-action" onClick={() => setHookupRequestOpen(false)}>Cancel</button>
                </div>
              </div>
            )}
          </section>
        )}

        {isOwnProfile && (
          <section className="profile-hookup-panel">
            <div className="profile-hookup-header">
              <div className="profile-hookup-title-wrap">
                <strong>Hookup</strong>
                <button type="button" className="profile-hookup-help" onClick={() => setHookupInfoOpen(true)}>Get social media ID</button>
              </div>
              <div className="profile-hookup-header-actions">
                {hookupSettings.enabled && (
                  <button type="button" className="profile-hookup-edit" onClick={() => setHookupEditing((current) => !current)}>
                    Edit
                  </button>
                )}
                <button
                  type="button"
                  className={`profile-hookup-status-badge ${hookupSettings.enabled ? "is-on" : "is-off"}`}
                  onClick={async () => {
                    if (hookupSettings.enabled) {
                      await saveHookupSettings(false);
                      return;
                    }
                    setHookupEditing(true);
                    await saveHookupSettings(true);
                  }}
                  aria-label={hookupSettings.enabled ? "Turn Hookup off" : "Turn Hookup on"}
                >
                  {hookupSettings.enabled ? <><span className="profile-hookup-check">✓</span> On</> : "Off"}
                </button>
              </div>
            </div>

            {(!hookupSettings.enabled || hookupEditing) ? (
              <div className="profile-hookup-grid">
                <label>
                  <span>Instagram</span>
                  <input
                    value={hookupSettings.instagram}
                    maxLength={30}
                    onChange={(event) => setHookupSettings((current) => ({ ...current, instagram: event.target.value }))}
                    placeholder="@username"
                  />
                </label>
                <label>
                  <span>WhatsApp</span>
                  <input
                    value={hookupSettings.whatsapp}
                    maxLength={30}
                    onChange={(event) => setHookupSettings((current) => ({ ...current, whatsapp: event.target.value }))}
                    placeholder="+91 98765 43210"
                  />
                </label>
                <label>
                  <span>Snapchat</span>
                  <input
                    value={hookupSettings.snapchat}
                    maxLength={30}
                    onChange={(event) => setHookupSettings((current) => ({ ...current, snapchat: event.target.value }))}
                    placeholder="@snapname"
                  />
                </label>
                <div className="profile-hookup-actions">
                  <button type="button" className="profile-primary-action" onClick={async () => {
                    const payload = {
                      enabled: Boolean(hookupSettings.instagram || hookupSettings.whatsapp || hookupSettings.snapchat),
                      instagram: hookupSettings.instagram || "",
                      whatsapp: hookupSettings.whatsapp || "",
                      snapchat: hookupSettings.snapchat || "",
                    };
                    if (!payload.enabled) {
                      setActionError("Add at least one social profile before turning Hookup on.");
                      return;
                    }
                    setBusy(true);
                    setActionError("");
                    try {
                      const result = await profileRequest(`/api/profiles/${encodeURIComponent(profileId)}/hookup-settings`, {
                        method: "PUT",
                        body: JSON.stringify(payload),
                      });
                      setHookupSettings({
                        enabled: Boolean(result.hookup.enabled),
                        instagram: result.hookup.instagram || "",
                        whatsapp: result.hookup.whatsapp || "",
                        snapchat: result.hookup.snapchat || "",
                      });
                      setProfile((current) => ({ ...current, hookup: { ...current.hookup, ...result.hookup } }));
                      setHookupEditing(false);
                    } catch (hookupError) {
                      setActionError(hookupError.message);
                    } finally {
                      setBusy(false);
                    }
                  }} disabled={busy}>Save hookup</button>
                  {hookupSettings.enabled && (
                    <button type="button" className="profile-secondary-action" onClick={() => setHookupEditing(false)} disabled={busy}>Cancel</button>
                  )}
                </div>
              </div>
            ) : (
              <div className="profile-hookup-summary">
                <div className="profile-hookup-summary-label">Social media</div>
                <div className="profile-hookup-summary-chip-row">
                  {hookupSettings.instagram && <span className="profile-hookup-summary-chip">Instagram: @{hookupSettings.instagram.replace(/^@/, "")}</span>}
                  {hookupSettings.whatsapp && <span className="profile-hookup-summary-chip">WhatsApp: {hookupSettings.whatsapp}</span>}
                  {hookupSettings.snapchat && <span className="profile-hookup-summary-chip">Snapchat: @{hookupSettings.snapchat.replace(/^@/, "")}</span>}
                </div>
              </div>
            )}

            <div className="profile-hookup-request-columns">
              <div className="profile-hookup-requests">
                <strong>Incoming hookup requests</strong>
                {hookupRequests.length === 0 ? <p>No new requests yet.</p> : hookUpRequestsList}
              </div>

              <div className="profile-hookup-requests-divider" aria-hidden="true" />

              <div className="profile-hookup-requests profile-hookup-requests--sent">
                <strong>Sent hookup requests</strong>
                {sentHookupRequests.length === 0 ? <p>No sent requests yet.</p> : sentHookupRequestsList}
              </div>
            </div>
          </section>
        )}
      </div>
      {hookupInfoOpen && (
        <div className="profile-modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setHookupInfoOpen(false);
        }}>
          <section className="profile-hookup-dialog" role="dialog" aria-modal="true" aria-labelledby="profile-hookup-info-title">
            <header className="profile-modal-header">
              <div>
                <span className="profile-eyebrow">HOW HOOKUP WORKS</span>
                <h2 id="profile-hookup-info-title">Get social media ID</h2>
              </div>
              <button type="button" className="profile-modal-close" onClick={() => setHookupInfoOpen(false)} aria-label="Close how hookup works">×</button>
            </header>
            <div className="profile-hookup-info-content">
              <p>Hookup is a safe and respectful way for campus users to connect with people they are interested in.</p>
              <ol>
                <li>Turn Hookup on from your profile.</li>
                <li>Add at least one social account such as Instagram, WhatsApp, or Snapchat.</li>
                <li>Another user can send you a short request with a message.</li>
                <li>If you accept, both of you can see each other’s shared social details.</li>
                <li>If you reject or ignore the request, no contact information is shared.</li>
              </ol>
              <p className="profile-hookup-info-note">This feature is for respectful campus connections only. Your private details stay private unless both people agree to share them.</p>
            </div>
          </section>
        </div>
      )}
      {followingListOpen && (
        <div className="profile-modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setFollowingListOpen(false);
        }}>
          <section className="profile-following-dialog" role="dialog" aria-modal="true" aria-labelledby="profile-following-title">
            <header className="profile-modal-header">
              <div><span className="profile-eyebrow">{connectionListType === "following" ? "YOUR NETWORK" : "CAMPUS NETWORK"}</span><h2 id="profile-following-title">{connectionListType === "following" ? "Following" : "Followers"}</h2></div>
              <button type="button" className="profile-modal-close" onClick={() => setFollowingListOpen(false)} aria-label={`Close ${connectionListType} list`}>×</button>
            </header>
            <div className="profile-following-scroll">
              {followingListLoading && <p className="profile-list-message">Loading accounts...</p>}
              {followingListError && <p className="profile-action-error" role="alert">{followingListError}</p>}
              {!followingListLoading && !followingListError && followingUsers.length === 0 && (
                <p className="profile-list-message">{connectionListType === "following" ? "You are not following any accounts yet." : "This profile has no followers yet."}</p>
              )}
              {!followingListLoading && followingUsers.map((user) => (
                <div className="profile-following-user" key={user.id}>
                  <button type="button" className="profile-following-identity" onClick={() => openFollowingUser(user.id)} aria-label={`Visit ${user.name}'s profile`}>
                    {user.avatarUrl
                      ? <img src={user.avatarUrl} alt="" />
                      : <span className="profile-following-avatar-placeholder">{String(user.name || "U").charAt(0).toUpperCase()}</span>}
                    <span><strong>{user.name}</strong><small>{user.college || "Campus"}</small></span>
                  </button>
                  {connectionListType === "following" && (
                    <button
                      type="button"
                      className={`profile-follow-action ${followingStates[user.id] ? "is-following" : ""}`}
                      onClick={() => toggleFollowingUser(user)}
                      disabled={followingActionId === user.id}
                    >{followingActionId === user.id ? "..." : followingStates[user.id] ? "Following" : "Follow"}</button>
                  )}
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
      {isOwnProfile && scheduleEditorOpen && (
        <div className="profile-modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setScheduleEditorOpen(false);
        }}>
          <form className="profile-schedule-dialog" role="dialog" aria-modal="true" aria-labelledby="profile-schedule-title" onSubmit={saveLiveSchedule}>
            <header className="profile-modal-header">
              <div><span className="profile-eyebrow">LET YOUR FOLLOWERS KNOW</span><h2 id="profile-schedule-title">Live streaming time</h2></div>
              <button type="button" className="profile-modal-close" onClick={() => setScheduleEditorOpen(false)} aria-label="Close live schedule">×</button>
            </header>
            <p className="profile-schedule-help">Choose the days and hours you usually go live. Times use your local time zone: {scheduleDraft.timezone}.</p>
            <fieldset className="profile-schedule-days">
              <legend>Days</legend>
              {WEEK_DAYS.map((day) => (
                <label key={day}>
                  <input
                    type="checkbox"
                    checked={scheduleDraft.days.includes(day)}
                    onChange={(event) => setScheduleDraft((current) => ({
                      ...current,
                      days: WEEK_DAYS.filter((weekDay) => (
                        event.target.checked
                          ? current.days.includes(weekDay) || weekDay === day
                          : current.days.includes(weekDay) && weekDay !== day
                      )),
                    }))}
                  />
                  {day.slice(0, 3)}
                </label>
              ))}
            </fieldset>
            <div className="profile-schedule-times">
              <label>From<input type="time" required value={scheduleDraft.startTime} onChange={(event) => setScheduleDraft((current) => ({ ...current, startTime: event.target.value }))} /></label>
              <label>Until<input type="time" required value={scheduleDraft.endTime} onChange={(event) => setScheduleDraft((current) => ({ ...current, endTime: event.target.value }))} /></label>
            </div>
            {scheduleDraft.days.length === 0 && <p className="profile-schedule-validation" role="alert">Select at least one day.</p>}
            <footer className="profile-schedule-footer">
              {profile.liveSchedule && <button type="button" className="profile-secondary-action" onClick={clearLiveSchedule} disabled={busy}>Remove schedule</button>}
              <button type="button" className="profile-secondary-action" onClick={() => setScheduleEditorOpen(false)}>Cancel</button>
              <button type="submit" className="profile-primary-action" disabled={busy || scheduleDraft.days.length === 0}>{busy ? "Saving..." : "Save schedule"}</button>
            </footer>
          </form>
        </div>
      )}
      {lightboxPost && (
        <div className="profile-lightbox" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setLightboxPost(null);
        }}>
          <button className="profile-lightbox-close" type="button" aria-label="Close post" onClick={() => setLightboxPost(null)}>×</button>
          <div className="profile-lightbox-content">
            {lightboxPost.mediaType === "video"
              ? <video src={lightboxPost.mediaUrl} controls autoPlay playsInline />
              : <img src={lightboxPost.mediaUrl} alt={lightboxPost.caption || "Profile post"} />}
            <div className="profile-lightbox-caption"><span>{lightboxPost.caption || "A campus moment"}</span>{isOwnProfile && <button type="button" onClick={() => deletePost(lightboxPost)}>Delete post</button>}</div>
          </div>
        </div>
      )}
      {avatarCropSource && (
        <div className="profile-avatar-crop-overlay" role="dialog" aria-modal="true" aria-labelledby="profile-avatar-crop-title">
          <section className="profile-avatar-crop-dialog">
            <header>
              <div><h2 id="profile-avatar-crop-title">{editingExistingAvatar ? "Adjust profile photo" : "Crop profile photo"}</h2><p>Drag the square crop to frame your photo. It will appear as a circle on your profile.</p></div>
              <button type="button" className="profile-avatar-crop-close" onClick={cancelAvatarCrop} aria-label="Cancel photo crop">×</button>
            </header>
            <div
              ref={avatarCropViewportRef}
              className="profile-avatar-crop-viewport"
              onPointerDown={startAvatarCropDrag}
              onPointerMove={moveAvatarCrop}
              onPointerUp={endAvatarCropDrag}
              onPointerCancel={endAvatarCropDrag}
              onLostPointerCapture={endAvatarCropDrag}
            >
              <img
                ref={avatarCropImageRef}
                src={avatarCropSource}
                alt="Profile photo crop preview"
                draggable="false"
                onLoad={(event) => {
                  const size = {
                    width: event.currentTarget.naturalWidth,
                    height: event.currentTarget.naturalHeight,
                  };
                  const minZoom = Math.min(size.width, size.height) / Math.max(size.width, size.height);
                  setAvatarCropSize(size);
                  setAvatarCropMinZoom(minZoom);
                  setAvatarCropZoom(minZoom);
                  setAvatarCropOffset({ x: 0, y: 0 });
                  setAvatarCropViewportSize(avatarCropViewportRef.current?.clientWidth || 280);
                }}
                style={avatarCropSize ? {
                  width: `${avatarCropSize.width * avatarCropViewportSize / Math.min(avatarCropSize.width, avatarCropSize.height)}px`,
                  height: `${avatarCropSize.height * avatarCropViewportSize / Math.min(avatarCropSize.width, avatarCropSize.height)}px`,
                  transform: `translate(calc(-50% + ${getClampedAvatarCropOffset(avatarCropOffset).x}px), calc(-50% + ${getClampedAvatarCropOffset(avatarCropOffset).y}px)) scale(${avatarCropZoom})`,
                } : undefined}
              />
            </div>
            <label className="profile-avatar-crop-zoom">
              <span>Zoom</span>
              <input
                type="range"
                min={avatarCropMinZoom}
                max="3"
                step="0.01"
                value={avatarCropZoom}
                onChange={(event) => {
                  const zoom = Number(event.target.value);
                  setAvatarCropZoom(zoom);
                  setAvatarCropOffset((offset) => getClampedAvatarCropOffset(offset, zoom));
                }}
              />
              <span>{avatarCropZoom.toFixed(1)}×</span>
            </label>
            <footer>
              <button type="button" className="profile-secondary-action" onClick={cancelAvatarCrop} disabled={uploading}>Cancel</button>
              <button type="button" className="profile-primary-action" onClick={saveAvatarCrop} disabled={!avatarCropSize || uploading}>
                {uploading ? "Saving…" : "Save photo"}
              </button>
            </footer>
          </section>
        </div>
      )}
    </main>
  );
}
