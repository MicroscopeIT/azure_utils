//const azure = require('azure')
const azure = require('azure-storage')
const retryOperations = new azure.ExponentialRetryPolicyFilter()
const _ = require('underscore-plus')
const async = require('async')

module.exports = {
  createPermissionsClient: () => {
    return new PermissionsClient()
  }
}

class PermissionsClient {

  constructor() { }

  getContainerAcl(storageAccountName, storageAccountKey, containerName, cb) {
    storageAccountName = storageAccountName.toLowerCase()
    containerName = containerName.toLowerCase()

    var blobService = azure.createBlobService(storageAccountName,
      storageAccountKey).withFilter(retryOperations)

    blobService.getContainerAcl(containerName, (err, result) => {
      cb(err, result)
    })
  }

  appendToContainerAcl(storageAccountName, storageAccountKey, containerName, user, cb) {
    this.getContainerAcl(storageAccountName, storageAccountKey, containerName, (err, result) => {
      if (err) return cb(err)
      var aclTable = result.signedIdentifiers;

      var startDate = new Date()
      var expiryDate = new Date()
      startDate.setMinutes(startDate.getMinutes() - 100)
      expiryDate.setFullYear(expiryDate.getFullYear() + 100)

      var field = {
        Start: startDate,
        Expiry: expiryDate,
        Permissions: 'rwl'
      }

      aclTable[user] = field

      var blobService = azure.createBlobService(storageAccountName,
        storageAccountKey).withFilter(retryOperations)

      blobService.setContainerAcl(containerName, aclTable, cb)
    })
  }

  setContainerAcl(storageAccountName, storageAccountKey, containerName, userList, cb) {
    storageAccountName = storageAccountName.toLowerCase()
    containerName = containerName.toLowerCase()

    var acl = this.makeAcl(userList)
    var blobService = azure.createBlobService(storageAccountName,
      storageAccountKey).withFilter(retryOperations)

    blobService.setContainerAcl(containerName, acl, (err, result) => {
      cb(err, result)
    })
  }

  setAccountAcl(storageAccountName, storageAccountKey, userList, cb) {
    storageAccountName = storageAccountName.toLowerCase()

    var acl = this.makeAcl(userList)
    var blobService = azure.createBlobService(storageAccountName,
      storageAccountKey).withFilter(retryOperations)

    var containers = []

    async.series([
      _cb => blobService.listContainersSegmented(null, (err, result) => {
        if (err) return _cb(err)

        if (result && result.entries) {
          containers = _.pluck(result.entries, 'name')
          return _cb(null)
        }
      }),
      _cb => {
        async.eachLimit(containers, 3, (containerName, callback) => {
          blobService.setContainerAcl(containerName, acl, (error, result) => {
            callback(error)
          })
        }, err => {
          _cb(err)
        });
      }
    ], error => {
      return cb(error)
    })
  }

  makeAcl(userList) {
    var acl = {}
    var startDate = new Date()
    var expiryDate = new Date()
    startDate.setMinutes(startDate.getMinutes() - 100)
    expiryDate.setFullYear(expiryDate.getFullYear() + 100)

    var field = {
      Start: startDate,
      Expiry: expiryDate,
      Permissions: 'rwl'
    }

    _.map(userList, user => {
      acl[user] = field
    })

    return acl
  }
  
  getAdHocSas(lifeTimeInSeconds, storageAccountName, storageAccountKey, containerName) {
    storageAccountName = storageAccountName.toLowerCase()
    containerName = containerName.toLowerCase()
    
    const expiryDate = new Date()
    expiryDate.setSeconds(expiryDate.getSeconds() + lifeTimeInSeconds)

    const client = azure.createBlobService(storageAccountName, storageAccountKey).withFilter(retryOperations)

    const params = {
      AccessPolicy: {
        Permissions: 'rl',
        Expiry: expiryDate
      }
    }

    const token = client.generateSharedAccessSignature(containerName, null, params)
    return {
      token: token,
      expiryDate: expiryDate
    }
  }

  getSas(storageAccountName, storageAccountKey, containerName, user) {
    storageAccountName = storageAccountName.toLowerCase()
    containerName = containerName.toLowerCase()


    var requestField
    if (user) {
      requestField = { Id: user }
    } else {
      var startDate = new Date()
      var expiryDate = new Date()
      expiryDate.setFullYear(expiryDate.getFullYear() + 100)

      requestField = {
        AccessPolicy: {
          Expiry: expiryDate,
          Permissions: 'rwl'
        }
      }
    }

    var blobService = azure.createBlobService(storageAccountName,
      storageAccountKey).withFilter(retryOperations)

    return blobService.generateSharedAccessSignature(containerName, null,
     requestField)
  }
}
