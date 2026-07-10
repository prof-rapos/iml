// Shared SVG marker definitions, referenced by edge components as url(#id).
// Rendered once per canvas view (structural + behavioural) so the arrowheads
// resolve in whichever editor is mounted.
export default function SvgMarkers() {
  return (
    <svg style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }}>
      <defs>
        {/* Composition filled diamond — placed at the SOURCE end (markerStart). */}
        <marker
          id="diamond-composition"
          viewBox="0 0 20 10"
          refX="1" refY="5"
          markerWidth="20" markerHeight="15"
          orient="auto"
          markerUnits="userSpaceOnUse"
        >
          <polygon points="1,5 10,0.5 19,5 10,9.5" fill="#000000" stroke="#000000" strokeWidth="1.5" />
        </marker>

        {/* Inheritance: hollow triangle — white fill, black border */}
        <marker
          id="arrow-inheritance"
          viewBox="0 0 18 16"
          refX="18" refY="8"
          markerWidth="18" markerHeight="16"
          orient="auto"
          markerUnits="userSpaceOnUse"
        >
          <polygon points="0,0 18,8 0,16" fill="white" stroke="black" strokeWidth="1.5" />
        </marker>

        {/* Reference / Composition / Transition: open black arrowhead */}
        <marker
          id="arrow-open"
          viewBox="0 0 12 12"
          refX="10" refY="6"
          markerWidth="14" markerHeight="14"
          orient="auto"
          markerUnits="userSpaceOnUse"
        >
          <path d="M 0 1 L 11 6 L 0 11" fill="none" stroke="black" strokeWidth="2" />
        </marker>
      </defs>
    </svg>
  );
}
