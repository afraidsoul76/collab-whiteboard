import { useState } from "react";
import Board from "./components/Board";

// Room comes from the ?room= query param so a shared link drops people onto
// the same board. Defaults to a common "public" room.
function initialRoom(): string {
  const params = new URLSearchParams(window.location.search);
  return params.get("room")?.trim() || "public";
}

function suggestedName(): string {
  return `Guest-${Math.floor(1000 + Math.random() * 9000)}`;
}

export default function App() {
  const [joined, setJoined] = useState(false);
  const [name, setName] = useState(suggestedName);
  const [room, setRoom] = useState(initialRoom);

  if (joined) {
    return <Board name={name.trim() || "Guest"} room={room.trim() || "public"} />;
  }

  return (
    <div className="join">
      <form
        className="join__card"
        onSubmit={(e) => {
          e.preventDefault();
          const params = new URLSearchParams(window.location.search);
          params.set("room", room.trim() || "public");
          window.history.replaceState(null, "", `?${params.toString()}`);
          setJoined(true);
        }}
      >
        <h1 className="join__title">
          <span className="join__logo">🎨</span> Collab Whiteboard
        </h1>
        <p className="join__subtitle">
          Draw together in real time. Share the link, same room, instant canvas.
        </p>

        <label className="join__label" htmlFor="name">
          Your name
        </label>
        <input
          id="name"
          className="join__input"
          value={name}
          maxLength={24}
          onChange={(e) => setName(e.target.value)}
          autoComplete="off"
        />

        <label className="join__label" htmlFor="room">
          Room
        </label>
        <input
          id="room"
          className="join__input"
          value={room}
          maxLength={60}
          onChange={(e) => setRoom(e.target.value)}
          autoComplete="off"
        />

        <button className="join__button" type="submit">
          Start drawing →
        </button>
      </form>
      <footer className="join__footer">
        Open this page in a second tab to see multiplayer in action.
      </footer>
    </div>
  );
}
