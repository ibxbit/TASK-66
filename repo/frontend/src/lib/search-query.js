import { clampPageSize, parsePositiveInt } from '../validators/forms.js';
import { CATALOG_MAX_PAGE_SIZE } from '../constants/pagination.js';

export const combineCatalogKeywordText = (form) => {
  const parts = [form.title, form.catalogNumber, form.artist, form.series, form.period]
    .map((value) => String(value || '').trim())
    .filter(Boolean);
  return parts.join(' ');
};

export const buildCatalogSearchQuery = (form) => {
  const safePageSize = clampPageSize(form.pageSize, CATALOG_MAX_PAGE_SIZE);
  const combinedQueryText = combineCatalogKeywordText(form);

  const query = {
    q: combinedQueryText,
    page: parsePositiveInt(form.page, 1),
    pageSize: safePageSize,
    sort: form.sort || 'relevance:desc'
  };

  if (form.category) {
    query['filter[category]'] = form.category;
  }
  if (form.tags) {
    query['filter[tags]'] = form.tags;
  }
  if (form.periodId) {
    query['filter[periodId]'] = form.periodId;
  }
  if (form.seriesId) {
    query['filter[seriesId]'] = form.seriesId;
  }

  return query;
};
