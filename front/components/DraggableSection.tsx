import { useRef } from 'react';
import { useDrag, useDrop } from 'react-dnd';
import { GripVertical } from 'lucide-react';

interface DraggableSectionProps {
  id: string;
  index: number;
  moveSection: (dragIndex: number, hoverIndex: number) => void;
  children: React.ReactNode;
}

const ItemType = 'DASHBOARD_SECTION';

export function DraggableSection({
  id,
  index,
  moveSection,
  children,
}: DraggableSectionProps) {
  const ref = useRef<HTMLDivElement>(null);

  const [{ isDragging }, drag, preview] = useDrag({
    type: ItemType,
    item: { id, index },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  });

  const [{ isOver }, drop] = useDrop({
    accept: ItemType,
    hover: (item: { id: string; index: number }, monitor) => {
      if (!ref.current) {
        return;
      }

      const dragIndex = item.index;
      const hoverIndex = index;

      if (dragIndex === hoverIndex) {
        return;
      }

      const hoverBoundingRect = ref.current?.getBoundingClientRect();
      const hoverMiddleY = (hoverBoundingRect.bottom - hoverBoundingRect.top) / 2;
      const clientOffset = monitor.getClientOffset();
      const hoverClientY = clientOffset!.y - hoverBoundingRect.top;

      if (dragIndex < hoverIndex && hoverClientY < hoverMiddleY) {
        return;
      }

      if (dragIndex > hoverIndex && hoverClientY > hoverMiddleY) {
        return;
      }

      moveSection(dragIndex, hoverIndex);
      item.index = hoverIndex;
    },
    collect: (monitor) => ({
      isOver: monitor.isOver(),
    }),
  });

  preview(drop(ref));

  return (
    <div
      ref={ref}
      className={`relative transition-all ${
        isDragging ? 'opacity-50' : 'opacity-100'
      } ${isOver ? 'scale-[1.02]' : 'scale-100'}`}
    >
      {/* Drag Handle */}
      <div
        ref={drag}
        className="absolute -left-8 top-1/2 -translate-y-1/2 cursor-move opacity-0 hover:opacity-100 transition-opacity z-10 bg-slate-100 rounded p-1 hover:bg-slate-200"
        title="Arrastra para reordenar"
      >
        <GripVertical className="w-4 h-4 text-slate-600" />
      </div>

      {children}
    </div>
  );
}
