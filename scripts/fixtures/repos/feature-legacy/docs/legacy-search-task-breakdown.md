```yaml
doc_schema_version: 1
feature: legacy-search
feature_analysis_link: docs/legacy-search-feature-analysis.md
dd_link: docs/legacy-search-DD.md
dev_plan_link: docs/legacy-search-dev-plan.md
qa_handoff_link:
design_reference_status: provided
design_reference_type: figma
design_reference: null
figma_link: https://figma.com/file/abc/Search
platform: react-native
device_type: mobile
status: approved
date: 2025-11-05
```

| id | description | platform | files touched | depends-on | size | acceptance criteria |
|---|---|---|---|---|---|---|
| T1 | Add the query slice | react-native | `src/features/search/searchSlice.ts` | — | S | Query state updates |
| T2 | Add the search screen | react-native | `src/features/search/SearchScreen.tsx` | T1 | M | Results render |
