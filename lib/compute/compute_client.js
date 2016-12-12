const _ = require('underscore-plus')
const async = require('async')
var msRestAzure = require('ms-rest-azure')

var computeManagementClient = require('azure-arm-compute')
var networkManagementClient = require('azure-arm-network')
var resourceManagementClient = require('azure-arm-resource').ResourceManagementClient
var storageManagementClient = require('azure-arm-storage')

module.exports = {
  createComputeClient: (clientId, password, tenantId, subscriptionId, cb) => {
    return new ComputeClient(clientId, password, tenantId, subscriptionId, cb)
  }
}

class ComputeClient {

  constructor(clientId, password, tenantId, subscriptionId, cb) {

    msRestAzure.loginWithServicePrincipalSecret(clientId, password, tenantId,
      (err, credentials) => {
        this._client = new computeManagementClient(credentials, subscriptionId)
        this._resourceClient = new resourceManagementClient(credentials, subscriptionId)
        this._networkClient = new networkManagementClient(credentials, subscriptionId)
        this._storageClient = new storageManagementClient(credentials, subscriptionId)
        cb(err)  
      
    })
  }

  startVM(resourceGroup, vmName, cb) {
    this._client.virtualMachines.beginStart(resourceGroup, vmName, cb)
  }

  listVMs(resourceGroup, cb) {
    this._client.virtualMachines.get(resourceGroup, cb)
  }

  getVM(resourceGroup, vmName, cb) {
    this._client.virtualMachines.get(resourceGroup, vmName, 
    { expand: 'instanceView'}, cb)
  }

  stopVM(resourceGroup, vmName, cb) {
    this._client.virtualMachines.beginDeallocate(resourceGroup, vmName, cb)
  }

  createResourceGroup(resourceGroup, location, cb) {
    var groupParameters = { location: location }
    this._resourceClient.resourceGroups.createOrUpdate(resourceGroup, groupParameters, cb)
  }

  createStorageAccount(resourceGroup, accountName, location, parameters, cb) {
    if (!parameters) {
        parameters = {
          location: location,
          sku: { name: 'Standard_LRS' },
          kind: 'Storage'
        }
    }
    this._storageClient.storageAccounts.create(resourceGroup, accountName, parameters, cb)
  }

  createVnet(resourceGroup, vnetName, location, vnetParameters, cb) {
    if (!vnetParameters) {
      vnetParameters = {
        location: location,
        addressSpace: {
          addressPrefixes: ['10.0.0.0/16']
        },
        dhcpOptions: {
          dnsServers: []
        },
        subnets: []
      }
    }

    this._networkClient.virtualNetworks.createOrUpdate(resourceGroup, vnetName,
                                                        vnetParameters, cb)
  }

  _createSubnet(resourceGroup, vnetName, subnetName, number, cb) {
    var subnetParameters = {
      addressPrefix: '10.0.' + parseInt(number).toString() + '.0/24'
    }

    this._networkClient.subnets.createOrUpdate(resourceGroup, vnetName, subnetName,
      subnetParameters, cb)
  }

  _createPublicIP(resourceGroup, ipName, domainName, location, parameters, cb) {
    if (!parameters) {
      parameters = {
        location: location,
        publicIPAllocationMethod: 'Dynamic',
        dnsSettings: {
          domainNameLabel: domainName
        }
      }
    }

    this._networkClient.publicIPAddresses.createOrUpdate(resourceGroup, ipName,
      parameters, cb)
  }

  _createNIC(resourceGroup, nicName, location, ipName, subnetInfo, publicIPInfo, cb) {
    var nicParameters = {
      location: location,
      ipConfigurations: [
        { 
          name: ipName,
          privateIPAllocationMethod: 'Dynamic',
          subnet: subnetInfo,
          publicIPAddress: publicIPInfo
        }
      ]
    }
    this._networkClient.networkInterfaces.createOrUpdate(resourceGroup, nicName,
      nicParameters, cb)
  }

  _findVMImage(location, publisher, offer, sku, cb) {
    this._client.virtualMachineImages.list(location, publisher, offer, sku, {top: 1}, cb)
  }

  _createVirtualMachine(resourceGroup, vmName, vmParameters, cb) {
    this._client.virtualMachines.createOrUpdate(resourceGroup, vmName, vmParameters, cb)
  }

  _installExtensions(resourceGroup, vmName, extensionName, params, cb) {
    this._client.virtualMachineExtensions.beginCreateOrUpdate(resourceGroup, vmName, extensionName,
      params, cb)
  }

  provisionVM(params, cb) {

    /*
      params example:
      params = {
        resourceGroup: 'grupa',
        location: 'westeurope',
        storageAccount: 'storageAccountName',
        domainPrefix: 'mit-machine',
        number: '05',
        vnet: 'vnetName',
        vm: {
          username: 'admin',
          password: 'adminpass',
          size: 'Standard_GS5',
          extension: {
            name: 'myExtension01',
            settings: {
              fileUris: ['http://link_to_file.sh'],
              commandToExecute: 'sh file.sh'
            }
          }
        }
      }

    */
    
    const domainName = params.domainPrefix + '-' + params.number
    const subnetName = 'subnet-' + params.number
    const pipName = 'ip-' + params.number
    const nicName = 'nic-' + params.number
    const vmName = 'machine-' + params.number
    const osDiskName = 'machine-disk-' + params.number

    console.log(domainName, subnetName, pipName, nicName, vmName, osDiskName)

    const vmImage = {
      publisher: 'Canonical',
      offer: 'UbuntuServer',
      sku: '16.04.0-LTS'
    }

    let subnetInfo, pipInfo, nicInfo, vmImageInfo, vmInfo

    async.series([
      cb => this._createSubnet(params.resourceGroup, params.vnet,
              subnetName, params.number, (err, res) => {
                subnetInfo = res
                cb(err)
            }),
      cb => this._createPublicIP(params.resourceGroup, pipName, domainName, params.location,
              null, (err, res) => {
                pipInfo = res
                cb(err)
            }),
      cb => this._createNIC(params.resourceGroup, nicName, params.location, pipName, subnetInfo,
                pipInfo, (err, res) => {
                  nicInfo = res
                  cb(err)
            }),
      cb => this._findVMImage(params.location, vmImage.publisher, vmImage.offer,
              vmImage.sku, (err, res) => {
                vmImageInfo = res
                cb(err)
            }),
      cb => this._createVirtualMachine(params.resourceGroup, vmName, 
            {
              location: params.location,
              osProfile: {
                computerName: vmName, 
                adminUsername: params.vm.username,
                adminPassword: params.vm.password
              }, 
              hardwareProfile: {
                vmSize: params.vm.size
              }, 
              storageProfile: {
                imageReference: {
                  publisher: vmImage.publisher,
                  offer: vmImage.offer,
                  sku: vmImage.sku,
                  version: vmImageInfo[0].name
                },
                osDisk: {
                  name: osDiskName,
                  caching: 'None',
                  createOption: 'fromImage',
                  vhd: { uri: 'https://' + params.storageAccount +
                                '.blob.core.windows.net/vhds/' + osDiskName + '.vhd' }
                }
              },
              networkProfile: {
                networkInterfaces: [
                  {
                    id: nicInfo.id,
                    primary: true
                  }
                ]
              },
              diagnosticsProfile: {
                bootDiagnostics: {
                  enabled: true,
                  storageUri: 'https://' + params.storageAccount + '.blob.core.windows.net/'
                }
              }
            },
            (err, res) => {
              vmInfo = res
              cb(err)
            }),
      cb => this._installExtensions(params.resourceGroup, vmName, params.vm.extension.name,
            {
              publisher: 'Microsoft.OSTCExtensions',
              virtualMachineExtensionType: 'CustomScriptForLinux',
              typeHandlerVersion: '1.4',
              autoUpgradeMinorVersion: true,
              location: params.location,
              settings: params.vm.extension.settings
            }, cb)
    ], err => {
      cb(err)
    })
  }


}
