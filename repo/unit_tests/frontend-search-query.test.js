const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { pathToFileURL } = require('url');

const importModule = async (relativePath) => {
  const absolutePath = path.resolve(__dirname, '..', relativePath);
  return import(pathToFileURL(absolutePath).href);
};

test('search query builder includes supported filters and clamps pageSize to 51', async () => {
  const { buildCatalogSearchQuery } = await importModule('frontend/src/lib/search-query.js');
  const query = buildCatalogSearchQuery({
    title: 'airmail',
    page: '2',
    pageSize: '70',
    sort: 'title:asc',
    category: 'Showcase',
    tags: 'airmail,blue',
    periodId: '1930s',
    seriesId: 'series-a'
  });

  assert.equal(query.q, 'airmail');
  assert.equal(query.page, 2);
  assert.equal(query.pageSize, 51);
  assert.equal(query.sort, 'title:asc');
  assert.equal(query['filter[category]'], 'Showcase');
  assert.equal(query['filter[tags]'], 'airmail,blue');
  assert.equal(query['filter[periodId]'], '1930s');
  assert.equal(query['filter[seriesId]'], 'series-a');
});
