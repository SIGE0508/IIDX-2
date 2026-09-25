import { MASTER_ASSET_ROOT } from "../domain/constants";
import type { MasterSet } from "./types";
import { validateChartMasterFile, validateEreterMasterFile, validateMasterManifest, validateMasterSet, validateNotesRadarMasterFile, validateUnofficialMasterFile } from "./validation";
export type JsonFetcher = (path: string) => Promise<unknown>;
/** Loads only versioned assets already bundled with the app; no source-site request occurs here. */
export async function loadMasterSet(fetcher: JsonFetcher, root = MASTER_ASSET_ROOT): Promise<MasterSet> {
  const manifest = validateMasterManifest(await fetcher(`${root}/manifest.json`));
  const [chartMaster, unofficial, ereter, notesRadar] = await Promise.all([
    fetcher(`${root}/${manifest.files["chart-master.json"].path}`).then(validateChartMasterFile), fetcher(`${root}/${manifest.files["unofficial.json"].path}`).then(validateUnofficialMasterFile), fetcher(`${root}/${manifest.files["ereter.json"].path}`).then(validateEreterMasterFile), fetcher(`${root}/${manifest.files["notes-radar.json"].path}`).then(validateNotesRadarMasterFile),
  ]);
  return validateMasterSet({ manifest, chartMaster, unofficial, ereter, notesRadar });
}
