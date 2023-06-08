const fs = require("fs");
const { parse } = require("csv-parse");
const { promisify } = require("util");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

type User = {
  project: string;
  client?: string;
  weekStart: Date;
  weekEnd?: Date;
  user: string;
  time: string;
  timeDec?: string;
};

type CohortMember = {
  name: string;
  project?: string;
};

type CohortMemberObject = {
  [key: string]: string | undefined;
};

// Reads the uploaded CSV file and enters all members into the database. Skips duplicate entries
export const updateCohortMembers = async () => {
  const cohortMembers: CohortMember[] = [];
  const readFile = promisify(fs.readFile);
  const parseCSV = promisify(parse);

  try {
    const data = await readFile("./public/cohortmembers.csv", "utf-8");
    const rows = await parseCSV(data, { delimiter: "," });

    rows.forEach((row: Array<string>) => {
      const cohortMember: CohortMember = {
        name: row[0],
        project: row[1],
      };
      cohortMembers.push(cohortMember);
    });

    await prisma.CohortStudents.createMany({
      data: cohortMembers,
      skipDuplicates: true,
    });
  } catch (error) {
    console.error(error);
  }
};

/* Reads the uploaded CSV and enters all clockify hours into the database. 
Skips duplicates and will send a message if a member has hours that are 
entered under a different project than what is listed on the member table */
export const updateClockifyHours = async (fileDate: string) => {
  const users: User[] = [];
  const wrongCohort: CohortMember[] = [];
  const readFile = promisify(fs.readFile);
  const parseCSV = promisify(parse);
  let updateCount = 0;

  try {
    const data = await readFile("./public/database.csv", "utf-8");
    const rows = await parseCSV(data, { delimiter: "," });
    const cohortMembers = await prisma.CohortStudents.findMany();

    rows.forEach((row: Array<string>) => {
      const weekStart = new Date(fileDate.split("-")[0].trim());
      //const weekEnd = new Date(row[2].split("-")[1].trim());

      const currUser = { name: row[2], project: row[0], correctCohort: "" };
      const cohortMemberFound = cohortMembers.find(
        (member: CohortMember) =>
          member.name === currUser.name && member.project === currUser.project
      );

      const wrongCohortFound = wrongCohort.find(
        (member: CohortMember) =>
          member.name === currUser.name && member.project === currUser.project
      );

      if (!cohortMemberFound && !wrongCohortFound) {
        const correctCohort = cohortMembers.find(
          (member: CohortMember) => member.name === currUser.name
        );
        currUser.correctCohort = correctCohort ? correctCohort.project : "";
        wrongCohort.push(currUser);
      }

      const user: User = {
        project: row[0],
        client: row[1],
        weekStart,
        //weekEnd,
        user: row[2],
        time: row[3],
        //timeDec: row[5],
      };

      users.push(user);
    });

    updateCount = await prisma.ClockifyHours.createMany({
      data: users,
      skipDuplicates: true,
    }).count;

    console.log(updateCount);
  } catch (error) {
    console.error;
  }

  if (updateCount) {
    return { message: "Database updated", wrongCohort };
  } else {
    return { message: "No update made", wrongCohort };
  }
};

// Generates the CSV contents based on the options arguments
export const generateCSVcontents = async (csvoptions: string[]) => {
  const cohortMembers: CohortMemberObject[] = [];

  for (let i = 0; i < csvoptions.length; i++) {
    try {
      const weeks = await prisma.ClockifyHours.groupBy({
        by: ["weekStart"],
        where: {
          project: csvoptions[i],
        },
        orderBy: {
          weekStart: "asc",
        },
      });

      const userInfo = await prisma.ClockifyHours.findMany({
        select: {
          project: true,
          user: true,
          weekStart: true,
          time: true,
        },
        where: {
          project: csvoptions[i],
        },
      });

      // Two versions, one generates CSV based on master list, one based on clockify entries

      // Clockify entries version
      const weekDates: CohortMemberObject = { user: csvoptions[i] };
      weeks.forEach((week: any) => {
        weekDates[week.weekStart.toISOString()] = week.weekStart
          .toISOString()
          .split("T")[0];
      });
      cohortMembers.push(weekDates);

      const users = await prisma.ClockifyHours.groupBy({
        by: ["user"],
        where: {
          project: csvoptions[i],
        },
        orderBy: {
          user: "asc",
        },
      });

      users.forEach((user: User) => {
        const currUserInfo: User[] = [];
        userInfo.forEach((usersInfo: User) => {
          if (usersInfo.user === user.user) {
            currUserInfo.push(usersInfo);
          }
        });
        const cohortMember: CohortMemberObject = { user: user.user };

        weeks.forEach((week: User) => {
          const foundUser = currUserInfo.find(
            (usersInfo: User) =>
              week.weekStart.toISOString() === usersInfo.weekStart.toISOString()
          );

          if (foundUser) {
            cohortMember[week.weekStart.toISOString()] = foundUser.time;
          } else {
            cohortMember[week.weekStart.toISOString()] = "00:00:00";
          }
        });

        cohortMembers.push(cohortMember);
      });

      // Master list version

      // const weekDates: CohortMemberObject = { name: csvoptions[i] };
      // weeks.forEach((week: any) => {
      //   weekDates[week.weekStart.toISOString()] = week.weekStart
      //     .toISOString()
      //     .split("T")[0];
      // });
      // cohortMembers.push(weekDates);

      // const users = await prisma.CohortStudents.groupBy({
      //   by: ["name"],
      //   where: {
      //     project: csvoptions[i],
      //   },
      //   orderBy: {
      //     name: "asc",
      //   },
      // });

      // console.log(users);

      // users.forEach((user: CohortMember) => {
      //   const currUserInfo: User[] = [];
      //   userInfo.forEach((usersInfo: User) => {
      //     if (usersInfo.user === user.name) {
      //       currUserInfo.push(usersInfo);
      //     }
      //   });
      //   const cohortMember: CohortMemberObject = { name: user.name };

      //   weeks.forEach((week: User) => {
      //     const foundUser = currUserInfo.find(
      //       (usersInfo: User) =>
      //         week.weekStart.toISOString() === usersInfo.weekStart.toISOString()
      //     );

      //     if (foundUser) {
      //       cohortMember[week.weekStart.toISOString()] = foundUser.time;
      //     } else {
      //       cohortMember[week.weekStart.toISOString()] = "00:00:00";
      //     }
      //   });

      //   cohortMembers.push(cohortMember);
      // });
    } catch (error) {
      console.error(error);
    }
  }

  return cohortMembers;
};
