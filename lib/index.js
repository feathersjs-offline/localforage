var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
const { sorter, select, AdapterService } = require('@feathersjs/adapter-commons');
const { _ } = require('@feathersjs/commons');
const errors = require('@feathersjs/errors');
const LocalForage = require('localforage');
const sift = require('sift').default;
const stringsToDates = require('./strings-to-dates');
const debug = require('debug')('@feathersjs-offline:feathers-localforage');
const usedKeys = [];
const _select = (data, ...args) => {
    const base = select(...args);
    return base(JSON.parse(JSON.stringify(data)));
};
const validDrivers = {
    'INDEXEDDB': LocalForage.INDEXEDDB,
    'WEBSQL': LocalForage.WEBSQL,
    'LOCALSTORAGE': LocalForage.LOCALSTORAGE
};
// Create the service.
class Service extends AdapterService {
    constructor(options = {}) {
        super(_.extend({
            id: 'id',
            matcher: sift,
            sorter
        }, options));
        this.store = options.store || {};
        this._dates = options.dates || false;
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
        this.checkStoreName();
        // Make a handy suffix primarily for debugging owndata/ownnet
        const self = this;
        this._debugSuffix = self._storageKey.includes('_local') ? '  LOCAL' :
            (self._storageKey.includes('_queue') ? '  QUEUE' : '');
        this.ready();
    }
    sanitizeParameters(options) {
        this._storageKey = options.name || 'feathers';
        let storage = this.options.storage || 'LOCALSTORAGE';
        storage = Array.isArray(storage) ? storage : [storage];
        const ok = storage.reduce((value, s) => value && (s.toUpperCase() in validDrivers), true);
        if (!ok)
            throw new errors.NotAcceptable(`Unknown storage type specified '${this.options.storage}\nPlease use one (or more) of 'websql', 'indexeddb', or 'localstorage'.`);
        this._storageType = storage.map(s => validDrivers[s.toUpperCase()]);
        this._version = options.version || 1.0;
        // Default DB size is _JUST UNDER_ 5MB, as it's the highest size we can use without a prompt.
        this._storageSize = options.storageSize || 4980736;
        this._reuseKeys = options.reuseKeys || false;
        this._id = options.startId || 0;
    }
    checkStoreName() {
        if (usedKeys.indexOf(this._storageKey) === -1) {
            usedKeys.push(this._storageKey);
        }
        else {
            if (!this._reuseKeys) { // Allow reuse if options.reuseKeys set to true
                throw new errors.Forbidden(`The storage name '${this._storageKey}' is already in use by another instance.`);
            }
        }
    }
    ready() {
        return __awaiter(this, void 0, void 0, function* () {
            const self = this;
            // Now pre-load data (if any)
            let keys = Object.keys(this.store);
            yield Promise.all([
                keys.forEach(key => {
                    let id = self.store[key][self.id];
                    id = self.setMax(id);
                    return self.getModel().setItem(String(id), self.store[key]);
                })
            ]);
        });
    }
    getModel() {
        return this._storage;
    }
    getEntries(params = {}) {
        return __awaiter(this, void 0, void 0, function* () {
            debug(`_getEntries(${JSON.stringify(params)})` + this._debugSuffix);
            const { query } = this.filterQuery(params);
            return this._find(Object.assign({}, params, {
                paginate: false,
                query
            }))
                .then(select(params, this.id))
                .then(stringsToDates(this._dates));
        });
    }
    setMax(id) {
        let res = id;
        if (Number.isInteger(id)) {
            this._id = Math.max(Number.parseInt(id), this._id);
        }
        return id;
    }
    _find(params = {}) {
        return __awaiter(this, void 0, void 0, function* () {
            debug(`_find(${JSON.stringify(params)})` + this._debugSuffix);
            const self = this;
            const { query, filters, paginate } = self.filterQuery(params);
            let keys = yield self.getModel().keys();
            // An async equivalent of Array.filter()
            const asyncFilter = (arr, predicate) => __awaiter(this, void 0, void 0, function* () {
                const results = yield Promise.all(arr.map(predicate));
                return arr.filter((_v, index) => results[index]);
            });
            // Determine relevant keys
            keys = yield asyncFilter(keys, (key) => __awaiter(this, void 0, void 0, function* () {
                const item = yield self.getModel().getItem(key);
                const match = self.options.matcher(query)(item);
                return match;
            }));
            // Now retrieve all values
            let values = yield Promise.all(keys.map(key => self.getModel().getItem(key)));
            const total = values.length;
            // Now we sort (if requested)
            if (filters.$sort !== undefined) {
                values.sort(this.options.sorter(filters.$sort));
            }
            // Skip requested items
            if (filters.$skip !== undefined) {
                values = values.slice(filters.$skip);
            }
            // Limit result to specified (or default) length
            if (filters.$limit !== undefined) {
                values = values.slice(0, filters.$limit);
            }
            // If wanted we convert all ISO string dates to Date objects
            values = stringsToDates(this._dates)(values);
            const result = {
                total,
                limit: filters.$limit,
                skip: filters.$skip || 0,
                data: values.map(value => _select(value, params))
            };
            if (!(paginate && paginate.default)) {
                debug(`_find res = ${JSON.stringify(result.data)}`);
                return result.data;
            }
            debug(`_find res = ${JSON.stringify(result)}`);
            return result;
        });
    }
    _get(id, params = {}) {
        return __awaiter(this, void 0, void 0, function* () {
            debug(`_get(${id}, ${JSON.stringify(params)})` + this._debugSuffix);
            const self = this;
            const { query } = this.filterQuery(params);
            return this.getModel().getItem(String(id), null)
                .then(item => {
                if (item === null)
                    throw new errors.NotFound(`No match for query=${JSON.stringify(query)}` + this._debugSuffix);
                const match = self.options.matcher(query)(item);
                if (match) {
                    return item;
                }
                else {
                    throw new errors.NotFound(`No match for query=${JSON.stringify(query)}` + this._debugSuffix);
                }
            })
                .catch(err => { throw new errors.NotFound(`No record found for id '${id}', err=${err.message}` + this._debugSuffix); })
                .then(select(params, this.id))
                .then(stringsToDates(this._dates));
        });
    }
    _findOrGet(id, params = {}) {
        return __awaiter(this, void 0, void 0, function* () {
            debug(`_findOrGet(${id}, ${JSON.stringify(params)})` + this._debugSuffix);
            if (id === null) {
                return this._find(_.extend({}, params, {
                    paginate: false
                }));
            }
            return this._get(id, params);
        });
    }
    _create(raw, params = {}) {
        return __awaiter(this, void 0, void 0, function* () {
            debug(`_create(${JSON.stringify(raw)}, ${JSON.stringify(params)})` + this._debugSuffix);
            const self = this;
            const addId = item => {
                let thisId = item[this.id];
                item[this.id] = thisId !== undefined ? this.setMax(thisId) : ++this._id;
                return item;
            };
            const data = Array.isArray(raw) ? raw.map(addId) : addId(Object.assign({}, raw));
            const doOne = item => {
                return this.getModel().setItem(String(item[this.id]), item, null)
                    .then(() => item)
                    .then(select(params, this.id))
                    .then(stringsToDates(this._dates))
                    .then(item => {
                    return item;
                })
                    .catch(err => {
                    throw new errors.GeneralError(`_create doOne: ERROR: err=${err.name}, ${err.message}`);
                });
            };
            return Array.isArray(data) ? Promise.all(data.map(doOne)) : doOne(data);
        });
    }
    _patch(id, data, params = {}) {
        return __awaiter(this, void 0, void 0, function* () {
            debug(`_patch(${id}, ${JSON.stringify(data)}, ${JSON.stringify(params)})` + this._debugSuffix);
            const self = this;
            const items = yield this._findOrGet(id, params);
            const patchEntry = (entry) => __awaiter(this, void 0, void 0, function* () {
                const currentId = entry[this.id];
                const item = _.extend(entry, _.omit(data, this.id));
                yield self.getModel().setItem(String(currentId), item, null);
                return stringsToDates(this._dates)(_select(item, params, this.id));
            });
            if (Array.isArray(items)) {
                return Promise.all(items.map(patchEntry));
            }
            else {
                return patchEntry(items);
            }
        });
    }
    _update(id, data, params = {}) {
        return __awaiter(this, void 0, void 0, function* () {
            debug(`_update(${id}, ${JSON.stringify(data)}, ${JSON.stringify(params)})` + this._debugSuffix);
            const item = yield this._findOrGet(id, params);
            id = item[this.id];
            const entry = _.omit(data, this.id);
            entry[this.id] = id;
            return this.getModel().setItem(String(id), entry, null)
                .then(() => entry)
                .then(select(params, this.id))
                .then(stringsToDates(this._dates));
        });
    }
    __removeItem(item) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.getModel(null).removeItem(String(item[this.id]), null);
            return item;
        });
    }
    _remove(id, params = {}) {
        return __awaiter(this, void 0, void 0, function* () {
            debug(`_remove(${id}, ${JSON.stringify(params)})` + this._debugSuffix);
            const items = yield this._findOrGet(id, params);
            const self = this;
            if (Array.isArray(items)) {
                return Promise.all(items.map(item => this.__removeItem(item), null))
                    .then(select(params, this.id));
            }
            else {
                return this.__removeItem(items)
                    .then(select(params, this.id));
            }
        });
    }
}
function init(options) {
    return new Service(options);
}
;
module.exports = init;
init.Service = Service;
init.LocalForage = LocalForage;
//# sourceMappingURL=index.js.map