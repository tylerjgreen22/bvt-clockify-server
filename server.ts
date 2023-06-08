import express, { Request, Response } from "express";
import {
  updateCohortMembers,
  updateClockifyHours,
  generateCSVcontents,
} from "./utils";

const fs = require("fs");
const cors = require("cors");
const fileUpload = require("express-fileupload");
const path = require("path");
const { stringify } = require("csv-stringify");
const { PrismaClient } = require("@prisma/client");
const morgan = require("morgan");

const port = 3000;

const prisma = new PrismaClient();

const app = express();

app.use(morgan("dev"));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cors());
app.use(fileUpload());

app.get("/", (req: Request, res: Response) => {
  res.send(`server running on port ${port || 3000}`);
});

// Gets a list of all available project options in the database
app.get("/getProjects", async (req: Request, res: Response) => {
  try {
    const projects = await prisma.ClockifyHours.groupBy({
      by: ["project"],
      select: {
        project: true,
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
      res.status(500).send("File download response not sent.");
    }
  });
});

// Updates the database with the uploaded CSVs
app.post("/updateDatabase", async (req: Request, res: Response) => {
  const fileDate = req.body.fileDate;
  try {
    await updateCohortMembers();
    const message = await updateClockifyHours(fileDate);
    res.status(200).json(message);
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .json({ error: "An error occurred during the update process." });
  }
});

// Updates the list of cohort members based on an uploaded csv
app.post("/updateCohortMembers", (req: Request, res: Response) => {
  const files = req.files;

  if (!files || !files.file) {
    return res.status(400).json({ error: "No file uploaded." });
  }

  const file = Array.isArray(files.file) ? files.file[0] : files.file;

  file.mv(
    path.join(__dirname, "public", "cohortmembers.csv"),
    (err: NodeJS.ErrnoException) => {
      if (err) {
        console.error;
      }
    }
  );

  res.status(201).json({ message: "member csv updated" });
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

  file.mv(
    path.join(__dirname, "public", "database.csv"),
    (err: NodeJS.ErrnoException) => {
      if (err) {
        console.error(err);
        return res
          .status(500)
          .json({ error: "An error occurred during file upload." });
      }
    }
  );

  res.status(201).json({ message: "Clockify csv updated", fileDate });
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
