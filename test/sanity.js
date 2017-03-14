'use strict'

let test = require('tape')
let fse = require('fs-extra')
let TaskRunner = require('shortbus')

require('ngn')
require('ngn-data')
require('../')

let root = require('path').join(__dirname, './data')

fse.emptyDirSync(root)

let meta = function () {
  return {
    idAttribute: 'testid',
    fields: {
      firstname: null,
      lastname: null,
      val: {
        min: 10,
        max: 20,
        default: 15
      }
    }
  }
}

let createPetSet = function () {
  let Pet = new NGN.DATA.Model({
    fields: {
      name: null,
      breed: null
    }
  })

  let m = meta()

  m.relationships = {
    pet: Pet
  }

  let NewModel = new NGN.DATA.Model(m)
  let dataset = new NGN.DATA.Store({
    model: NewModel,
    proxy: new NGNX.DATA.LevelDBProxy(root)
  })

  dataset.add({
    firstname: 'The',
    lastname: 'Doctor',
    pet: {
      name: 'K-9',
      breed: 'Robodog'
    }
  })

  dataset.add({
    firstname: 'The',
    lastname: 'Master',
    pet: {
      name: 'Drums',
      breed: '?'
    }
  })

  return dataset
}

test('Primary Namespace', function (t) {
  t.ok(NGNX.DATA.LevelDBProxy !== undefined, 'NGNX.DATA.LevelDBProxy is defined globally.')
  t.end()
})

test('Self Inspection', function (t) {
  let m = meta()
  let NewModel = new NGN.DATA.Model(m)
  let dataset = new NGN.DATA.Store({
    model: NewModel,
    proxy: new NGNX.DATA.LevelDBProxy(root)
  })

  t.ok(dataset.proxy.type === 'store', 'Recognized store.')

  m.proxy = new NGNX.DATA.LevelDBProxy(root)

  let TestRecord = new NGN.DATA.Model(m)
  let rec = new TestRecord({
    firstname: 'The',
    lastname: 'Doctor'
  })

  t.ok(rec.proxy.type === 'model', 'Recognized model.')
  t.end()
})

test('Basic Save & Fetch (Data Model)', function (t) {
  let Pet = new NGN.DATA.Model({
    fields: {
      name: null,
      breed: null
    }
  })

  let m = meta()

  m.relationships = {
    pet: Pet
  }

  m.proxy = new NGNX.DATA.LevelDBProxy(root)

  let DataRecord = new NGN.DATA.Model(m)
  let record = new DataRecord({
    firstname: 'The',
    lastname: 'Doctor',
    pet: {
      name: 'K-9',
      breed: 'Robodog'
    }
  })

  record.once('field.update', function (change) {
    record.proxy.save(() => {
      t.pass('Save method applies callback.')

      record.lastname = 'Master'

      t.ok(record.lastname === 'Master', 'Changes apply normally.')

      record.proxy.fetch(() => {
        t.pass('Fetch method applies callback.')
        t.ok(record.lastname === 'Doctor', 'Data accurately loaded from disk.')
        t.ok(record.pet.name === 'K-9', 'Properly retrieved nested model data.')

        fse.emptyDirSync(root)
        t.end()
      })
    })
  })

  record.firstname = 'Da'
})

test('Basic Save & Fetch (Data Store)', function (t) {
  let ds = createPetSet()
console.log(ds.data)
  ds.once('record.update', function (record, change) {
    ds.proxy.save(() => {
      t.pass('Save method applies callback.')

      ds.proxy.fetch(() => {
        t.pass('Fetch method applies callback.')
console.log(ds.data)
        t.ok(ds.first.lastname === 'Doctor' &&
          ds.last.lastname === 'Master' &&
          ds.last.firstname === 'Da' &&
          ds.first.pet.name === 'K-9',
        'Successfully retrieved modified results.')

        setTimeout(() => {
          fse.emptyDirSync(root)
          t.end()
        }, 100)
      })
    })
  })

  ds.last.firstname = 'Da'
})

test('Store Array Values', function (t) {
  let Model = new NGN.DATA.Model({
    fields: {
      a: Array
    },
    proxy: new NGNX.DATA.LevelDBProxy(root)
  })

  let record = new Model({
    a: ['a', 'b', 'c', {d: true}]
  })

  record.proxy.save(() => {
    t.pass('Saved array data.')
    record.a = []

    record.proxy.fetch(() => {
      t.pass('Retrieved array data.')

      t.ok(Array.isArray(record.a), 'Record returned in array format.')
      t.ok(typeof record.a.pop() === 'object' && record.a[0] === 'a', 'Array data is in correct format.')

      fse.emptyDirSync(root)

      t.end()
    })
  })
})

test('Non-String Primitive Data Types', function (t) {
  let Model = new NGN.DATA.Model({
    fields: {
      b: Boolean,
      n: Number,
      nil: null,
      o: Object
    },
    proxy: new NGNX.DATA.LevelDBProxy(root)
  })

  let record = new Model({
    b: false,
    n: 3,
    o: {
      some: 'value'
    }
  })

  record.proxy.save(() => {
    record.b = true

    record.proxy.fetch(() => {
      t.ok(record.b === false, 'Boolean supported.')
      t.ok(record.n === 3, 'Number supported.')
      t.ok(record.nil === null, 'Null supported.')
      t.ok(record.o.some === 'value', 'Object/JSON supported for models.')
      t.end()
    })
  })
})

test('Live Sync Model', function (t) {
  setTimeout(() => {
    let Pet = new NGN.DATA.Model({
      fields: {
        name: null,
        breed: null
      }
    })

    let m = meta()

    m.relationships = {
      pet: Pet
    }

    m.proxy = new NGNX.DATA.LevelDBProxy(root)

    let TempDataRecord = new NGN.DATA.Model(m)
    let record = new TempDataRecord({
      firstname: 'The',
      lastname: 'Doctor',
      pet: {
        name: 'K-9',
        breed: 'Robodog'
      }
    })

    record.proxy.save(() => {
      record.enableLiveSync()

      let tasks = new TaskRunner()

      tasks.add((next) => {
        record.once('live.update', () => {
          t.pass('live.update method detected.')
          record.setSilent('firstname', 'Bubba')

          record.proxy.fetch(() => {
            t.ok(record.firstname === 'Da', 'Persisted correct value.')
            next()
          })
        })

        record.firstname = 'Da'
      })

      tasks.add((next) => {
        record.once('live.create', () => {
          t.pass('live.create triggered on new field creation.')
          record.proxy.fetch(() => {
            t.ok(record.hasOwnProperty('middlename') && record.middlename === 'Alonsi', 'Field creation persisted on the fly.')
            next()
          })
        })

        record.addField('middlename', {
          type: String,
          default: 'Alonsi',
          required: true
        })
      })

      tasks.add((next) => {
        record.once('live.delete', () => {
          t.pass('live.delete triggered on new field creation.')
          t.ok(!record.hasOwnProperty('middlename'), 'Field deletion persisted on the fly.')

          record.proxy.op((db, done) => {
            db.get('middlename', (err, value) => {
              done()

              t.ok(err instanceof Error, 'Error received on missing record.')

              setTimeout(next, 10)
            })
          })
        })

        record.removeField('middlename')
      })

      tasks.add((next) => {
        record.once('live.update', () => {
          t.pass('live.update triggered when new relationship is available.')

          record.vehicle.setSilent('type', 'other')

          record.proxy.fetch(() => {
            t.ok(record.vehicle.type === 'Tardis', 'Proper value persisted in nested model.')
            next()
          })
        })

        let Vehicle = new NGN.DATA.Model({
          fields: {
            type: null,
            doors: Number
          }
        })

        record.on('relationship.create', () => {
          record.vehicle.type = 'Tardis'
        })

        record.addRelationshipField('vehicle', Vehicle)
      })

      tasks.on('complete', () => {
        fse.emptyDirSync(root)
        t.end()
      })

      tasks.run(true)
    })
  }, 600)
})

test('Live Sync Store', function (t) {
  let Person = new NGN.DATA.Model({
    fields: {
      firstname: null,
      lastname: null
    }
  })

  let People = new NGN.DATA.Store({
    model: Person,
    proxy: new NGNX.DATA.LevelDBProxy(root)
  })

  People.proxy.enableLiveSync()

  let tasks = new TaskRunner()

  tasks.add((next) => {
    People.once('live.create', (record) => {
      People.proxy.op((db, done) => {
        db.get(record.id, {
          valueEncoding: 'json'
        }, (err, v) => {
          if (err) {
            t.fail(err.message)
          }

          done()

          t.ok(v.firstname === 'The' && v.lastname === 'Doctor', 'Correct values stored.')

          setTimeout(() => {
            next()
          }, 10)
        })
      })
    })

    People.add({
      firstname: 'The',
      lastname: 'Doctor'
    })
  })

  tasks.add((next) => {
    People.once('live.create', (record) => {
      People.proxy.op((db, done) => {
        db.get(record.id, {
          valueEncoding: 'json'
        }, (err, v) => {
          if (err) {
            t.fail(err.message)
          }

          done()

          t.ok(v.firstname === 'The' && v.lastname === 'Master', 'Correct values stored for multiple records.')

          setTimeout(() => {
            next()
          }, 10)
        })
      })
    })

    People.add({
      firstname: 'The',
      lastname: 'Master'
    })
  })

  tasks.add((next) => {
    People.once('live.update', (record) => {
      People.proxy.op((db, done) => {
        db.get(record.id, {
          valueEncoding: 'json'
        }, (err, v) => {
          if (err) {
            t.fail(err.message)
          }

          done()

          t.ok(v.firstname === 'Da' && v.lastname === 'Master', 'Correct record and value written during update.')

          setTimeout(() => {
            next()
          }, 10)
        })
      })
    })

    People.last.firstname = 'Da'
  })

  tasks.add((next) => {
    People.once('live.delete', (record) => {
      People.proxy.op((db, done) => {
        db.get(record.id, (err) => {
          done()

          if (err) {
            t.pass('Deleted record does not exist on disk.')
            setTimeout(() => {
              next()
            }, 10)
          } else {
            t.fail('Record exists on disk when it shouldn\'t.')
          }
        })
      })
    })

    People.remove(People.first)
  })

  tasks.add((next) => {
    let id = People.first.id

    People.on('live.delete', () => {
      People.proxy.op((db, done) => {
        db.get(id, (err) => {
          done()

          if (err) {
            t.pass('Deleted records do not exist on disk.')
            setTimeout(() => {
              next()
            }, 10)
          } else {
            t.fail('Records exist on disk after clear.')
          }
        })
      })
    })

    People.clear()
  })

  tasks.on('complete', () => {
    t.end()
  })

  tasks.run(true)
})
