// A wide, invisible path drawn on top of an edge's visible stroke so clicks
// register reliably even when the visible line is thin — shared by every
// edge type that needs to select itself on click.
export function EdgeClickCatcher({ id, edgePath, onSelect }) {
  return (
    <path
      d={edgePath}
      fill="none"
      stroke="transparent"
      strokeWidth={18}
      onClick={() => onSelect(id, 'edge')}
      style={{ cursor: 'pointer' }}
    />
  );
}
