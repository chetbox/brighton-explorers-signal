import { argv } from "process";
import { DEBUG, DRY_RUN } from "./env.js";
import { ALL_ACTIVITIES, getActiveUsers, MyClubhouseActivity, MyClubhouseUser } from "./myclubhouse.js";
import { normalizePhoneNumber } from "./phoneNumbers.js";
import Signal, { getSignalNumber, SIGNAL_USER } from "./Signal.js";

type SignalGroupName = "Committee" | "Bar Volunteers" | MyClubhouseActivity;

const GROUPS_ENABLED: SignalGroupName[] = ["Committee", "Bar Volunteers", ...ALL_ACTIVITIES];

function userHasActivitySelected(user: MyClubhouseUser, activityName: SignalGroupName): boolean {
  return (user.Attributes.Activities ?? [])?.some((activityPreference) => activityPreference === activityName);
}

const SIGNAL_GROUPS: Readonly<
  Record<SignalGroupName, { id: string; allowUser: (user: MyClubhouseUser, groupName: SignalGroupName) => boolean }>
> = {
  Committee: {
    id: "jkhJAZMMjA8eHDyrCDOC3d8D+L1DKhacSa0GF+UDyFM=",
    allowUser: (user) =>
      (user.Roles ?? []).some((role) => role.Name === "BEC Committee Member" || role.Name === "BEC Committee Monitor"),
  },
  "Bar Volunteers": {
    id: "FqB/Dx7wW8YqDoLMjWyadYN5ZKWVG/KwMX1/gngf2cQ=",
    allowUser: (user) =>
      Boolean(user.Attributes["Bar trained"]) && (user.Attributes.Activities ?? [])?.includes("Social"),
  },
  Badminton: { id: "r9p6NuU4Tyoba+4S6YRGS0TouoOB/1q3H2RurkA1rB8=", allowUser: userHasActivitySelected },
  Caving: { id: "cwEah5FIN5kmb/V9mFhj5fsGIWFpfhDGCHqCyKB1ScM=", allowUser: userHasActivitySelected },
  Climbing: { id: "w8AwJdbepA3L9uk0EfSUCV/B55aMb91Wk/QzFe1lJQ4=", allowUser: userHasActivitySelected },
  "Cycling (Road)": { id: "NBDEaOhg0NtcnG60br2wqStuMErd+WzIyLjign/WZu8=", allowUser: userHasActivitySelected },
  Kayaking: {
    id: "lpO3ITpYHYUTpurgBfCU4+b1VFKXSybxDHmxtTcctKc=",
    allowUser: (user, activityName) =>
      userHasActivitySelected(user, activityName) && Boolean(user.Attributes["Kayaking induction"]),
  },
  "Mountain Biking": { id: "qBoUTmPas3r1cosXWtRGjHBGfFCoHR49boSTUv2Jo88=", allowUser: userHasActivitySelected },
  "Mountain Sports": { id: "uReIWxXU2qjhrBU66mTQgnId1FGjCy9H2VProk+xyQk=", allowUser: userHasActivitySelected },
  "Stand Up Paddleboarding (SUP)": {
    id: "Wg3hY3TnQANxXrufiA7ucgOgcBDW6DVjneDLeI+urEE=",
    allowUser: (user, activityName) =>
      userHasActivitySelected(user, activityName) && Boolean(user.Attributes["SUP induction"]),
  },
  Surfing: { id: "u0T8evlaYze+apskNR9Bj+b4nyNfjl04bIn/urNiTdM=", allowUser: userHasActivitySelected },
  Tennis: { id: "F49SXaZVkGkyzFhSYvEZxK5GXX4CqEZt9zcYToRjA1c=", allowUser: userHasActivitySelected },
  Walking: { id: "hYgu8Lu7JVPE1sSP9JooUn7/PvSV9SQhwg8IzkQcTFE=", allowUser: userHasActivitySelected },
  Windsurfing: { id: "szh6ZQ5FDPeshx6gjyn980sJeAk/oswNlaOrSPT9zgg=", allowUser: userHasActivitySelected },
  Running: { id: "cLYnB3coyuWm6RGawhBT1vjQGu1iZTvjXIM8v8jbIjA=", allowUser: userHasActivitySelected },
  Social: { id: "2CHfRlRQFWrLlFapAsoGW30C+eEKt0+6kSFJYHVu1BM=", allowUser: userHasActivitySelected },
};

const GROUP_REMOVAL_DIRECT_MESSAGE = `Hi! 👋
We've removed you from the the Brighton Explorers Club groups on Signal because either:
- your BEC membership has expired, or
- your registered phone number has changed

To renew your membership: https://www.brightonexplorers.org/Subscriptions/View/MySubscriptions

To update your phone number on your profile: https://www.brightonexplorers.org/UserPage
`;

function userPhoneNumber(user: MyClubhouseUser) {
  const number = user.MobileTelephone || user.HomeTelephone || user.BusinessTelephone;
  return number ? normalizePhoneNumber(number) : null;
}

async function setupGroup(signal: Signal, groupName: keyof typeof SIGNAL_GROUPS, expectedNumbers: string[]) {
  console.log(`👯 "${groupName}" - ${expectedNumbers.length} member(s)`);

  const group = SIGNAL_GROUPS[groupName];

  const existingGroup = (await signal.listGroups()).find(({ id }) => id === group.id);
  if (!existingGroup) {
    throw new Error(`Group ${group.id} does not exist`);
  }

  // Set group permissions
  if (
    existingGroup.permissionAddMember !== "ONLY_ADMINS" ||
    existingGroup.permissionEditDetails !== "ONLY_ADMINS" ||
    !existingGroup.groupInviteLink
  ) {
    console.log(`Updating group permissions for "${groupName}" (${group.id})`);
    if (!DRY_RUN) {
      await signal.setGroupPermissions(group.id, {
        permissions: {
          setPermissionAddMember: "only-admins",
          setPermissionEditDetails: "only-admins",
        },
        link: "enabled-with-approval", // This seems to fix a problem where some users don't see an group invitation
      });
    }
  }

  // Set group members
  const adminNumbers = existingGroup.admins
    .map(({ number }) => number)
    .filter((number): number is string => Boolean(number));
  const expectedNumbersSet = new Set([SIGNAL_USER, ...adminNumbers, ...expectedNumbers]);
  const existingNumbers = new Set(
    [
      ...existingGroup.admins,
      ...existingGroup.members,
      ...existingGroup.pendingMembers,
      ...existingGroup.requestingMembers,
    ].map((member) => member.number)
  );
  const numbersAdded = expectedNumbers.filter((number) => !existingNumbers.has(number));
  const numbersRemoved = [...existingNumbers].filter(
    (number): number is string => typeof number === "string" && !expectedNumbersSet.has(number)
  );

  if (numbersRemoved.length > 0) {
    console.log(
      `Removing old numbers from group "${groupName}" (${group.id})`,
      DEBUG ? numbersRemoved : numbersRemoved.length
    );
    !DRY_RUN && (await signal.removeNumbersFromGroup(group.id, numbersRemoved));
  }

  if (numbersAdded.length > 0) {
    console.log(
      `Adding ${DEBUG ? numbersAdded : numbersAdded.length} new numbers to group "${groupName}" (${group.id})`
    );

    try {
      !DRY_RUN && (await signal.addNumbersToGroup(group.id, numbersAdded));
    } catch (error) {
      console.warn("Failed to add numbers to group", error);
      console.log("Trying again one-by-one");

      for (const number of numbersAdded) {
        try {
          !DRY_RUN && (await signal.addNumbersToGroup(group.id, [number]));
        } catch (error) {
          console.warn(`⚠️ Failed to add ${DEBUG ? number : "number"} to group ${group.id}`, error);
        }
      }
    }
  }

  return { numbersAdded, numbersRemoved };
}

async function syncAllGroups() {
  DEBUG && console.log("🪲 Debug mode. PPI may be shown on the console.");
  DRY_RUN && console.log("🧪 Dry-run mode, not making any changes.");
  (DEBUG || DRY_RUN) && console.log("");

  const signal = new Signal();

  // Send read receipts for any messages received

  signal.addListener("receive", async (message) => {
    if (message.envelope.dataMessage) {
      const { timestamp, groupInfo } = message.envelope.dataMessage;
      if (groupInfo) {
        const group = (await signal.listGroups()).find(({ id }) => id === groupInfo.groupId);
        if (group) {
          const numbers = group.members
            .map(({ number }) => number)
            .filter((number): number is string => Boolean(number));
          await Promise.all(
            numbers.map(async (number) => {
              try {
                await signal.sendReceipt(number, timestamp);
              } catch (error) {
                console.error(
                  `Could not send read receipt to ${DEBUG ? number : "number"} in group ${groupInfo.groupId}:`,
                  error
                );
              }
            })
          );
        } else {
          console.warn(`Cannot send read receipt to group ${groupInfo.groupId}: Group not found`);
        }
      } else {
        !DRY_RUN && (await signal.sendReceipt(message.envelope.sourceNumber, timestamp));
      }
    }
  });

  // Allow some time to handle received messages
  await new Promise((resolve) => setTimeout(resolve, 5000));

  const activeUsers = await getActiveUsers();

  const activeUserNumbers = activeUsers.map((user) => {
    const phoneNumber = userPhoneNumber(user);
    return phoneNumber ? normalizePhoneNumber(phoneNumber) : null;
  });

  const activeSignalUsers = (
    await signal.getUserStatus(...activeUserNumbers.filter((number): number is string => Boolean(number)))
  ).filter(getSignalNumber);

  console.log(
    `${activeUsers.length} active members - ${activeSignalUsers.length} (${Math.round(
      (activeSignalUsers.length / activeUsers.length) * 100
    )}%) are registered on Signal`
  );

  const numbersRemovedFromGroups = new Set<string>();

  for (const groupName of GROUPS_ENABLED) {
    const groupUsers = activeUsers.filter((user) => SIGNAL_GROUPS[groupName].allowUser(user, groupName));

    // Find the Signal number for all matching users
    const groupNumbers = groupUsers
      .map((groupUser) => {
        const userNumber = userPhoneNumber(groupUser);
        if (!userNumber) return;

        const signalUser = activeSignalUsers.find((signalUser) => getSignalNumber(signalUser) === userNumber);
        return signalUser?.number;
      })
      .filter((number): number is string => Boolean(number));

    const { numbersRemoved } = await setupGroup(signal, groupName, groupNumbers);
    numbersRemoved.forEach((number) => numbersRemovedFromGroups.add(number));
  }

  // Send a message to inactive numbers to tell them why they have been removed from groups
  const activeUserNumbersSet: ReadonlySet<string> = new Set(
    activeUserNumbers.filter((number): number is string => Boolean(number))
  );
  for (const number of numbersRemovedFromGroups) {
    if (!activeUserNumbersSet.has(number)) {
      try {
        await signal.sendMessage(number, GROUP_REMOVAL_DIRECT_MESSAGE);
      } catch (error) {
        console.warn(`Failed to send group removal message to user `, DEBUG ? number : "", error);
      }
    }
  }

  signal.close();
}

async function sendMessage(number: string, message: string) {
  const signal = new Signal();
  !DRY_RUN && (await signal.sendMessage(normalizePhoneNumber(number), message));
  signal.close();
}

const HELP_TEXT = `Arguments:
sync - Sync Signal groups with myClubhouse
message NUMBER MESSAGE - Send MESSAGE to NUMBER as a direct message`;

if (argv.length <= 2) {
  throw new Error("No arguments supplied");
}

switch (process.argv[2]) {
  case "--help":
    console.log(HELP_TEXT);
    break;
  case "sync":
    await syncAllGroups();
    break;
  case "message":
    await sendMessage(process.argv[3], process.argv[4]);
    break;
  default:
    console.log(HELP_TEXT);
    throw new Error("No arguments passed");
}
