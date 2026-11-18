export function LiveAnnouncer({ message, politeness = "polite" }) {
  return (
    <div aria-live={politeness} aria-atomic="true" className="sr-only">
      {message || ""}
    </div>
  );
}

export default LiveAnnouncer;
