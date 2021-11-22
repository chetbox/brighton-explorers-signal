import { ALL_ACTIVITIES, getActiveUsers, MyClubhouseUser } from "./myclubhouse.js";
import { execSync } from "child_process";

const SIGNAL_CLI = process.env.SIGNAL_CLI || execSync("which signal-cli").toString();
if (!SIGNAL_CLI) {
  throw new Error("signal-cli no found. Set SIGNAL_CLI add signal-cli to PATH.");
}

const SIGNAL_USER = process.env.SIGNAL_USER;
if (!SIGNAL_USER) {
  throw new Error("SIGNAL_USER not set.");
}

const SIGNAL_GROUP_IDS = {
  Committee: "X53nkGftCmc/j4SXjXJjzyVyTeGi0t+j/lkC5PSEVB0=",
} as const;

function exec(command: string) {
  if (process.env.NODE_ENV !== "production") {
    console.log("*", command);
  }
  return execSync(command).toString();
}

function getUserStatus(
  ...numbers: string[]
): { recipient: string; number: string; uuid: string; isRegistered: boolean }[] {
  return JSON.parse(
    exec(`${SIGNAL_CLI} -o json -u "${SIGNAL_USER}" getUserStatus ${numbers.map((number) => `"${number}"`).join(" ")}`)
  );
}

function filterSignalNumbers(numbers: string[]): typeof numbers {
  return getUserStatus(...numbers)
    .filter((user) => user.isRegistered)
    .map((user) => user.number);
}

function normalizePhoneNumber(phoneNumber: string) {
  // TODO: properly clean country code of phone numbers
  if (phoneNumber.startsWith("0")) {
    return phoneNumber.replace(/^0/, "+44");
  } else {
    return phoneNumber;
  }
}

function phoneNumbers(users: MyClubhouseUser[]) {
  return users.map((user) => normalizePhoneNumber(user.MobileTelephone));
}

function addNumbersToGroup(groupId: string, numbers: string[]) {
  console.log(
    // TODO: warn when a user is not a Signal user
    exec(
      `${SIGNAL_CLI} -u "${SIGNAL_USER}" updateGroup -g "${SIGNAL_GROUP_IDS.Committee}" -m ${filterSignalNumbers(
        numbers
      )
        .map((number) => `"${number}"`)
        .join(" ")}`
    )
  );
}

async function main() {
  const users = await getActiveUsers();

  const committeeUsers = users.filter((user) => user.Roles?.some((role) => role.Name === "Committee Member"));

  const activityUsers = ALL_ACTIVITIES.map(
    (activity) =>
      [
        activity,
        users.filter((user) =>
          user.Attributes.Activities?.some((activityPreference) => activityPreference === activity)
        ),
      ] as const
  );

  addNumbersToGroup(SIGNAL_GROUP_IDS.Committee, phoneNumbers(committeeUsers));

  // TODO: activities
}

main();
