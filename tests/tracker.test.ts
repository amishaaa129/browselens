
import { describe, expect, it } from "vitest";
import { createActivity, sanitizeDomain } from "../extension/tracker";

describe("sanitizeDomain", () => {
  it("removes paths, queries, fragments, and www", () => {
    expect(
      sanitizeDomain("https://www.example.com/private?token=123#top")
    ).toBe("example.com");
  });

  it("rejects non-web protocols", () => {
    expect(sanitizeDomain("chrome://settings")).toBeNull();
    expect(sanitizeDomain("file:///secret.txt")).toBeNull();
  });

  it("rejects invalid URLs", () => {
    expect(sanitizeDomain("not a url")).toBeNull();
  });
});

describe("createActivity", () => {
  it("calculates session duration", () => {
    const record = createActivity(
      { domain: "example.com", startedAt: 1000 },
      6000
    );

    expect(record?.durationMs).toBe(5000);
    expect(record?.domain).toBe("example.com");
  });

  it("ignores sessions shorter than one second", () => {
    expect(
      createActivity(
        { domain: "example.com", startedAt: 1000 },
        1500
      )
    ).toBeNull();
  });
});
