import { useCallback, useEffect } from 'react';
import {
  ReactFlow, Background, Controls, MiniMap,
  ConnectionLineType, ConnectionMode,
  useReactFlow, useOnViewportChange,
} from '@xyflow/react';
import { useModelStore } from '../store/modelStore';
import ClassNode from '../nodes/ClassNode';
import ObjectNode from '../nodes/ObjectNode';
import EnumNode from '../nodes/EnumNode';
import RelationEdge from '../edges/RelationEdge';
import LinkEdge from '../edges/LinkEdge';
import SvgMarkers from './SvgMarkers';
import { useDeleteKeyHandler } from '../utils/useDeleteKeyHandler';

const nodeTypes = { classNode: ClassNode, objectNode: ObjectNode, enumNode: EnumNode };
const edgeTypes = { relationEdge: RelationEdge, linkEdge: LinkEdge };

const EDGE_COLORS = { INHERITANCE: '#cc001b', REFERENCE: '#015e1a', COMPOSITION: '#263cff' };

export default function ModelCanvas() {
  const nodes             = useModelStore((s) => s.nodes);
  const edges             = useModelStore((s) => s.edges);
  const onNodesChange     = useModelStore((s) => s.onNodesChange);
  const onEdgesChange     = useModelStore((s) => s.onEdgesChange);
  const mode              = useModelStore((s) => s.mode);
  const pendingEdgeType   = useModelStore((s) => s.pendingEdgeType);
  const pendingRelationId = useModelStore((s) => s.pendingRelationId);
  const setPendingEdgeType  = useModelStore((s) => s.setPendingEdgeType);
  const addRelation       = useModelStore((s) => s.addRelation);
  const addLink           = useModelStore((s) => s.addLink);
  const deleteRelation    = useModelStore((s) => s.deleteRelation);
  const deleteLink        = useModelStore((s) => s.deleteLink);
  const updateLink        = useModelStore((s) => s.updateLink);
  const deleteClass       = useModelStore((s) => s.deleteClass);
  const deleteObject      = useModelStore((s) => s.deleteObject);
  const selectedId        = useModelStore((s) => s.selectedId);
  const selectedType      = useModelStore((s) => s.selectedType);
  const setSelectedId     = useModelStore((s) => s.setSelectedId);
  const metaModel         = useModelStore((s) => s.metaModel);
  const updateRelation    = useModelStore((s) => s.updateRelation);
  const viewports         = useModelStore((s) => s.viewports);
  const saveViewport      = useModelStore((s) => s.saveViewport);
  const currentIMId       = useModelStore((s) => s.instanceModels[s.currentIMIndex]?.id);

  const { setViewport, fitView } = useReactFlow();
  const layoutKey = mode === 'metamodel' ? 'mm' : `im-${currentIMId}`;

  // Drag from handle → connect
  // No sourceHandle/targetHandle stored — React Flow auto-routes based on position
  const onConnect = useCallback((params) => {
    if (mode === 'metamodel') {
      const kind  = pendingEdgeType || 'REFERENCE';
      const relId = addRelation(kind, params.source, params.target, params.sourceHandle, params.targetHandle);
      if (relId !== null) {
        useModelStore.setState((s) => ({
          edges: [...s.edges, {
            id: relId,
            source: params.source, target: params.target,
            sourceHandle: params.sourceHandle,
            targetHandle: params.targetHandle,
            type: 'relationEdge',
            data: { kind },
            markerEnd: kind === 'INHERITANCE'
              ? { type: 'arrowclosed', width: 16, height: 16 }
              : { type: 'arrow', width: 14, height: 14 },
          }],
        }));
      }
      setPendingEdgeType(null);
    } else {
      if (!pendingRelationId) return;
      const rel = metaModel.relations.find((r) => r.id === pendingRelationId);
      if (!rel) return;
      const linkId = addLink(pendingRelationId, params.source, params.target, params.sourceHandle, params.targetHandle);
      useModelStore.setState((s) => ({
        edges: [...s.edges, {
          id: linkId,
          source: params.source, target: params.target,
          sourceHandle: params.sourceHandle,
          targetHandle: params.targetHandle,
          type: 'linkEdge',
          data: { relationId: pendingRelationId, label: rel?.name || rel?.kind || '' },
          markerEnd: { type: 'arrow', width: 14, height: 14 },
        }],
        pendingRelationId: null,
      }));
    }
  }, [mode, pendingEdgeType, pendingRelationId, addRelation, addLink, metaModel.relations, setPendingEdgeType]);

  // Reconnect: drag edge endpoint to a different node/handle
  const onReconnect = useCallback((oldEdge, newConnection) => {
    const patch = {
      source: newConnection.source,
      target: newConnection.target,
      sourceHandle: newConnection.sourceHandle,
      targetHandle: newConnection.targetHandle,
    };
    // updateRelation can reject the reconnect (self-loop, cycle, etc.) — only
    // apply the canvas-side edge patch once the store has actually accepted it.
    const ok = mode === 'metamodel' ? updateRelation(oldEdge.id, patch) : updateLink(oldEdge.id, patch);
    if (ok === false) return;
    useModelStore.setState((s) => ({
      edges: s.edges.map((e) => e.id !== oldEdge.id ? e : { ...e, ...patch }),
    }));
  }, [mode, updateRelation, updateLink]);

  const handleDelete = useCallback(() => {
    if (selectedType === 'edge') {
      if (mode === 'metamodel') deleteRelation(selectedId);
      else deleteLink(selectedId);
    } else if (selectedType === 'node') {
      if (mode === 'metamodel') deleteClass(selectedId);
      else deleteObject(selectedId);
    }
  }, [selectedId, selectedType, mode, deleteRelation, deleteLink, deleteClass, deleteObject]);
  useDeleteKeyHandler(selectedId, handleDelete);

  // Save viewport continuously (on interaction end to avoid thrashing)
  useOnViewportChange({
    onEnd: useCallback((vp) => saveViewport(layoutKey, vp), [layoutKey, saveViewport]),
  });

  // Restore viewport (or fitView first time) whenever the layout key changes
  useEffect(() => {
    const saved = viewports[layoutKey];
    if (saved) {
      setViewport(saved);
    } else {
      const t = setTimeout(() => fitView({ padding: 0.12 }), 50);
      return () => clearTimeout(t);
    }
  }, [layoutKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Pane click clears selection
  const onPaneClick = useCallback(() => setSelectedId(null), [setSelectedId]);

  const connLineColor = pendingEdgeType
    ? (EDGE_COLORS[pendingEdgeType] ?? '#2563eb')
    : '#2563eb';

  return (
    <div style={{ flex: 1, position: 'relative' }}>
      {/* Active tool banner */}
      {(pendingEdgeType || (mode === 'instance' && pendingRelationId)) && (
        <div style={{
          position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)',
          zIndex: 10, color: '#fff', padding: '6px 16px', borderRadius: 20,
          fontSize: 12, fontWeight: 600, boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
          display: 'flex', alignItems: 'center', gap: 8,
          background: pendingEdgeType ? (EDGE_COLORS[pendingEdgeType] ?? '#2563eb') : '#888888',
        }}>
          <span>
            {mode === 'metamodel'
              ? `Drag a handle to draw ${pendingEdgeType?.toLowerCase()} relation`
              : 'Drag a handle to add relation'}
          </span>
          <button
            onClick={() => { setPendingEdgeType(null); useModelStore.setState({ pendingRelationId: null }); }}
            style={{ background: 'rgba(255,255,255,0.25)', border: 'none', borderRadius: 10, color: '#fff', padding: '1px 7px', cursor: 'pointer' }}
          >✕</button>
        </div>
      )}

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onReconnect={onReconnect}
        onPaneClick={onPaneClick}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        connectionMode={ConnectionMode.Loose}
        connectionLineType={ConnectionLineType.SmoothStep}
        connectionLineStyle={{ stroke: connLineColor, strokeWidth: 2, strokeDasharray: '6,3' }}
        deleteKeyCode={null}
        elevateEdgesOnSelect
        edgesReconnectable
        defaultEdgeOptions={{ type: 'relationEdge' }}
      >
        <SvgMarkers />
        <Background color="var(--iml-grid-color)" gap={20} />
        <Controls />
        <MiniMap
          nodeColor='#888888'
          style={{ background: '#f1f5f9', border: '1px solid var(--iml-border)' }}
        />
      </ReactFlow>
    </div>
  );
}
