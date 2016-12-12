const queues = require('./lib/sb/servicebus_queues')
const queuesCommon = require('./lib/sb/servicebus_common')
const blob = require('./lib/blob/blob_client')
const permissions = require('./lib/blob/storage_permissions')
const compute = require('./lib/compute/compute_client')

module.exports.createComputeClient = compute.createComputeClient
module.exports.createPermissionsClient = permissions.createPermissionsClient
module.exports.createQueueServiceBus = queues.createQueueServiceBus
module.exports.blobClient = blob

module.exports.getLockDurationInSeconds = queuesCommon.getLockDurationInSeconds
module.exports.durationToIsoString = queuesCommon.durationToIsoString

