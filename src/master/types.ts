import type { ChartMaster, EreterChartDataRecord, NotesRadarRecord, SongMaster, UnofficialDifficultyRecord } from "../domain/types";
export interface VersionedMasterFile { schemaVersion: 1; masterVersion: string; updatedAt: string; }
export interface ChartMasterFile extends VersionedMasterFile { songs: SongMaster[]; charts: ChartMaster[]; }
export interface UnofficialMasterFile extends VersionedMasterFile { records: UnofficialDifficultyRecord[]; }
export interface EreterMasterFile extends VersionedMasterFile { records: EreterChartDataRecord[]; }
export interface NotesRadarMasterFile extends VersionedMasterFile { records: NotesRadarRecord[]; }
export type MasterFileName = "chart-master.json" | "unofficial.json" | "ereter.json" | "notes-radar.json";
export interface MasterManifestEntry { path: string; masterVersion: string; recordCount?: number; }
export interface MasterManifest extends VersionedMasterFile { generatedAt?: string; files: Record<MasterFileName, MasterManifestEntry>; }
export interface MasterSet { manifest: MasterManifest; chartMaster: ChartMasterFile; unofficial: UnofficialMasterFile; ereter: EreterMasterFile; notesRadar: NotesRadarMasterFile; }
