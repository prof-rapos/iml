import { useState } from 'react';
import Notification from '../Notification';
import MBTTopbar from './MBTTopbar';
import SETViewerPanel from './SETViewerPanel';
import TestCaseExplorerPanel from './TestCaseExplorerPanel';
import GeneratedCodePanel from './GeneratedCodePanel';
import { useDragResize } from '../../utils/useDragResize';

const HANDLE_STYLE = { width: 4, cursor: 'col-resize', flexShrink: 0, background: 'rgba(255,255,255,0.03)' };

// Panels are deliberately unequal width: the SET Viewer shows a tree with
// per-node attribute-value columns and needs the most room; the code panel
// can scroll horizontally for long lines, so it's fine to be narrowest by
// default. Defaults approximate a 60/20/20 split of the actual viewport
// (not a fixed pixel guess, which looked cramped on wide screens) — both
// boundaries are still user-adjustable via the splitters.
export default function MBTView() {
  const [setViewerWidth, setSetViewerWidth] = useState(() => Math.round((window.innerWidth || 1280) * 0.6));
  const [testCaseWidth, setTestCaseWidth] = useState(() => Math.round((window.innerWidth || 1280) * 0.2));

  const splitter1 = useDragResize({ axis: 'x', size: setViewerWidth, setSize: setSetViewerWidth, min: 300, max: 1400 });
  const splitter2 = useDragResize({ axis: 'x', size: testCaseWidth, setSize: setTestCaseWidth, min: 220, max: 700 });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <Notification />
      <MBTTopbar />
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <div style={{ width: setViewerWidth, flexShrink: 0, overflow: 'hidden' }}>
          <SETViewerPanel />
        </div>
        <div onMouseDown={splitter1.onDragStart} style={HANDLE_STYLE} />
        <div style={{ width: testCaseWidth, flexShrink: 0, overflow: 'hidden' }}>
          <TestCaseExplorerPanel />
        </div>
        <div onMouseDown={splitter2.onDragStart} style={HANDLE_STYLE} />
        <GeneratedCodePanel />
      </div>
    </div>
  );
}
