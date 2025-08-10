// Env: KIMAI_URL=https://external-staff-time.outeraspect.com/  KIMAI_TOKEN=TOKEN
// Optional: FROM_TIME=09:00:00
const axios = require("axios");
require('dotenv').config();

const BASE_URL = process.env.KIMAI_URL || "https://external-staff-time.outeraspect.com/";
const TOKEN = process.env.KIMAI_TOKEN;
const FROM_TIME = process.env.FROM_TIME || "09:00:00";

const DATE = "2025-07-15";
const DURATION_SECONDS = 3600;
const PROJECT_NAME = "Research";
const ACTIVITY_NAME = "Social Media";
const DESCRIPTION = "creating social media accounts";

if (!TOKEN) { console.error("Missing KIMAI_TOKEN"); process.exit(1); }

const api = axios.create({
  baseURL: `${BASE_URL}/api`,
  headers: { Authorization: `Bearer ${TOKEN}` },
});

const first = (arr) => Array.isArray(arr) && arr.length ? arr[0] : null;

async function getProjectByName(name) {
  const { data } = await api.get("/projects", { params: { term: name, size: 100 } });
  const exact = data.find(p => p.name?.toLowerCase() === name.toLowerCase());
  return exact || first(data);
}

async function getActivity(projectId, name) {
  // Prefer project-scoped activity
  let { data } = await api.get("/activities", { params: { project: projectId, term: name, size: 100 } });
  let hit = data.find(a => a.name?.toLowerCase() === name.toLowerCase());
  if (hit) return hit;
  // Fallback to global activity
  ({ data } = await api.get("/activities", { params: { term: name, size: 100 } }));
  hit = data.find(a => !a.project && a.name?.toLowerCase() === name.toLowerCase());
  if (hit) return hit;
  throw new Error(`Activity not found: ${name}`);
}

(async () => {
  const project = await getProjectByName(PROJECT_NAME);
  if (!project) throw new Error(`Project not found: ${PROJECT_NAME}`);

  const activity = await getActivity(project.id, ACTIVITY_NAME);

  // Calculate end time (1 hour after start)
  const startTime = new Date(`${DATE}T${FROM_TIME}`);
  const endTime = new Date(startTime.getTime() + DURATION_SECONDS * 1000);
  const endTimeStr = endTime.toTimeString().slice(0, 8); // HH:mm:ss format

  const payload = {
    begin: `${DATE}T${FROM_TIME}`,   // HTML5 local datetime (no timezone)
    end: `${DATE}T${endTimeStr}`,
    project: project.id,
    activity: activity.id,
    description: DESCRIPTION,
  };

  const { data } = await api.post("/timesheets", payload);
  console.log(`Created #${data.id} on ${DATE} ${FROM_TIME} for 1h — Project: ${project.name}, Activity: ${activity.name}`);
})().catch(e => {
  console.error("Error:", e.response?.data || e.message);
  process.exit(1);
});