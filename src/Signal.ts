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

export type SignalGroupLinkState = "enabled" | "enabled-with-approval" | "disabled";

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
    const statuses: (SignalMemberStatus | null)[] = [];

    // Call `getUserStatus` for a few numbers rather than all at once like we used to
    // This is to work around the error `4008 (CdsiResourceExhaustedException)`
    // which - from May 2023 - seems to happen when `getUserStatus` is called with a lot of numbers
    // (e.g. with ~85 numbers we get this error for most calls to `getUserStatus` when running every 4 hours)
    const sliceSize = 10;
    for (let i = 0; i < numbers.length; i += sliceSize) {
      const numbersSlice = numbers.slice(i, i + sliceSize);
      try {
        statuses.push(
          ...((await this.rpcClient.request("getUserStatus", { recipient: numbersSlice })) as SignalMemberStatus[])
        );
      } catch (error) {
        console.warn(`Error getting user status for ${sliceSize} numbers:`, DEBUG ? numbersSlice : "", error);
        statuses.push(...new Array(i).fill(null));
      }
      await new Promise((resolve) => setTimeout(resolve, 5000)); // Avoid "HTTP 429 (Too Many Requests)" rate limit error
    }

    return statuses;
  }

  public async sendMessage(recipient: string, message: string) {
    return await this.rpcClient.request("send", { recipient, message });
  }

  public async listGroups() {
    return (await this.rpcClient.request("listGroups")) as SignalGroup[];
  }

  public async setGroupPermissions(
    groupId: string,
    options: {
      permissions?: Partial<
        Record<
          "setPermissionAddMember" | "setPermissionEditDetails" | "setPermissionSendMessages",
          "every-member" | "only-admins"
        >
      >;
      link?: SignalGroupLinkState;
    }
  ) {
    return (await this.rpcClient.request("updateGroup", { groupId, ...options })) as SignalGroup[];
  }

  public async resetGroupLink(groupId: string) {
    return (await this.rpcClient.request("updateGroup", { groupId, resetLink: true })) as SignalGroup[];
  }

  public async sendReceipt(number: string, targetTimestamp: number, type: "read" | "viewed" = "read") {
    return await this.rpcClient.request("sendReceipt", { recipient: number, targetTimestamp, type });
  }

  public async createGroup(name: string, adminNumbers: string[]) {
    if (adminNumbers.length === 0) {
      console.warn(`No numbers to add to new group "${name}"`);
      return;
    }

    return (await this.rpcClient.request("updateGroup", {
      name,
      members: adminNumbers,
      admin: adminNumbers,
    })) as SignalGroup[];
  }

  public async addNumbersToGroup(groupId: string, members: string[]) {
    if (members.length === 0) {
      console.warn(`No numbers to add to group ${groupId}`);
      return;
    }

    return (await this.rpcClient.request("updateGroup", { groupId, members })) as SignalGroup[];
  }

  public async removeNumbersFromGroup(groupId: string, removeMembers: string[]) {
    if (removeMembers.length === 0) {
      console.warn(`No numbers to remove from group ${groupId}`);
      return;
    }

    return (await this.rpcClient.request("updateGroup", { groupId, removeMembers })) as SignalGroup[];
  }
}

export function getSignalNumber(user: SignalMemberStatus) {
  return user.isRegistered ? user.number : null;
}
