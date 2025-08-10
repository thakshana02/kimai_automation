const axios = require("axios");
const fs = require('fs');
const csv = require('csv-parser');
require('dotenv').config();

const BASE_URL = process.env.KIMAI_URL || "https://external-staff-time.outeraspect.com/";
const TOKEN = process.env.KIMAI_TOKEN;
const CSV_FILE = process.env.CSV_FILE || "kimai_research_july15_31_2025.csv";
const DRY_RUN = process.env.DRY_RUN === 'true';

if (!TOKEN) { 
  console.error("Missing KIMAI_TOKEN in .env file"); 
  process.exit(1); 
}

const api = axios.create({
  baseURL: `${BASE_URL}/api`,
  headers: { Authorization: `Bearer ${TOKEN}` },
});

// Description mapping to enhanced PEP work variations
const DESCRIPTION_MAPPING = {
  "X account creation": "PEP work creating X accounts with email verification and profile completion",
  "Insta account Creation": "PEP work creating Instagram accounts including bio setup and initial posts", 
  "Social hub account creation": "PEP creating social hub accounts with linking and cross-platform integration",
  "X account bio add": "PEP work setting up X account bios, headers and verification badges",
  "Insta account bio add": "PEP work configuring Instagram account settings, privacy and content posting",
  "X account captcha resolve": "PEP working X captcha resolution, phone verification and security checks"
};

const first = (arr) => Array.isArray(arr) && arr.length ? arr[0] : null;

async function getProjectByName(name) {
  const { data } = await api.get("/projects", { params: { term: name, size: 100 } });
  const exact = data.find(p => p.name?.toLowerCase() === name.toLowerCase());
  return exact || first(data);
}

async function getActivity(projectId, name) {
  let { data } = await api.get("/activities", { params: { project: projectId, term: name, size: 100 } });
  let hit = data.find(a => a.name?.toLowerCase() === name.toLowerCase());
  if (hit) return hit;
  
  ({ data } = await api.get("/activities", { params: { term: name, size: 100 } }));
  hit = data.find(a => !a.project && a.name?.toLowerCase() === name.toLowerCase());
  if (hit) return hit;
  
  throw new Error(`Activity not found: ${name}`);
}

function parseCSVRow(row) {
  // Convert time format from HH:MM to HH:MM:SS
  const fromTime = row.From.includes(':') ? (row.From.length === 5 ? row.From + ':00' : row.From) : row.From;
  const toTime = row.To.includes(':') ? (row.To.length === 5 ? row.To + ':00' : row.To) : row.To;
  
  // Map description to new PEP work format
  const newDescription = DESCRIPTION_MAPPING[row.Description] || row.Description;
  
  return {
    date: row.Date,
    from: fromTime,
    to: toTime,
    project: row.Project,
    activity: row.Activity,
    description: newDescription,
    originalDescription: row.Description
  };
}

async function createTimesheet(entry, project, activity) {
  const payload = {
    begin: `${entry.date}T${entry.from}`,
    end: `${entry.date}T${entry.to}`,
    project: project.id,
    activity: activity.id,
    description: entry.description,
  };

  if (DRY_RUN) {
    console.log(`[DRY RUN] Would create: ${entry.date} ${entry.from}-${entry.to} | ${entry.description}`);
    return { id: 'DRY_RUN' };
  }

  const { data } = await api.post("/timesheets", payload);
  return data;
}

async function processCSV() {
  console.log(`${DRY_RUN ? '[DRY RUN] ' : ''}Starting bulk import from ${CSV_FILE}...`);
  
  // Get project and activity once - CHANGED: Using "Reserach and Documentation" instead of "Research"
  const project = await getProjectByName("Reserach and Documentation");
  if (!project) throw new Error("Project 'Reserach and Documentation' not found");
  
  const activity = await getActivity(project.id, "General Research");
  
  const entries = [];
  
  return new Promise((resolve, reject) => {
    fs.createReadStream(CSV_FILE)
      .pipe(csv())
      .on('data', (row) => {
        try {
          const entry = parseCSVRow(row);
          entries.push(entry);
        } catch (error) {
          console.error(`Error parsing row: ${JSON.stringify(row)}`, error.message);
        }
      })
      .on('end', async () => {
        console.log(`Found ${entries.length} entries to process`);
        
        let successful = 0;
        let failed = 0;
        
        for (let i = 0; i < entries.length; i++) {
          const entry = entries[i];
          try {
            const result = await createTimesheet(entry, project, activity);
            successful++;
            
            if (!DRY_RUN) {
              console.log(`✅ [${i+1}/${entries.length}] Created #${result.id}: ${entry.date} ${entry.from}-${entry.to} | ${entry.description}`);
            }
            
            // Small delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 100));
            
          } catch (error) {
            failed++;
            console.error(`❌ [${i+1}/${entries.length}] Failed: ${entry.date} ${entry.from}-${entry.to} | ${error.response?.data || error.message}`);
          }
        }
        
        console.log(`\n${DRY_RUN ? '[DRY RUN] ' : ''}Import complete!`);
        console.log(`✅ Successful: ${successful}`);
        console.log(`❌ Failed: ${failed}`);
        console.log(`📊 Total: ${entries.length}`);
        
        resolve();
      })
      .on('error', reject);
  });
}

// Run the import
processCSV().catch(error => {
  console.error("Import failed:", error.message);
  process.exit(1);
});