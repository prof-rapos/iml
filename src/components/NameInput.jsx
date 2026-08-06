import { useState, useEffect, useRef } from 'react';

// A rename field that only commits on blur/Enter instead of on every
// keystroke. Renaming actions (updateClass, updateAttribute, etc.) validate
// and can silently reject a patch (duplicate name, reserved keyword) —
// wired directly to onChange, a rejected intermediate value (e.g. "Do"
// while typing toward "Donut", which used to collide case-insensitively
// with the keyword "do") snapped the displayed text back to the
// last-accepted value on every keystroke, making it look like typing
// itself was being blocked.
export default function NameInput({ value, onCommit, style, placeholder, autoFocus, onKeyDown }) {
  const [draft, setDraft] = useState(value);
  const focused = useRef(false);
  const skipNextCommit = useRef(false);

  // Only resync from the external value while not focused — otherwise a
  // rejected commit (store didn't change `value`) would fight the user's
  // own typing on every render.
  useEffect(() => {
    if (!focused.current) setDraft(value);
  }, [value]);

  return (
    <input
      style={style}
      placeholder={placeholder}
      autoFocus={autoFocus}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onFocus={() => { focused.current = true; }}
      onBlur={() => {
        focused.current = false;
        // Escape already told us to discard the draft — don't commit it,
        // just fall back to the real value (blur() fires this synchronously,
        // before the setDraft() from the Escape handler has been applied).
        if (skipNextCommit.current) { skipNextCommit.current = false; setDraft(value); return; }
        if (draft !== value) onCommit(draft);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.target.blur();
        else if (e.key === 'Escape') { skipNextCommit.current = true; e.target.blur(); }
        onKeyDown?.(e);
      }}
    />
  );
}
