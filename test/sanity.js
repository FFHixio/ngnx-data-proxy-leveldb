'use strict'

let test = require('tape')
let fse = require('fs-extra')

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

// test('Data Formatting', function (t) {
//   let m = meta()
//   m.proxy = new NGNX.DATA.LevelDBProxy(root)
//
//   let TestRecord = new NGN.DATA.Model(m)
//   let rec = new TestRecord({
//     firstname: 'The',
//     lastname: 'Doctor'
//   })
//
//   let output = rec.format(rec.data)
//
//   t.ok(
//     output[0].key === 'firstname' && output[0].value === 'The' &&
//     output[1].key === 'lastname' && output[1].value === 'Doctor' &&
//     output[2].key === 'val' && output[2].value === 15,
//     'Formatted for bulk input'
//   )
//
//   t.end()
// })

// test('Nested Record Namespacing', function (t) {
//   let m = meta()
//   m.proxy = new NGNX.DATA.LevelDBProxy(root)
//
//   let Pet = new NGN.DATA.Model({
//     fields: {
//       name: null,
//       breed: null
//     }
//   })
//
//   m.relationships = {
//     pet: Pet
//   }
//
//   let TestRecord = new NGN.DATA.Model(m)
//   let rec = new TestRecord({
//     firstname: 'The',
//     lastname: 'Doctor',
//     pet: {
//       name: 'K-9',
//       breed: 'Robodog'
//     }
//   })
//
//   let output = rec.format(rec.data)
//
//   t.ok(
//     output[0].key === 'firstname' && output[0].value === 'The' &&
//     output[1].key === 'lastname' && output[1].value === 'Doctor' &&
//     output[2].key === 'val' && output[2].value === 15 &&
//     output[3].key === 'pet.name' && output[3].value === 'K-9' &&
//     output[4].key === 'pet.breed' && output[4].value === 'Robodog',
//     'Namespacing exists for flattened submodels'
//   )
//
//   t.end()
// })
//
// test('Store Formatting (Multirecord)', function (t) {
//   let dataset = createPetSet()
//   let output = dataset.format(dataset.data)
//
//   t.ok(
//     output[0].key === '0.firstname' && output[0].value === 'The' &&
//     output[1].key === '0.lastname' && output[1].value === 'Doctor' &&
//     output[2].key === '0.val' && output[2].value === 15 &&
//     output[3].key === '0.pet.name' && output[3].value === 'K-9' &&
//     output[4].key === '0.pet.breed' && output[4].value === 'Robodog' &&
//     output[5].key === '1.firstname' && output[5].value === 'The' &&
//     output[6].key === '1.lastname' && output[6].value === 'Master' &&
//     output[7].key === '1.val' && output[7].value === 15 &&
//     output[8].key === '1.pet.name' && output[8].value === 'Drums' &&
//     output[9].key === '1.pet.breed' && output[9].value === '?',
//     'Namespacing exists for flattened submodels across multiple records.'
//   )
//
//   t.ok(dataset.proxy.type === 'store', 'Recognized store.')
//
//   t.end()
// })

test('Basic Save & Fetch', function (t) {
  let ds = createPetSet()

  ds.once('record.update', function (record, change) {
    ds.save(() => {
      t.pass('Save method applies callback.')

      ds.fetch(() => {
        t.pass('Fetch method applies callback.')
        t.ok(ds.first.lastname === 'Doctor' &&
          ds.last.lastname === 'Master' &&
          ds.last.firstname === 'Da' &&
          ds.first.pet.name === 'K-9',
        'Successfully retrieved modified results.')

        t.end()
      })
    })
  })

  ds.last.firstname = 'Da'
})

// TODO: save (sync)
// TODO: fetch (get all).
// TODO: query (get some).
// TODO: update/upsert
