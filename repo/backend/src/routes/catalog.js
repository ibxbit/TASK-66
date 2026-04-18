const crypto = require('crypto');
const express = require('express');
const CatalogItem = require('../models/catalog-item');
const HotKeyword = require('../models/hot-keyword');
const SearchCache = require('../models/search-cache');
const config = require('../config');
const { sendError } = require('../lib/http');
const { requireAuth, optionalAuth } = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');

const router = express.Router();
const MAX_CATALOG_PAGE_SIZE = 51;

const clampPageSize = (value) => {
  const parsed = Number(value || 20);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return null;
  }
  return Math.min(parsed, MAX_CATALOG_PAGE_SIZE);
};

const parsePage = (value) => {
  const parsed = Number(value || 1);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return null;
  }
  return parsed;
};

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const normalizeText = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const levenshteinDistance = (left, right) => {
  const a = normalizeText(left);
  const b = normalizeText(right);

  if (!a) return b.length;
  if (!b) return a.length;
  if (a === b) return 0;

  const matrix = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i += 1) matrix[i][0] = i;
  for (let j = 0; j <= b.length; j += 1) matrix[0][j] = j;

  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  return matrix[a.length][b.length];
};

const roleScopeFromRequest = (req) => {
  if (!req.auth) return 'ANON';
  const roles = req.auth?.roles || [];
  return [...roles].sort().join('|') || 'NONE';
};

const canonicalQuery = (source) => JSON.stringify(source, Object.keys(source).sort());

const buildCacheKey = (req) => {
  const source = {
    q: req.query.q || '',
    filterCategory: req.query['filter[category]'] || req.query?.filter?.category || '',
    filterTags: req.query['filter[tags]'] || req.query?.filter?.tags || '',
    filterPeriodId: req.query['filter[periodId]'] || req.query?.filter?.periodId || '',
    filterSeriesId: req.query['filter[seriesId]'] || req.query?.filter?.seriesId || '',
    sort: req.query.sort || 'relevance:desc',
    page: req.query.page || 1,
    pageSize: req.query.pageSize || 20
  };

  return crypto.createHash('sha256').update(canonicalQuery(source)).digest('hex');
};

const buildSearchQuery = (req, { includeTextMatch = true } = {}) => {
  const query = { status: 'ACTIVE' };

  const category = req.query['filter[category]'] || req.query?.filter?.category;
  if (category) {
    query.category = category;
  }

  const tagsRaw = req.query['filter[tags]'] || req.query?.filter?.tags;
  if (tagsRaw) {
    const tags = String(tagsRaw)
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    if (tags.length > 0) {
      query.tags = { $all: tags };
    }
  }

  const period = req.query['filter[periodId]'] || req.query?.filter?.periodId;
  if (period) {
    query.period = period;
  }

  const series = req.query['filter[seriesId]'] || req.query?.filter?.seriesId;
  if (series) {
    query.series = series;
  }

  const q = String(req.query.q || '').trim();
  if (includeTextMatch && q) {
    const regex = new RegExp(escapeRegex(q), 'i');
    query.$or = [
      { title: regex },
      { catalog_number: regex },
      { artist: regex },
      { series: regex },
      { country: regex },
      { period: regex },
      { tags: regex }
    ];
  }

  return query;
};

const toCatalogResponseItem = (item) => ({
  id: String(item._id),
  title: item.title,
  catalogNumber: item.catalog_number,
  artist: item.artist,
  series: item.series,
  country: item.country,
  period: item.period,
  category: item.category || null,
  tags: item.tags
});

const compareBySort = (left, right, sort) => {
  if (sort === 'title:asc') {
    return String(left.title || '').localeCompare(String(right.title || ''));
  }
  if (sort === 'period:asc') {
    return String(left.period || '').localeCompare(String(right.period || ''));
  }
  return new Date(right.created_at || 0).getTime() - new Date(left.created_at || 0).getTime();
};

const scoreCatalogItem = (queryText, item) => {
  const query = normalizeText(queryText);
  if (!query) {
    return 0;
  }

  const fields = [
    { value: item.catalog_number, weight: 1.1 },
    { value: item.title, weight: 1 },
    { value: item.artist, weight: 0.95 },
    { value: item.series, weight: 0.9 },
    { value: item.country, weight: 0.8 },
    { value: item.period, weight: 0.8 },
    { value: Array.isArray(item.tags) ? item.tags.join(' ') : '', weight: 0.75 }
  ];

  let bestScore = 0;
  for (const field of fields) {
    const normalized = normalizeText(field.value);
    if (!normalized) {
      continue;
    }

    let score = 0;
    if (normalized === query) {
      score = 100;
    } else if (normalized.startsWith(query)) {
      score = 94;
    } else if (normalized.includes(query)) {
      score = 86;
    } else {
      const distance = levenshteinDistance(query, normalized);
      const maxLen = Math.max(query.length, normalized.length);
      const tolerance = Math.max(1, Math.floor(maxLen * 0.25));
      if (distance <= tolerance) {
        score = 74 - distance * 8;
      } else {
        const words = normalized.split(' ').filter(Boolean);
        for (const word of words) {
          const wordDistance = levenshteinDistance(query, word);
          const wordTolerance = Math.max(1, Math.floor(Math.max(query.length, word.length) * 0.34));
          if (wordDistance <= wordTolerance) {
            score = Math.max(score, 66 - wordDistance * 7);
          }
        }
      }
    }

    bestScore = Math.max(bestScore, score * field.weight);
  }

  return Number(bestScore.toFixed(2));
};

router.get('/search', optionalAuth, async (req, res) => {
  const page = parsePage(req.query.page);
  const pageSizeRaw = Number(req.query.pageSize || 20);
  const pageSize = clampPageSize(req.query.pageSize);

  if (!page || !pageSize || pageSizeRaw > MAX_CATALOG_PAGE_SIZE) {
    return sendError(res, req, 400, 'VALIDATION_ERROR', 'Request validation failed', [
      { field: 'page/pageSize', issue: 'page must be >=1 and pageSize must be <= 51' }
    ]);
  }

  const cacheKey = buildCacheKey(req);
  const roleScope = roleScopeFromRequest(req);
  const now = new Date();

  const cacheHit = await SearchCache.findOne({
    query_hash: cacheKey,
    role_scope: roleScope,
    expires_at: { $gt: now }
  });

  if (cacheHit) {
    cacheHit.hit_count += 1;
    await cacheHit.save();
    return res.status(200).json({
      ...cacheHit.payload,
      meta: { ...(cacheHit.payload.meta || {}), cache: 'HIT' }
    });
  }

  const sort = String(req.query.sort || 'relevance:desc');
  const q = String(req.query.q || '').trim();
  let total = 0;
  let docs = [];

  if (q) {
    const scopedQuery = buildSearchQuery(req, { includeTextMatch: false });
    const candidates = await CatalogItem.find(scopedQuery).limit(500).lean();
    const scored = candidates
      .map((item) => ({ item, relevanceScore: scoreCatalogItem(q, item) }))
      .filter((entry) => entry.relevanceScore > 0);

    if (sort === 'relevance:desc') {
      scored.sort((left, right) => {
        if (right.relevanceScore !== left.relevanceScore) {
          return right.relevanceScore - left.relevanceScore;
        }
        return String(left.item.title || '').localeCompare(String(right.item.title || ''));
      });
    } else {
      scored.sort((left, right) => compareBySort(left.item, right.item, sort));
    }

    total = scored.length;
    docs = scored.slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize).map((entry) => entry.item);
  } else {
    const query = buildSearchQuery(req);
    let sortSpec = { created_at: -1 };
    if (sort === 'title:asc') {
      sortSpec = { title: 1 };
    } else if (sort === 'period:asc') {
      sortSpec = { period: 1 };
    }

    total = await CatalogItem.countDocuments(query);
    docs = await CatalogItem.find(query)
      .sort(sortSpec)
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean();
  }

  const payload = {
    data: docs.map(toCatalogResponseItem),
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize))
    },
    meta: { cache: 'MISS' }
  };

  await SearchCache.updateOne(
    { query_hash: cacheKey, role_scope: roleScope },
    {
      $set: {
        payload,
        expires_at: new Date(Date.now() + config.search.cacheTtlSeconds * 1000),
        updated_at: new Date()
      },
      $setOnInsert: {
        query_hash: cacheKey,
        role_scope: roleScope,
        hit_count: 0,
        created_at: new Date()
      }
    },
    { upsert: true }
  );

  return res.status(200).json(payload);
});

router.get('/autocomplete', async (req, res) => {
  const q = String(req.query.q || '').trim();
  const limit = Number(req.query.limit || 8);

  if (!q || q.length > 64) {
    return sendError(res, req, 400, 'VALIDATION_ERROR', 'Request validation failed', [
      { field: 'q', issue: 'q is required with 1-64 chars' }
    ]);
  }

  if (!Number.isInteger(limit) || limit < 1 || limit > 15) {
    return sendError(res, req, 400, 'VALIDATION_ERROR', 'Request validation failed', [
      { field: 'limit', issue: 'must be 1-15' }
    ]);
  }

  const docs = await CatalogItem.find({ status: 'ACTIVE' })
    .limit(200)
    .lean();

  const scored = [];
  for (const item of docs) {
    const candidates = [
      { type: 'title', value: item.title },
      { type: 'catalogNumber', value: item.catalog_number },
      { type: 'artist', value: item.artist },
      { type: 'series', value: item.series },
      { type: 'period', value: item.period }
    ].filter((c) => c.value);

    for (const candidate of candidates) {
      const score = scoreCatalogItem(q, { ...item, title: candidate.value, catalog_number: candidate.value, artist: candidate.value });
      if (score > 0) {
        scored.push({ ...candidate, score });
      }
    }
  }

  scored.sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score;
    }
    return left.value.localeCompare(right.value);
  });

  const suggestions = [];
  const seen = new Set();
  for (const candidate of scored) {
    const key = `${candidate.type}:${candidate.value}`;
    if (!seen.has(key)) {
      seen.add(key);
      suggestions.push({ type: candidate.type, value: candidate.value });
    }
    if (suggestions.length >= limit) {
      break;
    }
  }

  return res.status(200).json({ data: suggestions });
});

router.get('/hot-keywords', requireAuth, requirePermission('CATALOG_READ'), async (req, res) => {
  const now = new Date();
  const items = await HotKeyword.find({
    status: 'ACTIVE',
    active_from: { $lte: now },
    active_to: { $gte: now }
  })
    .sort({ rank: 1 })
    .lean();

  return res.status(200).json({
    data: items.map((item) => ({
      id: String(item._id),
      keyword: item.keyword,
      rank: item.rank,
      status: item.status,
      activeFrom: item.active_from,
      activeTo: item.active_to
    }))
  });
});

router.post('/hot-keywords', requireAuth, requirePermission('CATALOG_CURATION'), async (req, res) => {
  const { keyword, rank, activeFrom, activeTo } = req.body || {};
  if (!keyword || !rank || !activeFrom || !activeTo) {
    return sendError(res, req, 400, 'VALIDATION_ERROR', 'Request validation failed', [
      { field: 'keyword/rank/activeFrom/activeTo', issue: 'all fields are required' }
    ]);
  }

  const item = await HotKeyword.create({
    keyword,
    rank,
    active_from: new Date(activeFrom),
    active_to: new Date(activeTo),
    curated_by: req.auth.username,
    status: 'ACTIVE'
  });

  return res.status(201).json({
    data: {
      id: String(item._id),
      keyword: item.keyword,
      rank: item.rank,
      activeFrom: item.active_from.toISOString(),
      activeTo: item.active_to.toISOString()
    }
  });
});

router.patch('/hot-keywords/:keywordId', requireAuth, requirePermission('CATALOG_CURATION'), async (req, res) => {
  const updates = {};
  if (req.body.rank !== undefined) updates.rank = req.body.rank;
  if (req.body.activeFrom !== undefined) updates.active_from = new Date(req.body.activeFrom);
  if (req.body.activeTo !== undefined) updates.active_to = new Date(req.body.activeTo);
  if (req.body.status !== undefined) updates.status = req.body.status;

  const item = await HotKeyword.findByIdAndUpdate(req.params.keywordId, updates, { new: true }).lean();
  if (!item) {
    return sendError(res, req, 404, 'NOT_FOUND', 'Keyword not found');
  }

  return res.status(200).json({
    data: {
      id: String(item._id),
      keyword: item.keyword,
      rank: item.rank,
      status: item.status
    }
  });
});

router.delete('/hot-keywords/:keywordId', requireAuth, requirePermission('CATALOG_CURATION'), async (req, res) => {
  const item = await HotKeyword.findByIdAndUpdate(
    req.params.keywordId,
    { status: 'RETIRED' },
    { new: true }
  ).lean();

  if (!item) {
    return sendError(res, req, 404, 'NOT_FOUND', 'Keyword not found');
  }

  return res.status(204).send();
});

router.post('/items', requireAuth, requirePermission('CATALOG_CURATION'), async (req, res) => {
  const requiredFields = ['title', 'catalogNumber', 'artist', 'series', 'country', 'period', 'category'];
  const missing = requiredFields.filter((field) => !req.body?.[field]);
  if (missing.length > 0) {
    return sendError(res, req, 400, 'VALIDATION_ERROR', 'Request validation failed', [
      { field: missing.join(','), issue: 'required fields missing' }
    ]);
  }

  const item = await CatalogItem.create({
    title: req.body.title,
    catalog_number: req.body.catalogNumber,
    artist: req.body.artist,
    series: req.body.series,
    country: req.body.country,
    period: req.body.period,
    category: req.body.category,
    tags: Array.isArray(req.body.tags) ? req.body.tags : [],
    description: req.body.description || '',
    status: 'ACTIVE'
  });

  return res.status(201).json({ data: toCatalogResponseItem(item) });
});

router.patch('/items/:itemId', requireAuth, requirePermission('CATALOG_CURATION'), async (req, res) => {
  const updates = {};
  if (req.body.title !== undefined) updates.title = req.body.title;
  if (req.body.catalogNumber !== undefined) updates.catalog_number = req.body.catalogNumber;
  if (req.body.artist !== undefined) updates.artist = req.body.artist;
  if (req.body.series !== undefined) updates.series = req.body.series;
  if (req.body.country !== undefined) updates.country = req.body.country;
  if (req.body.period !== undefined) updates.period = req.body.period;
  if (req.body.category !== undefined) updates.category = req.body.category;
  if (req.body.tags !== undefined) updates.tags = req.body.tags;
  if (req.body.description !== undefined) updates.description = req.body.description;
  if (req.body.status !== undefined) updates.status = req.body.status;

  const item = await CatalogItem.findByIdAndUpdate(req.params.itemId, updates, { new: true }).lean();
  if (!item) {
    return sendError(res, req, 404, 'NOT_FOUND', 'Catalog item not found');
  }

  return res.status(200).json({ data: toCatalogResponseItem(item) });
});

router.delete('/items/:itemId', requireAuth, requirePermission('CATALOG_CURATION'), async (req, res) => {
  const item = await CatalogItem.findByIdAndUpdate(req.params.itemId, { status: 'ARCHIVED' }, { new: true }).lean();
  if (!item) {
    return sendError(res, req, 404, 'NOT_FOUND', 'Catalog item not found');
  }

  return res.status(204).send();
});

module.exports = router;
