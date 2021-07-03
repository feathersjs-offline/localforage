const crypto = require('crypto');
const errors = require('@feathersjs/errors');
const { _ } = require('@feathersjs/commons');
const { sorter, select, AdapterService } = require('@feathersjs/adapter-commons');
const sift = require('sift').default;
const LocalForage = require('localforage');

// const { nfcall, getSelect } = require('./utils');

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
    })
    /*
      .then(res => res)
      .catch(err => {
        throw new Error(`Could not create instance '${this._storageKey}'. err=${JSON.stringify(err)}`);
      });
*/;

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
    if (!this._uId) {
      let keys = [];
      this._storage.keys()
        .then(storageKeys => { keys = storageKeys; })
        .catch(err => {
          throw new Error(`Could not get keys from '${this._storageKey}'. err=${JSON.stringify(err)}`);
        });

      this._uId = 0;

      if (keys.length) {
        this._storage.getItem(keys[keys.length - 1])
          .then(last => {
            // Current id is the id of the last item
            this._uId = typeof last[this.id] !== 'undefined' ? last[this.id] + 1 : this._uId;
          })
          .catch(err => {
            throw new Error(`Serious problem fetching last record (${keys[keys.length - 1]}). err=${JSON.stringify(err)}`);
          });
      }

      this.store = this._storage;
      return this.store;
    }

    return Promise.resolve(this._uId);
  }

  multiOptions (id, params) {
    const { query } = this.filterQuery(params);
    const options = Object.assign({ multi: true }, params.nedb || params.options);

    if (id !== null) {
      options.multi = false;
      query[this.id] = id;
    }

    return { query, options };
  }

  getModel (params) {
    return this._storage;
  }

  async _find (params = {}) {
    console.log(`_find: enter... params=${JSON.stringify(params)}`);
    const self = this;
    const { query, filters, paginate } = self.filterQuery(params);
    console.log(`_find: query=${JSON.stringify(query)}, filters=${JSON.stringify(filters)}, paginate=${JSON.stringify(paginate)}`);
    // let values = _.values(this.store).filter(this.options.matcher(query));
    let keys = await self.getModel(params).keys();
    console.log(`_find: keys=${JSON.stringify(keys)}`);
    // let values = self.getModel(params).keys()
    //   .then(keys => keys.map(async key =>
    //     self.options.matcher(query)(await self.getModel(params).getItem(key))
    //   ));
    let values = [];
    keys = keys.filter(async key => {
      const item = await self.getModel(params).getItem(key);
      console.log(`...: item=${JSON.stringify(item)}`);
      const match = self.options.matcher(query)(item);
      console.log(`...: match=${JSON.stringify(match)}`);
      return match;
    });
    values = await Promise.all(keys.map(key => self.getModel(params).getItem(key)));
    const total = values.length;
    console.log(`_find: values=${JSON.stringify(values)}, total=${total}`);

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

    return this.getModel(params).getItem(id, null /* findOptions */)
      //    return nfcall(this.getModel(params), 'getItem', id, null /* findOptions */)
      .then(item => {
        if (item === null) throw new errors.NotFound(`1No match for query=${JSON.stringify(query)}`);
        console.log(`_get: found item=${JSON.stringify(item)}`);
        const match = self.options.matcher(query)(item);
        if (match) {
          return item;
        } else {
          throw new errors.NotFound(`No match for query=${JSON.stringify(query)}`);
        }
      })
      .catch(err => { throw new errors.NotFound(`yyyNo record found for id '${id}', err=${err.message}`); })
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
      // console.log(`Enter doOne: item = ${JSON.stringify(item)}`);
      return this.getModel(params).setItem(item[this.id], item, null)
        //      nfcall(this.getModel(params), 'setItem', item[this.id], item, null)
        .then(select(params, this.id)(item))
        .then(res => { /* console.log(`Exit doOne: res = ${JSON.stringify(res)}`); */ return res; });
    };

    const val = Array.isArray(data) ? data.map(doOne) : doOne(data);
    // console.log(`_create: res=${JSON.stringify(val)}, data=${JSON.stringify(data)}`);
    return val;
    // return Array.isArray(data) ? data.map(doOne) : doOne(data);
  }

  async _patch (id, data, params = {}) {
    const { query, options } = this.multiOptions(id, params);
    const mapIds = data => data.map(current => current[this.id]);

    // By default we will just query for the one id. For multi patch
    // we create a list of the ids of all items that will be changed
    // to re-query them after the update
    const ids = this._findOrGet(id, Object.assign({}, params, {
      paginate: false
    })).then(result => Array.isArray(result) ? result : [result]).then(mapIds);

    // Run the query
    return ids.then(idList => {
      // Create a new query that re-queries all ids that
      // were originally changed
      const findParams = Object.assign({}, params, {
        query: Object.assign({
          [this.id]: { $in: idList }
        }, query)
      });
      const updateData = Object.keys(data).reduce((result, key) => {
        if (key.indexOf('$') === 0) {
          result[key] = data[key];
        } else if (key !== '_id' && key !== this.id) {
          result.$set[key] = data[key];
        }
        return result;
      }, { $set: {} });

      // return nfcall(this.getModel(params), 'setItem', query, updateData, null, options)
      return this.getModel(params).setItem(query, updateData, null, options)
        .then(() => this._findOrGet(id, findParams));
    }).then(select(params, this.id));
  }

  async _update (id, data, params = {}) {
    const { /* query, */ options } = this.multiOptions(id, params);
    const entry = _.omit(data, this.id);
    entry[this.id] = id;

    // return nfcall(this.getModel(params), 'setItem', query, entry, null, options)
    return this.getModel(params).setItem(id, entry, null, options)
      .then(() => this._findOrGet(id, params))
      .then(select(params, this.id));
  }

  async _remove (id, params = {}) {
    if (id === null && !this.allowsMulti('remove')) { throw new errors.MethodNotAllowed('Multi remove not enabled'); }

    const items = this._findOrGet(id, params);
    if (Array.isArray(items)) {
      return items.map(item => this.getModel(params).removeItem(item[this.id], null)
        .then(() => {
          return item;
        })
        .then(select(params, this.id))
      );
    } else {
      return this.getModel(params).removeItem(items[this.id], null)
        .then(() => {
          return items;
        })
        .then(select(params, this.id));
    }
  }
}

module.exports = function init (options) {
  return new Service(options);
};

module.exports.Service = Service;
