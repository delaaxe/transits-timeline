import { aspects } from "./bodies.js";

export const defaultPresetKey = "week";

export const presets = [
  { key:"today", label:"Today",
    transitGroup:"personal", natalGroup:"classical", aspects:["conjunction","sextile","square","trine","opposition"],
    orb:1.5, includeMoon:true, includeChiron:true, includeNode:true, range:{startOffsetDays:0, endOffsetDays:0},
    world:{ transitGroup:"all", includeMoon:true, includeChiron:true, includeNode:true } },
  { key:"week", label:"Week",
    transitGroup:"personal", natalGroup:"classical", aspects:["conjunction","sextile","square","trine","opposition"],
    orb:1.0, includeMoon:false, includeChiron:true, includeNode:true, range:{startOffsetDays:-1, endOffsetDays:6},
    world:{ transitGroup:"all", includeMoon:false, includeChiron:true, includeNode:true } },
  { key:"month", label:"Month",
    transitGroup:"classical", natalGroup:"classical", aspects:["conjunction","sextile","square","trine","opposition"],
    orb:1.0, includeMoon:false, includeChiron:true, includeNode:true, range:{startOffsetDays:-7, endOffsetDays:29},
    world:{ transitGroup:"all", includeMoon:false, includeChiron:true, includeNode:true } },
  { key:"basic_longterm", label:"Year",
    transitGroup:"outer", natalGroup:"all", aspects:["conjunction","sextile","square","trine","opposition"],
    orb:1.0, includeMoon:false, includeChiron:true, includeNode:true, range:{startOffsetDays:-90, endOffsetDays:364},
    world:{ transitGroup:"outer", includeMoon:false, includeChiron:true, includeNode:true } }
];

// Returns any: typing each lookup would drown the checker in casts.
