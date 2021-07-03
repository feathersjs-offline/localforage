# \@feathersjs-offline/feathers-localforage

[![npm version](https://img.shields.io/npm/v/@feathersjs-offline/feathers-localforage.svg?style=flat-square)](https://www.npmjs.com/package/@feathersjs-offline/feathers-localforage)
[![Build Status](https://img.shields.io/github/workflow/status/feathersjs-offline/feathers-localforage/CI)](https://github.com/feathersjs-offline/feathers-localforage/actions)
[![Dependency Status](https://img.shields.io/david/feathersjs-offline/feathers-localforage?path=packages%2Ffeathers-localforage&style=flat-square)](https://david-dm.org/@feathersjs-offline/feathers-localforage)
[![Known Vulnerabilities](https://snyk.io/test/github/feathersjs-offline/feathers-localforage/badge.svg)](https://snyk.io/test/github/feathersjs-offline/feathers-localforage)
[![Maintainability](https://api.codeclimate.com/v1/badges/22509121003eefaf32c5/maintainability)](https://codeclimate.com/github/feathersjs-offline/feathers-localforage/maintainability)
[![Test Coverage](https://api.codeclimate.com/v1/badges/22509121003eefaf32c5/test_coverage)](https://codeclimate.com/github/feathersjs-offline/feathers-localforage/test_coverage)
[![Download Status](https://img.shields.io/npm/dm/@feathersjs-offline/feathers-localforage)](https://www.npmjs.com/package/@feathersjs-offline/feathers-localforage)

[@featherjs-offline/feathers-localforage](https://github.com/feathersjs-offline/feathers-localforage/) is a database service adapter that wraps `localForage` which enables usage of `IndexedDB`, `WebSQL`, and `LocalStorage`.

```bash
$ npm install --save feathers-localforage
```

> __Important:__ `@feathersjs-offloine/feathers-localforage` implements the [Feathers Common database adapter API](https://docs.feathersjs.com/api/databases/common.html) and [querying syntax](https://docs.feathersjs.com/api/databases/querying.html).


## API

### `service(options)`

Returns a new service instance initialized with the given options.

```js
const service = require('@feathersjs-offline/feathers-localforage');

app.use('/messages', service({
  storage: window.localStorage || AsyncStorage
}));
app.use('/messages', service({ storage, id, startId, name, store, paginate }));
```

__Options:__

- `storage` (**required**) - The local storage engine. You can pass in the browsers `window.localStorage`, React Native's `AsyncStorage` or a NodeJS localstorage module.
- `throttle` (*optional*, default `200`) - The minimum time (ms) before in-memory data is written to `storage`. Data is only written if changed since last write.
- `id` (*optional*, default: `'id'`) - The name of the id field property.
- `startId` (*optional*, default: `0`) - An id number to start with that will be incremented for new record.
- `name` (*optional*, default: `'feathers'`) - The key to store data under in local or async storage.
- `store` (*optional*) - An object with id to item assignments to pre-initialize the data store.
- `events` (*optional*) - A list of [custom service events](https://docs.feathersjs.com/api/events.html#custom-events) sent by this service.
- `paginate` (*optional*) - A [pagination object](https://docs.feathersjs.com/api/databases/common.html#pagination) containing a `default` and `max` page size.
- `whitelist` (*optional*) - A list of additional query parameters to allow.
- `multi` (*optional*) - Allow `create` with arrays and `update` and `remove` with `id` `null` to change multiple items. Can be `true` for all methods or an array of allowed methods (e.g. `[ 'remove', 'create' ]`).
- `reuseKeys` (*optional*, default: `false`) Allow duplicate keys i.e. last definition wins. Mostly useful for demonstration and testing purposes.

## Example

See the [clients](https://docs.feathersjs.com/api/client.html) chapter for more information about using Feathers in the browser and React Native.

### Browser

```html
<script type="text/javascript" src="//unpkg.com/@feathersjs/client@^3.0.0/dist/feathers.js"></script>
<script type="text/javascript" src="//unpkg.com/@feathersjs-offline/feathers-localforage@^0.1.0/dist/feathers-localforage.js"></script>
<script type="text/javascript">
  var service = feathers.localforage({
    storage: window.localStorage
  });
  var app = feathers().use('/messages', service);

  var messages = app.service('messages');

  messages.on('created', function(message) {
    console.log('Someone created a message', message);
  });

  messages.create({
    text: 'Message created in browser'
  });
</script>
```

### React Native

```bash
$ npm install @feathersjs/feathers @feathersjs-offline/feathers-localforage --save
```

```js
import React from 'react-native';
import feathers from '@feathersjs/feathers';
import localforage from '@feeathers-offline/feathers-localforage';

const { AsyncStorage } = React;

const app = feathers()
  .use('/messages', localforage({ storage: AsyncStorage }));

const messages = app.service('messages');

messages.on('created', function(message) {
  console.log('Someone created a message', message);
});

messages.create({
  text: 'Message from React Native'
});
```

## License

Copyright (c) 2021 Feathers

Licensed under the [MIT license](LICENSE).
