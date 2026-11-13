
import { afterEach, describe, expect, it } from "vitest";
import {
  CATEGORIES,
  DEFAULT_PRODUCTIVITY,
  loadCategoryOverrides,
  saveCategoryOverrides,
  loadProductivityRules,
  saveProductivityRules,
  resetCategoryOverride,
} from "./preferences";

afterEach(() => {
  localStorage.clear();
});

describe("BrowseLens Phase 2 preferences", () => {
  it("defines a productivity rule for every category", () => {
    for (const category of CATEGORIES) {
      expect(DEFAULT_PRODUCTIVITY[category]).toBeDefined();
    }
  });

  it("persists category overrides", () => {
    saveCategoryOverrides({
      "youtube.com": "Education",
    });

    expect(loadCategoryOverrides()["youtube.com"]).toBe("Education");
  });

  it("resets a category override", () => {
    saveCategoryOverrides({
      "youtube.com": "Education",
      "github.com": "Other",
    });

    resetCategoryOverride("youtube.com");

    expect(loadCategoryOverrides()["youtube.com"]).toBeUndefined();
    expect(loadCategoryOverrides()["github.com"]).toBe("Other");
  });

  it("persists custom productivity rules", () => {
    const rules = {
      ...DEFAULT_PRODUCTIVITY,
      Entertainment: "productive" as const,
    };

    saveProductivityRules(rules);

    expect(loadProductivityRules().Entertainment).toBe("productive");
  });
});
