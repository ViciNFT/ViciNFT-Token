# Contract Addresses

| Contract | Polygon (137) | Base (8453) |
| ----------- | ----------- | ----------- |
| ProxyAdmin | [0x650FA7966F1D027dB14B1B2795aD52Da6F3d5586](https://polygonscan.com/address/0x650FA7966F1D027dB14B1B2795aD52Da6F3d5586) | [0x577E4a06469F2e19D997604c1bc2845fB4d889b2](https://basescan.org/address/0x577E4a06469F2e19D997604c1bc2845fB4d889b2) |
| AccessServer | [0x54D6970358A6BD193B7e98a92Ef0A1ecCcfBd704](https://polygonscan.com/address/0x54D6970358A6BD193B7e98a92Ef0A1ecCcfBd704) | [0x764659D3563b861C6b077EC95F8152c48493022A](https://basescan.org/address/0x764659D3563b861C6b077EC95F8152c48493022A) |
| MultiSigWalletWithSurvivorship | [0x2221726644f16D1E292821E78F0A986772207825](https://polygonscan.com/address/0x2221726644f16D1E292821E78F0A986772207825) | [0x47476b46056191ab2f28D387B215333193Bb6d5a](https://basescan.org/address/0x47476b46056191ab2f28D387B215333193Bb6d5a) |
| ViciERC20UtilityToken | [0x8a16D4bF8A0a716017e8D2262c4aC32927797a2F](https://polygonscan.com/address/0x8a16D4bF8A0a716017e8D2262c4aC32927797a2F) | [0xdCf5130274753c8050aB061B1a1DCbf583f5bFd0](https://basescan.org/address/0xdCf5130274753c8050aB061B1a1DCbf583f5bFd0) |
| ERC20UtilityOperations | [0xE2EA5B8CE1bD7B8A0759D5d67C88D561A4F5faAA](https://polygonscan.com/address/0xE2EA5B8CE1bD7B8A0759D5d67C88D561A4F5faAA) | [0x4844D11c51E6e85c1ED419dC77455894CdC5808E](https://basescan.org/address/0x4844D11c51E6e85c1ED419dC77455894CdC5808E) |
| LzBridgeableTokenTunnel | [0xF0d742E9dE57d7cFdED71a8F8D7cbE374E32B052](https://polygonscan.com/address/0xF0d742E9dE57d7cFdED71a8F8D7cbE374E32B052) | [0xad6f1B009A4773508bD8edce21bb1AF8B8BD81B8](https://basescan.org/address/0xad6f1B009A4773508bD8edce21bb1AF8B8BD81B8) |

# Granted Privileges
## Roles

| Name | Role | Role Admin |
| ----------- | ----------- | ----------- | 
| Default Admin | 0x0000000000000000000000000000000000000000000000000000000000000000 | Default Admin |
| Airdropper | 0x61697264726f7000000000000000000000000000000000000000000000000000 | Default Admin |
| Banned | 0x6d6f64657261746f720000000000000000000000000000000000000000000000 | Moderator |
| Bridge Contract | 0x3fd4a614bd02c8fb908a3b3a05852476cf4c63cfc1b7280860fd956aa0982f9f | Multisig Role | 
| Layer Zero Admin | 0x85c4600424d81fbff075e32085ae37829c97adaa85deea5fc84092ce10227b52 | Multisig Role |
| Moderator | 0x6d6f64657261746f720000000000000000000000000000000000000000000000 | Moderator |
| Multisig Role | 0x27a0e0781f72a06d50b78eb9d56998b852243f318c300d923009de3a499d0f90 | Multisig Role |
| Unlocker | 0x37249df393341b44efdd3346cab09b4c28cea741d58a8808e0d108ab3884652d | Multisig Role |


## Proxy Admin
### Polygon 

| Role | Purpose | Role Holder(s) | Role Admin |
| ----------- | ----------- | ----------- | ----------- |
| Owner | Upgrade contracts, change proxy admin | 0x2221726644f16D1E292821E78F0A986772207825 (MultiSig) | Owner |

### Base

| Role | Purpose | Role Holder(s) | Role Admin |
| ----------- | ----------- | ----------- | ----------- |
| Owner | Upgrade contracts, change proxy admin | 0x47476b46056191ab2f28D387B215333193Bb6d5a (MultiSig) | Owner |

## AccessServer
### Polygon 

| Role | Purpose | Role Holder(s) | Role Admin |
| ----------- | ----------- | ----------- | ----------- |
| Owner | Add/Remove administrators, configure sanctions oracle | 0x2221726644f16D1E292821E78F0A986772207825 (MultiSig) | Owner |
| Administrator | Grant/Revoke global roles | 0x2221726644f16D1E292821E78F0A986772207825 (MultiSig) | Administrator |
| Default Admin | Grant/Revoke most local roles  | 0x4c1833Cb42FF2f07Bd332D04A2100ebB570A7112 (contract deployer), 0x2221726644f16D1E292821E78F0A986772207825 (MultiSig)  | Default Admin |
| Multisig Role | Grant/Revoke sensitive roles | 0x2221726644f16D1E292821E78F0A986772207825 (MultiSig) | Multisig Role |
| Moderator | Ban/Unban addresses | 0x2221726644f16D1E292821E78F0A986772207825 (MultiSig) | Moderator |
| Proxy Admin | Upgrade this contract | 0x650FA7966F1D027dB14B1B2795aD52Da6F3d5586 (under multisig) | Proxy Admin Owner |

### Base

| Role | Purpose | Role Holder(s) | Role Admin |
| ----------- | ----------- | ----------- | ----------- |
| Owner | Add/Remove administrators, configure sanctions oracle |0x47476b46056191ab2f28D387B215333193Bb6d5a (MultiSig) | Owner |
| Administrator | Grant/Revoke global roles | 0x47476b46056191ab2f28D387B215333193Bb6d5a (MultiSig) | Administrator |
| Default Admin | Grant/Revoke most local roles  | 0x47476b46056191ab2f28D387B215333193Bb6d5a (MultiSig), 0x4c1833Cb42FF2f07Bd332D04A2100ebB570A7112 (contract deployer)  | Default Admin |
| Multisig Role | Grant/Revoke sensitive roles | 0x47476b46056191ab2f28D387B215333193Bb6d5a (MultiSig) | Multisig Role |
| Moderator | Ban/Unban addresses | 0x47476b46056191ab2f28D387B215333193Bb6d5a (MultiSig) | Moderator |
| Proxy Admin | Upgrade this contract | 0x577E4a06469F2e19D997604c1bc2845fB4d889b2 (under multisig) | Proxy Admin Owner |

## MultiSigWalletWithSurvivorship
### Polygon 

| Role | Purpose | Role Holder(s) | Role Admin |
| ----------- | ----------- | ----------- | ----------- |
| Owners | Submit/Confirm/Veto transactions | 0x76A3b4a5439B757a26aEe983E8F0F43Aee9c2835, 0xa2de1235724486E0EC19EF6a508Fb12CA9115A74, 0xA2a87e3EdD54331048624e98a5a5116Cb5f5ccC0, 0x1b9b95Df34B2A4912607Ede3e3fef66D647A90b3, 0x5d50254B58B38519Bde94F320443E3b462d986eA, 0x8c29620A873e4755Ea5bd58A68F49644F4BDf4Ef | Owners |
| Requirement | Number of confirmations required | 2 | Owners |
| Time lock | Time to wait before execution | None | Owners |
| Proxy Admin | Upgrade this contract | 0x650FA7966F1D027dB14B1B2795aD52Da6F3d5586 (under multisig) | Proxy Admin Owner |

### Base 

| Role | Purpose | Role Holder(s) | Role Admin |
| ----------- | ----------- | ----------- | ----------- |
| Owners | Submit/Confirm/Veto transactions | 0x76A3b4a5439B757a26aEe983E8F0F43Aee9c2835, 0xa2de1235724486E0EC19EF6a508Fb12CA9115A74, 0xA2a87e3EdD54331048624e98a5a5116Cb5f5ccC0, 0x1b9b95Df34B2A4912607Ede3e3fef66D647A90b3, 0x5d50254B58B38519Bde94F320443E3b462d986eA, 0x8c29620A873e4755Ea5bd58A68F49644F4BDf4Ef | Owners |
| Requirement | Number of confirmations required | 2 | Owners |
| Time lock | Time to wait before execution | None | Owners |
| Proxy Admin | Upgrade this contract | 0x577E4a06469F2e19D997604c1bc2845fB4d889b2 (under multisig) | Proxy Admin Owner |

## ViciERC20UtilityToken
### Polygon 

| Role | Purpose | Role Holder(s) | Role Admin |
| ----------- | ----------- | ----------- | ----------- |
| Owner | Recover Assets | 0x2221726644f16D1E292821E78F0A986772207825 (MultiSig) | Owner |
| Bridge Contract | Mint and burn in response to bridge events | 0xF0d742E9dE57d7cFdED71a8F8D7cbE374E32B052 (Bridgeable token tunnel) | Multisig Role |
| Airdropper | Send locked tokens | 0x8CFA6AbC294494212a7C42FA1C5668eb25049D64, 0x2221726644f16D1E292821E78F0A986772207825, 0x5d50254B58B38519Bde94F320443E3b462d986eA, 0xa2de1235724486E0EC19EF6a508Fb12CA9115A74, 0xc9f6B80Cd8Ec8eC7A8321Df9c0b3e6361b39929C, 0xA2a87e3EdD54331048624e98a5a5116Cb5f5ccC0, 0x4c1833Cb42FF2f07Bd332D04A2100ebB570A7112 | Default Admin |
| Unlocker | Unlock Locked Tokens, update lock release | not granted (Owner) | Multisig Role |
| Proxy Admin | Upgrade this contract | 0x650FA7966F1D027dB14B1B2795aD52Da6F3d5586 (under multisig) | Proxy Admin Owner |

### Base 

| Role | Purpose | Role Holder(s) | Role Admin |
| ----------- | ----------- | ----------- | ----------- |
| Owner | Recover Assets | 0x47476b46056191ab2f28D387B215333193Bb6d5a (MultiSig) | Owner |
| Bridge Contract | Mint and burn in response to bridge events | 0xad6f1B009A4773508bD8edce21bb1AF8B8BD81B8 (Bridgeable token tunnel) | Multisig Role |
| Airdropper | Send locked tokens | 0x8CFA6AbC294494212a7C42FA1C5668eb25049D64, 0x2221726644f16D1E292821E78F0A986772207825, 0x5d50254B58B38519Bde94F320443E3b462d986eA, 0xa2de1235724486E0EC19EF6a508Fb12CA9115A74, 0xc9f6B80Cd8Ec8eC7A8321Df9c0b3e6361b39929C, 0xA2a87e3EdD54331048624e98a5a5116Cb5f5ccC0, 0x4c1833Cb42FF2f07Bd332D04A2100ebB570A7112 | Default Admin |
| Unlocker | Unlock Locked Tokens, update lock release | not granted (Owner) | Multisig Role |
| Proxy Admin | Upgrade this contract | 0x577E4a06469F2e19D997604c1bc2845fB4d889b2 (under multisig) | Proxy Admin Owner |


## LzBridgeableTokenTunnel
### Polygon 

| Role | Purpose | Role Holder(s) | Role Admin |
| ----------- | ----------- | ----------- | ----------- |
| Owner | No special privs | 0x2221726644f16D1E292821E78F0A986772207825 (MultiSig) | Owner |
| Layer Zero Admin | Configure parameters | not granted (Owner) | Multisig Role |
| Proxy Admin | Upgrade this contract | 0x650FA7966F1D027dB14B1B2795aD52Da6F3d5586 (under multisig) | Proxy Admin Owner |

### Base 

| Role | Purpose | Role Holder(s) | Role Admin |
| ----------- | ----------- | ----------- | ----------- |
| Owner |No special privs | 0x47476b46056191ab2f28D387B215333193Bb6d5a (MultiSig) | Owner |
| Layer Zero Admin | Configure parameters | not granted (Owner) | Multisig Role |
| Proxy Admin | Upgrade this contract | 0x577E4a06469F2e19D997604c1bc2845fB4d889b2 (under multisig) | Proxy Admin Owner |


