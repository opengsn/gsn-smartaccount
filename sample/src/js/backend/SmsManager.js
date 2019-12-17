import abi from 'ethereumjs-abi'

export class SmsManager {
  constructor ({ smsProvider, secretSMSCodeSeed }) {
    Object.assign(this, {
      smsProvider,
      secretSMSCodeSeed
    })
  }

  async sendSMS ({ phoneNumber, email }) {
    const code = this.getSmsCode({ phoneNumber, email })
    await this.smsProvider.sendSms({ phone: phoneNumber[0], message: `verification code ${code}` })
    return code
  }

  getSmsCode ({ phoneNumber, email, expectedSmsCode }) {
    const minuteTimeStamp = this.getMinuteTimestamp({ expectedSmsCode })
    return this.calcSmsCode({ phoneNumber, email, minuteTimeStamp })
  }

  getMinuteTimestamp ({ expectedSmsCode }) {
    let minuteTimeStamp = Math.floor(Date.now() / 1000 / 60)
    if (expectedSmsCode !== undefined) {
      expectedSmsCode = parseInt(expectedSmsCode)
      const minutes = expectedSmsCode % 10
      minuteTimeStamp = replaceDigits(minuteTimeStamp, minutes, 10)
    }
    return minuteTimeStamp
  }

  calcSmsCode ({ phoneNumber, email, minuteTimeStamp }) {
    const dataToHash = 'PAD' + this.secretSMSCodeSeed.toString('hex') + phoneNumber[0] + email + minuteTimeStamp + 'PAD'
    let code = parseInt(abi.soliditySHA3(['string'], [dataToHash]).toString('hex').slice(0, 6), 16) % 1e7
    code = code.toString() + (minuteTimeStamp % 10).toString()

    return code
  }
}

function replaceDigits (num, digit, mul = 10) {
  return (num - num % mul + digit - (num % mul >= digit ? 0 : mul))
}