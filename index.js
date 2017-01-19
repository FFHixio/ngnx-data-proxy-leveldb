'use strict'

/**
 * @class NGNX.DATA.LevelDbProxy
 * Persist NGN DATA stores using LevelDB.
 *
 * LevelDB is a key/value store, so it is not explicitly designed
 * for relational data or traditional records. The NGN.DATA package
 * _does_ represent data in a somewhat relational manner. To bridge
 * this gap, a common approach is flattening data (a key with a stringified
 * JSON object). LevelDB supports this, so this proxy attempts to implement
 * a few common practices. Some assumptions must be made in order to do this.
 *
 * The LevelDB proxy assumes an #NGN.DATA.Store represents a complete LevelDB
 * database/directory. When fetching data, the store is loaded with the full
 * contents of the LevelDB data. When saving, records are flattened into a
 * key/value manner where the key is the ID of a record and the value is the
 * raw JSON data of the record (including the ID).
 *
 * If this proxy is applied to a single #NGN.DATA.Model (instead of a Store),
 * it is assumed to represent the entire dataset. Instead of flattening the
 * model into a single key/value record, each datafield of the model is treated
 * as a record. As a result, the LevelDB will mirror the datafields of the model.
 * Complex model fields, such as nested models, will be flattened. In both cases,
 * LevelDB will store records where the key is the datafield name and the value
 * is the datafield value.
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
      if (Array.isArray(data)) {
        data.forEach((item, index) => {
          results.push({
            type: 'put',
            key: NGN.coalesce(item[this.idAttribute], index).toString(),
            value: item,
            keyEncoding: 'string',
            valueEncoding: 'json'
          })
        })
      } else {
        Object.keys(data).forEach((attribute) => {
          results.push({
            type: 'put',
            key: attribute.toString().trim(),
            value: data[attribute] === null ? '#NIL' : data[attribute],
            keyEncoding: 'string',
            valueEncoding: Array.isArray(data[attribute]) ? 'json' : (typeof data[attribute] === 'object' ? 'json' : typeof data[attribute])
          })
        })
      }
    }

    return results
  }

  /**
   * @method save
   * Save data to the LevelDB file.
   * @param {function} [callback]
   * An optional callback executes after the save is complete. Receives no arguments.
   * @fires save
   * Fired after the save is complete.
   */
  save (callback) {
    require('leveldown').destroy(this.directory, () => {
      this.op((db, done) => {
        db.batch(this.format(this.data), () => {
          done()
          setTimeout(() => {
            this.emit('save')
            callback && callback()
          }, 10)
        })
      })
      // if (this.type === 'store') {
      //   // TODO: Remove records that were deleted since the initial load.
      // }
    })
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
      this.op((db, done) => {
        let keys = []
        db.createKeyStream().on('data', (key) => {
          keys.push(key)
        })
        .on('error', (err) => {
          throw err
        })
        .on('end', () => {
          keys = keys.map((key) => {
            return {
              key: key,
              type: this.getFieldType(key)
            }
          })

          let TaskRunner = require('shortbus')
          let tasks = new TaskRunner()
          let data = {}

          keys.forEach((item) => {
            tasks.add((next) => {
              this.op((database, finished) => {
                database.get(item.key, {
                  keyEncoding: 'string',
                  valueEncoding: item.type
                }, (err, value) => {
                  if (err) {
                    throw err
                  }

                  if (['string', 'number', 'boolean'].indexOf(item.type) >= 0) {
                    let type = this.getFieldType(item.key)
                    if (value.indexOf('#NIL') >= 0) {
                      value = null
                    } else if (type === 'boolean') {
                      value = value === 'true'
                    } else if (type === 'number') {
                      if (value.indexOf('.') < 0) {
                        value = parseInt(value, 10)
                      } else {
                        value = parseFloat(value)
                      }
                    }

                    type = null
                  }

                  data[item.key] = value
                  finished()
                  setTimeout(() => {
                    next()
                  }, 10)
                })
              })
            })
          })

          tasks.on('complete', () => {
            done()
            this.load(data)
            setTimeout(callback, 10)
          })

          setTimeout(() => {
            db.close()
            tasks.run(true)
          }, 10)
        })
      })
    }
  }

  getFieldType (field) {
    let pattern = /function\s(.*)\(\).*/gi
    let type = 'json'

    if (!this.joins.hasOwnProperty(field)) {
      type = pattern.exec(this.fields[field].type.toString())
      type = NGN.coalesce(type, [null, 'string'])[1].toLowerCase()
    }

    return type === 'array' ? 'json' : type
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
    }
  }
}

global.NGNX = NGN.coalesce(global.NGNX, {DATA: {}})
global.NGNX.DATA = NGN.coalesce(global.NGNX.DATA, {})
Object.defineProperty(global.NGNX.DATA, 'LevelDBProxy', NGN.const(LevelDbProxy))
