import tunnelSsh from "tunnel-ssh";
import { Server } from "net";
import mysql from "mysql";
import { exec } from "child_process";
import { ACTIVE_MEMBERS_WITH_ACTIVITIES } from "./queries.js";
import { ACTIVITIES } from "./consts.js";

function createTunnel() {
  return new Promise<Server>((resolve, reject) => {
    tunnelSsh(
      {
        keepAlive: true,
        host: process.env.SSH_HOST,
        port: process.env.SSH_PORT ? parseInt(process.env.SSH_PORT) : 22,
        username: process.env.SSH_USERNAME,
        password: process.env.SSH_PASSWORD,
        dstHost: process.env.MYSQL_HOST ?? "127.0.0.1",
        dstPort: process.env.MYSQL_PORT ? parseInt(process.env.MYSQL_PORT) : 3306,
        localHost: "127.0.0.1",
        localPort: process.env.MYSQL_LOCAL_PORT ? parseInt(process.env.MYSQL_LOCAL_PORT) : 3306,
      },
      (error, tunnel) => {
        if (error) {
          reject(error);
        } else {
          resolve(tunnel);
        }
      }
    );
  });
}

function connectToDatabase(database: string) {
  return mysql.createConnection({
    host: process.env.MYSQL_HOST ?? "127.0.0.1",
    port: process.env.MYSQL_LOCAL_PORT ? parseInt(process.env.MYSQL_LOCAL_PORT) : 3306,
    user: process.env.MYSQL_USERNAME,
    password: process.env.MYSQL_PASSWORD,
    database,
  });
}

function queryDatabase(connection: mysql.Connection, query: string | mysql.QueryOptions) {
  return new Promise<{
    results: any;
    fields?: mysql.FieldInfo[];
  }>((resolve, reject) => {
    connection.query(query, (error, results, fields) => {
      if (error) {
        reject(error);
      } else {
        resolve({
          results,
          fields,
        });
      }
    });
  });
}

async function main() {
  const tunnel = process.env.SSH_HOST ? await createTunnel() : null;
  try {
    const dbConnection = connectToDatabase("brighton_explorers");
    const { results: users } = await queryDatabase(dbConnection, ACTIVE_MEMBERS_WITH_ACTIVITIES);
    dbConnection.end();

    console.log("Total users:", users.length);
    console.log("");

    ACTIVITIES.forEach((activity) => {
      console.log(
        activity,
        (users as ({ firstname: string; lastname: string } & Record<typeof activity, 0 | 1>)[]).filter(
          (user) => user[activity] === 1
        ).length
      );
    });
  } finally {
    tunnel?.close();
  }
}

main();
