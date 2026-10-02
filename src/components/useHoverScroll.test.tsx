import { act, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useHoverScroll } from "./useHoverScroll";

function Name({ text }: { text: string }) {
  const { ref, ...hover } = useHoverScroll<HTMLHeadingElement>();
  return (
    <span data-testid="chip" {...hover}>
      <h2 ref={ref}>
        <span>{text}</span>
      </h2>
    </span>
  );
}

/** jsdom does no layout, so say how wide the text run is and how much room its box has. */
function measure(h2: HTMLElement, textWidth: number, clientWidth: number) {
  const run = h2.firstElementChild as HTMLElement;
  run.getBoundingClientRect = () => ({ width: textWidth }) as DOMRect;
  Object.defineProperty(h2, "clientWidth", { configurable: true, value: clientWidth });
}
const shifted = (h2: HTMLElement) => (h2.firstElementChild as HTMLElement).style.transform;

describe("useHoverScroll", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("scrolls a cut-off name to its end on hover and eases back on leave", () => {
    const { getByTestId, container } = render(<Name text="A very long list name indeed" />);
    const h2 = container.querySelector("h2")!;
    measure(h2, 300, 100);

    fireEvent.mouseEnter(getByTestId("chip"));
    expect(h2.style.textOverflow).toBe("clip"); // no ellipsis riding along while it scrolls
    act(() => void vi.advanceTimersByTime(5000));
    expect(shifted(h2)).toBe("translate3d(-200px, 0, 0)"); // text width − room: its last letter is in view

    fireEvent.mouseLeave(getByTestId("chip"));
    act(() => void vi.advanceTimersByTime(1000));
    expect(shifted(h2)).toBe(""); // back at rest
    expect(h2.style.textOverflow).toBe(""); // ellipsis is back
  });

  it("does nothing when the name fits", () => {
    const { getByTestId, container } = render(<Name text="Iran" />);
    const h2 = container.querySelector("h2")!;
    measure(h2, 80, 100);
    fireEvent.mouseEnter(getByTestId("chip"));
    act(() => void vi.advanceTimersByTime(2000));
    expect(shifted(h2)).toBe("");
    expect(h2.style.textOverflow).toBe("");
  });

  it("does nothing for users who asked for reduced motion", () => {
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: q.includes("reduce") }));
    const { getByTestId, container } = render(<Name text="A very long list name indeed" />);
    const h2 = container.querySelector("h2")!;
    measure(h2, 300, 100);
    fireEvent.mouseEnter(getByTestId("chip"));
    act(() => void vi.advanceTimersByTime(5000));
    expect(shifted(h2)).toBe("");
    vi.unstubAllGlobals();
  });
});
