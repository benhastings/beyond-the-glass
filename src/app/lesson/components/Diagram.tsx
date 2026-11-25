/**
 * A diagram rendered from Mermaid at build time (E5-02): `svg` is filled in by the remark plugin, and
 * `alt` (required by the build) is what screen readers get. The optional caption shows below it.
 */
export function Diagram({ alt, svg, caption }: { alt: string; svg?: string; caption?: string }) {
  return (
    <figure className="grid gap-2">
      <div
        role="img"
        aria-label={alt}
        className="overflow-x-auto rounded-md bg-white p-3 [&_svg]:mx-auto [&_svg]:h-auto [&_svg]:max-w-full"
        // The SVG is produced from the lesson's own Mermaid source at build time, never from user input.
        dangerouslySetInnerHTML={{ __html: svg ?? '' }}
      />
      {caption && <figcaption className="text-sm">{caption}</figcaption>}
    </figure>
  )
}
