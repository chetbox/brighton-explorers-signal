import { execSync } from "child_process";
import { DEBUG } from "./env.js";

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

const SIGNAL_CLI_DATA_DIR = "./.signal-cli-data";

let SIGNAL_CLI = process.env.SIGNAL_CLI || execSync("which signal-cli").toString();
if (!SIGNAL_CLI) {
  throw new Error("signal-cli no found. Set SIGNAL_CLI add signal-cli to PATH.");
}
SIGNAL_CLI = `${SIGNAL_CLI} --config "${SIGNAL_CLI_DATA_DIR}"`;

export const USER = process.env.SIGNAL_USER;
if (!USER) {
  throw new Error("SIGNAL_USER not set.");
}

function exec(command: string) {
  if (DEBUG) {
    console.log("$", command);
  }
  return execSync(command).toString();
}

function filterSignalNumbers(numbers: string[]): typeof numbers {
  return getUserStatus(...numbers)
    .filter((user) => user.isRegistered)
    .map((user) => user.number)
    .filter((number): number is string => Boolean(number));
}

export function receiveMessages() {
  exec(`${SIGNAL_CLI} -o json -u "${USER}" receive`);
}

export function getUserStatus(...numbers: string[]): SignalMemberStatus[] {
  return JSON.parse(
    exec(`${SIGNAL_CLI} -o json -u "${USER}" getUserStatus ${numbers.map((number) => `"${number}"`).join(" ")}`)
  );
}

export function listGroups(): SignalGroup[] {
  return JSON.parse(exec(`${SIGNAL_CLI} -o json -u "${USER}" listGroups -d`));
}

export function addNumbersToGroup(groupId: string, numbers: string[]) {
  // TODO: warn when a user is not a Signal user

  const validNumbers = filterSignalNumbers(numbers);

  if (validNumbers.length === 0) {
    console.warn(`No valid numbers to add to group ${groupId}`);
    return;
  }

  const result = exec(
    `${SIGNAL_CLI} -u "${USER}" updateGroup -g "${groupId}" -m ${validNumbers.map((number) => `"${number}"`).join(" ")}`
  );
  DEBUG && console.log(result);
}

export function removeNumbersFromGroup(groupId: string, numbers: string[]) {
  const result = exec(
    `${SIGNAL_CLI} -u "${USER}" updateGroup -g "${groupId}" -r ${filterSignalNumbers(numbers)
      .map((number) => `"${number}"`)
      .join(" ")}`
  );
  DEBUG && console.log(result);
}

export function setGroupPermissions(
  groupId: string,
  permissions: Partial<Record<"add-member" | "edit-details" | "send-messages", "every-member" | "only-admins">>
) {
  const args = Object.entries(permissions)
    .map(([name, value]) => `--set-permission-${name} "${value}"`)
    .join(" ");
  const result = exec(`${SIGNAL_CLI} -o json -u "${USER}" updateGroup -g "${groupId}" ${args}`);
  DEBUG && console.log(result);
}
