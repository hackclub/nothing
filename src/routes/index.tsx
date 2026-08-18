import { createAsync, type RouteDefinition } from "@solidjs/router";
import { createSignal, onMount, onCleanup, For, Index, type JSX } from "solid-js";
import { getOptionalUser } from "~/api";
import { authClient } from "~/lib/auth-client";

export const route = {
  preload() {
    return getOptionalUser();
  }
} satisfies RouteDefinition;

function rand(min: number, max: number) {
  return Math.random() * (max - min) + min;
}

let nextBubbleId = 0;

type BubbleConfig = {
  id: number;
  size: number;
  top: number;
  left: number;
  duration: number;
  delay: number;
  driftX: number;
  driftY: number;
  glintX: number;
  glintY: number;
  glintSize: number;
  borderAlpha: number;
  fillAlpha: number;
};

function makeBubble(): BubbleConfig {
  return {
    id: nextBubbleId++,
    size: rand(24, 130),
    top: rand(2, 90),
    left: rand(2, 92),
    duration: rand(6, 15),
    delay: rand(-8, 0),
    driftX: rand(-24, 24),
    driftY: rand(-28, 28),
    glintX: rand(15, 45),
    glintY: rand(12, 40),
    glintSize: rand(6, 16),
    borderAlpha: rand(0.18, 0.42),
    fillAlpha: rand(0.03, 0.1)
  };
}

// Tracks pointer offset within an element and turns it into a jelly-like
// scale/rotate/skew transform that snaps back to rest on pointer leave.
// The ambient float/drift animations move bubbles via the standalone CSS
// `translate` property, so this can own `transform` with no conflict.
function createFluidTilt(maxTilt = 10, maxScale = 0.18) {
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

// Drag-to-move + click-to-pop for a bubble that lives in normal document
// flow (not the absolutely-positioned decorative ones). Once popped it stays
// popped for good — no reform, no respawn. The freeze-on-pop capture happens
// imperatively inside `pop()` itself, synchronously, before popping state
// changes — same approach as BgBubble's parent-level freeze (see
// `requestPop` in Home), just triggered locally here since popping is only
// ever decided by this element's own pointer handlers, never externally.
function createBubbleDragPop() {
  const [drag, setDrag] = createSignal({ x: 0, y: 0 });
  const [dragging, setDragging] = createSignal(false);
  const [popping, setPopping] = createSignal(false);
  const [frozenTranslate, setFrozenTranslate] = createSignal<string | null>(null);

  let el: HTMLElement | undefined;
  let start = { x: 0, y: 0, offX: 0, offY: 0 };
  let moved = false;
  let wasLastInteractionDrag = false;

  const setRef = (node: HTMLElement) => {
    el = node;
  };

  const pop = () => {
    if (popping() || !el) return;
    const current = getComputedStyle(el).translate;
    setFrozenTranslate(current === "none" ? "0px 0px" : current);
    setPopping(true);
  };

  const onPointerDown = (e: PointerEvent) => {
    if (popping()) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const cur = drag();
    start = { x: e.clientX, y: e.clientY, offX: cur.x, offY: cur.y };
    moved = false;
    setDragging(true);
  };

  // Returns true if the event was consumed as a drag move (caller should
  // skip feeding it to the hover-tilt handler in that case). The threshold
  // is generous (not a couple px) because a real mouse/trackpad click
  // almost always drifts a few pixels between pointerdown and pointerup —
  // too tight a threshold makes clicks silently fail to pop.
  const onPointerMove = (e: PointerEvent) => {
    if (!dragging()) return false;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (Math.abs(dx) > 10 || Math.abs(dy) > 10) moved = true;
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
  // for elements with a click action — like the login button — that action
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
    frozenTranslate,
    setRef,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    guardClick
  };
}

// One letter of the title, independently draggable/poppable via its own
// createBubbleDragPop instance. `title-letter` is `pointer-events: auto`
// against the title's own `pointer-events: none`, so only the letter glyphs
// themselves — not the whole heading's bounding box — can block a bg-bubble
// hidden behind the title.
function PoppableLetter(props: { char: string }) {
  const dragPop = createBubbleDragPop();

  return (
    <span
      class="title-letter"
      classList={{ "pop-anim": dragPop.popping(), dragging: dragPop.dragging() }}
      ref={dragPop.setRef}
      style={{
        translate: dragPop.popping() ? (dragPop.frozenTranslate() ?? undefined) : undefined,
        transform: `translate(${dragPop.drag().x}px, ${dragPop.drag().y}px)`
      }}
      onPointerDown={dragPop.onPointerDown}
      onPointerMove={dragPop.onPointerMove}
      onPointerUp={dragPop.onPointerUp}
      onPointerCancel={dragPop.onPointerUp}
    >
      {props.char}
    </span>
  );
}

function BgBubble(props: {
  bubble: BubbleConfig;
  popping: () => boolean;
  frozenTranslate: () => string | undefined;
  onRequestPop: (id: number) => void;
  onPopped: (id: number) => void;
  registerEl: (id: number, el: HTMLElement) => void;
  unregisterEl: (id: number) => void;
}) {
  const b = props.bubble;
  const [drag, setDrag] = createSignal({ x: 0, y: 0 });
  const [dragging, setDragging] = createSignal(false);
  const tilt = createFluidTilt(14, 0.24);

  let start = { x: 0, y: 0, offX: 0, offY: 0 };
  let moved = false;

  const onPointerDown = (e: PointerEvent) => {
    if (props.popping()) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const cur = drag();
    start = { x: e.clientX, y: e.clientY, offX: cur.x, offY: cur.y };
    moved = false;
    setDragging(true);
  };

  const onPointerMove = (e: PointerEvent) => {
    if (props.popping()) return;
    if (!dragging()) {
      tilt.onPointerMove(e);
      return;
    }
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (Math.abs(dx) > 10 || Math.abs(dy) > 10) moved = true;
    setDrag({ x: start.offX + dx, y: start.offY + dy });
  };

  const onPointerUp = () => {
    const wasDragging = dragging();
    setDragging(false);
    if (wasDragging && !moved) props.onRequestPop(b.id);
  };

  return (
    <span
      ref={node => {
        props.registerEl(b.id, node);
        onCleanup(() => props.unregisterEl(b.id));
      }}
      class="bg-bubble"
      classList={{ "bg-bubble-pop": props.popping(), dragging: dragging() }}
      style={{
        width: `${b.size}px`,
        height: `${b.size}px`,
        top: `${b.top}%`,
        left: `${b.left}%`,
        "animation-duration": props.popping() ? undefined : `${b.duration}s`,
        "animation-delay": props.popping() ? undefined : `${b.delay}s`,
        "animation-play-state": dragging() ? "paused" : "running",
        "--drift-x": `${b.driftX}px`,
        "--drift-y": `${b.driftY}px`,
        "--glint-x": `${b.glintX}%`,
        "--glint-y": `${b.glintY}%`,
        "--glint-size": `${b.glintSize}%`,
        "--border-alpha": b.borderAlpha,
        "--fill-alpha": b.fillAlpha,
        translate: props.popping() ? props.frozenTranslate() : undefined,
        transform: props.popping()
          ? `translate(${drag().x}px, ${drag().y}px)`
          : `translate(${drag().x}px, ${drag().y}px) ${tilt.transform()}`
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onPointerEnter={tilt.onPointerEnter}
      onPointerLeave={() => {
        if (!dragging()) tilt.onPointerLeave();
      }}
      onAnimationEnd={() => props.popping() && props.onPopped(b.id)}
    />
  );
}

export default function Home() {
  const user = createAsync(async () => getOptionalUser(), { deferStream: true });
  const [bubbles, setBubbles] = createSignal<BubbleConfig[]>([]);
  const [poppingIds, setPoppingIds] = createSignal<ReadonlySet<number>>(new Set());
  const elMap = new Map<number, HTMLElement>();
  // The ambient wander offset (CSS `translate`, driven by the `drift`
  // keyframes) is frozen here, synchronously, at the exact moment a pop is
  // requested — both trigger paths (click and collision) already funnel
  // through this one function. Doing it here instead of reactively (e.g. a
  // createEffect watching a `popping` prop) means there's no dependency on
  // effect-scheduling order relative to the classList/animation swap that
  // also happens when the bubble starts popping; that swap is what resets
  // `translate` to 0, so reading it any later than this risks it already
  // being gone and the bubble visually snapping back to its undrifted spot.
  const frozenTranslates = new Map<number, string>();
  let rafId = 0;

  const requestPop = (id: number) => {
    if (poppingIds().has(id)) return;
    const el = elMap.get(id);
    if (el) {
      const current = getComputedStyle(el).translate;
      frozenTranslates.set(id, current === "none" ? "0px 0px" : current);
    }
    setPoppingIds(prev => new Set(prev).add(id));
  };

  // Once popped, a bubble is gone for good — no respawn.
  const finishPop = (id: number) => {
    setPoppingIds(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    setBubbles(prev => prev.filter(b => b.id !== id));
    frozenTranslates.delete(id);
  };

  onMount(() => {
    setBubbles(Array.from({ length: 10 }, makeBubble));

    // Pop bubbles that visually collide, regardless of whether they got
    // there via ambient drift or a drag. Reads live layout each frame
    // since drift/drag/tilt all move bubbles outside Solid's reactive graph.
    const checkCollisions = () => {
      const entries = [...elMap.entries()].filter(([id]) => !poppingIds().has(id));
      for (let i = 0; i < entries.length; i++) {
        const [idA, elA] = entries[i];
        const rectA = elA.getBoundingClientRect();
        const cxA = rectA.left + rectA.width / 2;
        const cyA = rectA.top + rectA.height / 2;
        const radA = rectA.width / 2;
        for (let j = i + 1; j < entries.length; j++) {
          const [idB, elB] = entries[j];
          const rectB = elB.getBoundingClientRect();
          const cxB = rectB.left + rectB.width / 2;
          const cyB = rectB.top + rectB.height / 2;
          const radB = rectB.width / 2;
          const dist = Math.hypot(cxA - cxB, cyA - cyB);
          if (dist < (radA + radB) * 0.92) {
            requestPop(idA);
            requestPop(idB);
          }
        }
      }
      rafId = requestAnimationFrame(checkCollisions);
    };
    rafId = requestAnimationFrame(checkCollisions);

    // Nested inside onMount (not registered at the top level of the
    // component) so it's never set up during SSR — onCleanup fires on
    // server-side disposal too, and cancelAnimationFrame doesn't exist
    // in that environment, which otherwise hangs the response stream.
    onCleanup(() => {
      cancelAnimationFrame(rafId);
    });
  });

  const ctaTilt = createFluidTilt(6, 0.08);
  const infoTilt = createFluidTilt(4, 0.04);
  const authorTilt = createFluidTilt(4, 0.04);
  const ctaDragPop = createBubbleDragPop();
  const infoDragPop = createBubbleDragPop();
  const authorDragPop = createBubbleDragPop();
  const flagDragPop = createBubbleDragPop();

  return (
    <section class="hero">
      <div class="bg-bubbles" aria-hidden="true">
        <For each={bubbles()}>
          {b => (
            <BgBubble
              bubble={b}
              popping={() => poppingIds().has(b.id)}
              frozenTranslate={() => frozenTranslates.get(b.id)}
              onRequestPop={requestPop}
              onPopped={finishPop}
              registerEl={(id, node) => elMap.set(id, node)}
              unregisterEl={id => elMap.delete(id)}
            />
          )}
        </For>
      </div>

      <img
        src="/flag-standalone-bw.png"
        alt="Hack Club flag"
        class="hero-flag"
        classList={{ "pop-anim": flagDragPop.popping(), dragging: flagDragPop.dragging() }}
        draggable={false}
        ref={flagDragPop.setRef}
        style={{
          translate: flagDragPop.popping() ? (flagDragPop.frozenTranslate() ?? undefined) : undefined,
          transform: `translate(${flagDragPop.drag().x}px, ${flagDragPop.drag().y}px)`
        }}
        onPointerDown={flagDragPop.onPointerDown}
        onPointerMove={flagDragPop.onPointerMove}
        onPointerUp={flagDragPop.onPointerUp}
        onPointerCancel={flagDragPop.onPointerUp}
      />

      <h1 class="hero-title">
        <Index each={"Nothing".split("")}>{char => <PoppableLetter char={char()} />}</Index>
      </h1>

      <div class="bubble-row">
        {user() ? (
          <a
            class="bubble bubble-cta"
            classList={{ "bubble-pop": ctaDragPop.popping(), dragging: ctaDragPop.dragging() }}
            href="/dash"
            ref={ctaDragPop.setRef}
            style={{
              translate: ctaDragPop.popping() ? (ctaDragPop.frozenTranslate() ?? undefined) : undefined,
              transform: ctaDragPop.popping()
                ? `translate(${ctaDragPop.drag().x}px, ${ctaDragPop.drag().y}px)`
                : `translate(${ctaDragPop.drag().x}px, ${ctaDragPop.drag().y}px) ${ctaTilt.transform()}`
            }}
            onPointerDown={ctaDragPop.onPointerDown}
            onPointerMove={e => !ctaDragPop.onPointerMove(e) && ctaTilt.onPointerMove(e)}
            onPointerUp={ctaDragPop.onPointerUp}
            onPointerCancel={ctaDragPop.onPointerUp}
            onPointerEnter={ctaTilt.onPointerEnter}
            onPointerLeave={() => !ctaDragPop.dragging() && ctaTilt.onPointerLeave()}
            onClick={ctaDragPop.guardClick()}
          >
            Go to dashboard
          </a>
        ) : (
          <button
            class="bubble bubble-cta"
            classList={{ "bubble-pop": ctaDragPop.popping(), dragging: ctaDragPop.dragging() }}
            type="button"
            ref={ctaDragPop.setRef}
            style={{
              translate: ctaDragPop.popping() ? (ctaDragPop.frozenTranslate() ?? undefined) : undefined,
              transform: ctaDragPop.popping()
                ? `translate(${ctaDragPop.drag().x}px, ${ctaDragPop.drag().y}px)`
                : `translate(${ctaDragPop.drag().x}px, ${ctaDragPop.drag().y}px) ${ctaTilt.transform()}`
            }}
            onPointerDown={ctaDragPop.onPointerDown}
            onPointerMove={e => !ctaDragPop.onPointerMove(e) && ctaTilt.onPointerMove(e)}
            onPointerUp={ctaDragPop.onPointerUp}
            onPointerCancel={ctaDragPop.onPointerUp}
            onPointerEnter={ctaTilt.onPointerEnter}
            onPointerLeave={() => !ctaDragPop.dragging() && ctaTilt.onPointerLeave()}
            onClick={ctaDragPop.guardClick(() =>
              authClient.signIn.oauth2({
                providerId: "hca",
                callbackURL: "/dash"
              })
            )}
          >
            Login with Hack Club
          </button>
        )}

        <p
          class="bubble bubble-info"
          classList={{ "bubble-pop": infoDragPop.popping(), dragging: infoDragPop.dragging() }}
          ref={infoDragPop.setRef}
          style={{
            translate: infoDragPop.popping() ? (infoDragPop.frozenTranslate() ?? undefined) : undefined,
            transform: infoDragPop.popping()
              ? `translate(${infoDragPop.drag().x}px, ${infoDragPop.drag().y}px)`
              : `translate(${infoDragPop.drag().x}px, ${infoDragPop.drag().y}px) ${infoTilt.transform()}`
          }}
          onPointerDown={infoDragPop.onPointerDown}
          onPointerMove={e => !infoDragPop.onPointerMove(e) && infoTilt.onPointerMove(e)}
          onPointerUp={infoDragPop.onPointerUp}
          onPointerCancel={infoDragPop.onPointerUp}
          onPointerEnter={infoTilt.onPointerEnter}
          onPointerLeave={() => !infoDragPop.dragging() && infoTilt.onPointerLeave()}
        >
          Nothing is a Hack Club program where you ship a project relating to Nothing and get Nothing in return. You can upgrade your nothingness and become the Royal Nothing!
        </p>

        <p
          class="bubble bubble-author"
          classList={{ "bubble-pop": authorDragPop.popping(), dragging: authorDragPop.dragging() }}
          ref={authorDragPop.setRef}
          style={{
            translate: authorDragPop.popping() ? (authorDragPop.frozenTranslate() ?? undefined) : undefined,
            transform: authorDragPop.popping()
              ? `translate(${authorDragPop.drag().x}px, ${authorDragPop.drag().y}px)`
              : `translate(${authorDragPop.drag().x}px, ${authorDragPop.drag().y}px) ${authorTilt.transform()}`
          }}
          onPointerDown={authorDragPop.onPointerDown}
          onPointerMove={e => !authorDragPop.onPointerMove(e) && authorTilt.onPointerMove(e)}
          onPointerUp={authorDragPop.onPointerUp}
          onPointerCancel={authorDragPop.onPointerUp}
          onPointerEnter={authorTilt.onPointerEnter}
          onPointerLeave={() => !authorDragPop.dragging() && authorTilt.onPointerLeave()}
        >
          an amber ysws {"<3"}
        </p>
      </div>
    </section>
  );
}
