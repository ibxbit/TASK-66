export const SEARCH_DEFAULTS = {
  title: '',
  catalogNumber: '',
  artist: '',
  series: '',
  period: '',
  category: '',
  tags: '',
  periodId: '',
  seriesId: '',
  sort: 'relevance:desc',
  page: '1',
  pageSize: '20'
};

export const HOT_KEYWORD_DEFAULTS = {
  keyword: '',
  rank: '1',
  activeFrom: '2026-01-01T00:00:00Z',
  activeTo: '2027-01-01T00:00:00Z'
};

export const NODE_DEFAULTS = {
  type: 'STAMP',
  label: '',
  metadataText: '{}'
};

export const EDGE_DEFAULTS = {
  fromNodeId: '',
  toNodeId: '',
  relationType: 'INFLUENCED_BY',
  weight: '50',
  constraintsText: '{}'
};
