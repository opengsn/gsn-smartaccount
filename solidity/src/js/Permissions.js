// autogenerated by ./perm2js from ./contracts/PermissionsLevel.sol
const permissions = {
  CanSpend: 1 << 0,
  CanUnfreeze: 1 << 1,
  CanChangeParticipants: 1 << 2,
  CanChangeBypass: 1 << 3,
  CanSignBoosts: 1 << 4,
  CanExecuteBoosts: 1 << 5,
  CanFreeze: 1 << 6,
  CanCancelConfigChanges: 1 << 7,
  CanCancelSpend: 1 << 8,
  CanApprove: 1 << 9,
  CanAddOperator: 1 << 10,
  CanExecuteBypassCall: 1 << 11,
  CanCancelBypassCall: 1 << 12,
  CanSetAcceleratedCalls: 1 << 13,
  CanAddOperatorNow: 1 << 15
}

permissions.CanChangeConfig = permissions.CanUnfreeze | permissions.CanChangeParticipants | permissions.CanAddOperator | permissions.CanAddOperatorNow | permissions.CanChangeBypass | permissions.CanSetAcceleratedCalls 
permissions.CanCancel = permissions.CanCancelSpend | permissions.CanCancelConfigChanges | permissions.CanCancelBypassCall
permissions.OwnerPermissions = permissions.CanSpend | permissions.CanCancel | permissions.CanFreeze | permissions.CanChangeConfig | permissions.CanSignBoosts | permissions.CanExecuteBypassCall
permissions.AdminPermissions = permissions.CanExecuteBoosts | permissions.CanAddOperator
permissions.WatchdogPermissions = permissions.CanCancel | permissions.CanFreeze | permissions.CanApprove

module.exports = Object.freeze(permissions)
