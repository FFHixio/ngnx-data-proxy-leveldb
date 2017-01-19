# NGNX.DATA.LevelDBProxy

`npm i ngnx-data-proxy-leveldb`

```js
require('ngnx-data-proxy-leveldb')

const Person = new NGN.DATA.Model({
  fields: {
    firstname: null,
    lastname: null
  },

  proxy: new NGNX.DATA.LevelDBProxy('./mydb')
})
```

The LevelDB proxy is used to perform CRUD operations from an NGN.DATA.Store and/or
NGN.DATA.Model.  
