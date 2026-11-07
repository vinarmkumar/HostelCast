import { useEffect, useRef, useState } from "react";

export default function LiveUserSearch({ onJoinLive, onOpenProfile, currentUser }) {
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);
  const normalizedQuery = query.trim();

  useEffect(() => {
    if (normalizedQuery.length < 2) {
      setUsers([]);
      setLoading(false);
      setError("");
      return undefined;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(`/api/home/search?q=${encodeURIComponent(normalizedQuery)}`, {
          signal: controller.signal,
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message || "User search could not be completed.");
        setUsers(result.users || []);
      } catch (searchError) {
        if (searchError.name !== "AbortError") {
          setUsers([]);
          setError(searchError.message);
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 250);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [normalizedQuery]);

  useEffect(() => {
    function handlePointerDown(event) {
      if (!containerRef.current?.contains(event.target)) setOpen(false);
    }
    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  function chooseUser(user) {
    setOpen(false);
    if (user.liveRoom) {
      setQuery("");
      onJoinLive(user.liveRoom);
    } else {
      setQuery("");
      onOpenProfile(user.id);
    }
  }

  return (
    <div className="live-user-search" ref={containerRef}>
      <label className="sr-only" htmlFor="live-user-search-input">Search students and live videos</label>
      <svg className="live-user-search-icon" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="10.8" cy="10.8" r="6.8" />
        <path d="m16 16 4.5 4.5" />
      </svg>
      <input
        id="live-user-search-input"
        type="search"
        value={query}
        placeholder="Search students or live videos"
        autoComplete="off"
        aria-expanded={open && normalizedQuery.length >= 2}
        aria-controls="live-user-search-results"
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" && users[0]) {
            event.preventDefault();
            chooseUser(users[0]);
          }
        }}
      />
      {query && (
        <button className="live-user-search-clear" type="button" aria-label="Clear search" onClick={() => {
          setQuery("");
          setOpen(true);
        }}>×</button>
      )}
      {open && normalizedQuery.length >= 2 && (
        <div className="live-user-search-results" id="live-user-search-results" role="listbox" aria-label="Search results">
          {loading && <p className="live-user-search-message">Searching students...</p>}
          {!loading && error && <p className="live-user-search-message is-error" role="alert">{error}</p>}
          {!loading && !error && users.length === 0 && <p className="live-user-search-message">No students found.</p>}
          {!loading && !error && users.map((user) => (
            <button className="live-user-search-result" key={user.id} type="button" role="option" onClick={() => chooseUser(user)}>
              {user.avatarUrl
                ? <img className="live-user-search-avatar" src={user.avatarUrl} alt="" />
                : <span className="live-user-search-avatar">{String(user.name || "U").charAt(0).toUpperCase()}</span>}
              <span className="live-user-search-copy">
                <strong>{user.name}{user.id === currentUser?.id ? " (You)" : ""}</strong>
                <small>{user.college || "Campus"}</small>
              </span>
              {user.liveRoom
                ? <span className="live-user-search-live">● LIVE</span>
                : <span className="live-user-search-profile">Profile</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
