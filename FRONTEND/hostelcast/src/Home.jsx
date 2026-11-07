import { useState } from "react";
import hostelCastLogo from "./HomePage/img/HostelCastBG.png";
import HomeSidebar from "./HomePage/HomeSidebar.jsx";
import LiveFeed from "./HomePage/LiveFeed.jsx";
import LiveUserSearch from "./HomePage/LiveUserSearch.jsx";
import useLiveRooms from "./Live/useLiveRooms.js";

export default function Home({ currentUser, onSignIn, onCreate, onSignOut, theme, onToggleTheme, onStartLive, onJoinLive, onOpenProfile, previewOverride }) {
  const [menuOpen, setMenuOpen] = useState(false); // true hone par left side menu visible hota hai.
  const [desktopSidebarVisible, setDesktopSidebarVisible] = useState(true); // Hamburger desktop par sidebar collapse/restore karta hai.
  const [category, setCategory] = useState("Engineering"); // Selected campus category ko Home feed par apply karta hai.
  const [college, setCollege] = useState("All"); // Category ke andar college filter ki current value.
  const [sortBy, setSortBy] = useState("views"); // Live rooms ko views ya college name se sort karta hai.
  const { rooms, loading: roomsLoading, error: roomsError } = useLiveRooms();

  return (
    <main className="home-page">
      <header className="topbar">
        <button className="menu-button" onClick={() => {
          if (window.matchMedia("(max-width: 650px)").matches) setMenuOpen(!menuOpen);
          else setDesktopSidebarVisible((visible) => !visible);
        }} aria-label="Toggle navigation menu">
          <span></span><span></span><span></span>
        </button>
        <button className="brand" aria-label="HostelCast home">
          <img src={hostelCastLogo} alt="HostelCast logo" />
          <span>HostelCast</span>
        </button>
        <LiveUserSearch onJoinLive={onJoinLive} onOpenProfile={onOpenProfile} currentUser={currentUser} />
        <div className="mobile-nav-actions">
          <button className="mobile-icon-button theme-toggle" onClick={onToggleTheme} aria-label={`Switch to ${theme === "light" ? "dark" : "light"} theme`} title={`${theme === "light" ? "Dark" : "Light"} mode`}>
            {theme === "light" ? "☾" : "☀"}
          </button>
          {currentUser ? (
            <>
              <button className="mobile-pill-button profile-pill" onClick={() => onOpenProfile(currentUser.id)} aria-label="My Profile" title="My Profile">
                {currentUser.avatarUrl
                  ? <img className="nav-avatar" src={currentUser.avatarUrl} alt="" />
                  : <span className="nav-avatar-fallback">{currentUser.name?.charAt(0)?.toUpperCase() || "U"}</span>}
                <span>My Profile</span>
              </button>
              <button className="mobile-pill-button live-pill" onClick={() => onStartLive(category)} aria-label="Start your live cast" title="Start your live cast">
                <span>Start live</span>
              </button>
            </>
          ) : (
            <>
              <button className="mobile-pill-button" onClick={onSignIn} aria-label="Sign in" title="Sign in">
                <span>Sign in</span>
              </button>
              <button className="mobile-pill-button live-pill" onClick={onCreate} aria-label="Create account" title="Create account">
                <span>Create</span>
              </button>
            </>
          )}
        </div>
        <nav className="desktop-nav">
          <button className="theme-toggle" onClick={onToggleTheme} aria-label={`Switch to ${theme === "light" ? "dark" : "light"} theme`} title={`${theme === "light" ? "Dark" : "Light"} mode`}>
            {theme === "light" ? "☾" : "☀"}
          </button>
          {currentUser ? (
            <>
              <button className="nav-user" onClick={() => onOpenProfile(currentUser.id)}>
                {currentUser.avatarUrl
                  ? <img className="nav-avatar" src={currentUser.avatarUrl} alt="" />
                  : <span className="nav-avatar-fallback">{currentUser.name?.charAt(0)?.toUpperCase() || "U"}</span>}
                <span>My Profile</span>
              </button>
              <button className="nav-live" onClick={() => onStartLive(category)}>Start your live cast</button>
              <button className="nav-create" onClick={onSignOut}>Sign out</button>
            </>
          ) : (
            <>
              <button className="nav-live" onClick={() => onStartLive(category)}>Start your live cast</button>
              <button onClick={onSignIn}>Sign in</button>
              <button className="nav-create" onClick={onCreate}>Create free account</button>
            </>
          )}
        </nav>
      </header>

      <div className={`discover-layout ${!desktopSidebarVisible ? "sidebar-hidden" : ""}`}>
        <HomeSidebar
          open={menuOpen}
          collapsed={!desktopSidebarVisible}
          category={category}
          college={college}
          onSignOut={currentUser ? onSignOut : undefined}
          onCategoryChange={(value) => { setCategory(value); setCollege("All"); }}
          onCollegeChange={setCollege}
          onClose={() => setMenuOpen(false)}
        />
        <section className="live-area">
          <div className="feed-heading">
            <div>
              <span>Campus live now</span>
              <h1>Discover {category === "FashionDesign" ? "fashion design" : category.toLowerCase()} campuses</h1>
            </div>
            <label>Sort by
              <select value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
                <option value="views">Most viewed</option>
                <option value="All">All genders</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Gay">Gay</option>
                <option value="Lesbian">Lesbian</option>
                <option value="Transgender">Transgender</option>
                <option value="Other">Other</option>
              </select>
            </label>
          </div>
          {roomsError && <p className="live-feed-error" role="alert">{roomsError}</p>}
          {roomsLoading && <p className="live-feed-loading">Finding live campus casts...</p>}
          {!roomsLoading && !roomsError && <LiveFeed rooms={rooms} category={category} college={college} sortBy={sortBy} onJoin={onJoinLive} previewOverride={previewOverride} />}
        </section>
      </div>
    </main>
  );
}
