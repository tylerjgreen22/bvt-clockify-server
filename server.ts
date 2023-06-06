import express, { Request, Response } from "express";
import {
  updateCohortMembers,
  updateClockifyHours,
  generateCSVcontents,
} from "./utils";

import Fs from "fs/promises";

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

// Gets the file size of the completed csv to match it to the file that is downloaded on the frontend
app.get("/getFileSize", async (req: Request, res: Response) => {
  try {
    const stats = await Fs.stat("./public/cohort.csv");

    res.json({ size: stats.size });
  } catch (error) {
    console.error(error);
  }
});

// Updates all the list of cohort members based on an uploaded csv
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

  try {
    updateCohortMembers();
    res.status(200).json({ Message: "Cohort members updated" });
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .json({ error: "An error occurred during the update process." });
  }
});

// Updates all clockify entries in the database
app.post("/updateClockifyHours", async (req: Request, res: Response) => {
  const files = req.files;

  if (!files || !files.file) {
    return res.status(400).json({ error: "No file uploaded." });
  }

  const file = Array.isArray(files.file) ? files.file[0] : files.file;

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

  try {
    const wrongCohort = await updateClockifyHours();
    res.status(200).json({ Message: "Database updated", wrongCohort });
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .json({ error: "An error occurred during the update process." });
  }
});

// Generates a CSV based on the selected project options and sends it to be downloaded to the client
app.post("/downloadCSV", async (req: Request, res: Response) => {
  const { csvOptions } = req.body;
  try {
    const result = await generateCSVcontents(csvOptions);
    const resObj = { rows: result };

    await stringify(
      resObj.rows,
      function (error: NodeJS.ErrnoException, output: string) {
        fs.writeFile(
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

    const filePath = "./cohort.csv";

    fs.access(filePath, fs.constants.F_OK, (err: NodeJS.ErrnoException) => {
      if (err) {
        console.error(`File does not exist at ${filePath}`);
      } else {
        console.log(`File exists at ${filePath}`);
      }
    });

    res.download(
      "./cohort.csv",
      "cohort.csv",
      (error: NodeJS.ErrnoException) => {
        if (error) {
          console.error(error);
          res.status(500).json({
            error: "An error occurred during the download process.",
          });
        }
      }
    );
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .json({ error: "An error occurred during the csv creation process." });
  }

  console.log("file sent");
});

app.listen(3000, () => {
  console.log("Server running");
});
