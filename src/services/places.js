import { awsApiKey } from "../../api-key.js";

export const awsRegion = "us-east-1";

export const awsPlacesBase = `https://places.geo.${awsRegion}.amazonaws.com/v2`;

export async function awsAutocomplete(query){
  const url = `${awsPlacesBase}/autocomplete?key=${encodeURIComponent(awsApiKey)}`;
  const body = {
    QueryText: query,
    MaxResults: 8,
    IntendedUse: "SingleUse",
    Filter: { IncludePlaceTypes: ["Locality"] }
  };
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!res.ok){
    const t = await res.text().catch(()=> "");
    throw new Error(`Places Autocomplete failed (${res.status}): ${t || res.statusText}`);
  }
  return await res.json();
}

export async function awsGetPlace(placeId){
  const url = `${awsPlacesBase}/place/${encodeURIComponent(placeId)}?key=${encodeURIComponent(awsApiKey)}&additional-features=TimeZone`;
  const res = await fetch(url, { method: "GET" });
  if (!res.ok){
    const t = await res.text().catch(()=> "");
    throw new Error(`Places GetPlace failed (${res.status}): ${t || res.statusText}`);
  }
  return await res.json();
}

export function extractPosition(getPlaceJson){
  const pos = getPlaceJson?.Position
    || getPlaceJson?.MainAddress?.AccessPoints?.[0]?.Position
    || getPlaceJson?.AccessPoints?.[0]?.Position
    || getPlaceJson?.MainAddress?.Position;
  if (Array.isArray(pos) && pos.length === 2) return pos;
  return null;
}
