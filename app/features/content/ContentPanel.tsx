type ContentPanelProps = {
  sport: "CFB" | "NFL";
};

export function ContentPanel({ sport }: ContentPanelProps) {
  return (
    <section className="content-panel">
      <div className="content-panel__header">
        <h2>🚨 Content</h2>
        <p>
          The actionable {sport} queue for moments worth clipping, posting, or
          turning into a story.
        </p>
      </div>

      <div className="content-panel__empty">
        Content flags will collect here as we connect performances, upsets,
        rivalry moments, record chases, and other editorial signals.
      </div>
    </section>
  );
}
