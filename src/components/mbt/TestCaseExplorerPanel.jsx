import { useModelStore } from '../../store/modelStore';
import { useMbtStore } from '../../store/mbtStore';
import { generateAbstractTestCase } from '../../utils/mbtCodeGen';
import { TEXT, TEXT_DIM } from '../theme';

const BORDER = 'rgba(255,255,255,0.10)';

const STEP_ICON = { timeout: '⏱', signal: '✉' };
const OUTCOME_STYLE = {
  assert:      { color: '#3fb950', label: 'Expected outcome' },
  final:       { color: '#dc2626', label: 'Reaches Final' },
  subsumed:    { color: '#7c3aed', label: 'Already explored' },
  'depth-bound': { color: '#d97706', label: 'Depth limit reached' },
};

function StepBlock({ step, index }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 8,
      padding: '8px 10px', borderRadius: 6,
      background: '#161b22', border: `1px solid ${step.guardFork ? '#d97706' : BORDER}`,
    }}>
      <span style={{ fontSize: 11, color: TEXT_DIM, fontFamily: 'var(--iml-font-mono)', minWidth: 16 }}>{index + 1}.</span>
      <span style={{ fontSize: 13, color: TEXT }}>{STEP_ICON[step.kind] ?? '•'}</span>
      <span style={{ fontSize: 12.5, color: TEXT, flex: 1 }}>{step.label}</span>
      {step.guardFork && <span title="Best-effort — guard outcome not guaranteed" style={{ color: '#d97706', fontSize: 12 }}>⚠</span>}
    </div>
  );
}

export default function TestCaseExplorerPanel() {
  const metaModel = useModelStore((s) => s.metaModel);
  const setResult = useMbtStore((s) => s.setResult);
  const selectedLeafId = useMbtStore((s) => s.selectedLeafId);

  const testCase = (setResult && selectedLeafId)
    ? generateAbstractTestCase(selectedLeafId, setResult, metaModel)
    : null;

  return (
    <div style={{
      width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
      borderRight: `1px solid ${BORDER}`, overflow: 'hidden',
    }}>
      <div style={{
        padding: '10px 14px', borderBottom: `1px solid ${BORDER}`, flexShrink: 0,
        fontSize: 12, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: TEXT_DIM,
      }}>
        Test Case
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {!testCase ? (
          <div style={{ color: TEXT_DIM, fontSize: 13, fontFamily: 'var(--iml-font-sans)' }}>
            Click a leaf in the SET Viewer to select a test case.
          </div>
        ) : (
          <>
            {testCase.guardForkPresent && (
              <div style={{
                fontSize: 11, color: '#d97706', background: 'rgba(217,119,6,0.1)',
                border: '1px solid rgba(217,119,6,0.4)', borderRadius: 5, padding: '6px 8px',
              }}>
                ⚠ Best effort — this path depends on a guard condition that can only be biased via known attribute values, not forced.
              </div>
            )}

            {testCase.steps.length === 0 ? (
              <div style={{ color: TEXT_DIM, fontSize: 12.5, fontStyle: 'italic' }}>No events needed — this is the starting state.</div>
            ) : (
              testCase.steps.map((step, i) => <StepBlock key={i} step={step} index={i} />)
            )}

            <div style={{
              marginTop: 4, padding: '8px 10px', borderRadius: 6,
              background: 'rgba(255,255,255,0.04)',
              border: `1px solid ${OUTCOME_STYLE[testCase.outcome.kind]?.color ?? BORDER}`,
            }}>
              <div style={{
                fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em',
                color: OUTCOME_STYLE[testCase.outcome.kind]?.color ?? TEXT_DIM, marginBottom: 3,
              }}>
                {OUTCOME_STYLE[testCase.outcome.kind]?.label ?? 'Outcome'}
              </div>
              <div style={{ fontSize: 12.5, color: TEXT }}>{testCase.outcome.label}</div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
