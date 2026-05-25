const fs = require('fs');
const content = fs.readFileSync('C:\\Users\\logue\\.gemini\\antigravity\\brain\\64f2f96d-11c0-4cdf-867b-7aa90d6ede5a\\.system_generated\\steps\\44\\content.md', 'utf8');

// Find all matches for puuid
const regex = /"puuid":"([^"]+)"/g;
let match;
const puuids = new Set();
while ((match = regex.exec(content)) !== null) {
  puuids.add(match[1]);
}

console.log("Found PUUIDs:");
console.log(Array.from(puuids));
