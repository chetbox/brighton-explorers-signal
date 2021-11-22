import fetch from "node-fetch";

const ACTIVE_USERS_URL =
  "https://www.myclubhouse.co.uk/brightonexplorers/api/v1/users?filter=IsCurrentMember%3Dtrue&pageSize=1000";

const EVENTS_URL = "https://www.myclubhouse.co.uk/brightonexplorers/api/v1/events?filter=IsDraft%3Dfalse&pageSize=1000";

const API_ACCESS_TOKEN = process.env.MYCLUBHOUSE_ACCESS_TOKEN!;
if (!API_ACCESS_TOKEN) {
  throw new Error(`MYCLUBHOUSE_ACCESS_TOKEN not set`);
}

export interface MyClubhouseRole {
  ID: number;
  Name: "Treasurer" | "Committee Member";
  SecurityLevel: number;
  MembershipSubset: null | string[];
}

export const ALL_ACTIVITIES = [
  "Badminton",
  "Caving",
  "Climbing",
  "Coasteering",
  "Cycling (Road)",
  "Kayaking",
  "Mountain Biking",
  "Mountain Sports",
  "Stand Up Paddleboarding (SUP)",
  "Surfing",
  "Tennis",
  "Walking",
  "Windsurfing",
  "Running",
] as const;

export type MyClubhouseActivity = typeof ALL_ACTIVITIES[number];

export interface MyClubhouseUser {
  ID: number;
  Username: string;

  Title: string;
  Forename: string;
  MiddleName: string;
  Surname: string;

  HomeTelephone: string;
  BusinessTelephone: string;
  MobileTelephone: string;

  Email: string;

  Roles: MyClubhouseRole[] | null;

  Attributes: {
    Activities: MyClubhouseActivity[] | null;
  };
}

export interface MyClubhouseEventType {
  ID: number;
  Name: "Climbing"; // TODO
  ShortName: "Climbing"; // TODO
}

export interface MyClubhouseEvent {
  ID: number;
  Types: string;

  Title: string;
  Forename: string;
  MiddleName: string;
  Surname: string;

  HomeTelephone: string;
  BusinessTelephone: string;
  MobileTelephone: string;

  Email: string;

  Roles: MyClubhouseRole[] | null;

  Attributes: {
    Activities: MyClubhouseActivity[] | null;
  };
}

export async function getActiveUsers() {
  return (
    (await (
      await fetch(ACTIVE_USERS_URL, {
        headers: {
          "X-ApiAccessToken": API_ACCESS_TOKEN,
        },
      })
    ).json()) as { Users: MyClubhouseUser[] }
  ).Users;
}

export async function getEvents() {
  return (
    (await (
      await fetch(EVENTS_URL, {
        headers: {
          "X-ApiAccessToken": API_ACCESS_TOKEN,
        },
      })
    ).json()) as { Events: MyClubhouseEvent[] }
  ).Events;
}
