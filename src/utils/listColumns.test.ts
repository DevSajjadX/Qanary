import { describe, expect, it } from "vitest";
import { columnCount, toColumns } from "./listColumns";

const list = (name: string, n: number) => ({ name, services: Array(n).fill(0) });
const names = (cols: { name: string }[][]) => cols.map((c) => c.map((l) => l.name));

describe("columnCount", () => {
  it("fits 360px columns with 7px gaps inside 12px edges, at least one, never more than the lists", () => {
    expect(columnCount(460, 5)).toBe(1);
    expect(columnCount(750, 5)).toBe(1);
    expect(columnCount(751, 5)).toBe(2);
    expect(columnCount(1900, 2)).toBe(2);
    expect(columnCount(1900, 0)).toBe(1);
  });
});

describe("toColumns", () => {
  it("puts each list under the shortest column, so a short list doesn't leave a hole", () => {
    const lists = [list("Global", 6), list("Iran", 4), list("test", 0), list("Asdf", 0), list("sdf", 0)];
    expect(names(toColumns(lists, 2))).toEqual([
      ["Global", "Asdf"],
      ["Iran", "test", "sdf"],
    ]);
  });

  it("keeps the order in one column", () => {
    expect(names(toColumns([list("a", 1), list("b", 9)], 1))).toEqual([["a", "b"]]);
  });
});
