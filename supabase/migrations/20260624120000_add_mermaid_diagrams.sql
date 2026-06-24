alter table public.diagrams
  add column if not exists diagram_type text not null default 'canvas'
    check (diagram_type in ('canvas', 'mermaid')),
  add column if not exists mermaid_source text;

comment on column public.diagrams.diagram_type is
  'Diagram storage format: canvas for shapes/connections, mermaid for Mermaid.js source.';

comment on column public.diagrams.mermaid_source is
  'Mermaid.js diagram source when diagram_type is mermaid.';
