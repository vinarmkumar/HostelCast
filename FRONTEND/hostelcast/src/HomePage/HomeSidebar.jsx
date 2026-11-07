import { useState } from "react";
import { categories } from "./categories.js";

export default function HomeSidebar({ open, collapsed, category, college, onCategoryChange, onCollegeChange, onClose, onSignOut }) {
  const [expanded, setExpanded] = useState(category);
  return (
    <>
      <aside className={`discover-sidebar ${open ? "open" : ""} ${collapsed ? "collapsed-desktop" : ""}`}>
        <button className="sidebar-close" onClick={onClose} aria-label="Close sidebar">×</button>
        <strong>Discover</strong>
        {Object.entries(categories).map(([name, colleges]) => (
          <div className="sidebar-group" key={name}>
            <button className={category === name ? "active" : ""} onClick={() => {
              setExpanded(expanded === name ? "" : name);
              onCategoryChange(name);
            }}>
              <span>{name === "FashionDesign" ? "Fashion Design" : name}</span>
              <span>{expanded === name ? "⌃" : "⌄"}</span>
            </button>
            {(expanded === name || category === name) && <div className="sidebar-colleges">
              <button className={college === "All" ? "selected" : ""} onClick={() => onCollegeChange("All")}>All colleges</button>
              {colleges.map((item) => (
                <button key={item} className={college === item ? "selected" : ""} onClick={() => onCollegeChange(item)}>{item}</button>
              ))}
            </div>}
          </div>
        ))}
        {onSignOut && (
          <button
            className="discover-signout"
            type="button"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onSignOut();
            }}
          >
            Sign out
          </button>
        )}
      </aside>
      {open && <button className="sidebar-backdrop" aria-label="Close sidebar" onClick={onClose} />}
    </>
  );
}
