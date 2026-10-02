import { RADAR_DISPLAY_ORDER } from "../../domain/constants";
import type { RadarAttribute } from "../../domain/types";
import { RADAR_BASE_RADIUS, RADAR_CENTER, radarPoint, radarPolygon } from "./radar-geometry";

const LABEL_RADIUS = 142;

export function PlayerRadarGraph({ values }: { values: Readonly<Record<RadarAttribute, number>> }) {
  const base = Object.fromEntries(RADAR_DISPLAY_ORDER.map(attribute => [attribute, 100])) as Record<RadarAttribute, number>;
  return <figure className="radar-figure"><svg className="radar-chart" viewBox="0 0 300 300" role="img" aria-label="個人 NOTES RADAR。基準六角形は100です。">
    {RADAR_DISPLAY_ORDER.map(attribute => { const [x, y] = radarPoint(attribute, 100); return <line key={attribute} x1={RADAR_CENTER} y1={RADAR_CENTER} x2={x} y2={y} className="radar-axis" />; })}
    <polygon points={radarPolygon(base)} className="radar-base" />
    <polygon points={radarPolygon(values)} className="radar-value" />
    {RADAR_DISPLAY_ORDER.map(attribute => { const [x, y] = radarPoint(attribute, 100, LABEL_RADIUS); return <text key={attribute} x={x} y={y} className="radar-label" textAnchor="middle" dominantBaseline="middle">{attribute === "SOF_LAN" ? "SOF-LAN" : attribute}</text>; })}
  </svg><figcaption>基準六角形: 100</figcaption></figure>;
}
