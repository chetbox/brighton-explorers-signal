import { DEBUG, DRY_RUN } from "./debug.js";
import { ALL_ACTIVITIES, getActiveUsers, MyClubhouseActivity, MyClubhouseUser } from "./myclubhouse.js";
import * as signal from "./signal.js";

const ENABLE_ACTIVITIES = false;

const SIGNAL_GROUP_IDS: Readonly<Record<"Committee" | MyClubhouseActivity, string>> = {
  Committee: "jkhJAZMMjA8eHDyrCDOC3d8D+L1DKhacSa0GF+UDyFM=",
  Badminton: "YevZNjEe9saUGlr2imkRO9LcHejWvOKqzdw357bByVg=",
  Caving: "oNV/8FrXF0sXXrVY15amqqfzDDjFekSUyqy0JXp09dw=",
  Climbing: "XRbb1rGeBp04iewJdvN0zKteEk6FVSi8uQ16Jh6eM18=",
  "Cycling (Road)": "UH+BHenDk7LQ4ORQwkT4Kv/cqV1vcEgR8HHG5sVopCE=",
  Kayaking: "DdzG6QxJQujbrLBt8/UHk9h5Q7etPOERd2m29hOCibU=",
  "Mountain Biking": "bzAyvA3mrdl6Aw56w2WspdJsPtzh/sGqXr0ywRvQ/RY=",
  "Mountain Sports": "Nwexth0dHHCmClIvMrFQta1JXdl1bG0apXf5Ih72e7Q=",
  "Stand Up Paddleboarding (SUP)": "aODJJjeMN+3WbUsq5PaX7Ktjz5p61LyI76CGxbnllcM=",
  Surfing: "SYDdPZNK7fd35uBRA7Si0b1h4jjpX/DDzPiERnWY/Ew=",
  Tennis: "kcamKEN3kDTrZ0+U0CHBGen9ehZX3OrIUokAsY3Fuqw=",
  Walking: "BDrvfvbeL9C27v8q1TN58p1c1EGs4pjuTVZLPciARJk=",
  Windsurfing: "JFyZVTYGzbGf4gUozTIksr5cPUz35Lx6kLJF6Qm3SoU=",
  Running: "sgOMy2B+6znvoVg5XIuptExIgInn5VLtpB0O4WzNjhY=",
};

function normalizePhoneNumber(phoneNumber: string) {
  phoneNumber = phoneNumber.replace(/\s+/g, ""); // no whitespace

  // TODO: properly clean country code of phone numbers
  if (phoneNumber.startsWith("0")) {
    phoneNumber = phoneNumber.replace(/^0/, "+44");
  }
  return phoneNumber;
}

function userPhoneNumber(user: MyClubhouseUser) {
  const number = user.MobileTelephone || user.HomeTelephone || user.BusinessTelephone;
  return number ? normalizePhoneNumber(number) : null;
}

function setupGroup(groupName: keyof typeof SIGNAL_GROUP_IDS, expectedUsers: MyClubhouseUser[]) {
  console.log(`👯 "${groupName}" - ${expectedUsers.length} member(s)`);
  DEBUG && console.log(expectedUsers.map((user) => [user.Forename + " " + user.Surname, userPhoneNumber(user)]));

  const groupId = SIGNAL_GROUP_IDS[groupName];

  const existingGroup = signal.listGroups().find(({ id }) => id === groupId);
  if (!existingGroup) {
    throw new Error(`Group ${groupId} does not exist`);
  }

  // Set group permissions
  if (existingGroup.permissionAddMember !== "ONLY_ADMINS" || existingGroup.permissionEditDetails !== "ONLY_ADMINS") {
    console.log(`Updating group permissions for "${groupName}" (${groupId})`);
    !DRY_RUN &&
      signal.setGroupPermissions(groupId, {
        "add-member": "only-admins",
        "edit-details": "only-admins",
      });
  }

  // Set group members
  const expectedNumbers = expectedUsers.map(userPhoneNumber).filter((number): number is string => Boolean(number));
  const expectedNumbersSet = new Set([signal.USER, ...expectedNumbers]);
  const existingNumbers = new Set(
    [...existingGroup.admins, ...existingGroup.members, ...existingGroup.pendingMembers].map((member) => member.number)
  );
  const newNumbers = expectedNumbers.filter((number) => !existingNumbers.has(number));
  const oldNumbers = [...existingNumbers].filter(
    (number): number is string => typeof number === "string" && !expectedNumbersSet.has(number)
  );

  if (oldNumbers.length > 0) {
    console.log(`Removing old numbers from group "${groupName}" (${groupId})`, DEBUG ? oldNumbers : oldNumbers.length);
    !DRY_RUN && signal.removeNumbersFromGroup(groupId, oldNumbers);
  }

  if (newNumbers.length > 0) {
    console.log(`Adding new numbers to group "${groupName}" (${groupId})`, DEBUG ? newNumbers : newNumbers.length);
    !DRY_RUN && signal.addNumbersToGroup(groupId, newNumbers);
  }
}

async function main() {
  DEBUG && console.log("🪲 Debug mode. PPI may be shown on the console");
  DRY_RUN && console.log("🧪 Dry-run mode, not making any changes");
  (DEBUG || DRY_RUN) && console.log("");

  signal.receiveMessages();

  const users = await getActiveUsers();

  {
    const committeeUsers = users.filter((user) =>
      user.Roles?.some((role) => role.Name === "BEC Committee Member" || role.Name === "BEC Committee Monitor")
    );
    setupGroup("Committee", committeeUsers);
  }

  if (ENABLE_ACTIVITIES) {
    const allActivityUsers = ALL_ACTIVITIES.map(
      (activity) =>
        [
          activity,
          users.filter((user) =>
            user.Attributes.Activities?.some((activityPreference) => activityPreference === activity)
          ),
        ] as const
    );

    for (const activity of ALL_ACTIVITIES) {
      const activityUsers = allActivityUsers.find(([activityName]) => activityName === activity)?.[1] ?? [];
      setupGroup(activity, activityUsers);
    }
  }
}

main();
