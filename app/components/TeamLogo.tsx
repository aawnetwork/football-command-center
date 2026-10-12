export function TeamLogo({ src, name }: { src?: string; name?: string }) {
  const image = src ? <img key={src} data-team-logo src={src} alt="" style={{ display: "block", width: 24, height: 24, objectFit: "contain" }}
    onError={(event) => { event.currentTarget.hidden = true; }} /> : null;
  if (name === undefined) return image;
  return <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
    <span style={{ width: 24, height: 24, flex: "0 0 24px" }}>{image}</span>
    <span style={{ minWidth: 0 }}>{name}</span>
  </span>;
}
