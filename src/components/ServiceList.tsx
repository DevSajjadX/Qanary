import { useEffect, useRef, useState } from "react";
import type { ListStatus } from "../types";
import { ServiceRow } from "./ServiceRow";
import { Icon } from "./Icon";
import { useCollapsible } from "./useCollapsible";
import { useHoverScroll } from "./useHoverScroll";
import type { GripProps } from "../App";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

// Thin sortable shell for service-level drag. Only mounted inside the inner DndContext
// (when reorderMode). Calls useSortable and passes grip props to ServiceRow.
function SortableRow({
  s,
  onRemove,
  onEdit,
}: {
  s: ListStatus["services"][number];
  onRemove: () => Promise<unknown>;
  onEdit: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: s.id });
  const sortStyle = { transform: CSS.Translate.toString(transform), transition };
  return (
    <ServiceRow
      status={s}
      onRemove={onRemove}
      onEdit={onEdit}
      sortRef={setNodeRef}
      sortStyle={sortStyle}
      gripListeners={listeners}
      gripAttributes={attributes}
    />
  );
}

export function ServiceList({
  list,
  reorderMode,
  onReorderServices,
  onRemoveService,
  onRemoveList,
  onEditList,
  onAddService,
  onEditService,
  onCheckService,
  onCheckList,
  onToggleCollapse,
  onEditOrder,
  // Optional sortable props passed from SortableListItem in App.tsx (list-level drag).
  sortRef,
  sortStyle,
  gripListeners,
  gripAttributes,
}: {
  list: ListStatus;
  reorderMode: boolean;
  onReorderServices: (listId: string, newIds: string[]) => void;
  onRemoveService: (listId: string, serviceId: string) => Promise<unknown>;
  onRemoveList: (listId: string) => Promise<unknown>;
  onEditList: (listId: string, name: string, icon: string, critical: boolean) => void;
  onAddService: (listId: string, listName: string) => void;
  onEditService: (listId: string, serviceId: string) => void;
  onCheckService: (listId: string, serviceId: string, endpointId?: string) => void;
  onCheckList: (listId: string) => void;
  onToggleCollapse: (listId: string, collapsed: boolean) => void;
  onEditOrder: () => void;
} & Partial<GripProps>) {
  // "All unreachable" replaces the services-up count when the whole list is down.
  const allDown = list.all_down && list.services.length > 0;
  const critDown = list.critical && allDown;
  const upCount = list.services.filter((s) => s.state !== "down").length;
  const [menuOpen, setMenuOpen] = useState(false);
  // Read from the snapshot, never copied into local state: a remount (entering/leaving reorder
  // mode) would reset a copy to a stale value.
  const collapsed = list.collapsed;
  const [deleteBusy, setDeleteBusy] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { mounted: bodyMounted, anim: bodyAnim } = useCollapsible(!collapsed);
  const nameScroll = useHoverScroll<HTMLElement>();
  // Every service is already being checked: another click on the list name would only queue
  // the same probes again.
  const allChecking =
    list.services.length > 0 &&
    list.services.every((s) => s.endpoints.length > 0 && s.endpoints.every((e) => e.state === "checking"));

  // PointerSensor for inner service-level drag.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  useEffect(() => {
    if (!menuOpen) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

  async function handleDelete() {
    setMenuOpen(false);
    if (!window.confirm(`Delete "${list.name}"?`)) return;
    setDeleteBusy(true);
    try {
      await onRemoveList(list.id);
    } finally {
      setDeleteBusy(false);
    }
  }

  function handleEdit() {
    setMenuOpen(false);
    onEditList(list.id, list.name, list.icon, list.critical);
  }

  function handleToggleCollapse() {
    onToggleCollapse(list.id, !collapsed);
  }

  function handleServiceDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = list.services.findIndex((s) => s.id === active.id);
    const newIndex = list.services.findIndex((s) => s.id === over.id);
    const reordered = arrayMove(list.services, oldIndex, newIndex);
    onReorderServices(list.id, reordered.map((s) => s.id));
  }

  const serviceRows = reorderMode ? (
    <DndContext sensors={sensors} onDragEnd={handleServiceDragEnd}>
      <SortableContext
        items={list.services.map((s) => s.id)}
        strategy={verticalListSortingStrategy}
      >
        {list.services.map((s) => (
          <SortableRow
            key={s.id}
            s={s}
            onRemove={() => onRemoveService(list.id, s.id)}
            onEdit={() => onEditService(list.id, s.id)}
          />
        ))}
        {list.services.length === 0 && (
          <li className="empty">No services yet</li>
        )}
      </SortableContext>
    </DndContext>
  ) : (
    <>
      {list.services.map((s) => (
        <ServiceRow
          key={s.id}
          status={s}
          onRemove={() => onRemoveService(list.id, s.id)}
          onEdit={() => onEditService(list.id, s.id)}
          onCheck={(endpointId) => onCheckService(list.id, s.id, endpointId)}
        />
      ))}
      {list.services.length === 0 && (
        <li className="empty">No services yet</li>
      )}
    </>
  );

  return (
    <section
      className={`list${reorderMode ? " list-reorder" : ""}${collapsed ? " list-collapsed" : ""}`}
      ref={sortRef}
      style={sortStyle}
    >
      <div className="list-head">
        {/* Grip handle: visible only in reorder mode, owns the drag listeners for list-level drag. */}
        {reorderMode && (
          <button
            className="list-grip-btn"
            {...gripListeners}
            {...gripAttributes}
            title="Drag to reorder"
          >
            <Icon name="grip" size={14} />
          </button>
        )}
        {/* One gray frame for every list. Fully down it tints red; a Critical list's turns solid and pulses. */}
        <span
          className={`list-name${reorderMode ? "" : " list-name-check"}${allDown ? " list-name-down" : ""}${critDown ? " list-name-alarm" : ""}`}
          onMouseEnter={nameScroll.onMouseEnter}
          onMouseLeave={nameScroll.onMouseLeave}
          // The whole chip is the target; the button inside is what keyboard users reach (its
          // Enter/Space click bubbles up to here).
          onClick={reorderMode || allChecking ? undefined : () => onCheckList(list.id)}
        >
          {list.icon && <span className="list-name-icon">{list.icon}</span>}
          {/* A long name is cut with an ellipsis; hovering scrolls it to its end. */}
          <h2
            className="list-name-text"
            title={reorderMode ? list.name : `${list.name} — click to check the whole list`}
          >
            {/* The inner element is what is clipped and scrolled on hover (see .list-name-btn). */}
            {reorderMode ? (
              <span className="list-name-clip" ref={nameScroll.ref as React.Ref<HTMLSpanElement>}>
                <span>{list.name}</span>
              </span>
            ) : (
              <button
                type="button"
                className="list-name-btn"
                ref={nameScroll.ref as React.Ref<HTMLButtonElement>}
              >
                {/* The text run: this is what the hover glide moves (see useHoverScroll). */}
                <span>{list.name}</span>
              </button>
            )}
          </h2>
          {/* Critical is a setting, not a problem: a green mark in the chip until the list is down. */}
          {list.critical && (
            <span
              className="list-name-crit"
              role="img"
              aria-label={critDown ? "Critical list is down" : "Critical list"}
              title={critDown ? "Critical list is down" : "Critical list"}
            >
              <Icon name={critDown ? "shield" : "shieldPlain"} size={13} />
            </span>
          )}
        </span>
        {allDown ? (
          <small className="list-count list-count-down" title="Every service in this list is unreachable">
            <span className="list-count-full">All unreachable</span>
            <span className="list-count-short">All down</span>
          </small>
        ) : (
          <small className="list-count" title="Services up">
            {upCount}/{list.services.length}
          </small>
        )}
        {!reorderMode && (
          <button
            className="list-menu-btn"
            onClick={() => onAddService(list.id, list.name)}
            title="Add service"
          >
            <Icon name="plus" />
          </button>
        )}
        {!reorderMode && (
          <div className="list-menu-wrap" ref={menuRef}>
            <button
              className="list-menu-btn"
              onClick={() => setMenuOpen((o) => !o)}
              title="List options"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
            >
              <Icon name="ellipsisHorizontal" />
            </button>
            {menuOpen && (
              <div className="list-dropdown">
                <button className="list-dropdown-item" onClick={handleEdit}>
                  <Icon name="edit" size={15} />
                  Edit
                </button>
                <button
                  className="list-dropdown-item"
                  onClick={() => {
                    setMenuOpen(false);
                    onEditOrder();
                  }}
                >
                  <Icon name="order" size={15} />
                  Edit order
                </button>
                <button
                  className="list-dropdown-item list-dropdown-delete"
                  onClick={handleDelete}
                  disabled={deleteBusy}
                >
                  <Icon name="trash" size={15} />
                  Delete
                </button>
              </div>
            )}
          </div>
        )}
        <button
          className="list-menu-btn list-chevron-btn"
          onClick={handleToggleCollapse}
          title={collapsed ? "Expand" : "Collapse"}
          aria-expanded={!collapsed}
        >
          <Icon name="chevronDown" size={16} strokeWidth={2.7} />
        </button>
      </div>

      {bodyMounted && (
        <div className="collapsible" data-anim={bodyAnim}>
          <div className="collapsible-in">
            <ul className="rows">{serviceRows}</ul>
          </div>
        </div>
      )}
    </section>
  );
}
