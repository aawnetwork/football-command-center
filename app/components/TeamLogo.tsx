export function TeamLogo({ src }: { src?: string }) {
  return src ? <img data-team-logo src={src} alt="" style={{ width: 24, height: 24, objectFit: "contain", verticalAlign: "middle", marginRight: 8 }}
    onError={(event) => { event.currentTarget.hidden = true; }} /> : null;
}
