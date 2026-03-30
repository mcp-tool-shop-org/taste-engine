import { describe, it, expect } from "vitest";
import { newId, contentId } from "../../src/core/ids.js";

describe("ids", () => {
  it("newId returns unique UUIDs", () => {
    const a = newId();
    const b = newId();
    expect(a).not.toBe(b);
    expect(a.length).toBe(36); // UUID format
  });

  it("contentId is deterministic for same input", () => {
    const a = contentId("hello world");
    const b = contentId("hello world");
    expect(a).toBe(b);
  });

  it("contentId differs for different input", () => {
    const a = contentId("hello");
    const b = contentId("world");
    expect(a).not.toBe(b);
  });

  it("contentId is 32 chars hex", () => {
    const id = contentId("test");
    expect(id.length).toBe(32);
    expect(/^[0-9a-f]+$/.test(id)).toBe(true);
  });
});
