import { useEffect, useMemo, useRef, useState } from 'react';
import { HOT_KEYWORD_DEFAULTS, SEARCH_DEFAULTS } from '../constants/defaults';
import { CATALOG_MAX_PAGE_SIZE } from '../constants/pagination';
import { useFormState } from '../hooks/useFormState';
import { buildCatalogSearchQuery, combineCatalogKeywordText } from '../lib/search-query';
import { clampPageSize, parsePositiveInt } from '../validators/forms';

const isQueuedResponse = (response) =>
  response && response.data && response.data.queued === true;

const searchSorts = [
  { value: 'relevance:desc', label: 'Relevance (high to low)' },
  { value: 'title:asc', label: 'Title (A-Z)' },
  { value: 'period:asc', label: 'Period (oldest to newest)' }
];

const normalizeCatalogSearchItems = (payload) => {
  if (Array.isArray(payload)) {
    return payload;
  }
  if (payload && Array.isArray(payload.items)) {
    return payload.items;
  }
  return [];
};

function SearchDiscoveryTab({ apiRequest, csrfToken, canCurateKeywords, setMessage, setError }) {
  const [searchForm, updateSearch, setSearchForm] = useFormState(SEARCH_DEFAULTS);
  const [searchState, setSearchState] = useState({
    status: 'idle',
    items: [],
    pagination: null,
    fromCache: false
  });
  const [searchValidationError, setSearchValidationError] = useState('');
  const [autocompleteState, setAutocompleteState] = useState({ status: 'idle', suggestions: [] });
  const [keywordsState, setKeywordsState] = useState({ status: 'idle', items: [] });
  const [keywordForm, updateKeyword, setKeywordForm] = useFormState(HOT_KEYWORD_DEFAULTS);
  const [editingKeywordId, setEditingKeywordId] = useState('');
  const [pending, setPending] = useState({
    search: false,
    autocomplete: false,
    keywordsLoad: false,
    keywordSave: false,
    keywordDelete: false
  });

  const hasResults = searchState.items.length > 0;
  const searchQueryText = useMemo(() => combineCatalogKeywordText(searchForm), [searchForm]);
  const pageSize = clampPageSize(searchForm.pageSize, CATALOG_MAX_PAGE_SIZE);
  const page = parsePositiveInt(searchForm.page, 1);

  const setPendingState = (key, value) => setPending((prev) => ({ ...prev, [key]: value }));

  const autocompleteTimerRef = useRef(null);
  const loadAutocompleteRef = useRef(null);

  useEffect(() => {
    return () => {
      if (autocompleteTimerRef.current) {
        clearTimeout(autocompleteTimerRef.current);
      }
    };
  }, []);

  const runSearch = async (nextPage) => {
    if (pending.search) {
      return;
    }
    setPendingState('search', true);
    setError('');
    setMessage('');
    setSearchValidationError('');

    const requestedPageSize = Number(searchForm.pageSize || 20);
    if (!Number.isInteger(requestedPageSize) || requestedPageSize < 1) {
      setPendingState('search', false);
      setSearchValidationError('Page size must be a whole number from 1 to 51.');
      return;
    }
    if (requestedPageSize > CATALOG_MAX_PAGE_SIZE) {
      setPendingState('search', false);
      setSearchValidationError('Page size cannot exceed 51.');
      return;
    }

    if (nextPage !== undefined) {
      setSearchForm((prev) => ({ ...prev, page: String(nextPage) }));
    }

    try {
      setSearchState((prev) => ({ ...prev, status: 'loading' }));
      const response = await apiRequest({
        path: '/catalog/search',
        method: 'GET',
        query: buildCatalogSearchQuery({ ...searchForm, page: String(nextPage || page) }),
        allowQueue: false
      });
      const items = normalizeCatalogSearchItems(response.data);
      setSearchState({
        status: items.length > 0 ? 'success' : 'empty',
        items,
        pagination: response.pagination || null,
        fromCache: Boolean(response._meta?.fromCache)
      });
      setMessage(
        items.length > 0
          ? `Loaded ${items.length} results${response._meta?.fromCache ? ' (cache)' : ''}`
          : 'No catalog items matched this query.'
      );
    } catch (err) {
      setSearchState({ status: 'error', items: [], pagination: null, fromCache: false });
      setError(err.message || 'Search failed');
    } finally {
      setPendingState('search', false);
    }
  };

  const loadAutocomplete = async () => {
    if (pending.autocomplete) {
      return;
    }
    setPendingState('autocomplete', true);
    setError('');
    try {
      setAutocompleteState({ status: 'loading', suggestions: [] });
      const q = searchQueryText || searchForm.title || 'a';
      const response = await apiRequest({
        path: '/catalog/autocomplete',
        method: 'GET',
        query: { q, limit: 8 },
        allowQueue: false
      });
      const suggestions = Array.isArray(response.data) ? response.data : [];
      setAutocompleteState({
        status: suggestions.length > 0 ? 'success' : 'empty',
        suggestions
      });
    } catch (err) {
      setAutocompleteState({ status: 'error', suggestions: [] });
      setError(err.message || 'Autocomplete failed');
    } finally {
      setPendingState('autocomplete', false);
    }
  };

  loadAutocompleteRef.current = loadAutocomplete;

  const triggerDebouncedAutocomplete = (value) => {
    if (autocompleteTimerRef.current) {
      clearTimeout(autocompleteTimerRef.current);
    }
    if (!value || value.length < 2) {
      return;
    }
    autocompleteTimerRef.current = setTimeout(() => {
      if (loadAutocompleteRef.current) {
        loadAutocompleteRef.current();
      }
    }, 350);
  };

  const loadHotKeywords = async () => {
    if (pending.keywordsLoad) {
      return;
    }
    setPendingState('keywordsLoad', true);
    setError('');
    try {
      setKeywordsState((prev) => ({ ...prev, status: 'loading' }));
      const response = await apiRequest({ path: '/catalog/hot-keywords', method: 'GET', allowQueue: false });
      const items = Array.isArray(response.data) ? response.data : [];
      setKeywordsState({ status: items.length > 0 ? 'success' : 'empty', items });
    } catch (err) {
      setKeywordsState({ status: 'error', items: [] });
      setError(err.message || 'Failed to load hot keywords');
    } finally {
      setPendingState('keywordsLoad', false);
    }
  };

  const saveKeyword = async () => {
    if (pending.keywordSave) {
      return;
    }
    setPendingState('keywordSave', true);
    setError('');
    setMessage('');

    const payload = {
      keyword: keywordForm.keyword.trim(),
      rank: Number(keywordForm.rank),
      activeFrom: keywordForm.activeFrom,
      activeTo: keywordForm.activeTo
    };

    try {
      let response;
      if (editingKeywordId) {
        response = await apiRequest({
          path: `/catalog/hot-keywords/${editingKeywordId}`,
          method: 'PATCH',
          csrfToken,
          body: {
            rank: payload.rank,
            activeFrom: payload.activeFrom,
            activeTo: payload.activeTo,
            status: 'ACTIVE'
          }
        });
        if (isQueuedResponse(response)) {
          setMessage('Keyword update queued offline. It will sync when back online.');
        } else {
          setMessage('Hot keyword updated');
        }
      } else {
        response = await apiRequest({ path: '/catalog/hot-keywords', method: 'POST', csrfToken, body: payload });
        if (isQueuedResponse(response)) {
          setMessage('Keyword creation queued offline. It will sync when back online.');
        } else {
          setMessage('Hot keyword created');
        }
      }
      setKeywordForm(HOT_KEYWORD_DEFAULTS);
      setEditingKeywordId('');
      if (!isQueuedResponse(response)) {
        await loadHotKeywords();
      }
    } catch (err) {
      setError(err.message || 'Failed to save keyword');
    } finally {
      setPendingState('keywordSave', false);
    }
  };

  const retireKeyword = async (keywordId) => {
    if (pending.keywordDelete) {
      return;
    }
    setPendingState('keywordDelete', true);
    setError('');
    setMessage('');

    try {
      const response = await apiRequest({ path: `/catalog/hot-keywords/${keywordId}`, method: 'DELETE', csrfToken });
      if (isQueuedResponse(response)) {
        setMessage('Keyword retirement queued offline. It will sync when back online.');
      } else {
        setMessage('Hot keyword retired');
        if (keywordId === editingKeywordId) {
          setEditingKeywordId('');
          setKeywordForm(HOT_KEYWORD_DEFAULTS);
        }
        await loadHotKeywords();
      }
    } catch (err) {
      setError(err.message || 'Failed to retire keyword');
    } finally {
      setPendingState('keywordDelete', false);
    }
  };

  const beginEditKeyword = (item) => {
    setEditingKeywordId(item.id);
    setKeywordForm({
      keyword: item.keyword,
      rank: String(item.rank),
      activeFrom: item.activeFrom || HOT_KEYWORD_DEFAULTS.activeFrom,
      activeTo: item.activeTo || HOT_KEYWORD_DEFAULTS.activeTo
    });
  };

  return (
    <article className="card">
      <h2>Search & Discovery</h2>
      <p className="small">Search across title, catalog number, artist, series, and period with curator filters, sort, and pagination.</p>

      <section className="route-block">
        <h3>Query Fields</h3>
        <div className="row wrap">
          <input value={searchForm.title} onChange={(e) => { updateSearch('title', e.target.value); triggerDebouncedAutocomplete(e.target.value); }} placeholder="title" />
          <input value={searchForm.catalogNumber} onChange={(e) => updateSearch('catalogNumber', e.target.value)} placeholder="catalog number" />
          <input value={searchForm.artist} onChange={(e) => updateSearch('artist', e.target.value)} placeholder="artist" />
          <input value={searchForm.series} onChange={(e) => updateSearch('series', e.target.value)} placeholder="series" />
          <input value={searchForm.period} onChange={(e) => updateSearch('period', e.target.value)} placeholder="period" />
        </div>

        <h3>Filters and Sort</h3>
        <div className="row wrap">
          <input value={searchForm.category} onChange={(e) => updateSearch('category', e.target.value)} placeholder="category filter" />
          <input value={searchForm.tags} onChange={(e) => updateSearch('tags', e.target.value)} placeholder="tags (comma separated)" />
          <input value={searchForm.periodId} onChange={(e) => updateSearch('periodId', e.target.value)} placeholder="period id" />
          <input value={searchForm.seriesId} onChange={(e) => updateSearch('seriesId', e.target.value)} placeholder="series id" />
          <select value={searchForm.sort} onChange={(e) => updateSearch('sort', e.target.value)}>
            {searchSorts.map((item) => (
              <option key={item.value} value={item.value}>{item.label}</option>
            ))}
          </select>
          <input value={searchForm.page} onChange={(e) => updateSearch('page', e.target.value)} placeholder="page" />
          <input
            value={searchForm.pageSize}
            onChange={(e) => {
              updateSearch('pageSize', e.target.value);
              setSearchValidationError('');
            }}
            placeholder="page size (max 51)"
          />
          <button onClick={() => runSearch(1)} disabled={pending.search}>{pending.search ? 'Searching...' : 'Search'}</button>
          <button onClick={loadAutocomplete} disabled={pending.autocomplete}>{pending.autocomplete ? 'Loading...' : 'Autocomplete'}</button>
          <button onClick={loadHotKeywords} disabled={pending.keywordsLoad}>{pending.keywordsLoad ? 'Loading...' : 'Load Hot Keywords'}</button>
        </div>
        {searchValidationError ? <p className="notice err">{searchValidationError}</p> : null}
        <p className="small">Combined fuzzy query: {searchQueryText || 'none'} | pageSize: {pageSize}</p>
      </section>

      <section className="route-block">
        <h3>Results</h3>
        {searchState.status === 'loading' ? <p className="small">Loading catalog results...</p> : null}
        {searchState.status === 'error' ? <p className="small">Search failed. Review the error and retry.</p> : null}
        {searchState.status === 'empty' ? <p className="small">No results found for this query.</p> : null}
        {searchState.status === 'success' && hasResults ? (
          <div>
            <p className="small">
              Loaded {searchState.items.length} items on page {searchState.pagination?.page || page} of {searchState.pagination?.totalPages || 1}
              {searchState.fromCache ? ' (cache)' : ''}
            </p>
            <table className="segment-table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Catalog #</th>
                  <th>Artist</th>
                  <th>Series</th>
                  <th>Period</th>
                  <th>Category/Tags</th>
                </tr>
              </thead>
              <tbody>
                {searchState.items.map((item) => (
                  <tr key={item.id}>
                    <td>{item.title}</td>
                    <td>{item.catalogNumber}</td>
                    <td>{item.artist}</td>
                    <td>{item.series}</td>
                    <td>{item.period}</td>
                    <td>{item.category || '-'} {(item.tags || []).join(', ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="row wrap">
              <button
                onClick={() => runSearch(Math.max(1, (searchState.pagination?.page || page) - 1))}
                disabled={pending.search || (searchState.pagination?.page || page) <= 1}
              >
                Prev
              </button>
              <button
                onClick={() => runSearch((searchState.pagination?.page || page) + 1)}
                disabled={pending.search || (searchState.pagination?.page || page) >= (searchState.pagination?.totalPages || 1)}
              >
                Next
              </button>
            </div>
          </div>
        ) : null}
      </section>

      <section className="route-block">
        <h3>Autocomplete</h3>
        {autocompleteState.status === 'loading' ? <p className="small">Loading suggestions...</p> : null}
        {autocompleteState.status === 'empty' ? <p className="small">No autocomplete suggestions.</p> : null}
        {autocompleteState.status === 'success' ? (
          <ul>
            {autocompleteState.suggestions.map((item, index) => (
              <li key={`${item.type}-${item.value}-${index}`}>
                <button
                  className="ghost"
                  onClick={() => {
                    updateSearch(item.type === 'catalogNumber' ? 'catalogNumber' : item.type, item.value);
                    setMessage(`Applied autocomplete suggestion: ${item.value}`);
                  }}
                >
                  {item.value} <span className="small">({item.type})</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="route-block">
        <h3>Hot Keywords</h3>
        {keywordsState.status === 'loading' ? <p className="small">Loading hot keywords...</p> : null}
        {keywordsState.status === 'empty' ? <p className="small">No active hot keywords.</p> : null}
        {keywordsState.status === 'success' ? (
          <ul>
            {keywordsState.items.map((item) => (
              <li key={item.id || `${item.keyword}-${item.rank}`}>
                <button className="ghost" onClick={() => updateSearch('title', item.keyword)}>{item.keyword}</button>
                <span className="small"> rank {item.rank}</span>
                {canCurateKeywords && item.id ? (
                  <>
                    <button onClick={() => beginEditKeyword(item)}>Edit</button>
                    <button onClick={() => retireKeyword(item.id)} disabled={pending.keywordDelete}>Retire</button>
                  </>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}

        {canCurateKeywords ? (
          <div className="route-block">
            <h3>{editingKeywordId ? 'Edit Keyword' : 'Create Keyword'}</h3>
            <div className="row wrap">
              <input
                value={keywordForm.keyword}
                onChange={(e) => updateKeyword('keyword', e.target.value)}
                placeholder="keyword"
                disabled={Boolean(editingKeywordId)}
              />
              <input value={keywordForm.rank} onChange={(e) => updateKeyword('rank', e.target.value)} placeholder="rank" />
              <input value={keywordForm.activeFrom} onChange={(e) => updateKeyword('activeFrom', e.target.value)} placeholder="active from" />
              <input value={keywordForm.activeTo} onChange={(e) => updateKeyword('activeTo', e.target.value)} placeholder="active to" />
              <button onClick={saveKeyword} disabled={pending.keywordSave}>{pending.keywordSave ? 'Saving...' : 'Save Keyword'}</button>
              {editingKeywordId ? (
                <button
                  className="ghost"
                  onClick={() => {
                    setEditingKeywordId('');
                    setKeywordForm(HOT_KEYWORD_DEFAULTS);
                  }}
                >
                  Cancel Edit
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
      </section>
    </article>
  );
}

export default SearchDiscoveryTab;
