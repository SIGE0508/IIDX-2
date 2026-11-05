import { NextPlayAddButton, type NextPlayActions } from "./NextPlay";
import { RADAR_DISPLAY_ORDER } from "../../domain/constants";
import { formatEreterValue } from "../../domain/ereter";
import type { ClearLamp } from "../../domain/types";
import { formatTrackerRadarValue, type TrackerEntry } from "./tracker";

export function TrackerChartRow({ entry, lamp, expanded, onSelect, onToggleRadar, nextPlay }: {
  nextPlay?: NextPlayActions; entry: TrackerEntry; lamp: ClearLamp; expanded: boolean;
  onSelect: (chartId: string) => void; onToggleRadar: (chartId: string) => void;
}) {
  const { chart, title, difficulty, ereter, radar } = entry;
  const panelId = "tracker-radar-" + chart.chartId;
  const buttonId = panelId + "-toggle";
  const ereterText = chart.officialLevel === 12
    ? " · ERETER EC " + formatEreterValue(ereter?.ec) + " / HC " + formatEreterValue(ereter?.hc) + " / EXH " + formatEreterValue(ereter?.exh)
    : "";
  return <div className="tracker-row" data-chart-id={chart.chartId}>
    <div className="tracker-row-actions">
      <button type="button" className="chart-line tracker-chart-line"
        aria-label={title + " " + chart.chartType + "を入力"} onClick={() => onSelect(chart.chartId)}>
        <span><strong>{title}</strong> <small>{chart.chartType} / ☆{chart.officialLevel} / {difficulty.toFixed(1)}</small></span>
        <span>{lamp.replaceAll("_", " ")}{ereterText}</span>
      </button>
      <button type="button" className="secondary tracker-radar-toggle" id={buttonId}
        aria-label={title + " " + chart.chartType + "のNOTES RADARを" + (expanded ? "閉じる" : "開く")}
        aria-expanded={expanded} aria-controls={panelId} onClick={() => onToggleRadar(chart.chartId)}>
        NOTES RADAR {expanded ? "閉じる" : "開く"}
      </button>
      {nextPlay && <NextPlayAddButton chartId={chart.chartId} label={title + " " + chart.chartType} actions={nextPlay} />}
    </div>
    <div className="tracker-radar-panel" id={panelId} role="region" aria-labelledby={buttonId} hidden={!expanded}>
      {expanded && <dl className="tracker-radar-values">
        {RADAR_DISPLAY_ORDER.map(attribute => <div key={attribute}>
          <dt>{attribute === "SOF_LAN" ? "SOF-LAN" : attribute}</dt>
          <dd>{formatTrackerRadarValue(radar?.values[attribute])}</dd>
        </div>)}
      </dl>}
    </div>
  </div>;
}
