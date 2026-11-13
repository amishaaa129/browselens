
import type { ActivityRecord } from "./App";
import {
  CATEGORIES,
  type WebsiteCategory,
  type ProductivityType,
} from "./preferences";

interface Props {
  activities: ActivityRecord[];
  overrides: Record<string, WebsiteCategory>;
  rules: Record<WebsiteCategory, ProductivityType>;
  onCategoryChange: (
    domain: string,
    category: WebsiteCategory,
  ) => void;
  onRuleChange: (
    category: WebsiteCategory,
    type: ProductivityType,
  ) => void;
  onResetCategory: (domain: string) => void;
}

export default function CategoryManager({
  activities,
  overrides,
  rules,
  onCategoryChange,
  onRuleChange,
  onResetCategory,
}: Props) {
  const domains = [...new Set(activities.map(row => row.domain))]
    .sort((a, b) => a.localeCompare(b));

  return (
    <section className="history category-manager">
      <div className="section-heading">
        <div>
          <h2>Manage categories</h2>
          <p>Customize how BrowseLens interprets your browsing.</p>
        </div>
      </div>

      <h3 className="analytics-subheading">Productivity rules</h3>
      <p className="manager-help">
        Choose how each category contributes to your analytics.
      </p>

      <div className="rules-list">
        {CATEGORIES.map(category => (
          <label className="rule-row" key={category}>
            <span>{category}</span>
            <select
              value={rules[category]}
              onChange={event =>
                onRuleChange(
                  category,
                  event.target.value as ProductivityType,
                )
              }
            >
              <option value="productive">Productive</option>
              <option value="distraction">Distraction</option>
              <option value="neutral">Neutral</option>
            </select>
          </label>
        ))}
      </div>

      <h3 className="analytics-subheading">Website categories</h3>

      {domains.length === 0 ? (
        <p className="muted">
          Browse some websites to manage their categories here.
        </p>
      ) : (
        <div className="managed-domains">
          {domains.map(domain => {
            const isCustomized = Boolean(overrides[domain]);

            return (
              <div className="managed-domain" key={domain}>
                <div className="managed-domain-info">
                  <strong>{domain}</strong>
                  <span>
                    {isCustomized ? "Custom category" : "Automatic category"}
                  </span>
                </div>

                <select
                  aria-label={`Category for ${domain}`}
                  value={overrides[domain] ?? ""}
                  onChange={event => {
                    const value = event.target.value;
                    if (value) {
                      onCategoryChange(
                        domain,
                        value as WebsiteCategory,
                      );
                    }
                  }}
                >
                  <option value="" disabled>
                    Choose category
                  </option>
                  {CATEGORIES.map(category => (
                    <option value={category} key={category}>
                      {category}
                    </option>
                  ))}
                </select>

                {isCustomized && (
                  <button
                    className="clear-button"
                    onClick={() => onResetCategory(domain)}
                  >
                    Reset
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
