/**
 * A diagram rendered from Mermaid at build time (E5-02): `svg` is filled in by the remark plugin, and
 * `alt` (required by the build) is what screen readers get. It's shown as an image so the SVG's own
 * styles stay inside it (the site's CSP allows no inline styles on the page). The caption shows below.
 */
export function Diagram({ alt, svg, caption }: { alt: string; svg?: string; caption?: string }) {
  return (
    <figure className="grid min-w-0 gap-2">
      <img
        alt={alt}
        src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg ?? '')}`}
        className="mx-auto h-auto max-w-full rounded-md bg-white p-3"
      />
      {caption && <figcaption className="text-sm">{caption}</figcaption>}
    </figure>
  )
}
