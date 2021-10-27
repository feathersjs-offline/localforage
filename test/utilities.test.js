const stringsToDatesTest = require('./utilities/strings-to-dates.test');
const localStorageTest = require('./utilities/local-storage.test');

describe('Utilities verification', () => {

  stringsToDatesTest();
  localStorageTest();
});
