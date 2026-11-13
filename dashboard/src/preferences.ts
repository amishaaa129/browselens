
export type WebsiteCategory =
  | "Development"
  | "Education"
  | "Productivity"
  | "Social Media"
  | "Entertainment"
  | "News"
  | "Shopping"
  | "Other";

export type ProductivityType =
  | "productive"
  | "distraction"
  | "neutral";

export const CATEGORIES: WebsiteCategory[] = [
  "Development",
  "Education",
  "Productivity",
  "Social Media",
  "Entertainment",
  "News",
  "Shopping",
  "Other",
];

export const DEFAULT_PRODUCTIVITY: Record<
  WebsiteCategory,
  ProductivityType
> = {
  Development: "productive",
  Education: "productive",
  Productivity: "productive",
  "Social Media": "distraction",
  Entertainment: "distraction",
  News: "neutral",
  Shopping: "neutral",
  Other: "neutral",
};

const CATEGORY_OVERRIDES_KEY = "browselens_category_overrides";
const PRODUCTIVITY_RULES_KEY = "browselens_productivity_rules";

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}

export function loadCategoryOverrides():
  Record<string, WebsiteCategory> {
  return readJson(CATEGORY_OVERRIDES_KEY, {});
}

export function saveCategoryOverrides(
  overrides: Record<string, WebsiteCategory>,
): void {
  localStorage.setItem(
    CATEGORY_OVERRIDES_KEY,
    JSON.stringify(overrides),
  );
}

export function loadProductivityRules():
  Record<WebsiteCategory, ProductivityType> {
  return readJson(PRODUCTIVITY_RULES_KEY, DEFAULT_PRODUCTIVITY);
}

export function saveProductivityRules(
  rules: Record<WebsiteCategory, ProductivityType>,
): void {
  localStorage.setItem(
    PRODUCTIVITY_RULES_KEY,
    JSON.stringify(rules),
  );
}

export function resetCategoryOverride(domain: string): void {
  const overrides = loadCategoryOverrides();
  delete overrides[domain];
  saveCategoryOverrides(overrides);
}