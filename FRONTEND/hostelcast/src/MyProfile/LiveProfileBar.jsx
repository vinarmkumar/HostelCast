import { useEffect, useState } from "react";
import { profileRequest } from "./profileApi.js";
import "./ProfilePage.css";

export default function LiveProfileBar({ hostId, hostName, currentUserId, onOpenProfile }) {
  const [following, setFollowing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const canFollow = Boolean(currentUserId && hostId) && String(currentUserId) !== String(hostId);

  useEffect(() => {
    if (!canFollow) return undefined;
    let active = true;
    profileRequest(`/api/profiles/${encodeURIComponent(hostId)}/follow-status`)
      .then((result) => {
        if (active) setFollowing(result.following);
      })
      .catch((requestError) => {
        if (active) setError(requestError.message);
      });
    return () => { active = false; };
  }, [canFollow, hostId]);

  async function toggleFollow() {
    if (!canFollow || loading) return;
    setLoading(true);
    setError("");
    try {
      const result = await profileRequest(`/api/profiles/${encodeURIComponent(hostId)}/follow`, {
        method: following ? "DELETE" : "POST",
      });
      setFollowing(result.following);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <nav className="live-profile-tabs" aria-label="Streamer profile">
        <button type="button" className="active" onClick={() => onOpenProfile(hostId, "all")}>Profile</button>
        {canFollow && (
          <button
            type="button"
            className={`live-profile-follow ${following ? "is-following" : ""}`}
            onClick={toggleFollow}
            disabled={loading}
          >{loading ? "Please wait..." : following ? "Following" : "Follow"}</button>
        )}
        <span>{hostName || "Streamer"}'s profile</span>
      </nav>
      {error && <p className="live-profile-action-error" role="alert">{error}</p>}
    </>
  );
}
