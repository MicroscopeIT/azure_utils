const _ = require('underscore-plus')
const async = require('async')

module.exports = {
    listBlobs: listBlobs,
    listBlobsWithPrefix: listBlobsWithPrefix,
    listContainers: listContainers
}

function listBlobsWithPrefix(blobService, container, prefix, cb) {
    _listBlobsWithPrefix(blobService, container, prefix, null, [], cb)
}

function _listBlobsWithPrefix(blobService, container, prefix, token, content, cb) {
    blobService.listBlobsSegmentedWithPrefix(container, prefix, token, content, (err, res) => {

        if (err) 
            return cb(err)

        content.push(res.entries)

        if (res.continuationToken) {
            return _listBlobsWithPrefix(blobService, container, prefix,
                                res.continuationToken, content, cb)
        } else {
            content = _.flatten(content, true)
            return cb(err, content)
        }
    })
}

function listBlobs(blobService, container, cb) {
    _listBlobs(blobService, container, null, [], cb)
}

function _listBlobs(blobService, container, token, content, cb) {
    blobService.listBlobsSegmented(container, token, content, (err, res) => {

        if (err) 
            return cb(err)

        content.push(res.entries)

        if (res.continuationToken) {
            return _listBlobs(blobService, container, 
                                res.continuationToken, content, cb)
        } else {
            content = _.flatten(content, true)
            return cb(err, content)
        }
    })
}

function listContainers(blobService, cb) {
    _listContainers(blobService, null, [], cb)
}

function _listContainers(blobService, token, containers, cb) {
    blobService.listContainersSegmented(token, containers, (err, res) => {
        if (err) 
            return cb(err)

        containers.push(res.entries)

        if (res.continuationToken) {
            return listContainers(blobService, res.continuationToken,
                                     containers, cb)
        } else {    
            containers = _.flatten(containers, true)
            return cb(err, containers)
        }
    })
}
