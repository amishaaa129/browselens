
import { useMemo } from "react";
import {
  Brain,
  Clock,
  Flame,
  Lightbulb,
  Target,
  TrendingUp,
  Zap,
} from "lucide-react";

import type { ActivityRecord } from "./App";
import type { WebsiteCategory, ProductivityType } from "./preferences";
import {
  generateBrowseLensInsights,
  type CategoryResolver,
} from "./insights";

interface Props {
  activities: ActivityRecord[];
  categoryFor: CategoryResolver;
  productivityRules: Record<WebsiteCategory, ProductivityType>;
}

function formatDuration(ms: number): string {
  const minutes = Math.floor(ms / 60000);
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (hours > 0) return `${hours}h ${remainingMinutes}m`;
  return `${minutes}m`;
}

function getScoreLabel(score: number): string {
  if (score >= 80) return "Excellent";
  if (score >= 60) return "Good";
  if (score >= 40) return "Moderate";
  return "Needs improvement";
}

function getScoreColor(score: number): string {
  if (score >= 80) return "#22c55e";
  if (score >= 60) return "#60a5fa";
  if (score >= 40) return "#f59e0b";
  return "#ef4444";
}

export default function InsightsPanel({
  activities,
  categoryFor,
  productivityRules,
}: Props) {
  const insights = useMemo(
    () =>
      generateBrowseLensInsights(
        activities,
        categoryFor,
        productivityRules
      ),
    [activities, categoryFor, productivityRules]
  );

  const score = insights.focusScore;

  const scoreParts = [
    {
      label: "Productive time",
      value: score.productiveTimeScore,
      weight: "40%",
    },
    {
      label: "Session continuity",
      value: score.sessionContinuityScore,
      weight: "25%",
    },
    {
      label: "Context stability",
      value: score.contextStabilityScore,
      weight: "20%",
    },
    {
      label: "Low distraction",
      value: score.lowDistractionScore,
      weight: "15%",
    },
  ];

  return (
    <section className="insights-panel">
      <div className="section-heading">
        <div>
          <h2>
            <Brain size={20} />
            Intelligent Insights
          </h2>
          <p>Your browsing patterns, analyzed locally</p>
        </div>
        <span className="insights-period">Last 7 days</span>
      </div>

      <div className="insights-score-grid">
        <article className="insight-score-card main-score">
          <div className="insight-card-heading">
            <Target size={20} />
            <span>Today's Focus Score</span>
          </div>

          <div className="score-display">
            <strong style={{ color: getScoreColor(score.score) }}>
              {score.score}
            </strong>
            <span>/100</span>
          </div>

          <div className="score-track">
            <div
              className="score-fill"
              style={{
                width: `${score.score}%`,
                background: getScoreColor(score.score),
              }}
            />
          </div>

          <p className="score-description">
            {getScoreLabel(score.score)}
          </p>
        </article>

        <article className="insight-score-card">
          <div className="insight-card-heading">
            <Clock size={19} />
            <span>Productive time</span>
          </div>
          <strong>
            {formatDuration(insights.today.productiveMs)}
          </strong>
          <p>Today's productive browsing</p>
        </article>

        <article className="insight-score-card">
          <div className="insight-card-heading">
            <Zap size={19} />
            <span>Context switches</span>
          </div>
          <strong>{insights.today.contextSwitches}</strong>
          <p>Estimated domain changes today</p>
        </article>
      </div>

      <article className="insight-section">
        <h3>Focus score breakdown</h3>
        <p className="insight-muted">
          Understand how your score is calculated.
        </p>

        <div className="score-breakdown">
          {scoreParts.map(part => (
            <div className="breakdown-row" key={part.label}>
              <div className="breakdown-label">
                <span>{part.label}</span>
                <span>{part.value}/100 · {part.weight}</span>
              </div>

              <div className="breakdown-track">
                <div
                  className="breakdown-fill"
                  style={{ width: `${part.value}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </article>

      <article className="insight-section">
        <h3>
          <TrendingUp size={18} />
          Weekly focus trend
        </h3>

        <div className="weekly-trend">
          {insights.weeklyTrend.map(day => (
            <div className="trend-day" key={day.date}>
              <span className="trend-score">{day.focusScore}</span>

              <div className="trend-bar-track">
                <div
                  className="trend-bar"
                  style={{ height: `${day.focusScore}%` }}
                  title={`${day.focusScore}/100`}
                />
              </div>

              <span className="trend-label">{day.label}</span>
            </div>
          ))}
        </div>
      </article>

      <div className="insight-two-column">
        <article className="insight-section">
          <h3>
            <Flame size={18} />
            Top distractions
          </h3>

          {insights.topDistractions.length === 0 ? (
            <p className="insight-muted">
              No distracting websites recorded today.
            </p>
          ) : (
            <div className="distraction-list">
              {insights.topDistractions.map((site, index) => (
                <div className="distraction-row" key={site.domain}>
                  <span className="distraction-rank">
                    {index + 1}
                  </span>
                  <span className="distraction-domain">
                    {site.domain}
                  </span>
                  <strong>{formatDuration(site.durationMs)}</strong>
                </div>
              ))}
            </div>
          )}
        </article>

        <article className="insight-section">
          <h3>
            <Clock size={18} />
            Peak productivity hour
          </h3>

          {insights.peakProductivityHour ? (
            <>
              <strong className="peak-hour">
                {insights.peakProductivityHour.label}
              </strong>
              <p className="insight-muted">
                Your most productive browsing hour today.
              </p>
              <p>
                {formatDuration(
                  insights.peakProductivityHour.productiveMs
                )}{" "}
                of productive browsing started during this hour.
              </p>
            </>
          ) : (
            <p className="insight-muted">
              More productive sessions are needed to identify your peak hour.
            </p>
          )}
        </article>
      </div>

      <article className="insight-section recommendations-section">
        <h3>
          <Lightbulb size={18} />
          Personalized recommendations
        </h3>

        <div className="recommendation-list">
          {insights.recommendations.map((recommendation, index) => (
            <div className="recommendation-item" key={index}>
              <span>{index + 1}</span>
              <p>{recommendation}</p>
            </div>
          ))}
        </div>
      </article>

      <p className="insight-privacy-note">
        <Brain size={14} />
        Insights are calculated locally from your recorded browsing metadata.
      </p>
    </section>
  );
}
