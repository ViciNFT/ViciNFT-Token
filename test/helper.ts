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

export function decodeString(hexBytes: string): string {
  return w3.utils.hexToString(hexBytes);
}

export function encodeString(data: string): string {
  return w3.utils.padRight(w3.utils.stringToHex(data), 64);
}

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
    let eventData = txEvent.data;
    if (!eventData || eventData == "0x") {
      eventData = "";
      for (let i = 1; i < txEvent.topics.length; i++) {
        eventData += txEvent.topics[i].substring(2);
      }
      // console.log(
      //   "After building tx data",
      //   util.inspect(txEvent, { depth: null, colors: true })
      // );
    }
    txEvent.args = this.decodeParameters(eventData) as Result;
    return txEvent;
  }
}

/**
 * Convenience class for encoding/decoding calls to a function.
 */
export class FunctionABI extends FragmentABI {
  constructor(signature: string, func: FunctionFragment) {
    super(signature, func);
  }

  _selectorForFragment(signature: string): string {
    return w3.eth.abi.encodeFunctionSignature(signature);
  }

  _abiItemForFragment(frag: Fragment, inputs: AbiInput[]): AbiItem {
    let func = frag as FunctionFragment;
    let outputs: AbiOutput[] = [];

    if (func.outputs) {
      for (let output of func.outputs) {
        outputs.push({
          name: output.name,
          type: output.type,
        });
      }
    }

    return {
      inputs: inputs,
      name: func.name,
      outputs: outputs,
      stateMutability: _parseStateMutability(func.stateMutability),
      type: "function",
    };
  }

  /**
   * Returns the encoded call data. The first 8 bytes are the function selector.
   * @param params The stringified function parameters to be encoded.
   * @returns A hexidecimal string representing the call data.
   */
  encodeFunctionCall(params: string[]): string {
    return w3.eth.abi.encodeFunctionCall(this.abi, params);
  }
}

export interface DecodedArgument {
  parameter: AbiInput;
  value: any;
}

export interface DecodedFunctionCall {
  selector: string;
  signature: string;
  args: DecodedArgument[];
}

/**
 * Convenience class for encoding/decoding calls to all of a contract's
 * functions.
 */
export class ContractABI {
  functionsBySignature: Map<string, FunctionABI> = new Map();
  functionsBySelector: Map<string, FunctionABI> = new Map();

  eventsBySignature: Map<string, EventABI> = new Map();
  eventsBySelector: Map<string, EventABI> = new Map();

  constructor(contractInterface: Interface) {
    for (let f in contractInterface.functions) {
      let func = contractInterface.functions[f];
      if (func.type !== "function") continue;
      let functionABI = new FunctionABI(f, func);
      this.functionsBySignature.set(f, functionABI);
      this.functionsBySelector.set(functionABI.selector, functionABI);
    }

    for (let e in contractInterface.events) {
      let evt = contractInterface.events[e];
      if (evt.type !== "event") continue;
      let eventABI = new EventABI(e, evt);
      this.eventsBySignature.set(e, eventABI);
      this.eventsBySelector.set(eventABI.selector, eventABI);
    }
  }

  /**
   * Returns the encoded call data. The first 8 bytes are the function selector.
   * @param signature The function signature
   * @param params The parameters to be encoded
   * @returns A hexidecimal string representing the call data.
   * @throws Error if the contract has no matching signature.
   */
  encodeFunctionCall(signature: string, params: string[]): string {
    let functionABI = this.functionsBySignature.get(signature);
    if (!functionABI) {
      throw new Error(`No such function ${signature}`);
    }

    return functionABI.encodeFunctionCall(params);
  }

  /**
   * Returns a formatted string showing the function name, parameter names,
   * and parameter values.
   * @param calldata The encoded function call. The first 8 bytes must be the
   *     function selector.
   * @returns The decoded function call.
   * @throws Error if the contract has no matching selector.
   */
  decodeFunctionCall(calldata: string): DecodedFunctionCall {
    let selector = calldata.substring(0, 10);
    let functionABI = this.functionsBySelector.get(selector);
    if (!functionABI) {
      throw new Error(`No such function ${selector}`);
    }

    let decodedParams = functionABI.decodeParameters(calldata.substring(10));
    let args: DecodedArgument[] = [];

    if (functionABI.abi.inputs) {
      for (let i = 0; i < functionABI.abi.inputs.length; i++) {
        let paramName = functionABI.abi.inputs[i].name;
        args.push({
          parameter: functionABI.abi.inputs[i],
          value: decodedParams[paramName],
        });
      }
    }

    return {
      selector: functionABI.selector,
      signature: functionABI.signature,
      args: args,
    };
  }

  decodeEvent(txEvent: Event): Event {
    if (txEvent.event && txEvent.args) {
      // already decoded
      return txEvent;
    }

    let eventABI: EventABI | undefined;
    for (let topic of txEvent.topics) {
      eventABI = this.eventsBySelector.get(topic);
      if (eventABI) break;
    }
    if (!eventABI) {
      throw new Error("Unrecognized event");
    }

    return eventABI.decodeEvent(txEvent);
  }
}

function _parseType(abiType: string): AbiType {
  if (["function", "constructor", "event", "fallback"].includes(abiType)) {
    return abiType as AbiType;
  }

  throw new Error(`Invalid AbiType ${abiType}`);
}

function _parseStateMutability(mutability: string): StateMutabilityType {
  if (["pure", "view", "nonpayable", "payable"].includes(mutability)) {
    return mutability as StateMutabilityType;
  }

  throw new Error(`Invalid StateMutabilityType ${mutability}`);
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
