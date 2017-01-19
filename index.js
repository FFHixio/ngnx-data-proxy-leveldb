'use strict'

/**
 * @class NGNX.DATA.LevelDbProxy
 * Persist NGN DATA stores using LevelDB.
 */
class LevelDbProxy extends NGN.DATA.Proxy {
  constructor (config) {
    config = config || {}

    if (typeof config === 'string') {
      config = {
        directory: config
      }
    }

    if (!config.directory) {
      throw new Error('No database configuration detected.')
    }

    if (!NGN.util.pathReadable(config.directory)) {
      console.warn(config.directory + ' does not exist or cannot be found. It will be created automatically if any data operation is requested.')
    }

    super(config)

    Object.defineProperties(this, {
      /**
       * @cfg {string} directory
       * Path to the LevelDB database directory.
       */
      directory: NGN.const(config.directory),

      /**
       * @property {string} proxytype
       * The type of underlying data (model or store).
       * @private
       */
      type: NGN.private(null),

      leveldb: NGN.privateconst(require('levelup'))
    })
  }

  init (datastore) {
    this.type = datastore instanceof NGN.DATA.Store ? 'store' : 'model'
    NGN.inherit(this, datastore)
  }

  mkdirp (dir) {
    if (NGN.util.pathReadable(dir)) {
      return
    }

    if (NGN.util.pathReadable(require('path').join(dir, '..'))) {
      require('fs').mkdirSync(dir)
      return
    }

    this.mkdirp(require('path').join(dir, '..'))
    this.mkdirp(dir)
  }

  op (fn) {
    // console.log('Opening LevelDB')
    let db = this.proxy.leveldb(this.proxy.directory)
    fn(db, function () {
      // console.log('Closing LevelDB')
      db.close()
    })
  }

  format (data, namespace = '', separator = '.') {
    let results = []

    if (data) {
      data = Array.isArray(data) ? data : [data]
      data.forEach((item, index) => {
        results.push({
          type: 'put',
          key: index,
          value: item,
          keyEncoding: 'number',
          valueEncoding: 'json'
        })
      })
    }

    return results
  }

  /**
   * @method save
   * Save data to the LevelDB file. Data is automatically flattened.
   * @param {function} [callback]
   * An optional callback executes after the save is complete. Receives no arguments.
   * @fires save
   * Fired after the save is complete.
   */
  save (callback) {
    if (this.type === 'store') {
      this.op((db, done) => {
        db.batch(this.format(this.data), () => {
          done()
          setTimeout(() => {
            this.emit('save')
            callback()
          }, 10)
        })
      })
    } else {
      this.emit('save')
    }
  }

  /**
   * @method fetch
   * Automatically populates the store/record with the full set of
   * data from the LevelDB.
   * @param {function} [callback]
   * An optional callback executes after the fetch and parse is complete. Receives no arguments.
   * @fires fetch
   * Fired after the fetch and parse is complete.
   */
  fetch (callback) {
    if (this.type === 'store') {
      let dataset = []

      this.op((db, done) => {
        db.createValueStream({
          keyEncoding: 'number',
          valueEncoding: 'json'
        }).on('data', (data) => {
          dataset.push(data)
        })
        .on('error', (err) => {
          throw err
        })
        .on('end', () => {
          this.reload(dataset)
          done()
          setTimeout(callback, 10)
        })
      })
    } else {
      callback()
    }
  }

  parse (dataset) {
    if (this.type === 'store') {
      let base = new this.model() // eslint-disable-line new-cap
      let currentId = null
      let resultset = []
      let currentData = {}

      dataset.forEach((item) => {
        let keys = item.key.split('.')
        let id = keys.shift()

        if (currentId !== id) {
          if (currentId !== null) {
            resultset.push(currentData)
          }

          currentData = {}
          currentData[base.idAttribute] = id
          currentId = id
        }

        let key = keys.shift()
        if (keys.length === 0) {
          currentData[key] = item.value
        } else {
          currentData[key] = currentData[key] || {}
          key = currentData[key]
          while (keys.length > 0) {
            let newkey = keys.shift()
            key[newkey] = key[newkey] || (keys.length === 0 ? item.value : {})
          }
        }

        // console.log(model)
      })

      if (Object.keys(currentData).length > 0) {
        resultset.push(currentData)
        currentData = null
      }

      console.log('PARSE', dataset, resultset)
    }
  }
}

global.NGNX = NGN.coalesce(global.NGNX, {DATA: {}})
global.NGNX.DATA = NGN.coalesce(global.NGNX.DATA, {})
Object.defineProperty(global.NGNX.DATA, 'LevelDBProxy', NGN.const(LevelDbProxy))
