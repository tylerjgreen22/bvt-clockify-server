import express, { Request, Response } from "express";
import { generateCSVcontents } from "./utils";
import cors from "cors";
import fileUpload from "express-fileupload";
import morgan from "morgan";
import csv from "csv-parser";

const { PrismaClient } = require("@prisma/client");
const { stringify } = require("csv-stringify");
const fs = require("fs");

const port = 3000;

const prisma = new PrismaClient();

const app = express();

app.use(morgan("dev"));
app.use(express.json());
app.use(cors());
app.use(fileUpload({ useTempFiles: true }));

app.get("/", (req: Request, res: Response) => {
  res.send(`server running on port ${port || 3000}`);
});

// Gets a list of all available project options in the database
app.get("/getProjects", async (req: Request, res: Response) => {
  try {
    const projects = await prisma.ClockifyHours.groupBy({
      by: ["Project"],
      select: {
        Project: true,
      },
    });

    res.status(200).json(projects);
  } catch (error) {
    console.error(error);
  }
});

// Downloads the last generated CSV
app.get("/downloadCSV", (req: Request, res: Response) => {
  res.download("./cohort.csv", "cohort.csv", (error: NodeJS.ErrnoException) => {
    if (error) {
      console.error(error);
      res.status(500).json({
        error: "An error occurred during the download process.",
      });
    } else if (!res.headersSent) {
      console.error("File download response not sent.");
      res.status(500).json({ error: "File download response not sent." });
    }
  });
});

// Updates the list of cohort members based on an uploaded csv
app.post("/updateCohortMembers", (req: Request, res: Response) => {
  const files = req.files;

  if (!files || !files.file) {
    return res.status(400).json({ error: "No file uploaded." });
  }

  const file = Array.isArray(files.file) ? files.file[0] : files.file;

  try {
    const rows: any[] = [];
    fs.createReadStream(file.tempFilePath)
      .pipe(csv())
      .on("data", (row: any) => {
        rows.push(row);
      })
      .on("end", async () => {
        try {
          const updateObj = await prisma.CohortStudents.createMany({
            data: rows,
            skipDuplicates: true,
          });

          const updateCount = updateObj?.count;

          fs.unlinkSync(file.tempFilePath);

          updateCount
            ? res.status(200).json({ message: "Database updated" })
            : res.status(200).json({ message: "No update made" });
        } catch (error) {
          console.error(error);
          res.status(500).json({ error: "Internal Server Error" });
        }
      });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Updates clockify entries based on an uploaded csv
app.post("/updateClockifyHours", async (req: Request, res: Response) => {
  const files = req.files;
  if (!files || !files.file) {
    return res.status(400).json({ error: "No file uploaded." });
  }
  const file = Array.isArray(files.file) ? files.file[0] : files.file;

  const fileNameArr = file.name.split("_");
  const day = fileNameArr[4];
  const month = fileNameArr[5];
  const year = fileNameArr[6].split("-")[0];
  const fileDate = `${day}/${month}/${year}`;

  try {
    const rows: any[] = [];
    fs.createReadStream(file.tempFilePath)
      .pipe(csv())
      .on("data", (row: any) => {
        row["WeekStart"] = new Date(fileDate.split("-")[0].trim());
        rows.push(row);
      })
      .on("end", async () => {
        try {
          const updateObj = await prisma.ClockifyHours.createMany({
            data: rows,
            skipDuplicates: true,
          });

          const updateCount = updateObj?.count;

          fs.unlinkSync(file.tempFilePath);

          updateCount
            ? res.status(200).json({ message: "Database updated" })
            : res.status(200).json({ message: "No update made" });
        } catch (error) {
          console.error(error);
          res.status(500).json({ error: "Internal Server Error" });
        }
      });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Generates a CSV based on the selected project options
app.post("/generateCSV", async (req: Request, res: Response) => {
  const { csvOptions } = req.body;
  try {
    const result = await generateCSVcontents(csvOptions);
    result.sort((a, b) => {
      const numPropertiesA = Object.keys(a).length;
      const numPropertiesB = Object.keys(b).length;

      if (numPropertiesA > numPropertiesB) {
        return -1;
      } else if (numPropertiesA < numPropertiesB) {
        return 1;
      }

      return 0;
    });
    const resObj = { rows: result };

    await stringify(
      resObj.rows,
      async function (error: NodeJS.ErrnoException, output: string) {
        await fs.writeFile(
          "./cohort.csv",
          output,
          "utf8",
          function (error: NodeJS.ErrnoException) {
            if (error) {
              console.error(error);
              res.status(500).json({
                error: "An error occurred during the csv creation process.",
              });
            } else {
              console.log("File created");
            }
          }
        );
      }
    );
    res.status(201).json({ message: "Your file is ready" });
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .json({ error: "An error occurred during the csv creation process." });
  }
});

app.listen(3000, () => {
  console.log("Server running");
});
