import { ChildProcessWithoutNullStreams, execSync, spawn } from "child_process";
import { DEBUG } from "./env.js";
import { JSONRPCClient } from "json-rpc-2.0";
import * as readline from "readline";
import EventEmitter from "events";

export interface SignalMember {
  number: string | null;
  uuid: string;
}

export interface SignalMemberStatus extends SignalMember {
  recipient: string;
  isRegistered: boolean;
}

export type SignalGroupPermission = "EVERY_MEMBER" | "ONLY_ADMINS";

export interface SignalGroup {
  id: string;
  name: string;
  description: string;
  isMember: boolean;
  isBlocked: boolean;
  messageExpirationTime: number;
  members: SignalMember[];
  pendingMembers: SignalMember[];
  requestingMembers: SignalMember[];
  admins: SignalMember[];
  permissionAddMember: SignalGroupPermission;
  permissionEditDetails: SignalGroupPermission;
  permissionSendMessage: SignalGroupPermission;
  groupInviteLink: string | null;
}

export interface SignalTypingMessage {
  action: "STARTED";
  timestamp: number; // milliseconds
  groupId?: string;
}

export interface SignalDataMessage {
  timestamp: number; // milliseconds
  message: string;
  expiresInSeconds: number;
  viewOnce: boolean;
  groupInfo?: {
    groupId: string;
    type: "DELIVER";
  };
}

export interface SignalMessageReceived {
  envelope: {
    source: string;
    sourceNumber: string;
    sourceUuid: string;
    sourceName: string;
    sourceDevice: number;
    timestamp: number; // milliseconds
    dataMessage?: SignalDataMessage;
    typingMessage?: SignalTypingMessage;
  };
  account: string;
  subscription: number;
}

const SIGNAL_CLI_DATA_DIR = "./.signal-cli-data";

export const SIGNAL_USER = process.env.SIGNAL_USER;
if (!SIGNAL_USER) {
  throw new Error("SIGNAL_USER not set.");
}

const SIGNAL_CLI = process.env.SIGNAL_CLI || execSync("which signal-cli").toString();
if (!SIGNAL_CLI) {
  throw new Error("signal-cli not found. Set SIGNAL_CLI add signal-cli to PATH.");
}
const SIGNAL_CLI_ARGS = ["--config", SIGNAL_CLI_DATA_DIR, "-u", SIGNAL_USER, "--trust-new-identities", "always"];

const SIGTERM = 143;

export default class SignalCli {
  private process: ChildProcessWithoutNullStreams;
  private rpcClient: JSONRPCClient;
  private eventEmitter = new EventEmitter();

  constructor() {
    this.process = spawn(SIGNAL_CLI, [...SIGNAL_CLI_ARGS, "jsonRpc"]);

    this.process.addListener("exit", (code) => {
      if (code && code !== SIGTERM) {
        console.error(`signal-cli exited with code ${code}`);
        process.exit(code);
      }
    });

    this.process.addListener("error", (error) => {
      throw error;
    });

    this.rpcClient = new JSONRPCClient(async (request) => {
      DEBUG && console.log("signal-cli request", request);
      this.process.stdin.write(JSON.stringify(request));
      this.process.stdin.write("\n");
    });

    const lineReader = readline.createInterface({ input: this.process.stdout });
    lineReader.on("line", (responseStr) => {
      const response = JSON.parse(responseStr);
      DEBUG && console.log("signal-cli response", response);
      this.rpcClient.receive(response);
      if (response.method === "receive") {
        this.eventEmitter.emit("receive", response.params);
      }
    });
  }

  public addListener(eventName: "receive", listener: (message: SignalMessageReceived) => void) {
    this.eventEmitter.addListener(eventName, listener);
  }

  public removeListener(eventName: "receive", listener: (message: SignalMessageReceived) => void) {
    this.eventEmitter.removeListener(eventName, listener);
  }

  public close() {
    this.eventEmitter.removeAllListeners();
    this.process.kill(); // Causes SIGTERM
  }

  public async getUserStatus(...numbers: string[]) {
    return (await this.rpcClient.request("getUserStatus", { recipient: numbers })) as SignalMemberStatus[];
  }

  public async listGroups() {
    return (await this.rpcClient.request("listGroups")) as SignalGroup[];
  }

  public async filterSignalNumbers(numbers: string[]) {
    return (await this.getUserStatus(...numbers))
      .filter((user) => user.isRegistered)
      .map((user) => user.number)
      .filter((number): number is string => Boolean(number));
  }

  public async setGroupPermissions(
    groupId: string,
    permissions: Partial<
      Record<
        "setPermissionAddMember" | "setPermissionEditDetails" | "setPermissionSendMessages",
        "every-member" | "only-admins"
      >
    >
  ) {
    return (await this.rpcClient.request("updateGroup", { groupId, ...permissions })) as SignalGroup[];
  }

  public async sendReceipt(number: string, targetTimestamp: number, type: "read" | "viewed" = "read") {
    return await this.rpcClient.request("sendReceipt", { recipient: number, targetTimestamp, type });
  }

  public async createGroup(name: string, adminNumbers: string[]) {
    const validNumbers = await this.filterSignalNumbers(adminNumbers);

    if (validNumbers.length === 0) {
      console.warn(`No valid numbers to add to new group "${name}"`);
      return;
    }

    return (await this.rpcClient.request("updateGroup", {
      name,
      members: validNumbers,
      admin: validNumbers,
    })) as SignalGroup[];
  }

  public async addNumbersToGroup(groupId: string, numbers: string[]) {
    // TODO: warn when a user is not a Signal user

    const validNumbers = await this.filterSignalNumbers(numbers);

    if (validNumbers.length === 0) {
      console.warn(`No valid numbers to add to group ${groupId}`);
      return;
    }

    return (await this.rpcClient.request("updateGroup", { groupId, members: validNumbers })) as SignalGroup[];
  }

  public async removeNumbersFromGroup(groupId: string, numbers: string[]) {
    // TODO: warn when a user is not a Signal user

    const validNumbers = await this.filterSignalNumbers(numbers);

    if (validNumbers.length === 0) {
      console.warn(`No valid numbers to add to group ${groupId}`);
      return;
    }

    return (await this.rpcClient.request("updateGroup", { groupId, removeMembers: validNumbers })) as SignalGroup[];
  }
}
