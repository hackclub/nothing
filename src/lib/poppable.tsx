import { createSignal, type JSX } from "solid-js";
import { Dynamic } from "solid-js/web";

// Tracks pointer offset within an element and turns it into a jelly-like
// scale/rotate/skew transform that snaps back to rest on pointer leave.
// The ambient float/drift animations move bubbles via the standalone CSS
// `translate` property, so this can own `transform` with no conflict.
export function createFluidTilt(maxTilt = 10, maxScale = 0.18) {
  const [tilt, setTilt] = createSignal({ x: 0, y: 0 });
  const [hovering, setHovering] = createSignal(false);

  const onPointerMove = (e: PointerEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width - 0.5;
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    setTilt({ x: px, y: py });
  };
  const onPointerEnter = () => setHovering(true);
  const onPointerLeave = () => {
    setHovering(false);
    setTilt({ x: 0, y: 0 });
  };

  const transform = () => {
    const t = tilt();
    const wobble = Math.min(Math.hypot(t.x, t.y), 0.75);
    const base = hovering() ? 1 + wobble * maxScale : 1;
    return `scale(${base}) rotate(${t.x * maxTilt}deg) skew(${(-t.y * maxTilt) / 2}deg)`;
  };

  return { transform, onPointerMove, onPointerEnter, onPointerLeave };
}

// Drag-to-move + click-to-pop for an element that lives in normal document
// flow. Once popped it stays popped for good — no reform, no respawn. The
// freeze-on-pop capture happens imperatively inside `pop()` itself,
// synchronously, before popping state changes, since popping here is only
// ever decided by this element's own pointer handlers, never externally
// (contrast with the landing page's collision-driven decorative bubbles,
// which freeze from the parent for that reason — see BgBubble/requestPop
// in src/routes/index.tsx).
export function createBubbleDragPop() {
  const [drag, setDrag] = createSignal({ x: 0, y: 0 });
  const [dragging, setDragging] = createSignal(false);
  const [popping, setPopping] = createSignal(false);
  const [pointerBlocked, setPointerBlocked] = createSignal(false);
  const [frozenTranslate, setFrozenTranslate] = createSignal<string | null>(null);

  let el: HTMLElement | undefined;
  let start = { x: 0, y: 0, offX: 0, offY: 0 };
  let moved = false;
  let wasLastInteractionDrag = false;
  let pointerType: string = "mouse";

  const setRef = (node: HTMLElement) => {
    el = node;
  };

  const pop = () => {
    if (popping() || !el) return;
    const current = getComputedStyle(el).translate;
    setFrozenTranslate(current === "none" ? "0px 0px" : current);
    setPopping(true);
    // Deliberately NOT bundled into the same synchronous update as
    // `popping`: the browser dispatches its synthetic `click` as a separate
    // event right after this `pointerup` handler returns, and if this
    // element is already pointer-events:none by then, that click hit-tests
    // to whatever's underneath instead — silently eating both the pop-click
    // combo action (e.g. login) and plain click-to-navigate links. Desktop
    // mice dodge this by accident (pointer capture retargets `click` to the
    // captured element regardless of pointer-events), but touch has no such
    // save. Deferring one frame lets that click land first.
    requestAnimationFrame(() => setPointerBlocked(true));
  };

  const onPointerDown = (e: PointerEvent) => {
    if (popping()) return;
    // Starting on a real embedded link NESTED inside this element (not the
    // element itself, which is often an <a> in its own right — e.g. the
    // "Go to dashboard" bubble or any Poppable as={A}): don't capture the
    // pointer or start tracking a drag at all. Capturing here would
    // redirect the eventual `click` event to this element instead of the
    // nested anchor, silently swallowing its navigation — so instead, just
    // let the browser handle the whole interaction natively.
    const currentTarget = e.currentTarget as HTMLElement;
    const closestLink = (e.target as HTMLElement | null)?.closest?.("a");
    if (closestLink && closestLink !== currentTarget) return;
    // Touch pointers already get *implicit* capture from the browser — the
    // element that received pointerdown keeps getting pointermove/up for
    // that touch no matter where the finger goes, with no explicit call
    // needed. Mouse pointers have no implicit capture, so they still need
    // the explicit call to keep tracking a drag once the cursor leaves the
    // element.
    if (e.pointerType !== "touch") {
      currentTarget.setPointerCapture(e.pointerId);
    }
    const cur = drag();
    start = { x: e.clientX, y: e.clientY, offX: cur.x, offY: cur.y };
    moved = false;
    pointerType = e.pointerType;
    setDragging(true);
  };

  // Returns true if the event was consumed as a drag move (caller should
  // skip feeding it to the hover-tilt handler in that case). The threshold
  // is generous (not a couple px) because a real mouse/trackpad click
  // almost always drifts a few pixels between pointerdown and pointerup —
  // too tight a threshold makes clicks silently fail to pop. Touch needs an
  // even bigger allowance: a finger drifts far more than a mouse cursor
  // during what's meant to be a tap, and misclassifying that as a drag here
  // makes `guardClick` swallow the click below — which is exactly what made
  // the login button "not work" on mobile while being fine on desktop.
  const onPointerMove = (e: PointerEvent) => {
    if (!dragging()) return false;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    const threshold = pointerType === "touch" ? 24 : 10;
    if (Math.abs(dx) > threshold || Math.abs(dy) > threshold) moved = true;
    setDrag({ x: start.offX + dx, y: start.offY + dy });
    return true;
  };

  const onPointerUp = () => {
    const wasDragging = dragging();
    setDragging(false);
    wasLastInteractionDrag = wasDragging && moved;
    if (wasDragging && !moved) pop();
  };

  // A native `click` still fires after a drag (pointerup lands back on the
  // same captured element regardless of how far the pointer travelled), so
  // for elements with a click action — like a login button — that action
  // needs to be suppressed when the interaction was actually a drag. Wrap
  // the real handler with this instead of using onClick directly.
  const guardClick = (fn?: (e: MouseEvent) => void) => (e: MouseEvent) => {
    if (wasLastInteractionDrag) {
      e.preventDefault();
      return;
    }
    fn?.(e);
  };

  return {
    drag,
    dragging,
    popping,
    pointerBlocked,
    frozenTranslate,
    setRef,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    guardClick
  };
}

// Generic wrapper that makes any element (or component, e.g. solid-router's
// `A`) draggable and poppable, with an optional hover-tilt wobble. Uses the
// standalone `.pop-anim` class (not `.bubble.bubble-pop`) so it works
// regardless of whatever else the element is styled with.
export function Poppable(props: {
  as?: string | ((p: any) => JSX.Element);
  class?: string;
  classList?: Record<string, boolean | undefined>;
  tilt?: boolean;
  tiltStrength?: number;
  tiltScale?: number;
  // Class toggled while popping. Defaults to the standalone `.pop-anim`
  // (equal specificity to `.bubble`'s own `animation: float`, so on a
  // `.bubble`-styled element source order would let float win and the pop
  // would never actually show) — pass "bubble-pop" for elements that also
  // carry the `.bubble` class, matching `.bubble.bubble-pop`'s higher
  // specificity trick used on the landing page.
  popClass?: string;
  onClick?: (e: MouseEvent) => void;
  children: JSX.Element;
  [key: string]: unknown;
}) {
  const {
    as,
    class: className,
    classList: extraClassList,
    tilt: useTilt = true,
    tiltStrength,
    tiltScale,
    popClass = "pop-anim",
    onClick,
    children,
    ...rest
  } = props;
  const dragPop = createBubbleDragPop();
  const tilt = createFluidTilt(tiltStrength ?? 4, tiltScale ?? 0.04);

  return (
    <Dynamic
      component={as ?? "div"}
      {...rest}
      // Belt-and-suspenders when `as` renders an <a> (or any element with a
      // "draggable" default, like <img>): native browser drag-and-drop
      // otherwise hijacks the gesture after the first pointermove, so our
      // own drag logic only ever sees a tiny fraction of the real movement.
      draggable={false}
      class={className ? `poppable ${className}` : "poppable"}
      classList={{
        ...extraClassList,
        [popClass]: dragPop.popping(),
        "pointer-blocked": dragPop.pointerBlocked(),
        dragging: dragPop.dragging()
      }}
      ref={dragPop.setRef}
      style={{
        translate: dragPop.popping() ? (dragPop.frozenTranslate() ?? undefined) : undefined,
        transform: `translate(${dragPop.drag().x}px, ${dragPop.drag().y}px) ${
          useTilt && !dragPop.popping() ? tilt.transform() : ""
        }`
      }}
      onPointerDown={dragPop.onPointerDown}
      onPointerMove={(e: PointerEvent) => {
        if (!dragPop.onPointerMove(e) && useTilt) tilt.onPointerMove(e);
      }}
      onPointerUp={dragPop.onPointerUp}
      onPointerCancel={dragPop.onPointerUp}
      onPointerEnter={useTilt ? tilt.onPointerEnter : undefined}
      onPointerLeave={() => {
        if (!dragPop.dragging() && useTilt) tilt.onPointerLeave();
      }}
      onClick={dragPop.guardClick(onClick)}
    >
      {children}
    </Dynamic>
  );
}
