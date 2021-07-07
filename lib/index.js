const errors = require('@feathersjs/errors');
const crypto = require('crypto');
const { _ } = require('@feathersjs/commons');
const { sorter, select, AdapterService } = require('@feathersjs/adapter-commons');
const sift = require('sift').default;
const LocalForage = require('localforage');

const debug = require('debug')('@feathersjs-offline:feather-localforage');

const usedKeys = [];

const _select = (data, ...args) => {
  const base = select(...args);

  return base(JSON.parse(JSON.stringify(data)));
};

// Create the service.
class Service extends AdapterService {
  constructor (options = {}) {
    super(_.extend({
      id: 'id',
      matcher: sift,
      sorter
    }, options));
    this._uId = options.startId || 0;
    this.store = options.store || {};

    this.sanitizeParameters(options);

    debug(`Constructor started:
\t_storageType = ${JSON.stringify(this._storageType)}
\t_version = ${JSON.stringify(this._version)}
\t_storageKey = ${JSON.stringify(this._storageKey)}
\t_storageSize = ${JSON.stringify(this._storageSize)}
\t_reuseKeys = ${JSON.stringify(this._reuseKeys)}\n`);

    this._storage = LocalForage.createInstance({
      driver: this._storageType,
      name: 'feathersjs-offline',
      size: this._storageSize,
      version: this._version,
      storeName: this._storageKey,
      description: 'Created by @feathersjs-offline/feathers-localforage'
    });

    this.checkKeys();

    this.ready();
  }

  sanitizeParameters (options) {
    this._storageKey = options.name || 'feathers';
    this._storageType = options.storage ||
      [LocalForage.INDEXEDDB, LocalForage.WEBSQL, LocalForage.LOCALSTORAGE];
    this._version = options.version || 1.0;

    // Default DB size is _JUST UNDER_ 5MB, as it's the highest size we can use without a prompt.
    this._storageSize = options.storageSize || 4980736;
    this._throttle = options.throttle || 200;
    this._reuseKeys = options.reuseKeys || false;
    this.store = null;
  }

  checkKeys () {
    if (usedKeys.indexOf(this._storageKey) === -1) {
      usedKeys.push(this._storageKey);
    } else {
      if (!this._reuseKeys) { // Allow reuse if options.reuseKeys set to true
        throw new Error(`The storage name '${this._storageKey}' is already in use by another instance.`);
      }
    }
  }

  ready () {
    let keys = [];
    this._uId = 0;

    this._storage.keys()
      .then(storageKeys => { keys = storageKeys; })
      .then(() => {
        if (keys.length) {
          this._storage.getItem(keys[keys.length - 1])
            .then(last => {
              // Current id is the id of the last item
              this._uId = typeof last[this.id] !== 'undefined' ? last[this.id] + 1 : this._uId;
            });
        }
      })
      .catch(err => {
        throw new Error(`Serious problem fetching last record (${keys[keys.length - 1]}). err=${err.message}`);
      });

    this.store = this._storage;

    return Promise.resolve(this._uId);
  }

  // multiOptions (id, params) {
  //   const { query } = this.filterQuery(params);
  //   const options = Object.assign({ multi: true }, params.nedb || params.options);

  //   if (id !== null) {
  //     options.multi = false;
  //     query[this.id] = id;
  //   }

  //   return { query, options };
  // }

  getModel (params) {
    return this._storage;
  }

  async getEntries (params = {}) {
    const { query } = this.filterQuery(params);

    return this._find(Object.assign({}, params, {
      paginate: false,
      query
    }))
      .then(select(params, this.id));
  }

  async _find (params = {}) {
    const self = this;
    const { query, filters, paginate } = self.filterQuery(params);
    // let values = _.values(this.store).filter(this.options.matcher(query));
    let keys = await self.getModel(params).keys();
    // let values = self.getModel(params).keys()
    const asyncFilter = async (arr, predicate) => {
      const results = await Promise.all(arr.map(predicate));

      return arr.filter((_v, index) => results[index]);
    };

    //   .then(keys => keys.map(async key =>
    //     self.options.matcher(query)(await self.getModel(params).getItem(key))
    //   ));
    let values = [];
    keys = await asyncFilter(keys, async key => {
      const item = await self.getModel(params).getItem(key);
      const match = self.options.matcher(query)(item);
      return match;
    });
    values = await Promise.all(keys.map(key => self.getModel(params).getItem(key)));
    const total = values.length;

    if (filters.$sort !== undefined) {
      values.sort(this.options.sorter(filters.$sort));
    }

    if (filters.$skip !== undefined) {
      values = values.slice(filters.$skip);
    }

    if (filters.$limit !== undefined) {
      values = values.slice(0, filters.$limit);
    }

    const result = {
      total,
      limit: filters.$limit,
      skip: filters.$skip || 0,
      data: values.map(value => _select(value, params))
    };

    if (!(paginate && paginate.default)) {
      return result.data;
    }

    return result;
  }

  async _get (id, params = {}) {
    const self = this;
    const { query } = this.filterQuery(params);
    // const findOptions = Object.assign({ $and: [{ [this.id]: id }, query] });

    return this.getModel(params).getItem(id, null)
      .then(item => {
        if (item === null) throw new errors.NotFound(`No match for query=${JSON.stringify(query)}`);

        const match = self.options.matcher(query)(item);
        if (match) {
          return item;
        } else {
          throw new errors.NotFound(`No match for query=${JSON.stringify(query)}`);
        }
      })
      .catch(err => { throw new errors.NotFound(`No record found for id '${id}', err=${err.message}`); })
      .then(select(params, this.id));
  }

  async _findOrGet (id, params = {}) {
    if (id === null) {
      return this._find(_.extend({}, params, {
        paginate: false
      }));
    }

    return this._get(id, params);
  }

  async _create (raw, params = {}) {
    const addId = item => {
      if (this.id !== '_id' && item[this.id] === undefined) {
        return Object.assign({
          [this.id]: crypto.randomBytes(8).toString('hex')
        }, item);
      }

      return item;
    };
    const data = Array.isArray(raw) ? raw.map(addId) : addId(raw);

    const doOne = item => {
      return this.getModel(params).setItem(item[this.id], item, null)
        .then(() => item)
        .then(select(params, this.id));
    };

    return Array.isArray(data) ? Promise.all(data.map(doOne)) : doOne(data);
  }

  async _patch (id, data, params = {}) {
    const self = this;
    const items = await this._findOrGet(id, params);

    const patchEntry = async entry => {
      const currentId = entry[this.id];

      const item = _.extend(entry, _.omit(data, this.id));
      await self.getModel(params).setItem(currentId, item, null);

      return _select(item, params, this.id);
    };

    if (Array.isArray(items)) {
      return Promise.all(items.map(patchEntry));
    } else {
      return patchEntry(items);
    }
  }

  async _update (id, data, params = {}) {
    const item = await this._findOrGet(id, params);
    id = item[this.id];

    const entry = _.omit(data, this.id);
    entry[this.id] = id;

    return this.getModel(params).setItem(id, entry, null)
      .then(() => entry)
      .then(select(params, this.id));
  }

  async _remove (id, params = {}) {
    const items = await this._findOrGet(id, params);
    if (Array.isArray(items)) {
      return Promise.all(items.map(item =>
        this.getModel(params).removeItem(item[this.id], null)
          .then(() => item)
          .then(select(params, this.id))
      ));
    } else {
      return this.getModel(params).removeItem(items[this.id], null)
        .then(() => items)
        .then(select(params, this.id));
    }
  }
}

module.exports = function init (options) {
  return new Service(options);
};

module.exports.Service = Service;
