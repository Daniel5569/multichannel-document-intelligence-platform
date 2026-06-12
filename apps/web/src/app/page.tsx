"use client";

import { useMemo, useState } from "react";

const sampleText = `Claim Number: CLM-2026-1042
Policy Number: POL-88A
Claimant: Ada Morgan
Loss Date: 2026-05-17
Claim Amount: $12,840.50`;

const events = [
  { time: "00:00", event: "document.accepted", detail: "Metadata, checksum, and profile validated" },
  { time: "00:01", event: "worker.claimed", detail: "Redis Stream message claimed by document-engine" },
  { time: "00:03", event: "extraction.completed", detail: "5 entities captured with evidence offsets" },
  { time: "00:05", event: "validation.pending", detail: "Canonical claim routed to reviewer queue" }
];

export default function Home() {
  const [profile, setProfile] = useState("claims");
  const [reviewState, setReviewState] = useState<"needsReview" | "accepted" | "rejected">("needsReview");
  const [content, setContent] = useState(sampleText);

  const entities = useMemo(() => {
    const lines = content.split(/\r?\n/);
    return [
      [
        "Claim",
        lines
          .find((line) => line.toLowerCase().startsWith("claim number"))
          ?.split(":")[1]
          ?.trim() ?? "missing"
      ],
      [
        "Policy",
        lines
          .find((line) => line.toLowerCase().startsWith("policy"))
          ?.split(":")[1]
          ?.trim() ?? "missing"
      ],
      [
        "Claimant",
        lines
          .find((line) => line.toLowerCase().startsWith("claimant"))
          ?.split(":")[1]
          ?.trim() ?? "missing"
      ],
      [
        "Loss date",
        lines
          .find((line) => line.toLowerCase().startsWith("loss date"))
          ?.split(":")[1]
          ?.trim() ?? "missing"
      ]
    ];
  }, [content]);

  return (
    <main className="appShell">
      <section className="topbar" aria-label="Workspace summary">
        <div>
          <p className="eyebrow">Document AI control plane</p>
          <h1>Multichannel Document Intelligence Platform</h1>
          <p className="subtitle">
            Validate incoming document metadata, enqueue extraction jobs, inspect evidence offsets, and route
            low confidence fields into a human review loop.
          </p>
        </div>
        <button className="primaryButton" onClick={() => setReviewState("accepted")} type="button">
          Accept reviewed fields
        </button>
      </section>

      <section className="metricsGrid" aria-label="Pipeline metrics">
        <Metric label="Ingestion status" value="queued" detail="202 response before extraction" />
        <Metric label="Allowed mime types" value="4" detail="txt, pdf, png, jpeg boundary" />
        <Metric label="Pending reclaim" value="60 s" detail="XCLAIM stale-message recovery" />
        <Metric label="Dead-letter stream" value="on" detail="Invalid payloads remain inspectable" />
      </section>

      <section className="workArea">
        <form className="panel formGrid" onSubmit={(event) => event.preventDefault()}>
          <div className="panelHeader">
            <div>
              <p className="eyebrow">Ingestion</p>
              <h2>Document boundary</h2>
            </div>
            <span className={`statePill ${reviewState}`}>{reviewState}</span>
          </div>

          <label className="field">
            <span className="fieldLabel">Extraction profile</span>
            <select value={profile} onChange={(event) => setProfile(event.target.value)}>
              <option value="claims">claims</option>
              <option value="unsupported">unsupported profile</option>
            </select>
          </label>

          <label className="field">
            <span className="fieldLabel">Text body / OCR output</span>
            <textarea value={content} onChange={(event) => setContent(event.target.value)} />
          </label>

          <button
            className="primaryButton"
            onClick={() => setReviewState(profile === "claims" ? "needsReview" : "rejected")}
            type="button"
          >
            Validate and enqueue
          </button>
        </form>

        <section className="panel">
          <div className="panelHeader">
            <div>
              <p className="eyebrow">Extraction evidence</p>
              <h2>Normalized entities</h2>
            </div>
            <span className={`statePill ${profile === "claims" ? "completed" : "failed"}`}>
              {profile === "claims" ? "profile supported" : "blocked"}
            </span>
          </div>

          <div className="entityGrid">
            {entities.map(([label, value]) => (
              <article className="entityTile" key={label}>
                <strong>{value}</strong>
                <span className="fieldLabel">{label}</span>
              </article>
            ))}
          </div>
        </section>

        <aside className="panel">
          <div className="panelHeader">
            <div>
              <p className="eyebrow">Reviewer queue</p>
              <h2>Human validation</h2>
            </div>
          </div>

          <div className="reviewList">
            <article className="reviewCard">
              <small>field correction</small>
              <strong>Claim amount confidence 0.74</strong>
              <p>Reviewer can accept, reject, or correct before canonical claim write.</p>
              <button className="secondaryButton" onClick={() => setReviewState("accepted")} type="button">
                Accept field
              </button>
            </article>
          </div>

          <div className="timeline">
            {events.map((item) => (
              <article className="timelineItem" key={item.event}>
                <span>{item.time}</span>
                <strong>{item.event}</strong>
                <small>{item.detail}</small>
              </article>
            ))}
          </div>
        </aside>
      </section>
    </main>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <article className="metricCard">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}
