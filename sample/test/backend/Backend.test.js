/* global describe before afterEach it */

import { Backend } from '../../src/js/backend/Backend'
import { assert } from 'chai'
import SMSmock from '../../src/js/mocks/SMS.mock'
import { hookBackend } from './testutils'
import { KeyManager } from '../../src/js/backend/KeyManager'
import { SmsManager } from '../../src/js/backend/SmsManager'
import crypto from 'crypto'
import { BackendAccount, AccountManager } from '../../src/js/backend/AccountManager'
import { Watchdog } from '../../src/js/backend/Guardian'
import Web3 from 'web3'
import * as FactoryContractInteractor from 'safechannels-contracts/src/js/FactoryContractInteractor'
import Account from '../../src/js/impl/Account'
import SimpleWallet from '../../src/js/impl/SimpleWallet'

import Permissions from 'safechannels-contracts/src/js/Permissions'
import Participant from 'safechannels-contracts/src/js/Participant'

const ethUtils = require('ethereumjs-util')
const abi = require('ethereumjs-abi')
const phone = require('phone')

describe('Backend', async function () {
  let backend
  const keypair = {
    privateKey: Buffer.from('20e12d5dc484a03c969d48446d897a006ebef40a806dab16d58db79ba64aa01f', 'hex'),
    address: '0x68cc521201a7f8617c5ce373b0f0993ee665ef63'
  }
  let smsProvider
  let smsManager
  let keyManager
  let accountManager
  const jwt = require('./testJwt').jwt
  let smsCode
  let accountZero
  let web3
  const ethNodeUrl = 'http://localhost:8545'
  const phoneNumber = '+972541234567'
  const email = 'shahaf@tabookey.com'
  const wrongEmail = 'wrong@email.com'
  const nonce = 'hello-world'

  const audience = '202746986880-u17rbgo95h7ja4fghikietupjknd1bln.apps.googleusercontent.com'
  before(async function () {
    smsProvider = new SMSmock()
    smsManager = new SmsManager({ smsProvider, secretSMSCodeSeed: crypto.randomBytes(32) })
    keyManager = new KeyManager({ ecdsaKeyPair: keypair })
    accountManager = new AccountManager()
    const web3provider = new Web3.providers.WebsocketProvider(ethNodeUrl)
    web3 = new Web3(web3provider)
    accountZero = (await web3.eth.getAccounts())[0]
    const guardian = new Watchdog(
      { smsManager, keyManager, accountManager, smartAccountFactoryAddress: accountZero, web3provider })

    backend = new Backend(
      {
        smsManager,
        audience,
        keyManager,
        guardian,
        accountManager
      })

    hookBackend(backend)
  })
  describe('sms code generation', async function () {
    let ts
    let firstCode
    let formattedNumber
    before(async function () {
      formattedNumber = backend._formatPhoneNumber(phoneNumber)
      ts = backend.smsManager.getMinuteTimestamp({})
      firstCode = backend.smsManager.calcSmsCode(
        { phoneNumber: formattedNumber, email: email, minuteTimeStamp: ts })
    })
    afterEach(async function () {
      Date.now = Date.nowOrig
      delete Date.nowOrig
    })
    it('should generate the same sms code for calls within 10 minute window', function () {
      Date.nowOrig = Date.now
      Date.now = function () {
        return Date.nowOrig() + 5e5 // ~9 minutes in the future
      }
      // calculate desired timestamp from a given sms code
      ts = backend.smsManager.getMinuteTimestamp({ expectedSmsCode: firstCode })
      const secondCode = backend.smsManager.calcSmsCode(
        { phoneNumber: formattedNumber, email: email, minuteTimeStamp: ts })
      assert.equal(firstCode, secondCode)
    })

    it('should generate different sms code for calls out of the 10 minute window', function () {
      Date.nowOrig = Date.now
      Date.now = function () {
        return Date.nowOrig() + 6e5 // = 10 minutes in the future
      }
      // calculate desired timestamp from a given sms code
      ts = backend.smsManager.getMinuteTimestamp({ expectedSmsCode: firstCode })
      const secondCode = backend.smsManager.calcSmsCode(
        { phoneNumber: formattedNumber, email: email, minuteTimeStamp: ts })
      assert.isTrue(parseInt(secondCode).toString() === secondCode.toString())
      assert.notEqual(firstCode, secondCode)
    })
  })

  describe('validatePhone', async function () {
    it('should throw on invalid phone number', async function () {
      const phoneNumber = '1243 '
      const invalidjwt = 'token'
      try {
        await backend.validatePhone({ jwt: invalidjwt, phoneNumber })
        assert.fail()
      } catch (e) {
        assert.equal(e.toString(), `Error: Invalid phone number: ${phoneNumber}`)
      }
    })

    it('should throw on invalid jwt token', async function () {
      const invalidjwt = 'invalid token'
      try {
        await backend.validatePhone({ jwt: invalidjwt, phoneNumber })
        assert.fail()
      } catch (e) {
        assert.equal(e.toString(), `Error: invalid jwt format: ${invalidjwt}`)
      }
    })

    it('should validate phone number', async function () {
      await backend.validatePhone({ jwt, phoneNumber })
      smsCode = backend.smsManager.getSmsCode(
        { phoneNumber: backend._formatPhoneNumber(phoneNumber), email: email })
      assert.notEqual(smsCode, undefined)
    })
  })

  describe('createAccount', async function () {
    it('should throw on invalid sms code', async function () {
      this.timeout(15000)
      const wrongSmsCode = smsCode - 1
      try {
        await backend.createAccount({ jwt, smsCode: wrongSmsCode, phoneNumber })
        assert.fail()
      } catch (e) {
        assert.equal(e.toString(), `Error: invalid sms code: ${wrongSmsCode}`)
      }
    })

    it('should createAccount by verifying sms code', async function () {
      const accountCreatedResponse = await backend.createAccount({ jwt, smsCode, phoneNumber })
      const expectedSmartAccountId = abi.soliditySHA3(['string'], [email])
      assert.equal(accountCreatedResponse.smartAccountId, '0x' + expectedSmartAccountId.toString('hex'))

      const approvalData = accountCreatedResponse.approvalData
      assert.isTrue(ethUtils.isHexString(approvalData))
      const decoded = abi.rawDecode(['bytes4', 'bytes'],
        Buffer.from(accountCreatedResponse.approvalData.slice(2), 'hex'))
      const timestamp = decoded[0]
      let sig = decoded[1]
      sig = ethUtils.fromRpcSig(sig)
      let hash = abi.soliditySHA3(['bytes32', 'bytes4'],
        [Buffer.from(accountCreatedResponse.smartAccountId.slice(2), 'hex'), timestamp])
      hash = abi.soliditySHA3(['string', 'bytes32'], ['\x19Ethereum Signed Message:\n32', hash])
      const backendExpectedAddress = ethUtils.publicToAddress(ethUtils.ecrecover(hash, sig.v, sig.r, sig.s))
      assert.equal('0x' + backendExpectedAddress.toString('hex'), backend.keyManager.address())
      const accountId = await backend.getSmartAccountId({ email })
      const account = new BackendAccount(
        {
          accountId: accountId,
          email: email,
          phone: phone(phoneNumber),
          verified: true
        })
      const actualAccount = backend.accountManager.getAccountById({ accountId })
      assert.deepEqual(actualAccount, account)
    })
  })

  describe('#signInAsNewOperator()', async function () {
    let account
    const myTitle = 'just throwing out the garbage'
    before(async function () {
      const accountId = await backend.getSmartAccountId({ email })
      account = backend.accountManager.getAccountById({ accountId })
    })

    it('should throw on wrong email in signInAsNewOperator request', async function () {
      account.email = wrongEmail
      try {
        await backend.signInAsNewOperator({ jwt, title: myTitle })
        assert.fail()
      } catch (e) {
        assert.equal(e.message, `Invalid email. from jwt: ${email} from account: ${wrongEmail}`)
      }
      account.email = email
    })

    it('should handle signInAsNewOperator request and receive sms message', async function () {
      await backend.signInAsNewOperator({ jwt, title: myTitle })
      smsCode = await backend.smsManager.getSmsCode({ phoneNumber: account.phone, email: account.email })
      assert.equal(SMSmock.readSms().message, `To sign-in new device as operator, enter code: ${smsCode}`)
      assert.deepEqual(backend.unverifiedNewOperators[account.accountId], { newOperatorAddress: nonce, title: myTitle })
    })

    it('should throw on wrong email in validateAddOperatorNow request', async function () {
      account.email = wrongEmail
      try {
        await backend.validateAddOperatorNow({ jwt, smsCode })
        assert.fail()
      } catch (e) {
        assert.equal(e.message, `Invalid email. from jwt: ${email} from account: ${wrongEmail}`)
      }
      account.email = email
    })

    it('should throw on wrong smsCode in validateAddOperatorNow', async function () {
      const wrongCode = smsCode - 1
      try {
        await backend.validateAddOperatorNow({ jwt, smsCode: wrongCode })
        assert.fail()
      } catch (e) {
        assert.equal(e.message, `Invalid sms code: ${wrongCode}`)
      }
    })

    it('should handle validateAddOperatorNow, store data and return new operator address, title', async function () {
      const { newOperatorAddress, title } = await backend.validateAddOperatorNow({ jwt, smsCode })
      assert.deepEqual(backend.unverifiedNewOperators, {})
      assert.equal(backend.accountManager.getOperatorToAdd({ accountId: account.accountId }), nonce)
      assert.equal(newOperatorAddress, nonce)
      assert.equal(title, myTitle)
    })
  })

  describe('#recoverWallet()', async function () {
    const newOperatorAddress = '0x' + '7'.repeat(40)
    let account
    let smsCode
    let jwt

    async function fundAddress (guardianAddress) {
      const tx = {
        from: accountZero,
        value: 1e18,
        to: guardianAddress,
        gasPrice: 1
      }
      const receipt = await web3.eth.sendTransaction(tx)
      console.log(`Funded address ${guardianAddress}, txhash ${receipt.transactionHash}\n`)
    }

    before(async function () {
      jwt = Account.generateMockJwt({ email, nonce: newOperatorAddress })
      const accountId = await backend.getSmartAccountId({ email })
      account = backend.accountManager.getAccountById({ accountId })
      const smartAccount = await FactoryContractInteractor.deploySmartAccountDirectly(accountZero, ethNodeUrl)
      account.address = smartAccount.address
      backend.accountManager.putAccount({ account })

      // TODO: do not commit, make use of test env-t
      const walletConfig = {
        contract: smartAccount,
        participant:
          new Participant(accountZero, Permissions.OwnerPermissions, 1),
        knownParticipants: [
          new Participant(accountZero, Permissions.OwnerPermissions, 1),
          new Participant(keypair.address, Permissions.WatchdogPermissions, 1),
          new Participant(keypair.address, Permissions.AdminPermissions, 1)
        ]
      }
      const wallet = new SimpleWallet(walletConfig)
      const config = SimpleWallet.getDefaultSampleInitialConfiguration({
        backendAddress: keypair.address,
        operatorAddress: accountZero,
        whitelistModuleAddress: accountZero
      })
      // config.initialDelays = [1, 1]
      config.initialDelays = [0, 0]
      config.requiredApprovalsPerLevel = [0, 0]
      await wallet.initialConfiguration(config)
      const info = await wallet.getWalletInfo()
      await fundAddress(keypair.address)
    })

    it('should handle signInAsNewOperator request and receive sms message', async function () {
      const myTitle = 'title'
      await backend.signInAsNewOperator({ jwt, title: myTitle })
      smsCode = await backend.smsManager.getSmsCode({ phoneNumber: account.phone, email: account.email })
      assert.deepEqual(backend.unverifiedNewOperators[account.accountId], { newOperatorAddress, title: myTitle })
    })

    // TODO: make this test readable as well
    it('should handle validateRecoverWallet and schedule operation on chain', async function () {
      const { log } = await backend.validateRecoverWallet({ jwt, smsCode })
      assert.equal(log.name, 'ConfigPending')
      assert.equal(log.events[7].value.length, 1)
      assert.equal(log.events[7].value[0].replace(/0{24}/, ''), newOperatorAddress)
      assert.equal(log.events[6].value, '7')
    })
  })
})
