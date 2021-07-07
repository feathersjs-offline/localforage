const adapterTests = require('@feathersjs/adapter-tests');
const errors = require('@feathersjs/errors');
const feathers = require('@feathersjs/feathers');
// require('fake-indexeddb/auto');
const localStorage = require('localstorage-memory');
global.localStorage = localStorage;

const assert = require('assert');

const service = require('../lib');

const testSuite = adapterTests([
  '.options',
  '.events',
  '._get',
  '._find',
  '._create',
  '._update',
  '._patch',
  '._remove',
  '.get',
  '.get + $select',
  '.get + id + query',
  '.get + NotFound',
  '.find',
  '.remove',
  '.remove + $select',
  '.remove + id + query',
  '.remove + multi',
  '.update',
  '.update + $select',
  '.update + id + query',
  '.update + NotFound',
  '.patch',
  '.patch + $select',
  '.patch + id + query',
  '.patch multiple',
  '.patch multi query',
  '.patch + NotFound',
  '.create',
  '.create + $select',
  '.create multi',
  'internal .find',
  'internal .get',
  'internal .create',
  'internal .update',
  'internal .patch',
  'internal .remove',
  '.find + equal',
  '.find + equal multiple',
  '.find + $sort',
  '.find + $sort + string',
  '.find + $limit',
  '.find + $limit 0',
  '.find + $skip',
  '.find + $select',
  '.find + $or',
  '.find + $in',
  '.find + $nin',
  '.find + $lt',
  '.find + $lte',
  '.find + $gt',
  '.find + $gte',
  '.find + $ne',
  '.find + $gt + $lt + $sort',
  '.find + $or nested + $sort',
  '.find + paginate',
  '.find + paginate + $limit + $skip',
  '.find + paginate + $limit 0',
  '.find + paginate + params',
  '.get + id + query id',
  '.remove + id + query id',
  '.update + id + query id',
  '.patch + id + query id'
]);

describe('Feathers LocalForage Service', () => {
  const events = ['testing'];
  const app = feathers()
    .use('/people', service({ events, name: 'test-storage-1' }))
    .use('/people-customid', service({
      id: 'customid', events, name: 'test-storage-2'
    }));

  describe('Specific adapter tests', () => {
    after(done => {
      console.log('\n');
      done();
    });

    it('is CommonJS compatible', () => {
      assert.strictEqual(typeof require('../lib'), 'function');
    });

    it('throws on name reuse', done => {
      const name = 'test-storage-5';

      assert.throws(() => {
        app.use('service1', service({ name }));
        app.use('service2', service({ name }));
      });

      done();
    });

    it('accepts on name reuse with reuseKeys option set', done => {
      const name = 'test-storage-6';

      let flag = true;
      try {
        app.use('service1', service({ name }));
        app.use('service2', service({ name, reuseKeys: true }));
      } catch (err) {
        flag = false;
      }
      assert.strictEqual(flag, true);

      done();
    });

    it('accepts on name reuse with reuseKeys option set + contents', async () => {
      const name = 'test-storage-7';

      let flag = true;
      try {
        app.use('service1', service({ name }));
        await app.service('service1').create({ name: 'Bond', age: 58 });
        app.use('service2', service({ name, reuseKeys: true }));
      } catch (err) {
        console.log(`Reuse with flag + contents failed. err=${err.name}, message=${err.message}`);
        flag = false;
      }
      assert.strictEqual(flag, true);
    });

    it('create with id set', async () => {
      const service = app.service('people');

      const data = { id: '123', name: 'David', age: 32 };
      let result = {};
      try {
        result = await service.create(data, {});
      } catch (err) {
        assert.strictEqual(false, true, 'Error creating item with id set');
      }

      assert.strictEqual(result.id, data.id, 'Strange difference on "id"');
      assert.strictEqual(result.name, data.name, 'Strange difference on "name"');
      assert.strictEqual(result.age, data.age, 'Strange difference on "age"');
      result = await service.remove(data.id, {});
    });
  });
  describe('getEntries', () => {
    let service = null;
    const serviceName = 'people';
    let doug = {};
    const idProp = 'id';

    after(done => {
      console.log('\n');
      done();
    });

    beforeEach(async () => {
      service = app.service(serviceName);
      doug = await service.create({
        name: 'Doug',
        age: 32
      });
    });

    afterEach(async () => {
      try {
        await service.remove(doug[idProp]);
      } catch (error) { }
    });

    it('getEntries', async () => {
      const data = { id: '123', name: 'David', age: 32 };

      let result = {};
      try {
        await service.create(data, {});
        result = await service.getEntries();
      } catch (err) {
        assert.strictEqual(false, true, 'Error getting all entries');
      }

      assert.strictEqual(result.length, 2, 'Length was expected to be 2');

      result = await service.remove(data.id, {});
    });

    it('getEntries + $select', async () => {
      let result = {};
      try {
        result = await service.getEntries({ query: { $select: ['age'] } });
      } catch (err) {
        assert.strictEqual(false, true, 'Error getting all entries');
      }

      assert.strictEqual(result.length, 1, 'Length was expected to be 1');
      assert.strictEqual(result[0].name, undefined, 'Expected "name" to be undefined');
      assert.strictEqual(result[0].age, doug.age, 'Strange difference on "age"');
    });
  });

  testSuite(app, errors, 'people');
  testSuite(app, errors, 'people-customid', 'customid');
});
