export default function Home() {
  return (
    <main style={{ fontFamily: "system-ui", margin: "48px auto", maxWidth: 980, padding: 24 }}>
      <h1>Multichannel Document Intelligence Platform</h1>
      <p>
        Async Node.js and Python platform for document ingestion, extraction evidence, relational
        normalization, and human validation workflows.
      </p>
      <section>
        <h2>Control Plane</h2>
        <ul>
          <li>POST /api/documents validates input, stores metadata, and appends Redis Stream work.</li>
          <li>GET /api/documents/:id returns document status, extraction runs, entities, and claims.</li>
          <li>Python workers consume stream entries and normalize evidence into PostgreSQL.</li>
        </ul>
      </section>
    </main>
  );
}
