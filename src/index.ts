import {
  ALL_ACTIVITIES,
  getActiveUsers,
  MyClubhouseActivity,
  MyClubhouseRole,
  MyClubhouseUser,
} from "./myclubhouse.js";
import { execSync } from "child_process";
import { addNumbersToGroup, listGroups, removeNumbersFromGroup, setGroupPermissions, SIGNAL_USER } from "./signal.js";

const SIGNAL_GROUP_IDS: Readonly<Record<"Committee" | MyClubhouseActivity, string>> = {
  Committee: "X53nkGftCmc/j4SXjXJjzyVyTeGi0t+j/lkC5PSEVB0=",
  Badminton: "YevZNjEe9saUGlr2imkRO9LcHejWvOKqzdw357bByVg=",
  Caving: "oNV/8FrXF0sXXrVY15amqqfzDDjFekSUyqy0JXp09dw=",
  Climbing: "XRbb1rGeBp04iewJdvN0zKteEk6FVSi8uQ16Jh6eM18=",
  Coasteering: "yd0QjoJuv1l9iT4Ng1rpxEVxkWt6IlI3kaXqHu+PRd4=",
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

function setupGroup(groupId: string, expectedNumbers: string[]) {
  const existingGroup = listGroups().find(({ id }) => id === groupId);
  if (!existingGroup) {
    throw new Error(`Group ${groupId} does not exist`);
  }

  // Set group permissions
  if (existingGroup.permissionAddMember !== "ONLY_ADMINS" || existingGroup.permissionEditDetails !== "ONLY_ADMINS") {
    setGroupPermissions(groupId, {
      "add-member": "only-admins",
      "edit-details": "only-admins",
    });
  }

  // Set group members
  const expectedNumbersSet = new Set([SIGNAL_USER, ...expectedNumbers]);
  const existingNumbers = new Set(
    [...existingGroup.admins, ...existingGroup.members, ...existingGroup.pendingMembers].map((member) => member.number)
  );
  const newNumbers = expectedNumbers.filter((number) => !existingNumbers.has(number));
  const oldNumbers = [...existingNumbers].filter((number) => !expectedNumbersSet.has(number));

  if (oldNumbers.length > 0) {
    removeNumbersFromGroup(groupId, oldNumbers);
  }

  if (newNumbers.length > 0) {
    addNumbersToGroup(groupId, newNumbers);
  }
}

async function main() {
  const users = await getActiveUsers();

  console.log("->", "Committee");
  const committeeUsers = users.filter((user) => user.Roles?.some((role) => role.Name === "Committee Member"));
  setupGroup(SIGNAL_GROUP_IDS.Committee, phoneNumbers(committeeUsers));

  const activityUsers = ALL_ACTIVITIES.map(
    (activity) =>
      [
        activity,
        users.filter((user) =>
          user.Attributes.Activities?.some((activityPreference) => activityPreference === activity)
        ),
      ] as const
  );

  for (const activity of ALL_ACTIVITIES) {
    console.log("->", activity);

    if (!(activity in SIGNAL_GROUP_IDS) || !SIGNAL_GROUP_IDS[activity]) {
      console.warn(`No Signal group for activity "${activity}"`);
      continue;
    }

    const userPhoneNumbers = activityUsers
      .find(([activityName]) => activityName === activity)?.[1]
      .map((user) => user.MobileTelephone);
    setupGroup(SIGNAL_GROUP_IDS[activity], userPhoneNumbers ?? []);
  }
}

main();
