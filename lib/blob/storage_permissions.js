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

  constructor() {}

  getContainerAcl(storageAccountName, storageAccountKey, containerName, cb) {
    storageAccountName = storageAccountName.toLowerCase()
    containerName = containerName.toLowerCase()

    var blobService = azure.createBlobService(storageAccountName,
      storageAccountKey).withFilter(retryOperations)

    blobService.getContainerAcl(containerName, (err, result) => {
      cb(err, result)
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

          if(result && result.entries) {
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
      Permissions: azure.BlobUtilities.SharedAccessPermissions.READ,
      Start: startDate,
      Expiry: expiryDate
    }

    _.map(userList, user => {
      acl[user] = field
    })

    return acl
  }

  getSas(storageAccountName, storageAccountKey, containerName, user) {
    storageAccountName = storageAccountName.toLowerCase()
    containerName = containerName.toLowerCase()

    var blobService = azure.createBlobService(storageAccountName,
      storageAccountKey).withFilter(retryOperations)
    var token = blobService.generateSharedAccessSignature(containerName, null, { Id: user })

    return token
  }

}
