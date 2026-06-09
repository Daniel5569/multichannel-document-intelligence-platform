CREATE TABLE IF NOT EXISTS document_sources (
  id BIGSERIAL PRIMARY KEY,
  channel TEXT NOT NULL CHECK (channel IN ('email', 'portal', 'api', 'sftp')),
  external_ref TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (channel, external_ref)
);

CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY,
  source_id BIGINT NOT NULL REFERENCES document_sources(id),
  original_filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued', 'processing', 'completed', 'failed', 'needs_review')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS document_versions (
  id UUID PRIMARY KEY,
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  content_sha256 TEXT NOT NULL,
  text_body TEXT NOT NULL,
  version_number INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (document_id, version_number)
);

CREATE TABLE IF NOT EXISTS ingestion_runs (
  id UUID PRIMARY KEY,
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  version_id UUID NOT NULL REFERENCES document_versions(id) ON DELETE CASCADE,
  extraction_profile TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'failed')),
  risk_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS extracted_entities (
  id BIGSERIAL PRIMARY KEY,
  ingestion_run_id UUID NOT NULL REFERENCES ingestion_runs(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  raw_value TEXT NOT NULL,
  normalized_value TEXT,
  confidence NUMERIC(5,4) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  page_number INTEGER NOT NULL DEFAULT 1,
  evidence_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS canonical_claims (
  id BIGSERIAL PRIMARY KEY,
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  ingestion_run_id UUID NOT NULL REFERENCES ingestion_runs(id) ON DELETE CASCADE,
  claim_number TEXT,
  policy_number TEXT,
  claimant_name TEXT,
  loss_date DATE,
  claim_amount_cents INTEGER,
  currency_code CHAR(3) NOT NULL DEFAULT 'USD',
  mapping_quality TEXT NOT NULL CHECK (mapping_quality IN ('complete', 'partial', 'needs_review')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS validation_events (
  id BIGSERIAL PRIMARY KEY,
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  ingestion_run_id UUID REFERENCES ingestion_runs(id) ON DELETE SET NULL,
  field_name TEXT NOT NULL,
  reviewer_decision TEXT NOT NULL CHECK (reviewer_decision IN ('accepted', 'rejected', 'corrected')),
  previous_value TEXT,
  corrected_value TEXT,
  reviewer_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status);
CREATE INDEX IF NOT EXISTS idx_ingestion_runs_status ON ingestion_runs(status);
CREATE INDEX IF NOT EXISTS idx_extracted_entities_run ON extracted_entities(ingestion_run_id);
CREATE INDEX IF NOT EXISTS idx_canonical_claims_document ON canonical_claims(document_id);

