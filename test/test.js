const utils = require('../azure_utils')
const assert = require('chai').assert
const _ = require('underscore')

const queueName = 'unittestq'
const lockTimeInSeconds = 4

const connectionStr = process.env.SERVICEBUS_CONN_STR

if(!connectionStr)
  throw 'Connection string not provided. Define SERVICEBUS_CONN_STR env variable.'

const servicebus = utils.createQueueServiceBus(connectionStr)

function checkMessageCount(size, cb) {

  servicebus.getQueueInfo(queueName, function(err, result) {

    assert.isNull(err)
    assert.equal(result.MessageCount, size)

    cb()
  })
}

function removeMessage(expectedCount, cb) {

  servicebus.lockBrokeredMessage(queueName, (err, msg, handler) => {

    assert.isNull(err)

    servicebus.deleteMessage(handler, (err) => {

      assert.isNull(err)
      checkMessageCount(expectedCount, cb)
    })
  })
}

describe('Service bus', function() {

  before(function(done) {

    var options = {
      LockDuration: utils.durationToIsoString(lockTimeInSeconds)
    }

    servicebus.createQueueIfNotExists(queueName, options, function(err, result, response) {
      assert.isNull(err)
      done()
    })
  })

  after(function(done) {

    done()

    // servicebus.deleteQueue(queueName, function(err, result) {
    //   assert.isNull(err)
    //   done()
    // })
  })

  beforeEach(function(done) {

    this.timeout(10000)

    servicebus.purge(queueName, (err, res) => {

      if(err) {
        console.log(err)
        console.log('--------------')
        console.log(res)
      }

      assert.isNull(err)
      done()
    })
  })

  describe('getQueueInfo', function() {

    it('should get info about queue', function(done) {

      servicebus.getQueueInfo(queueName, function(err, result) {

        assert.isNull(err)
        //console.log(result)
        done()
      })
    })
  })

  describe('sendBrokeredMessage', function() {

    it('should throw exception when the message is malformed', function(done) {

      //var malformedMsg = 

      function checkMalformedMsg(msg) {
        assert.throws(() => {
          servicebus.sendBrokeredMessage(queueName, msg, (err) => {})
        }, null)
      }

      checkMalformedMsg(null)
      checkMalformedMsg('strnig')
      checkMalformedMsg({ key1: 'val1', key2: 'val2' }) // no body
      checkMalformedMsg({ body: { key: 'val' } }) // body not a string nor a buffer
      checkMalformedMsg({ body: 42 }) // body not a string nor a buffer

      checkMessageCount(0, done)
    })

    it('should successfully send message (str)', function(done) {

    	var msg = {
        body: JSON.stringify({ key1: 'val1', key2: 'val2' })
    	}

    	servicebus.sendBrokeredMessage(queueName, msg, (err) => {

        if(err) {
          console.log(queueName)
          console.log(err)
        }

        assert.equal(err, null)
        checkMessageCount(1, (err) => {
          removeMessage(0, done)
        })

    	})
    })

    it('should successfully send message (buffer)', function(done) {

      var msg = {
        // ['b','u','f','f','e','r']
        body: Buffer.from([0x62,0x75,0x66,0x66,0x65,0x72])
      }

      servicebus.sendBrokeredMessage(queueName, msg, (err) => {

        if(err) {
          console.log(queueName)
          console.log(err)
        }

        assert.equal(err, null)

        checkMessageCount(1, (err) => {
          removeMessage(0, done)
        })

      })
    })

    it('should try to send overly big message', function(done) {

       this.timeout(10000)

      function randomString(length, chars) {
          var result = ''
          for (var i = length; i > 0; --i)
            result += chars[Math.floor(Math.random() * chars.length)]
          return result
      }

      var chars = '0123456789abcdefghijklmnopqrstuvwxyz'
        + 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

      var bigMsg = {
        body: randomString(1024 * 1024 * 10, chars)
      }

      servicebus.sendBrokeredMessage(queueName, bigMsg, (err) => {

        assert.isNotNull(err)
        checkMessageCount(0, done)
      })
    })


    it('should try to send message to not existing queue', function(done) {

      var msg = {
        body: JSON.stringify({ key1: 'val1', key2: 'val2' })
      }

      servicebus.sendBrokeredMessage('myqueue2', msg, (err) => {
        assert.isNotNull(err)
        done()
      })
    })
  })

  describe('lockMessage', function() {

    it('should try to lock message from empty queue', function(done) {

      this.timeout(70000)

      let messageSent = false

      servicebus.lockMessage(queueName, (err, msg, handler) => {

        assert.isNull(err)

        if(!messageSent) {

          assert(false)

        } else {

          servicebus.deleteMessage(handler, (err) => {

            assert.isNull(err)
            checkMessageCount(0, done)
          })
        }
      })

      setTimeout(() => {

        var toSend = { msg: 'msg' }

        servicebus.sendMessage(queueName, toSend, (err) => {

          assert.isNull(err)
          messageSent = true
        })

      }, 65000)
    })

    it('should lock message and delete', function(done) {

      var toSend = { msg: 'msg' }

      servicebus.sendMessage(queueName, toSend, (err) => {

        assert.isNull(err)
        checkMessageCount(1, () => {

          servicebus.lockMessage(queueName, (err, msg, handler) => {

            assert.isNull(err)
            assert.isOk(_.isEqual(toSend, msg))
            checkMessageCount(1, () =>{

              servicebus.deleteMessage(handler, (err) => {

                assert.isNull(err)
                checkMessageCount(0, done)
              })
            })
          })
        })
      })
    })

    it('should try lock message with timeout', function(done) {

      var toSend = { msg: 'msg' }

      servicebus.sendMessage(queueName, toSend, (err) => {

        assert.isNull(err)
        checkMessageCount(1, () => {

          servicebus.tryLockMessage(queueName, 5, (err, msg, handler) => {

            assert.isNull(err)
            assert.isOk(_.isEqual(toSend, msg))
            checkMessageCount(1, () =>{ 

              servicebus.deleteMessage(handler, (err) => {

                assert.isNull(err)
                checkMessageCount(0, done)
              })
            })
          })
        })
      })
    })

    it('should try lock message with timeout from empty queue', function(done) {

      this.timeout(6000)

      checkMessageCount(0, () => {

        servicebus.tryLockMessage(queueName, 4, (err, msg, handler) => {

          assert.isNull(err)
          assert.isNull(msg)
          assert.isNull(handler)

          done()
        })
      })
    })

    // it('should lock message and try to lock the next one', function(done) {

    //   var toSend = { msg: 'msg' }

    //   servicebus.sendMessage(queueName, toSend, (err) => {

    //     assert.isNull(err)
    //     checkMessageCount(1, () => {

    //       servicebus.lockMessage(queueName, (err, msg, handler) => {

    //         servicebus.lockMessage(queueName, (err, msg, handler) => {
    //           assert.isOk(false) // it has a side effect in the next test!
    //         })

    //         setTimeout(done, 1000)
    //       })
    //     })
    //   })
    // })

    it('should lock message, wait for expiration and lock again', function(done) {

      var testThis = this

      var toSend = { msg: 'msg' }

      servicebus.getQueueInfo(queueName, function(err, result) {

        assert.isNull(err)

        var lock = utils.getLockDurationInSeconds(result)

        assert.isNumber(lock)
        testThis.timeout((lock + 3) * 1000)

        servicebus.sendMessage(queueName, toSend, (err) => {

          assert.isNull(err)

          servicebus.lockMessage(queueName, (err, msg, handler) => {

            assert.isNull(err)
            assert.isNotNull(msg)

            setTimeout(function() {

            }, (lock + 1) * 1000)

            servicebus.lockMessage(queueName, (err, msg, handler) => {
              assert.isNull(err)
              assert.isNotNull(msg)
              //done()

              servicebus.deleteMessage(handler, (err) => {
                assert.isNull(err)
                checkMessageCount(0, done)
              })
            })
          })
        })
      })
    })
  })
})