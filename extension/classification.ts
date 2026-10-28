export type WebsiteCategory =
  | "Development"
  | "Education"
  | "Productivity"
  | "Social Media"
  | "Entertainment"
  | "News"
  | "Shopping"
  | "Other";

export type CategoryType = "productive" | "distraction" | "neutral";

const CATEGORY_DOMAINS: Record<WebsiteCategory, string[]> = {
  Development: [
    "github.com",
    "gitlab.com",
    "stackoverflow.com",
    "developer.mozilla.org",
    "npmjs.com",
    "vercel.com",
    "docker.com",
    "nodejs.org",
  ],
  Education: [
    "sporcle.com",
    "coursera.org",
    "edx.org",
    "khanacademy.org",
    "wikipedia.org",
    "udemy.com",
    "leetcode.com",
    "geeksforgeeks.org",
  ],
  Productivity: [
    "notion.so",
    "trello.com",
    "asana.com",
    "docs.google.com",
    "drive.google.com",
    "figma.com",
    "linear.app",
  ],
  "Social Media": [
    "instagram.com",
    "facebook.com",
    "reddit.com",
    "x.com",
    "twitter.com",
    "threads.net",
    "linkedin.com",
  ],
  Entertainment: [
    "youtube.com",
    "netflix.com",
    "twitch.tv",
    "spotify.com",
    "pinterest.com",
  ],
  News: [
    "bbc.com",
    "bbc.co.uk",
    "reuters.com",
    "theguardian.com",
    "cnn.com",
    "nytimes.com",
  ],
  Shopping: [
    "amazon.com",
    "amazon.in",
    "flipkart.com",
    "ebay.com",
    "etsy.com",
  ],
  Other: [],
};

export const CATEGORY_TYPE: Record<
  WebsiteCategory,
  CategoryType
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

function matchesDomain(
  domain: string,
  candidate: string
): boolean {
  return domain === candidate || domain.endsWith(`.${candidate}`);
}

export function classifyDomain(
  domain: string
): WebsiteCategory {
  const normalized = domain.toLowerCase().replace(/^www\./, "");

  for (const [category, domains] of Object.entries(
    CATEGORY_DOMAINS
  ) as [WebsiteCategory, string[]][]) {
    if (domains.some(candidate => matchesDomain(normalized, candidate))) {
      return category;
    }
  }

  return "Other";
}

export function getCategoryType(
  category: WebsiteCategory
): CategoryType {
  return CATEGORY_TYPE[category];
}
