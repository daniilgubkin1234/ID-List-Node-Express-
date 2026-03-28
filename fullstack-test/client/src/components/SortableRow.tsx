import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

export default function SortableRow({
  id,
  onRemove
}: {
  id: number;
  onRemove: (id: number) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition
  };

  return (
    <div
      ref={setNodeRef}
      className={isDragging ? 'item dragging' : 'item'}
      style={style}
      {...attributes}
      {...listeners}
      title="Drag to reorder"
    >
      <span className="item-id">#{id}</span>
      <button onClick={() => onRemove(id)} title="Remove from selected (batched every 1s)">
        ◀
      </button>
    </div>
  );
}
