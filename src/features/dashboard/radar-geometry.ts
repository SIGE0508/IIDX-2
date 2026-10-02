import { RADAR_DISPLAY_ORDER } from "../../domain/constants";
import type { RadarAttribute } from "../../domain/types";

export const RADAR_CENTER = 150;
export const RADAR_BASE_RADIUS = 60;
export const radarPoint = (attribute: RadarAttribute, value: number, radius = RADAR_BASE_RADIUS): readonly [number, number] => {
  const index = RADAR_DISPLAY_ORDER.indexOf(attribute);
  const angle = -Math.PI / 2 + index * Math.PI * 2 / RADAR_DISPLAY_ORDER.length;
  const distance = radius * value / 100;
  return [RADAR_CENTER + Math.cos(angle) * distance, RADAR_CENTER + Math.sin(angle) * distance];
};
export const radarPolygon = (values: Readonly<Record<RadarAttribute, number>>, radius = RADAR_BASE_RADIUS): string => RADAR_DISPLAY_ORDER.map(attribute => radarPoint(attribute, values[attribute], radius).join(",")).join(" ");
