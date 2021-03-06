/*
  Run with:
  node -r esm <path_to_script>/runServer.js -p <port> -f <factoryAddress> -s <sponsorAddress> -e <ethNodeUrl> [--dev]
 */

import parseArgs from 'minimist'
import Webserver from './Webserver'
import { Backend } from './Backend'
import SMSmock from '../mocks/SMS.mock'
import SMStwilio from '../impl/SMS.twilio'
import { KeyManager } from './KeyManager'
import { hookBackend } from '../../../test/backend/testutils'
import { SmsManager } from './SmsManager'
import { AccountManager } from './AccountManager'
import crypto from 'crypto'
import { Watchdog, Admin, AutoCancelWatchdog } from './Guardian'
import Web3 from 'web3'
import fs from 'fs'

function error (err) { throw new Error(err) }

const argv = parseArgs(process.argv.slice(2), {
  string: ['sponsor', 'factory', 'url', 'url-prefix', 'whitelistFactory'],
  boolean: ['auto-cancel'],
  alias: { D: 'dev', S: 'sms', u: 'url', x: 'url-prefix', a: 'auto-cancel', s: 'sponsor', f: 'factory', w: 'whitelistFactory' }
})

if (argv._.length) error('unknown extra params: ' + argv._)

const port = argv.p || error('missing -p [port]')
const factoryAddress = argv.f || error('missing -f [factoryAddress]')
const sponsorAddress = argv.s || error('missing -s [sponsotAddress]')
const whitelistFactoryAddress = argv.w || error('missing -w [whitelistFactoryAddress]')
const ethNodeUrl = argv.url || error('missing -u [ethNodeUrl]')
const smsProvider = argv.sms === 'twilio' ? new SMStwilio() : new SMSmock()
const urlPrefix = argv.x || error('missing -x [urlPrefix]')
const autoCancel = argv.a
if (autoCancel) {
  console.log('Running auto cancelling watchdog')
}
console.log('Using sms provider: ', smsProvider.constructor.name)

const devMode = argv.dev
const workdir = '/tmp/test/runserver'
const smsManager = new SmsManager({ smsProvider, secretSMSCodeSeed: crypto.randomBytes(32) })
let keypair
try {
  keypair = JSON.parse(fs.readFileSync(`${workdir}/keystore`)).ecdsaKeyPair
  keypair.privateKey = Buffer.from(keypair.privateKey)
  console.log('Using saved keypair')
} catch (e) {
  keypair = KeyManager.newKeypair()
}
const keyManager = new KeyManager({ ecdsaKeyPair: keypair, workdir })
const accountManager = new AccountManager({ workdir })
const web3provider = new Web3.providers.WebsocketProvider(ethNodeUrl)
const WatchdogClass = autoCancel ? AutoCancelWatchdog : Watchdog
const watchdog = new WatchdogClass({
  smsManager,
  keyManager,
  accountManager,
  smartAccountFactoryAddress: factoryAddress,
  sponsorAddress,
  whitelistFactoryAddress,
  web3provider: web3provider,
  urlPrefix,
  level: 1
})
const admin = new Admin({
  smsManager,
  keyManager,
  accountManager,
  smartAccountFactoryAddress: factoryAddress,
  sponsorAddress: sponsorAddress,
  web3provider: web3provider
})
const backend = new Backend(
  {
    smsManager,
    audience: '202746986880-u17rbgo95h7ja4fghikietupjknd1bln.apps.googleusercontent.com',
    keyManager,
    accountManager,
    admin: admin
  })

// update Date.now() on every ETH-block timestamp.
function hookNodeTime () {
  // hook nodejs global Date class
  require('../mocks/MockDate')

  const web3 = new Web3(web3provider)
  web3.eth.subscribe('newBlockHeaders', function (error, blockHeader) {
    if (error) {
      console.error(error)
    }
  }).on('data', blockHeader => {
    const diff = Math.floor(blockHeader.timestamp - Date.now() / 1000)
    if (Math.abs(diff) > 10) {
      console.log('=== time-gap: time changed by ', diff, 'seconds')
    }
    Date.setMockedTime(blockHeader.timestamp * 1000)
  })
}

if (devMode) {
  console.log('Running server in dev mode')
  if (!autoCancel) {
    accountManager.clearAll()
  }
  hookBackend(backend)
  hookNodeTime()
  smsManager.secretSMSCodeSeed = Buffer.from('f'.repeat(64), 'hex')
}

console.log('server address=' + backend.keyManager.address())

const server = new Webserver({ port, backend, watchdog, admin })
server.start()
