const RIOT_API_KEY = "RGAPI-230956b7-a5b4-40b7-b60c-3801e0782a2c";

async function main() {
  try {
    const url = `https://americas.api.riotgames.com/riot/account/v1/accounts/by-riot-id/Nikaro/PAINT`;
    const res = await fetch(url, { headers: { 'X-Riot-Token': RIOT_API_KEY } });
    if (!res.ok) {
      throw new Error(`Riot API returned status ${res.status}: ${await res.text()}`);
    }
    const data = await res.json();
    console.log("Successfully fetched Nikaro#PAINT account data:");
    console.log(JSON.stringify(data, null, 2));
  } catch (error) {
    console.error("Error fetching Nikaro#PAINT account:", error);
  }
}

main();
