const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

type User = {
  Project: string;
  Client?: string;
  WeekStart: Date;
  WeekEnd?: Date;
  User: string;
  Time: string;
  TimeDec?: string;
};

type CohortMemberObject = {
  [key: string]: string | undefined;
};

// Generates the CSV contents based on the options arguments
export const generateCSVcontents = async (csvoptions: string[]) => {
  const cohortMembers: CohortMemberObject[] = [];

  for (let i = 0; i < csvoptions.length; i++) {
    try {
      const weeks = await prisma.ClockifyHours.groupBy({
        by: ["WeekStart"],
        where: {
          Project: csvoptions[i],
        },
        orderBy: {
          WeekStart: "asc",
        },
      });

      const userInfo = await prisma.ClockifyHours.findMany({
        select: {
          Project: true,
          User: true,
          WeekStart: true,
          Time: true,
        },
        where: {
          Project: csvoptions[i],
        },
      });

      const weekDates: CohortMemberObject = { user: csvoptions[i] };
      weeks.forEach((week: any) => {
        weekDates["WeekStart"] = week.WeekStart.toISOString().split("T")[0];
      });
      cohortMembers.push(weekDates);

      const users = await prisma.ClockifyHours.groupBy({
        by: ["User"],
        where: {
          Project: csvoptions[i],
        },
        orderBy: {
          User: "asc",
        },
      });

      const allUsers = await prisma.CohortStudents.groupBy({
        by: ["Name"],
        where: {
          Project: csvoptions[i],
        },
        orderBy: {
          Name: "asc",
        },
      });

      users.forEach((user: User) => {
        const currUserInfo: User[] = [];
        userInfo.forEach((usersInfo: User) => {
          if (usersInfo.User === user.User) {
            currUserInfo.push(usersInfo);
          }
        });
        const cohortMember: CohortMemberObject = { user: user.User };

        weeks.forEach((week: User) => {
          const foundUser = currUserInfo.find(
            (usersInfo: User) =>
              week.WeekStart.toISOString() === usersInfo.WeekStart.toISOString()
          );

          if (foundUser) {
            cohortMember["WeekStart"] = foundUser.Time;
          } else {
            cohortMember["WeekStart"] = "00:00:00";
          }
        });

        cohortMembers.push(cohortMember);
      });

      allUsers.forEach((user: any) => {
        const foundUser = cohortMembers.find(
          (member: any) => user.Name === member.user
        );

        if (!foundUser) {
          const cohortMember: CohortMemberObject = { user: user.Name };

          cohortMember["WeekStart"] = "00:00:00";

          cohortMembers.push(cohortMember);
        }
      });
    } catch (error) {
      console.error(error);
    }
  }

  return cohortMembers;
};
