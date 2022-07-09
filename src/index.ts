import { DEBUG, DRY_RUN } from "./env.js";
import { getActiveUsers, MyClubhouseActivity, MyClubhouseUser } from "./myclubhouse.js";
import Signal, { SIGNAL_USER } from "./Signal.js";

const ACTIVITIES_ENABLED: MyClubhouseActivity[] = [];

const SIGNAL_GROUP_IDS: Readonly<Record<"Committee" | MyClubhouseActivity, string>> = {
  Committee: "jkhJAZMMjA8eHDyrCDOC3d8D+L1DKhacSa0GF+UDyFM=",
  Badminton: "r9p6NuU4Tyoba+4S6YRGS0TouoOB/1q3H2RurkA1rB8=",
  Caving: "cwEah5FIN5kmb/V9mFhj5fsGIWFpfhDGCHqCyKB1ScM=",
  Climbing: "w8AwJdbepA3L9uk0EfSUCV/B55aMb91Wk/QzFe1lJQ4=",
  "Cycling (Road)": "NBDEaOhg0NtcnG60br2wqStuMErd+WzIyLjign/WZu8=",
  Kayaking: "lpO3ITpYHYUTpurgBfCU4+b1VFKXSybxDHmxtTcctKc=",
  "Mountain Biking": "qBoUTmPas3r1cosXWtRGjHBGfFCoHR49boSTUv2Jo88=",
  "Mountain Sports": "uReIWxXU2qjhrBU66mTQgnId1FGjCy9H2VProk+xyQk=",
  "Stand Up Paddleboarding (SUP)": "Wg3hY3TnQANxXrufiA7ucgOgcBDW6DVjneDLeI+urEE=",
  Surfing: "u0T8evlaYze+apskNR9Bj+b4nyNfjl04bIn/urNiTdM=",
  Tennis: "F49SXaZVkGkyzFhSYvEZxK5GXX4CqEZt9zcYToRjA1c=",
  Walking: "hYgu8Lu7JVPE1sSP9JooUn7/PvSV9SQhwg8IzkQcTFE=",
  Windsurfing: "szh6ZQ5FDPeshx6gjyn980sJeAk/oswNlaOrSPT9zgg=",
  Running: "cLYnB3coyuWm6RGawhBT1vjQGu1iZTvjXIM8v8jbIjA=",
};

function normalizePhoneNumber(phoneNumber: string) {
  phoneNumber = phoneNumber.replace(/\s+/g, ""); // no whitespace

  // TODO: properly clean country code of phone numbers
  if (phoneNumber.startsWith("7")) {
    phoneNumber = "0" + phoneNumber;
  }
  if (phoneNumber.startsWith("0")) {
    phoneNumber = phoneNumber.replace(/^0/, "+44");
  }
  return phoneNumber;
}

function userPhoneNumber(user: MyClubhouseUser) {
  const number = user.MobileTelephone || user.HomeTelephone || user.BusinessTelephone;
  return number ? normalizePhoneNumber(number) : null;
}

async function setupGroup(signal: Signal, groupName: keyof typeof SIGNAL_GROUP_IDS, expectedUsers: MyClubhouseUser[]) {
  console.log(`👯 "${groupName}" - ${expectedUsers.length} member(s)`);
  DEBUG && console.log(expectedUsers.map((user) => [user.Forename + " " + user.Surname, userPhoneNumber(user)]));

  const groupId = SIGNAL_GROUP_IDS[groupName];

  const existingGroup = (await signal.listGroups()).find(({ id }) => id === groupId);
  if (!existingGroup) {
    throw new Error(`Group ${groupId} does not exist`);
  }

  // Set group permissions
  if (existingGroup.permissionAddMember !== "ONLY_ADMINS" || existingGroup.permissionEditDetails !== "ONLY_ADMINS") {
    console.log(`Updating group permissions for "${groupName}" (${groupId})`);
    !DRY_RUN &&
      (await signal.setGroupPermissions(groupId, {
        setPermissionAddMember: "only-admins",
        setPermissionEditDetails: "only-admins",
      }));
  }

  // Set group members
  const expectedNumbers = expectedUsers.map(userPhoneNumber).filter((number): number is string => Boolean(number));
  const expectedNumbersSet = new Set([SIGNAL_USER, ...expectedNumbers]);
  const existingNumbers = new Set(
    [...existingGroup.admins, ...existingGroup.members, ...existingGroup.pendingMembers].map((member) => member.number)
  );
  const newNumbers = expectedNumbers.filter((number) => !existingNumbers.has(number));
  const oldNumbers = [...existingNumbers].filter(
    (number): number is string => typeof number === "string" && !expectedNumbersSet.has(number)
  );

  if (oldNumbers.length > 0) {
    console.log(`Removing old numbers from group "${groupName}" (${groupId})`, DEBUG ? oldNumbers : oldNumbers.length);
    !DRY_RUN && (await signal.removeNumbersFromGroup(groupId, oldNumbers));
  }

  if (newNumbers.length > 0) {
    console.log(`Adding new numbers to group "${groupName}" (${groupId})`, DEBUG ? newNumbers : newNumbers.length);
    !DRY_RUN && (await signal.addNumbersToGroup(groupId, newNumbers));
  }
}

async function main() {
  DEBUG && console.log("🪲 Debug mode. PPI may be shown on the console.");
  DRY_RUN && console.log("🧪 Dry-run mode, not making any changes.");
  (DEBUG || DRY_RUN) && console.log("");

  const signal = new Signal();

  const users = await getActiveUsers();

  {
    const committeeUsers = users.filter((user) =>
      user.Roles?.some((role) => role.Name === "BEC Committee Member" || role.Name === "BEC Committee Monitor")
    );
    await setupGroup(signal, "Committee", committeeUsers);
  }

  const activityUsers = ACTIVITIES_ENABLED.map(
    (activityName) =>
      [
        activityName,
        users.filter((user) =>
          user.Attributes.Activities?.some((activityPreference) => activityPreference === activityName)
        ),
      ] as const
  );

  for (const [activityName, users] of activityUsers) {
    await setupGroup(signal, activityName, users);
  }

  signal.close();
}

main();
