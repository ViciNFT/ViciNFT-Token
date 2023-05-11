/*
 * Created on Thu Jul 26 2022
 *
 * @author Josh Davis <josh.davis@vicinft.com>
 * Copyright (c) 2022 ViciNFT
 */

import {
  AbiInput,
  AbiItem,
  AbiOutput,
  AbiType,
  StateMutabilityType,
} from "web3-utils";
import { ContractReceipt, Event } from "ethers";
import { expect } from "chai";
import {
  EventFragment,
  Fragment,
  FunctionFragment,
  Interface,
  Result,
} from "ethers/lib/utils";
import Web3 from "web3";

const w3 = new Web3();

export abstract class FragmentABI {
  /**
   * The function name.
   */
  name: string;

  /**
   * The full function signature.
   */
  signature: string;

  /**
   * The 8 byte function selector, computed as a hash of the signature.
   */
  selector: string;

  /**
   * The function ABI
   */
  abi: AbiItem;

  /**
   * The types of the function parameters.
   */
  parameters: Array<string>;

  constructor(signature: string, frag: Fragment) {
    this.name = frag.name;
    this.signature = signature;
    this.selector = this._selectorForFragment(signature);

    this.parameters = [];
    let inputs: AbiInput[] = [];

    for (let input of frag.inputs) {
      inputs.push({
        name: input.name,
        type: input.type,
      });

      this.parameters.push(input.type);
    }

    this.abi = this._abiItemForFragment(frag, inputs);
  }

  abstract _selectorForFragment(signature: string): string;

  abstract _abiItemForFragment(frag: Fragment, inputs: AbiInput[]): AbiItem;

  /**
   *
   * @param paramHex The function paramters encoded as a hexidecimal string.
   *     This value must not include the function selector. Strip it out with
   *     `calldata.substring(10)`.
   * @returns An object with {parameterName: value}
   */
  decodeParameters(paramHex: string): { [key: string]: any } {
    if (this.abi.inputs)
      return w3.eth.abi.decodeParameters(this.abi.inputs, paramHex);

    return w3.eth.abi.decodeParameters(this.parameters, paramHex);
  }
}

export class EventABI extends FragmentABI {
  constructor(signature: string, eventFrag: EventFragment) {
    super(signature, eventFrag);
  }

  _selectorForFragment(signature: string): string {
    return w3.utils.soliditySha3(signature) as string;
  }

  _abiItemForFragment(frag: Fragment, inputs: AbiInput[]): AbiItem {
    return {
      inputs: inputs,
      name: frag.name,
      type: "event",
    };
  }

  _isInstance(candidate: Event): boolean {
    return (
      this.signature == candidate.eventSignature ||
      candidate.topics.includes(this.selector)
    );
  }

  decodeEvent(txEvent: Event): Event {
    if (!this._isInstance(txEvent)) {
      throw new Error("Unrecognized event");
    }

    if (txEvent.event && txEvent.args) {
      // already decoded
      return txEvent;
    }

    txEvent.event = this.name;
    txEvent.args = this.decodeParameters(txEvent.data) as Result;
    return txEvent;
  }
}

function _isThisTheEventWereLookingFor(
  criteria: EventABI | string,
  candidate: Event
): boolean {
  if (typeof criteria == "string") {
    return candidate.eventSignature == criteria || candidate.event == criteria;
  }

  return criteria._isInstance(candidate);
}

function _normalizeEvent(criteria: EventABI | string, candidate: Event): Event {
  if (typeof criteria == "string") {
    return candidate;
  }

  return criteria.decodeEvent(candidate);
}

export function checkEvent(
  event: Event | null,
  values: { [key: string]: any }
) {
  expect(event).to.be.not.null;

  let args = event?.args as Result;
  // console.log("args=", args);
  for (let [key, value] of Object.entries(values)) {
    // console.log(`is args[${key}] == ${value}?`);
    expect(args).to.have.deep.property(key, value);
  }
}

/**
 * Returns the first event with the given name from the transaction receipt.
 * Returns null if the receipt has no such event.
 * @param receipt the transaction receipt, from `await tx.wait()`
 * @param eventName the Solidity event name
 * @returns the Event, if present.
 */
export function getEventFromReceipt(
  receipt: ContractReceipt,
  criteria: EventABI | string
): Event | null {
  if (!receipt.events) {
    return null;
  }

  for (let i = 0; i < receipt.events.length; i++) {
    if (_isThisTheEventWereLookingFor(criteria, receipt.events[i])) {
      return _normalizeEvent(criteria, receipt.events[i]);
    }
  }

  return null;
}

export function expectEvent(
  receipt: ContractReceipt,
  criteria: EventABI | string,
  values: { [key: string]: any }
) {
  // console.log("receipt=", receipt);
  let event = getEventFromReceipt(receipt, criteria);
  checkEvent(event, values);
}

export function expectArray(actual: any[], expected: any[]) {
  expect(actual).to.be.an("array");
  expect(actual.length).to.equal(expected.length);
  for (let i = 0; i < expected.length; i++) {
    expect(actual[i]).to.equal(expected[i]);
  }
}

/**
 * Sleep for the duration. Use as
 * `await sleep(2000);`
 *
 * @param milliseconds how long to sleep
 * @returns sleep handle
 */
export async function sleep(milliseconds: number): Promise<any> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
