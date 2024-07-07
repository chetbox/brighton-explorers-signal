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

const SIGNAL_CLI = process.env.SIGNAL_CLI || execSync("which signal-cli").toString().trim();
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
    this.process = this.spawnSignalCli();
    this.rpcClient = this.setupRpcClient(this.process);
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

  /**
   * This should only be called with a few numbers at a time in short succession
   *
   * This is to work around the error `4008 (CdsiResourceExhaustedException)`
   * which - from May 2023 - seems to happen when `getUserStatus` is called with a lot of numbers
   * (e.g. with ~85 numbers we get this error for most calls to `getUserStatus` when running every 4 hours)
   */
  private async getUserStatus(...numbers: string[]) {
    return (await this.rpcClient.request("getUserStatus", { recipient: numbers })) as SignalMemberStatus[];
  }

  public async sendMessage(recipient: string, message: string) {
    return await this.rpcClient.request("send", { recipient, message });
  }

  public async listGroups() {
    return (await this.rpcClient.request("listGroups", {})) as SignalGroup[];
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
    return (await this.withTimeout(this.rpcClient.request("updateGroup", { groupId, ...options }))) as SignalGroup[];
  }

  public async resetGroupLink(groupId: string) {
    return (await this.withTimeout(
      this.rpcClient.request("updateGroup", { groupId, resetLink: true })
    )) as SignalGroup[];
  }

  public async sendReceipt(number: string, targetTimestamp: number, type: "read" | "viewed" = "read") {
    return await this.withTimeout(this.rpcClient.request("sendReceipt", { recipient: number, targetTimestamp, type }));
  }

  public async createGroup(name: string, adminNumbers: string[]) {
    if (adminNumbers.length === 0) {
      console.warn(`No numbers to add to new group "${name}"`);
      return;
    }

    return (await this.withTimeout(
      this.rpcClient.request("updateGroup", {
        name,
        members: adminNumbers,
        admin: adminNumbers,
      })
    )) as SignalGroup[];
  }

  /**
   * Ignores numbers that are not registered on Signal
   */
  public async addNumbersToGroup(groupId: string, members: string[]) {
    if (members.length === 0) {
      console.warn(`No numbers to add to group ${groupId}`);
      return;
    }

    // Attempt to add members as a batch
    // This may fail if any of the numbers are not registered on Signal
    try {
      return (await this.withTimeout(this.rpcClient.request("updateGroup", { groupId, members }))) as SignalGroup[];
    } catch (error) {
      console.warn(
        "Failed to add members as a batch, trying one-by-one",
        DEBUG ? error : (error as Error).message.replace(/\+[0-9]+/g, "[REDACTED]")
      );
      for (let i = 0; i < members.length; i++) {
        const member = members[i];
        try {
          await new Promise((resolve) => setTimeout(resolve, 125)); // Avoid rate limiting
          await this.withTimeout(this.rpcClient.request("updateGroup", { groupId, members: [member] }));
        } catch (error) {
          console.warn(
            `Failed to add member ${i}/${members.length} to group ${groupId}`,
            DEBUG ? error : (error as Error).message.replace(/\+[0-9]+/g, "[REDACTED]")
          );
        }
      }
    }
  }

  public async removeNumbersFromGroup(groupId: string, removeMembers: string[]) {
    if (removeMembers.length === 0) {
      console.warn(`No numbers to remove from group ${groupId}`);
      return;
    }

    try {
      return (await this.withTimeout(
        this.rpcClient.request("updateGroup", { groupId, removeMembers })
      )) as SignalGroup[];
    } catch (error) {
      console.warn(
        `Failed to remove ${removeMembers.length} members from group`,
        DEBUG ? error : (error as Error).message.replace(/\+[0-9]+/g, "[REDACTED]")
      );
    }
  }

  private spawnSignalCli() {
    const signalCliProcess = spawn(SIGNAL_CLI, [...SIGNAL_CLI_ARGS, "jsonRpc", "--receive-mode=on-start"]);

    signalCliProcess.addListener("exit", (code) => {
      if (code && code !== SIGTERM) {
        console.error(`signal-cli exited with code ${code}`);
        process.exit(code);
      }
    });

    signalCliProcess.addListener("error", (error) => {
      throw error;
    });

    return signalCliProcess;
  }

  private setupRpcClient(signalCliProcess: ChildProcessWithoutNullStreams) {
    const rpcClient = new JSONRPCClient(async (request) => {
      DEBUG && console.log("signal-cli request", request);
      signalCliProcess.stdin.write(JSON.stringify(request));
      signalCliProcess.stdin.write("\n");
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

    return rpcClient;
  }

  private async withTimeout<T>(promise: PromiseLike<T>): Promise<T> {
    let timeout: NodeJS.Timeout;

    return Promise.race([
      promise,
      new Promise<T>(
        (_, reject) =>
          (timeout = setTimeout(async () => {
            reject(new Error("Timeout"));
          }, 5000))
      ),
    ]).finally(() => {
      clearTimeout(timeout);
    });
  }
}

export function getSignalNumber(user: SignalMemberStatus) {
  return user.isRegistered ? user.number : null;
}
