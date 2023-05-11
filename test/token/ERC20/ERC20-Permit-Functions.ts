import { TypedDataUtils } from "eth-sig-util";
import { ecsign, ECDSASignature } from "ethereumjs-util";
import {
  keccak256,
  defaultAbiCoder,
  toUtf8Bytes,
  solidityPack,
} from "ethers/lib/utils";
import {
  BigNumberish,
} from "ethers";

const version = "1";

export const EIP712Domain = [
  { name: "name", type: "string" },
  { name: "version", type: "string" },
  { name: "chainId", type: "uint256" },
  { name: "verifyingContract", type: "address" },
];

export const Permit = [
  { name: "owner", type: "address" },
  { name: "spender", type: "address" },
  { name: "value", type: "uint256" },
  { name: "nonce", type: "uint256" },
  { name: "deadline", type: "uint256" },
];

export async function domainSeparator(
  name: string,
  version: string,
  chainId: number,
  verifyingContract: string
): Promise<string> {
  return (
    "0x" +
    TypedDataUtils.hashStruct(
      "EIP712Domain",
      { name, version, chainId, verifyingContract },
      { EIP712Domain }
    ).toString("hex")
  );
}

export const sign = (digest: String, privateKey: Buffer): ECDSASignature => {
  return ecsign(Buffer.from(digest.slice(2), "hex"), privateKey);
};

export const PERMIT_TYPEHASH = keccak256(
  toUtf8Bytes(
    "Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)"
  )
);

export async function getPermitDigest(
  name: string,
  address: string,
  chainId: number,
  approve: {
    owner: string;
    spender: string;
    value: BigNumberish;
  },
  nonce: BigNumberish,
  deadline: BigNumberish
): Promise<String> {
  const DOMAIN_SEPARATOR = await domainSeparator(
    name,
    version,
    chainId,
    address
  );
  return keccak256(
    solidityPack(
      ["bytes1", "bytes1", "bytes32", "bytes32"],
      [
        "0x19",
        "0x01",
        DOMAIN_SEPARATOR,
        keccak256(
          defaultAbiCoder.encode(
            ["bytes32", "address", "address", "uint256", "uint256", "uint256"],
            [
              PERMIT_TYPEHASH,
              approve.owner,
              approve.spender,
              approve.value,
              nonce,
              deadline,
            ]
          )
        ),
      ]
    )
  );
}
