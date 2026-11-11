/** Product pictures (original rendered artwork, no third-party copyright) + extra-item data for the GEN catalog (/public/gen-art). */
export const ICON_BASE = (process.env.GEN_ICON_BASE_URL ?? "https://cctv-api-five.vercel.app").replace(/\/$/, "") + "/gen-art/";

const RULES: [RegExp, string][] = [
  [/rj\s?-?45|lan connector/, "rj45"],
  [/patch|lan cable|cat\s?-?[56]/, "lan-cable"],
  [/coax|3\+1|rg\s?-?59|\bcable\b/, "coax-cable"],
  [/bnc/, "bnc"],
  [/dc (connector|jack|pin)|power connector/, "dc-connector"],
  [/balun/, "balun"],
  [/junction|camera box|\bbox\b/, "box"],
  [/casing|conduit|pipe|channel pipe/, "casing"],
  [/clip|tie|tape|screw|gitti/, "clips"],
  [/poe|switch/, "poe-switch"],
  [/router|wifi|modem/, "router"],
  [/\bups\b|inverter|battery/, "ups"],
  [/smps|power supply|adapter|adaptor/, "adapter"],
  [/hard disk|hdd|\bssd\b|storage/, "harddisk"],
  [/\bdvr\b|\bnvr\b|recorder/, "recorder"],
  [/dome/, "dome-camera"],
  [/camera|bullet|cctv/, "bullet-camera"],
  [/keyboard/, "keyboard"],
  [/mouse/, "mouse"],
  [/monitor|screen|display|\blcd\b|\bled\b/, "monitor"],
  [/desktop|computer|\bpc\b|laptop|cpu/, "desktop"],
];

export function iconUrlFor(itemName: string): string {
  const n = itemName.toLowerCase();
  for (const [re, slug] of RULES) if (re.test(n)) return `${ICON_BASE}${slug}.png`;
  return `${ICON_BASE}generic.png`;
}

export type ExtraItem = { name: string; unit?: string; qty?: number; price?: number; variants?: [string, number][] };

/** Small accessories at typical Indian market rates (INR); the owner fine-tunes them in the admin. */
export const HD_EXTRAS: ExtraItem[] = [
  { name: "BNC Connector", qty: 8, price: 15 },
  { name: "DC Connector", qty: 4, price: 15 },
  { name: "Camera Junction Box", qty: 4, price: 40 },
  { name: "Video Balun (pair)", qty: 4, price: 60 },
  { name: "Power Adapter 12V", variants: [["12V 2A", 250], ["12V 5A", 450], ["12V 10A", 750]] },
  { name: "Power Cable (2 core)", unit: "meter", qty: 30, price: 12 },
  { name: "PVC Casing", unit: "meter", qty: 30, price: 15 },
  { name: "Cable Clips (pack)", qty: 2, price: 60 },
  { name: "Cable Ties (pack)", qty: 1, price: 40 },
];

export const IP_EXTRAS: ExtraItem[] = [
  { name: "RJ45 Connector", qty: 8, price: 10 },
  { name: "Router", variants: [["SIM based", 2500], ["WiFi", 1200]] },
  { name: "Camera Junction Box", qty: 4, price: 40 },
  { name: "LAN Patch Cord", variants: [["1 meter", 40], ["2 meter", 60], ["3 meter", 80]] },
  { name: "Power Adapter 12V", variants: [["12V 1A", 200], ["12V 2A", 250]] },
  { name: "DC Connector", qty: 4, price: 15 },
  { name: "PVC Casing", unit: "meter", qty: 30, price: 15 },
  { name: "Cable Clips (pack)", qty: 2, price: 60 },
  { name: "Cable Ties (pack)", qty: 1, price: 40 },
];
