import fetch from "node-fetch";
import { DEBUG } from "./env.js";

const ACTIVE_USERS_URL = "https://www.brightonexplorers.org/api/v1/users?filter=IsCurrentMember%3Dtrue&pageSize=1000";

const EVENTS_URL = "https://www.brightonexplorers.org/api/v1/events?filter=IsDraft%3Dfalse&pageSize=1000";

const API_ACCESS_TOKEN = process.env.MYCLUBHOUSE_ACCESS_TOKEN!;
if (!API_ACCESS_TOKEN) {
  throw new Error(`MYCLUBHOUSE_ACCESS_TOKEN not set`);
}

export interface MyClubhouseRole {
  ID: number;
  Name: "Treasurer" | "BEC Committee Member" | "BEC Committee Monitor";
  SecurityLevel: number;
  MembershipSubset: null | string[];
}

export const ALL_ACTIVITIES = [
  "Badminton",
  "Caving",
  "Climbing",
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
  "Social",
] as const;

export type MyClubhouseActivity = typeof ALL_ACTIVITIES[number];

export interface MyClubhouseUser {
  ID: number;
  Username: string;
  MembershipNumber: string;

  Title: string;
  Forename: string;
  MiddleName: string;
  Surname: string;
  CompanyName: string | null;
  Branch: string | null;

  HomeTelephone: string;
  BusinessTelephone: string;
  MobileTelephone: string;

  Email: string;

  Roles: MyClubhouseRole[] | null;

  Attributes: {
    Activities: MyClubhouseActivity[] | null;

    /**
     * Date SUP induction passed as UK date string e.g. '02/07/2021'
     */
    "SUP induction": string | null;

    /**
     * Date Kayaking induction passed as UK date string e.g. '02/07/2021'
     */
    "Kayaking induction": string | null;

    /**
     * Date bar training was completed e.g. '02/07/2021'
     */
    "Bar trained": boolean | null;
  };
}

export type MyClubhouseEventOrganizer = Pick<
  MyClubhouseUser,
  "ID" | "Username" | "MembershipNumber" | "Title" | "Forename" | "MiddleName" | "Surname" | "CompanyName" | "Branch"
>;
export interface MyClubhouseEventType {
  ID: number;
  Name: string;
  ShortName: string;
}

export interface MyClubhouseEvent {
  ID: string;
  Type: MyClubhouseEventType[];
  SeriesID?: number;
  Name: string;
  Description: string;
  ViewURL: string;

  StartTime: string;
  EndTime: string;
  IsMultiDay: boolean;

  IsDraft: boolean;
  IsCancelled: boolean;
  CancellationReason: string | null;

  HasCosts: boolean;
  CostStructure: any | null;

  MinAttendees: number | null;
  MaxAttendees: number | null;

  Organizer: MyClubhouseEventOrganizer;
  SecondOrganizer: MyClubhouseEventOrganizer | null;

  VenueName: string;
  VenueDirections: string;
  VenueLatitude: string;
  VenueLongitude: string;
}

export async function getActiveUsers() {
  DEBUG && console.log("↓", ACTIVE_USERS_URL);
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
  DEBUG && console.log("↓", EVENTS_URL);
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
