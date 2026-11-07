export default function LiveFeed({ rooms, category, college, sortBy, onJoin, previewOverride }) {
  const filtered = rooms.filter((room) => room.category === category)
    .filter((room) => college === "All" || (room.collegeFilter || room.college) === college)
    .filter((room) => sortBy === "views" || sortBy === "All" || room.hostGender === sortBy);
  if (sortBy === "views") filtered.sort((a, b) => b.views - a.views);
  if (!filtered.length) return <div className="empty-feed"><strong>No live casts here yet</strong><p>Choose another college or check back soon.</p></div>;
  return <div className="live-feed">{filtered.map((room) => (
    <article className="live-card" key={room.id || room.roomName}>
      <button className="live-card-open" type="button" onClick={() => onJoin(room)} aria-label={`Watch ${room.title}`}>
        <div className="live-card-preview" style={{ "--room-color": room.color || "#5e5ce6" }}>
          {(previewOverride?.roomName === room.roomName ? previewOverride.preview : room.preview)
            ? <img className="live-card-snapshot" src={previewOverride?.roomName === room.roomName ? previewOverride.preview : room.preview} alt="" />
            : <div className="room-avatar">{room.host.charAt(0)}</div>}
          <span className="live-badge">● LIVE</span>
          {room.stageGuest?.name && <span className="live-stage-guest-badge">ON STAGE · {room.stageGuest.name}</span>}
          {room.views > 0 && <span className="view-badge">{room.views >= 1000 ? `${(room.views / 1000).toFixed(1)}K` : room.views} views</span>}
          {Number.isFinite(room.viewerCount) && <span className="watching-badge"><i aria-hidden="true" /> {room.viewerCount} watching</span>}
        </div>
        <div className="live-card-copy"><strong>{room.title}</strong><span>{room.host}</span></div>
      </button>
      <button className="join-live" type="button" onClick={() => onJoin(room)}>Watch live</button>
    </article>
  ))}</div>;
}
