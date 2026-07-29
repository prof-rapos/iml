import { useState } from 'react';
import { useModelStore } from '../../store/modelStore';
import { useMbtStore } from '../../store/mbtStore';
import { generateConcreteTestFiles } from '../../utils/mbtCodeGen';
import CodeEditor from '../ide/CodeEditor';
import IDETerminal from '../ide/IDETerminal';
import { TEXT_DIM } from '../theme';

const EMPTY_STATE_STYLE = {
  flex: 1, minWidth: 320, display: 'flex', alignItems: 'center', justifyContent: 'center',
  padding: 24, color: TEXT_DIM, fontSize: 13, fontFamily: 'var(--iml-font-sans)', textAlign: 'center',
};

// Generates the test bundle once per mount (lazy useState initializer) and
// holds it as locally-editable state — keyed by leaf id in the parent, so a
// new leaf selection remounts this fresh instead of needing an effect to
// resync derived state (the idiomatic React alternative to the
// effect+setState pattern for "reset on id change").
function GeneratedTestEditor({ selectedLeafId, setResult, cls, metaModel }) {
  const [generated] = useState(() => generateConcreteTestFiles(selectedLeafId, setResult, cls, metaModel));
  const [files, setFiles] = useState(() => generated?.files ?? []);

  if (!generated) {
    return (
      <div style={EMPTY_STATE_STYLE}>
        This path hit the exploration depth limit and has no fixed endpoint, so no concrete test is generated for it — still browsable in the SET Viewer.
      </div>
    );
  }

  const handleContentChange = (path, content) => {
    setFiles((prev) => prev.map((f) => (f.path === path ? { ...f, content } : f)));
  };

  return (
    <div style={{ flex: 1, minWidth: 320, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <CodeEditor files={files} activeFilePath={generated.mainClassPath} onContentChange={handleContentChange} />
      </div>
      <IDETerminal files={files} />
    </div>
  );
}

// Panel 3: the generated Java test on top (CodeEditor, single-file mode —
// the compile bundle includes Module 3's whole capsule/runtime output, but
// only the test file is shown/active) and an embedded run terminal on the
// bottom (IDETerminal reused as-is; it derives its own runnable main class
// from `files`, and the bundle only ever has one — the generated test).
export default function GeneratedCodePanel() {
  const metaModel      = useModelStore((s) => s.metaModel);
  const capsuleId      = useMbtStore((s) => s.capsuleId);
  const setResult      = useMbtStore((s) => s.setResult);
  const selectedLeafId = useMbtStore((s) => s.selectedLeafId);

  if (!selectedLeafId || !setResult || !capsuleId) {
    return <div style={EMPTY_STATE_STYLE}>Select a leaf to see its generated Java test.</div>;
  }
  const cls = metaModel.classes.find((c) => c.id === capsuleId);
  if (!cls) return <div style={EMPTY_STATE_STYLE}>Select a leaf to see its generated Java test.</div>;

  return (
    <GeneratedTestEditor
      key={selectedLeafId}
      selectedLeafId={selectedLeafId}
      setResult={setResult}
      cls={cls}
      metaModel={metaModel}
    />
  );
}
