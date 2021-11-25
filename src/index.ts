import { ALL_ACTIVITIES, getActiveUsers, MyClubhouseUser } from "./myclubhouse.js";
import { execSync } from "child_process";
import { addNumbersToGroup, listGroups, removeNumbersFromGroup, setGroupPermissions, SIGNAL_USER } from "./signal.js";

const SIGNAL_GROUP_IDS = {
  Committee: "X53nkGftCmc/j4SXjXJjzyVyTeGi0t+j/lkC5PSEVB0=",
} as const;

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

  setupGroup(SIGNAL_GROUP_IDS.Committee, phoneNumbers(committeeUsers));

  // TODO: activities
}

main();
