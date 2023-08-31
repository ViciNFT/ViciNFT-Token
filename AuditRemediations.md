# Audit Remediations

## Medium
### VCNFT-3: Inconsistent use of whenNotPaused modifier
Removed all uses of whenNotPaused. It isn't necessary.

### VCNFT-2: Lack of two-step ownership transfer
We may revisit in the future, but we don't consider this a risk because the ownership is transferred to the multisignature wallet where it will remain.

### VCNFT-15: Centralization risk for the AccessServer contract
1. Transferred ownership to the multisignature wallet contract
1. Removed the contract deployer as an administrator, leaving multisigunature wallet contract as the only administrator.

## Low
### VCNFT-5: Duplicate functionality for checking if address has role
Removed the duplicate function.

### VCNFT-13: The getTransactionIds function might return incorrect result
1. Added unit test to reproduce the issue
1. Fixed the logic in the function

### VCNFT-14: Add default constructor that calls _disableInitializers()
Added this constructor the the base Initializer contract, so all child contracts now have this.

## Informational
### VCNFT-9: Default value initialization
Won't fix. In my opinion, the improved readability from the explicit initialization is worth the extra gas paid on deployment.

### VCNFT-7: Constant variable should be marked as private
Marked it as internal.

## Other / Not mentioned
### In MultiSigWalletWithSurvivorship
* added a `REVERTED` transaction status
* added a `reason` field to the `ExecutionFailure` event.
* modified `_executeTransaction()` to capture the revert reason and set the status to `REVERTED`.

### In Wallet
* added a revert string to the `require` statements in all of the internal withdraw functions.

### In ViciERC20
* removed public `mint` and `burn` functions, and moved to new subclass `ViciMintableERC20`.