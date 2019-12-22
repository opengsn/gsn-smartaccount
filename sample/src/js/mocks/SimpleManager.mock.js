/* global error */

import SimpleManagerApi from '../api/SimpleManager.api.js'
import SimpleWalletMock from './SimpleWallet.mock.js'
import AccountMock from './Account.mock'
import SMSmock from './SMS.mock'

// API of the main factory object.
export default class SimpleManagerMock extends SimpleManagerApi {
  constructor (props) {
    super(props)
    props = props || {}
    this.accountApi = props.accountApi || new AccountMock()
    this.smsApi = props.smsApi || new SMSmock()
  }

  async getEmail () {
    return this.accountApi.getEmail()
  }

  async getOwner () {
    return this.accountApi.getOwner()
  }

  async googleLogin () {
    const ret = await this.accountApi.googleLogin()
    return ret
  }

  async signOut () {
    this.wallet = null
    return this.accountApi.signOut()
  }

  async googleAuthenticate () {
    return this.accountApi.googleAuthenticate()
  }

  async getWalletAddress () {
    if (this.getEmail() == null) {
      console.log('getWalletAddress: no email, no addr')
      return null
    }

    // console.log( "getWalletAddress: has email. addr=", this.deployedWalletAddress)
    return this.deployedWalletAddress || null
  }

  async hasWallet () {
    return this.deployedWalletAddress != null
  }

  async validatePhone ({ jwt, phoneNumber }) {
    if (!jwt) {
      throw new Error('not logged in')
    }
    if (await this.hasWallet()) {
      throw new Error('wallet already exists')
    }
    // TODO: use mock SMS service..
    setTimeout(() => {
      const smsVerificationCode = 'v' + phoneNumber
      const smsUrl = 'http://server.com/?verify=' + smsVerificationCode
      this.smsApi.sendSms({
        phone: phoneNumber,
        message: 'To verify your email,\n' +
          'enter verification code: ' + smsVerificationCode + '\n' +
          'or click here: ' + smsUrl + '\n'
      })
    }, 10)
  }

  async createWallet ({ jwt, phoneNumber, smsVerificationCode }) {
    if (smsVerificationCode !== 'v' + phoneNumber) {
      throw new Error('wrong verification code')
    }

    if (await this.hasWallet()) {
      throw new Error('wallet already exists')
    }
    this.deployedWalletAddress = 'waddr'
    return this.loadWallet()
  }

  async setInitialConfiguration () {
  }

  async loadWallet () {
    if (!this.wallet) {
      if (!this.getEmail()) {
        throw new Error('not logged in')
      }
      if (!this.getWalletAddress()) {
        throw new Error('wallet not deployed')
      }
      // wallet address is derived from email...
      this.wallet = new SimpleWalletMock(
        { email: this.getEmail(), address: this.deployedWalletAddress })
    }
    return this.wallet
  }

  async recoverWallet ({ owner, email }) {
    error('trigger recover flow')
  }

  async signInAsNewOperator ({ jwt, description, observer }) {
    super.signInAsNewOperator({ jwt, description, observer })
  }

  setSignInObserver ({ observer, interval }) {
    super.setSignInObserver({ observer, interval })
  }
}
