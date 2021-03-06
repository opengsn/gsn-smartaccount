// client-side implementation of account.

import AccountApi from '../api/Account.api'
import { EventEmitter } from 'events'

const verbose = global.window && global.window.location.href.indexOf('verbose') > 0
const ACCOUNT_FRAME_ID = 'account-frame'

export default class AccountProxy extends EventEmitter {
  // storage - property access.
  // localStorage - getItem/setItem (use only if no storage..)
  constructor () {
    super()
    const methods = Object.getOwnPropertyNames(AccountApi.prototype)
    for (const m in methods) {
      const method = methods[m]
      this[method] = function () {
        return this._call(method, Array.prototype.slice.apply(arguments))
      }.bind(this)
    }
    this._initFrame()
    window.addEventListener('message', this._onMessage.bind(this))
    this.idseq = Math.floor(Math.random() * 1e5)
    this.iframe = document.getElementById(ACCOUNT_FRAME_ID).contentWindow
    this.pending = {}
  }

  // create an IFRAME in our window
  _initFrame () {
    const frame = document.createElement('iframe')
    // todo: absolute URL, e.g.: 'https://account.safeaccount.xyz'
    const IFRAME_URL = 'account.html'
    frame.setAttribute('src', IFRAME_URL + (verbose ? '#verbose' : ''))
    frame.setAttribute('id', ACCOUNT_FRAME_ID)
    frame.setAttribute('scrolling', 'no')
    frame.style.width = '0px'
    frame.style.height = '0px'
    frame.style.border = 0
    document.body.appendChild(frame)
  }

  _onMessage ({ source, data }) {
    if (data === 'account-iframe-initialized') {
      this.initialized = true
      this.emit('initialized')
      console.log('iframe initialized')
      return
    }
    if (!data || !data.id) {
      return
    }
    // if (verbose) { console.log('reply src=', source.location.href) }

    const pendingResponse = this.pending[data.id]
    if (!pendingResponse) {
      console.log('ignored unknown message: ', data)
      return
    }
    delete this.pending[data.id]
    pendingResponse(data)
  }

  _call (method, args = {}) {
    const self = this
    return new Promise((resolve, reject) => {
      const id = this.idseq++
      const docall = () => {
        let timeoutId
        // user may take some time to complete login..
        // TODO: googleAuthenticate sometimes takes long time to refresh
        if (method !== 'googleLogin' && method !== 'googleAuthenticate') {
          timeoutId = setTimeout(() => reject(new Error('timed-out: ' + method)), 5000)
        }

        if (verbose) { console.log('calling: ', id, method, args) }
        self.pending[id] = ({ response, error }) => {
          if (verbose) { console.log('response: ', id, method, error || response) }
          clearTimeout(timeoutId)
          if (error) {
            reject(new Error(error))
          } else {
            resolve(response)
          }
        }
        this.iframe.postMessage({ method, args, id }, '*')
      }

      if (!this.initialized) {
        if (verbose) {
          console.log('iframe not initialized. ping')
        }
        // iframe not initialized yet. ping it, and wait...
        this.iframe.postMessage('account-iframe-ping', '*')
        this.once('initialized', docall)
      } else {
        // already initialized
        docall()
      }
    })
  }
}
