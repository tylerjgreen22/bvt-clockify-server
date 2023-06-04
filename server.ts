import express, { Request, Response } from "express";

const fs = require("fs");
const { parse } = require("csv-parse");
const { stringify } = require("csv-stringify");
const { promisify } = require("util");
const { PrismaClient } = require("@prisma/client");
const cors = require("cors");
const fileUpload = require("express-fileupload");
const path = require("path");

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cors());
app.use(fileUpload());

const port = 3000;

const prisma = new PrismaClient();

type User = {
  project: string;
  client: string;
  weekStart: Date;
  weekEnd: Date;
  user: string;
  time: string;
  timeDec: string;
};

const readFile = promisify(fs.readFile);
const parseCSV = promisify(parse);

const processClockifyCSV = async (file: any) => {
  try {
    const users: User[] = [];
    const path = `./public/${file.name}`;
    const data = await readFile(path, "utf-8");
    const rows = await parseCSV(data, { delimiter: "," });

    rows.forEach((row: Array<string>) => {
      const weekStart = new Date(row[2].split("-")[0].trim());
      const weekEnd = new Date(row[2].split("-")[1].trim());

      const user: User = {
        project: row[0],
        client: row[1],
        weekStart,
        weekEnd,
        user: row[3],
        time: row[4],
        timeDec: row[5],
      };

      users.push(user);
    });

    return users;
  } catch (err) {
    throw err;
  }
};

const findUsers = async (csvoption: any) => {
  const cohortMembers: any = [];

  const weeks = await prisma.ClockifyHours.groupBy({
    by: ["weekStart"],
    where: {
      project: `${csvoption}`,
    },
    orderBy: {
      weekStart: "asc",
    },
  });

  const users = await prisma.ClockifyHours.groupBy({
    by: ["user"],
    where: {
      project: `${csvoption}`,
    },
  });

  for (let i = 0; i < users.length; i++) {
    const cohortMember: Record<string, any> = { name: users[i].user };
    const userInfo = await prisma.ClockifyHours.findMany({
      where: {
        user: users[i].user,
      },
    });

    for (let j = 0; j < weeks.length; j++) {
      const found = userInfo.find(
        (item: any) =>
          weeks[j].weekStart.toISOString().split("T")[0] ===
          item.weekStart.toISOString().split("T")[0]
      );
      if (found) {
        cohortMember[
          weeks[j].weekStart.toISOString().split("T")[0] as keyof Object
        ] = found.time;
      } else {
        cohortMember[
          weeks[j].weekStart.toISOString().split("T")[0] as keyof Object
        ] = "00:00:00";
      }
    }

    cohortMembers.push(cohortMember);
  }

  return cohortMembers;
};

app.get("/", (req: Request, res: Response) => {
  res.send(`server running on port ${port || 3000}`);
});

app.post("/updateDatabase", (req: any, res: Response) => {
  const file = req.files.file;
  //console.log(file);
  try {
    file.mv(path.join(__dirname, "public", file.name), async (err: any) => {
      if (err) {
        res.sendStatus(500);
      }
      await processClockifyCSV(file).then(async (result) => {
        await prisma.ClockifyHours.createMany({
          data: result,
          skipDuplicates: true,
        });
        res.sendStatus(200);
      });
    });
  } catch (error) {
    console.log(error);
  }
});

app.get("/getProjects", async (req, res) => {
  const projects = await prisma.ClockifyHours.groupBy({
    by: ["project"],
    select: {
      project: true,
    },
  });

  res.json(projects);
});

app.post("/downloadCSV", async (req, res) => {
  const { csvoption } = req.body;
  const result = await findUsers(csvoption);
  const resObj = { rows: result };
  let message = "";

  stringify(resObj.rows, function (err: any, output: any) {
    fs.writeFile("./public/cohort.csv", output, "utf8", function (err: any) {
      if (err) {
        console.log(err);
      } else {
        console.log("File created");
        message = "File created";
      }
    });
  });

  res.download("./public/cohort.csv", "cohort.csv", (err: any) => {
    if (err) {
      res.send("Server error");
    }
  });
});

app.listen(3000, () => {
  console.log("Server running");
});
